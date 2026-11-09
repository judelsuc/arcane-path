import copy
from concurrent.futures import ThreadPoolExecutor
import json
import subprocess
import sys
from pathlib import Path
import unittest
from unittest.mock import Mock
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from abandoned_journals import AbandonedJournals, JournalForbidden
from asset_storage import local_storage
from journeys import JourneyConflict, JourneyRequest, JourneyStore
from main_artifacts import MainArtifacts
from town_legends import TownLegends, TOWN_ID
from travel_server import atomic_write
import test_lore_playtest as fixtures


class LegendSessionTests(unittest.TestCase):
    def setUp(self):
        fixture = fixtures.LorePlaytestTests()
        fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        self.fixture = fixture
        self.journey, self.token = fixture.journey, fixture.token
        self.state = copy.deepcopy(fixture.journeys.read(self.journey)["state"])
        self.original = copy.deepcopy(self.state)
        self.legends = TownLegends(fixture.journeys, fixture.lore,
                                  randbelow=Mock(side_effect=[0, 123, 1]))
        self.addCleanup(self.legends.close)
        base = fixture.chunks.bases["firmi"]
        self.location = next({"col": col, "row": row}
                             for row, cells in enumerate(base["rows"]) for col, cell in enumerate(cells)
                             if cell.get("terrain") == "place" and any(
                                 TOWN_ID.fullmatch(place.get("osmId", "")) and place.get("name")
                                 for place in cell.get("settlements", [])))
        self.state.update(self.location)
        self.restart()

    def restart(self):
        self.api = MainArtifacts(self.fixture.journeys, self.fixture.abandoned, clock=lambda: self.fixture.now)
        self.api.town_legends = self.legends

    def discover(self):
        return self.legends.request({"journey": self.journey, "action": "discover",
                                     "location": self.location}, self.token)["entry"]

    def body(self, action):
        return {"journey": self.journey, "requestId": str(uuid.uuid4()),
                "state": copy.deepcopy(self.state), "action": action}

    def send(self, action):
        body = self.body(action)
        result = self.api.request(body, self.token)
        self.state = result["state"]
        return result, body

    def start(self, content_version="cinema-investigation-v1"):
        entry = self.discover()
        if content_version in ("seeded-platform-v2", "seeded-investigation-v3", "seeded-dungeon-v4"):
            with self.legends.assets.catalogue.connection() as db:
                target = self.legends.search(db, entry["townId"])[1]["entrance"]
            self.legends.request({"journey": self.journey, "action": "look",
                                  "location": self.location, "target": target}, self.token)
            self.legends.request({"journey": self.journey, "action": "inspect",
                                  "location": target, "townId": entry["townId"]}, self.token)
            self.state.update(target)
        else:
            self.state.update(self.location)
        return self.send({"type": "legend-start", "townId": entry["townId"],
                          "contentVersion": content_version})

    def test_local_formats_settle_only_at_end_and_receipts_survive_restart(self):
        for version in ("seeded-platform-v1", "seeded-investigation-v2", "seeded-dungeon-v3",
                        "seeded-platform-v2", "seeded-investigation-v3", "seeded-dungeon-v4"):
            first, entry_receipt = self.start(version)
            run = first["adventure"]["runId"]
            self.assertEqual(self.api.request(entry_receipt, self.token), first)
            source = """
import { platformCompletionActions } from './tests/helpers/legend-platform-route.mjs';
import { dungeonCompletionActions } from './tests/helpers/legend-dungeon-route.mjs';
import { generateInvestigation } from './minigames/legend-investigation.mjs';
const version = process.argv[1], seed = 123;
const paced = ['seeded-platform-v2', 'seeded-investigation-v3', 'seeded-dungeon-v4'].includes(version);
const level = generateInvestigation({ seed, paced });
const actions = version.startsWith('seeded-platform-') ? platformCompletionActions(seed, { paced }) :
  version.startsWith('seeded-dungeon-') ? dungeonCompletionActions(seed, 'none', 8, paced) :
    level.rooms.flatMap(room => {
      const commands = ({
        evidence: ['inspect', `choose:${room.answer}`],
        witnesses: ['witness:0', 'witness:1', `choose:${room.answer}`],
        assembly: ['take:0', 'take:1', 'combine'],
        sequence: ['inspect', ...room.order.map(index => `press:${index}`)],
      })[room.family];
      return [...[...commands, ...(room.seal === undefined ? [] : [`verify:${room.seal}`])]
        .map(command => ({ type: 'act', command })),
        ...(room.id < 7 ? [{ type: 'travel', room: room.id + 1 }] : [])];
    });
console.log(JSON.stringify(actions));
"""
            route = subprocess.run(["node", "--input-type=module", "-e", source, version],
                                   cwd=Path(__file__).resolve().parents[1], capture_output=True,
                                   text=True, check=True, timeout=30)
            actions = json.loads(route.stdout)
            before = self.state["elapsedMinutes"]
            self.restart()
            recovered, _ = self.send(None)
            self.assertEqual(recovered["adventure"]["actions"], [])
            self.assertEqual(self.state["elapsedMinutes"], before)
            result, receipt = self.send({"type": "legend-finish", "runId": run, "actions": actions})
            self.assertEqual(result["adventure"]["status"], "completed")
            self.assertEqual(result["adventure"]["metrics"]["roomEntries"], 8)
            self.assertEqual(self.state["elapsedMinutes"], before + 21)
            self.restart()
            self.assertEqual(self.api.request(receipt, self.token), result)
            self.assertIsNone(self.state["legendAdventure"])

    def test_paced_trials_require_look_inspection_and_presence_at_the_retained_entrance(self):
        entry = self.discover()
        with self.legends.assets.catalogue.connection() as db:
            target = self.legends.search(db, entry["townId"])[1]["entrance"]
        for version in ("seeded-platform-v2", "seeded-investigation-v3", "seeded-dungeon-v4"):
            action = {"type": "legend-start", "townId": entry["townId"], "contentVersion": version}
            before = copy.deepcopy(self.state)
            with self.assertRaises(JourneyConflict):
                self.send(action)
            self.assertEqual(self.state, before)
            self.state.update(target)
            with self.assertRaises(JourneyConflict):
                self.send(action)
            self.state.update(self.location)
        first, _ = self.start("seeded-investigation-v3")
        self.assertEqual({key: first["adventure"][key] for key in ("col", "row")}, target)
        self.assertEqual(first["adventure"]["seed"], entry["seed"])

    def test_local_reload_discards_unsettled_effects_and_restart_charges_entry_again(self):
        first, _ = self.start("seeded-dungeon-v3")
        before = copy.deepcopy(self.state)
        run = first["adventure"]["runId"]
        self.restart()
        recovered, _ = self.send(None)
        self.assertEqual(recovered["adventure"]["actions"], [])
        self.assertEqual(self.state["health"], before["health"])
        restarted, receipt = self.send({"type": "legend-restart", "runId": run})
        self.assertEqual(self.state["elapsedMinutes"], before["elapsedMinutes"] + 3)
        self.assertEqual(restarted["adventure"]["foodKcal"], 0)
        self.assertEqual(restarted["adventure"]["actions"], [])
        self.assertEqual(self.api.request(receipt, self.token), restarted)
        left, _ = self.send({"type": "legend-finish", "runId": run, "actions": []})
        self.assertEqual(self.state["elapsedMinutes"], before["elapsedMinutes"] + 3)
        self.assertEqual(left["adventure"]["status"], "left")

    def test_local_transcript_rejects_bad_packets_and_mixed_protocols_without_charging(self):
        first, _ = self.start("seeded-platform-v1")
        before = copy.deepcopy(self.state)
        for actions in ([{"controls": {"right": 1}, "ticks": 1}],
                        [{"controls": {}, "ticks": 61}],
                        [{"controls": {}, "ticks": True}],
                        [{"type": "attack"}],
                        [{"controls": {}, "ticks": 1}] * 8193):
            with self.assertRaises(JourneyRequest):
                self.send({"type": "legend-finish", "runId": first["adventure"]["runId"], "actions": actions})
        recovered, _ = self.send(None)
        self.assertEqual(self.state["elapsedMinutes"], before["elapsedMinutes"])
        self.assertEqual(recovered["adventure"]["actions"], [])

    @staticmethod
    def generated_route(seed, dungeon=False):
        if dungeon:
            source = """
import { dungeonCompletionActions } from './tests/helpers/legend-dungeon-route.mjs';
console.log(JSON.stringify(dungeonCompletionActions(Number(process.argv[1]))));
"""
            result = subprocess.run(["node", "--input-type=module", "-e", source, str(seed)],
                                    cwd=Path(__file__).resolve().parents[1], capture_output=True,
                                    text=True, check=True, timeout=30)
            return json.loads(result.stdout)
        source = """
import { generateInvestigation } from './minigames/legend-investigation.mjs';
const level = generateInvestigation({ seed: Number(process.argv[1]), roomCount: 4 });
const actions = [];
for (const room of level.rooms) {
  const commands = ({
    evidence: ['inspect', `choose:${room.answer}`],
    witnesses: ['witness:0', 'witness:1', `choose:${room.answer}`],
    assembly: ['take:0', 'take:1', 'combine'],
    sequence: ['inspect', ...room.order.map(index => `press:${index}`)],
  })[room.family];
  actions.push(...commands.map(command => ({ type: 'act', command })));
  if (room.id < 3) actions.push({ type: 'travel', room: room.id + 1 });
}
console.log(JSON.stringify(actions));
"""
        result = subprocess.run(["node", "--input-type=module", "-e", source, str(seed)],
                                cwd=Path(__file__).resolve().parents[1], capture_output=True,
                                text=True, check=True, timeout=30)
        return json.loads(result.stdout)

    def test_generated_route_uses_retained_seed_and_survives_restart_and_duplicate_receipts(self):
        first, body = self.start("seeded-investigation-v1")
        run = first["adventure"]["runId"]
        self.assertEqual(first["adventure"]["seed"], 123)
        self.assertEqual(self.api.request(body, self.token), first)
        actions = self.generated_route(first["adventure"]["seed"])
        for index, move in enumerate(actions):
            result, receipt = self.send({"type": "legend-input", "runId": run, "input": move})
            self.assertEqual(self.api.request(receipt, self.token), result)
            if index == 0:
                self.restart()
                resumed, _ = self.send(None)
                self.assertEqual(resumed["adventure"], result["adventure"])
        self.assertEqual(result["adventure"]["contentVersion"], "seeded-investigation-v1")
        self.assertEqual(result["adventure"]["status"], "completed")
        self.assertEqual(result["adventure"]["metrics"],
                         {"roomEntries": 4, "roomsVisited": [0, 1, 2, 3], "trapHits": 0})
        self.assertEqual(result["adventure"]["costs"], {"minutes": 12, "fatigue": 4, "health": 0, "dirt": 4})
        self.assertEqual(self.state["elapsedMinutes"], 12)
        self.assertIsNone(self.state["legendAdventure"])
        self.assertEqual(self.state["walletCents"], self.original["walletCents"])
        self.assertEqual(self.state["lore"]["inventory"], [])
        self.restart()
        self.assertEqual(self.send(None)[0]["adventure"], result["adventure"])
        with self.assertRaises(JourneyRequest):
            self.send({"type": "legend-input", "runId": run, "input": {"type": "travel", "room": 0}})

    def test_generated_rejections_do_not_charge_or_change_progress_and_leave_remains_available(self):
        first, body = self.start("seeded-investigation-v1")
        run = first["adventure"]["runId"]
        for move in (
            {"type": "act", "target": "photo"}, {"type": "travel", "location": "archive"},
            {"type": "act", "command": "complete"}, {"type": "travel", "room": True},
            {"type": "travel", "room": 4}, {"type": "travel", "room": 1.0},
            {"type": "act", "command": "inspect", "solved": True},
        ):
            with self.assertRaises(JourneyRequest):
                self.send({"type": "legend-input", "runId": run, "input": move})
        with self.assertRaises(JourneyRequest):
            self.send({"type": "legend-start", "townId": first["adventure"]["townId"],
                       "contentVersion": "seeded-investigation-v1", "seed": 1, "tier": "exceptional"})
        with self.assertRaises(JournalForbidden):
            self.api.request(body, "0" * 64)
        locked, _ = self.send({"type": "legend-input", "runId": run, "input": {"type": "travel", "room": 3}})
        self.assertEqual(locked["adventure"]["metrics"]["roomEntries"], 1)
        self.assertEqual(self.state["elapsedMinutes"], 3)
        with self.assertRaises(JourneyRequest):
            self.send({"type": "inquire"})
        self.restart()
        left, leave_receipt = self.send({"type": "legend-leave", "runId": run})
        self.assertEqual(left["adventure"]["status"], "left")
        self.assertEqual(self.state["elapsedMinutes"], 3)
        self.assertEqual(self.api.request(leave_receipt, self.token), left)
        self.assertIsNone(self.state["legendAdventure"])

    def test_generated_start_retries_are_atomic(self):
        entry = self.discover()
        body = self.body({"type": "legend-start", "townId": entry["townId"],
                          "contentVersion": "seeded-investigation-v1"})
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(lambda _: self.api.request(body, self.token), range(8)))
        self.assertTrue(all(result == results[0] for result in results))
        self.assertEqual(results[0]["state"]["elapsedMinutes"], 3)
        with self.api.connect() as db:
            self.assertEqual(db.execute(f"SELECT count(*) FROM {self.api.receipts_table}").fetchone()[0], 1)

    def test_generated_lethal_entry_uses_normal_survival_and_is_durable(self):
        self.state.update(health=0.1, reserveKcal=0)
        result, body = self.start("seeded-investigation-v1")
        self.assertEqual(result["adventure"]["status"], "interrupted")
        self.assertEqual(self.state["ended"], "health")
        self.assertIsNone(self.state["legendAdventure"])
        self.assertEqual(self.state["elapsedMinutes"], 3)
        self.restart()
        self.assertEqual(self.api.request(body, self.token), result)

    def test_dungeon_route_is_durable_replayed_and_completes_unarmed_without_rewards(self):
        started, receipt = self.start("seeded-dungeon-v1")
        run = started["adventure"]["runId"]
        self.assertEqual(started["adventure"]["weapon"], "none")
        self.assertEqual(self.api.request(receipt, self.token), started)
        route = self.generated_route(started["adventure"]["seed"], dungeon=True)
        for index, move in enumerate(route):
            result, receipt = self.send({"type": "legend-input", "runId": run, "input": move})
            if index in (0, len(route) - 1):
                self.assertEqual(self.api.request(receipt, self.token), result)
            if index == 1:
                self.restart()
                resumed, _ = self.send(None)
                self.assertEqual(resumed["adventure"], result["adventure"])
        self.assertEqual(result["adventure"]["status"], "completed")
        self.assertEqual(result["adventure"]["costs"], {"minutes": 12, "fatigue": 4, "health": 0, "dirt": 4})
        self.assertEqual(result["adventure"]["metrics"],
                         {"roomEntries": 4, "roomsVisited": [0, 1, 2, 3], "trapHits": 0, "creatureHits": 0})
        self.assertIsNone(self.state["legendAdventure"])
        self.assertEqual(self.state["walletCents"], self.original["walletCents"])
        self.assertEqual(self.state["lore"]["inventory"], [])
        self.restart()
        self.assertEqual(self.send(None)[0]["adventure"], result["adventure"])
        with self.assertRaises(JourneyRequest):
            self.send({"type": "legend-input", "runId": run, "input": {"type": "wait"}})

    def test_food_is_awarded_once_per_defeat_not_per_receipt_and_new_attempts_respawn(self):
        source = """
import { createDungeon, generateDungeon } from './minigames/legend-dungeon.mjs';
import { findDungeonRoute } from './tests/helpers/legend-dungeon-route.mjs';
const state = createDungeon({ level: generateDungeon({seed:123}), weapon:'knife', healthMode:'journey' });
console.log(JSON.stringify(findDungeonRoute(state, next => next.defeated.includes(0), {attack:true}).actions));
"""
        route = json.loads(subprocess.run(
            ["node", "--input-type=module", "-e", source], cwd=Path(__file__).resolve().parents[1],
            capture_output=True, text=True, check=True, timeout=30).stdout)
        self.state.update(reserveKcal=500, health=85, equipment={
            "version": 1, "revision": 0, "elapsedMinutes": 0, "walkedMeters": 0,
            "items": [{"id": name, "condition": 100} for name in ("boots", "backpack", "knife")],
            "placements": [{"id": "knife", "x": 0, "y": 0, "rotated": False}],
            "dogEncounter": None, "dog": None,
        })
        for attempt in range(2):
            started, _ = self.start("seeded-dungeon-v2")
            run = started["adventure"]["runId"]
            self.assertEqual(started["adventure"]["foodKcal"], 0)
            for move in route[:-1]:
                self.send({"type": "legend-input", "runId": run, "input": move})
            before = copy.deepcopy(self.state)
            result, receipt = self.send({"type": "legend-input", "runId": run, "input": route[-1]})
            self.assertEqual(result["adventure"]["foodKcal"], 150)
            self.assertEqual(self.state["reserveKcal"], before["reserveKcal"] + 150)
            self.assertEqual(self.state["health"], before["health"])
            self.assertEqual(self.state["meals"], before["meals"])
            self.assertEqual(self.api.request(receipt, self.token), result)
            self.restart()
            resumed, _ = self.send(None)
            self.assertEqual(resumed["state"]["reserveKcal"], self.state["reserveKcal"])
            self.assertEqual(resumed["adventure"], result["adventure"])
            fed = self.state["reserveKcal"]
            for move in ({"type": "attack"}, {"type": "retry"}, {"type": "attack"}):
                repeated, _ = self.send({"type": "legend-input", "runId": run, "input": move})
                self.assertEqual(repeated["adventure"]["foodKcal"], 0)
                self.assertEqual(self.state["reserveKcal"], fed)
            self.send({"type": "legend-leave", "runId": run})

    def test_dungeon_cannot_choose_weapon_or_report_costs_and_leave_keeps_costs(self):
        started, _ = self.start("seeded-dungeon-v1")
        run = started["adventure"]["runId"]
        for move in ({"type": "up", "health": 100}, {"type": "travel", "room": 1},
                     {"type": "attack", "weapon": "sword"}, {"type": "teleport"}):
            with self.assertRaises(JourneyRequest):
                self.send({"type": "legend-input", "runId": run, "input": move})
        with self.assertRaises(JourneyRequest):
            self.send({"type": "legend-start", "townId": started["adventure"]["townId"],
                       "contentVersion": "seeded-dungeon-v1", "weapon": "sword"})
        with self.assertRaises(JourneyRequest):
            self.send({"type": "inquire"})
        resumed, _ = self.send(None)
        self.assertEqual(resumed["adventure"]["actions"], [])
        left, body = self.send({"type": "legend-leave", "runId": run})
        self.assertEqual(left["adventure"]["status"], "left")
        self.assertEqual(self.state["elapsedMinutes"], 3)
        self.assertEqual(self.api.request(body, self.token), left)

    def test_dungeon_trial_does_not_change_platform_assignment_or_negative_eligibility(self):
        entry = self.discover()
        with self.legends.assets.catalogue.connection() as db:
            db.execute("UPDATE town_legends SET format='platform' WHERE town_id=?", (entry["townId"],))
        started, _ = self.start("seeded-dungeon-v1")
        self.assertEqual(self.discover()["format"], "platform")
        self.send({"type": "legend-leave", "runId": started["adventure"]["runId"]})
        with self.legends.assets.catalogue.connection() as db:
            db.execute("UPDATE town_legends SET eligible=0,seed=NULL,format=NULL WHERE town_id=?", (entry["townId"],))
        with self.assertRaises(JourneyConflict):
            self.start("seeded-dungeon-v1")

    def test_dungeon_lethal_entry_is_durable_and_uses_normal_journey_health(self):
        self.state.update(health=0.1, reserveKcal=0)
        result, body = self.start("seeded-dungeon-v1")
        self.assertEqual(result["adventure"]["status"], "interrupted")
        self.assertEqual(self.state["ended"], "health")
        self.assertIsNone(self.state["legendAdventure"])
        self.restart()
        self.assertEqual(self.api.request(body, self.token), result)

    def test_start_replay_resume_and_leave_survive_server_restart_without_cost_refund(self):
        first, body = self.start()
        run = first["adventure"]["runId"]
        self.assertEqual(self.state["elapsedMinutes"], 3)
        self.assertEqual(self.api.request(body, self.token), first)
        self.restart()
        resumed, _ = self.send(None)
        self.assertEqual(resumed["adventure"], first["adventure"])
        self.assertEqual(self.state["elapsedMinutes"], 3)
        moved, move_body = self.send({"type": "legend-input", "runId": run,
                                     "input": {"type": "travel", "location": "archive"}})
        self.assertEqual(self.state["elapsedMinutes"], 6)
        self.assertEqual(self.api.request(move_body, self.token), moved)
        self.restart()
        left, leave_body = self.send({"type": "legend-leave", "runId": run})
        self.assertEqual(left["adventure"]["status"], "left")
        self.assertIsNone(self.state["legendAdventure"])
        self.assertEqual(self.state["elapsedMinutes"], 6)
        self.assertEqual(self.api.request(leave_body, self.token), left)
        self.assertEqual(self.fixture.journeys.read(self.journey)["state"], self.original)

    def test_parallel_retries_commit_one_start_and_one_receipt(self):
        entry = self.discover()
        body = self.body({"type": "legend-start", "townId": entry["townId"],
                          "contentVersion": "cinema-investigation-v1"})
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(lambda _: self.api.request(body, self.token), range(8)))
        self.assertTrue(all(result == results[0] for result in results))
        self.assertEqual(results[0]["state"]["elapsedMinutes"], 3)
        with self.api.connect() as db:
            self.assertEqual(db.execute(f"SELECT count(*) FROM {self.api.receipts_table}").fetchone()[0], 1)

    def test_client_cannot_invent_eligibility_progress_or_a_different_run(self):
        missing = self.body({"type": "legend-start", "townId": "node/42",
                             "contentVersion": "cinema-investigation-v1"})
        with self.assertRaises(JourneyConflict):
            self.api.request(missing, self.token)
        self.legends.randbelow.assert_not_called()
        first, body = self.start()
        run = first["adventure"]["runId"]
        for action in (
            {"type": "legend-input", "runId": run, "input": {"type": "act", "target": "cabinet"}},
            {"type": "legend-input", "runId": run, "input": {"type": "act", "target": "photo", "completed": True}},
            {"type": "legend-input", "runId": run, "input": {"type": "complete", "target": "reel"}},
            {"type": "legend-input", "runId": str(uuid.uuid4()), "input": {"type": "act", "target": "photo"}},
            {"type": "inquire"},
        ):
            with self.assertRaises(JourneyRequest):
                self.send(action)
        with self.assertRaises(JourneyConflict):
            self.api.request({**body, "action": {"type": "legend-leave", "runId": run}}, self.token)
        with self.assertRaises(JournalForbidden):
            self.api.request(body, "0" * 64)
        resumed, _ = self.send(None)
        self.assertEqual(resumed["adventure"]["actions"], [])
        self.assertEqual(resumed["state"]["elapsedMinutes"], 3)

    def test_full_real_route_is_saved_with_no_reward_and_post_completion_input_is_rejected(self):
        started, _ = self.start()
        run = started["adventure"]["runId"]
        for move in (
            {"type": "act", "target": "photo"}, {"type": "act", "target": "bell"},
            {"type": "act", "target": "handle"}, {"type": "act", "target": "oil"},
            {"type": "travel", "location": "archive"}, {"type": "act", "target": "cabinet"},
            {"type": "travel", "location": "foyer"}, {"type": "travel", "location": "booth"},
            {"type": "act", "target": "mechanism"}, {"type": "act", "target": "reel"},
        ):
            result, _ = self.send({"type": "legend-input", "runId": run, "input": move})
        self.assertEqual(result["adventure"]["status"], "completed")
        self.assertEqual(result["adventure"]["metrics"],
                         {"roomEntries": 4, "roomsVisited": ["foyer", "archive", "booth"], "trapHits": 0})
        self.assertEqual(self.state["elapsedMinutes"], 12)
        self.assertEqual(self.state["walletCents"], self.original["walletCents"])
        self.assertEqual(self.state["lore"]["inventory"], [])
        with self.assertRaises(JourneyRequest):
            self.send({"type": "legend-input", "runId": run, "input": {"type": "act", "target": "reel"}})
        self.restart()
        self.assertEqual(self.send(None)[0]["adventure"], result["adventure"])

    def test_negative_and_platform_decisions_are_not_investigation_trials(self):
        self.legends.randbelow.side_effect = [9]
        entry = self.discover()
        for version in ("cinema-investigation-v1", "seeded-investigation-v1"):
            with self.assertRaises(JourneyConflict):
                self.send({"type": "legend-start", "townId": entry["townId"], "contentVersion": version})
        with self.legends.assets.catalogue.connection() as db:
            db.execute("UPDATE town_legends SET eligible=1,seed=12,format='platform' WHERE town_id=?",
                       (entry["townId"],))
        for version in ("cinema-investigation-v1", "seeded-investigation-v1"):
            with self.assertRaises(JourneyConflict):
                self.send({"type": "legend-start", "townId": entry["townId"], "contentVersion": version})

    def test_lethal_survival_and_fainting_settle_and_interrupt_durably(self):
        self.state.update(health=0.1, reserveKcal=0)
        result, body = self.start()
        self.assertEqual(result["adventure"]["status"], "interrupted")
        self.assertEqual(self.state["ended"], "health")
        self.assertIsNone(self.state["legendAdventure"])
        self.assertEqual(self.state["health"], 0)
        self.restart()
        self.assertEqual(self.api.request(body, self.token), result)

    def test_shared_catalogue_keeps_discovery_session_and_receipts_in_one_durable_authority(self):
        self.shared_catalogue_trial("cinema-investigation-v1")

    def test_shared_generated_trial_start_is_atomic_across_authority_instances(self):
        self.shared_catalogue_trial("seeded-investigation-v1")

    def test_shared_dungeon_start_is_atomic_across_authority_instances(self):
        self.shared_catalogue_trial("seeded-dungeon-v1")

    def shared_catalogue_trial(self, content_version):
        assets = local_storage(self.fixture.chunks.cache / "shared-runtime")
        self.addCleanup(assets.catalogue.close)
        journeys = JourneyStore(self.fixture.chunks, atomic_write, assets=assets)
        books = AbandonedJournals(journeys)
        record, _ = journeys.create({"requestId": str(uuid.uuid4()), "region": "firmi", "name": "Trial"})
        identity = record["state"]["serverJourney"]["id"]
        token = uuid.uuid4().hex + uuid.uuid4().hex
        books.bind(identity, token)
        apis = [MainArtifacts(journeys, books), MainArtifacts(journeys, books)]
        legends = TownLegends(journeys, apis[0], randbelow=Mock(side_effect=[0, 5, 1]))
        for api in apis:
            api.town_legends = legends
        entry = legends.request({"journey": identity, "action": "discover", "location": self.location}, token)["entry"]
        snapshot = {**record["state"], **self.location}
        body = {"journey": identity, "requestId": str(uuid.uuid4()), "state": snapshot,
                "action": {"type": "legend-start", "townId": entry["townId"],
                           "contentVersion": content_version}}
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(lambda index: apis[index % 2].request(body, token), range(8)))
        self.assertTrue(all(result == results[0] for result in results))
        self.assertEqual(results[0]["state"]["elapsedMinutes"], 3)
        with assets.catalogue.connection() as db:
            self.assertEqual(db.execute("SELECT count(*) FROM main_artifact_receipts").fetchone()[0], 1)
            self.assertEqual(db.execute("SELECT count(*) FROM main_artifact_sessions").fetchone()[0], 1)
            self.assertEqual(db.execute("SELECT count(*) FROM town_legends").fetchone()[0], 1)
