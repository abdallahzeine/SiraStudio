import json
import logging
import re
from typing import Any

from django.conf import settings


_SECRET_FIELD_RE = re.compile(
    r"api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|"
    r"authorization|cookie|credential",
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
_TRUNCATION_SUFFIX = "...[truncated]"


def log_content(logger: logging.Logger, source: str, **data: Any) -> None:
    """Emit bounded diagnostic content only during an explicit opt-in session."""
    if not getattr(settings, "CV_MAKER_AGENT_LOG_CONTENT", False):
        return

    payload = json.dumps(_redact(data), ensure_ascii=False, default=str, separators=(",", ":"))
    limit = getattr(settings, "CV_MAKER_AGENT_LOG_CONTENT_MAX_CHARS", 2000)
    if not isinstance(limit, int) or limit < 1:
        limit = 2000
    if len(payload) > limit:
        suffix = _TRUNCATION_SUFFIX[:limit]
        payload = f"{payload[: limit - len(suffix)]}{suffix}"
    logger.info("AGENT_CONTENT | source=%s | data=%s", source, payload)


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


def _redact_text(value: str) -> str:
    value = _BEARER_TOKEN_RE.sub("Bearer [REDACTED]", value)
    value = _KNOWN_SECRET_RE.sub("[REDACTED]", value)
    return _SECRET_ASSIGNMENT_RE.sub(
        lambda match: f"{match.group('name')}{match.group('separator')}[REDACTED]",
        value,
    )
