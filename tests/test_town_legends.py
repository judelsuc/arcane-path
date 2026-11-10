from concurrent.futures import ThreadPoolExecutor
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
import sys
import tempfile
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
import urllib.error
import urllib.request

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from abandoned_journals import JournalForbidden
from asset_storage import AssetError, local_storage
from journeys import JourneyConflict, JourneyRequest
from town_legends import PAGE_SIZE, TownLegends
import test_lore_playtest as fixtures
from travel_server import ChunkJobs, make_handler


class Authorization:
    def authorize(self, journey, token):
        if token != f"private-{journey}":
            raise JournalForbidden("Invalid private capability")
        return {"region": "firmi"}


class TownLegendsTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.assets = local_storage(self.root / "shared")
        self.addCleanup(self.assets.catalogue.close)
        self.cell = {"terrain": "place", "settlements": [{"osmId": "node/42", "name": "Firmi"}]}
        self.grid = {"width": 1, "height": 1, "rows": [[self.cell]]}
        chunks = SimpleNamespace(bases={"firmi": self.grid}, require_origin=lambda _: None,
                                 read=lambda region, x, y: None)
        self.journeys = SimpleNamespace(path=self.root / "journeys.sqlite3", assets=self.assets, chunks=chunks)
        self.random = Mock(side_effect=[0, 123456, 1])
        self.service = TownLegends(self.journeys, Authorization(), randbelow=self.random)

    def request(self, player=1, action="discover", service=None, **extra):
        journey = f"{player:032x}"
        payload = {"journey": journey, "action": action,
                   **({"location": {"col": 0, "row": 0}} if action == "discover" else {"cursor": None}), **extra}
        return (service or self.service).request(payload, f"private-{journey}")

    def test_positive_decision_is_permanent_shared_and_reused_after_restart(self):
        first = self.request()
        self.assertEqual(first["entry"], {"townId": "node/42", "town": "Firmi", "eligible": True,
            "seed": 123456, "format": "investigation", "contentStatus": "unprepared",
            "reward": {"version": 1, "nature": "sword", "effect": "reach", "material": "silver", "motif": "waves"},
            "exploration": {"status": "pending", "clues": None, "observations": []}})
        reopened = TownLegends(self.journeys, Authorization(), randbelow=Mock(side_effect=AssertionError("reroll")))
        self.assertEqual(self.request(service=reopened), first)
        self.assertEqual(self.request(player=2, service=reopened), first)
        self.assertEqual(self.random.call_count, 3)
        with self.assets.catalogue.connection() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM town_legends").fetchone()[0], 1)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM town_legend_discoveries").fetchone()[0], 2)

    def test_negative_decision_is_retained_and_never_rerolled(self):
        self.random.side_effect = [9]
        first = self.request()
        self.assertFalse(first["entry"]["eligible"])
        self.assertIsNone(first["entry"]["seed"])
        self.assertIsNone(first["entry"]["format"])
        self.assertEqual(first["entry"]["contentStatus"], "none")
        self.assertEqual(self.request(player=2), first)
        self.random.assert_called_once_with(10)

    def test_all_three_gameplay_assignments_are_permanent_and_existing_legacy_assignments_stay_unchanged(self):
        for index, format_name in enumerate(("platform", "investigation", "dungeon")):
            self.cell["settlements"][0]["osmId"] = f"node/{700 + index}"
            self.random.side_effect = [0, 123, index]
            first = self.request()
            self.assertEqual(first["entry"]["format"], format_name)
            journey = f"{1:032x}"
            definition = self.service.trial_definition(journey, {"col": 0, "row": 0},
                                                       f"private-{journey}", local=True)
            self.assertEqual(definition["format"], format_name)
            self.assertEqual(self.request(player=2)["entry"]["format"], format_name)
            self.assertEqual(self.random.call_count, (index + 1) * 3)
        with self.assets.catalogue.connection() as db:
            db.execute("INSERT INTO town_legends(town_id,town_name,eligible,seed,format,created) "
                       "VALUES('node/800','Old town',1,456,'platform',0)")
        self.cell["settlements"][0]["osmId"] = "node/800"
        self.random.side_effect = AssertionError("existing format must not reroll")
        self.assertEqual(self.request()["entry"]["format"], "platform")

    def test_existing_cached_town_without_eligibility_is_new_for_legends(self):
        cached = {"width": 8, "height": 8, "rows": [[{"terrain": "water"} for _ in range(8)] for _ in range(8)]}
        cached["rows"][0][0] = self.cell
        self.journeys.chunks.read = lambda region, x, y: cached if (x, y) == (0, 0) else None
        with self.assets.catalogue.connection() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM town_legends").fetchone()[0], 0)
        first = self.request()
        self.assertTrue(first["entry"]["eligible"])
        self.assertEqual(self.random.call_count, 3)
        self.assertEqual(self.request(player=2), first)
        self.assertEqual(self.random.call_count, 3)

    def test_probability_uses_exact_one_in_ten_threshold(self):
        for roll in range(10):
            self.cell["settlements"][0]["osmId"] = f"node/{100 + roll}"
            self.random.side_effect = [roll, 3, 0] if roll == 0 else [roll]
            self.assertEqual(self.request()["entry"]["eligible"], roll == 0)

    def test_concurrent_discovery_publishes_one_decision_and_one_visit_per_journey(self):
        def discover(_):
            return self.request()
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(discover, range(16)))
        self.assertTrue(all(result == results[0] for result in results))
        self.assertEqual(self.random.call_count, 3)
        with self.assets.catalogue.connection() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM town_legend_discoveries").fetchone()[0], 1)

    def test_identity_is_osm_not_region_name_or_cell_and_selection_matches_primary_town(self):
        self.cell["settlements"].append({"osmId": "way/100", "name": "Another town"})
        first = self.request()
        self.cell["settlements"][0]["name"] = "Firmi renamed"
        self.assertEqual(self.request(player=2), first)
        self.assertEqual(first["entry"]["townId"], "node/42")
        self.journeys.chunks.bases["other-region"] = self.grid
        authorization = Mock()
        authorization.authorize.return_value = {"region": "other-region"}
        other_region = TownLegends(self.journeys, authorization, randbelow=Mock(side_effect=AssertionError("reroll")))
        self.assertEqual(self.request(player=3, service=other_region), first)

    def test_history_is_private_paginated_and_survives_reopening(self):
        self.random.side_effect = None
        self.random.return_value = 9
        for index in range(PAGE_SIZE + 5):
            self.cell["settlements"][0]["osmId"] = f"node/{100 + index}"
            self.request()
        first = self.request(action="list")
        self.assertEqual(len(first["entries"]), PAGE_SIZE)
        self.assertIsNotNone(first["cursor"])
        second = self.request(action="list", cursor=first["cursor"])
        self.assertEqual(len(second["entries"]), 5)
        self.assertIsNone(second["cursor"])
        self.assertEqual(self.request(player=2, action="list")["entries"], [])
        self.assertEqual(len({entry["townId"] for entry in first["entries"] + second["entries"]}), PAGE_SIZE + 5)

    def test_auth_input_and_uncached_or_unnamed_towns_are_rejected_without_rolls(self):
        journey = f"{1:032x}"
        body = {"journey": journey, "action": "discover", "location": {"col": 0, "row": 0}}
        with self.assertRaises(JournalForbidden):
            self.service.request(body, "wrong")
        for extra in ({"seed": 1}, {"eligible": True}, {"town": "invented"}):
            with self.assertRaises(JourneyRequest):
                self.service.request({**body, **extra}, f"private-{journey}")
        with self.assertRaises(JourneyRequest):
            self.request(action="list", cursor="arbitrary")
        for cell in ({"terrain": "forest"}, {"terrain": "place", "settlements": []},
                     {"terrain": "place", "settlements": [{"osmId": "invalid", "name": "Town"}]},
                     {**self.cell, "unavailable": True}):
            self.grid["rows"][0][0] = cell
            with self.assertRaises(JourneyConflict):
                self.request()
        with self.assertRaises(JourneyConflict):
            self.request(location={"col": 30, "row": 0})
        self.random.assert_not_called()

    def test_database_failure_is_explicit_and_never_falls_back_to_another_store(self):
        with patch.object(self.assets.catalogue, "connect", side_effect=AssetError("database down")):
            with self.assertRaises(AssetError):
                self.request()
        self.random.assert_not_called()
        self.assertFalse((self.root / "town-legends").exists())

    def test_local_only_configuration_still_uses_durable_catalogue_not_content_cache(self):
        journeys = SimpleNamespace(path=self.root / "local/journeys.sqlite3", chunks=self.journeys.chunks)
        service = TownLegends(journeys, Authorization(), randbelow=lambda _: 9)
        try:
            first = self.request(service=service)
        finally:
            service.close()
        reopened = TownLegends(journeys, Authorization(), randbelow=Mock(side_effect=AssertionError("reroll")))
        try:
            self.assertEqual(self.request(service=reopened), first)
        finally:
            reopened.close()


