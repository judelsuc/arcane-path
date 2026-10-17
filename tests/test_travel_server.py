import gzip
import json
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from travel_server import ChunkJobs, ChunkStore, CHUNK_SIZE, chunk_geometry, fetch_elevations, make_handler
from http.server import ThreadingHTTPServer

ROOT = Path(__file__).resolve().parents[1]


class TravelServerTests(unittest.TestCase):
    def test_adjacent_chunks_share_exact_seams_and_fixed_resolution(self):
        base = json.loads((ROOT / "public/map.json").read_text())
        a, lat, centers = chunk_geometry(base, 0, 0)
        east, _, _ = chunk_geometry(base, 1, 0)
        south, _, _ = chunk_geometry(base, 0, 1)
        west, _, _ = chunk_geometry(base, -1, 0)
        self.assertEqual(a[2], east[0])
        self.assertEqual(a[1], south[3])
        self.assertEqual(west[2], a[0])
        self.assertEqual(len(centers), CHUNK_SIZE ** 2)
        self.assertEqual(lat, (base["bounds"]["minLatitude"] + base["bounds"]["maxLatitude"]) / 2)

    def test_real_snapshot_chunk_caches_heights_and_grid_offline(self):
        with tempfile.TemporaryDirectory() as directory:
            store = ChunkStore(cache=Path(directory))
            heights = {"values": list(range(64)), "source": "test", "sourceUrl": "https://example.org"}
            with patch("travel_server.fetch_elevations", return_value=heights) as fetch, \
                    patch("travel_server.download_region", side_effect=AssertionError("Network forbidden")):
                data = store.build("firmi", 1, 1)
                self.assertEqual(data["width"], 8)
                self.assertEqual(data["height"], 8)
                self.assertEqual(data["rows"][7][7]["elevationMeters"], 63)
                self.assertEqual(store.build("firmi", 1, 1), data)
                self.assertEqual(fetch.call_count, 1)
            cached_store = ChunkStore(cache=Path(directory))
            self.assertEqual(cached_store.read("firmi", 1, 1), data)
            path = store.path("firmi", 1, 1).with_suffix(".json")
            cached = json.loads(path.read_text())
            cached["data"]["rows"][0][0]["terrain"] = "water"
            path.write_text(json.dumps(cached))
            with self.assertRaisesRegex(ValueError, "Corrupt travel cache"):
                store.read("firmi", 1, 1)

    def test_elevation_failure_is_explicit_and_retry_preserves_osm(self):
        with tempfile.TemporaryDirectory() as directory:
            store = ChunkStore(cache=Path(directory))
            with patch("travel_server.fetch_elevations", side_effect=OSError("Provider offline")):
                data = store.build("firmi", 1, 1)
            self.assertIn("Provider offline", data["elevation"]["error"])
            self.assertNotIn("elevationMeters", data["rows"][0][0])
            self.assertIsNone(store.read("firmi", 1, 1))
            self.assertTrue(store.source_path("firmi", 1, 1).with_suffix(".osm.gz").exists())
            with patch("travel_server.fetch_elevations", return_value={"values": [100] * 64}), \
                    patch("travel_server.download_region", side_effect=AssertionError("No new download")):
                retried = store.build("firmi", 1, 1)
            self.assertEqual(retried["rows"][0][0]["elevationMeters"], 100)

    def test_external_chunk_download_has_same_projection_and_persistent_source(self):
        with tempfile.TemporaryDirectory() as directory:
            store = ChunkStore(cache=Path(directory))
            def download(bounds, name, output):
                output.parent.mkdir(parents=True, exist_ok=True)
                with gzip.open(output, "wt") as stream:
                    stream.write(f"""<osm><bounds minlon="{bounds[0]}" minlat="{bounds[1]}"
                    maxlon="{bounds[2]}" maxlat="{bounds[3]}"/>
                    <node id="1" lon="{(bounds[0]+bounds[2])/2}" lat="{(bounds[1]+bounds[3])/2}"/>
                    </osm>""")
            with patch("travel_server.download_region", side_effect=download) as fetch, \
                    patch("travel_server.fetch_elevations", return_value={"values": [100] * 64}):
                data = store.build("firmi", -1, 0)
            self.assertEqual(fetch.call_count, 1)
            self.assertAlmostEqual(data["projectionLatitude"], 44.5449978)
            self.assertEqual(data["width"], 8)

    def test_jobs_are_deduplicated_and_queue_is_bounded(self):
        gate = threading.Event()
        class Store:
            def read(self, *key):
                return None
            def build(self, *key):
                gate.wait(3)
                return {"key": key}
        jobs = ChunkJobs(Store(), workers=1, capacity=1)
        try:
            self.assertEqual(jobs.request("firmi", 0, 0)[0], 202)
            self.assertEqual(jobs.request("firmi", 0, 0)[0], 202)
            self.assertEqual(jobs.request("firmi", 1, 0)[0], 429)
            gate.set()
            jobs.jobs[("firmi", 0, 0)].result(timeout=3)
            self.assertEqual(jobs.request("firmi", 0, 0)[0], 200)
        finally:
            gate.set()
            jobs.pool.shutdown()

    def test_http_rejects_invalid_regions_coordinates_and_private_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            store = ChunkStore(cache=Path(directory))
            jobs = ChunkJobs(store)
            server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(store, jobs))
            thread = threading.Thread(target=server.serve_forever)
            thread.start()
            url = f"http://127.0.0.1:{server.server_port}"
            try:
                with urllib.request.urlopen(url + "/api/travel") as response:
                    self.assertEqual(json.load(response)["chunkSize"], 8)
                with urllib.request.urlopen(url + "/public/config.json") as response:
                    settings = json.load(response)
                    self.assertEqual(settings["survival"]["reserve_kcal"], 1800)
                    self.assertEqual(settings["photos"]["max_per_cell"], 5)
                with patch("travel_server.WeatherStore.get", return_value={"months": []}) as weather:
                    with urllib.request.urlopen(url + "/api/weather?region=firmi&x=1&y=1") as response:
                        self.assertEqual(json.load(response), {"months": []})
                    weather.assert_called_once()
                    with patch("travel_server.WeatherStore.get", side_effect=OSError("Weather offline")):
                        with self.assertRaises(urllib.error.HTTPError) as raised:
                            urllib.request.urlopen(url + "/api/weather?region=firmi&x=1&y=1")
                        self.assertEqual(raised.exception.code, 502)
                        raised.exception.close()
                for path, status in [
                    ("/api/weather?region=unknown&x=0&y=0", 400),
                    ("/api/chunk?region=unknown&x=0&y=0", 400),
                    ("/api/chunk?region=firmi&x=1001&y=0", 400),
                    ("/api/chunk?region=firmi&x=a&y=0", 400),
                    ("/.git/config", 403),
                ]:
                    with self.assertRaises(urllib.error.HTTPError) as raised:
                        urllib.request.urlopen(url + path)
                    self.assertEqual(raised.exception.code, status)
                    raised.exception.close()
            finally:
                server.shutdown()
                server.server_close()
                thread.join()
                jobs.pool.shutdown()

    def test_invalid_provider_heights_are_rejected(self):
        class Response:
            def __enter__(self):
                return self
            def __exit__(self, *args):
                pass
            def read(self):
                return b'{"elevation":[null]}'
        with patch("travel_server.urllib.request.urlopen", return_value=Response()):
            with self.assertRaisesRegex(ValueError, "invalid heights"):
                fetch_elevations([(44.5, 2.3)])

    def test_pipeline_changes_rebuild_grids_without_redownloading_sources_or_heights(self):
        with tempfile.TemporaryDirectory() as directory:
            store = ChunkStore(cache=Path(directory))
            with patch("travel_server.fetch_elevations", return_value={"values": [100] * 64}):
                store.build("firmi", 1, 1)
            source = store.source_path("firmi", 1, 1)
            store.pipeline = "updated-rasterizer"
            self.assertEqual(source, store.source_path("firmi", 1, 1))
            self.assertIsNone(store.read("firmi", 1, 1))
            with patch("travel_server.fetch_elevations", side_effect=AssertionError("Elevation network forbidden")), \
                    patch("travel_server.download_region", side_effect=AssertionError("OSM network forbidden")):
                rebuilt = store.build("firmi", 1, 1)
            self.assertEqual(rebuilt["rows"][0][0]["elevationMeters"], 100)


if __name__ == "__main__":
    unittest.main()
