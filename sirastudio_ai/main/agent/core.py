import json
import logging
import re
import uuid
from copy import deepcopy
from dataclasses import dataclass
from typing import Annotated, Any, Callable, Literal, cast

from langchain.messages import AIMessage, AnyMessage, HumanMessage, SystemMessage, ToolMessage
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from langgraph.runtime import Runtime
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator
from typing_extensions import TypedDict

from ..agent_logging import log_debug, safe_validation_errors
from ..cv_schema import CVData, dump_cv, parse_cv
from .llm import get_llm
from .prompts import (
    REVIEW_SYSTEM_PROMPT,
    SYSTEM_PROMPT,
    build_review_prompt,
)
from .tools import ALL_TOOLS


logger = logging.getLogger("agent_logger")

READ_TOOL_NAME = "read_cv"
EDIT_TOOL_NAME = "apply_cv_edits"
FORCE_READ_PROMPT = "Call read_cv by itself now before editing the CV."
AGENT_TOOLS = [tool for tool in ALL_TOOLS if tool.name in {READ_TOOL_NAME, EDIT_TOOL_NAME}]


@dataclass
class AgentContext:
    on_tool_event: Callable[[dict[str, Any]], None] | None = None


class CVGraphState(TypedDict):
    messages: Annotated[list[Any], add_messages]
    cv: dict[str, Any]
    original_cv: dict[str, Any]
    metadata: dict[str, Any]


class ReviewResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    complete: bool
    missing: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def normalize_missing(self):
        self.missing = [item.strip() for item in self.missing if item.strip()]
        self.complete = self.complete and not self.missing
        return self


class AgentCancellationError(Exception):
    """Raised internally when a running agent job is cancelled."""


_graph = None
_base_model = None
_model = None
_review_model = None


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
    return "\n\n".join(
        p for p in paragraphs if not p.startswith(("Now I'll", "Now I’ll"))
    ).strip()


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
    return getattr(message, "tool_calls", None) or [] if message is not None else []


def _tool_args(call: object) -> dict[str, Any]:
    args = call.get("args") if isinstance(call, dict) else getattr(call, "args", None)
    return args if isinstance(args, dict) else {}


def _parse_tool_message(message: ToolMessage) -> tuple[Any, bool, str]:
    text = _extract_text(getattr(message, "content", ""))
    try:
        payload = json.loads(text)
    except (TypeError, ValueError):
        payload = None
    failed = getattr(message, "status", None) == "error"
    if isinstance(payload, dict) and payload.get("ok") is False:
        failed = True
    if failed and isinstance(payload, dict) and isinstance(payload.get("error"), str):
        return payload, True, payload["error"]
    return payload, failed, text


def _last_user_message(messages: list[AnyMessage]) -> AnyMessage | None:
    for message in reversed(messages):
        role = getattr(message, "type", None) or getattr(message, "role", None)
        if role in {"human", "user"}:
            return message
    return None


def _latest_tool_exchange(
    messages: list[AnyMessage],
) -> tuple[list[Any], dict[str, ToolMessage]]:
    for index in range(len(messages) - 1, -1, -1):
        calls = _get_tool_calls(messages[index])
        if calls:
            call_ids = {_get_tool_call_id(call) for call in calls}
            results = {
                message.tool_call_id: message
                for message in messages[index + 1 :]
                if isinstance(message, ToolMessage) and message.tool_call_id in call_ids
            }
            return calls, results
    return [], {}


def _get_base_model():
    global _base_model
    if _base_model is None:
        _base_model = get_llm(temperature=0)
    return _base_model


def _get_model():
    global _model
    if _model is None:
        _model = _get_base_model().bind_tools(AGENT_TOOLS, parallel_tool_calls=False)
    return _model


def _get_review_model():
    global _review_model
    if _review_model is None:
        _review_model = _get_base_model().with_structured_output(
            ReviewResult,
            method="json_schema",
        )
    return _review_model


