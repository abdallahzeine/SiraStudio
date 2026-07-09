from __future__ import annotations

from collections.abc import Callable
from copy import deepcopy
import json
import tempfile
import time
from pathlib import Path
from typing import Literal, TypeAlias, TypedDict, override
from unittest.mock import patch

from django.test import Client, TestCase

from . import jobs
from .cv_schema import CVData, SCAFFOLD_CV_FIXTURE, TemplateId, parse_cv


TemplateColumns: TypeAlias = Literal[1, 2]


class ToolEvent(TypedDict):
    id: str
    name: str
    status: str


ToolEventHandler: TypeAlias = Callable[[ToolEvent], None]


def _cv_fixture(
    *,
    template_id: TemplateId = "single-column",
    columns: TemplateColumns = 1,
) -> CVData:
    fixture = deepcopy(SCAFFOLD_CV_FIXTURE)
    template: dict[str, object] = {"id": template_id, "columns": columns}
    if template_id == "sidebar-left":
        template.update({"sidebarSide": "left", "sidebarSectionIds": ["summary"]})
    elif template_id == "sidebar-right":
        template.update({"sidebarSide": "right", "sidebarSectionIds": ["summary"]})
    fixture["template"] = template
    return parse_cv(fixture)


def _cv_payload(cv: CVData) -> dict[str, object]:
    return cv.model_dump(by_alias=True)


class CVDocumentApiTests(TestCase):
    def setUp(self):
        self.client = Client()

    def test_cv_document_crud_revision_conflict_and_archive(self):
        create_cv = _cv_fixture(template_id="single-column", columns=1)
        create = self.client.post(
            "/api/cv-documents",
            data=json.dumps(
                {
                    "title": "Ada CV",
                    "cv": _cv_payload(create_cv),
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(create.status_code, 201)
        created = create.json()
        document_id = created["id"]
        self.assertEqual(created["title"], "Ada CV")
        self.assertEqual(created["revision"], 1)
        created_cv = parse_cv(created["cv"])
        self.assertEqual(created_cv.template.id, "single-column")
        self.assertEqual(created_cv.template.columns, 1)
        self.assertEqual(created_cv.sections[0].type, "summary")

        listed = self.client.get("/api/cv-documents")
        self.assertEqual(listed.status_code, 200)
        self.assertTrue(any(item["id"] == document_id for item in listed.json()["documents"]))

        retrieved = self.client.get(f"/api/cv-documents/{document_id}")
        self.assertEqual(retrieved.status_code, 200)
        self.assertEqual(retrieved.json()["id"], document_id)

        update_cv = _cv_fixture(template_id="sidebar-left", columns=2)
        update = self.client.put(
            f"/api/cv-documents/{document_id}",
            data=json.dumps(
                {
                    "title": "Ada Updated CV",
                    "cv": _cv_payload(update_cv),
                    "base_revision": 1,
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(update.status_code, 200)
        updated = update.json()
        self.assertEqual(updated["title"], "Ada Updated CV")
        self.assertEqual(updated["revision"], 2)
        updated_cv = parse_cv(updated["cv"])
        self.assertEqual(updated_cv.template.id, "sidebar-left")
        self.assertEqual(updated_cv.template.columns, 2)

        conflict = self.client.put(
            f"/api/cv-documents/{document_id}",
            data=json.dumps(
                {
                    "cv": _cv_payload(_cv_fixture(template_id="sidebar-right", columns=2)),
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

    def test_cv_document_create_requires_valid_cv_data_shape(self):
        cases = [
            {"cv": ["not", "an", "object"]},
            {"cv": {"header": {}, "sections": []}},
            {
                "cv": {
                    "header": {},
                    "sections": {},
                    "template": {"id": "single-column", "columns": 1},
                }
            },
        ]

        for body in cases:
            with self.subTest(body=body):
                response = self.client.post(
                    "/api/cv-documents",
                    data=json.dumps(body),
                    content_type="application/json",
                )
                self.assertEqual(response.status_code, 422)


class AgentBackendSmokeTests(TestCase):
    client: Client
    tmp: tempfile.TemporaryDirectory[str]
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
            cv: CVData,
            message: str,
            thread_id: str,
            run_id: str | None = None,
            user_id: str | None = None,
            checkpoint_id: str | None = None,
            input_revision: int | None = None,
            on_tool_event: ToolEventHandler | None = None,
        ) -> dict[str, object]:
            if on_tool_event:
                on_tool_event({"id": "tool-1", "name": "read_cv", "status": "completed"})
            return {
                "cv": _cv_payload(cv),
                "reply": "Done.",
                "run_id": run_id or "run-1",
                "metadata": {},
            }

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

            request_cv = _cv_fixture()
            edit = self.client.post(
                "/api/agent/edit",
                data=json.dumps(
                    {
                        "cv": _cv_payload(request_cv),
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
            response_cv = parse_cv(status["cv"])
            self.assertEqual(response_cv.header.name, request_cv.header.name)
            self.assertEqual(response_cv.sections[0].type, "summary")
            self.assertEqual(response_cv.sections[0].layout.columns, 1)

            events = self.client.get(f"/api/agent/jobs/{job_id}/events")
            body = b"".join(events.streaming_content).decode("utf-8")
            self.assertIn("event: tool", body)
            self.assertIn("event: completed", body)

    def _wait_for_job(self, job_id: str) -> dict[str, object]:
        for _ in range(40):
            response = self.client.get(f"/api/agent/jobs/{job_id}")
            self.assertEqual(response.status_code, 200)
            payload = response.json()
            if payload["status"] in {"completed", "failed"}:
                return payload
            time.sleep(0.05)
        self.fail("Agent job did not finish.")
