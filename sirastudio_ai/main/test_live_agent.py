from __future__ import annotations

import json
import os
import tempfile
import time
import uuid
from copy import deepcopy
from pathlib import Path
from typing import Any
from unittest import skipUnless

from django.test import Client, SimpleTestCase

from . import jobs
from .agent import core
from .agent.llm import OPENROUTER_API_KEY, OPENROUTER_MODEL
from .agent.prompts import EDIT_TOOL_NAME, READ_TOOL_NAME
from .cv_schema import BUILT_IN_SECTION_FIELDS, CVData, SCAFFOLD_CV_FIXTURE, dump_cv, parse_cv

_RUN_LIVE = os.getenv("RUN_LIVE_AGENT_TESTS") == "1"
_POLL_SECONDS = 180
_POLL_INTERVAL = 1.0


def _schema_fields(section_type: str) -> list[dict[str, object]]:
    return [
        {"key": key, "label": key.replace("-", " ").title(), "kind": kind}
        for key, kind in BUILT_IN_SECTION_FIELDS[section_type].items()
    ]


def _layout() -> dict[str, object]:
    return {
        "dateSlot": "right-inline",
        "iconStyle": "none",
        "separator": "none",
        "density": "normal",
        "columns": 1,
    }


def _scaffold_cv() -> dict[str, object]:
    return dump_cv(parse_cv(deepcopy(SCAFFOLD_CV_FIXTURE)))


def _blank_cv() -> dict[str, object]:
    return dump_cv(
        parse_cv(
            {
                "header": {
                    "name": "",
                    "headline": "",
                    "location": "",
                    "phone": "",
                    "email": "",
                    "socialLinks": [],
                },
                "sections": [],
                "template": {"id": "single-column", "columns": 1},
                "dateFormat": "Mon YYYY",
            }
        )
    )


def _work_cv() -> dict[str, object]:
    return dump_cv(
        parse_cv(
            {
                "header": {
                    "name": "Alex Rivera",
                    "headline": "Software Engineer",
                    "location": "Berlin, DE",
                    "phone": "+49 30 0000",
                    "email": "alex@example.com",
                    "socialLinks": [],
                },
                "sections": [
                    {
                        "id": "summary",
                        "type": "summary",
                        "title": "Summary",
                        "layout": {
                            "dateSlot": "hidden",
                            "iconStyle": "none",
                            "separator": "none",
                            "density": "normal",
                            "columns": 1,
                        },
                        "content": {
                            "schema": _schema_fields("summary"),
                            "items": [
                                {
                                    "id": "summary-item",
                                    "fields": {
                                        "body": "Engineer focused on backend systems and APIs."
                                    },
                                }
                            ],
                        },
                    },
                    {
                        "id": "work",
                        "type": "work-experience",
                        "title": "Experience",
                        "layout": _layout(),
                        "content": {
                            "schema": _schema_fields("work-experience"),
                            "items": [
                                {
                                    "id": "work-acme",
                                    "fields": {
                                        "title": "Backend Engineer",
                                        "subtitle": "Acme Corp",
                                        "location": "Berlin",
                                        "date": "2020 - 2022",
                                        "bullets": [
                                            "Built billing APIs",
                                            "Reduced latency 20%",
                                        ],
                                    },
                                },
                                {
                                    "id": "work-beta",
                                    "fields": {
                                        "title": "Platform Engineer",
                                        "subtitle": "Beta Labs",
                                        "location": "Remote",
                                        "date": "2022 - Present",
                                        "bullets": [
                                            "Owned CI pipelines",
                                            "Improved deploy reliability",
                                        ],
                                    },
                                },
                            ],
                        },
                    },
                ],
                "template": {"id": "single-column", "columns": 1},
                "dateFormat": "Mon YYYY",
            }
        )
    )


def _grammar_cv() -> dict[str, object]:
    fixture = deepcopy(SCAFFOLD_CV_FIXTURE)
    fixture["sections"][0]["content"]["items"][0]["fields"]["body"] = (
        "I has experiense in softwear enginering and builded sistems for client."
    )
    return dump_cv(parse_cv(fixture))


def _section_by_type(cv: CVData, section_type: str):
    for section in cv.sections:
        if section.type == section_type:
            return section
    return None


