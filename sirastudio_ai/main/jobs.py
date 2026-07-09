import json
import logging
import os
import sqlite3
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .agent import run_agent
from .agent_logging import log_content

JsonDict = dict[str, Any]

logger = logging.getLogger("agent_logger")

_db_path = Path.home() / ".cv-maker" / "agent-jobs.sqlite"
_MAX_PENDING_JOBS_ENV = "CV_MAKER_MAX_PENDING_JOBS"
_MAX_RUNNING_JOBS_ENV = "CV_MAKER_MAX_RUNNING_JOBS"
_MAX_WORKERS_ENV = "CV_MAKER_JOB_WORKERS"
_DEFAULT_MAX_PENDING_JOBS = 20
_DEFAULT_MAX_RUNNING_JOBS = 2
_MESSAGE_PREVIEW_LENGTH = 180
_THREAD_TITLE_LENGTH = 64
JOB_INTERRUPTED = "JOB_INTERRUPTED"
JOB_INTERRUPTED_MESSAGE = "The agent job was interrupted while the service restarted. Please try again."
_FAILURE_MESSAGES = {
    "AGENT_FAILED": "The agent could not complete your request. Please try again.",
    JOB_INTERRUPTED: JOB_INTERRUPTED_MESSAGE,
}

_LOCK = threading.RLock()
_db_ready = False


class ThreadNotFoundError(Exception):
    """Raised when a terminal thread is used as a job target."""


def _positive_env_int(name: str, default: int) -> int:
    try:
        return max(1, int(os.getenv(name, str(default))))
    except ValueError:
        logger.warning("Invalid %s value; using %s", name, default)
        return default


_MAX_PENDING_JOBS = _positive_env_int(_MAX_PENDING_JOBS_ENV, _DEFAULT_MAX_PENDING_JOBS)
_MAX_RUNNING_JOBS = _positive_env_int(
    _MAX_RUNNING_JOBS_ENV,
    _positive_env_int(_MAX_WORKERS_ENV, _DEFAULT_MAX_RUNNING_JOBS),
)
_EXECUTOR = ThreadPoolExecutor(max_workers=_MAX_RUNNING_JOBS)


class JobCapacityExceeded(Exception):
    code = "JOB_CAPACITY_EXCEEDED"
    message = "Agent job capacity is currently full. Please try again shortly."


def get_db_path() -> Path:
    return _db_path


def set_db_path(path: Path) -> None:
    global _db_path, _db_ready
    _db_path = path
    _db_ready = False


def reset_job_events() -> None:
    _init_db()
    with _LOCK:
        conn = _connect()
        _ = conn.execute("DELETE FROM agent_job_events")
        conn.commit()
        conn.close()


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def failure_message(error_code: str) -> str:
    return _FAILURE_MESSAGES.get(error_code, _FAILURE_MESSAGES["AGENT_FAILED"])


def append_job_event(job_id: str, event_type: str, data: JsonDict) -> JsonDict:
    _init_db()
    with _LOCK:
        conn = _connect()
        event = _insert_job_event(conn, job_id, event_type, data)
        conn.commit()
        conn.close()
    return event


def list_job_events(job_id: str, after_cursor: int | str | None = None) -> list[JsonDict]:
    _init_db()
    try:
        cursor = max(0, int(after_cursor or 0))
    except (TypeError, ValueError):
        cursor = 0
    conn = _connect()
    rows = conn.execute(
        """
        SELECT id, job_id, event_type, created_at, data_json
        FROM agent_job_events
        WHERE job_id = ? AND id > ?
        ORDER BY id ASC
        """,
        (job_id, cursor),
    ).fetchall()
    conn.close()
    return [_job_event_from_row(row) for row in rows]


