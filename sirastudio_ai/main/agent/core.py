import importlib.util
import logging
import os
import re
import sqlite3
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, Any, Literal, cast

from langchain.messages import AIMessage, AnyMessage, SystemMessage, ToolMessage
from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from langgraph.runtime import Runtime
from langgraph.store.memory import InMemoryStore
from typing_extensions import TypedDict

from .llm import get_llm
from .prompts import (
    FORCE_READ_PROMPT,
    READ_TOOL_NAME,
    SYSTEM_PROMPT,
    VERIFY_AFTER_EDIT_PROMPT,
    blocked_tool_prompt,
    build_state_prompt,
    too_many_tool_errors_prompt,
    tool_error_prompt,
)
from .tools import ALL_TOOLS
from ..cv_schema import CVData, parse_cv


logger = logging.getLogger("agent_logger")

_CHECKPOINT_DB_PATH = Path.home() / ".cv-maker" / "agent-memory.sqlite"
_STORE_DB_PATH = Path.home() / ".cv-maker" / "agent-store.sqlite"
_STORE_MODE_ENV = "CV_MAKER_STORE"
_MAX_TOOL_ERROR_RETRIES = 2
_MAX_WORKFLOW_GUARD_PROMPTS = 2
_EDIT_TOOL_NAMES = {"edit_cv_path"}


@dataclass
class AgentContext:
    user_id: str


class CVGraphState(TypedDict):
    messages: Annotated[list[Any], add_messages]
    cv: dict[str, Any]
    metadata: dict[str, Any]


_graph = None
_checkpointer = None
_store = None
_store_context: Any = None
_model = None


def _extract_text(content: object) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, dict):
                if block.get("type") == "text":
                    parts.append(block.get("text", ""))
                elif "text" in block:
                    parts.append(block["text"])
            elif isinstance(block, str):
                parts.append(block)
        return "".join(parts)
    return str(content) if content is not None else ""


def _clean_reply_text(text: str) -> str:
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text.strip()) if p.strip()]
    filtered = [p for p in paragraphs if not p.startswith(("Now I'll", "Now I\u2019ll"))]
    return "\n\n".join(filtered).strip()


def _extract_reply(result: dict[str, Any]) -> str:
    messages = result.get("messages", [])
    if not messages:
        return ""
    last = messages[-1]
    if getattr(last, "type", None) != "ai" or not hasattr(last, "content"):
        return ""
    return _clean_reply_text(_extract_text(last.content))


def _get_tool_name(call: object) -> str | None:
    if isinstance(call, dict):
        return call.get("name")
    return getattr(call, "name", None)


def _get_tool_call_id(call: object) -> str | None:
    if isinstance(call, dict):
        return call.get("id")
    return getattr(call, "id", None)


def _get_tool_calls(message: object) -> list[Any]:
    if message is None:
        return []
    return getattr(message, "tool_calls", None) or []


def _tool_names(tool_calls: list[Any]) -> list[str]:
    return [name for name in (_get_tool_name(call) for call in tool_calls) if name]


def _tool_args(call: object) -> dict[str, Any]:
    if isinstance(call, dict):
        args = call.get("args") or {}
    else:
        args = getattr(call, "args", None) or {}
    return args if isinstance(args, dict) else {}


def _is_tool_error(text: str) -> bool:
    if not text:
        return False
    lowered = text.lower()
    if lowered.startswith("cannot "):
        return True
    if lowered.startswith("invalid "):
        return True
    if lowered.startswith("action=") or lowered.startswith("action='"):
        return True
    if "requires" in lowered:
        return True
    if "no section matching" in lowered or "no item matching" in lowered:
        return True
    return False


def _last_user_message(messages: list[AnyMessage]) -> AnyMessage | None:
    for message in reversed(messages):
        role = getattr(message, "type", None) or getattr(message, "role", None)
        if role in {"human", "user"}:
            return message
    return None