def _work_item(cv: CVData, item_id: str) -> dict[str, object] | None:
    work = _section_by_type(cv, "work-experience")
    if work is None:
        return None
    for item in work.content.items:
        if item.id == item_id:
            return dict(item.fields)
    return None


def _tool_names(events: list[dict[str, Any]]) -> set[str]:
    names: set[str] = set()
    for event in events:
        if event.get("type") != "tool":
            continue
        data = event.get("data") or {}
        name = data.get("name")
        if name:
            names.add(str(name))
    return names


def _completed_tool_names(events: list[dict[str, Any]]) -> set[str]:
    return {
        str(data.get("name"))
        for event in events
        if event.get("type") == "tool"
        and isinstance((data := event.get("data")), dict)
        and data.get("status") == "completed"
        and data.get("name")
    }


@skipUnless(
    _RUN_LIVE,
    "Set RUN_LIVE_AGENT_TESTS=1 to run paid live agent user-flow tests.",
)
class LiveAgentUserFlowTests(SimpleTestCase):
    """Opt-in real OpenRouter + real tools user-flow checks. Paid when enabled."""

    client: Client
    tmp: tempfile.TemporaryDirectory[str]
    old_db_path: Path
    saved_agent_runtime: dict[str, Any]

    @classmethod
    def setUpClass(cls) -> None:
        super().setUpClass()
        if not OPENROUTER_API_KEY:
            raise RuntimeError(
                "RUN_LIVE_AGENT_TESTS=1 requires OPENROUTER_API_KEY to be set "
                f"(model={OPENROUTER_MODEL}). Configure the key before enabling live tests."
            )
        cls.saved_agent_runtime = {
            name: getattr(core, name)
            for name in ("_graph", "_base_model", "_model", "_review_model")
        }
        core._graph = None

    @classmethod
    def tearDownClass(cls) -> None:
        for name, value in cls.saved_agent_runtime.items():
            setattr(core, name, value)
        super().tearDownClass()

    def setUp(self) -> None:
        self.client = Client()
        self.tmp = tempfile.TemporaryDirectory()
        self.old_db_path = jobs.get_db_path()
        jobs.set_db_path(Path(self.tmp.name) / "live-agent-jobs.sqlite")
        jobs.reset_job_events()

    def tearDown(self) -> None:
        jobs.reset_job_events()
        jobs.set_db_path(self.old_db_path)
        self.tmp.cleanup()

    def _unique_thread(self, label: str) -> str:
        return f"live-{label}-{uuid.uuid4().hex}"

    def _fail_detail(
        self,
        scenario: str,
        status: dict[str, Any],
        events: list[dict[str, Any]],
    ) -> str:
        return (
            f"scenario={scenario} model={OPENROUTER_MODEL} "
            f"job_status={status.get('status')} error_code={status.get('error_code')} "
            f"error={status.get('error')!r} events={events!r}"
        )

    def _wait_for_job(self, job_id: str, scenario: str) -> dict[str, Any]:
        deadline = time.monotonic() + _POLL_SECONDS
        last: dict[str, Any] = {}
        while time.monotonic() < deadline:
            response = self.client.get(f"/api/agent/jobs/{job_id}")
            self.assertEqual(
                response.status_code,
                200,
                f"scenario={scenario} model={OPENROUTER_MODEL} job poll HTTP {response.status_code}",
            )
            last = response.json()
            if last["status"] in {"completed", "failed", "cancelled"}:
                return last
            time.sleep(_POLL_INTERVAL)
        events = jobs.list_job_events(job_id)
        self.fail(
            f"Job timed out after {_POLL_SECONDS}s. "
            + self._fail_detail(scenario, last, events)
        )

    def _run_edit(
        self,
        scenario: str,
        cv: dict[str, object],
        message: str,
    ) -> tuple[CVData, dict[str, Any], list[dict[str, Any]], str]:
        thread_id = self._unique_thread(scenario)
        edit = self.client.post(
            "/api/agent/edit",
            data=json.dumps(
                {
                    "cv": cv,
                    "message": message,
                    "thread_id": thread_id,
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(
            edit.status_code,
            200,
            f"scenario={scenario} model={OPENROUTER_MODEL} edit HTTP {edit.status_code} body={edit.content!r}",
        )
        job_id = edit.json()["job_id"]
        status = self._wait_for_job(job_id, scenario)
        events = jobs.list_job_events(job_id)

        if status["status"] != "completed":
            self.fail(self._fail_detail(scenario, status, events))

        self.assertIsNotNone(
            status.get("cv"),
            self._fail_detail(scenario, status, events),
        )
        result_cv = parse_cv(status["cv"])
        self.assertTrue(
            (status.get("reply") or "").strip(),
            self._fail_detail(scenario, status, events),
        )

        tool_names = _tool_names(events)
        completed_tool_names = _completed_tool_names(events)
        self.assertIn(
            READ_TOOL_NAME,
            tool_names,
            f"missing {READ_TOOL_NAME}. " + self._fail_detail(scenario, status, events),
        )
        self.assertIn(
            EDIT_TOOL_NAME,
            tool_names,
            f"missing {EDIT_TOOL_NAME}. " + self._fail_detail(scenario, status, events),
        )
        self.assertIn(
            EDIT_TOOL_NAME,
            completed_tool_names,
            f"{EDIT_TOOL_NAME} did not complete. "
            + self._fail_detail(scenario, status, events),
        )

        history = self.client.get(f"/api/agent/threads/{thread_id}")
        self.assertEqual(
            history.status_code,
            200,
            f"scenario={scenario} model={OPENROUTER_MODEL} thread HTTP {history.status_code}",
        )
        messages = history.json().get("messages") or []
        roles = {str(item.get("role")) for item in messages}
        self.assertIn("user", roles, self._fail_detail(scenario, status, events))
        self.assertIn("assistant", roles, self._fail_detail(scenario, status, events))
        self.assertTrue(
            any(
                item.get("role") == "user" and message in (item.get("content") or "")
                for item in messages
            ),
            self._fail_detail(scenario, status, events),
        )
        self.assertTrue(
            any(
                item.get("role") == "assistant" and (item.get("content") or "").strip()
                for item in messages
            ),
            self._fail_detail(scenario, status, events),
        )
        return result_cv, status, events, thread_id

    def _assert_only_item_field_changed(
        self,
        before: CVData,
        after: CVData,
        section_type: str,
        item_id: str,
        field: str,
    ) -> None:
        documents = [dump_cv(before), dump_cv(after)]
        for document in documents:
            section = next(
                item for item in document["sections"] if item["type"] == section_type
            )
            item = next(entry for entry in section["content"]["items"] if entry["id"] == item_id)
            item["fields"][field] = "<expected-change>"
        self.assertEqual(documents[1], documents[0])

    def test_improve_summary(self) -> None:
        original = parse_cv(_scaffold_cv())
        original_body = original.sections[0].content.items[0].fields["body"]
        result, _, _, _ = self._run_edit(
            "improve-summary",
            _scaffold_cv(),
            "Improve my professional summary. Keep the same facts; make it clearer and stronger.",
        )
        summary = _section_by_type(result, "summary")
        self.assertIsNotNone(summary)
        assert summary is not None
        self.assertTrue(summary.content.items)
        new_body = str(summary.content.items[0].fields.get("body") or "").strip()
        self.assertTrue(new_body)
        self.assertNotEqual(new_body, original_body)
        lowered = new_body.lower()
        for fact in ("analytical", "engine", "developer", "tool"):
            self.assertIn(fact, lowered)
        self._assert_only_item_field_changed(
            original, result, "summary", "summary-item", "body"
        )

    def test_build_from_blank_cv(self) -> None:
        result, _, _, _ = self._run_edit(
            "build-from-blank",
            _blank_cv(),
            (
                "Build this blank CV from only these supplied facts. Set the name to Jordan Lee and "
                "location to Austin, TX. Jordan is a software engineer. Add a short summary, one "
                "work-experience entry with exact title Backend Engineer, company NovaTech, and date "
                "2021 - Present. Add a skills section containing Python and Django. Leave unspecified "
                "contact fields blank and do not invent employers, dates, credentials, or metrics."
            ),
        )
        self.assertEqual(result.header.name, "Jordan Lee")
        self.assertEqual(result.header.location, "Austin, TX")
        self.assertEqual(result.header.phone, "")
        self.assertEqual(result.header.email, "")
        summary = _section_by_type(result, "summary")
        work = _section_by_type(result, "work-experience")
        skills = _section_by_type(result, "skills")
        self.assertIsNotNone(summary)
        self.assertIsNotNone(work)
        self.assertIsNotNone(skills)
        assert summary is not None and work is not None and skills is not None
        self.assertTrue(str(summary.content.items[0].fields.get("body") or "").strip())
        self.assertTrue(
            any(
                item.fields.get("title") == "Backend Engineer"
                and item.fields.get("subtitle") == "NovaTech"
                and item.fields.get("date") == "2021 - Present"
                for item in work.content.items
            )
        )
        skills_text = json.dumps([item.fields for item in skills.content.items]).lower()
        self.assertIn("python", skills_text)
        self.assertIn("django", skills_text)

    def test_edit_one_work_section_preserves_others(self) -> None:
        original = parse_cv(_work_cv())
        preserved = _work_item(original, "work-beta")
        self.assertIsNotNone(preserved)
        result, _, _, _ = self._run_edit(
            "edit-one-work-item",
            _work_cv(),
            (
                "Update only the Acme Corp work-experience entry (id work-acme). "
                "Rewrite its bullets to emphasize API reliability. "
                "Do not change the Beta Labs entry or any other section."
            ),
        )
        acme = _work_item(result, "work-acme")
        beta = _work_item(result, "work-beta")
        self.assertIsNotNone(acme)
        self.assertIsNotNone(beta)
        assert acme is not None and beta is not None and preserved is not None
        self.assertEqual(beta, preserved)
        original_acme = _work_item(original, "work-acme")
        assert original_acme is not None
        self.assertNotEqual(acme.get("bullets"), original_acme.get("bullets"))
        self._assert_only_item_field_changed(
            original, result, "work-experience", "work-acme", "bullets"
        )

    def test_fix_grammar_only(self) -> None:
        original = parse_cv(_grammar_cv())
        original_body = str(original.sections[0].content.items[0].fields["body"])
        result, _, _, _ = self._run_edit(
            "fix-grammar-only",
            _grammar_cv(),
            (
                "Fix grammar and spelling in the summary only. "
                "Do not add new facts, sections, jobs, or skills."
            ),
        )
        summary = _section_by_type(result, "summary")
        self.assertIsNotNone(summary)
        assert summary is not None
        new_body = str(summary.content.items[0].fields.get("body") or "")
        self.assertTrue(new_body.strip())
        self.assertNotEqual(new_body, original_body)
        lowered = new_body.lower()
        self.assertNotIn("experiense", lowered)
        self.assertNotIn("softwear", lowered)
        self.assertNotIn("builded", lowered)
        self.assertNotIn("sistems", lowered)
        for fact in ("experience", "software", "engineer", "system", "client"):
            self.assertIn(fact, lowered)
        self._assert_only_item_field_changed(
            original, result, "summary", "summary-item", "body"
        )

    def test_add_exact_certification(self) -> None:
        cert_title = "AWS Certified Solutions Architect - Associate"
        original = parse_cv(_scaffold_cv())
        result, _, _, _ = self._run_edit(
            "add-exact-certification",
            _scaffold_cv(),
            (
                f'Add a certifications section (or entry) with the exact title '
                f'"{cert_title}" issued by Amazon Web Services dated 2024.'
            ),
        )
        certs = _section_by_type(result, "certifications")
        self.assertIsNotNone(certs)
        assert certs is not None
        matching = [item for item in certs.content.items if item.fields.get("title") == cert_title]
        self.assertEqual(len(matching), 1)
        self.assertEqual(matching[0].fields.get("subtitle"), "Amazon Web Services")
        self.assertEqual(matching[0].fields.get("date"), "2024")
        self.assertEqual([section.type for section in result.sections], ["summary", "certifications"])
        original_summary = _section_by_type(original, "summary")
        result_summary = _section_by_type(result, "summary")
        self.assertIsNotNone(original_summary)
        self.assertIsNotNone(result_summary)
        assert original_summary is not None and result_summary is not None
        self.assertEqual(result.header, original.header)
        self.assertEqual(result.template, original.template)
        self.assertEqual(result.dateFormat, original.dateFormat)
        self.assertEqual(result_summary, original_summary)