def _connect() -> sqlite3.Connection:
    _db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(_db_path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def _job_event_from_row(row: sqlite3.Row) -> JsonDict:
    return {
        "id": row["id"],
        "job_id": row["job_id"],
        "type": row["event_type"],
        "created_at": row["created_at"],
        "data": json.loads(row["data_json"]),
    }


def _insert_job_event(
    conn: sqlite3.Connection, job_id: str, event_type: str, data: JsonDict
) -> JsonDict:
    created_at = _utc_now()
    cursor = conn.execute(
        """
        INSERT INTO agent_job_events (job_id, event_type, created_at, data_json)
        VALUES (?, ?, ?, ?)
        """,
        (job_id, event_type, created_at, json.dumps(data, ensure_ascii=False)),
    )
    return {
        "id": cursor.lastrowid,
        "job_id": job_id,
        "type": event_type,
        "created_at": created_at,
        "data": data,
    }


def _init_db() -> None:
    global _db_ready
    if _db_ready:
        return
    with _LOCK:
        if _db_ready:
            return
        conn = _connect()
        _ = conn.execute(
            """
            CREATE TABLE IF NOT EXISTS agent_jobs (
                id TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                thread_id TEXT NOT NULL,
                user_id TEXT,
                message TEXT NOT NULL,
                cv_json TEXT NOT NULL,
                reply TEXT,
                run_id TEXT,
                error TEXT,
                revision_mismatch INTEGER NOT NULL DEFAULT 0,
                checkpoint_id TEXT
            )
            """
        )
        cursor = conn.execute("PRAGMA table_info(agent_jobs)")
        columns = {row["name"] for row in cursor.fetchall()}
        if "checkpoint_id" not in columns:
            _ = conn.execute("ALTER TABLE agent_jobs ADD COLUMN checkpoint_id TEXT")
        if "input_revision" not in columns:
            _ = conn.execute("ALTER TABLE agent_jobs ADD COLUMN input_revision INTEGER")
        if "message_preview" not in columns:
            _ = conn.execute("ALTER TABLE agent_jobs ADD COLUMN message_preview TEXT")
        if "error_code" not in columns:
            _ = conn.execute("ALTER TABLE agent_jobs ADD COLUMN error_code TEXT")
        _ = conn.execute(
            "CREATE INDEX IF NOT EXISTS agent_jobs_status_idx ON agent_jobs(status)"
        )
        _ = conn.execute(
            """
            CREATE TABLE IF NOT EXISTS agent_job_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                created_at TEXT NOT NULL,
                data_json TEXT NOT NULL
            )
            """
        )
        _ = conn.execute(
            "CREATE INDEX IF NOT EXISTS agent_job_events_job_cursor_idx ON agent_job_events(job_id, id)"
        )
        _ = conn.execute(
            """
            CREATE TABLE IF NOT EXISTS agent_threads (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                title TEXT,
                status TEXT NOT NULL DEFAULT 'regular',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                last_message_at TEXT,
                last_job_id TEXT
            )
            """
        )
        _ = conn.execute(
            """
            CREATE TABLE IF NOT EXISTS agent_messages (
                id TEXT PRIMARY KEY,
                thread_id TEXT NOT NULL,
                job_id TEXT,
                run_id TEXT,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'completed',
                parent_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                error TEXT
            )
            """
        )
        _ = conn.execute(
            "CREATE INDEX IF NOT EXISTS agent_threads_status_updated_idx ON agent_threads(status, updated_at)"
        )
        _ = conn.execute(
            "CREATE INDEX IF NOT EXISTS agent_threads_user_updated_idx ON agent_threads(user_id, updated_at)"
        )
        _ = conn.execute(
            "CREATE INDEX IF NOT EXISTS agent_messages_thread_created_idx ON agent_messages(thread_id, created_at)"
        )
        _ = conn.execute(
            "CREATE INDEX IF NOT EXISTS agent_messages_job_idx ON agent_messages(job_id)"
        )
        conn.commit()
        conn.close()
        _db_ready = True


def _job_status_payload_from_record(job_id: str, record: JsonDict | None) -> JsonDict:
    if record is None:
        return {
            "job_id": job_id,
            "status": "failed",
            "error": "Job not found.",
            "error_code": "JOB_NOT_FOUND",
        }

    status = record.get("status")
    cv = None
    revision_mismatch = None
    if status == "completed":
        cv_json = record.get("cv_json")
        if cv_json:
            cv = json.loads(cv_json)
        revision_mismatch = bool(record.get("revision_mismatch"))

    error_code = record.get("error_code") if status == "failed" else None
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
        "error": failure_message(error_code or "AGENT_FAILED") if status == "failed" else None,
        "error_code": error_code or "AGENT_FAILED" if status == "failed" else None,
    }


