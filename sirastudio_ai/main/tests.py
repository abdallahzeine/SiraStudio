import asyncio
import json
import tempfile
import time
from concurrent.futures import Future
from pathlib import Path
from typing import Any, override
from unittest.mock import patch

from django.test import Client, TestCase, override_settings

from . import jobs


class CVDocumentApiTests(TestCase):
    def setUp(self):
        self.client = Client()

    def test_cv_document_crud_revision_conflict_and_archive(self):
        create = self.client.post(
            "/api/cv-documents",
            data=json.dumps(
                {
                    "title": "Ada CV",
                    "cv": self._cv(template="classic"),
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(create.status_code, 201)
        created = create.json()
        document_id = created["id"]
        self.assertEqual(created["title"], "Ada CV")
        self.assertEqual(created["revision"], 1)
        self.assertEqual(created["cv"]["template"], "classic")

        listed = self.client.get("/api/cv-documents")
        self.assertEqual(listed.status_code, 200)
        self.assertTrue(any(item["id"] == document_id for item in listed.json()["documents"]))

        retrieved = self.client.get(f"/api/cv-documents/{document_id}")
        self.assertEqual(retrieved.status_code, 200)
        self.assertEqual(retrieved.json()["id"], document_id)

        update = self.client.put(
            f"/api/cv-documents/{document_id}",
            data=json.dumps(
                {
                    "title": "Ada Updated CV",
                    "cv": self._cv(template="modern"),
                    "base_revision": 1,
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(update.status_code, 200)
        updated = update.json()
        self.assertEqual(updated["title"], "Ada Updated CV")
        self.assertEqual(updated["revision"], 2)
        self.assertEqual(updated["cv"]["template"], "modern")

        conflict = self.client.put(
            f"/api/cv-documents/{document_id}",
            data=json.dumps(
                {
                    "cv": self._cv(template="compact"),
                    "base_revision": 1,
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(conflict.status_code, 409)
        self.assertIn("Revision conflict", conflict.json()["detail"])

        deleted = self.client.delete(f"/api/cv-documents/{document_id}")
        self.assertEqual(deleted.status_code, 200)
        self.assertEqual(deleted.json()["id"], document_id)

        listed_after_delete = self.client.get("/api/cv-documents")
        self.assertEqual(listed_after_delete.status_code, 200)
        self.assertFalse(any(item["id"] == document_id for item in listed_after_delete.json()["documents"]))

        retrieved_after_delete = self.client.get(f"/api/cv-documents/{document_id}")
        self.assertEqual(retrieved_after_delete.status_code, 404)

    def test_cv_document_create_requires_shallow_cv_shape(self):
        cases = [
            {"cv": ["not", "an", "object"]},
            {"cv": {"header": {}, "sections": []}},
            {"cv": {"header": {}, "sections": {}, "template": "classic"}},
        ]

        for body in cases:
            with self.subTest(body=body):
                response = self.client.post(
                    "/api/cv-documents",
                    data=json.dumps(body),
                    content_type="application/json",
                )
                self.assertEqual(response.status_code, 422)

    def _cv(self, template: str = "classic") -> dict:
        return {
            "header": {"name": "Ada Lovelace"},
            "sections": [],
            "template": template,
        }


class AgentBackendSmokeTests(TestCase):
    client: Any = None
    tmp: Any = None
    old_db_path: Path = Path()

    @override
    def setUp(self) -> None:
        self.client = Client()
        self.tmp = tempfile.TemporaryDirectory()
        self.old_db_path = jobs.get_db_path()
        jobs.set_db_path(Path(self.tmp.name) / "agent-jobs.sqlite")
        jobs.reset_job_events()

    @override
    def tearDown(self) -> None:
        jobs.set_db_path(self.old_db_path)
        jobs.reset_job_events()
        self.tmp.cleanup()

    def test_agent_routes_job_and_sse_smoke(self) -> None:
        def fake_run_agent(
            cv: dict[str, Any],
            message: str,
            thread_id: str,
            run_id: str | None = None,
            on_tool_event: Any = None,
            **kwargs: Any,
        ) -> dict[str, Any]:
            if on_tool_event:
                on_tool_event({"id": "tool-1", "name": "read_cv", "status": "completed"})
            return {"cv": cv, "reply": "Done.", "run_id": run_id or "run-1", "metadata": {}}

        with patch("main.jobs.run_agent", fake_run_agent):
            health: Any = self.client.get("/api/agent/health")
            self.assertEqual(health.status_code, 200)
            self.assertTrue(health.json()["jobs_db"])

            thread: Any = self.client.post(
                "/api/agent/threads",
                data=json.dumps({"title": "Smoke"}),
                content_type="application/json",
            )
            self.assertEqual(thread.status_code, 200)
            thread_id = thread.json()["thread_id"]

            listed: Any = self.client.get("/api/agent/threads")
            self.assertEqual(listed.status_code, 200)
            self.assertTrue(any(item["thread_id"] == thread_id for item in listed.json()["threads"]))

            edit: Any = self.client.post(
                "/api/agent/edit",
                data=json.dumps(
                    {
                        "cv": {"header": {}, "sections": []},
                        "message": "Read my CV",
                        "thread_id": thread_id,
                        "revision": 1,
                    }
                ),
                content_type="application/json",
            )
            self.assertEqual(edit.status_code, 200)
            job_id = edit.json()["job_id"]

            status = self._wait_for_job(job_id)
            self.assertEqual(status["status"], "completed")
            self.assertEqual(status["reply"], "Done.")
            self.assertEqual(status["cv"], {"header": {}, "sections": []})

            events: Any = self.client.get(f"/api/agent/jobs/{job_id}/events")
            body = self._sse_body(events)
            self.assertIn("event: tool", body)
            self.assertIn("event: completed", body)

    def test_agent_error_responses_are_safe(self) -> None:
        malformed: Any = self.client.post(
            "/api/agent/edit",
            data=b'{"cv":',
            content_type="application/json",
        )
        self.assertEqual(malformed.status_code, 400)
        self.assertEqual(
            malformed.json(),
            {"code": "INVALID_JSON", "message": "Request body must be valid JSON."},
        )

        request_failure = RuntimeError("provider credentials leaked")
        with override_settings(DEBUG=True), patch("main.api.create_job", side_effect=request_failure):
            failed_request: Any = self.client.post(
                "/api/agent/edit",
                data=json.dumps(
                    {
                        "cv": {"header": {}, "sections": []},
                        "message": "Update my CV",
                        "thread_id": "request-error",
                    }
                ),
                content_type="application/json",
            )
        self.assertEqual(failed_request.status_code, 500)
        self.assertEqual(
            failed_request.json(),
            {
                "code": "AGENT_REQUEST_FAILED",
                "message": "The agent request could not be completed. Please try again.",
            },
        )
        self.assertNotIn("provider credentials leaked", failed_request.content.decode())
        self.assertNotIn("Traceback", failed_request.content.decode())

        def failing_run_agent(*args: Any, **kwargs: Any) -> dict[str, Any]:
            raise RuntimeError("provider credentials leaked")

        with patch("main.jobs.run_agent", failing_run_agent):
            edit: Any = self.client.post(
                "/api/agent/edit",
                data=json.dumps(
                    {
                        "cv": {"header": {}, "sections": []},
                        "message": "Update my CV",
                        "thread_id": "job-error",
                    }
                ),
                content_type="application/json",
            )
            self.assertEqual(edit.status_code, 200)
            self.assertEqual(set(edit.json()), {"job_id"})
            status = self._wait_for_job(edit.json()["job_id"])

        self.assertEqual(status["status"], "failed")
        self.assertEqual(status["error_code"], "AGENT_FAILED")
        self.assertEqual(status["error"], "The agent could not complete your request. Please try again.")
        self.assertNotIn("provider credentials leaked", json.dumps(status))
        stored_job = jobs.get_job(edit.json()["job_id"])
        self.assertEqual(stored_job["error_code"], "AGENT_FAILED")
        self.assertEqual(stored_job["error"], "The agent could not complete your request. Please try again.")

        failed_message = next(
            message
            for message in jobs.list_thread_messages("job-error")
            if message["status"] == "failed"
        )
        raw_error = "provider credentials leaked from legacy thread history"
        jobs.update_message_status(
            failed_message["id"],
            "failed",
            content=raw_error,
            error=raw_error,
        )
        thread: Any = self.client.get("/api/agent/threads/job-error")
        self.assertEqual(thread.status_code, 200)
        projected_message = next(
            message
            for message in thread.json()["messages"]
            if message["id"] == failed_message["id"]
        )
        self.assertEqual(projected_message["content"], "The agent could not complete your request. Please try again.")
        self.assertEqual(projected_message["error"], "The agent could not complete your request. Please try again.")
        self.assertEqual(thread.json()["message_preview"], "The agent could not complete your request. Please try again.")
        self.assertNotIn(raw_error, json.dumps(thread.json()))

    def test_job_sse_survives_timeout_resumes_by_cursor_and_recovers_at_asgi_startup(self) -> None:
        from threading import Event

        started = Event()
        release = Event()

        def fake_run_agent(
            cv: dict[str, Any],
            message: str,
            thread_id: str,
            run_id: str | None = None,
            on_tool_event: Any = None,
            **kwargs: Any,
        ) -> dict[str, Any]:
            if on_tool_event:
                on_tool_event({"id": "tool-1", "name": "read_cv", "status": "running"})
            started.set()
            release.wait(timeout=2)
            return {"cv": cv, "reply": "Done.", "run_id": run_id or "run-1", "metadata": {}}

        with patch("main.jobs.run_agent", fake_run_agent):
            thread: Any = self.client.post(
                "/api/agent/threads",
                data=json.dumps({"title": "Durable SSE"}),
                content_type="application/json",
            )
            self.assertEqual(thread.status_code, 200)
            thread_id = thread.json()["thread_id"]
            edit: Any = self.client.post(
                "/api/agent/edit",
                data=json.dumps(
                    {
                        "cv": {"header": {}, "sections": []},
                        "message": "Read my CV",
                        "thread_id": thread_id,
                    }
                ),
                content_type="application/json",
            )
            self.assertEqual(edit.status_code, 200)
            job_id = edit.json()["job_id"]
            self.assertTrue(started.wait(timeout=1))

            with patch("main.api._SSE_TIMEOUT_SECONDS", 0.03), patch("main.api._SSE_POLL_SECONDS", 0.01):
                timed_out_stream: Any = self.client.get(f"/api/agent/jobs/{job_id}/events")
                timed_out_body = self._sse_body(timed_out_stream)

            self.assertNotIn("event: failed", timed_out_body)
            self.assertEqual(self.client.get(f"/api/agent/jobs/{job_id}").json()["status"], "running")

            release.set()
            self.assertEqual(self._wait_for_job(job_id)["status"], "completed")

        all_events: Any = self.client.get(f"/api/agent/jobs/{job_id}/events")
        all_body = self._sse_body(all_events)
        cursors = [
            int(line.removeprefix("id: "))
            for line in all_body.splitlines()
            if line.startswith("id: ")
        ]
        self.assertGreaterEqual(len(cursors), 4)
        self.assertEqual(cursors, sorted(cursors))
        self.assertIn("event: tool", all_body)

        resumed_events: Any = self.client.get(
            f"/api/agent/jobs/{job_id}/events", HTTP_LAST_EVENT_ID=str(cursors[0])
        )
        resumed_body = self._sse_body(resumed_events)
        resumed_cursors = [
            int(line.removeprefix("id: "))
            for line in resumed_body.splitlines()
            if line.startswith("id: ")
        ]
        self.assertEqual(resumed_cursors, cursors[1:])

        class InterruptedExecutor:
            def submit(self, *args: Any, **kwargs: Any) -> Future[Any]:
                return Future()

        with patch("main.jobs._EXECUTOR", InterruptedExecutor()):
            queued_id = jobs.create_job(
                {"header": {}, "sections": []}, "Restart me", "restart-thread"
            )
            running_id = jobs.create_job(
                {"header": {}, "sections": []}, "Restart me too", "restart-thread"
            )
        jobs._set_job_status(running_id, "running", run_id="interrupted-run")
        self.assertEqual(jobs.get_job(queued_id)["status"], "queued")
        self.assertEqual(jobs.get_job(running_id)["status"], "running")

        lifespan_messages = asyncio.run(self._run_asgi_lifespan())
        self.assertEqual(
            lifespan_messages,
            [
                {"type": "lifespan.startup.complete"},
                {"type": "lifespan.shutdown.complete"},
            ],
        )

        for job_id in (queued_id, running_id):
            interrupted = jobs.get_job(job_id)
            self.assertIsNotNone(interrupted)
            self.assertEqual(interrupted["status"], "failed")
            self.assertEqual(interrupted["error_code"], jobs.JOB_INTERRUPTED)
            self.assertEqual(interrupted["error"], jobs.JOB_INTERRUPTED_MESSAGE)
            terminal_event = jobs.list_job_events(job_id)[-1]
            self.assertIsInstance(terminal_event["id"], int)
            self.assertEqual(terminal_event["type"], "failed")
            self.assertEqual(terminal_event["data"]["error_code"], jobs.JOB_INTERRUPTED)
            self.assertEqual(terminal_event["data"]["error"], jobs.JOB_INTERRUPTED_MESSAGE)

    @staticmethod
    async def _run_asgi_lifespan() -> list[dict[str, str]]:
        from sirastudio_ai.asgi import application

        incoming = iter(({"type": "lifespan.startup"}, {"type": "lifespan.shutdown"}))
        sent: list[dict[str, str]] = []

        async def receive() -> dict[str, str]:
            return next(incoming)

        async def send(message: dict[str, str]) -> None:
            sent.append(message)

        await application({"type": "lifespan"}, receive, send)
        return sent

    @staticmethod
    async def _collect_sse(streaming_content: Any) -> str:
        chunks: list[bytes | str] = []
        async for chunk in streaming_content:
            chunks.append(chunk)
        return b"".join(
            chunk if isinstance(chunk, bytes) else chunk.encode("utf-8") for chunk in chunks
        ).decode("utf-8")

    def _sse_body(self, response: Any) -> str:
        return asyncio.run(self._collect_sse(response.streaming_content))

    def _wait_for_job(self, job_id: str) -> dict[str, Any]:
        for _ in range(40):
            response: Any = self.client.get(f"/api/agent/jobs/{job_id}")
            self.assertEqual(response.status_code, 200)
            payload = response.json()
            if payload["status"] in {"completed", "failed"}:
                return payload
            time.sleep(0.05)
        self.fail("Agent job did not finish.")
