import json
import re
from typing import Annotated, Any

from langchain.tools import tool
from langgraph.prebuilt import InjectedState

from ...cv_schema import CVData
from .helpers import parse_injected_cv


_PROP_RE = re.compile(r"[A-Za-z0-9_$-]+")


def _error(message: str, path: str | None = None) -> str:
    payload = {"ok": False, "error": message}
    if path is not None:
        payload["path"] = path
    return json.dumps(payload, ensure_ascii=False)


def _ok(changed_path: str, op: str) -> str:
    return json.dumps({"ok": True, "op": op, "changed_path": changed_path}, ensure_ascii=False)


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


def _stage_edit(candidate: dict[str, Any], op: str, path: str, value: Any = None) -> tuple[bool, dict[str, Any] | None, str | None]:
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
        parent[final_token] = value
        return True, candidate, None

    if op == "delete":
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

    return False, None, "Unsupported op. Use set, merge, append, or delete."


def _commit_cv_state(cv: dict[str, Any], next_cv: CVData) -> None:
    cv.clear()
    cv.update(next_cv.model_dump(by_alias=True))


@tool
def edit_cv_path(
    cv: Annotated[dict[str, Any], InjectedState("cv")],
    op: str,
    path: str,
    value: Any = None,
) -> str:
    """Edit the CV by applying one path operation to the current typed CV.

    Supported operations:
    - op="set": set a scalar/object/list at a path, e.g. path="header.name".
    - op="merge": shallow-merge an object into an existing object, e.g. path="header".
    - op="append": append value to an existing array, e.g. path="sections" or "sections[0].content.items".
    - op="delete": delete an existing object property or list item, e.g. path="sections[0].content.items[1]".

    Do not use [-1]. For append, point path at the array itself.
    """
    if not isinstance(path, str):
        return _error("Path must be a string.")

    cv_model, current_error = parse_injected_cv(cv)
    if cv_model is None:
        return _error(current_error or "Current CV state is not valid.", path)

    normalized_op = str(op or "").strip().lower()
    candidate = cv_model.model_dump(by_alias=True)
    ok, staged_cv, err = _stage_edit(candidate, normalized_op, path, value)
    if not ok:
        return _error(err or "Could not apply CV edit.", path)

    next_cv, validation_error = parse_injected_cv(staged_cv or {})
    if next_cv is None:
        return _error(validation_error or "CV edit would create invalid CV data.", path)

    _commit_cv_state(cv, next_cv)
    return _ok(path, normalized_op)