def _set_job_status(job_id: str, status: str, **fields: Any) -> JsonDict | None:
    _init_db()
    fields["status"] = status
    fields["updated_at"] = _utc_now()
    columns = ", ".join(f"{key} = ?" for key in fields.keys())
    with _LOCK:
        conn = _connect()
        _ = conn.execute(
            f"UPDATE agent_jobs SET {columns} WHERE id = ?", [*fields.values(), job_id]
        )
        row = conn.execute("SELECT * FROM agent_jobs WHERE id = ?", (job_id,)).fetchone()
        if row is None:
            conn.close()
            return None
        payload = _job_status_payload_from_record(job_id, dict(row))
        event_type = status if status in {"completed", "failed"} else "job"
        _insert_job_event(conn, job_id, event_type, payload)
        conn.commit()
        conn.close()
    return payload


def _message_preview(message: str) -> str:
    return " ".join((message or "").split())[:_MESSAGE_PREVIEW_LENGTH]


def _thread_title(message: str) -> str:
    preview = _message_preview(message)
    if len(preview) <= _THREAD_TITLE_LENGTH:
        return preview or "New chat"
    return f"{preview[: _THREAD_TITLE_LENGTH - 1].rstrip()}…"


def _clamp_limit(limit: int, maximum: int = 100) -> int:
    return max(1, min(limit, maximum))


def _last_message_id(conn: sqlite3.Connection, thread_id: str) -> str | None:
    row = conn.execute(
        "SELECT id FROM agent_messages WHERE thread_id = ? ORDER BY created_at DESC LIMIT 1",
        (thread_id,),
    ).fetchone()
    return row["id"] if row else None


def _thread_summary(conn: sqlite3.Connection, thread_id: str) -> JsonDict | None:
    row = conn.execute("SELECT * FROM agent_threads WHERE id = ?", (thread_id,)).fetchone()
    if row is None:
        return None
    summary = dict(row)
    message = conn.execute(
        """
        SELECT m.content, m.status, j.error_code AS job_error_code
        FROM agent_messages m
        LEFT JOIN agent_jobs j ON j.id = m.job_id
        WHERE m.thread_id = ? AND m.content != ''
        ORDER BY m.created_at DESC LIMIT 1
        """,
        (thread_id,),
    ).fetchone()
    if message and message["status"] == "failed":
        content = failure_message(message["job_error_code"] or "AGENT_FAILED")
    else:
        content = message["content"] if message else ""
    summary["message_preview"] = _message_preview(content) or None
    return summary


def ensure_thread(thread_id: str, user_id: str | None = None, title: str | None = None) -> JsonDict:
    if not thread_id or not thread_id.strip():
        raise ValueError("thread_id is required")
    _init_db()
    now = _utc_now()
    with _LOCK:
        conn = _connect()
        row = conn.execute("SELECT * FROM agent_threads WHERE id = ?", (thread_id,)).fetchone()
        if row is None:
            _ = conn.execute(
                """
                INSERT INTO agent_threads (id, user_id, title, status, created_at, updated_at)
                VALUES (?, ?, ?, 'regular', ?, ?)
                """,
                (thread_id, user_id, title, now, now),
            )
        else:
            if row["status"] == "deleted":
                conn.close()
                raise ThreadNotFoundError("Thread not found")
            fields = {"updated_at": now}
            if user_id and not row["user_id"]:
                fields["user_id"] = user_id
            if title and not row["title"]:
                fields["title"] = title
            columns = ", ".join(f"{key} = ?" for key in fields.keys())
            _ = conn.execute(
                f"UPDATE agent_threads SET {columns} WHERE id = ?",
                [*fields.values(), thread_id],
            )
        conn.commit()
        summary = _thread_summary(conn, thread_id)
        conn.close()
    return summary or {"id": thread_id}


def create_thread(user_id: str | None = None, title: str | None = None) -> JsonDict:
    thread_id = uuid.uuid4().hex
    return ensure_thread(thread_id, user_id=user_id, title=title or "New chat")


