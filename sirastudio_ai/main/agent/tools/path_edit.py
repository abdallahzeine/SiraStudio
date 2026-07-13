import json
import logging
import re
from copy import deepcopy
from typing import Any, Literal

from langchain.messages import ToolMessage
from langchain.tools import ToolRuntime, tool
from langgraph.types import Command
from pydantic import BaseModel, ConfigDict, model_validator

from ...cv_schema import dump_cv
from .helpers import parse_injected_cv


_PROP_RE = re.compile(r"[A-Za-z0-9_$-]+")
logger = logging.getLogger("agent_logger")


class CVEditOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    op: Literal["set", "merge", "append", "delete"]
    path: str
    value: Any = None

    @model_validator(mode="after")
    def require_operation_value(self):
        has_value = "value" in self.model_fields_set
        if self.op == "delete" and has_value:
            raise ValueError("Delete operations must not include a value.")
        if self.op != "delete" and not has_value:
            raise ValueError(f"{self.op} operations require a value.")

        path_ok, tokens, _ = _parse_path(self.path)
        if path_ok and _targets_unsupported_agent_path(tokens, self.op, self.value):
            raise ValueError(
                "This path is not visually supported for agent edits. Edit CV content or supported layout values instead."
            )
        return self


def _targets_unsupported_agent_path(
    tokens: list[str | int],
    op: Literal["set", "merge", "append", "delete"],
    value: Any,
) -> bool:
    if tokens and tokens[0] in {"template", "dateFormat"}:
        return True

    is_section_layout = (
        len(tokens) >= 3
        and tokens[0] == "sections"
        and isinstance(tokens[1], int)
        and tokens[2] == "layout"
    )
    if not is_section_layout:
        return False
    if len(tokens) >= 4 and tokens[3] in {"separator", "presetId"}:
        return True
    return len(tokens) == 3 and op == "merge" and isinstance(value, dict) and bool(
        {"separator", "presetId"} & value.keys()
    )


def _section_id(section: object) -> str | None:
    if not isinstance(section, dict):
        return None
    section_id = section.get("id")
    return section_id if isinstance(section_id, str) else None


def _layout_visual_state(section: object) -> tuple[object, object]:
    if not isinstance(section, dict):
        return None, None
    layout = section.get("layout")
    if not isinstance(layout, dict):
        return None, None
    return layout.get("separator"), layout.get("presetId")


def _unsupported_visual_mutation_error(
    current: dict[str, Any],
    candidate: dict[str, Any],
) -> str | None:
    if current.get("template") != candidate.get("template"):
        return "Template changes are not visually supported for agent edits."
    if current.get("dateFormat") != candidate.get("dateFormat"):
        return "dateFormat changes are not visually supported for agent edits."

    current_sections = current.get("sections")
    candidate_sections = candidate.get("sections")
    if not isinstance(current_sections, list) or not isinstance(candidate_sections, list):
        return None

    current_by_id = {
        section_id: section
        for section in current_sections
        if (section_id := _section_id(section)) is not None
    }

    for section in candidate_sections:
        section_id = _section_id(section)
        separator, preset_id = _layout_visual_state(section)
        if section_id is not None and section_id in current_by_id:
            current_separator, current_preset_id = _layout_visual_state(current_by_id[section_id])
            if separator != current_separator or preset_id != current_preset_id:
                return (
                    "Section separator and presetId changes are not visually supported "
                    "for agent edits."
                )
            continue

        if separator not in (None, "none"):
            return "New sections may only use separator 'none' for agent edits."
        if preset_id is not None:
            return "New sections may not set layout.presetId for agent edits."

    return None


def _error(
    runtime: ToolRuntime[Any, dict[str, Any]],
    message: str,
    path: str | None = None,
    operation_index: int | None = None,
) -> Command:
    payload = {"ok": False, "error": message}
    if path is not None:
        payload["path"] = path
    if operation_index is not None:
        payload["operation_index"] = operation_index
    return Command(
        update={
            "messages": [
                ToolMessage(
                    content=json.dumps(payload, ensure_ascii=False),
                    tool_call_id=runtime.tool_call_id,
                )
            ]
        }
    )


def _parse_path(path: str) -> tuple[bool, list[str | int], str | None]:
    if path == "":
        return True, [], None

    tokens: list[str | int] = []
    i = 0
    while i < len(path):
        ch = path[i]
        if ch == ".":
            if i == 0 or i == len(path) - 1 or path[i + 1] == ".":
                return False, [], "Path has an unexpected dot."
            i += 1
            continue

        if ch == "[":
            close = path.find("]", i + 1)
            if close == -1:
                return False, [], "Path is missing a closing bracket."
            raw_index = path[i + 1 : close].strip()
            if raw_index == "-1":
                return False, [], "Use op='append' with the array path instead of [-1]."
            if not raw_index.isdecimal():
                return False, [], f"Invalid array index '{raw_index}'."
            tokens.append(int(raw_index))
            i = close + 1
            continue

        end = i
        while end < len(path) and path[end] not in ".[":
            end += 1
        prop = path[i:end]
        if not _PROP_RE.fullmatch(prop):
            return False, [], f"Invalid property name '{prop}'."
        tokens.append(prop)
        i = end

    return True, tokens, None


def _get_value(root: dict[str, Any], tokens: list[str | int], path: str) -> tuple[bool, Any, str | None]:
    current = root
    for token in tokens:
        if isinstance(token, str):
            if not isinstance(current, dict) or token not in current:
                return False, None, f"Property '{token}' was not found at path '{path}'."
            current = current[token]
            continue

        if not isinstance(current, list):
            return False, None, f"Expected a list before index [{token}] at path '{path}'."
        if token < 0 or token >= len(current):
            return False, None, f"Index [{token}] is out of bounds at path '{path}'."
        current = current[token]
    return True, current, None


