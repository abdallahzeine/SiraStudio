import json
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, override
from unittest.mock import patch

from django.test import Client, TestCase

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
            body = b"".join(events.streaming_content).decode("utf-8")
            self.assertIn("event: tool", body)
            self.assertIn("event: completed", body)

    def test_agent_job_capacity_rejects_and_recovers(self) -> None:
        dispatch_started = threading.Event()
        dispatch_release = threading.Event()
        agent_started = threading.Event()
        agent_release = threading.Event()
        original_executor = jobs._EXECUTOR
        original_max_pending = jobs._MAX_PENDING_JOBS
        original_max_running = jobs._MAX_RUNNING_JOBS
        test_executor = ThreadPoolExecutor(max_workers=1)
        jobs._EXECUTOR = test_executor
        jobs._MAX_PENDING_JOBS = 1
        jobs._MAX_RUNNING_JOBS = 1

        def fake_run_agent(
            cv: dict[str, Any],
            message: str,
            thread_id: str,
            run_id: str | None = None,
            **kwargs: Any,
        ) -> dict[str, Any]:
            agent_started.set()
            self.assertTrue(agent_release.wait(timeout=2))
            return {"cv": cv, "reply": "Done.", "run_id": run_id or "run-1", "metadata": {}}

        original_run_job = jobs._run_job

        def delay_job_start(*args: Any) -> dict[str, Any]:
            dispatch_started.set()
            self.assertTrue(dispatch_release.wait(timeout=2))
            return original_run_job(*args)

        def submit(thread_id: str) -> Any:
            return self.client.post(
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

        try:
            with patch("main.jobs.run_agent", fake_run_agent), patch("main.jobs._run_job", delay_job_start):
                first = submit("capacity-test-first")
                self.assertEqual(first.status_code, 200)
                first_job_id = first.json()["job_id"]
                self.assertTrue(dispatch_started.wait(timeout=2))

                pending_rejection = submit("capacity-test-pending")
                self.assertEqual(pending_rejection.status_code, 429)
                self.assertEqual(
                    pending_rejection.json(),
                    {
                        "code": "JOB_CAPACITY_EXCEEDED",
                        "message": "Agent job capacity is currently full. Please try again shortly.",
                    },
                )
                self.assertEqual(len(jobs.list_recent_jobs()), 1)

                dispatch_release.set()
                self.assertTrue(agent_started.wait(timeout=2))

                running_rejection = submit("capacity-test-running")
                self.assertEqual(running_rejection.status_code, 429)
                self.assertEqual(running_rejection.json()["code"], "JOB_CAPACITY_EXCEEDED")
                self.assertEqual(len(jobs.list_recent_jobs()), 1)

                agent_release.set()
                self.assertEqual(self._wait_for_job(first_job_id)["status"], "completed")

                accepted_after_completion = submit("capacity-test-after-completion")
                self.assertEqual(accepted_after_completion.status_code, 200)
                self.assertEqual(
                    self._wait_for_job(accepted_after_completion.json()["job_id"])["status"],
                    "completed",
                )
        finally:
            dispatch_release.set()
            agent_release.set()
            test_executor.shutdown(wait=True)
            jobs._EXECUTOR = original_executor
            jobs._MAX_PENDING_JOBS = original_max_pending
            jobs._MAX_RUNNING_JOBS = original_max_running

    def _wait_for_job(self, job_id: str) -> dict[str, Any]:
        for _ in range(40):
            response: Any = self.client.get(f"/api/agent/jobs/{job_id}")
            self.assertEqual(response.status_code, 200)
            payload = response.json()
            if payload["status"] in {"completed", "failed"}:
                return payload
            time.sleep(0.05)
        self.fail("Agent job did not finish.")