def list_threads(limit: int = 50, status: str = "regular", user_id: str | None = None) -> list[JsonDict]:
    if status == "deleted":
        return []
    _init_db()
    limit = _clamp_limit(limit)
    params: list[object] = [status]
    user_clause = ""
    if user_id:
        user_clause = " AND user_id = ?"
        params.append(user_id)
    params.append(limit)
    conn = _connect()
    rows = conn.execute(
        f"""
        SELECT t.*,
            (SELECT m.content FROM agent_messages m WHERE m.thread_id = t.id AND m.content != '' ORDER BY m.created_at DESC LIMIT 1) AS message_preview,
            (SELECT m.status FROM agent_messages m WHERE m.thread_id = t.id AND m.content != '' ORDER BY m.created_at DESC LIMIT 1) AS message_status,
            (SELECT j.error_code FROM agent_messages m LEFT JOIN agent_jobs j ON j.id = m.job_id WHERE m.thread_id = t.id AND m.content != '' ORDER BY m.created_at DESC LIMIT 1) AS job_error_code
        FROM agent_threads t
        WHERE t.status = ?{user_clause}
        ORDER BY COALESCE(t.last_message_at, t.updated_at) DESC
        LIMIT ?
        """,
        params,
    ).fetchall()
    conn.close()
    result = []
    for row in rows:
        item = dict(row)
        if item.get("message_status") == "failed":
            content = failure_message(item.get("job_error_code") or "AGENT_FAILED")
        else:
            content = item.get("message_preview") or ""
        item["message_preview"] = _message_preview(content) or None
        result.append(item)
    return result


def get_thread(thread_id: str) -> JsonDict | None:
    _init_db()
    conn = _connect()
    summary = _thread_summary(conn, thread_id)
    conn.close()
    if summary and summary["status"] == "deleted":
        return None
    return summary


def rename_thread(thread_id: str, title: str) -> JsonDict | None:
    _init_db()
    with _LOCK:
        conn = _connect()
        cursor = conn.execute(
            "UPDATE agent_threads SET title = ?, updated_at = ? WHERE id = ? AND status != 'deleted'",
            (title.strip(), _utc_now(), thread_id),
        )
        conn.commit()
        summary = _thread_summary(conn, thread_id) if cursor.rowcount else None
        conn.close()
    return summary


def archive_thread(thread_id: str) -> JsonDict | None:
    return _set_thread_status(thread_id, "archived")


def delete_thread(thread_id: str) -> JsonDict | None:
    return _set_thread_status(thread_id, "deleted")


def _set_thread_status(thread_id: str, status: str) -> JsonDict | None:
    _init_db()
    with _LOCK:
        conn = _connect()
        cursor = conn.execute(
            "UPDATE agent_threads SET status = ?, updated_at = ? WHERE id = ? AND status != 'deleted'",
            (status, _utc_now(), thread_id),
        )
        conn.commit()
        summary = _thread_summary(conn, thread_id) if cursor.rowcount else None
        conn.close()
    return summary


def list_thread_messages(thread_id: str, limit: int = 200) -> list[JsonDict]:
    _init_db()
    limit = _clamp_limit(limit, maximum=500)
    conn = _connect()
    thread = conn.execute("SELECT status FROM agent_threads WHERE id = ?", (thread_id,)).fetchone()
    if thread is None or thread["status"] == "deleted":
        conn.close()
        return []
    rows = conn.execute(
        """
        SELECT m.*, j.error_code AS job_error_code
        FROM agent_messages m
        LEFT JOIN agent_jobs j ON j.id = m.job_id
        WHERE m.thread_id = ?
        ORDER BY m.created_at ASC
        LIMIT ?
        """,
        (thread_id, limit),
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]


