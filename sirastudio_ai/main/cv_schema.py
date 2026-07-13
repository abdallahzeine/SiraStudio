from copy import deepcopy
from typing import Annotated, Any, Literal, TypeAlias
from uuid import uuid4

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, PlainSerializer, ValidationError, model_validator


class _CVBaseModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


IconType: TypeAlias = Literal[
    "github",
    "linkedin",
    "twitter",
    "globe",
    "mail",
    "phone",
    "portfolio",
    "youtube",
    "instagram",
    "facebook",
    "custom",
]
SectionType: TypeAlias = Literal[
    "summary",
    "work-experience",
    "education",
    "skills",
    "certifications",
    "projects",
    "awards",
    "volunteering",
    "custom",
]
DateFormat: TypeAlias = Literal["MM/YYYY", "Mon YYYY", "YYYY"]
DateSlot: TypeAlias = Literal["right-inline", "below-title", "left-margin", "hidden"]
IconStyle: TypeAlias = Literal["none", "bullet", "dash", "chevron"]
Separator: TypeAlias = Literal["none", "rule", "dot", "space"]
Density: TypeAlias = Literal["compact", "normal", "relaxed"]
CustomFieldKind: TypeAlias = Literal["text", "multiline", "date", "bullets", "tags"]
TemplateId: TypeAlias = Literal["single-column", "sidebar-left", "sidebar-right"]
SidebarSide: TypeAlias = Literal["left", "right"]

BUILT_IN_SECTION_FIELDS: dict[str, dict[str, CustomFieldKind]] = {
    "summary": {"body": "multiline"},
    "work-experience": {
        "title": "text",
        "subtitle": "text",
        "location": "text",
        "date": "date",
        "bullets": "bullets",
    },
    "education": {"title": "text", "subtitle": "text", "date": "date"},
    "skills": {"label": "text", "value": "text"},
    "certifications": {"title": "text", "subtitle": "text", "date": "date"},
    "projects": {
        "title": "text",
        "subtitle": "text",
        "date": "date",
        "bullets": "bullets",
    },
    "awards": {"title": "text", "subtitle": "text", "date": "date"},
    "volunteering": {"title": "text", "role": "text", "date": "date"},
}


class SocialLink(_CVBaseModel):
    id: str
    url: str
    label: str
    iconType: IconType
    customIconUrl: str | None = None
    color: str | None = None
    displayOrder: int


class CVHeader(_CVBaseModel):
    name: str
    headline: str | None = None
    location: str
    phone: str
    email: str
    socialLinks: list[SocialLink]


class BulletEntry(_CVBaseModel):
    id: str
    text: str


SectionFieldValue: TypeAlias = str | list[str] | list[BulletEntry]


class CVItem(_CVBaseModel):
    id: str
    fields: dict[str, SectionFieldValue]
    links: list[SocialLink] = Field(default_factory=list)
    keepTogetherGroup: str | None = None


class SectionLayout(_CVBaseModel):
    presetId: str | None = None
    dateSlot: DateSlot
    iconStyle: IconStyle
    separator: Separator
    density: Density
    columns: Literal[1, 2]


class SectionFieldDef(_CVBaseModel):
    key: str
    label: str
    kind: CustomFieldKind
    placeholder: str | None = None
    required: bool | None = None


CustomFieldDef = SectionFieldDef


class SectionContent(_CVBaseModel):
    section_schema: list[SectionFieldDef] = Field(alias="schema")
    items: list[CVItem]


class CVSection(_CVBaseModel):
    id: str
    type: SectionType
    title: str
    layout: SectionLayout
    content: SectionContent
    keepTogetherGroup: str | None = None

    @model_validator(mode="after")
    def validate_content_contract(self):
        if self.type == "summary" and len(self.content.items) != 1:
            raise ValueError("summary section must contain exactly one item")

        fields_by_key: dict[str, SectionFieldDef] = {}
        for field in self.content.section_schema:
            if field.key in fields_by_key:
                raise ValueError(f"section schema contains duplicate key '{field.key}'")
            fields_by_key[field.key] = field

        canonical = BUILT_IN_SECTION_FIELDS.get(self.type)
        if canonical is not None:
            actual = {key: field.kind for key, field in fields_by_key.items()}
            if actual != canonical:
                raise ValueError(
                    f"{self.type} section schema keys and kinds must match the canonical definition"
                )

        declared_keys = set(fields_by_key)
        for item in self.content.items:
            if set(item.fields) != declared_keys:
                raise ValueError("item field keys must exactly match the section schema keys")

            for key, value in item.fields.items():
                kind = fields_by_key[key].kind
                if kind == "bullets" and not (
                    isinstance(value, list) and all(isinstance(entry, BulletEntry) for entry in value)
                ):
                    raise ValueError(f"item field '{key}' must be a list of bullet entries")
                if kind == "tags" and not (
                    isinstance(value, list) and all(isinstance(entry, str) for entry in value)
                ):
                    raise ValueError(f"item field '{key}' must be a list of strings for kind 'tags'")
                if kind not in {"bullets", "tags"} and not isinstance(value, str):
                    raise ValueError(f"item field '{key}' must be a string for kind '{kind}'")
        return self


