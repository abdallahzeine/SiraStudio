import json
import tempfile
import time
from pathlib import Path
from unittest.mock import patch

from django.test import Client, TestCase

from . import jobs


class AgentBackendSmokeTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.tmp = tempfile.TemporaryDirectory()
        self.old_db_path = jobs._DB_PATH
        self.old_db_ready = jobs._DB_READY
        jobs._DB_PATH = Path(self.tmp.name) / "agent-jobs.sqlite"
        jobs._DB_READY = False
        jobs._JOB_EVENTS.clear()

    def tearDown(self):
        jobs._DB_PATH = self.old_db_path
        jobs._DB_READY = self.old_db_ready
        jobs._JOB_EVENTS.clear()
        self.tmp.cleanup()

    def test_agent_routes_job_and_sse_smoke(self):
        def fake_run_agent(cv, message, thread_id, run_id=None, on_tool_event=None, **kwargs):
            if on_tool_event:
                on_tool_event({"id": "tool-1", "name": "read_cv", "status": "completed"})
            return {"cv": cv, "reply": "Done.", "run_id": run_id or "run-1", "metadata": {}}

        with patch("main.jobs.run_agent", fake_run_agent):
            health = self.client.get("/api/agent/health")
            self.assertEqual(health.status_code, 200)
            self.assertTrue(health.json()["jobs_db"])

            thread = self.client.post(
                "/api/agent/threads",
                data=json.dumps({"title": "Smoke"}),
                content_type="application/json",
            )
            self.assertEqual(thread.status_code, 200)
            thread_id = thread.json()["thread_id"]

            listed = self.client.get("/api/agent/threads")
            self.assertEqual(listed.status_code, 200)
            self.assertTrue(any(item["thread_id"] == thread_id for item in listed.json()["threads"]))

            edit = self.client.post(
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

            events = self.client.get(f"/api/agent/jobs/{job_id}/events")
            body = b"".join(events.streaming_content).decode("utf-8")
            self.assertIn("event: tool", body)
            self.assertIn("event: completed", body)

    def _wait_for_job(self, job_id: str) -> dict:
        for _ in range(40):
            response = self.client.get(f"/api/agent/jobs/{job_id}")
            self.assertEqual(response.status_code, 200)
            payload = response.json()
            if payload["status"] in {"completed", "failed"}:
                return payload
            time.sleep(0.05)
        self.fail("Agent job did not finish.")
