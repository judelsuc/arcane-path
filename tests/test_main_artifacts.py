import copy
import sys
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from main_artifacts import MainArtifacts, WORLD
from journeys import JourneyRequest, JourneyConflict
from abandoned_journals import JournalForbidden
import test_lore_playtest as fixtures


class MainArtifactTests(unittest.TestCase):
    def setUp(self):
        fixture = fixtures.LorePlaytestTests()
        fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        self.fixture = fixture
        self.api = MainArtifacts(fixture.journeys, fixture.abandoned, clock=lambda: fixture.now)
        self.journey, self.token = fixture.journey, fixture.token
        self.state = copy.deepcopy(fixture.journeys.read(self.journey)["state"])

    def request(self, action=None, request_id=None, state=None):
        body = {"journey": self.journey, "requestId": request_id or str(uuid.uuid4()),
                "state": copy.deepcopy(state or self.state), "action": action}
        result = self.api.request(body, self.token)
        self.state = result["state"]
        return result, body

    def test_main_state_is_preserved_and_isolated_world_is_not_imported(self):
        self.state["name"] = "Main player"
        self.state["questDirections"] = []
        result, _ = self.request()
        self.assertEqual(result["world"], WORLD)
        self.assertEqual(result["state"]["name"], "Main player")
        self.assertEqual(result["state"]["questDirections"], [])
        self.assertEqual(result["state"]["trail"], self.fixture.journeys.read(self.journey)["state"]["trail"])
        with self.fixture.lore.connect() as db:
            self.assertEqual(db.execute("SELECT count(*) FROM sessions").fetchone()[0], 0)

    def test_receipts_replay_exactly_once_and_reject_conflicts(self):
        result, body = self.request({"type": "inquire"})
        self.assertTrue(any(entry["targetType"] == "artifact" for entry in self.state["discovery"]["entries"]))
        self.assertEqual(self.api.request(body, self.token), result)
        with self.assertRaises(JourneyConflict):
            self.api.request({**body, "action": None}, self.token)

    def test_stale_revision_and_fabricated_facts_do_not_grant_custody(self):
        old = copy.deepcopy(self.state)
        self.request()
        with self.assertRaisesRegex(JourneyRequest, "changed"):
            self.request(state=old)
        self.state["discovery"]["entries"] = []
        result, _ = self.request()
        self.assertEqual(result["owned"], [])
        with self.assertRaises(JourneyRequest):
            self.request({"type": "claim", "id": "hermit"})

    def test_source_capability_and_ordinary_travel_are_rejected(self):
        body = {"journey": self.journey, "requestId": str(uuid.uuid4()), "state": self.state, "action": None}
        with self.assertRaises(JournalForbidden):
            self.api.request(body, "f" * 64)
        with self.assertRaisesRegex(JourneyRequest, "ordinary travel"):
            self.request({"type": "rest"})

    def test_collect_power_cache_and_new_owner_share_one_physical_object(self):
        self.request({"type": "inquire", "id": "hermit"})
        view, body = self.request({"type": "claim", "id": "hermit"})
        self.assertEqual([item["id"] for item in view["owned"]], ["hermit"])
        self.assertEqual(self.state["lore"]["carriedGrams"], 15)
        self.assertEqual(self.api.request(body, self.token), view)
        view, _ = self.request({"type": "use", "id": "hermit", "target": "chariot"})
        clue = next(entry for entry in self.state["discovery"]["entries"] if entry["targetId"] == "chariot")
        self.assertEqual(clue["precision"], "local")
        self.assertIn("latitude", clue["facts"])
        elapsed = self.state["elapsedMinutes"]
        with self.api.connect() as db:
            world = self.api.decode(db.execute("SELECT * FROM world WHERE id=?", (WORLD,)).fetchone())
        anchor = next(item for item in world["instances"] if item["id"] == "hermit")
        self.state.update(col=anchor["col"], row=anchor["row"])
        view, _ = self.request({"type": "cache", "id": "hermit"})
        self.assertEqual(view["owned"], [])
        self.assertGreater(self.state["elapsedMinutes"], elapsed)
        other, token = self.fixture.source()
        state = copy.deepcopy(self.fixture.journeys.read(other)["state"])
        state.update(col=anchor["col"], row=anchor["row"])
        for action in ({"type": "inquire", "id": "hermit"}, {"type": "claim", "id": "hermit"}):
            result = self.api.request({"journey": other, "requestId": str(uuid.uuid4()), "state": state, "action": action}, token)
            state = result["state"]
        self.assertEqual([item["id"] for item in result["owned"]], ["hermit"])
        self.assertGreater(result["owned"][0]["cooldownUntil"], 0)
        with self.api.connect() as db:
            world = self.api.decode(db.execute("SELECT * FROM world WHERE id=?", (WORLD,)).fetchone())
        self.assertEqual(len(world["instances"]), 22)
        self.assertEqual(next(item for item in world["instances"] if item["id"] == "hermit")["owner"], other)

    def test_concurrent_collection_has_exactly_one_owner(self):
        self.request({"type": "inquire", "id": "hermit"})
        second, token = self.fixture.source()
        other_state = copy.deepcopy(self.fixture.journeys.read(second)["state"])
        other_state = self.api.request({"journey": second, "requestId": str(uuid.uuid4()),
                                       "state": other_state, "action": {"type": "inquire", "id": "hermit"}}, token)["state"]
        def claim(journey, capability, state):
            try:
                return self.api.request({"journey": journey, "requestId": str(uuid.uuid4()),
                                         "state": state, "action": {"type": "claim", "id": "hermit"}}, capability)
            except JourneyRequest as error:
                return str(error)
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda args: claim(*args), [
                (self.journey, self.token, self.state), (second, token, other_state)]))
        self.assertEqual(sum(isinstance(result, dict) for result in results), 1)
        self.assertTrue(any("unavailable" in result for result in results if isinstance(result, str)))

    def test_ending_a_main_journey_releases_its_objects(self):
        self.request({"type": "inquire", "id": "hermit"})
        self.request({"type": "claim", "id": "hermit"})
        self.state.update(ended="health", health=0)
        result, _ = self.request()
        self.assertEqual(result["owned"], [])
        self.assertEqual(result["state"]["ended"], "health")

    def test_shared_world_accepts_a_different_origin_without_moving_or_duplicating_objects(self):
        self.request()
        with self.api.connect() as db:
            before = self.api.decode(db.execute("SELECT * FROM world WHERE id=?", (WORLD,)).fetchone())
        other, token = self.fixture.source()
        record = copy.deepcopy(self.fixture.journeys.read(other))
        record["region"] = "paris"
        state = copy.deepcopy(record["state"])
        base = self.fixture.chunks.bases["paris"]
        state.update(col=base["width"] // 2, row=base["height"] // 2)
        from unittest.mock import patch
        with patch.object(self.api, "authorize", return_value=record):
            response = self.api.request({"journey": other, "requestId": str(uuid.uuid4()), "state": state, "action": None}, token)
        self.assertEqual(response["world"], WORLD)
        with self.api.connect() as db:
            after = self.api.decode(db.execute("SELECT * FROM world WHERE id=?", (WORLD,)).fetchone())
        self.assertEqual(before["instances"], after["instances"])

    def test_invalid_nested_investigations_are_explicitly_rejected(self):
        for field, value in [("trail", []), ("trail", {"index": None}),
                             ("discovery", []), ("discovery", {"entries": None}),
                             ("discovery", {}), ("discovery", {"entries": [None]}),
                             ("discovery", {"entries": [{}]}), ("elapsedMinutes", None)]:
            with self.subTest(field=field, value=value):
                invalid = copy.deepcopy(self.state)
                invalid[field] = value
                with self.assertRaisesRegex(JourneyRequest, "investigation"):
                    self.request(state=invalid)

    def test_inactive_custody_is_recached_without_duplicating_the_object(self):
        self.request({"type": "inquire", "id": "hermit"})
        self.request({"type": "claim", "id": "hermit"})
        self.fixture.now += 31 * 86400
        other, token = self.fixture.source()
        state = copy.deepcopy(self.fixture.journeys.read(other)["state"])
        self.api.request({"journey": other, "requestId": str(uuid.uuid4()),
                          "state": state, "action": None}, token)
        with self.api.connect() as db:
            world = self.api.decode(db.execute("SELECT * FROM world WHERE id=?", (WORLD,)).fetchone())
        self.assertEqual(len(world["instances"]), 22)
        item = next(item for item in world["instances"] if item["id"] == "hermit")
        self.assertIsNone(item["owner"])
        self.assertEqual(item["recallJourney"], self.journey)
        self.assertEqual(item["marker"], "cache:hermit")


if __name__ == "__main__":
    unittest.main()
