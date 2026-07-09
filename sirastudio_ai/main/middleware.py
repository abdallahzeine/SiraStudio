import json
import logging
import time
from datetime import datetime, timezone

from django.http import JsonResponse

from .agent_logging import log_content

logger = logging.getLogger("agent_logger")

_INVALID_JSON = {
    "code": "INVALID_JSON",
    "message": "Request body must be valid JSON.",
}


class AgentLoggingMiddleware:
    AGENT_PATH_PREFIX = "/api/agent/"

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not request.path.startswith(self.AGENT_PATH_PREFIX):
            return self.get_response(request)

        if request.body and request.content_type == "application/json":
            try:
                json.loads(request.body)
            except (UnicodeDecodeError, json.JSONDecodeError):
                return JsonResponse(_INVALID_JSON, status=400)

        start = time.monotonic()
        timestamp = datetime.now(timezone.utc).isoformat()
        request_body = _parse_json(request.body) if request.body else {}
        thread_id = request_body.get("thread_id", "")

        try:
            response = self.get_response(request)
        except Exception as error:
            duration_ms = (time.monotonic() - start) * 1000
            logger.error(
                "AGENT_EXCEPTION | ts=%s | path=%s | thread_id=%s | duration=%.1fms | exception_type=%s",
                timestamp,
                request.path,
                thread_id,
                duration_ms,
                type(error).__name__,
            )
            log_content(
                logger,
                "http_exception",
                request=request_body,
                exception_type=type(error).__name__,
                exception_detail=str(error),
            )
            raise

        duration_ms = (time.monotonic() - start) * 1000
        if getattr(response, "streaming", False):
            _log_request(timestamp, request.path, thread_id, response.status_code, duration_ms, {})
            log_content(logger, "http", request=request_body)
            return response

        response_body = _parse_json(response.content) if response.content else {}
        _log_request(timestamp, request.path, thread_id, response.status_code, duration_ms, response_body)
        log_content(logger, "http", request=request_body, response=response_body)

        return response


def _parse_json(raw):
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", errors="replace")
    if isinstance(raw, str):
        raw = raw.strip()
        if raw and raw[0] in "{[":
            try:
                parsed = json.loads(raw)
            except json.JSONDecodeError:
                return {}
            return parsed if isinstance(parsed, dict) else {}
    return {}


def _log_request(timestamp, path, thread_id, status_code, duration_ms, response_body):
    logger.log(
        logging.WARNING if status_code >= 400 else logging.INFO,
        "AGENT_REQUEST | ts=%s | path=%s | thread_id=%s | status=%d | duration=%.1fms "
        "| job_id=%s | job_status=%s | run_id=%s | error_code=%s",
        timestamp,
        path,
        thread_id or response_body.get("thread_id", ""),
        status_code,
        duration_ms,
        response_body.get("job_id", ""),
        response_body.get("status", "streaming" if not response_body else ""),
        response_body.get("run_id", ""),
        response_body.get("error_code", ""),
    )
