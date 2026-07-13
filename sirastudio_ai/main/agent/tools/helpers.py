import json
from typing import Any

from ...cv_schema import CVData, CVDataParseError, CVItem, CVSection, SectionFieldValue, parse_cv


def parse_injected_cv(cv: dict[str, Any]) -> tuple[CVData | None, str | None]:
    try:
        return parse_cv(cv), None
    except CVDataParseError as exc:
        return None, str(exc)


def cv_error_json(error: str | None) -> str:
    return json.dumps(
        {"ok": False, "error": error or "Current CV state is not valid."},
        ensure_ascii=False,
    )


def _section_schema(section: CVSection) -> list[dict[str, object]]:
    return [field.model_dump(by_alias=True) for field in section.content.section_schema]


def _indexed_item(item_idx: int, item: CVItem) -> dict[str, object]:
    return {
        "item_idx": item_idx,
        "id": item.id,
        "fields": item.model_dump(by_alias=True)["fields"],
        "links": [link.model_dump(by_alias=True, exclude_none=True) for link in item.links],
        "keepTogetherGroup": item.keepTogetherGroup,
    }


def _indexed_section(section_idx: int, section: CVSection) -> dict[str, object]:
    return {
        "section_idx": section_idx,
        "id": section.id,
        "type": section.type,
        "title": section.title,
        "layout": section.layout.model_dump(by_alias=True),
        "keepTogetherGroup": section.keepTogetherGroup,
        "content": {
            "schema": _section_schema(section),
            "items": [
                _indexed_item(item_idx, item)
                for item_idx, item in enumerate(section.content.items)
            ],
        },
    }


def summarize_cv_for_agent(cv: CVData) -> dict[str, object]:
    """Return an indexed, editable-content snapshot for the LLM tool result."""
    return {
        "header": cv.header.model_dump(by_alias=True),
        "template": cv.template.model_dump(by_alias=True),
        "dateFormat": cv.dateFormat,
        "sections": [
            _indexed_section(section_idx, section)
            for section_idx, section in enumerate(cv.sections)
        ],
    }