def _classify_request_intent(text: str) -> str:
    lowered = (text or "").lower()
    destructive_words = ("delete", "remove", "clear", "wipe", "erase")
    full_cv_words = ("replace my cv", "full cv", "entire cv", "new cv", "import")
    rewrite_words = ("rewrite", "reword", "improve", "polish", "make it sound")
    layout_words = ("layout", "template", "spacing", "columns", "design")
    small_edit_words = ("add", "update", "change", "fix", "edit", "set")

    if any(word in lowered for word in destructive_words):
        return "delete_or_destructive"
    if any(word in lowered for word in full_cv_words):
        return "full_cv_import"
    if any(word in lowered for word in rewrite_words):
        return "rewrite_existing"
    if any(word in lowered for word in layout_words):
        return "layout_request"
    if any(word in lowered for word in small_edit_words):
        return "small_edit"
    return "unclear"


def _load_preferences(runtime: Runtime[AgentContext] | None, user_id: str) -> str:
    if runtime is None or runtime.store is None or not user_id:
        return ""
    namespace = ("preferences", user_id)
    memories = runtime.store.search(namespace)
    if not memories:
        return ""
    values = []
    for memory in memories[-5:]:
        value = getattr(memory, "value", None)
        if isinstance(value, dict):
            item = value.get("data")
            if isinstance(item, str) and item.strip():
                values.append(item.strip())
    if not values:
        return ""
    return "User preferences:\n- " + "\n- ".join(values)


def _store_preference(runtime: Runtime[AgentContext] | None, user_id: str, text: str) -> None:
    if runtime is None or runtime.store is None or not user_id:
        return
    if not text or len(text) > 1000:
        return
    lowered = text.lower()
    if "prefer" not in lowered and "preference" not in lowered and "tone" not in lowered:
        return
    namespace = ("preferences", user_id)
    runtime.store.put(namespace, str(uuid.uuid4()), {"data": text.strip()})


def _get_checkpointer():
    global _checkpointer
    if _checkpointer is None:
        _CHECKPOINT_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(_CHECKPOINT_DB_PATH), check_same_thread=False)
        _checkpointer = SqliteSaver(conn)
        _checkpointer.setup()
    return _checkpointer


def _build_sqlite_store() -> Any:
    global _store_context
    spec = importlib.util.find_spec("langgraph.store.sqlite")
    if spec is None:
        return InMemoryStore()
    from langgraph.store.sqlite import SqliteStore

    _STORE_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    _store_context = SqliteStore.from_conn_string(str(_STORE_DB_PATH))
    store = _store_context.__enter__()
    if hasattr(store, "setup"):
        store.setup()
    return store


def _get_store() -> Any:
    global _store
    if _store is None:
        mode = os.getenv(_STORE_MODE_ENV, "memory").lower()
        if mode == "sqlite":
            _store = _build_sqlite_store()
        else:
            _store = InMemoryStore()
    return _store


def _get_model():
    global _model
    if _model is None:
        _model = get_llm(temperature=0).bind_tools(ALL_TOOLS)
    return _model


def _load_state(state: CVGraphState):
    metadata = dict(state.get("metadata") or {})
    cv = state["cv"]

    metadata["cv_read"] = False
    metadata["verification_pending"] = False
    metadata["verified_after_edit"] = False
    metadata["last_tool_call_count"] = 0
    metadata["last_tool_names"] = []
    metadata["last_tool_errors"] = []
    metadata["tool_error_count"] = 0
    metadata["read_guard_count"] = 0
    metadata["verify_guard_count"] = 0
    metadata["blocked_tool_count"] = 0
    metadata.pop("workflow_failed_reason", None)

    last_user = _last_user_message(state.get("messages", []))
    if last_user is not None:
        metadata["request_intent"] = _classify_request_intent(_extract_text(getattr(last_user, "content", "")))

    incoming_revision = metadata.get("input_revision")
    if not isinstance(incoming_revision, int):
        incoming_revision = None

    previous_revision = metadata.get("revision")
    if isinstance(incoming_revision, int):
        if isinstance(previous_revision, int) and incoming_revision < previous_revision:
            metadata["revision_mismatch"] = True
            metadata["revision_expected"] = previous_revision
            metadata["revision_received"] = incoming_revision
        else:
            metadata.pop("revision_mismatch", None)
        metadata["revision"] = incoming_revision
    else:
        metadata.pop("revision_mismatch", None)

    return {"cv": cv, "metadata": metadata}


