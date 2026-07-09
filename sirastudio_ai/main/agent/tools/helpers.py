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


def _resolve_section_index(cv: CVData, section_ref: int | str | None):
    sections = cv.sections
    if isinstance(section_ref, int):
        return section_ref if 0 <= section_ref < len(sections) else None
    if isinstance(section_ref, str):
        if section_ref.isdecimal():
            idx = int(section_ref)
            if 0 <= idx < len(sections):
                return idx
        for idx, section in enumerate(sections):
            if section.id == section_ref:
                return idx
    return None


def _normalize_text(value) -> str:
    return str(value or "").strip().lower()


def _section_schema(section: CVSection) -> list[dict[str, object]]:
    return [field.model_dump(by_alias=True) for field in section.content.section_schema]


def find_sections(cv: CVData, query: str | None = None, type: str | None = None) -> list[dict[str, object]]:
    query_text = _normalize_text(query)
    type_text = _normalize_text(type)
    matches = []
    for idx, section in enumerate(cv.sections):
        title = _normalize_text(section.title)
        section_type = _normalize_text(section.type)
        if type_text and section_type != type_text:
            continue
        if query_text and query_text not in title and query_text not in section_type and query_text != _normalize_text(section.id):
            continue
        matches.append({
            "section_idx": idx,
            "id": section.id,
            "type": section.type,
            "title": section.title,
            "item_count": len(section.content.items),
        })
    return matches


def find_items(cv: CVData, section_ref: int | str | None, query: str | None = None) -> list[dict[str, object]]:
    section_idx = _resolve_section_index(cv, section_ref)
    if section_idx is None:
        return []
    section = cv.sections[section_idx]
    query_text = _normalize_text(query)
    matches = []
    for item_idx, item in enumerate(section.content.items):
        fields = dict(item.fields)
        haystack = " ".join(
            _normalize_text(item.id if key == "id" else fields.get(key))
            for key in ("id", "title", "subtitle", "role", "location", "date", "body")
        )
        if query_text and query_text not in haystack:
            continue
        matches.append({
            "section_idx": section_idx,
            "section_id": section.id,
            "section_type": section.type,
            "section_title": section.title,
            "item_idx": item_idx,
            "id": item.id,
            "fields": fields,
        })
    return matches


def _indexed_item(item_idx: int, item: CVItem) -> dict[str, int | str | dict[str, SectionFieldValue]]:
    return {
        "item_idx": item_idx,
        "id": item.id,
        "fields": dict(item.fields),
    }


def _indexed_section(section_idx: int, section: CVSection) -> dict[str, object]:
    return {
        "section_idx": section_idx,
        "id": section.id,
        "type": section.type,
        "title": section.title,
        "schema": _section_schema(section),
        "items": [
            _indexed_item(item_idx, item)
            for item_idx, item in enumerate(section.content.items)
        ],
    }


def summarize_cv_for_agent(
    cv: CVData,
    revision: int | None = None,
) -> dict[str, object]:
    """Return an indexed, editable-content snapshot for the LLM tool result.

    `revision` lives in agent metadata, not CVData. Keep the key for prompt shape.
    """
    return {
        "revision": revision,
        "header": cv.header.model_dump(by_alias=True),
        "sections": [
            _indexed_section(section_idx, section)
            for section_idx, section in enumerate(cv.sections)
        ],
    }
