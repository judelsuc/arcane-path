import copy
import json
import sys
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from main_artifacts import MainArtifacts, WORLD, EUROPE_ANCHORS, EUROPE_DISTRIBUTION_VERSION
from lore_playtest import LorePlaytest
from journeys import JourneyRequest, JourneyConflict
from abandoned_journals import JournalForbidden
import test_lore_playtest as fixtures
from characters import Characters


class MainArtifactTests(unittest.TestCase):
    def setUp(self):
        fixture = fixtures.LorePlaytestTests()
        fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        self.fixture = fixture
        self.api = MainArtifacts(fixture.journeys, fixture.abandoned, clock=lambda: fixture.now)
        self.journey, self.token = fixture.journey, fixture.token
        self.state = copy.deepcopy(fixture.journeys.read(self.journey)["state"])
        # Custody tests use nearby fixtures; distribution is tested independently below.
        def local_world(base, origin):
            world = LorePlaytest.initial_world(base, origin)
            world["distributionVersion"] = EUROPE_DISTRIBUTION_VERSION
            return world
        self.api.initial_world = local_world

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

    def test_large_snapshot_response_is_complete_and_replays_without_a_second_revision(self):
        self.state["sidequests"] = [
            {"id": f"{index:032x}", "parent": f"Journal parent {index}",
             "history": [], "step": 0, "delivered": False,
             "stages": [{"name": f"Known journal destination {index}, stage {stage}",
                         "latitude": 44.5, "longitude": 2.3} for stage in range(10)]}
            for index in range(100)]
        before = copy.deepcopy(self.state)
        result, body = self.request()
        self.assertGreater(len(json.dumps(result).encode()), 65536)
        self.assertEqual(result["state"]["sidequests"], before["sidequests"])
        self.assertEqual(result["state"]["elapsedMinutes"], before["elapsedMinutes"])
        self.assertEqual(result["state"]["artifactRevision"], 1)
        self.assertEqual(self.api.request(body, self.token), result)
        with self.api.connect() as db:
            runtime = self.api.decode(db.execute("SELECT * FROM sessions WHERE journey=?",
                                                (self.journey,)).fetchone())
        self.assertEqual(runtime["revision"], 1)

    def test_character_leads_are_frozen_public_and_shared_without_time_or_a_selected_object(self):
        characters = Characters(self.fixture.journeys, self.fixture.lore, artifacts=self.api)
        self.api.characters = characters
        location = {"col": self.state["col"], "row": self.state["row"]}
        base = {"journey": self.journey, "location": location}
        character = characters.request({**base, "action": "create", "requestId": str(uuid.uuid4())}, self.token)
        with characters.connect() as db:
            knowledge = json.loads(db.execute("SELECT knowledge FROM world_characters WHERE character_id=?",
                                              (character["id"],)).fetchone()["knowledge"])
        self.assertTrue(any(item["clue"] for item in knowledge["artifacts"]))
        for item in knowledge["artifacts"]:
            if item["clue"]:
                self.assertIn(item["clue"]["precision"], ("region", "town"))
                self.assertLessEqual(set(item["clue"]["facts"]), {"artifact", "region", "place"})
        event = next(str(uuid.UUID(int=index)) for index in range(1, 100)
                     if characters._spontaneous_rumour(knowledge, character["id"], self.journey,
                                                       str(uuid.UUID(int=index))))
        characters.request({**base, "action": "meet", "characterId": character["id"],
                            "requestId": event}, self.token)
        before = copy.deepcopy(self.state)
        result, body = self.request({"type": "character-rumour", "characterId": character["id"], "eventId": event})
        self.assertEqual(self.api.request(body, self.token), result)
        self.assertEqual(result["state"]["elapsedMinutes"], before["elapsedMinutes"])
        self.assertEqual(result["state"]["walletCents"], before["walletCents"])
        entries = [entry for entry in result["state"]["discovery"]["entries"] if entry["targetType"] == "artifact"]
        self.assertTrue(any(entry["kind"] == "legend" for entry in entries))
        self.assertTrue(any(entry["kind"] == "location" for entry in entries))
        self.assertFalse(any("col" in entry["facts"] or "latitude" in entry["facts"] for entry in entries))
        self.assertEqual(result["conversationRumour"]["characterId"], character["id"])
        with self.assertRaises(JourneyRequest):
            self.request({**body["action"], "id": "hermit"})
        with self.assertRaises(JourneyConflict):
            self.request({**body["action"], "eventId": str(uuid.uuid4())})

    def test_new_character_knowledge_never_includes_a_carried_objects_location(self):
        self.request({"type": "inquire", "id": "hermit"})
        self.request({"type": "claim", "id": "hermit"})
        clues = self.api.character_knowledge(self.journey, "firmi",
            {"col": self.state["col"], "row": self.state["row"]})
        self.assertNotIn("hermit", clues)
        self.assertTrue(clues)
        self.assertFalse(any("owner" in json.dumps(clue) or "latitude" in json.dumps(clue)
                             for clue in clues.values()))

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