def append_thread_message(
    thread_id: str,
    role: str,
    content: str,
    *,
    job_id: str | None = None,
    run_id: str | None = None,
    status: str = "completed",
    error: str | None = None,
) -> JsonDict | None:
    _init_db()
    now = _utc_now()
    message_id = uuid.uuid4().hex
    with _LOCK:
        conn = _connect()
        thread = conn.execute("SELECT status FROM agent_threads WHERE id = ?", (thread_id,)).fetchone()
        if thread is None or thread["status"] == "deleted":
            conn.close()
            return None
        parent_id = _last_message_id(conn, thread_id)
        _ = conn.execute(
            """
            INSERT INTO agent_messages (
                id, thread_id, job_id, run_id, role, content, status, parent_id, created_at, updated_at, error
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (message_id, thread_id, job_id, run_id, role, content, status, parent_id, now, now, error),
        )
        _ = conn.execute(
            """
            UPDATE agent_threads
            SET last_message_at = ?, updated_at = ?, last_job_id = COALESCE(?, last_job_id)
            WHERE id = ?
            """,
            (now, now, job_id, thread_id),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM agent_messages WHERE id = ?", (message_id,)).fetchone()
        conn.close()
    return dict(row)


def update_message_status(
    message_id: str,
    status: str,
    content: str | None = None,
    error: str | None = None,
    run_id: str | None = None,
) -> JsonDict | None:
    _init_db()
    fields: dict[str, object | None] = {"status": status, "updated_at": _utc_now()}
    if content is not None:
        fields["content"] = content
    if error is not None:
        fields["error"] = error
    if run_id is not None:
        fields["run_id"] = run_id
    columns = ", ".join(f"{key} = ?" for key in fields.keys())
    with _LOCK:
        conn = _connect()
        _ = conn.execute(f"UPDATE agent_messages SET {columns} WHERE id = ?", [*fields.values(), message_id])
        conn.commit()
        row = conn.execute("SELECT * FROM agent_messages WHERE id = ?", (message_id,)).fetchone()
        conn.close()
    return dict(row) if row else None


def _mark_failed(job_id: str, error_code: str) -> None:
    job = get_job(job_id)
    error = failure_message(error_code)
    if job is None or job.get("status") in {"completed", "failed"}:
        return
    _set_job_status(job_id, "failed", error=error, error_code=error_code)
    append_thread_message(
        job["thread_id"],
        "assistant",
        error or "Agent job failed.",
        job_id=job_id,
        run_id=job.get("run_id"),
        status="failed",
        error=error,
    )


def _mark_completed(job_id: str, result: JsonDict) -> None:
    job = get_job(job_id)
    if job is None or job.get("status") in {"completed", "failed"}:
        return
    metadata = result.get("metadata", {})
    revision_mismatch = 1 if metadata.get("revision_mismatch") else 0
    reply = result.get("reply") or ""
    cv_json = json.dumps(result.get("cv") or {}, ensure_ascii=False)
    _set_job_status(
        job_id,
        "completed",
        reply=reply,
        cv_json=cv_json,
        run_id=result.get("run_id"),
        revision_mismatch=revision_mismatch,
        error=None,
        error_code=None,
    )
    append_thread_message(
        job["thread_id"],
        "assistant",
        reply or "Done.",
        job_id=job_id,
        run_id=result.get("run_id"),
        status="completed",
    )


def _run_job(
    job_id: str,
    cv: JsonDict,
    message: str,
    thread_id: str,
    user_id: str | None,
    checkpoint_id: str | None,
    input_revision: int | None,
) -> JsonDict:
    run_id = uuid.uuid4().hex
    _set_job_status(job_id, "running", run_id=run_id)
    logger.info("AGENT_JOB_START | job_id=%s thread_id=%s run_id=%s", job_id, thread_id, run_id)
    return run_agent(
        cv,
        message,
        thread_id,
        run_id=run_id,
        user_id=user_id,
        checkpoint_id=checkpoint_id,
        input_revision=input_revision,
        on_tool_event=lambda event: append_job_event(job_id, "tool", event),  # pyrefly: ignore
    )


def _on_job_done(job_id: str, future: Any) -> None:
    if future.cancelled():
        _mark_failed(job_id, "JOB_INTERRUPTED")
        logger.warning("AGENT_JOB_CANCELLED | job_id=%s", job_id)
        return
    error = future.exception()
    if error is not None:
        _mark_failed(job_id, "AGENT_FAILED")
        logger.warning(
            "AGENT_JOB_FAILED | job_id=%s | exception_type=%s",
            job_id,
            type(error).__name__,
        )
        log_content(
            logger,
            "job_failure",
            job_id=job_id,
            exception_type=type(error).__name__,
            exception_detail=str(error),
        )
        return
    result = future.result()
    _mark_completed(job_id, result)
    logger.info("AGENT_JOB_DONE | job_id=%s run_id=%s", job_id, result.get("run_id"))


def create_job(
    cv: JsonDict,
    message: str,
    thread_id: str,
    user_id: str | None = None,
    checkpoint_id: str | None = None,
    input_revision: int | None = None,
) -> str:
    _init_db()
    job_id = uuid.uuid4().hex
    now = _utc_now()
    cv_json = json.dumps(cv or {}, ensure_ascii=False)
    preview = _message_preview(message)
    with _LOCK:
        conn = _connect()
        counts = {
            row["status"]: row["count"]
            for row in conn.execute(
                "SELECT status, COUNT(*) AS count FROM agent_jobs WHERE status IN ('queued', 'running') GROUP BY status"
            ).fetchall()
        }
        conn.close()
        if (
            counts.get("running", 0) >= _MAX_RUNNING_JOBS
            or counts.get("queued", 0) >= _MAX_PENDING_JOBS
        ):
            raise JobCapacityExceeded

        _ = ensure_thread(thread_id, user_id=user_id)
        conn = _connect()
        thread = conn.execute("SELECT title, status FROM agent_threads WHERE id = ?", (thread_id,)).fetchone()
        if thread is None or thread["status"] == "deleted":
            conn.close()
            raise ThreadNotFoundError("Thread not found")
        if not thread["title"] or thread["title"] == "New chat":
            _ = conn.execute(
                "UPDATE agent_threads SET title = ?, updated_at = ? WHERE id = ?",
                (_thread_title(message), now, thread_id),
            )
        _ = conn.execute(
            """
            INSERT INTO agent_jobs (
                id, status, created_at, updated_at, thread_id, user_id, message, cv_json,
                checkpoint_id, input_revision, message_preview
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                job_id,
                "queued",
                now,
                now,
                thread_id,
                user_id,
                message,
                cv_json,
                checkpoint_id,
                input_revision,
                preview,
            ),
        )
        parent_id = _last_message_id(conn, thread_id)
        _ = conn.execute(
            """
            INSERT INTO agent_messages (
                id, thread_id, job_id, role, content, status, parent_id, created_at, updated_at
            ) VALUES (?, ?, ?, 'user', ?, 'completed', ?, ?, ?)
            """,
            (uuid.uuid4().hex, thread_id, job_id, message, parent_id, now, now),
        )
        _ = conn.execute(
            """
            UPDATE agent_threads
            SET last_message_at = ?, updated_at = ?, last_job_id = ?
            WHERE id = ?
            """,
            (now, now, job_id, thread_id),
        )
        row = conn.execute("SELECT * FROM agent_jobs WHERE id = ?", (job_id,)).fetchone()
        if row is not None:
            _insert_job_event(
                conn,
                job_id,
                "job",
                _job_status_payload_from_record(job_id, dict(row)),
            )
        conn.commit()
        conn.close()

    future = _EXECUTOR.submit(_run_job, job_id, cv, message, thread_id, user_id, checkpoint_id, input_revision)
    future.add_done_callback(lambda f: _on_job_done(job_id, f))
    return job_id


def get_job(job_id: str) -> JsonDict | None:
    _init_db()
    conn = _connect()
    row = conn.execute("SELECT * FROM agent_jobs WHERE id = ?", (job_id,)).fetchone()
    conn.close()
    if row is None:
        return None
    return dict(row)


def job_status_payload(job_id: str) -> JsonDict:
    return _job_status_payload_from_record(job_id, get_job(job_id))


def recover_interrupted_jobs() -> int:
    _init_db()
    conn = _connect()
    rows = conn.execute(
        "SELECT id FROM agent_jobs WHERE status IN ('queued', 'running')"
    ).fetchall()
    conn.close()
    for row in rows:
        _mark_failed(row["id"], JOB_INTERRUPTED)
    return len(rows)


def list_recent_jobs(limit: int = 50) -> list[JsonDict]:
    _init_db()
    conn = _connect()
    rows = conn.execute(
        "SELECT * FROM agent_jobs ORDER BY updated_at DESC LIMIT ?",
        (limit,),
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]


def jobs_db_available() -> bool:
    _init_db()
    conn = _connect()
    _ = conn.execute("SELECT 1").fetchone()
    conn.close()
    return True


def executor_available() -> bool:
    return not getattr(_EXECUTOR, "_shutdown", False)
