from copy import deepcopy

from django.test import SimpleTestCase

from .agent.tools.helpers import summarize_cv_for_agent
from .agent.tools.path_edit import _stage_edit
from .cv_schema import SCAFFOLD_CV_FIXTURE, parse_cv


class AgentKeepTogetherFlowTests(SimpleTestCase):
    def test_projection_and_whole_entity_rewrites_preserve_grouping(self) -> None:
        cv_data = deepcopy(SCAFFOLD_CV_FIXTURE)
        section = cv_data["sections"][0]
        item = section["content"]["items"][0]
        section["keepTogetherGroup"] = "section-group"
        item["keepTogetherGroup"] = "item-group"
        cv = parse_cv(cv_data)

        snapshot = summarize_cv_for_agent(cv)
        self.assertEqual(snapshot["sections"][0]["keepTogetherGroup"], "section-group")
        self.assertEqual(
            snapshot["sections"][0]["content"]["items"][0]["keepTogetherGroup"],
            "item-group",
        )

        candidate = deepcopy(cv_data)
        replacement_item = deepcopy(item)
        replacement_item.pop("keepTogetherGroup")
        replacement_item["fields"]["body"] = "Rewritten summary."
        ok, candidate, error = _stage_edit(
            candidate, "set", "sections[0].content.items[0]", replacement_item
        )
        self.assertTrue(ok, error)
        self.assertEqual(
            candidate["sections"][0]["content"]["items"][0]["keepTogetherGroup"],
            "item-group",
        )

        replacement_section = deepcopy(candidate["sections"][0])
        replacement_section.pop("keepTogetherGroup")
        replacement_section["title"] = "Rewritten section"
        ok, candidate, error = _stage_edit(candidate, "set", "sections[0]", replacement_section)
        self.assertTrue(ok, error)
        self.assertEqual(candidate["sections"][0]["keepTogetherGroup"], "section-group")

        explicit_item = deepcopy(candidate["sections"][0]["content"]["items"][0])
        explicit_item["keepTogetherGroup"] = "new-group"
        ok, candidate, error = _stage_edit(
            candidate, "set", "sections[0].content.items[0]", explicit_item
        )
        self.assertTrue(ok, error)
        self.assertEqual(
            candidate["sections"][0]["content"]["items"][0]["keepTogetherGroup"],
            "new-group",
        )
        persisted = parse_cv(candidate)
        self.assertEqual(persisted.sections[0].keepTogetherGroup, "section-group")
        self.assertEqual(persisted.sections[0].content.items[0].keepTogetherGroup, "new-group")
