import json
from typing import Annotated, Any

from langchain.tools import tool
from langgraph.prebuilt import InjectedState

from .helpers import cv_error_json, parse_injected_cv, summarize_cv_for_agent

@tool
def read_cv(
    cv: Annotated[dict[str, Any], InjectedState("cv")],
) -> str:
    """Read the current CV. Call this by itself before editing.

    Returns the full indexed CV snapshot with exact ids, layouts, and editable fields.
    """
    cv_model, error = parse_injected_cv(cv)
    if cv_model is None:
        return cv_error_json(error)
    return json.dumps(summarize_cv_for_agent(cv_model), ensure_ascii=False)
