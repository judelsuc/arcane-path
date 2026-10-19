import collections
import json
import subprocess
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch, Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from abandoned_journals import AbandonedJournals, JournalForbidden
from journeys import JourneyStore, JourneyRequest, JourneyConflict, JourneyCapacity
from lore_playtest import LorePlaytest, WORLD, ARTIFACTS
from travel_server import ChunkStore, ChunkJobs, atomic_write, make_handler
from parent_paths import ParentPaths, find_path


class LorePlaytestTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.chunks = ChunkStore(cache=Path(directory.name))
        self.journeys = JourneyStore(self.chunks, atomic_write)
        self.abandoned = AbandonedJournals(self.journeys)
        self.now = 10000000
        self.lore = LorePlaytest(self.journeys, self.abandoned, clock=lambda: self.now)
        self.journey, self.token = self.source()

    def source(self):
        record, _ = self.journeys.create({
            "requestId": str(uuid.uuid4()), "region": "firmi", "name": "Alex"})
        journey = record["state"]["serverJourney"]["id"]
        token = uuid.uuid4().hex + uuid.uuid4().hex
        self.abandoned.bind(journey, token)
        return journey, token

    def request(self, operation="start", **values):
        return self.lore.request({"operation": operation, "journey": self.journey, **values}, self.token)

    def act(self, view, action, request_id=None):
        return self.request("action", expectedRevision=view["revision"], action=action,
                            requestId=request_id or str(uuid.uuid4()))

    def world(self):
        with self.lore.connect() as db:
            return self.lore.decode(db.execute("SELECT * FROM world WHERE id=?", (WORLD,)).fetchone())

    def walk_to(self, view, target):
        base = self.world()["map"]
        start = view["state"]["col"], view["state"]["row"]
        queue = collections.deque([(start, [])])
        seen = {start}
        while queue:
            (col, row), path = queue.popleft()
            if (col, row) == target:
                for dc, dr in path:
                    view = self.act(view, {"type": "walk", "dc": dc, "dr": dr})
                return view
            for dc, dr in ((0, 1), (1, 0), (0, -1), (-1, 0)):
                point = col + dc, row + dr
                if point in seen or not (0 <= point[0] < base["width"] and 0 <= point[1] < base["height"]):
                    continue
                cell = base["rows"][point[1]][point[0]]
                if cell.get("unavailable") or cell["terrain"] == "water":
                    continue
                seen.add(point)
                queue.append((point, path + [(dc, dr)]))
        self.fail("No real-map walk to artifact.")

    def claim_hermit(self):
        view = self.request()
        view = self.act(view, {"type": "inquire", "id": "hermit"})
        return self.act(view, {"type": "claim", "id": "hermit"})

    def claim_revealed(self, view, artifact):
        view = self.act(view, {"type": "use", "id": "hermit", "target": artifact})
        target = next(item for item in self.world()["instances"] if item["id"] == artifact)
        view = self.walk_to(view, (target["col"], target["row"]))
        return self.act(view, {"type": "claim", "id": artifact})

    def cached_hermit_and_owned_wheel(self):
        view = self.claim_revealed(self.claim_hermit(), "wheel")
        return self.act(view, {"type": "cache", "id": "hermit"})

    def test_all_instances_extend_an_old_world_once_without_resetting_existing_custody(self):
        view = self.claim_hermit()
        world = self.world()
        original = world["instances"][:3]
        world["instances"] = original
        with self.lore.connect() as db:
            raw, checksum = self.lore.encode(world)
            db.execute("UPDATE world SET payload=?,checksum=? WHERE id=?", (raw, checksum, WORLD))
        restored = self.request()
        self.assertEqual(restored["owned"], view["owned"])
        self.assertEqual(restored["state"]["elapsedMinutes"], view["state"]["elapsedMinutes"])
        extended = self.world()["instances"]
        self.assertEqual(extended[:3], original)
        self.assertEqual({item["id"] for item in extended},
                         set(ARTIFACTS))
        self.request()
        self.assertEqual(self.world()["instances"], extended)

    def test_fool_return_is_authorized_and_durable_without_walking_or_duplicate_payment(self):
        view = self.walk_to(self.claim_hermit(), (14, 11))
        view = self.claim_revealed(view, "fool")
        target = next(place for place in view["returnTargets"] if
                      (place["col"], place["row"]) == (14, 11))
        for invalid in ("[0,0]", [14, 11], {"col": 14, "row": 11}):
            with self.assertRaises(JourneyRequest):
                self.act(view, {"type": "use", "id": "fool", "target": invalid})
        receipt = str(uuid.uuid4())
        action = {"type": "use", "id": "fool", "target": target["id"]}
        result = self.act(view, action, receipt)
        self.assertEqual((result["state"]["col"], result["state"]["row"]), (14, 11))
        self.assertEqual(result["state"]["elapsedMinutes"], view["state"]["elapsedMinutes"] + 1)
        self.assertEqual(result["state"]["distanceMeters"], view["state"]["distanceMeters"])
        self.assertAlmostEqual(result["state"]["fatigue"], view["state"]["fatigue"] + 10)
        self.assertEqual(result["bag"]["placements"], view["bag"]["placements"])
        self.lore = LorePlaytest(self.journeys, self.abandoned, clock=lambda: self.now)
        self.assertEqual(self.act(view, action, receipt), result)
        self.assertEqual(self.request(), result)

    def test_wheel_recall_retains_target_cooldown_and_commits_exactly_once(self):
        view = self.cached_hermit_and_owned_wheel()
        old = next(item for item in self.world()["instances"] if item["id"] == "hermit")
        self.assertEqual(view["recallTargets"], ["hermit"])
        action = {"type": "use", "id": "wheel", "target": "hermit"}
        receipt = str(uuid.uuid4())
        result = self.act(view, action, receipt)
        recalled = next(item for item in self.world()["instances"] if item["id"] == "hermit")
        self.assertEqual(recalled["owner"], self.journey)
        self.assertIsNone(recalled["recallJourney"])
        self.assertEqual(recalled["generation"], old["generation"] + 1)
        self.assertEqual(recalled["cooldownUntil"], old["cooldownUntil"])
        self.assertEqual(result["state"]["elapsedMinutes"], view["state"]["elapsedMinutes"] + 1)
        self.assertAlmostEqual(result["state"]["fatigue"], view["state"]["fatigue"] + 10)
        self.assertEqual(result["bag"]["grams"], view["bag"]["grams"] + 15)
        self.assertEqual(next(item for item in result["owned"] if item["id"] == "wheel")["cooldownUntil"],
                         result["worldMinutes"] + 4320)
        self.assertNotIn("recallJourney", json.dumps(result))
        self.lore = LorePlaytest(self.journeys, self.abandoned, clock=lambda: self.now)
        self.assertEqual(self.act(view, action, receipt), result)
        self.assertEqual(self.request(), result)

    def test_sun_restoration_is_atomic_and_does_not_refill_food_or_reset_sleep(self):
        view = self.claim_hermit()
        with self.lore.connect() as db:
            runtime = self.lore.decode(db.execute(
                "SELECT * FROM sessions WHERE journey=?", (self.journey,)).fetchone())
            state = runtime["state"]
            state["startedAt"] = 1792411200000 - state["elapsedMinutes"] * 60000  # 19 Oct, 12:00 UTC.
            state["health"] = 20
            state["fatigue"] = 30
            raw, checksum = self.lore.encode(runtime)
            db.execute("UPDATE sessions SET payload=?,checksum=? WHERE journey=?",
                       (raw, checksum, self.journey))
        view = self.claim_revealed(self.request(), "sun")
        receipt = str(uuid.uuid4())
        result = self.act(view, {"type": "use", "id": "sun"}, receipt)
        self.assertEqual(result["state"]["health"], 100)
        self.assertEqual(result["state"]["fatigue"], 0)
        self.assertLess(result["state"]["reserveKcal"], view["state"]["reserveKcal"] - 500)
        self.assertAlmostEqual(result["state"]["awakeHours"], view["state"]["awakeHours"] + 1 / 60)
        self.assertEqual(result["state"]["elapsedMinutes"], view["state"]["elapsedMinutes"] + 1)
        self.assertEqual(next(item for item in result["owned"] if item["id"] == "sun")["cooldownUntil"],
                         result["worldMinutes"] + 4320)
        self.assertEqual(self.act(view, {"type": "use", "id": "sun"}, receipt), result)
        with self.assertRaisesRegex(JourneyRequest, "cooling"):
            self.act(result, {"type": "use", "id": "sun"})

    def test_wheel_recall_and_other_journey_claim_compete_for_one_instance_atomically(self):
        first = self.cached_hermit_and_owned_wheel()
        other, token = self.source()

        def other_act(view, action):
            return self.lore.request({"operation": "action", "journey": other,
                "requestId": str(uuid.uuid4()), "expectedRevision": view["revision"],
                "action": action}, token)

        second = self.lore.request({"operation": "start", "journey": other}, token)
        hermit = next(item for item in self.world()["instances"] if item["id"] == "hermit")
        # Both claimants are at the cache; the real actions still arbitrate custody.
        with self.lore.connect() as db:
            runtime = self.lore.decode(db.execute(
                "SELECT * FROM sessions WHERE journey=?", (other,)).fetchone())
            runtime["state"]["col"], runtime["state"]["row"] = hermit["col"], hermit["row"]
            raw, checksum = self.lore.encode(runtime)
            db.execute("UPDATE sessions SET payload=?,checksum=? WHERE journey=?",
                       (raw, checksum, other))
        second = other_act(second, {"type": "inquire", "id": "hermit"})

        def attempt(which):
            try:
                return self.act(first, {"type": "use", "id": "wheel", "target": "hermit"}) if which == 0 else \
                    other_act(second, {"type": "claim", "id": "hermit"})
            except JourneyRequest as error:
                return str(error)

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(attempt, (0, 1)))
        self.assertEqual(sum(isinstance(result, dict) for result in results), 1)
        target = next(item for item in self.world()["instances"] if item["id"] == "hermit")
        self.assertIn(target["owner"], (self.journey, other))
        self.assertIsNone(target["recallJourney"])
        first_now = self.request()
        second_now = self.lore.request({"operation": "sync", "journey": other}, token)
        self.assertEqual(sum(item["id"] == "hermit" for result in (first_now, second_now)
                             for item in result["owned"]), 1)
        if target["owner"] == other:
            other_act(second_now, {"type": "cache", "id": "hermit"})
            self.assertEqual(self.request()["recallTargets"], [])
        else:
            self.assertEqual(second_now["revision"], second["revision"])

    def test_inactivity_recaching_keeps_private_recall_entitlement_without_exposing_owner(self):
        self.claim_hermit()
        self.now += 30 * 86400 + 1
        view = self.request()
        hermit = next(item for item in self.world()["instances"] if item["id"] == "hermit")
        self.assertEqual(hermit["recallJourney"], self.journey)
        self.assertEqual(view["recallTargets"], ["hermit"])
        self.assertNotIn("recallJourney", json.dumps(view))
        other, token = self.source()
        other_view = self.lore.request({"operation": "start", "journey": other}, token)
        self.assertEqual(other_view["recallTargets"], [])

    def test_interpretation_is_authoritative_persistent_and_exactly_once(self):
        view = self.act(self.request(), {"type": "inquire", "id": "hermit"})
        view = self.walk_to(view, (14, 11))
        world = self.world()
        with self.lore.connect() as db:
            runtime = self.lore.decode(db.execute(
                "SELECT * FROM sessions WHERE journey=?", (self.journey,)).fetchone())
            original_start = runtime["state"]["startedAt"]
            for day in range(180):
                runtime["state"]["startedAt"] = original_start + day * 86400000
                view = self.lore.worker("view", world, self.journey, runtime=runtime)["view"]
                if view["interpretation"]["status"] == "paid":
                    break
            self.assertEqual(view["interpretation"]["status"], "paid")
            raw, checksum = self.lore.encode(runtime)
            db.execute("UPDATE sessions SET payload=?,checksum=? WHERE journey=?",
                       (raw, checksum, self.journey))
        entry = next(e for e in view["state"]["discovery"]["entries"] if e["targetId"] == "hermit")
        evidence = json.dumps([entry[k] for k in (
            "targetType", "targetId", "targetRevision", "evidenceKey", "precision")],
            separators=(",", ":"))
        action = {"type": "interpret-clue", "evidence": evidence}
        for invalid in ({**action, "cents": 0}, {**action, "source": "hermit"},
                        {**action, "evidence": ""}, {**action, "evidence": []}):
            with self.assertRaises(JourneyRequest):
                self.act(view, invalid)
        receipt = str(uuid.uuid4())
        result = self.act(view, action, receipt)
        self.assertEqual(result["state"]["walletCents"],
                         view["state"]["walletCents"] - view["interpretation"]["cents"])
        self.assertEqual(result["state"]["elapsedMinutes"], view["state"]["elapsedMinutes"] + 10)
        self.assertEqual(result["state"]["discovery"], view["state"]["discovery"])
        self.assertEqual(result["state"]["lore"]["interpretations"],
                         [{"evidence": evidence, "source": "npc",
                           "observedMinutes": result["state"]["elapsedMinutes"]}])
        self.lore = LorePlaytest(self.journeys, self.abandoned, clock=lambda: self.now)
        self.assertEqual(self.act(view, action, receipt), result)
        self.assertEqual(self.request(), result)
        with self.assertRaisesRegex(JourneyRequest, "already interpreted"):
            self.act(result, action)
        with self.assertRaisesRegex(JourneyRequest, "earned clue"):
            self.act(result, {**action, "evidence": "invented"})
        self.assertEqual(self.request(), result)

    def test_source_genesis_and_local_main_save_are_not_accepted_as_a_state_checkpoint(self):
        genesis = self.journeys.read(self.journey)
        view = self.request()
        self.assertEqual(view["world"], WORLD)
        self.assertEqual(view["state"]["elapsedMinutes"], 0)
        for field in ("trail", "serverJourney", "journalAccess", "character", "equipment"):
            self.assertNotIn(field, view["state"])
        for field in ("col", "elapsedMinutes", "state", "reserveKcal", "owner"):
            with self.assertRaises(JourneyRequest):
                self.request(**{field: 999})
        with self.assertRaises(JourneyRequest):
            self.act(view, {"type": "walk", "dc": 0, "dr": 1, "state": {"reserveKcal": 9999}})
        self.assertEqual(self.journeys.read(self.journey), genesis)

    def test_changed_real_journal_step_revalidates_earned_moon_receipt_without_following_future_steps(self):
        self.request()
        other, token = self.source()
        self.abandoned.request({"journey": other, "col": 14, "row": 10, "ended": "hunger", "index": 0}, token)
        known = [{"targetType": "abandoned-journal", "targetId": other}]
        truth, = self.abandoned.discovery_truths(self.journey, known, 0)
        with self.lore.connect() as db:
            runtime = self.lore.decode(db.execute(
                "SELECT * FROM sessions WHERE journey=?", (self.journey,)).fetchone())
        state = runtime["state"]
        state["discovery"]["entries"].append(truth)
        identity = json.dumps([truth[key] for key in (
            "targetType", "targetId", "targetRevision", "evidenceKey", "precision")], separators=(",", ":"))
        state["lore"]["moonReceipts"] = [{"observedMinutes": 60, "clues": [
            {"evidence": identity, "availability": "current"}]}]
        result = {"runtime": runtime}
        self.assertFalse(self.lore.revalidate_journal_discovery(result))
        original_facts = dict(truth["facts"])
        with self.abandoned.connect() as db:
            db.execute("UPDATE journals SET step=1 WHERE id=?", (other,))
        self.assertTrue(self.lore.revalidate_journal_discovery(result))
        self.assertEqual(truth["availability"], "historical")
        self.assertEqual(truth["facts"], original_facts)
        self.assertEqual(state["lore"]["moonReceipts"][0]["clues"][0]["availability"], "historical")
        self.assertFalse(self.lore.revalidate_journal_discovery(result))

    def test_private_capability_is_required_and_another_journey_token_cannot_impersonate(self):
        other, token = self.source()
        for invalid in (None, "bad", token):
            with self.assertRaises(JournalForbidden):
                self.lore.request({"operation": "start", "journey": self.journey}, invalid)
        self.assertEqual(self.lore.request({"operation": "start", "journey": other}, token)["revision"], 1)

    def test_start_resume_and_restart_keep_authoritative_position_clock_and_map(self):
        first = self.request()
        stepped = self.act(first, {"type": "walk", "dc": 0, "dr": 1})
        self.assertGreater(stepped["state"]["elapsedMinutes"], 0)
        self.assertEqual(stepped["state"]["row"], first["state"]["row"] + 1)
        self.lore = LorePlaytest(self.journeys, self.abandoned, clock=lambda: self.now)
        self.assertEqual(self.request(), stepped)
        map_response = self.request("map")
        self.assertEqual(map_response["map"], self.chunks.bases["firmi"])
        self.assertNotIn("instances", map_response)

    def test_retries_are_exact_and_different_commands_cannot_reuse_a_receipt(self):
        first = self.request()
        request_id = str(uuid.uuid4())
        action = {"type": "inquire", "id": "hermit"}
        result = self.act(first, action, request_id)
        self.assertEqual(self.act(first, action, request_id), result)
        with self.assertRaises(JourneyConflict):
            self.act(first, {"type": "rest"}, request_id)
        with self.assertRaises(JourneyConflict):
            self.act(first, action)
        self.assertEqual(self.request()["revision"], 2)

    def test_same_receipt_in_parallel_commits_once(self):
        first = self.request()
        request_id = str(uuid.uuid4())
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(lambda _: self.act(first, {"type": "walk", "dc": 0, "dr": 1},
                                                      request_id), range(4)))
        self.assertTrue(all(value == results[0] for value in results))
        self.assertEqual(self.request()["revision"], 2)

    def test_competing_claims_have_one_owner_one_bag_and_no_duplicate_claim(self):
        first = self.request()
        first = self.act(first, {"type": "inquire", "id": "hermit"})
        other, token = self.source()
        second = self.lore.request({"operation": "start", "journey": other}, token)
        second = self.lore.request({"operation": "action", "journey": other,
                                   "requestId": str(uuid.uuid4()), "expectedRevision": second["revision"],
                                   "action": {"type": "inquire", "id": "hermit"}}, token)

        def claim(args):
            journey, capability, view = args
            try:
                return self.lore.request({"operation": "action", "journey": journey,
                                         "requestId": str(uuid.uuid4()), "expectedRevision": view["revision"],
                                         "action": {"type": "claim", "id": "hermit"}}, capability)
            except JourneyRequest as error:
                return str(error)

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(claim, [(self.journey, self.token, first), (other, token, second)]))
        self.assertEqual(sum(isinstance(value, dict) for value in results), 1)
        instance = self.world()["instances"][0]
        self.assertIn(instance["owner"], (self.journey, other))
        for journey, capability in ((self.journey, self.token), (other, token)):
            view = self.lore.request({"operation": "sync", "journey": journey}, capability)
            expected = 1 if instance["owner"] == journey else 0
            self.assertEqual(len(view["owned"]), expected)
            self.assertEqual(len(view["bag"]["placements"]), expected)
            self.assertNotIn(other if journey == self.journey else self.journey, json.dumps(view))
            self.assertNotIn("instances", view)

    def test_complete_hermit_revelation_cache_resume_and_reclaim_loop(self):
        claimed = self.claim_hermit()
        self.assertEqual(claimed["bag"]["grams"], 1415)
        used = self.act(claimed, {"type": "use", "id": "hermit", "target": "chariot"})
        revealed = [entry for entry in used["state"]["discovery"]["entries"]
                    if entry["targetId"] == "chariot"][0]
        self.assertEqual(revealed["precision"], "local")
        self.assertEqual(revealed["facts"]["col"], self.world()["instances"][1]["col"])
        cooldown = used["owned"][0]["cooldownUntil"]
        with self.assertRaisesRegex(JourneyRequest, "cooling"):
            self.act(used, {"type": "use", "id": "hermit", "target": "chariot"})
        anchor = self.world()["instances"][0]
        at_town = self.walk_to(used, (anchor["col"], anchor["row"]))
        cached = self.act(at_town, {"type": "cache", "id": "hermit"})
        self.assertEqual(cached["owned"], [])
        self.assertEqual(self.request()["owned"], [])
        heard = self.act(cached, {"type": "inquire", "id": "hermit"})
        reclaimed = self.act(heard, {"type": "claim", "id": "hermit"})
        self.assertEqual(reclaimed["owned"][0]["cooldownUntil"], cooldown)
        self.assertEqual(len(reclaimed["bag"]["placements"]), 1)
        with self.abandoned.connect() as db:
            self.assertEqual(db.execute("SELECT count(*) FROM journals").fetchone()[0], 0)

    def test_failed_commands_roll_back_world_resources_receipts_and_revision(self):
        first = self.request()
        world = self.world()
        for action in ({"type": "claim", "id": "hermit"}, {"type": "walk", "dc": 2, "dr": 0},
                       {"type": "use", "id": "hermit", "target": "chariot"},
                       {"type": "pack", "id": "hermit", "x": 0, "y": 0, "rotated": False}):
            with self.assertRaises(JourneyRequest):
                self.act(first, action)
        self.assertEqual(self.world(), world)
        self.assertEqual(self.request(), first)
        with self.lore.connect() as db:
            self.assertEqual(db.execute("SELECT count(*) FROM receipts").fetchone()[0], 0)

    def test_all_three_powers_are_reachable_without_granting_resources_or_inscriptions(self):
        view = self.claim_hermit()
        view = self.act(view, {"type": "use", "id": "hermit", "target": "chariot"})
        for dr in (-1, 1, -1, 1):
            view = self.act(view, {"type": "walk", "dc": 0, "dr": dr})
        self.assertGreaterEqual(view["state"]["distanceMeters"], 1000)
        chariot = self.world()["instances"][1]
        view = self.walk_to(view, (chariot["col"], chariot["row"]))
        view = self.act(view, {"type": "claim", "id": "chariot"})
        view = self.act(view, {"type": "share", "id": "hermit"})
        view = self.act(view, {"type": "share", "id": "chariot"})
        self.assertEqual(set(view["state"]["lore"]["shared"]), {"hermit", "chariot"})
        view = self.act(view, {"type": "use", "id": "chariot"})
        self.assertEqual(view["state"]["lore"]["effects"]["remainingMeters"], 20000)
        temperance = self.world()["instances"][2]
        view = self.walk_to(view, (temperance["col"], temperance["row"]))
        self.assertLess(view["state"]["lore"]["effects"]["remainingMeters"], 20000)
        view = self.act(view, {"type": "inquire", "id": "temperance"})
        view = self.act(view, {"type": "claim", "id": "temperance"})
        before = view["state"]
        view = self.act(view, {"type": "use", "id": "temperance"})
        self.assertGreater(before["fatigue"], 0)
        self.assertEqual(view["state"]["fatigue"], max(0, before["fatigue"] - 40))
        self.assertLess(view["state"]["reserveKcal"], before["reserveKcal"] - 500)
        self.assertEqual(len(view["owned"]), 3)
        self.assertEqual(len(view["bag"]["placements"]), 3)
        self.assertEqual(view, self.request())

    def test_inactivity_recaches_once_and_polling_or_old_receipts_do_not_renew_the_lease(self):
        first = self.request()
        heard = self.act(first, {"type": "inquire", "id": "hermit"})
        receipt = str(uuid.uuid4())
        claimed = self.act(heard, {"type": "claim", "id": "hermit"}, receipt)
        before = self.world()["instances"][0]["generation"]
        self.now += 29 * 86400
        self.assertEqual(len(self.request()["owned"]), 1)
        self.assertEqual(self.act(heard, {"type": "claim", "id": "hermit"}, receipt), claimed)
        self.now += 86400 + 1
        self.assertEqual(self.request()["owned"], [])
        self.assertEqual(self.world()["instances"][0]["generation"], before + 1)
        self.assertEqual(self.request()["owned"], [])
        self.assertEqual(self.world()["instances"][0]["generation"], before + 1)

    def test_transferring_to_a_new_lower_clock_journey_preserves_the_world_cooldown(self):
        view = self.claim_hermit()
        view = self.act(view, {"type": "use", "id": "hermit", "target": "chariot"})
        cooldown = view["owned"][0]["cooldownUntil"]
        anchor = self.world()["instances"][0]
        view = self.walk_to(view, (anchor["col"], anchor["row"]))
        self.act(view, {"type": "cache", "id": "hermit"})
        self.journey, self.token = self.source()
        new_view = self.claim_hermit()
        self.assertEqual(new_view["owned"][0]["cooldownUntil"], cooldown)
        self.assertEqual(new_view["state"]["elapsedMinutes"], 12)
        self.assertGreater(new_view["worldMinutes"], new_view["state"]["elapsedMinutes"])
        with self.assertRaisesRegex(JourneyRequest, "cooling"):
            self.act(new_view, {"type": "use", "id": "hermit", "target": "chariot"})

    def test_sleep_receipt_pins_one_private_chance_and_retry_restart_cannot_reroll_or_recharge(self):
        before = self.request()
        receipt = str(uuid.uuid4())
        result = self.act(before, {"type": "sleep"}, receipt)
        episode = result["state"]["lore"]["dreams"]["episodes"][0]
        self.assertIn(episode["outcome"], ("clue", "miss"))
        self.assertEqual(episode["startedMinutes"], 0)
        self.assertEqual(episode["wokeMinutes"], 480)
        self.assertNotIn("roll", episode)
        self.assertNotIn("chance", episode)
        with self.lore.connect() as db:
            saved = self.lore.decode(db.execute("SELECT * FROM sessions WHERE journey=?",
                                                (self.journey,)).fetchone())
        private = saved["state"]["lore"]["dreams"]["episodes"][0]
        self.assertGreaterEqual(private["roll"], 0)
        self.assertLess(private["roll"], 1)
        self.assertEqual(private["outcome"], "clue" if private["roll"] < private["chance"] else "miss")
        self.assertEqual(self.act(before, {"type": "sleep"}, receipt), result)
        self.lore = LorePlaytest(self.journeys, self.abandoned, clock=lambda: self.now)
        self.assertEqual(self.request(), result)
        again = self.act(result, {"type": "sleep"})
        self.assertEqual(len(again["state"]["lore"]["dreams"]["episodes"]), 1)
        self.assertEqual(again["state"]["elapsedMinutes"], 960)

    def test_journal_provider_reads_only_real_available_nearby_rumours_and_never_changes_main_custody(self):
        author, author_token = self.source()
        self.abandoned.request({"journey": author, "col": 14, "row": 10, "ended": "health",
                                "index": 0, "action": "sync"}, author_token)
        with self.abandoned.connect() as db:
            original = dict(db.execute("SELECT * FROM journals WHERE id=?", (author,)).fetchone())
        started = self.request()
        view = self.act(started, {"type": "inquire-clue"})
        self.assertEqual(view["state"]["elapsedMinutes"], started["state"]["elapsedMinutes"])
        entry = view["state"]["discovery"]["entries"][0]
        self.assertEqual(entry["targetType"], "abandoned-journal")
        self.assertEqual(entry["targetId"], author)
        self.assertEqual(set(entry["facts"]), {"parent", "observedCol", "observedRow"})
        self.assertEqual((entry["facts"]["observedCol"], entry["facts"]["observedRow"]), (14, 10))
        for private in ("stages", "notebook", "finder", "latitude", "longitude", "distanceMeters"):
            self.assertNotIn(private, entry["facts"])
        with self.abandoned.connect() as db:
            after = dict(db.execute("SELECT * FROM journals WHERE id=?", (author,)).fetchone())
        self.assertEqual(original, after)
        finder, finder_token = self.source()
        self.abandoned.request({"journey": finder, "col": 14, "row": 10,
                                "action": "claim", "journal": author}, finder_token)
        updated = self.request()
        self.assertEqual(updated["state"]["discovery"]["entries"][0]["availability"], "unavailable")
        self.assertNotIn(finder, json.dumps(updated))
        self.assertEqual(self.abandoned.discovery_rumours(self.journeys.read(self.journey), 14, 10), [])
        self.assertEqual(self.abandoned.discovery_rumours(self.journeys.read(author), 14, 10), [])

    def test_journal_claim_during_an_action_is_revalidated_not_a_current_location_promise(self):
        author, author_token = self.source()
        self.abandoned.request({"journey": author, "col": 14, "row": 10, "ended": "health",
                                "index": 0, "action": "sync"}, author_token)
        view = self.request()
        actual = self.lore.worker
        def worker(operation, *args, **kwargs):
            result = actual(operation, *args, **kwargs)
            if operation == "action":
                with self.abandoned.connect() as db:
                    db.execute("UPDATE journals SET finder=?,touched=? WHERE id=?",
                               ("f" * 32, self.abandoned.clock(), author))
            return result
        with patch.object(self.lore, "worker", side_effect=worker):
            result = self.act(view, {"type": "inquire-clue"})
        entry = result["state"]["discovery"]["entries"][0]
        self.assertEqual(entry["targetType"], "abandoned-journal")
        self.assertEqual(entry["availability"], "unavailable")
        self.assertNotIn("f" * 32, json.dumps(result))

    def test_checksum_corruption_is_explicit_and_never_silently_resets_a_world_or_journey(self):
        self.request()
        for table in ("world", "sessions"):
            with self.subTest(table=table):
                with self.lore.connect() as db:
                    row = db.execute(f"SELECT * FROM {table}").fetchone()
                    db.execute(f"UPDATE {table} SET checksum='bad'")
                with self.assertRaisesRegex(ValueError, "Corrupt lore state"):
                    self.request()
                with self.lore.connect() as db:
                    db.execute(f"UPDATE {table} SET checksum=?", (row["checksum"],))
                self.assertEqual(self.request()["revision"], 1)

    def test_unavailable_worker_is_explicit_and_does_not_commit_an_action(self):
        before = self.request()
        for error in (FileNotFoundError("node"), subprocess.TimeoutExpired(["node"], 8)):
            with patch("lore_playtest.subprocess.run", side_effect=error):
                with self.assertRaises(JourneyCapacity):
                    self.act(before, {"type": "rest"})
            self.assertEqual(self.request(), before)

    def test_all_sixteen_new_commands_settle_once_and_survive_restart(self):
        self.request()
        original_genesis = self.journeys.read(self.journey)
        with self.lore.connect() as db:
            baseline = self.lore.decode(db.execute("SELECT * FROM sessions WHERE journey=?", (self.journey,)).fetchone())
        for artifact in ARTIFACTS[6:]:
            with self.subTest(artifact=artifact):
                runtime = json.loads(json.dumps(baseline))
                state = runtime["state"]
                state["startedAt"] = 1792447200000
                state["col"], state["row"] = 14, 11
                state["lore"]["visitedSettlements"] = [
                    {"col": 14, "row": 11, "town": "Lestrunie", "observedMinutes": 0}]
                state["lore"]["lastSettlement"] = {"col": 14, "row": 11, "town": "Lestrunie"}
                state["lore"]["start"] = {"col": 14, "row": 11}
                state["trail"]["stages"][state["trail"]["index"]].update(col=14, row=9)
                state["reserveKcal"], state["fatigue"] = 1700, 10
                if artifact == "justice":
                    state["lore"]["debits"] = [
                        {"id": "fixture-paid-meal", "observedMinutes": 0, "cents": 123, "reclaimedCents": 0, "kind": "meal"}]
                state["discovery"]["entries"] = []
                for known in ("hermit", "fool"):
                    state["discovery"]["entries"].append({
                        "targetType": "artifact", "targetId": known, "targetRevision": "inscription:1",
                        "evidenceKey": "inscription", "kind": "inscription", "precision": "text",
                        "facts": {"artifact": known, "fr": "Copie historique", "en": "Historical copy"},
                        "source": "artifact-inscription", "channels": ["notebook"], "observedMinutes": 0,
                        "availability": "current", "contentVersion": "template-v1"})
                with self.lore.connect() as db:
                    world = self.lore.decode(db.execute("SELECT * FROM world WHERE id=?", (WORLD,)).fetchone())
                    for item in world["instances"]:
                        item.update(owner=self.journey if item["id"] == artifact else None,
                                    placement={"id": artifact, "x": 0, "y": 0, "rotated": False}
                                    if item["id"] == artifact else None, cooldownUntil=0)
                    raw, checksum = self.lore.encode(world)
                    db.execute("UPDATE world SET payload=?,checksum=? WHERE id=?", (raw, checksum, WORLD))
                    raw, checksum = self.lore.encode(runtime)
                    db.execute("UPDATE sessions SET payload=?,checksum=? WHERE journey=?", (raw, checksum, self.journey))
                view = self.request("sync")
                command = {"type": "use", "id": artifact}
                if artifact == "magician":
                    command["target"] = "bookshop"
                elif artifact == "priestess":
                    command["target"] = next(target["id"] for target in view["truthTargets"]
                                             if target["domain"] == "parent-trail")
                elif artifact == "hierophant":
                    command["targets"] = [view["fragments"][0]["id"]]
                elif artifact == "judgement":
                    command["target"] = "world"
                elif artifact == "world":
                    view = self.act(view, {"type": "inquire", "id": "fool"})
                    command["target"] = view["worldTargets"][0]["id"]
                before = view["state"]["elapsedMinutes"]
                receipt = str(uuid.uuid4())
                used = self.act(view, command, receipt)
                self.assertEqual(used["state"]["elapsedMinutes"] - before, 11 if artifact == "hierophant" else 1)
                self.assertEqual(used, self.act(view, command, receipt))
                self.lore = LorePlaytest(self.journeys, self.abandoned, clock=lambda: self.now)
                self.assertEqual(used, self.request("sync"))
                self.assertNotIn("recallJourney", json.dumps(used))
                self.assertNotIn('"seed"', json.dumps(used))
        self.assertEqual(original_genesis, self.journeys.read(self.journey))

    def test_work_session_is_durable_private_server_replayed_and_timeout_cannot_award_money(self):
        view = self.request()
        view = self.walk_to(view, (14, 11))
        self.assertIsNotNone(view["workOffer"])
        view = self.act(view, {"type": "work-start", "language": "fr"})
        self.assertEqual(view["work"]["status"], "sorting")
        self.assertNotIn("work", view["state"]["lore"])
        self.assertNotIn('"bookId"', json.dumps(view["work"]))
        self.lore = LorePlaytest(self.journeys, self.abandoned, clock=lambda: self.now)
        self.assertEqual(view, self.request("sync"))
        with self.assertRaises(JourneyRequest):
            self.act(view, {"type": "work-move", "move": {"type": "serve", "score": 999}})
        with self.assertRaises(JourneyRequest):
            self.act(view, {"type": "rest"})
        wallet = view["state"]["walletCents"]
        self.now += 600
        expired = self.request("sync")
        self.assertEqual(expired["work"]["status"], "failed")
        settled = self.act(expired, {"type": "work-move", "move": {"type": "cancel"}})
        self.assertIsNone(settled["work"])
        self.assertIsNotNone(settled["workOffer"])
        self.assertEqual(settled["state"]["walletCents"], wallet)
        self.assertEqual(settled["state"]["lore"]["earnedActivities"], 0)

    def test_real_distant_genesis_destination_routes_privately_then_star_and_world_work_on_prepared_terrain(self):
        before = self.request()
        genesis = self.journeys.read(self.journey)
        base = self.world()["map"]
        start = before["state"]["col"], before["state"]["row"]
        target = genesis["state"]["trail"]["stages"][genesis["state"]["trail"]["index"]]
        goal = target["col"], target["row"]
        self.assertFalse(0 <= goal[0] < base["width"] and 0 <= goal[1] < base["height"])
        def cell(col, row):
            result = base["rows"][row][col] if 0 <= col < base["width"] and 0 <= row < base["height"] else {"terrain": "road"}
            return {**result, "unavailable": True} if result["terrain"] == "water" else result
        route = find_path(start, goal, cell)
        provider = Mock(spec=ParentPaths)
        provider.request_lore.return_value = (200, {"status": "ready"})
        provider.lore_key.side_effect = ParentPaths.lore_key
        provider.decode.return_value = route
        self.lore.paths = provider
        with self.assertRaisesRegex(JourneyRequest, "Carry Star or Lovers"):
            self.request("route")
        with self.lore.connect() as db:
            world = self.lore.decode(db.execute("SELECT * FROM world WHERE id=?", (WORLD,)).fetchone())
            star = next(item for item in world["instances"] if item["id"] == "star")
            star.update(owner=self.journey, placement={"id": "star", "x": 0, "y": 0, "rotated": False})
            raw, checksum = self.lore.encode(world)
            db.execute("UPDATE world SET payload=?,checksum=? WHERE id=?", (raw, checksum, WORLD))
        chunk = {"rows": [[{"terrain": "road"} for _ in range(8)] for _ in range(8)]}
        with patch.object(self.chunks, "read", return_value=chunk):
            prepared = self.request("route")
        provider.request_lore.assert_called_once_with(self.journey, genesis["state"]["trail"]["index"], start, False)
        self.assertEqual(prepared["routing"]["status"], "ready")
        self.assertEqual(prepared["revision"], before["revision"])
        self.assertEqual(prepared["state"]["elapsedMinutes"], before["state"]["elapsedMinutes"])
        self.assertNotIn(target["name"], json.dumps(prepared))
        self.assertNotIn("loreChunks", self.request("map")["map"])
        used = self.act(prepared, {"type": "use", "id": "star"})
        self.assertEqual(used["route"]["points"][-1], list(goal))
        self.assertGreater(used["route"]["distanceMeters"], 30000)
        with self.lore.connect() as db:
            world = self.lore.decode(db.execute("SELECT * FROM world WHERE id=?", (WORLD,)).fetchone())
            next(item for item in world["instances"] if item["id"] == "star")["owner"] = None
            item = next(item for item in world["instances"] if item["id"] == "world")
            item.update(owner=self.journey, placement={"id": "world", "x": 0, "y": 0, "rotated": False})
            raw, checksum = self.lore.encode(world)
            db.execute("UPDATE world SET payload=?,checksum=? WHERE id=?", (raw, checksum, WORLD))
        used = self.request("sync")
        destination = next(place for place in used["worldTargets"] if (place["col"], place["row"]) == goal)
        arrived = self.act(used, {"type": "use", "id": "world", "target": destination["id"]})
        self.assertEqual((arrived["state"]["col"], arrived["state"]["row"]), goal)
        self.assertEqual(arrived["state"]["distanceMeters"], 0)
        self.assertEqual(arrived["state"]["lore"]["lastSettlement"]["town"], target["name"])
        self.lore = LorePlaytest(self.journeys, self.abandoned, clock=lambda: self.now)
        self.assertEqual(self.request("sync"), arrived)
        self.assertEqual(self.journeys.read(self.journey), genesis)

    def test_placement_excludes_unreachable_real_settlements_instead_of_inventing_a_destination(self):
        def place(name):
            return {"terrain": "place", "settlements": [{"name": name}]}
        base = {"width": 5, "height": 1, "rows": [
            [place("Start"), {"terrain": "water"}, place("Hidden A"),
             place("Hidden B"), place("Hidden C")]]}
        with self.assertRaisesRegex(JourneyRequest, "six reachable real"):
            self.lore.initial_world(base, {"col": 0, "row": 0})

    def test_http_endpoint_enforces_origin_method_capability_and_body_contract(self):
        jobs = ChunkJobs(self.chunks, workers=1)
        server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(self.chunks, jobs))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(jobs.pool.shutdown)
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        url = f"http://127.0.0.1:{server.server_port}/api/lore-playtest"

        def post(body, token=self.token, **headers):
            return urllib.request.urlopen(urllib.request.Request(url, data=json.dumps(body).encode(),
                headers={"Content-Type": "application/json", "X-Journal-Capability": token, **headers}), timeout=20)
        with post({"operation": "start", "journey": self.journey}) as response:
            self.assertEqual(response.status, 200)
            self.assertEqual(json.load(response)["world"], WORLD)
        for body, token, headers, status in [
            ({"operation": "start", "journey": self.journey}, self.token, {"Origin": "https://evil.invalid"}, 403),
            ({"operation": "start", "journey": self.journey}, "0" * 64, {}, 403),
            ({"operation": "start", "journey": self.journey, "col": 99}, self.token, {}, 400),
        ]:
            with self.assertRaises(urllib.error.HTTPError) as context:
                post(body, token, **headers)
            self.assertEqual(context.exception.code, status)
            context.exception.close()
