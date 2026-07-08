import json
from typing import Annotated

from langchain.tools import tool
from langgraph.prebuilt import InjectedState

from .helpers import summarize_cv_for_agent


@tool
def read_cv(cv: Annotated[dict, InjectedState("cv")]) -> str:
    """Read the current CV. Call this by itself before editing and after edits to verify.

    Returns an indexed snapshot with section_idx, item_idx, exact ids, and editable fields.
    """
    return json.dumps(summarize_cv_for_agent(cv), ensure_ascii=False)