def _emit_progress(
    runtime: Runtime[AgentContext], event_id: str, name: str, status: str
) -> None:
    callback = runtime.context.on_tool_event
    if callback:
        callback({"id": event_id, "name": name, "status": status})


def _agent_node(state: CVGraphState, runtime: Runtime[AgentContext]):
    metadata = dict(state.get("metadata") or {})
    step = metadata.get("agent_step", 0)
    if metadata.get("review_correction_count"):
        phase = "fix_review"
    elif metadata.get("successful_edits", 0):
        phase = "prepare_response"
    else:
        phase = "plan_changes"
    event_id = f"phase-agent-{step}"
    _emit_progress(runtime, event_id, phase, "running")
    try:
        response = _get_model().invoke(
            [SystemMessage(content=SYSTEM_PROMPT), *state.get("messages", [])],
            config={
                "metadata": {
                    "phase": "agent",
                    "thread_id": metadata.get("thread_id"),
                    "run_id": metadata.get("run_id"),
                }
            },
        )
    except Exception:
        _emit_progress(runtime, event_id, phase, "failed")
        raise
    _emit_progress(runtime, event_id, phase, "completed")
    metadata["agent_step"] = step + 1
    return {"messages": [response], "metadata": metadata}


def _route_after_agent(
    state: CVGraphState,
) -> Literal["reject_tools", "force_read", "tools", "review", "finalize"]:
    messages = state.get("messages", [])
    last = messages[-1] if messages else None
    tool_calls = _get_tool_calls(last)
    metadata = state.get("metadata") or {}

    if tool_calls:
        if len(tool_calls) != 1:
            return "reject_tools"
        if not metadata.get("cv_read") and _get_tool_name(tool_calls[0]) != READ_TOOL_NAME:
            return "reject_tools"
        return "tools"
    if not metadata.get("cv_read"):
        return "force_read"
    if metadata.get("review_correction_count"):
        return "finalize"
    if metadata.get("successful_edits", 0) > 0:
        return "review"
    return "finalize"


def _force_read_node(_: CVGraphState):
    return {"messages": [SystemMessage(content=FORCE_READ_PROMPT)]}


def _reject_tools_node(state: CVGraphState):
    messages = state.get("messages", [])
    calls = _get_tool_calls(messages[-1] if messages else None)
    metadata = state.get("metadata") or {}
    if not metadata.get("cv_read"):
        text = "Call read_cv by itself before using apply_cv_edits."
    else:
        text = "Call one tool at a time so CV edits are applied sequentially."
    tool_messages = [
        ToolMessage(
            content=json.dumps({"ok": False, "error": text}),
            tool_call_id=call_id,
            name=_get_tool_name(call) or "blocked_tool",
            status="error",
        )
        for call in calls
        if (call_id := _get_tool_call_id(call))
    ]
    return {"messages": tool_messages or [SystemMessage(content=text)]}


def _tool_feedback_node(state: CVGraphState):
    metadata = dict(state.get("metadata") or {})
    calls, results = _latest_tool_exchange(state.get("messages", []))
    errors: list[str] = []

    for call in calls:
        result = results.get(_get_tool_call_id(call) or "")
        if result is None:
            continue
        payload, failed, error = _parse_tool_message(result)
        name = _get_tool_name(call)
        if failed:
            errors.append(error or f"{name or 'Tool'} failed.")
        elif name == READ_TOOL_NAME:
            metadata["cv_read"] = True
        elif name == EDIT_TOOL_NAME:
            if (
                isinstance(payload, dict)
                and payload.get("ok") is True
                and isinstance(payload.get("operation_count"), int)
                and payload["operation_count"] > 0
            ):
                metadata["successful_edits"] = metadata.get("successful_edits", 0) + 1
            else:
                errors.append("The CV edit tool returned an invalid success result.")

    if errors:
        logger.warning(
            "AGENT_TOOL_ERROR | thread_id=%s | errors=%d",
            metadata.get("thread_id", ""),
            len(errors),
        )
        log_debug(
            "tool_error",
            thread_id=metadata.get("thread_id", ""),
            errors=errors,
        )
        metadata["workflow_failed_reason"] = "tool_failed"
        return {"metadata": metadata}
    return {"metadata": metadata}