def _route_after_load(state: CVGraphState) -> Literal["agent", "finalize"]:
    metadata = state.get("metadata") or {}
    if metadata.get("revision_mismatch"):
        return "finalize"
    return "agent"


def _agent_node(state: CVGraphState, runtime: Runtime[AgentContext]):
    messages = state.get("messages", [])
    metadata = state.get("metadata") or {}
    system_messages = [SystemMessage(content=SYSTEM_PROMPT)]

    user_id = ""
    if runtime is not None and runtime.context is not None:
        user_id = runtime.context.user_id
    else:
        user_id = metadata.get("thread_id", "")

    preferences = _load_preferences(runtime, user_id)
    if preferences:
        system_messages.append(SystemMessage(content=preferences))
    system_messages.append(SystemMessage(content=build_state_prompt(metadata)))

    last_user = _last_user_message(messages)
    if last_user is not None:
        content = getattr(last_user, "content", "")
        if isinstance(content, str):
            _store_preference(runtime, user_id, content)

    response = _get_model().invoke(system_messages + messages)
    return {"messages": [response]}


def _force_read_node(state: CVGraphState):
    metadata = dict(state.get("metadata") or {})
    metadata["read_guard_count"] = metadata.get("read_guard_count", 0) + 1
    return {"messages": [SystemMessage(content=FORCE_READ_PROMPT)], "metadata": metadata}


def _force_verify_node(state: CVGraphState):
    metadata = dict(state.get("metadata") or {})
    metadata["verify_guard_count"] = metadata.get("verify_guard_count", 0) + 1
    return {"messages": [SystemMessage(content=VERIFY_AFTER_EDIT_PROMPT)], "metadata": metadata}


def _block_tools_node(state: CVGraphState):
    metadata = dict(state.get("metadata") or {})
    messages = state.get("messages", [])
    last = messages[-1] if messages else None
    tool_calls = _get_tool_calls(last)
    names = _tool_names(tool_calls)
    content = blocked_tool_prompt(names)

    metadata["blocked_tool_count"] = metadata.get("blocked_tool_count", 0) + len(tool_calls)
    tool_messages = []
    for call in tool_calls:
        call_id = _get_tool_call_id(call)
        if call_id:
            tool_messages.append(
                ToolMessage(
                    content=content,
                    tool_call_id=call_id,
                    name=_get_tool_name(call) or "blocked_tool",
                )
            )

    if not tool_messages:
        return {"messages": [SystemMessage(content=content)], "metadata": metadata}
    return {"messages": tool_messages, "metadata": metadata}


def _route_after_agent(
    state: CVGraphState,
) -> Literal["block_tools", "force_read", "force_verify", "tools", "finalize"]:
    messages = state.get("messages", [])
    if not messages:
        return "force_read"

    last = messages[-1]
    tool_calls = _get_tool_calls(last)
    metadata = state.get("metadata") or {}

    if tool_calls:
        names = _tool_names(tool_calls)
        if not metadata.get("cv_read") and any(name != READ_TOOL_NAME for name in names):
            return "block_tools"
        return "tools"

    if not metadata.get("cv_read"):
        if metadata.get("read_guard_count", 0) >= _MAX_WORKFLOW_GUARD_PROMPTS:
            return "finalize"
        return "force_read"
    if metadata.get("verification_pending"):
        if metadata.get("verify_guard_count", 0) >= _MAX_WORKFLOW_GUARD_PROMPTS:
            return "finalize"
        return "force_verify"
    return "finalize"


