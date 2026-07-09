import json
from typing import Annotated, Any

from langchain.tools import tool
from langgraph.prebuilt import InjectedState

from .helpers import cv_error_json, find_items, find_sections, parse_injected_cv


@tool
def resolve_sections(
    cv: Annotated[dict[str, Any], InjectedState("cv")],
    query: str = None,
    type: str = None,
) -> str:
    """Find CV sections by title/id/type before editing ambiguous targets."""
    cv_model, error = parse_injected_cv(cv)
    if cv_model is None:
        return cv_error_json(error)
    return json.dumps(find_sections(cv_model, query=query, type=type), ensure_ascii=False)


@tool
def resolve_items(
    cv: Annotated[dict[str, Any], InjectedState("cv")],
    section_ref: int | str,
    query: str = None,
) -> str:
    """Find items in a section by id/title/subtitle/role/date/body before editing ambiguous targets."""
    cv_model, error = parse_injected_cv(cv)
    if cv_model is None:
        return cv_error_json(error)
    return json.dumps(find_items(cv_model, section_ref=section_ref, query=query), ensure_ascii=False)
