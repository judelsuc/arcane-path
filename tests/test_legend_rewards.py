import copy
import json
import subprocess
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import Mock

from journeys import JourneyConflict, JourneyRequest
from main_artifacts import WORLD, MainArtifacts
from asset_storage import local_storage
from town_legends import TownLegends
import test_legend_sessions as fixtures


class LegendRewardTests(unittest.TestCase):
    def setUp(self):
        fixture = fixtures.LegendSessionTests()
        fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        self.fixture = fixture
        self.entry = fixture.discover()
        with fixture.legends.assets.catalogue.connection() as db:
            self.entrance = fixture.legends.search(db, self.entry["townId"])[1]["entrance"]
            # These compatibility tests represent towns discovered before composed rewards.
            db.execute("DELETE FROM town_legend_rewards WHERE town_id=?", (self.entry["townId"],))
        self.journey, self.token = fixture.journey, fixture.token
        self.state = copy.deepcopy(fixture.state)

    def start(self, journey=None, token=None):
        journey, token = journey or self.journey, token or self.token
        fixture = self.fixture
        fixture.legends.request({"journey": journey, "action": "discover", "location": fixture.location}, token)
        fixture.legends.request({"journey": journey, "action": "look",
                                "location": fixture.location, "target": self.entrance}, token)
        fixture.legends.request({"journey": journey, "action": "inspect",
                                "location": self.entrance, "townId": self.entry["townId"]}, token)
        state = copy.deepcopy(fixture.fixture.journeys.read(journey)["state"])
        state.update(self.entrance)
        return fixture.api.request({"journey": journey, "requestId": str(uuid.uuid4()), "state": state,
                                    "action": {"type": "legend-start", "townId": self.entry["townId"],
                                               "contentVersion": "treasure-investigation-v1"}}, token)

    def actions(self, seed=123):
        source = """
import { generateInvestigation } from './minigames/legend-investigation.mjs';
const level = generateInvestigation({ seed: Number(process.argv[1]), paced: true });
const actions = level.rooms.flatMap(room => {
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
        result = subprocess.run(["node", "--input-type=module", "-e", source, str(seed)],
                                cwd=Path(__file__).resolve().parents[1], capture_output=True,
                                text=True, check=True, timeout=30)
        return json.loads(result.stdout)

    def request(self, state, action, journey=None, token=None):
        body = {"journey": journey or self.journey, "requestId": str(uuid.uuid4()),
                "state": copy.deepcopy(state), "action": action}
        return self.fixture.api.request(body, token or self.token), body

    def finish(self, first, journey=None, token=None):
        return self.request(first["state"], {"type": "legend-finish", "runId": first["adventure"]["runId"],
                                            "actions": self.actions(first["adventure"]["seed"])}, journey, token)

    def test_composed_chart_and_generated_name_are_retained_without_inventing_an_artifact(self):
        from legend_rewards import choose_reward
        from reward_names import generate_one, PROVIDER
        from durable_jobs import DurableJobs
        assets = self.fixture.legends.assets
        with assets.catalogue.connection() as db:
            reward = choose_reward(db, assets.catalogue.sql, 123)
            db.execute("INSERT INTO town_legend_rewards VALUES(?,?)", (self.entry["townId"], json.dumps(reward)))
        first = self.start()
        complete, _ = self.finish(first)
        item = complete["state"]["treasures"]["inventory"][0]
        self.assertTrue(item["id"].endswith(":v3"))
        self.assertEqual(item["reward"]["nature"], "notes")
        DurableJobs(assets.catalogue).configure_quota(PROVIDER, daily=1, monthly=31)
        self.assertTrue(generate_one(assets, lambda brief: {
            "choices": [{"finish_reason": "stop", "message": {"content": '{"en":"Copper Leaves","fr":"Feuilles de cuivre"}'}}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 10, "total_tokens": 20}}))
        refreshed, _ = self.request(complete["state"], None)
        self.assertEqual(refreshed["state"]["treasures"]["inventory"][0]["reward"]["name"]["en"], "Copper Leaves")
        with self.assertRaises(JourneyRequest):
            self.request(refreshed["state"], {"type": "treasure-equip-ui", "id": item["id"]})
        used, receipt = self.request(refreshed["state"], {"type": "treasure-use", "id": item["id"]})
        self.assertEqual(used["state"]["treasures"]["inventory"], [])
        clues = [entry for entry in used["state"]["discovery"]["entries"] if entry["source"] == "treasure-chart"]
        self.assertEqual(len(clues), 1)
        self.assertEqual(clues[0]["precision"], "town")
        self.assertNotIn("latitude", clues[0]["facts"])
        self.assertNotIn("col", clues[0]["facts"])
        self.fixture.restart()
        self.assertEqual(self.fixture.api.request(receipt, self.token), used)
        with self.assertRaises(JourneyRequest):
            self.request(used["state"], {"type": "treasure-use", "id": item["id"]})

    def test_shared_opencaching_open_is_atomic_and_receipt_recovery_cannot_duplicate_coins(self):
        from journey_storage import geographic_position
        from opencaches import synchronize
        source = self.fixture.fixture
        assets = local_storage(source.journeys.path.parent / "cache-shared")
        self.addCleanup(assets.catalogue.close)
        with source.journeys.connect() as db:
            record = db.execute("SELECT id,request_id,payload,checksum FROM journeys WHERE id=?", (self.journey,)).fetchone()
        with assets.catalogue.connection() as db:
            db.execute("INSERT INTO journeys(id,request_id,payload,checksum) VALUES(?,?,?,?)", record)
        source.journeys.assets = assets
        self.fixture.legends = TownLegends(source.journeys, source.lore, randbelow=Mock(side_effect=[0, 10, 1]))
        self.fixture.restart()
        self.fixture.discover()
        with assets.catalogue.connection() as db:
            self.entrance = self.fixture.legends.search(db, self.entry["townId"])[1]["entrance"]
        complete, _ = self.finish(self.start())
        lockpick = complete["state"]["treasures"]["inventory"][0]
        self.assertEqual(lockpick["reward"]["nature"], "lockpick")
        latitude, longitude = geographic_position(source.chunks.bases["firmi"], **self.entrance)
        cache = {"id": "de:OC123", "code": "OC123", "name": "Public cache",
                 "url": "https://www.opencaching.de/viewcache.php?wp=OC123",
                 "latitude": latitude, "longitude": longitude, "attribution": "Fixture attribution", "annotation": ""}
        synchronize(assets, "de", (latitude, longitude), 5, [cache], now=source.now)
        refreshed, _ = self.request(complete["state"], None)
        self.assertEqual(refreshed["caches"]["offers"][0]["id"], cache["id"])
        opened, receipt = self.request(refreshed["state"],
            {"type": "cache-open", "cacheId": cache["id"], "lockpick": lockpick["id"]})
        self.assertEqual(opened["state"]["treasures"]["inventory"], [])
        self.assertEqual(opened["state"]["walletCents"], refreshed["state"]["walletCents"] + opened["caches"]["opened"]["cents"])
        self.fixture.restart()
        self.assertEqual(self.fixture.api.request(receipt, self.token), opened)
        with self.assertRaises(JourneyConflict):
            self.request(opened["state"], {"type": "cache-open", "cacheId": cache["id"], "lockpick": lockpick["id"]})
        with assets.catalogue.connection() as db:
            payload = db.execute("SELECT payload FROM main_artifact_world").fetchone()[0]
            self.assertEqual(json.loads(payload)["openedCaches"], ["de:OC123"])

    def test_completed_reward_receipt_and_place_transfer_survive_restart(self):
        first = self.start()
        complete, receipt = self.finish(first)
        self.assertEqual(complete["treasures"]["result"]["outcome"], "collected")
        owned = complete["state"]["treasures"]["inventory"]
        self.assertEqual(len(owned), 1)
        item = owned[0]["id"]
        self.assertTrue(item.endswith(":v2"))
        self.fixture.restart()
        self.assertEqual(self.fixture.api.request(receipt, self.token), complete)
        equipped, _ = self.request(complete["state"], {"type": "treasure-equip", "id": item})
        self.assertEqual(equipped["state"]["treasures"]["equipped"], item)
        skinned, skin_receipt = self.request(equipped["state"], {"type": "treasure-equip-ui", "id": item})
        self.assertEqual(skinned["state"]["treasures"]["uiEquipped"], item)
        self.assertEqual(skinned["state"]["treasures"]["equipped"], item)
        self.fixture.restart()
        self.assertEqual(self.fixture.api.request(skin_receipt, self.token), skinned)
        refreshed, _ = self.request(skinned["state"], None)
        self.assertEqual(refreshed["state"]["treasures"]["uiEquipped"], item)
        iconed, icon_receipt = self.request(refreshed["state"], {"type": "treasure-equip-icon", "id": item})
        self.assertEqual(iconed["state"]["treasures"]["iconEquipped"], item)
        self.assertEqual(iconed["state"]["treasures"]["uiEquipped"], item)
        self.assertEqual(iconed["state"]["treasures"]["equipped"], item)
        self.fixture.restart()
        self.assertEqual(self.fixture.api.request(icon_receipt, self.token), iconed)
        resumed, _ = self.request(iconed["state"], None)
        self.assertEqual(resumed["state"]["treasures"]["iconEquipped"], item)
        at_town = {**resumed["state"], **self.fixture.location}
        dropped, drop_receipt = self.request(at_town, {"type": "treasure-drop", "id": item})
        self.assertIsNone(dropped["state"]["treasures"]["equipped"])
        self.assertIsNone(dropped["state"]["treasures"]["uiEquipped"])
        self.assertIsNone(dropped["state"]["treasures"]["iconEquipped"])
        self.assertEqual(dropped["state"]["treasures"]["inventory"], [])
        self.assertEqual(dropped["treasures"]["offers"][0]["id"], item)
        self.assertEqual(self.fixture.api.request(drop_receipt, self.token), dropped)
        other, token = self.fixture.fixture.source()
        other_state = copy.deepcopy(self.fixture.fixture.journeys.read(other)["state"])
        other_state.update(self.fixture.location)
        taken, pickup_receipt = self.request(other_state, {"type": "treasure-pickup", "id": item}, other, token)
        self.assertEqual(taken["state"]["treasures"]["inventory"][0]["id"], item)
        self.assertIsNone(taken["state"]["treasures"]["equipped"])
        self.assertIsNone(taken["state"]["treasures"]["uiEquipped"])
        self.assertIsNone(taken["state"]["treasures"]["iconEquipped"])
        self.fixture.restart()
        self.assertEqual(self.fixture.api.request(pickup_receipt, token), taken)
        iconed, _ = self.request(taken["state"], {"type": "treasure-equip-icon", "id": item}, other, token)
        self.assertEqual(iconed["state"]["treasures"]["iconEquipped"], item)
        with self.assertRaises(JourneyRequest):
            self.request(dropped["state"], {"type": "treasure-pickup", "id": item})
        with self.fixture.api.connect() as db:
            world = self.fixture.api.decode(db.execute(
                f"SELECT * FROM {self.fixture.api.world_table} WHERE id=?", (WORLD,)).fetchone())
        self.assertEqual(len(world["treasures"]), 1)
        self.assertEqual(world["treasures"][0]["owner"], other)
        self.assertEqual(world["treasures"][0]["firstClaimant"], self.journey)

    def test_legacy_original_remains_collectible_and_prevents_a_new_catalogue_claim(self):
        complete, _ = self.finish(self.start())
        item = complete["state"]["treasures"]["inventory"][0]["id"]
        dropped, _ = self.request({**complete["state"], **self.fixture.location},
                                  {"type": "treasure-drop", "id": item})
        legacy = item.removesuffix(":v2")
        with self.fixture.api.connect() as db:
            world = self.fixture.api.decode(db.execute(
                f"SELECT * FROM {self.fixture.api.world_table} WHERE id=?", (WORLD,)).fetchone())
            world["treasures"][0]["id"] = legacy
            raw, checksum = self.fixture.api.encode(world)
            db.execute(f"UPDATE {self.fixture.api.world_table} SET payload=?,checksum=? WHERE id=?",
                       (raw, checksum, WORLD))
        with self.assertRaises(JourneyConflict):
            self.request(dropped["state"], {"type": "legend-start", "townId": self.entry["townId"],
                                            "contentVersion": "treasure-dungeon-v1"})
        taken, _ = self.request(dropped["state"], {"type": "treasure-pickup", "id": legacy})
        skinned, _ = self.request(taken["state"], {"type": "treasure-equip-ui", "id": legacy})
        self.assertEqual(skinned["state"]["treasures"]["uiEquipped"], legacy)
        iconed, _ = self.request(skinned["state"], {"type": "treasure-equip-icon", "id": legacy})
        self.assertEqual(iconed["state"]["treasures"]["iconEquipped"], legacy)

    def test_concurrent_completions_award_exactly_one_original_and_cannot_start_again(self):
        first = self.start()
        other, token = self.fixture.fixture.source()
        second = self.start(other, token)
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(self.finish, first), pool.submit(self.finish, second, other, token)]
            results = [future.result()[0] for future in futures]
        self.assertEqual(sorted(result["treasures"]["result"]["outcome"] for result in results),
                         ["collected", "taken"])
        self.assertEqual(sum(len(result["state"]["treasures"]["inventory"]) for result in results), 1)
        with self.assertRaises(JourneyConflict):
            self.request(results[0]["state"], {"type": "legend-start", "townId": self.entry["townId"],
                                               "contentVersion": "treasure-dungeon-v1"})

    def test_partial_departure_and_invalid_transcript_never_create_rewards(self):
        first = self.start()
        with self.assertRaises(JourneyRequest):
            self.request(first["state"], {"type": "legend-finish", "runId": first["adventure"]["runId"],
                                          "actions": [{"type": "act", "command": "invent-treasure"}]})
        left, _ = self.request(first["state"], {"type": "legend-finish", "runId": first["adventure"]["runId"],
                                               "actions": []})
        self.assertEqual(left["adventure"]["status"], "left")
        self.assertIsNone(left["treasures"]["result"])
        self.assertEqual(left["state"]["treasures"]["inventory"], [])
        for action in ({"type": "treasure-equip", "id": "treasure:node/42:123"},
                       {"type": "treasure-pickup", "id": "treasure:node/42:01"},
                       {"type": "treasure-equip-ui", "id": "treasure:node/42:01:v2"},
                       {"type": "treasure-equip-ui", "id": "treasure:node/42:4294967296:v2"},
                       {"type": "treasure-equip-ui", "id": "treasure:node/42:123:v3"},
                       {"type": "treasure-pack", "id": "treasure:node/42:123", "x": True, "y": 0, "rotated": False}):
            with self.assertRaises(JourneyRequest):
                self.request(left["state"], action)

    def test_shared_catalogue_instances_replay_one_atomic_completion_receipt(self):
        source = self.fixture.fixture
        assets = local_storage(source.journeys.path.parent / "reward-shared")
        self.addCleanup(assets.catalogue.close)
        with source.journeys.connect() as db:
            row = db.execute("SELECT id,request_id,payload,checksum FROM journeys WHERE id=?", (self.journey,)).fetchone()
        with assets.catalogue.connection() as db:
            db.execute("INSERT INTO journeys(id,request_id,payload,checksum) VALUES(?,?,?,?)", row)
        source.journeys.assets = assets
        self.fixture.legends = TownLegends(source.journeys, source.lore, randbelow=Mock(side_effect=[0, 123, 1]))
        self.fixture.restart()
        other = MainArtifacts(source.journeys, source.abandoned)
        other.town_legends = self.fixture.legends
        first = self.start()
        body = {"journey": self.journey, "requestId": str(uuid.uuid4()), "state": first["state"],
                "action": {"type": "legend-finish", "runId": first["adventure"]["runId"], "actions": self.actions()}}
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(lambda index: (self.fixture.api if index % 2 else other).request(body, self.token),
                                    range(8)))
        self.assertTrue(all(result == results[0] for result in results))
        self.assertEqual(results[0]["treasures"]["result"]["outcome"], "collected")
        self.assertEqual(len(results[0]["state"]["treasures"]["inventory"]), 1)
        with assets.catalogue.connection() as db:
            self.assertEqual(db.execute("SELECT count(*) FROM main_artifact_receipts").fetchone()[0], 2)
            self.assertEqual(db.execute("SELECT count(*) FROM main_artifact_sessions").fetchone()[0], 1)

    def test_stale_treasure_only_holder_is_released_without_a_tarot_artifact(self):
        complete, _ = self.finish(self.start())
        item = complete["state"]["treasures"]["inventory"][0]["id"]
        equipped, _ = self.request(complete["state"], {"type": "treasure-equip", "id": item})
        self.fixture.fixture.now += 31 * 86400
        last = equipped["state"]["lore"]["lastSettlement"]
        at_town = {**equipped["state"], "col": last["col"], "row": last["row"]}
        refreshed, _ = self.request(at_town, None)
        self.assertEqual(refreshed["state"]["treasures"]["inventory"], [])
        self.assertIsNone(refreshed["state"]["treasures"]["equipped"])
        self.assertEqual(refreshed["treasures"]["offers"][0]["id"], item)