def _run_tools_node(state: CVGraphState):
    tool_node = ToolNode(ALL_TOOLS)
    messages = state.get("messages", [])
    last = messages[-1] if messages else None
    tool_calls = _get_tool_calls(last)
    tool_names = _tool_names(tool_calls)

    result = tool_node.invoke(state)
    metadata = dict(state.get("metadata") or {})

    edit_count = sum(1 for name in tool_names if name in _EDIT_TOOL_NAMES)
    if READ_TOOL_NAME in tool_names:
        metadata["cv_read"] = True
        if metadata.get("verification_pending") and edit_count == 0:
            metadata["verification_pending"] = False
            metadata["verified_after_edit"] = True
    if edit_count:
        metadata["edit_tool_count"] = metadata.get("edit_tool_count", 0) + edit_count
        metadata["verification_pending"] = True
        metadata["verified_after_edit"] = False

    metadata["last_tool_call_count"] = len(tool_calls)
    metadata["last_tool_names"] = tool_names
    return {**result, "metadata": metadata}


def _tool_feedback_node(state: CVGraphState):
    metadata = dict(state.get("metadata") or {})
    count = metadata.get("last_tool_call_count", 0) or 0
    if count <= 0:
        return {"metadata": metadata}

    messages = state.get("messages", [])
    if len(messages) < count:
        return {"metadata": metadata}

    tool_messages = messages[-count:]
    errors = []
    for message in tool_messages:
        content = getattr(message, "content", "")
        text = content if isinstance(content, str) else str(content)
        if _is_tool_error(text):
            errors.append(text)

    if errors:
        metadata["tool_error_count"] = metadata.get("tool_error_count", 0) + 1
        metadata["last_tool_errors"] = errors
        logger.warning(
            "AGENT_TOOL_ERROR | thread_id=%s | errors=%s",
            metadata.get("thread_id", ""),
            " | ".join(errors)[:500],
        )
        if metadata["tool_error_count"] >= _MAX_TOOL_ERROR_RETRIES:
            metadata["workflow_failed_reason"] = "tool_errors"
            return {"metadata": metadata}
        return {
            "messages": [SystemMessage(content=tool_error_prompt(errors))],
            "metadata": metadata,
        }

    metadata["last_tool_errors"] = []
    return {"metadata": metadata}


def _route_after_tool_feedback(state: CVGraphState) -> Literal["agent", "finalize"]:
    metadata = state.get("metadata") or {}
    if metadata.get("workflow_failed_reason"):
        return "finalize"
    return "agent"


def _finalize_node(state: CVGraphState):
    metadata = state.get("metadata") or {}
    if metadata.get("revision_mismatch"):
        expected = metadata.get("revision_expected")
        received = metadata.get("revision_received")
        text = "CV revision mismatch detected. Refresh the CV and retry."
        if expected is not None and received is not None:
            text += f" Expected revision {expected}, received {received}."
        return {"messages": [AIMessage(content=text)]}
    if metadata.get("workflow_failed_reason") == "tool_errors":
        errors = metadata.get("last_tool_errors", [])
        return {"messages": [AIMessage(content=too_many_tool_errors_prompt(errors))]}
    if (
        not metadata.get("cv_read")
        and metadata.get("read_guard_count", 0) >= _MAX_WORKFLOW_GUARD_PROMPTS
    ):
        return {
            "messages": [
                AIMessage(
                    content=(
                        "I could not safely edit the CV because I could not inspect "
                        "the current CV state."
                    )
                )
            ]
        }
    if (
        metadata.get("verification_pending")
        and metadata.get("verify_guard_count", 0) >= _MAX_WORKFLOW_GUARD_PROMPTS
    ):
        return {
            "messages": [
                AIMessage(
                    content=(
                        "The edit tools ran, but I could not complete the final "
                        "verification pass."
                    )
                )
            ]
        }
    return {}