class TownLegendsHTTPTests(unittest.TestCase):
    def test_real_endpoint_authenticates_retains_discovery_and_lists_only_private_history(self):
        fixture = fixtures.LorePlaytestTests()
        fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        jobs = ChunkJobs(fixture.chunks, workers=1)
        self.addCleanup(jobs.pool.shutdown)
        handler = make_handler(fixture.chunks, jobs)
        self.addCleanup(handler.town_legends.close)
        handler.town_legends.randbelow = lambda _: 0
        server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        self.addCleanup(server.server_close)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(thread.join, 5)
        self.addCleanup(server.shutdown)
        base = fixture.chunks.bases["firmi"]
        location = next({"col": col, "row": row}
                        for row, cells in enumerate(base["rows"]) for col, cell in enumerate(cells)
                        if cell.get("terrain") == "place" and any(
                            place.get("osmId") and place.get("name") for place in cell.get("settlements", [])))
        url = f"http://127.0.0.1:{server.server_port}/api/town-legends"
        body = {"journey": fixture.journey, "action": "discover", "location": location}

        def post(data, token=fixture.token, **headers):
            return urllib.request.urlopen(urllib.request.Request(url, data=json.dumps(data).encode(),
                headers={"Content-Type": "application/json", "X-Journal-Capability": token, **headers}), timeout=20)

        with post(body) as response:
            self.assertEqual(response.status, 200)
            discovered = json.load(response)["entry"]
            self.assertEqual(discovered["contentStatus"], "unprepared")
        with post(body) as response:
            self.assertEqual(json.load(response)["entry"], discovered)
        with post({"journey": fixture.journey, "action": "list", "cursor": None}) as response:
            self.assertEqual(json.load(response)["entries"], [discovered])
        for invalid, token, headers, status in (
            (body, "0" * 64, {}, 403),
            (body, fixture.token, {"Origin": "https://evil.invalid"}, 403),
            ({**body, "eligible": True}, fixture.token, {}, 400),
        ):
            with self.assertRaises(urllib.error.HTTPError) as context:
                post(invalid, token, **headers)
            self.assertEqual(context.exception.code, status)
            context.exception.close()
