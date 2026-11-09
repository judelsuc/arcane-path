import collections
import json
import unittest

from legend_memories import EVENTS, PEOPLE, MOTIVES, COMPLICATIONS, AFTERMATHS, memory
import legend_wording


class LegendMemoriesTests(unittest.TestCase):
    def test_story_axes_have_distinct_substantial_choices_not_synonym_variations(self):
        self.assertEqual(len(EVENTS), 64)
        for choices in (EVENTS, PEOPLE, MOTIVES, COMPLICATIONS, AFTERMATHS):
            self.assertGreaterEqual(len(choices), 24)
            self.assertEqual(len(choices), len(set(choices)))
            self.assertTrue(all(isinstance(value, str) and 30 <= len(value) <= 180 for value in choices))

    def test_actual_seeded_output_has_high_variety_and_covers_every_axis(self):
        foundations = [memory(seed) for seed in range(8192)]
        unique = {json.dumps(item, sort_keys=True) for item in foundations}
        self.assertGreaterEqual(len(unique), 8184, "At least 99.9% of 8192 actual seeded foundations must differ.")
        for axis, choices in (("event", EVENTS), ("people", PEOPLE), ("motive", MOTIVES),
                              ("complication", COMPLICATIONS), ("aftermath", AFTERMATHS)):
            counts = collections.Counter(item[axis] for item in foundations)
            self.assertEqual(set(counts), set(choices))
            self.assertLess(max(counts.values()), len(foundations) / len(choices) * 1.5)
        # Seeds separated by the old twelve-entry period must not repeat a whole premise.
        self.assertTrue(all(memory(seed) != memory(seed + 12) for seed in range(512)))

    def test_seeded_facts_survive_reloads_and_enter_the_prompt_alongside_exact_object_name(self):
        plan = {"cells": [{"group": "woodland"}]}
        reward = {"nature": "ring", "name": {"en": "Copper Vigil", "fr": "Veille de cuivre"}}
        first = legend_wording.wording(plan, 123456789, reward)
        self.assertEqual(first, legend_wording.wording(plan, 123456789, reward))
        self.assertEqual(first["memory"], memory(123456789))
        self.assertEqual(first["treasureName"], reward["name"])
        request = legend_wording.provider_request(first, "fixture-model")
        self.assertEqual(json.loads(request["messages"][1]["content"]), first)
        self.assertIn("event, people, motive, complication and aftermath", request["messages"][0]["content"])
        self.assertIn("do not flatten", request["messages"][0]["content"])