class EuropeanArtifactTests(unittest.TestCase):
    request = MainArtifactTests.request

    def setUp(self):
        MainArtifactTests.setUp(self)
        del self.api.initial_world

    def test_new_world_is_geographic_and_scattered_across_europe(self):
        base = self.fixture.chunks.bases["firmi"]
        world = self.api.initial_world(base, self.state)
        self.assertEqual(len(world["instances"]), 22)
        self.assertEqual(len({item["town"] for item in world["instances"]}), 22)
        self.assertEqual(len({item["region"] for item in world["instances"]}), 22)
        self.assertGreater(max(item["latitude"] for item in world["instances"]) -
                           min(item["latitude"] for item in world["instances"]), 20)
        self.assertGreater(max(item["longitude"] for item in world["instances"]) -
                           min(item["longitude"] for item in world["instances"]), 35)
        self.assertFalse(any(item["town"] == "Firmi" for item in world["instances"]))
        other_base = copy.deepcopy(base)
        other_base["bounds"] = {**base["bounds"], "minLongitude": -5, "maxLatitude": 55}
        other = self.api.initial_world(other_base, self.state)
        self.assertEqual([(item["id"], item["latitude"], item["longitude"]) for item in world["instances"]],
                         [(item["id"], item["latitude"], item["longitude"]) for item in other["instances"]])
        self.request()

    def test_redistribution_moves_all_unowned_once_and_preserves_carried_objects(self):
        base = self.fixture.chunks.bases["firmi"]
        world = LorePlaytest.initial_world(base, self.state)
        world["instances"][0].update(owner=self.journey, placement={"x": 0, "y": 0, "rotated": False})
        world["instances"][1].update(marker="cache:chariot", recallJourney=self.journey)
        carried = copy.deepcopy(world["instances"][0])
        self.assertTrue(self.api.redistribute_unowned(world))
        self.assertEqual(world["instances"][0], carried)
        for item, anchor in zip(world["instances"][1:], EUROPE_ANCHORS[1:]):
            self.assertEqual((item["town"], item["region"], item["latitude"], item["longitude"]), anchor)
            self.assertEqual(item["generation"], 2)
            self.assertIsNone(item["recallJourney"])
            self.assertTrue(item["marker"].startswith("virtual:"))
        world["instances"][1].update(col=5, row=6, town="Player cache",
                                     marker="cache:chariot", recallJourney=self.journey)
        before = copy.deepcopy(world)
        self.assertFalse(self.api.redistribute_unowned(world))
        self.assertEqual(world, before)

    def test_character_knowledge_migrates_legacy_world_and_uses_destination_region(self):
        base = self.fixture.chunks.bases["firmi"]
        legacy = LorePlaytest.initial_world(base, self.state)
        raw, checksum = self.api.encode(legacy)
        with self.api.connect() as db:
            db.execute("INSERT INTO world(id,region,payload,checksum) VALUES(?,?,?,?)",
                       (WORLD, "firmi", raw, checksum))
        clues = self.api.character_knowledge(self.journey, "firmi",
            {"col": self.state["col"], "row": self.state["row"]})
        self.assertFalse(any(clue["facts"].get("region") == base["name"] for clue in clues.values()))
        with self.api.connect() as db:
            world = self.api.decode(db.execute("SELECT * FROM world WHERE id=?", (WORLD,)).fetchone())
        self.assertEqual(world["distributionVersion"], EUROPE_DISTRIBUTION_VERSION)
        self.assertTrue(all("latitude" in item for item in world["instances"]))
        hermit = world["instances"][0]
        nearby = self.api.character_knowledge(self.journey, "firmi",
            {"col": hermit["col"], "row": hermit["row"]})
        self.assertEqual(nearby["hermit"]["facts"]["region"], "Portugal")
        self.assertEqual(nearby["hermit"]["facts"]["place"], "Lisbon")

    def test_request_migration_invalidates_old_leads_but_keeps_receipt_replay_exact(self):
        def local_world(base, origin):
            return {**LorePlaytest.initial_world(base, origin),
                    "distributionVersion": EUROPE_DISTRIBUTION_VERSION}
        self.api.initial_world = local_world
        original, body = self.request({"type": "inquire", "id": "hermit"})
        with self.api.connect() as db:
            world = self.api.decode(db.execute("SELECT * FROM world WHERE id=?", (WORLD,)).fetchone())
            del world["distributionVersion"]
            raw, checksum = self.api.encode(world)
            db.execute("UPDATE world SET payload=?,checksum=? WHERE id=?", (raw, checksum, WORLD))
        result, _ = self.request()
        old_leads = [entry for entry in result["state"]["discovery"]["entries"]
                     if entry["targetType"] == "artifact" and entry["kind"] == "location"]
        self.assertTrue(old_leads)
        self.assertTrue(all(entry["availability"] == "historical" for entry in old_leads))
        self.assertEqual(self.api.request(body, self.token), original)


if __name__ == "__main__":
    unittest.main()