class TemplateConfig(_CVBaseModel):
    id: TemplateId
    columns: Literal[1, 2]
    sidebarSide: SidebarSide | None = None
    sidebarSectionIds: list[str] | None = None


class CVData(_CVBaseModel):
    header: CVHeader
    sections: list[CVSection]
    template: TemplateConfig
    dateFormat: DateFormat | None = None

    @model_validator(mode="after")
    def validate_entity_ids(self):
        # One global namespace across sections, items, and all social links.
        seen: dict[str, str] = {}

        def claim(entity_id: str, kind: str) -> None:
            if not isinstance(entity_id, str) or not entity_id.strip():
                raise ValueError(f"{kind} id is empty")
            prior = seen.get(entity_id)
            if prior is not None:
                raise ValueError(f"duplicate ID '{entity_id}': {kind} collides with {prior}")
            seen[entity_id] = kind

        for link in self.header.socialLinks:
            claim(link.id, "header social link")
        for section in self.sections:
            claim(section.id, "section")
            for item in section.content.items:
                claim(item.id, "item")
                for link in item.links:
                    claim(link.id, "item social link")
                fields_by_key = {field.key: field for field in section.content.section_schema}
                for key, value in item.fields.items():
                    if fields_by_key[key].kind == "bullets":
                        for bullet in value:
                            claim(bullet.id, "bullet")
        return self


class CVDataParseError(ValueError):
    pass


def _migrate_legacy_bullets(value: object) -> object:
    if not isinstance(value, dict):
        return value
    migrated = deepcopy(value)
    sections = migrated.get("sections")
    if not isinstance(sections, list):
        return migrated
    for section in sections:
        if not isinstance(section, dict):
            continue
        content = section.get("content")
        if not isinstance(content, dict):
            continue
        schema = content.get("schema")
        items = content.get("items")
        if not isinstance(schema, list) or not isinstance(items, list):
            continue
        bullet_keys = {
            field.get("key") for field in schema
            if isinstance(field, dict) and field.get("kind") == "bullets" and isinstance(field.get("key"), str)
        }
        for item in items:
            fields = item.get("fields") if isinstance(item, dict) else None
            if not isinstance(fields, dict):
                continue
            for key in bullet_keys:
                bullets = fields.get(key)
                if isinstance(bullets, list):
                    fields[key] = [
                        {"id": str(uuid4()), "text": bullet} if isinstance(bullet, str) else bullet
                        for bullet in bullets
                    ]
    return migrated


def parse_cv(value: object) -> CVData:
    try:
        return CVData.model_validate(_migrate_legacy_bullets(value))
    except ValidationError as exc:
        raise CVDataParseError(_validation_error_message(exc)) from None


def parse_cv_field(value: object) -> CVData:
    """API-boundary parse: map CVDataParseError to ValueError for Ninja 422."""
    try:
        return parse_cv(value)
    except CVDataParseError as exc:
        raise ValueError(str(exc)) from None


def dump_cv(value: CVData) -> dict[str, Any]:
    return value.model_dump(by_alias=True, exclude_none=True)


def _parse_optional_cv_field(value: object) -> CVData | None:
    if value is None:
        return None
    return parse_cv_field(value)


def _dump_optional_cv(value: CVData | None) -> dict[str, Any] | None:
    if value is None:
        return None
    return dump_cv(value)


# Request input: parse only. Response: parse + dump by_alias for stable JSON keys.
CVDataInput = Annotated[CVData, BeforeValidator(parse_cv_field)]
CVDataOutput = Annotated[
    CVData,
    BeforeValidator(parse_cv_field),
    PlainSerializer(dump_cv, return_type=dict[str, Any]),
]
OptionalCVDataOutput = Annotated[
    CVData | None,
    BeforeValidator(_parse_optional_cv_field),
    PlainSerializer(_dump_optional_cv, return_type=dict[str, Any] | None),
]