def _get_parent(root: dict[str, Any], tokens: list[str | int], path: str) -> tuple[bool, Any, str | int | None, str | None]:
    if not tokens:
        return True, None, None, None
    ok, parent, err = _get_value(root, tokens[:-1], path)
    if not ok:
        return False, None, None, err
    return True, parent, tokens[-1], None


def _stage_edit(
    candidate: dict[str, Any],
    op: Literal["set", "merge", "append", "delete"],
    path: str,
    value: Any = None,
) -> tuple[bool, dict[str, Any] | None, str | None]:
    path_ok, tokens, path_error = _parse_path(path)
    if not path_ok:
        return False, None, path_error

    if op == "append":
        ok, target, err = _get_value(candidate, tokens, path)
        if not ok:
            return False, None, err
        if not isinstance(target, list):
            return False, None, f"Append target must be a list at path '{path}'."
        target.append(value)
        return True, candidate, None

    if op == "merge":
        ok, target, err = _get_value(candidate, tokens, path)
        if not ok:
            return False, None, err
        if not isinstance(target, dict):
            return False, None, f"Merge target must be an object at path '{path}'."
        if not isinstance(value, dict):
            return False, None, "Merge value must be an object."
        target.update(value)
        return True, candidate, None

    if op == "set":
        if not tokens:
            if not isinstance(value, dict):
                return False, None, "Root set value must be a CV object."
            return True, value, None

        ok, parent, final_token, err = _get_parent(candidate, tokens, path)
        if not ok:
            return False, None, err
        if isinstance(final_token, str):
            if not isinstance(parent, dict):
                return False, None, f"Set parent must be an object at path '{path}'."
            parent[final_token] = value
            return True, candidate, None
        if not isinstance(parent, list):
            return False, None, f"Set parent must be a list at path '{path}'."
        if final_token < 0 or final_token >= len(parent):
            return False, None, f"Index [{final_token}] is out of bounds at path '{path}'."
        current = parent[final_token]
        if isinstance(current, dict) and isinstance(value, dict):
            for key in ("links", "keepTogetherGroup"):
                if key in current and key not in value:
                    value[key] = deepcopy(current[key])
        parent[final_token] = value
        return True, candidate, None

    if not tokens:
        return False, None, "Delete does not support the root CV path."
    ok, parent, final_token, err = _get_parent(candidate, tokens, path)
    if not ok:
        return False, None, err
    if isinstance(final_token, str):
        if not isinstance(parent, dict):
            return False, None, f"Delete parent must be an object at path '{path}'."
        if final_token not in parent:
            return False, None, f"Property '{final_token}' was not found at path '{path}'."
        del parent[final_token]
        return True, candidate, None
    if not isinstance(parent, list):
        return False, None, f"Delete parent must be a list at path '{path}'."
    if final_token < 0 or final_token >= len(parent):
        return False, None, f"Index [{final_token}] is out of bounds at path '{path}'."
    parent.pop(final_token)
    return True, candidate, None


@tool
def apply_cv_edits(
    operations: list[CVEditOperation],
    runtime: ToolRuntime[Any, dict[str, Any]],
) -> Command:
    """Atomically apply ordered path operations to the current CV.

    Supported operations:
    - op="set": set a scalar/object/list at a path, e.g. path="header.name".
    - op="merge": shallow-merge an object into an existing object, e.g. path="header".
    - op="append": append value to an existing array, e.g. path="sections" or "sections[0].content.items".
    - op="delete": delete an existing object property or list item, e.g. path="sections[0].content.items[1]".

    Do not use [-1]. For append, point path at the array itself.
    """
    if not operations:
        return _error(runtime, "At least one CV edit operation is required.")

    try:
        current_cv = runtime.state["cv"]
    except (KeyError, TypeError):
        return _error(runtime, "Current CV state is unavailable.")
    if not isinstance(current_cv, dict):
        return _error(runtime, "Current CV state must be an object.")

    operation_index: int | None = None
    operation_path: str | None = None
    try:
        candidate = deepcopy(current_cv)
        for operation_index, operation in enumerate(operations):
            operation_path = operation.path
            ok, staged_cv, error = _stage_edit(
                candidate,
                operation.op,
                operation.path,
                deepcopy(operation.value),
            )
            if not ok or staged_cv is None:
                return _error(
                    runtime,
                    error or "Could not apply CV edit.",
                    operation.path,
                    operation_index,
                )
            candidate = staged_cv

        visual_error = _unsupported_visual_mutation_error(current_cv, candidate)
        if visual_error is not None:
            return _error(runtime, visual_error)

        next_cv, validation_error = parse_injected_cv(candidate)
        if next_cv is None:
            return _error(
                runtime,
                validation_error or "CV edits would create invalid CV data.",
            )

        payload = {
            "ok": True,
            "changed_paths": [operation.path for operation in operations],
            "operation_count": len(operations),
        }
        return Command(
            update={
                "cv": dump_cv(next_cv),
                "messages": [
                    ToolMessage(
                        content=json.dumps(payload, ensure_ascii=False),
                        tool_call_id=runtime.tool_call_id,
                    )
                ],
            }
        )
    except Exception:
        logger.exception("Unexpected failure while applying atomic CV edits")
        return _error(
            runtime,
            "Could not apply CV edits.",
            operation_path,
            operation_index,
        )
