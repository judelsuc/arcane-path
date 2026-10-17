import hashlib
import json
import sys
import tempfile
import threading
import urllib.error
import urllib.parse
import urllib.request
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from journey_terrain import cached_terrain
from travel_server import ChunkStore, ChunkJobs, make_handler


class JourneyTerrainTests(unittest.TestCase):
    def write(self, store, x, y, terrain):
        data = {"width": 8, "height": 8, "rows": [
            [{"terrain": terrain} for _ in range(8)] for _ in range(8)]}
        path = store.path("firmi", x, y).with_suffix(".json")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"data": data,
                                    "sha256": hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()}))
        return path

    def test_sparse_long_route_uses_every_cached_chunk_without_any_build_or_provider_request(self):
        with tempfile.TemporaryDirectory() as folder:
            store = ChunkStore(cache=Path(folder))
            for x, y in [(-2, -2), (0, 0), (2, 19), (3, 47), (1, 85), (4, 99)]:
                self.write(store, x, y, "forest")
            with patch.object(store, "build", side_effect=AssertionError("Must never prepare terrain")):
                result = cached_terrain(store, "firmi", [-30, -30, 60, 820])
            self.assertEqual(result["cachedChunks"], 6)
            self.assertFalse(result["sampled"])
            self.assertTrue(result["missing"])
            self.assertTrue(any(c["row"] >= 790 for c in result["cells"]))
            self.assertTrue(any(c["row"] < 0 for c in result["cells"]))
            self.assertTrue(all(c["terrain"] == "forest" for c in result["cells"]))

    def test_empty_cache_stays_empty_and_invalid_bounds_fail(self):
        with tempfile.TemporaryDirectory() as folder:
            store = ChunkStore(cache=Path(folder))
            self.assertEqual(cached_terrain(store, "firmi", [0, 0, 8, 8])["cells"], [])
            for bounds in [None, [0], [0, 0, -1, 2], [0, 0, 9000, 0], [True, 0, 0, 0]]:
                with self.assertRaises(ValueError):
                    cached_terrain(store, "firmi", bounds)
            with self.assertRaises(ValueError):
                cached_terrain(store, "unknown", [0, 0, 0, 0])

    def test_bad_cache_is_visible_not_rebuilt(self):
        with tempfile.TemporaryDirectory() as folder:
            store = ChunkStore(cache=Path(folder))
            path = self.write(store, 0, 0, "forest")
            payload = json.loads(path.read_text())
            payload["sha256"] = "wrong"
            path.write_text(json.dumps(payload))
            with self.assertRaisesRegex(ValueError, "Corrupt"):
                cached_terrain(store, "firmi", [0, 0, 8, 8])

    def test_http_reads_inventory_without_scheduling_downloads_and_rejects_invalid_queries(self):
        with tempfile.TemporaryDirectory() as folder:
            store = ChunkStore(cache=Path(folder))
            self.write(store, 0, 0, "water")
            jobs = ChunkJobs(store)
            server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(store, jobs))
            thread = threading.Thread(target=server.serve_forever)
            thread.start()
            base = f"http://127.0.0.1:{server.server_port}/api/journey-terrain?"
            try:
                with patch.object(store, "build", side_effect=AssertionError("No downloads")), \
                        patch.object(jobs, "request", side_effect=AssertionError("No jobs")):
                    query = urllib.parse.urlencode({"region": "firmi", "bounds": "[0,0,15,15]"})
                    with urllib.request.urlopen(base + query) as response:
                        data = json.load(response)
                    self.assertEqual(data["cachedChunks"], 1)
                    self.assertEqual(len(data["cells"]), 64)
                    self.assertTrue(all(c["terrain"] == "water" for c in data["cells"]))
                    for query in ["region=firmi", "region=unknown&bounds=[0,0,1,1]",
                                  "region=firmi&bounds=[0,0,9000,0]"]:
                        with self.assertRaises(urllib.error.HTTPError) as raised:
                            urllib.request.urlopen(base + query)
                        self.assertEqual(raised.exception.code, 400)
                        raised.exception.close()
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=3)
                jobs.pool.shutdown()


if __name__ == "__main__":
    unittest.main()