def _route_after_tool_feedback(state: CVGraphState) -> Literal["agent", "finalize"]:
    if (state.get("metadata") or {}).get("workflow_failed_reason"):
        return "finalize"
    return "agent"


def _review_node(state: CVGraphState, runtime: Runtime[AgentContext]):
    metadata = dict(state.get("metadata") or {})
    last_user = _last_user_message(state.get("messages", []))
    request = _extract_text(getattr(last_user, "content", "")) if last_user else ""
    event_id = f"phase-review-{metadata.get('review_correction_count', 0)}"
    _emit_progress(runtime, event_id, "review_changes", "running")

    try:
        raw_result = _get_review_model().invoke(
            [
                SystemMessage(content=REVIEW_SYSTEM_PROMPT),
                HumanMessage(content=build_review_prompt(request, state.get("cv", {}))),
            ],
            config={
                "metadata": {
                    "phase": "review",
                    "thread_id": metadata.get("thread_id"),
                    "run_id": metadata.get("run_id"),
                }
            },
        )
        review = (
            raw_result
            if isinstance(raw_result, ReviewResult)
            else ReviewResult.model_validate(raw_result)
        )
    except Exception as error:
        _emit_progress(runtime, event_id, "review_changes", "failed")
        validation_errors = (
            safe_validation_errors(error) if isinstance(error, ValidationError) else None
        )
        logger.warning(
            "AGENT_REVIEW_ERROR | thread_id=%s | exception_type=%s | validation_errors=%s",
            metadata.get("thread_id", ""),
            type(error).__name__,
            json.dumps(validation_errors, ensure_ascii=True) if validation_errors else "[]",
        )
        metadata["workflow_failed_reason"] = "review_failed"
        return {"metadata": metadata}

    _emit_progress(runtime, event_id, "review_changes", "completed")
    metadata["review_complete"] = review.complete
    metadata["review_missing"] = review.missing
    if review.complete:
        return {"metadata": metadata}

    metadata["review_correction_count"] = 1
    missing = review.missing or ["Complete every result in the current user request."]
    return {
        "messages": [
            SystemMessage(
                content="The completion checker found these requested results still missing:\n- "
                + "\n- ".join(missing)
            )
        ],
        "metadata": metadata,
    }


def _route_after_review(state: CVGraphState) -> Literal["agent", "finalize"]:
    metadata = state.get("metadata") or {}
    if metadata.get("review_complete") or metadata.get("workflow_failed_reason"):
        return "finalize"
    return "agent"


def _finalize_node(state: CVGraphState):
    metadata = state.get("metadata") or {}
    if not metadata.get("workflow_failed_reason"):
        return {}
    return {
        "cv": deepcopy(state.get("original_cv", state.get("cv", {}))),
        "messages": [
            AIMessage(
                content=(
                    "I could not safely complete every requested CV change, so I restored the original CV."
                )
            )
        ],
    }