def _validation_error_message(exc: ValidationError) -> str:
    messages = []
    for error in exc.errors()[:5]:
        location = _format_location(error.get("loc", ()))
        messages.append(f"{location} {_format_error(error)}")

    suffix = ""
    remaining = len(exc.errors()) - len(messages)
    if remaining > 0:
        suffix = f"; plus {remaining} more issue{'s' if remaining != 1 else ''}"

    return "Invalid CV data: " + "; ".join(messages) + suffix


def _format_location(location: tuple[object, ...]) -> str:
    if not location:
        return "cv"

    parts = ["cv"]
    for part in location:
        if isinstance(part, int):
            parts[-1] = f"{parts[-1]}[{part}]"
            continue
        if part in {"str", "list[str]"}:
            continue
        parts.append(str(part))
    return ".".join(parts)


def _format_error(error: dict[str, Any]) -> str:
    error_type = str(error.get("type", ""))
    context = error.get("ctx", {})

    if error_type == "missing":
        return "is required"
    if error_type == "extra_forbidden":
        return "is not supported"
    if error_type == "literal_error":
        return f"must be one of: {_format_literal_options(context.get('expected'))}"
    if error_type in {"model_type", "dict_type"}:
        return "must be an object"
    if error_type == "list_type":
        return "must be a list"
    if error_type == "string_type":
        return "must be a string"
    if error_type == "int_type":
        return "must be an integer"
    if error_type == "bool_type":
        return "must be true or false"
    if error_type == "value_error":
        return _format_value_error(error)
    if error_type == "greater_than_equal":
        return f"must be greater than or equal to {context.get('ge')}"
    if error_type == "less_than_equal":
        return f"must be less than or equal to {context.get('le')}"

    return "is invalid"


def _format_value_error(error: dict[str, Any]) -> str:
    context = error.get("ctx", {})
    if isinstance(context, dict):
        cause = context.get("error")
        if cause is not None:
            return str(cause)

    message = str(error.get("msg", ""))
    prefix = "Value error, "
    if message.startswith(prefix):
        return message[len(prefix) :]
    return "is invalid"


def _format_literal_options(expected: object) -> str:
    if not isinstance(expected, str):
        return "a supported value"
    return expected.replace("'", "")


SCAFFOLD_CV_FIXTURE = {
    "header": {
        "name": "Ada Lovelace",
        "headline": "Software Engineer",
        "location": "London, UK",
        "phone": "+44 20 0000 0000",
        "email": "ada@example.com",
        "socialLinks": [
            {
                "id": "social-linkedin",
                "url": "https://www.linkedin.com/in/ada",
                "label": "LinkedIn",
                "iconType": "linkedin",
                "displayOrder": 1,
            }
        ],
    },
    "sections": [
        {
            "id": "summary",
            "type": "summary",
            "title": "Summary",
            "layout": {
                "dateSlot": "hidden",
                "iconStyle": "none",
                "separator": "none",
                "density": "normal",
                "columns": 1,
            },
            "content": {
                "schema": [
                    {
                        "key": "body",
                        "label": "Summary",
                        "kind": "multiline",
                        "required": True,
                    }
                ],
                "items": [
                    {
                        "id": "summary-item",
                        "fields": {"body": "Built analytical engines and developer tools."},
                    }
                ],
            },
        }
    ],
    "template": {"id": "single-column", "columns": 1},
    "dateFormat": "Mon YYYY",
}

SCAFFOLD_CV = parse_cv(SCAFFOLD_CV_FIXTURE)


__all__ = [
    "BulletEntry",
    "CVData",
    "CVDataInput",
    "CVDataOutput",
    "CVDataParseError",
    "CVHeader",
    "CVItem",
    "CVSection",
    "CustomFieldDef",
    "CustomFieldKind",
    "DateFormat",
    "DateSlot",
    "Density",
    "IconStyle",
    "IconType",
    "OptionalCVDataOutput",
    "SCAFFOLD_CV",
    "SCAFFOLD_CV_FIXTURE",
    "SectionContent",
    "SectionFieldDef",
    "SectionFieldValue",
    "SectionLayout",
    "SectionType",
    "Separator",
    "SocialLink",
    "TemplateConfig",
    "TemplateId",
    "dump_cv",
    "parse_cv",
    "parse_cv_field",
]