def build_graph():
    builder = StateGraph(CVGraphState, context_schema=AgentContext)
    builder.add_node("load_state", _load_state)
    builder.add_node("agent", _agent_node)
    builder.add_node("force_read", _force_read_node)
    builder.add_node("force_verify", _force_verify_node)
    builder.add_node("block_tools", _block_tools_node)
    builder.add_node("tools", _run_tools_node)
    builder.add_node("tool_feedback", _tool_feedback_node)
    builder.add_node("finalize", _finalize_node)

    builder.add_edge(START, "load_state")
    builder.add_conditional_edges(
        "load_state",
        _route_after_load,
        {
            "agent": "agent",
            "finalize": "finalize",
        },
    )
    builder.add_conditional_edges(
        "agent",
        _route_after_agent,
        {
            "block_tools": "block_tools",
            "force_read": "force_read",
            "force_verify": "force_verify",
            "tools": "tools",
            "finalize": "finalize",
        },
    )
    builder.add_edge("block_tools", "agent")
    builder.add_edge("force_read", "agent")
    builder.add_edge("force_verify", "agent")
    builder.add_edge("tools", "tool_feedback")
    builder.add_conditional_edges(
        "tool_feedback",
        _route_after_tool_feedback,
        {
            "agent": "agent",
            "finalize": "finalize",
        },
    )
    builder.add_edge("finalize", END)

    return builder.compile(checkpointer=_get_checkpointer(), store=_get_store())


def _get_graph():
    global _graph
    if _graph is None:
        _graph = build_graph()
    return _graph


def run_agent(
    cv: CVData,
    message: str,
    thread_id: str,
    run_id: str | None = None,
    user_id: str | None = None,
    checkpoint_id: str | None = None,
    input_revision: int | None = None,
    on_tool_event: Any = None,
) -> dict[str, Any]:
    run_id = run_id or uuid.uuid4().hex
    inputs: CVGraphState = {
        "messages": [{"role": "user", "content": message}],
        "cv": cv.model_dump(by_alias=True),
        "metadata": {"thread_id": thread_id, "run_id": run_id, "input_revision": input_revision},
    }
    config: dict[str, Any] = {"configurable": {"thread_id": thread_id}, "recursion_limit": 100}
    if checkpoint_id:
        config["configurable"]["checkpoint_id"] = checkpoint_id

    logger.info("[PROMPT] thread_id=%s run_id=%s %s", thread_id, run_id, message[:200])

    context_user = user_id or thread_id
    result: Any = inputs
    seen_tool_calls: set[str] = set()
    seen_tool_results: set[str] = set()
    for state in _get_graph().stream(inputs, config=cast(Any, config), context=AgentContext(user_id=context_user), stream_mode="values"):
        result = state
        for item in state.get("messages", []):
            for call in _get_tool_calls(item):
                call_id = _get_tool_call_id(call)
                if call_id and call_id not in seen_tool_calls:
                    seen_tool_calls.add(call_id)
                    if on_tool_event:
                        on_tool_event(
                            {
                                "id": call_id,
                                "name": _get_tool_name(call) or "tool",
                                "args": _tool_args(call),
                                "status": "running",
                            }
                        )
            if isinstance(item, ToolMessage):
                call_id = getattr(item, "tool_call_id", None)
                if call_id and call_id not in seen_tool_results:
                    seen_tool_results.add(call_id)
                    text = _extract_text(getattr(item, "content", ""))
                    if on_tool_event:
                        on_tool_event(
                            {
                                "id": call_id,
                                "name": getattr(item, "name", None) or "tool",
                                "status": "failed" if _is_tool_error(text) else "completed",
                                "summary": text[:240],
                            }
                        )

    reply = _extract_reply(result) or "Done."
    final_cv = result.get("cv", cv)
    if isinstance(final_cv, CVData):
        final_cv = final_cv.model_dump(by_alias=True)
    else:
        final_cv = parse_cv(final_cv).model_dump(by_alias=True)

    logger.info("[DONE] thread_id=%s run_id=%s %s", thread_id, run_id, reply[:140])
    return {
        "cv": final_cv,
        "reply": reply,
        "run_id": run_id,
        "metadata": result.get("metadata", {}),
    }