def build_graph():
    builder = StateGraph(CVGraphState, context_schema=AgentContext)
    builder.add_node("agent", _agent_node)
    builder.add_node("force_read", _force_read_node)
    builder.add_node("reject_tools", _reject_tools_node)
    builder.add_node("tools", ToolNode(AGENT_TOOLS))
    builder.add_node("tool_feedback", _tool_feedback_node)
    builder.add_node("review", _review_node)
    builder.add_node("finalize", _finalize_node)

    builder.add_edge(START, "agent")
    builder.add_conditional_edges(
        "agent",
        _route_after_agent,
        {
            "reject_tools": "reject_tools",
            "force_read": "force_read",
            "tools": "tools",
            "review": "review",
            "finalize": "finalize",
        },
    )
    builder.add_edge("reject_tools", "agent")
    builder.add_edge("force_read", "agent")
    builder.add_edge("tools", "tool_feedback")
    builder.add_conditional_edges(
        "tool_feedback",
        _route_after_tool_feedback,
        {"agent": "agent", "finalize": "finalize"},
    )
    builder.add_conditional_edges(
        "review",
        _route_after_review,
        {"agent": "agent", "finalize": "finalize"},
    )
    builder.add_edge("finalize", END)
    return builder.compile()


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
    on_tool_event: Any = None,
    should_cancel: Callable[[], bool] | None = None,
) -> dict[str, Any]:
    should_cancel = should_cancel or (lambda: False)
    if should_cancel():
        raise AgentCancellationError

    run_id = run_id or uuid.uuid4().hex
    input_cv = dump_cv(cv)
    inputs: CVGraphState = {
        "messages": [{"role": "user", "content": message}],
        "cv": input_cv,
        "original_cv": deepcopy(input_cv),
        "metadata": {
            "thread_id": thread_id,
            "run_id": run_id,
            "cv_read": False,
            "successful_edits": 0,
            "review_correction_count": 0,
        },
    }
    config = {"recursion_limit": 100}

    logger.info("AGENT_RUN_START | thread_id=%s | run_id=%s", thread_id, run_id)
    log_debug(
        "agent_input",
        thread_id=thread_id,
        run_id=run_id,
        message=message,
        cv=cv,
    )

    result: Any = inputs
    seen_tool_calls: set[str] = set()
    seen_tool_results: set[str] = set()
    tool_call_names: dict[str, str] = {}

    def cancellable_states():
        states = iter(
            _get_graph().stream(
                inputs,
                config=cast(Any, config),
                context={"on_tool_event": on_tool_event},
                stream_mode="values",
            )
        )
        while True:
            if should_cancel():
                raise AgentCancellationError
            try:
                state = next(states)
            except StopIteration:
                return
            if should_cancel():
                raise AgentCancellationError
            yield state

    for state in cancellable_states():
        result = state
        for item in state.get("messages", []):
            for call in _get_tool_calls(item):
                call_id = _get_tool_call_id(call)
                if call_id and call_id not in seen_tool_calls:
                    seen_tool_calls.add(call_id)
                    tool_call_names[call_id] = _get_tool_name(call) or "tool"
                    if on_tool_event:
                        on_tool_event(
                            {
                                "id": call_id,
                                "name": tool_call_names[call_id],
                                "args": _tool_args(call),
                                "status": "running",
                            }
                        )
            if isinstance(item, ToolMessage):
                call_id = getattr(item, "tool_call_id", None)
                if call_id and call_id not in seen_tool_results:
                    seen_tool_results.add(call_id)
                    _, failed, summary = _parse_tool_message(item)
                    if on_tool_event:
                        on_tool_event(
                            {
                                "id": call_id,
                                "name": getattr(item, "name", None)
                                or tool_call_names.get(call_id, "tool"),
                                "status": "failed" if failed else "completed",
                                "summary": summary[:240],
                            }
                        )

    if should_cancel():
        raise AgentCancellationError

    reply = _extract_reply(result) or "Done."
    final_cv = result.get("cv", cv)
    final_cv = dump_cv(final_cv) if isinstance(final_cv, CVData) else dump_cv(parse_cv(final_cv))
    metadata = result.get("metadata", {})
    error_code = "AGENT_EDIT_FAILED" if metadata.get("workflow_failed_reason") else None

    logger.info("AGENT_RUN_DONE | thread_id=%s | run_id=%s", thread_id, run_id)
    log_debug(
        "agent_output",
        thread_id=thread_id,
        run_id=run_id,
        reply=reply,
        cv=final_cv,
    )
    return {
        "cv": final_cv,
        "reply": reply,
        "run_id": run_id,
        "metadata": metadata,
        "error_code": error_code,
    }
