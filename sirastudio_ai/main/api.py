import json
import os
import time

from django.http import StreamingHttpResponse
from ninja import Router
from ninja.errors import HttpError

from .agent import (
    EditRequest,
    JobCreateResponse,
    JobStatusResponse,
    ThreadCreateRequest,
    ThreadDetailResponse,
    ThreadListResponse,
    ThreadRenameRequest,
    ThreadSummaryResponse,
)

from .agent.llm import OPENROUTER_API_KEY
from .jobs import (
    archive_thread,
    create_job,
    create_thread,
    delete_thread,
    executor_available,
    get_job,
    get_thread,
    jobs_db_available,
    list_job_events,
    list_thread_messages,
    list_threads,
    rename_thread,
)

router = Router()

_SSE_TIMEOUT_SECONDS = 120
_SSE_POLL_SECONDS = 0.8


def _thread_response(record: dict) -> dict:
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


def _message_response(record: dict) -> dict:
    return {
        "id": record.get("id"),
        "thread_id": record.get("thread_id"),
        "role": record.get("role"),
        "content": record.get("content") or "",
        "status": record.get("status") or "completed",
        "created_at": record.get("created_at"),
        "updated_at": record.get("updated_at"),
        "job_id": record.get("job_id"),
        "run_id": record.get("run_id"),
        "error": record.get("error"),
    }


def _require_thread(thread_id: str) -> dict:
    if not thread_id.strip():
        raise HttpError(400, "thread_id is required")
    record = get_thread(thread_id)
    if record is None:
        raise HttpError(404, "Thread not found")
    return record


def _job_status_payload(job_id: str) -> dict:
    record = get_job(job_id)
    if record is None:
        return {"job_id": job_id, "status": "failed", "error": "Job not found"}

    status = record.get("status")
    cv = None
    revision_mismatch = None
    if status == "completed":
        cv_json = record.get("cv_json")
        if cv_json:
            cv = json.loads(cv_json)
        revision_mismatch = bool(record.get("revision_mismatch"))

    return {
        "job_id": job_id,
        "status": status,
        "created_at": record.get("created_at"),
        "updated_at": record.get("updated_at"),
        "thread_id": record.get("thread_id"),
        "message_preview": record.get("message_preview"),
        "reply": record.get("reply"),
        "cv": cv,
        "run_id": record.get("run_id"),
        "revision_mismatch": revision_mismatch,
        "error": record.get("error") if status == "failed" else None,
        "error_code": record.get("error_code") if status == "failed" else None,
    }


def _sse_event(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.post("/edit", response=JobCreateResponse, summary="Edit CV via AI agent")
def edit_cv(request, body: EditRequest):
    job_id = create_job(
        body.cv,
        body.message,
        body.thread_id,
        body.user_id,
        body.checkpoint_id,
        body.revision,
    )
    return {"job_id": job_id}


@router.get("/threads", response=ThreadListResponse, summary="List assistant threads")
def get_threads(request, limit: int = 50, status: str = "regular", user_id: str | None = None):
    if status not in {"regular", "archived", "deleted"}:
        raise HttpError(400, "Invalid thread status")
    threads = [_thread_response(record) for record in list_threads(limit=limit, status=status, user_id=user_id)]
    return {"threads": threads}


@router.post("/threads", response=ThreadSummaryResponse, summary="Create assistant thread")
def post_thread(request, body: ThreadCreateRequest):
    return _thread_response(create_thread(user_id=body.user_id, title=body.title))


@router.get("/threads/{thread_id}", response=ThreadDetailResponse, summary="Get assistant thread")
def get_thread_detail(request, thread_id: str, limit: int = 200):
    record = _require_thread(thread_id)
    response = _thread_response(record)
    response["messages"] = [_message_response(message) for message in list_thread_messages(thread_id, limit=limit)]
    return response


@router.patch("/threads/{thread_id}", response=ThreadSummaryResponse, summary="Rename assistant thread")
def patch_thread(request, thread_id: str, body: ThreadRenameRequest):
    _require_thread(thread_id)
    record = rename_thread(thread_id, body.title)
    if record is None:
        raise HttpError(404, "Thread not found")
    return _thread_response(record)


@router.post("/threads/{thread_id}/archive", response=ThreadSummaryResponse, summary="Archive assistant thread")
def post_thread_archive(request, thread_id: str):
    _require_thread(thread_id)
    record = archive_thread(thread_id)
    if record is None:
        raise HttpError(404, "Thread not found")
    return _thread_response(record)


@router.delete("/threads/{thread_id}", response=ThreadSummaryResponse, summary="Delete assistant thread")
def remove_thread(request, thread_id: str):
    _require_thread(thread_id)
    record = delete_thread(thread_id)
    if record is None:
        raise HttpError(404, "Thread not found")
    return _thread_response(record)


@router.get("/jobs/{job_id}", response=JobStatusResponse, summary="Get agent job status")
def job_status(request, job_id: str):
    return _job_status_payload(job_id)


@router.get("/jobs/{job_id}/events", summary="Stream agent job status events")
def job_events(request, job_id: str):
    def stream():
        deadline = time.monotonic() + _SSE_TIMEOUT_SECONDS
        last_marker = None
        last_event_id = None

        while time.monotonic() < deadline:
            payload = _job_status_payload(job_id)
            marker = (payload.get("status"), payload.get("updated_at"))
            status = payload.get("status")

            for job_event in list_job_events(job_id, after_id=last_event_id):
                last_event_id = job_event["id"]
                yield _sse_event(job_event["type"], job_event)

            if marker != last_marker:
                last_marker = marker
                event = status if status in {"completed", "failed"} else "job"
                yield _sse_event(event, payload)

            if status in {"completed", "failed"}:
                return

            time.sleep(_SSE_POLL_SECONDS)

        yield _sse_event("failed", {"job_id": job_id, "status": "failed", "error": "Agent job timed out."})

    response = StreamingHttpResponse(stream(), content_type="text/event-stream")
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response


@router.get("/health", summary="Health check")
def health(request):
    return {
        "status": "ok",
        "jobs_db": jobs_db_available(),
        "executor": executor_available(),
        "openrouter_api_key_configured": bool(OPENROUTER_API_KEY),
        "store_mode": os.getenv("CV_MAKER_STORE", "memory"),
    }
