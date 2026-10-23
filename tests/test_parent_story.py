import copy
from datetime import datetime, timezone
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from parent_story import build_parent_story, story_profile, validate_parent_story, DAY

START = int(datetime(2026, 10, 17, 12, tzinfo=timezone.utc).timestamp() * 1000)


def trail(count):
    return {"stages": [{"osmId": f"node/{i + 1}", "name": f"Town {i + 1}",
                        "legMeters": 45000} for i in range(count)]}


class ParentStoryTests(unittest.TestCase):
    def test_seeded_profiles_and_facts_are_deterministic_diverse_and_solvable(self):
        motives, modes, states, intimate_cards = set(), set(), set(), set()
        for seed in range(200):
            profile = story_profile(str(seed), "fool")
            route = trail(13 if profile["finalState"] == "mobile" else 10)
            facts = build_parent_story(route, str(seed), "fool", START, profile)
            self.assertEqual(facts, build_parent_story(route, str(seed), "fool", START, profile))
            self.assertTrue(validate_parent_story(route, facts)["narrativeSolvable"])
            self.assertFalse(validate_parent_story(route, facts)["terrainValidated"])
            self.assertEqual(validate_parent_story(route, facts)["mandatoryClueCents"], 0)
            motives.add(profile["motive"])
            modes.add(profile["mode"])
            states.add(profile["finalState"])
            intimate_cards.add(facts["intimacy"]["card"])
            self.assertEqual(profile["intimacyCard"], story_profile(str(seed), "sun")["intimacyCard"])
        self.assertEqual(motives, {"cartomancer"})
        self.assertEqual(len(intimate_cards), 22)
        self.assertEqual(len(modes), 4)
        self.assertEqual(states, {"mobile", "stationary"})

    def test_seasonal_work_ends_in_past_september_even_for_january_start(self):
        january = int(datetime(2026, 1, 2, tzinfo=timezone.utc).timestamp() * 1000)
        profile = {"motive": "seasonal", "mode": "walk", "orientation": "upright",
                   "finalState": "stationary"}
        facts = build_parent_story(trail(10), "season", "fool", january, profile)
        end = datetime.fromtimestamp(facts["visits"][9]["departure"] / 1000, timezone.utc)
        self.assertEqual((end.year, end.month), (2025, 9))
        self.assertLess(facts["visits"][0]["arrival"], facts["visits"][9]["departure"])

    def test_mobile_continuation_is_future_dated_seven_days_per_leg_and_bounded(self):
        profile = {**story_profile("mobile", "fool"), "finalState": "mobile"}
        facts = build_parent_story(trail(13), "mobile", "fool", START, profile)
        self.assertEqual([m["elapsedMinutes"] for m in facts["movement"]],
                         [7 * 1440, 14 * 1440, 21 * 1440])
        for i, visit in enumerate(facts["visits"][10:]):
            self.assertEqual(visit["arrival"], START + (i + 1) * 7 * DAY)

    def test_simulator_rejects_impossible_chronology_missing_sources_and_inaccessible_clues(self):
        profile = {**story_profile("fixed", "fool"), "finalState": "stationary"}
        route = trail(10)
        facts = build_parent_story(route, "fixed", "fool", START, profile)
        for change in [
            lambda s: s["visits"][0].update(arrival=s["visits"][0]["departure"]),
            lambda s: s["visits"][0].update(clues=["buy", "photo", "buy"]),
            lambda s: s["movement"].append({"stage": 10, "elapsedMinutes": 1}),
        ]:
            corrupt = copy.deepcopy(facts)
            change(corrupt)
            with self.assertRaisesRegex(ValueError, "not narratively solvable"):
                validate_parent_story(route, corrupt)
        del route["stages"][0]["osmId"]
        with self.assertRaises(ValueError):
            validate_parent_story(route, facts)
