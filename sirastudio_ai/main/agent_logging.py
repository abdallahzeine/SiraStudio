import json
import logging
import re
import traceback
from typing import Any

from langchain_core.callbacks import BaseCallbackHandler

from django.conf import settings


_SECRET_FIELD_RE = re.compile(
    r"api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password|"
    r"authorization|cookie|credential|^token$",
    re.IGNORECASE,
)
_SECRET_ASSIGNMENT_RE = re.compile(
    r"""(?ix)
    (?P<name>
        [\"']?\b[A-Za-z0-9_-]*?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|authorization|cookie|credential)[A-Za-z0-9_-]*\b[\"']?
    )
    (?P<separator>\s*(?:[:=]|\bis\b|\bwas\b)\s*)
    (?P<value>\"[^\"]*\"|'[^']*'|[^\s,;]+)
    """
)
_BEARER_TOKEN_RE = re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~+/=-]+")
_KNOWN_SECRET_RE = re.compile(
    r"""(?x)
    (?<![A-Za-z0-9_-])
    (?:
        sk-[A-Za-z0-9_-]{12,} |
        AKIA[A-Z0-9]{16} |
        gh[pousr]_[A-Za-z0-9_]{20,} |
        github_pat_[A-Za-z0-9_]{20,} |
        glpat-[A-Za-z0-9_-]{20,} |
        xox(?:a|b|p|r|s)-[A-Za-z0-9-]{10,} |
        (?:sk|rk)_(?:live|test)_[A-Za-z0-9]{12,} |
        AIza[A-Za-z0-9_-]{35} |
        eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}
    )
    (?![A-Za-z0-9_-])
    """
)
_SAFE_VALIDATION_PATH_PART_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_-]{0,63}$")
_debug_logger = logging.getLogger("agent_debug_logger")


def debug_logging_enabled() -> bool:
    return bool(getattr(settings, "CV_MAKER_DEBUG_LOG", False))


def log_debug(source: str, **data: Any) -> None:
    if not debug_logging_enabled():
        return
    payload = json.dumps(
        _redact(_jsonable(data)),
        ensure_ascii=False,
        separators=(",", ":"),
    )
    _debug_logger.debug("DEBUG_FLOW | source=%s | data=%s", source, payload)


class OpenRouterDebugCallback(BaseCallbackHandler):
    def on_chat_model_start(
        self,
        serialized: dict[str, Any],
        messages: list[list[Any]],
        *,
        run_id: Any,
        parent_run_id: Any = None,
        tags: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> None:
        log_debug(
            "openrouter_request",
            callback_run_id=run_id,
            parent_run_id=parent_run_id,
            tags=tags,
            metadata=metadata,
            model=serialized,
            messages=messages,
            invocation=kwargs,
        )

    def on_llm_end(
        self,
        response: Any,
        *,
        run_id: Any,
        parent_run_id: Any = None,
        tags: list[str] | None = None,
        **kwargs: Any,
    ) -> None:
        log_debug(
            "openrouter_response",
            callback_run_id=run_id,
            parent_run_id=parent_run_id,
            tags=tags,
            response=response,
            details=kwargs,
        )

    def on_llm_error(
        self,
        error: BaseException,
        *,
        run_id: Any,
        parent_run_id: Any = None,
        tags: list[str] | None = None,
        **kwargs: Any,
    ) -> None:
        log_debug(
            "openrouter_error",
            callback_run_id=run_id,
            parent_run_id=parent_run_id,
            tags=tags,
            exception_type=type(error).__name__,
            exception_detail=str(error),
            traceback="".join(traceback.format_exception(error)),
            details=kwargs,
        )


def safe_validation_errors(error: Any) -> list[dict[str, Any]]:
    """Keep validation diagnostics useful without logging rejected input values."""
    details = []
    for item in error.errors(include_url=False, include_context=False, include_input=False):
        path = [
            part
            if isinstance(part, int)
            or (isinstance(part, str) and _SAFE_VALIDATION_PATH_PART_RE.fullmatch(part))
            else "<invalid-field>"
            for part in item.get("loc", ())
        ]
        details.append(
            {
                "path": path,
                "type": str(item.get("type", "validation_error")),
                "detail": _redact_text(str(item.get("msg", "Invalid value.")))[:240],
            }
        )
    return details


def _redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            str(key): "[REDACTED]" if _SECRET_FIELD_RE.search(str(key)) else _redact(item)
            for key, item in value.items()
        }
    if isinstance(value, list | tuple):
        return [_redact(item) for item in value]
    if isinstance(value, str):
        return _redact_text(value)
    return value


def _jsonable(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _jsonable(item) for key, item in value.items()}
    if isinstance(value, list | tuple):
        return [_jsonable(item) for item in value]
    model_dump = getattr(value, "model_dump", None)
    if callable(model_dump):
        return _jsonable(model_dump(mode="json"))
    if value is None or isinstance(value, str | int | float | bool):
        return value
    return str(value)


def _redact_text(value: str) -> str:
    value = _BEARER_TOKEN_RE.sub("Bearer [REDACTED]", value)
    value = _KNOWN_SECRET_RE.sub("[REDACTED]", value)
    return _SECRET_ASSIGNMENT_RE.sub(
        lambda match: f"{match.group('name')}{match.group('separator')}[REDACTED]",
        value,
    )
