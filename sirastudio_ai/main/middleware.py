import json
import time
import logging
from datetime import datetime, timezone

logger = logging.getLogger("agent_logger")


class AgentLoggingMiddleware:
    AGENT_PATH_PREFIX = "/api/agent"

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not request.path.startswith(self.AGENT_PATH_PREFIX):
            return self.get_response(request)

        start = time.monotonic()
        timestamp = datetime.now(timezone.utc).isoformat()
        request_body = _parse_json(request.body) if request.body else {}
        cv_before = request_body.get("cv", {})
        thread_id = request_body.get("thread_id", "")
        user_message = request_body.get("message", "")

        response = self.get_response(request)

        duration_ms = (time.monotonic() - start) * 1000
        if getattr(response, "streaming", False):
            logger.info(
                "AGENT_REQUEST | ts=%s | path=%s | thread_id=%s | status=%d | duration=%.1fms "
                "| job_id=%s | job_status=%s | message=%s | reply=%s | sections_changed=%s | details=%s",
                timestamp, request.path, thread_id, response.status_code, duration_ms,
                "", "streaming", user_message[:200], "", "[]", "[]",
            )
            return response

        response_body = _parse_json(response.content) if response.content else {}

        if response.status_code >= 400:
            logger.warning(
                "AGENT_ERROR | ts=%s | path=%s | thread_id=%s | status=%d | duration=%.1fms | message=%s | response=%s",
                timestamp, request.path, thread_id, response.status_code, duration_ms,
                user_message[:200],
                json.dumps(response_body, ensure_ascii=False)[:500] if response_body else "",
            )
            return response

        cv_after = response_body.get("cv")
        reply = response_body.get("reply") or ""
        diff = _compute_cv_diff(cv_before, cv_after) if isinstance(cv_after, dict) else {
            "sections_changed": [],
            "details": [],
        }

        logger.info(
            "AGENT_REQUEST | ts=%s | path=%s | thread_id=%s | status=%d | duration=%.1fms "
            "| job_id=%s | job_status=%s | message=%s | reply=%s | sections_changed=%s | details=%s",
            timestamp, request.path, thread_id, response.status_code, duration_ms,
            response_body.get("job_id", ""),
            response_body.get("status", ""),
            user_message[:200], reply[:200],
            json.dumps(diff["sections_changed"], ensure_ascii=False),
            json.dumps(diff["details"], ensure_ascii=False)[:1000],
        )

        return response


def _parse_json(raw):
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", errors="replace")
    if isinstance(raw, str):
        raw = raw.strip()
        if raw and raw[0] in "{[":
            return json.loads(raw)
    return {}


def _as_cv_dict(value):
    return value if isinstance(value, dict) else {}


def _as_section_list(value):
    return value if isinstance(value, list) else []


def _section_by_id(cv):
    return {
        s.get("id"): s
        for s in _as_section_list(_as_cv_dict(cv).get("sections"))
        if isinstance(s, dict) and s.get("id")
    }


def _item_by_id(section):
    content = _as_cv_dict(section).get("content")
    items = _as_cv_dict(content).get("items") if isinstance(content, dict) else None
    if items is None:
        items = _as_cv_dict(section).get("items")
    return {
        i.get("id"): i
        for i in _as_section_list(items)
        if isinstance(i, dict) and i.get("id")
    }


def _compute_cv_diff(cv_before, cv_after):
    cv_before = _as_cv_dict(cv_before)
    cv_after = _as_cv_dict(cv_after)
    sections_before = _section_by_id(cv_before)
    sections_after = _section_by_id(cv_after)

    all_ids = set(sections_before) | set(sections_after)
    changed = []
    details = []

    for sid in sorted(all_ids):
        before = sections_before.get(sid)
        after = sections_after.get(sid)

        if before is None and after is not None:
            changed.append(sid)
            details.append({
                "section_id": sid,
                "action": "added",
                "type": after.get("type", "unknown"),
                "title": after.get("title", ""),
            })
        elif before is not None and after is None:
            changed.append(sid)
            details.append({
                "section_id": sid,
                "action": "removed",
                "type": before.get("type", "unknown"),
                "title": before.get("title", ""),
            })
        elif before is not None and after is not None and before != after:
            changed.append(sid)
            items_before = _item_by_id(before)
            items_after = _item_by_id(after)
            item_changes = []
            for iid in set(items_before) | set(items_after):
                ib = items_before.get(iid)
                ia = items_after.get(iid)
                if ib is None and ia is not None:
                    action = "added"
                elif ib is not None and ia is None:
                    action = "removed"
                elif ib != ia:
                    action = "modified"
                else:
                    continue
                item_changes.append({"item_id": iid, "action": action})
            details.append({
                "section_id": sid,
                "action": "modified",
                "items_changed": item_changes,
            })

    if cv_before.get("header") != cv_after.get("header"):
        changed.append("header")
        details.append({"section_id": "header", "action": "modified"})

    return {
        "sections_changed": changed,
        "details": details,
    }
