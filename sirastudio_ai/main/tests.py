from __future__ import annotations

import asyncio
from collections.abc import Callable
from copy import deepcopy
import json
import tempfile
import time
from concurrent.futures import Future, ThreadPoolExecutor
from threading import Event
from pathlib import Path
from typing import Any, Literal, TypeAlias, TypedDict, override
from unittest.mock import Mock, patch

from django.test import Client, TestCase, override_settings
from langchain.messages import AIMessage

from . import jobs
from .agent import core
from .agent.core import AgentCancellationError
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


class _SequenceModel:
    def __init__(self, responses: list[object]):
        self.responses = iter(responses)
        self.calls: list[tuple[object, object]] = []

    def invoke(self, messages: object, config: object = None) -> object:
        self.calls.append((messages, config))
        return next(self.responses)


class _BlockingFirstModel(_SequenceModel):
    def __init__(self, responses: list[object], started: Event, release: Event):
        super().__init__(responses)
        self.started = started
        self.release = release

    def invoke(self, messages: object, config: object = None) -> object:
        if not self.calls:
            self.started.set()
            self.release.wait(timeout=2)
        return super().invoke(messages, config)


def _tool_call(name: str, args: dict[str, object], call_id: str) -> AIMessage:
    return AIMessage(
        content="",
        tool_calls=[{"name": name, "args": args, "id": call_id, "type": "tool_call"}],
    )


