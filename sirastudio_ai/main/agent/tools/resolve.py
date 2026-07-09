import json
from typing import Annotated

from langchain.tools import tool
from langgraph.prebuilt import InjectedState

from .helpers import find_items, find_sections


@tool
def resolve_sections(
    cv: Annotated[dict, InjectedState("cv")],
    query: str = None,
    type: str = None,
) -> str:
    """Find CV sections by title/id/type before editing ambiguous targets."""
    return json.dumps(find_sections(cv, query=query, type=type), ensure_ascii=False)


@tool
def resolve_items(
    cv: Annotated[dict, InjectedState("cv")],
    section_ref: int | str,
    query: str = None,
) -> str:
    """Find items in a section by id/title/subtitle/role/date/body before editing ambiguous targets."""
    return json.dumps(find_items(cv, section_ref=section_ref, query=query), ensure_ascii=False)
