import json
from typing import Annotated, Any

from langchain.tools import tool
from langgraph.prebuilt import InjectedState

from .helpers import cv_error_json, parse_injected_cv, summarize_cv_for_agent


def _revision_from_metadata(metadata: dict[str, Any] | None) -> int | None:
    if not isinstance(metadata, dict):
        return None
    revision = metadata.get("revision")
    return revision if isinstance(revision, int) else None


@tool
def read_cv(
    cv: Annotated[dict[str, Any], InjectedState("cv")],
    metadata: Annotated[dict[str, Any] | None, InjectedState("metadata")] = None,
) -> str:
    """Read the current CV. Call this by itself before editing and after edits to verify.

    Returns an indexed snapshot with section_idx, item_idx, exact ids, and editable fields.
    """
    cv_model, error = parse_injected_cv(cv)
    if cv_model is None:
        return cv_error_json(error)
    return json.dumps(
        summarize_cv_for_agent(cv_model, revision=_revision_from_metadata(metadata)),
        ensure_ascii=False,
    )
