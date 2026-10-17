import io
import json
import math
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from town_trail import build_town_trail, starting_point, distance, grid_position, TownTrailStore
from travel_server import ChunkStore, atomic_write, ChunkJobs
from fetch_osm import fetch_towns, OVERPASS_URLS, _COOLDOWNS, SourceUnavailable

ROOT = Path(__file__).resolve().parents[1]
BASE = json.loads((ROOT / "public/map.json").read_text())


def towns(latitude, longitude, venues=False, on_progress=None):
    step = 45_000 / 6_371_008.8 * 180 / math.pi / math.cos(math.radians(latitude))
    return {"elements": [
        {"type": "node", "id": round((longitude + 180) * 1_000_000),
         "lat": latitude, "lon": longitude + step,
         "tags": {"name": f"Town {longitude:.3f}", "place": "town"}},
        {"type": "node", "id": 2, "lat": latitude, "lon": longitude + step,
         "tags": {"name": "Not a town", "place": "hamlet"}},
    ], "sourceUrl": OVERPASS_URLS[0], "retrievedAt": "2026-10-17T12:00:00Z"}


class TownTrailTests(unittest.TestCase):
    def tearDown(self):
        _COOLDOWNS.clear()

    def test_catalogue_retries_respect_cooldowns_report_progress_and_keep_cached_success(self):
        with tempfile.TemporaryDirectory() as directory:
            store = TownTrailStore(ChunkStore(cache=Path(directory)), atomic_write)
            progress = []
            data = towns(44, 2)
            with patch("town_trail.fetch_towns", side_effect=[
                SourceUnavailable("Both providers offline", retry_after=53), data,
            ]) as fetch, patch("town_trail.time.sleep") as sleep:
                self.assertEqual(store.catalogue(44, 2, on_progress=progress.append), data)
                self.assertEqual(fetch.call_count, 2)
                sleep.assert_called_once_with(53)
                self.assertEqual(progress[0]["phase"], "retry")
                self.assertEqual(progress[0]["attempt"], 2)
                self.assertIn("Both providers offline", progress[0]["lastError"])
            with patch("town_trail.fetch_towns", side_effect=AssertionError("No network")):
                self.assertEqual(store.catalogue(44, 2, on_progress=progress.append), data)
                self.assertEqual(progress[-1]["phase"], "cache")
            with patch("town_trail.fetch_towns", side_effect=SourceUnavailable("Offline")) as fetch, \
                    patch("town_trail.time.sleep") as sleep:
                with self.assertRaisesRegex(SourceUnavailable, "Offline"):
                    store.catalogue(45, 3)
                self.assertEqual(fetch.call_count, 3)
                self.assertEqual(sleep.call_count, 2)

    def test_live_job_exposes_stage_and_provider_progress_without_revealing_towns(self):
        import threading
        entered, release = threading.Event(), threading.Event()
        with tempfile.TemporaryDirectory() as directory:
            store = TownTrailStore(ChunkStore(cache=Path(directory)), atomic_write)
            def fetch(latitude, longitude, venues=False, on_progress=None):
                on_progress({"phase": "provider", "provider": "overpass.kumi.systems", "backup": True})
                entered.set()
                release.wait(5)
                return towns(latitude, longitude)
            jobs = ChunkJobs(store)
            try:
                with patch("town_trail.fetch_towns", side_effect=fetch):
                    self.assertEqual(jobs.request("firmi", "abcdef01")[0], 202)
                    self.assertTrue(entered.wait(5))
                    status, payload = jobs.request("firmi", "abcdef01")
                    self.assertEqual(status, 202)
                    self.assertEqual(payload["progress"], {
                        "phase": "provider", "stage": 1, "provider": "overpass.kumi.systems", "backup": True})
                    release.set()
                    jobs.jobs[("firmi", "abcdef01")].result(timeout=5)
                    self.assertEqual(store.progress, {})
            finally:
                release.set()
                jobs.pool.shutdown()

    def test_ten_legs_all_obey_exact_geographic_distance_and_stream_grid(self):
        seen = []
        def catalogue(latitude, longitude):
            seen.append((latitude, longitude))
            return towns(latitude, longitude)
        trail = build_town_trail(BASE, "abcdef01", catalogue)
        self.assertEqual(trail["version"], 2)
        self.assertEqual(len(trail["stages"]), 10)
        self.assertEqual(len(seen), 10)
        previous = trail["origin"]
        for i, stage in enumerate(trail["stages"]):
            meters = distance(previous, stage)
            self.assertGreaterEqual(meters, 30_000)
            self.assertLessEqual(meters, 60_000)
            self.assertAlmostEqual(stage["legMeters"], meters, places=2)
            self.assertEqual(stage["placeType"], "town")
            self.assertEqual(stage["witnessId"], f"fictional-traveler-{i+1}")
            self.assertEqual(grid_position(BASE, stage["latitude"], stage["longitude"]),
                             {"col": stage["col"], "row": stage["row"]})
            previous = stage
        self.assertGreater(trail["stages"][-1]["col"], BASE["width"])
        self.assertEqual(trail, build_town_trail(BASE, "abcdef01", towns))

    def test_too_near_too_far_non_towns_and_revisits_are_not_substituted(self):
        def bad_catalogue(latitude, longitude):
            result = towns(latitude, longitude)
            near = {**result["elements"][0], "lon": longitude + 0.01}
            far = {**result["elements"][0], "lon": longitude + 2}
            result["elements"] = [near, far, result["elements"][1]]
            return result
        with self.assertRaisesRegex(ValueError, "No onward town 30–60 km.*1/10"):
            build_town_trail(BASE, "abcdef01", bad_catalogue)
        origin = starting_point(BASE)
        def loop(latitude, longitude):
            if longitude == origin["longitude"]:
                return towns(latitude, longitude)
            result = towns(latitude, longitude)
            result["elements"][0].update(lat=origin["latitude"], lon=origin["longitude"])
            return result
        with self.assertRaisesRegex(ValueError, "stage 2/10"):
            build_town_trail(BASE, "abcdef01", loop)

    def test_west_and_north_towns_have_negative_stream_coordinates(self):
        def west(latitude, longitude):
            result = towns(latitude, longitude)
            result["elements"][0]["lon"] = longitude - (
                result["elements"][0]["lon"] - longitude)
            return result
        trail = build_town_trail(BASE, "abcdef01", west)
        self.assertTrue(all(stage["col"] < 0 for stage in trail["stages"]))

    def test_clue_venues_are_real_nearby_public_places_and_missing_venues_do_not_invent_one(self):
        def venues(latitude, longitude):
            return {"elements": [
                {"type": "node", "id": 100, "lat": latitude, "lon": longitude,
                 "tags": {"name": "Private", "amenity": "library", "access": "private"}},
                {"type": "node", "id": 101, "lat": latitude, "lon": longitude,
                 "tags": {"name": "Closed", "amenity": "library", "disused": "yes"}},
                {"type": "node", "id": 102, "lat": latitude, "lon": longitude,
                 "tags": {"name": "Real library", "amenity": "library"}},
            ], "sourceUrl": OVERPASS_URLS[0], "retrievedAt": "2026-10-17T12:00:00Z"}
        route = build_town_trail(BASE, "abcdef01", towns, venues)
        for index, stage in enumerate(route["stages"]):
            if index % 2:
                self.assertEqual(stage["venue"]["name"], "Real library")
                self.assertEqual(stage["venue"]["osmId"], "node/102")
            else:
                self.assertNotIn("venue", stage)
        empty = build_town_trail(BASE, "abcdef01", towns,
                                 lambda lat, lon: {"elements": [], "sourceUrl": OVERPASS_URLS[0]})
        self.assertTrue(all("venue" not in stage for stage in empty["stages"]))

    def test_catalogues_are_persistent_and_job_results_are_deduplicated(self):
        with tempfile.TemporaryDirectory() as directory:
            store = ChunkStore(cache=Path(directory))
            trails = TownTrailStore(store, atomic_write)
            with patch("town_trail.fetch_towns", side_effect=towns) as fetch:
                first = trails.build("firmi", "abcdef01")
                self.assertEqual(fetch.call_count, 15)
            with patch("town_trail.fetch_towns", side_effect=AssertionError("Network forbidden")):
                self.assertEqual(TownTrailStore(store, atomic_write).build("firmi", "abcdef01"), first)
            jobs = ChunkJobs(trails)
            try:
                self.assertEqual(jobs.request("firmi", "abcdef01")[0], 202)
                jobs.jobs[("firmi", "abcdef01")].result(timeout=5)
                self.assertEqual(jobs.request("firmi", "abcdef01"), (200, first))
            finally:
                jobs.pool.shutdown()

    def test_catalogue_uses_both_providers_and_only_requests_city_town_nodes(self):
        _COOLDOWNS.clear()
        with patch("fetch_osm.urllib.request.urlopen", side_effect=[
            OSError("Offline"), io.BytesIO(json.dumps(towns(44, 2)).encode()),
        ]) as request:
            result = fetch_towns(44, 2)
        self.assertEqual(result["sourceUrl"], OVERPASS_URLS[1])
        self.assertIn("https://overpass-api.de/api/interpreter", _COOLDOWNS)
        from urllib.parse import parse_qs, urlparse
        actual = request.call_args.args[0]
        self.assertEqual(actual.get_method(), "GET")
        query = parse_qs(urlparse(actual.full_url).query)["data"][0]
        self.assertIn("node(around:60000,", query)
        self.assertIn('["place"~"^(city|town)$"]', query)
        self.assertNotIn(">>", query)