class AgentGraphFlowTests(TestCase):
    def setUp(self) -> None:
        self.saved = {
            name: getattr(core, name)
            for name in (
                "_graph",
                "_base_model",
                "_model",
                "_review_model",
            )
        }
        core._graph = None

    def tearDown(self) -> None:
        for name, value in self.saved.items():
            setattr(core, name, value)

    def test_model_binding_disables_parallel_tool_calls(self) -> None:
        base_model = Mock()
        bound_model = object()
        base_model.bind_tools.return_value = bound_model
        core._base_model = base_model
        core._model = None

        self.assertIs(core._get_model(), bound_model)
        base_model.bind_tools.assert_called_once_with(
            core.AGENT_TOOLS, parallel_tool_calls=False
        )

    def test_live_status_starts_while_model_is_still_working(self) -> None:
        started = Event()
        release = Event()
        events: list[dict[str, object]] = []
        core._model = _BlockingFirstModel(
            [
                _tool_call("read_cv", {}, "read"),
                AIMessage(content="No CV change was requested."),
            ],
            started,
            release,
        )

        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(
                core.run_agent,
                _cv_fixture(),
                "What is currently in my CV?",
                "graph-live-status",
                None,
                events.append,
            )
            self.assertTrue(started.wait(timeout=1))
            try:
                self.assertTrue(
                    any(
                        event.get("name") == "plan_changes"
                        and event.get("status") == "running"
                        for event in events
                    )
                )
            finally:
                release.set()
            self.assertIsNone(future.result(timeout=2)["error_code"])

    def test_read_is_mandatory_before_sequential_edits(self) -> None:
        summary_path = "sections[0].content.items[0].fields.body"
        edit_args = {
            "operations": [{"op": "set", "path": summary_path, "value": "Updated."}]
        }
        tool_events: list[dict[str, str]] = []
        core._model = _SequenceModel(
            [
                _tool_call("apply_cv_edits", edit_args, "blocked-edit"),
                _tool_call("read_cv", {}, "read"),
                _tool_call("apply_cv_edits", edit_args, "edit"),
                AIMessage(content="Updated the summary."),
            ]
        )
        core._review_model = _SequenceModel([{"complete": True, "missing": []}])

        result = core.run_agent(
            _cv_fixture(), "Update my summary", "graph-mandatory-read", on_tool_event=tool_events.append
        )

        self.assertIsNone(result["error_code"])
        self.assertEqual(result["cv"]["sections"][0]["content"]["items"][0]["fields"]["body"], "Updated.")
        self.assertEqual(
            [event["status"] for event in tool_events if event["id"] == "blocked-edit"],
            ["running", "failed"],
        )
        self.assertEqual(result["metadata"]["successful_edits"], 1)

    def test_multi_part_edit_uses_sequential_calls_then_reviews_current_cv(self) -> None:
        summary_path = "sections[0].content.items[0].fields.body"
        summary_edit = {
            "operations": [
                {
                    "op": "set",
                    "path": summary_path,
                    "value": "Builds reliable analytical engines and developer tools.",
                }
            ]
        }
        location_edit = {
            "operations": [
                {
                    "op": "set",
                    "path": "header.location",
                    "value": "Amman, Jordan",
                },
            ]
        }
        tool_events: list[dict[str, str]] = []
        core._model = _SequenceModel(
            [
                _tool_call("read_cv", {}, "read"),
                _tool_call("apply_cv_edits", summary_edit, "summary-edit"),
                _tool_call("apply_cv_edits", location_edit, "location-edit"),
                AIMessage(content="Updated the summary and location."),
            ]
        )
        core._review_model = _SequenceModel(
            [
                {
                    "complete": True,
                    "missing": [],
                }
            ]
        )

        result = core.run_agent(
            _cv_fixture(),
            "Improve my summary and set my location to Amman, Jordan",
            "graph-sequential-edits",
            on_tool_event=tool_events.append,
        )

        self.assertIsNone(result["error_code"])
        self.assertEqual(result["reply"], "Updated the summary and location.")
        self.assertTrue(result["metadata"]["review_complete"])
        self.assertEqual(result["metadata"]["successful_edits"], 2)
        self.assertEqual(len(core._review_model.calls), 1)
        self.assertEqual(
            [(event["id"], event["status"]) for event in tool_events if event["name"] == "apply_cv_edits"],
            [
                ("summary-edit", "running"),
                ("summary-edit", "completed"),
                ("location-edit", "running"),
                ("location-edit", "completed"),
            ],
        )
        self.assertEqual(
            result["cv"]["sections"][0]["content"]["items"][0]["fields"]["body"],
            "Builds reliable analytical engines and developer tools.",
        )
        self.assertEqual(result["cv"]["header"]["location"], "Amman, Jordan")
        review_messages, _ = core._review_model.calls[0]
        review_input = review_messages[-1].content
        self.assertIn('"request": "Improve my summary and set my location to Amman, Jordan"', review_input)
        self.assertIn('"current_cv":', review_input)
        self.assertIn("Builds reliable analytical engines", review_input)
        self.assertIn("Amman, Jordan", review_input)

    def test_failed_direct_edit_is_not_reviewed(self) -> None:
        invalid_edit = {
            "operations": [
                {"op": "set", "path": "sections[99].title", "value": "Missing"}
            ]
        }
        core._model = _SequenceModel(
            [
                _tool_call("read_cv", {}, "read"),
                _tool_call("apply_cv_edits", invalid_edit, "bad-edit-1"),
                _tool_call("apply_cv_edits", invalid_edit, "bad-edit-2"),
            ]
        )
        core._review_model = _SequenceModel([])
        original = _cv_fixture()

        result = core.run_agent(original, "Change a missing section", "graph-edit-failed")

        self.assertEqual(result["error_code"], "AGENT_EDIT_FAILED")
        self.assertEqual(parse_cv(result["cv"]), original)
        self.assertEqual(len(core._review_model.calls), 0)

    def test_incomplete_review_returns_missing_work_to_agent_once(self) -> None:
        first_summary = "Builds reliable tools."
        completed_summary = "Builds reliable analytical engines and developer tools."
        core._model = _SequenceModel(
            [
                _tool_call("read_cv", {}, "read"),
                _tool_call(
                    "apply_cv_edits",
                    {
                        "operations": [
                            {
                                "op": "set",
                                "path": "sections[0].content.items[0].fields.body",
                                "value": first_summary,
                            }
                        ]
                    },
                    "edit",
                ),
                AIMessage(content="Updated the summary."),
                _tool_call(
                    "apply_cv_edits",
                    {
                        "operations": [
                            {
                                "op": "set",
                                "path": "sections[0].content.items[0].fields.body",
                                "value": completed_summary,
                            }
                        ]
                    },
                    "correction",
                ),
                AIMessage(content="Completed the requested summary."),
            ]
        )
        core._review_model = _SequenceModel(
            [
                {
                    "complete": False,
                    "missing": ["The summary still needs to mention analytical engines."],
                },
            ]
        )

        result = core.run_agent(
            _cv_fixture(), "Improve my summary", "graph-review-audit"
        )

        self.assertIsNone(result["error_code"])
        self.assertNotIn("workflow_failed_reason", result["metadata"])
        self.assertFalse(result["metadata"]["review_complete"])
        self.assertEqual(result["metadata"]["review_correction_count"], 1)
        self.assertEqual(len(core._model.calls), 5)
        self.assertEqual(len(core._review_model.calls), 1)
        self.assertEqual(
            result["cv"]["sections"][0]["content"]["items"][0]["fields"]["body"],
            completed_summary,
        )
        correction_messages, _ = core._model.calls[3]
        self.assertIn(
            "The summary still needs to mention analytical engines.",
            correction_messages[-1].content,
        )

    def test_incomplete_review_without_correction_keeps_completed_edits(self) -> None:
        changed_summary = "Builds reliable tools."
        core._model = _SequenceModel(
            [
                _tool_call("read_cv", {}, "read"),
                _tool_call(
                    "apply_cv_edits",
                    {
                        "operations": [
                            {
                                "op": "set",
                                "path": "sections[0].content.items[0].fields.body",
                                "value": changed_summary,
                            }
                        ]
                    },
                    "edit",
                ),
                AIMessage(content="Updated the summary."),
                AIMessage(content="The requested details are now included."),
            ]
        )
        core._review_model = _SequenceModel(
            [
                {"complete": False, "missing": ["Mention analytical engines."]},
            ]
        )
        original = _cv_fixture()

        result = core.run_agent(original, "Improve my summary", "graph-review-failed")

        self.assertIsNone(result["error_code"])
        self.assertNotEqual(parse_cv(result["cv"]), original)
        self.assertEqual(
            result["cv"]["sections"][0]["content"]["items"][0]["fields"]["body"],
            changed_summary,
        )
        self.assertEqual(result["metadata"]["review_correction_count"], 1)
        self.assertEqual(len(core._review_model.calls), 1)
        self.assertEqual(result["reply"], "The requested details are now included.")


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
            on_tool_event: ToolEventHandler | None = None,
            should_cancel: Callable[[], bool] | None = None,
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

            events: Any = self.client.get(f"/api/agent/jobs/{job_id}/events")
            body = self._sse_body(events)
            self.assertIn("event: tool", body)
            self.assertIn("event: completed", body)

    def test_agent_job_capacity_rejects_and_recovers(self) -> None:
        dispatch_started = Event()
        dispatch_release = Event()
        agent_started = Event()
        agent_release = Event()
        original_executor = jobs._EXECUTOR
        original_max_pending = jobs._MAX_PENDING_JOBS
        original_max_running = jobs._MAX_RUNNING_JOBS
        test_executor = ThreadPoolExecutor(max_workers=1)
        jobs._EXECUTOR = test_executor
        jobs._MAX_PENDING_JOBS = 1
        jobs._MAX_RUNNING_JOBS = 1

        def fake_run_agent(
            cv: CVData,
            message: str,
            thread_id: str,
            run_id: str | None = None,
            **kwargs: Any,
        ) -> dict[str, Any]:
            agent_started.set()
            self.assertTrue(agent_release.wait(timeout=2))
            return {"cv": _cv_payload(cv), "reply": "Done.", "run_id": run_id or "run-1", "metadata": {}}

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
                        "cv": _cv_payload(_cv_fixture()),
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

    def test_queued_agent_job_can_be_cancelled_before_agent_runs(self) -> None:
        worker_occupied = Event()
        release_worker = Event()
        agent_called = Event()
        original_executor = jobs._EXECUTOR
        test_executor = ThreadPoolExecutor(max_workers=1)

        def occupy_worker() -> None:
            worker_occupied.set()
            self.assertTrue(release_worker.wait(timeout=2))

        def fake_run_agent(*args: Any, **kwargs: Any) -> dict[str, Any]:
            agent_called.set()
            raise AssertionError("A cancelled queued job must not run the agent")

        test_executor.submit(occupy_worker)
        self.assertTrue(worker_occupied.wait(timeout=1))
        jobs._EXECUTOR = test_executor

        try:
            with patch("main.jobs.run_agent", fake_run_agent):
                edit = self.client.post(
                    "/api/agent/edit",
                    data=json.dumps(
                        {
                            "cv": _cv_payload(_cv_fixture()),
                            "message": "Cancel while queued",
                            "thread_id": "queued-cancel-thread",
                        }
                    ),
                    content_type="application/json",
                )
                self.assertEqual(edit.status_code, 200)
                job_id = edit.json()["job_id"]
                self.assertEqual(jobs.job_status_payload(job_id)["status"], "queued")

                cancelled = self.client.post(f"/api/agent/jobs/{job_id}/cancel")
                self.assertEqual(cancelled.status_code, 200)
                self.assertEqual(cancelled.json()["status"], "cancelled")
                self.assertEqual(cancelled.json()["reply"], "Stopped.")
                self.assertIsNone(cancelled.json()["cv"])

                repeated = self.client.post(f"/api/agent/jobs/{job_id}/cancel")
                self.assertEqual(repeated.status_code, 200)
                self.assertEqual(repeated.json(), cancelled.json())

                release_worker.set()
                time.sleep(0.1)

            self.assertFalse(agent_called.is_set())
            self.assertEqual(jobs.job_status_payload(job_id)["status"], "cancelled")
            cancelled_events = [
                event for event in jobs.list_job_events(job_id) if event["type"] == "cancelled"
            ]
            cancelled_messages = [
                message
                for message in jobs.list_thread_messages("queued-cancel-thread")
                if message["job_id"] == job_id and message["status"] == "cancelled"
            ]
            self.assertEqual(len(cancelled_events), 1)
            self.assertEqual(len(cancelled_messages), 1)
            self.assertEqual(cancelled_messages[0]["content"], "Stopped.")
            self.assertFalse(
                any(
                    message["job_id"] == job_id
                    and message["role"] == "assistant"
                    and message["status"] == "completed"
                    for message in jobs.list_thread_messages("queued-cancel-thread")
                )
            )
        finally:
            release_worker.set()
            test_executor.shutdown(wait=True)
            jobs._EXECUTOR = original_executor

    def test_running_agent_job_cancellation_wins_over_late_result(self) -> None:
        agent_started = Event()
        release_agent = Event()
        agent_returned = Event()

        def fake_run_agent(
            cv: CVData,
            message: str,
            thread_id: str,
            run_id: str | None = None,
            should_cancel: Callable[[], bool] | None = None,
            **kwargs: Any,
        ) -> dict[str, Any]:
            agent_started.set()
            self.assertTrue(release_agent.wait(timeout=2))
            self.assertIsNotNone(should_cancel)
            self.assertTrue(should_cancel())
            changed_cv = _cv_payload(cv)
            changed_cv["header"]["name"] = "Must not be applied"
            agent_returned.set()
            return {
                "cv": changed_cv,
                "reply": "Late completion must be discarded.",
                "run_id": run_id or "late-run",
                "metadata": {},
            }

        with patch("main.jobs.run_agent", fake_run_agent):
            edit = self.client.post(
                "/api/agent/edit",
                data=json.dumps(
                    {
                        "cv": _cv_payload(_cv_fixture()),
                        "message": "Cancel while running",
                        "thread_id": "running-cancel-thread",
                    }
                ),
                content_type="application/json",
            )
            self.assertEqual(edit.status_code, 200)
            job_id = edit.json()["job_id"]
            self.assertTrue(agent_started.wait(timeout=1))

            cancelled = self.client.post(f"/api/agent/jobs/{job_id}/cancel")
            self.assertEqual(cancelled.status_code, 200)
            self.assertEqual(cancelled.json()["status"], "cancelled")
            self.assertEqual(cancelled.json()["reply"], "Stopped.")
            self.assertIsNone(cancelled.json()["cv"])

            release_agent.set()
            self.assertTrue(agent_returned.wait(timeout=1))
            time.sleep(0.1)

        final_status = self.client.get(f"/api/agent/jobs/{job_id}").json()
        self.assertEqual(final_status["status"], "cancelled")
        self.assertEqual(final_status["reply"], "Stopped.")
        self.assertIsNone(final_status["cv"])
        self.assertNotIn("Late completion", json.dumps(final_status))
        cancelled_events = [
            event for event in jobs.list_job_events(job_id) if event["type"] == "cancelled"
        ]
        cancelled_messages = [
            message
            for message in jobs.list_thread_messages("running-cancel-thread")
            if message["job_id"] == job_id and message["status"] == "cancelled"
        ]
        self.assertEqual(len(cancelled_events), 1)
        self.assertEqual(len(cancelled_messages), 1)
        self.assertFalse(
            any(event["type"] == "completed" for event in jobs.list_job_events(job_id))
        )
        self.assertFalse(
            any(
                message["job_id"] == job_id
                and message["role"] == "assistant"
                and message["status"] == "completed"
                for message in jobs.list_thread_messages("running-cancel-thread")
            )
        )

    def test_cooperative_agent_cancellation_error_maps_to_cancelled(self) -> None:
        def fake_run_agent(*args: Any, **kwargs: Any) -> dict[str, Any]:
            raise AgentCancellationError()

        with patch("main.jobs.run_agent", fake_run_agent):
            edit = self.client.post(
                "/api/agent/edit",
                data=json.dumps(
                    {
                        "cv": _cv_payload(_cv_fixture()),
                        "message": "Cooperative cancel",
                        "thread_id": "coop-cancel-thread",
                    }
                ),
                content_type="application/json",
            )
            self.assertEqual(edit.status_code, 200)
            job_id = edit.json()["job_id"]
            status = self._wait_for_job(job_id)

        self.assertEqual(status["status"], "cancelled")
        self.assertEqual(status["reply"], "Stopped.")
        self.assertIsNone(status["cv"])
        self.assertIsNone(status["error"])
        self.assertIsNone(status["error_code"])
        cancelled_events = [
            event for event in jobs.list_job_events(job_id) if event["type"] == "cancelled"
        ]
        self.assertEqual(len(cancelled_events), 1)
        self.assertFalse(any(event["type"] == "failed" for event in jobs.list_job_events(job_id)))

    def test_cancelled_inflight_job_still_occupies_capacity(self) -> None:
        agent_started = Event()
        release_agent = Event()
        original_executor = jobs._EXECUTOR
        original_max_pending = jobs._MAX_PENDING_JOBS
        original_max_running = jobs._MAX_RUNNING_JOBS
        test_executor = ThreadPoolExecutor(max_workers=1)
        jobs._EXECUTOR = test_executor
        jobs._MAX_PENDING_JOBS = 1
        jobs._MAX_RUNNING_JOBS = 1

        def fake_run_agent(
            cv: CVData,
            message: str,
            thread_id: str,
            run_id: str | None = None,
            on_tool_event: Any = None,
            **kwargs: Any,
        ) -> dict[str, Any]:
            agent_started.set()
            self.assertTrue(release_agent.wait(timeout=2))
            if on_tool_event:
                on_tool_event({"id": "late-tool", "name": "read_cv", "status": "completed"})
            raise AgentCancellationError()

        def submit(thread_id: str) -> Any:
            return self.client.post(
                "/api/agent/edit",
                data=json.dumps(
                    {
                        "cv": _cv_payload(_cv_fixture()),
                        "message": "Capacity cancel race",
                        "thread_id": thread_id,
                    }
                ),
                content_type="application/json",
            )

        try:
            with patch("main.jobs.run_agent", fake_run_agent):
                first = submit("capacity-cancel-first")
                self.assertEqual(first.status_code, 200)
                first_job_id = first.json()["job_id"]
                self.assertTrue(agent_started.wait(timeout=1))

                cancelled = self.client.post(f"/api/agent/jobs/{first_job_id}/cancel")
                self.assertEqual(cancelled.status_code, 200)
                self.assertEqual(cancelled.json()["status"], "cancelled")

                blocked = submit("capacity-cancel-blocked")
                self.assertEqual(blocked.status_code, 429)
                self.assertEqual(blocked.json()["code"], "JOB_CAPACITY_EXCEEDED")

                release_agent.set()
                self.assertEqual(self._wait_for_job(first_job_id)["status"], "cancelled")
                for _ in range(40):
                    with jobs._LOCK:
                        if first_job_id not in jobs._FUTURES:
                            break
                    time.sleep(0.05)
                else:
                    self.fail("Cancelled in-flight future was not cleaned up")

                self.assertFalse(
                    any(
                        event["type"] == "tool" and event["data"].get("id") == "late-tool"
                        for event in jobs.list_job_events(first_job_id)
                    )
                )

                accepted = submit("capacity-cancel-after")
                self.assertEqual(accepted.status_code, 200)
                self.assertEqual(
                    self._wait_for_job(accepted.json()["job_id"])["status"],
                    "cancelled",
                )
        finally:
            release_agent.set()
            test_executor.shutdown(wait=True)
            jobs._EXECUTOR = original_executor
            jobs._MAX_PENDING_JOBS = original_max_pending
            jobs._MAX_RUNNING_JOBS = original_max_running

    def test_thread_history_returns_the_newest_window_in_ascending_order(self) -> None:
        thread_id = "long-thread"
        jobs.ensure_thread(thread_id)
        conn = jobs._connect()
        for index in range(202):
            message_id = f"message-{index:03}"
            created_at = f"2026-01-01T00:{index // 60:02}:{index % 60:02}+00:00"
            conn.execute(
                """
                INSERT INTO agent_messages (
                    id, thread_id, role, content, parent_id, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    message_id,
                    thread_id,
                    "user" if index % 2 == 0 else "assistant",
                    f"Message {index}",
                    f"message-{index - 1:03}" if index else None,
                    created_at,
                    created_at,
                ),
            )
        conn.commit()
        conn.close()

        messages = jobs.list_thread_messages(thread_id, limit=200)
        response = self.client.get(f"/api/agent/threads/{thread_id}")
        self.assertEqual(response.status_code, 200)
        history = response.json()["messages"]

        self.assertEqual(len(history), 200)
        self.assertEqual(history[0]["id"], "message-002")
        self.assertEqual(history[-2]["role"], "user")
        self.assertEqual(history[-2]["id"], "message-200")
        self.assertEqual(history[-1]["role"], "assistant")
        self.assertEqual(history[-1]["id"], "message-201")
        self.assertEqual(messages[0]["parent_id"], "message-001")

    def test_deleted_threads_are_terminal_and_archived_threads_remain_resumable(self) -> None:
        job_started = Event()
        finish_job = Event()

        def fake_run_agent(
            cv: CVData,
            message: str,
            thread_id: str,
            run_id: str | None = None,
            **kwargs: Any,
        ) -> dict[str, Any]:
            if message == "Wait for deletion":
                job_started.set()
                self.assertTrue(finish_job.wait(timeout=2))
            return {"cv": _cv_payload(cv), "reply": "Done.", "run_id": run_id or "run-1", "metadata": {}}

        with patch("main.jobs.run_agent", fake_run_agent):
            deleted_thread = self.client.post(
                "/api/agent/threads",
                data=json.dumps({"title": "Delete me"}),
                content_type="application/json",
            ).json()["thread_id"]
            job_response = self.client.post(
                "/api/agent/edit",
                data=json.dumps(
                    {
                        "cv": _cv_payload(_cv_fixture()),
                        "message": "Wait for deletion",
                        "thread_id": deleted_thread,
                    }
                ),
                content_type="application/json",
            )
            self.assertEqual(job_response.status_code, 200)
            job_id = job_response.json()["job_id"]
            self.assertTrue(job_started.wait(timeout=2))

            messages_before_delete = self._stored_thread_messages(deleted_thread)
            job_before_delete = jobs.get_job(job_id)
            deleted = self.client.delete(f"/api/agent/threads/{deleted_thread}")
            self.assertEqual(deleted.status_code, 200)
            self.assertEqual(self._stored_thread_messages(deleted_thread), messages_before_delete)
            self.assertEqual(jobs.get_job(job_id), job_before_delete)

            missing = self.client.get("/api/agent/threads/missing-thread")
            direct_read = self.client.get(f"/api/agent/threads/{deleted_thread}")
            self.assertEqual(direct_read.status_code, missing.status_code)
            self.assertEqual(direct_read.json(), missing.json())
            listed = self.client.get("/api/agent/threads")
            self.assertFalse(any(item["thread_id"] == deleted_thread for item in listed.json()["threads"]))

            rejected = self.client.post(
                "/api/agent/edit",
                data=json.dumps(
                    {
                        "cv": _cv_payload(_cv_fixture()),
                        "message": "Do not create a job",
                        "thread_id": deleted_thread,
                    }
                ),
                content_type="application/json",
            )
            self.assertEqual(rejected.status_code, 404)
            self.assertEqual(len(jobs.list_recent_jobs()), 1)

            finish_job.set()
            self.assertEqual(self._wait_for_job(job_id)["status"], "completed")
            self.assertEqual(self._stored_thread_messages(deleted_thread), messages_before_delete)
            self.assertEqual(len(messages_before_delete), 1)

            archived_thread = self.client.post(
                "/api/agent/threads",
                data=json.dumps({"title": "Keep me"}),
                content_type="application/json",
            ).json()["thread_id"]
            archived = self.client.post(f"/api/agent/threads/{archived_thread}/archive")
            self.assertEqual(archived.status_code, 200)
            self.assertEqual(archived.json()["status"], "archived")
            self.assertEqual(self.client.get(f"/api/agent/threads/{archived_thread}").status_code, 200)

            resumed = self.client.post(
                "/api/agent/edit",
                data=json.dumps(
                    {
                        "cv": _cv_payload(_cv_fixture()),
                        "message": "Resume this thread",
                        "thread_id": archived_thread,
                    }
                ),
                content_type="application/json",
            )
            self.assertEqual(resumed.status_code, 200)
            self.assertEqual(self._wait_for_job(resumed.json()["job_id"])["status"], "completed")
            self.assertEqual(self.client.get(f"/api/agent/threads/{archived_thread}").json()["status"], "archived")

    def _stored_thread_messages(self, thread_id: str) -> list[dict[str, Any]]:
        conn = jobs._connect()
        rows = conn.execute(
            "SELECT * FROM agent_messages WHERE thread_id = ? ORDER BY created_at ASC",
            (thread_id,),
        ).fetchall()
        conn.close()
        return [dict(row) for row in rows]

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
                        "cv": _cv_payload(_cv_fixture()),
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
                        "cv": _cv_payload(_cv_fixture()),
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
        conn = jobs._connect()
        conn.execute(
            "UPDATE agent_messages SET content = ?, error = ? WHERE id = ?",
            (raw_error, raw_error, failed_message["id"]),
        )
        conn.commit()
        conn.close()
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
        started = Event()
        release = Event()

        def fake_run_agent(
            cv: CVData,
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
            return {"cv": _cv_payload(cv), "reply": "Done.", "run_id": run_id or "run-1", "metadata": {}}

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
                        "cv": _cv_payload(_cv_fixture()),
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
                _cv_fixture(), "Restart me", "restart-thread"
            )
            running_id = jobs.create_job(
                _cv_fixture(), "Restart me too", "restart-thread"
            )
        self.assertTrue(jobs._claim_job(running_id, "interrupted-run"))
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

    def test_opted_in_debug_log_redacts_content(self) -> None:
        password = "diagnostic-password"
        inert_bearer = "Bearer inert-redaction-fixture-only"
        detail = f"password is {password}; {inert_bearer}; {'x' * 500}"

        def fake_run_agent(*args: Any, **kwargs: Any) -> dict[str, Any]:
            raise RuntimeError(detail)

        with self.settings(
            CV_MAKER_DEBUG_LOG=True,
        ):
            with self.assertLogs("agent_debug_logger", level="DEBUG") as logs:
                with patch("main.jobs.run_agent", fake_run_agent):
                    thread: Any = self.client.post(
                        "/api/agent/threads",
                        data=json.dumps({"title": "Logging test"}),
                        content_type="application/json",
                    )
                    thread_id = thread.json()["thread_id"]
                    edit: Any = self.client.post(
                        "/api/agent/edit",
                        data=json.dumps(
                            {
                                "cv": _cv_payload(_cv_fixture()),
                                "message": "Trigger diagnostic logging",
                                "thread_id": thread_id,
                            }
                        ),
                        content_type="application/json",
                    )
                    status = self._wait_for_job(edit.json()["job_id"])

        output = "\n".join(logs.output)
        self.assertEqual(status["status"], "failed")
        self.assertIn("password is [REDACTED]", output)
        self.assertNotIn(password, output)
        self.assertNotIn(inert_bearer, output)
        self.assertIn("DEBUG_FLOW", output)

    def _wait_for_job(self, job_id: str) -> dict[str, Any]:
        for _ in range(40):
            response = self.client.get(f"/api/agent/jobs/{job_id}")
            self.assertEqual(response.status_code, 200)
            payload = response.json()
            if payload["status"] in {"completed", "failed", "cancelled"}:
                return payload
            time.sleep(0.05)
        self.fail("Agent job did not finish.")
