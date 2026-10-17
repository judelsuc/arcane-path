import copy
import heapq
import json
import math
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from http.server import ThreadingHTTPServer
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from parent_paths import ParentPaths, PathLimit, find_path, walk_minutes, in_corridor
from travel_server import atomic_write, ChunkStore, ChunkJobs, make_handler


class Grid:
    def __init__(self, cache):
        self.cache = Path(cache)
        self.pipeline = "pipeline"
        self.fingerprints = {"test": "source"}
        self.built = []
        self.cached = {}

    def read(self, region, x, y):
        return self.cached.get((x, y))

    def build(self, region, x, y):
        self.built.append((x, y))
        data = {"rows": [[{"terrain": "grass", "elevationMeters": 100}
                         for _ in range(8)] for _ in range(8)]}
        self.cached[x, y] = data
        return data


class Journeys:
    def __init__(self):
        self.record = {"region": "test", "state": {"trail": {
            "origin": {"col": 0, "row": 0}, "stages": [{"col": 14, "row": 5}]}}}

    def read(self, identity):
        if identity not in {"a" * 32, "b" * 32}:
            return None
        return copy.deepcopy(self.record)


class PathTests(unittest.TestCase):
    def test_prefers_longer_easy_route_and_handles_negative_cells(self):
        def cell(col, row):
            return {"terrain": "mountain" if row == 0 and 0 < col < 6 else "road",
                    "elevationMeters": 100}
        data = find_path((0, 0), (6, 0), cell)
        self.assertGreater(data["distanceMeters"], 6 * 250)
        self.assertTrue(any(row != 0 for _, row in data["points"]))
        negative = find_path((-12, -5), (-17, -8), cell)
        self.assertEqual(negative["points"][0], [-12, -5])
        self.assertEqual(negative["points"][-1], [-17, -8])
        for a, b in zip(data["points"], data["points"][1:]):
            self.assertEqual(abs(a[0] - b[0]) + abs(a[1] - b[1]), 1)
        self.assertAlmostEqual(data["walkingMinutes"], sum(
            walk_minutes(cell(*a), cell(*b)) for a, b in zip(data["points"], data["points"][1:])))

    def test_corridor_widens_for_real_obstacles_not_invented_cells(self):
        def cell(col, row):
            return {"terrain": "road", "unavailable": col == 3 and abs(row) <= 2}
        data = find_path((0, 0), (6, 0), cell, corridors=(1, 4))
        self.assertEqual(data["corridorCells"], 4)
        self.assertTrue(any(abs(row) > 2 for _, row in data["points"]))
        self.assertFalse(data["elevationComplete"])
        with self.assertRaisesRegex(PathLimit, "No traversable"):
            find_path((0, 0), (6, 0), cell, corridors=(1,))
        for point in data["points"]:
            self.assertTrue(in_corridor(point, (0, 0), (6, 0), 4))

    def test_astar_matches_dijkstra_with_slopes_and_terrain(self):
        def cell(col, row):
            return {"terrain": ["road", "forest", "grass", "mountain"][(col * 7 + row * 3) % 4],
                    "elevationMeters": (col * col + row * 37) % 120}
        start, goal, width = (0, 0), (8, 5), 3
        queue, scores = [(0, start)], {start: 0}
        while queue:
            cost, current = heapq.heappop(queue)
            if cost != scores[current]:
                continue
            if current == goal:
                break
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                target = (current[0] + dx, current[1] + dy)
                if not in_corridor(target, start, goal, width):
                    continue
                candidate = cost + walk_minutes(cell(*current), cell(*target))
                if candidate < scores.get(target, math.inf):
                    scores[target] = candidate
                    heapq.heappush(queue, (candidate, target))
        self.assertAlmostEqual(find_path(start, goal, cell, corridors=(width,))["walkingMinutes"], cost)

    def test_exact_bounds_work_limits_identity_and_water_matches_game(self):
        cell = lambda *p: {"terrain": "water"}
        self.assertTrue(math.isfinite(find_path((0, 0), (1, 0), cell)["walkingMinutes"]))
        self.assertEqual(find_path((0, 0), (0, 0), cell)["distanceMeters"], 0)
        with self.assertRaisesRegex(PathLimit, "1-cell"):
            find_path((0, 0), (10, 0), cell, max_expansions=1)
        for bad in [(-8001, 0), (8008, 0), (True, 0), (0.5, 0)]:
            with self.assertRaisesRegex(ValueError, "coordinates"):
                find_path(bad, (0, 0), cell)
        with self.assertRaises(KeyError):
            walk_minutes({"terrain": "invented"}, {"terrain": "road"})


class PathStoreTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.chunks = Grid(temporary.name)
        self.journeys = Journeys()
        self.pool = ThreadPoolExecutor(max_workers=1)
        self.addCleanup(self.pool.shutdown)
        self.store = ParentPaths(self.chunks, self.journeys, atomic_write, self.pool)
        self.identity = "a" * 32

    def ready(self, identity=None):
        identity = identity or self.identity
        status, data = self.store.request(identity, 0)
        if status == 202:
            self.store.jobs[identity, 0].result(timeout=5)
            status, data = self.store.request(identity, 0)
        self.assertEqual(status, 200)
        return data

    def test_persisted_path_survives_restart_pipeline_changes_without_reroll_and_geometry_is_hidden(self):
        response = self.ready()
        self.assertGreater(response["downloads"], 0)
        self.assertNotIn("points", response)
        stored = self.store.decode(self.store.location(self.identity, 0))
        self.assertEqual(stored["points"][0], [0, 0])
        self.assertEqual(stored["points"][-1], [14, 5])
        self.chunks.pipeline = "changed"
        restarted = ParentPaths(self.chunks, self.journeys, atomic_write, self.pool)
        with patch.object(self.chunks, "build", side_effect=AssertionError("No reroll")):
            self.assertEqual(restarted.request(self.identity, 0), (200, response))
        self.assertEqual(self.store.jobs, {})

    def test_other_journey_reuses_same_completed_route_and_other_route_reuses_terrain(self):
        self.ready()
        count = len(self.chunks.built)
        with patch.object(self.chunks, "build", side_effect=AssertionError("No redownload")):
            self.ready("b" * 32)
        self.assertEqual(len(self.chunks.built), count)
        self.assertTrue(self.store.location("b" * 32, 0).exists())

    def test_budget_error_persists_until_explicit_retry_and_terrain_is_reused(self):
        with patch("parent_paths.MAX_DOWNLOADS", 1):
            self.assertEqual(self.store.request(self.identity, 0)[0], 202)
            with self.assertRaises(PathLimit):
                self.store.jobs[self.identity, 0].result(timeout=5)
            with self.assertLogs(level="ERROR"):
                status, data = self.store.request(self.identity, 0)
        self.assertEqual(status, 422)
        self.assertIn("1-chunk", data["error"])
        self.assertFalse(self.store.location(self.identity, 0).exists())
        self.assertEqual(self.store.request(self.identity, 0)[0], 422)
        self.assertEqual(self.store.request(self.identity, 0, retry=True)[0], 202)
        self.ready()
        self.assertEqual(len(self.chunks.built), len(set(self.chunks.built)))

    def test_time_memory_bounds_and_missing_journey_fail_explicitly(self):
        self.assertEqual(self.store.request("missing", 0)[0], 404)
        for stage in [-1, True, 1]:
            with self.assertRaises(ValueError):
                self.store.request(self.identity, stage)
        for limit, value, text in [("MAX_SECONDS", 0, "second"), ("MAX_CHUNKS", 0, "memory")]:
            self.store.progress[self.identity, 0] = {}
            with patch("parent_paths." + limit, value):
                with self.assertRaisesRegex(PathLimit, text):
                    self.store.build((self.identity, 0), self.journeys.record)

    def test_corrupt_persisted_route_never_replaced_by_a_success_shaped_fallback(self):
        self.ready()
        path = self.store.location(self.identity, 0)
        envelope = json.loads(path.read_text())
        envelope["data"]["distanceMeters"] = 1
        path.write_text(json.dumps(envelope))
        with self.assertRaisesRegex(ValueError, "Corrupt"):
            self.store.request(self.identity, 0)

    def test_polling_is_nonblocking_and_duplicate_requests_share_one_job(self):
        started, release = threading.Event(), threading.Event()
        original = self.chunks.build
        def build(*args):
            started.set()
            release.wait(timeout=3)
            return original(*args)
        with patch.object(self.chunks, "build", side_effect=build):
            self.assertEqual(self.store.request(self.identity, 0)[0], 202)
            self.assertTrue(started.wait(timeout=2))
            before = time.monotonic()
            self.assertEqual(self.store.request(self.identity, 0)[0], 202)
            self.assertLess(time.monotonic() - before, 0.5)
            self.assertEqual(len(self.store.jobs), 1)
            release.set()
            self.ready()

    def test_real_cached_starting_grid_can_be_routed_without_network(self):
        root = Path(__file__).resolve().parents[1]
        base = json.loads((root / "public/map.json").read_text())
        def cell(col, row):
            return base["rows"][row][col] if 0 <= row < base["height"] and 0 <= col < base["width"] else {
                "terrain": "plain", "unavailable": True}
        with patch("urllib.request.urlopen", side_effect=AssertionError("No network")):
            data = find_path((12, 12), (20, 18), cell)
        self.assertEqual(data["points"][0], [12, 12])
        self.assertEqual(data["points"][-1], [20, 18])
        self.assertGreaterEqual(data["distanceMeters"], 14 * 250)

    def test_http_polling_validation_and_errors_do_not_expose_geometry(self):
        chunks = ChunkStore(cache=self.chunks.cache)
        jobs = ChunkJobs(chunks)
        self.addCleanup(jobs.pool.shutdown)
        with patch("travel_server.ParentPaths", return_value=self.store):
            server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(chunks, jobs, self.pool))
        thread = threading.Thread(target=server.serve_forever)
        thread.start()
        def close():
            server.shutdown()
            server.server_close()
            thread.join()
        self.addCleanup(close)
        def call(query):
            try:
                result = urllib.request.urlopen(
                    f"http://127.0.0.1:{server.server_port}/api/parent-path?{query}", timeout=3)
            except urllib.error.HTTPError as error:
                result = error
            with result:
                self.assertEqual(result.headers["Cache-Control"], "no-store")
                return result.status, json.load(result)
        status, _ = call(f"journey={self.identity}&stage=0")
        self.assertEqual(status, 202)
        self.ready()
        status, data = call(f"journey={self.identity}&stage=0")
        self.assertEqual(status, 200)
        self.assertNotIn("points", data)
        for query in [f"journey={self.identity}&stage=-1", f"journey={self.identity}&stage=0&retry=yes",
                      f"journey={self.identity}&stage=0&stage=1", f"journey={self.identity}&extra=x",
                      f"journey={self.identity}&stage=bad"]:
            self.assertEqual(call(query)[0], 400)
        self.assertEqual(call("journey=missing&stage=0")[0], 404)


if __name__ == "__main__":
    unittest.main()
