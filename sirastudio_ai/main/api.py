import asyncio
import json
import time
from typing import Any

from asgiref.sync import sync_to_async
from django.http import StreamingHttpResponse
from ninja import Router, Status
from ninja.errors import HttpError

from .agent import (
    EditRequest,
    JobCapacityErrorResponse,
    JobCreateResponse,
    JobStatusResponse,
    ThreadCreateRequest,
    ThreadDetailResponse,
    ThreadListResponse,
    ThreadRenameRequest,
    ThreadSummaryResponse,
)

from .agent.llm import OPENROUTER_API_KEY
from .agent_logging import log_debug
from .jobs import (
    ThreadNotFoundError,
    archive_thread,
    cancel_job,
    create_job,
    create_thread,
    delete_thread,
    executor_available,
    failure_message,
    get_thread,
    JobCapacityExceeded,
    job_status_payload,
    jobs_db_available,
    list_job_events,
    list_thread_messages,
    list_threads,
    rename_thread,
)

JsonDict = dict[str, Any]

router = Router()

_SSE_TIMEOUT_SECONDS = 120
_SSE_POLL_SECONDS = 0.1


def _thread_response(record: JsonDict) -> JsonDict:
    return {
        "thread_id": record.get("id"),
        "title": record.get("title"),
        "status": record.get("status") or "regular",
        "created_at": record.get("created_at"),
        "updated_at": record.get("updated_at"),
        "last_message_at": record.get("last_message_at"),
        "last_job_id": record.get("last_job_id"),
        "message_preview": record.get("message_preview"),
    }


def _message_response(record: JsonDict) -> JsonDict:
    status = record.get("status") or "completed"
    if status == "failed":
        error = failure_message(record.get("job_error_code") or "AGENT_FAILED")
        content = error
    else:
        error = record.get("error")
        content = record.get("content") or ""

    return {
        "id": record.get("id"),
        "thread_id": record.get("thread_id"),
        "role": record.get("role"),
        "content": content,
        "status": status,
        "created_at": record.get("created_at"),
        "updated_at": record.get("updated_at"),
        "job_id": record.get("job_id"),
        "run_id": record.get("run_id"),
        "error": error,
    }


def _require_thread(thread_id: str) -> JsonDict:
    if not thread_id.strip():
        raise HttpError(400, "thread_id is required")
    record = get_thread(thread_id)
    if record is None:
        raise HttpError(404, "Thread not found")
    return record


def _sse_event(event: str, data: JsonDict, cursor: int | None = None) -> str:
    event_id = f"id: {cursor}\n" if cursor is not None else ""
    payload = f"{event_id}event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
    log_debug("frontend_sse", event=event, cursor=cursor, data=data, payload=payload)
    return payload


def _sse_cursor(request) -> int:
    value = request.headers.get("Last-Event-ID") or request.GET.get("cursor")
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


@router.post(
    "/edit",
    response={200: JobCreateResponse, 429: JobCapacityErrorResponse},
    summary="Edit CV via AI agent",
)
def edit_cv(request, body: EditRequest):
    try:
        job_id = create_job(body.cv, body.message, body.thread_id)
    except JobCapacityExceeded as error:
        return Status(429, {"code": error.code, "message": error.message})
    except ThreadNotFoundError:
        raise HttpError(404, "Thread not found")
    return {"job_id": job_id}


@router.get("/threads", response=ThreadListResponse, summary="List assistant threads")
def get_threads(request, limit: int = 50, status: str = "regular", user_id: str | None = None) -> dict[str, list[JsonDict]]:
    if status not in {"regular", "archived"}:
        raise HttpError(400, "Invalid thread status")
    threads = [_thread_response(record) for record in list_threads(limit=limit, status=status, user_id=user_id)]
    return {"threads": threads}


@router.post("/threads", response=ThreadSummaryResponse, summary="Create assistant thread")
def post_thread(request, body: ThreadCreateRequest) -> JsonDict:
    return _thread_response(create_thread(user_id=body.user_id, title=body.title))


@router.get("/threads/{thread_id}", response=ThreadDetailResponse, summary="Get assistant thread")
def get_thread_detail(request, thread_id: str, limit: int = 200) -> JsonDict:
    record = _require_thread(thread_id)
    response = _thread_response(record)
    response["messages"] = [_message_response(message) for message in list_thread_messages(thread_id, limit=limit)]
    return response


@router.patch("/threads/{thread_id}", response=ThreadSummaryResponse, summary="Rename assistant thread")
def patch_thread(request, thread_id: str, body: ThreadRenameRequest) -> JsonDict:
    _ = _require_thread(thread_id)
    record = rename_thread(thread_id, body.title)
    if record is None:
        raise HttpError(404, "Thread not found")
    return _thread_response(record)


@router.post("/threads/{thread_id}/archive", response=ThreadSummaryResponse, summary="Archive assistant thread")
def post_thread_archive(request, thread_id: str) -> JsonDict:
    _ = _require_thread(thread_id)
    record = archive_thread(thread_id)
    if record is None:
        raise HttpError(404, "Thread not found")
    return _thread_response(record)


@router.delete("/threads/{thread_id}", response=ThreadSummaryResponse, summary="Delete assistant thread")
def remove_thread(request, thread_id: str) -> JsonDict:
    _ = _require_thread(thread_id)
    record = delete_thread(thread_id)
    if record is None:
        raise HttpError(404, "Thread not found")
    return _thread_response(record)


@router.get("/jobs/{job_id}", response=JobStatusResponse, summary="Get agent job status")
def job_status(request, job_id: str) -> JsonDict:
    return job_status_payload(job_id)


@router.post("/jobs/{job_id}/cancel", response=JobStatusResponse, summary="Cancel agent job")
def post_job_cancel(request, job_id: str) -> JsonDict:
    return cancel_job(job_id)


@router.get("/jobs/{job_id}/events", summary="Stream agent job status events")
async def job_events(request, job_id: str):
    cursor = _sse_cursor(request)

    async def stream():
        deadline = time.monotonic() + _SSE_TIMEOUT_SECONDS
        last_cursor = cursor

        while time.monotonic() < deadline:
            payload: JsonDict = await sync_to_async(
                job_status_payload, thread_sensitive=False
            )(job_id)
            status = payload.get("status")

            events = await sync_to_async(list_job_events, thread_sensitive=False)(
                job_id, last_cursor
            )
            for job_event in events:
                last_cursor = job_event["id"]
                data = job_event if job_event["type"] == "tool" else job_event["data"]
                yield _sse_event(job_event["type"], data, last_cursor)

            if status in {"completed", "failed", "cancelled"}:
                if not events and last_cursor == 0:
                    yield _sse_event(status, payload)
                return

            await asyncio.sleep(_SSE_POLL_SECONDS)

    response = StreamingHttpResponse(stream(), content_type="text/event-stream")
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response


@router.get("/health", summary="Health check")
def health(request) -> dict[str, Any]:
    return {
        "status": "ok",
        "jobs_db": jobs_db_available(),
        "executor": executor_available(),
        "openrouter_api_key_configured": bool(OPENROUTER_API_KEY),
    }
