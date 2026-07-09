from typing import Annotated, Any, Literal, TypeAlias

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, PlainSerializer, ValidationError


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
    "spacer",
]
DateFormat: TypeAlias = Literal["MM/YYYY", "Mon YYYY", "YYYY"]
DateSlot: TypeAlias = Literal["right-inline", "below-title", "left-margin", "hidden"]
IconStyle: TypeAlias = Literal["none", "bullet", "dash", "chevron"]
Separator: TypeAlias = Literal["none", "rule", "dot", "space"]
Density: TypeAlias = Literal["compact", "normal", "relaxed"]
CustomFieldKind: TypeAlias = Literal["text", "multiline", "date", "bullets", "tags"]
TemplateId: TypeAlias = Literal["single-column", "sidebar-left", "sidebar-right"]
SectionFieldValue: TypeAlias = str | list[str]
SidebarSide: TypeAlias = Literal["left", "right"]


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


class StructuredDate(_CVBaseModel):
    month: int | None = Field(..., ge=1, le=12)
    year: int


class SkillGroup(_CVBaseModel):
    id: str
    label: str
    value: str


class CVItem(_CVBaseModel):
    id: str
    fields: dict[str, SectionFieldValue]


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


class CustomSectionSchema(_CVBaseModel):
    fields: list[SectionFieldDef]


class SectionContent(_CVBaseModel):
    section_schema: list[SectionFieldDef] = Field(alias="schema")
    items: list[CVItem]


class CVSection(_CVBaseModel):
    id: str
    type: SectionType
    title: str
    layout: SectionLayout
    content: SectionContent


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


class CVDataParseError(ValueError):
    pass


def parse_cv(value: object) -> CVData:
    try:
        return CVData.model_validate(value)
    except ValidationError as exc:
        raise CVDataParseError(_validation_error_message(exc)) from None


def parse_cv_field(value: object) -> CVData:
    """API-boundary parse: map CVDataParseError to ValueError for Ninja 422."""
    try:
        return parse_cv(value)
    except CVDataParseError as exc:
        raise ValueError(str(exc)) from None


def dump_cv(value: CVData) -> dict[str, Any]:
    return value.model_dump(by_alias=True)


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
    "CVData",
    "CVDataInput",
    "CVDataOutput",
    "CVDataParseError",
    "CVHeader",
    "CVItem",
    "CVSection",
    "CustomFieldDef",
    "CustomFieldKind",
    "CustomSectionSchema",
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
    "SkillGroup",
    "SocialLink",
    "StructuredDate",
    "TemplateConfig",
    "TemplateId",
    "dump_cv",
    "parse_cv",
    "parse_cv_field",
]
