import gzip
import json
import os
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from travel_server import ChunkJobs, ChunkStore, OriginStore, CHUNK_SIZE, chunk_geometry, fetch_elevations, make_handler
from http.server import ThreadingHTTPServer

ROOT = Path(__file__).resolve().parents[1]


class TravelServerTests(unittest.TestCase):
    def test_grid_identity_ignores_api_and_fetch_transport_edits_but_tracks_rasterizer(self):
        original = ChunkStore()
        original_read = Path.read_bytes
        def changed(path):
            data = original_read(path)
            return data + b"\n# transport-only change\n" if path.name in {"travel_server.py", "fetch_osm.py"} else data
        with patch.object(Path, "read_bytes", changed):
            self.assertEqual(ChunkStore().pipeline, original.pipeline)
        def raster_changed(path):
            data = original_read(path)
            return data + b"\n# raster change\n" if path.name == "build_map.py" else data
        with patch.object(Path, "read_bytes", raster_changed):
            self.assertNotEqual(ChunkStore().pipeline, original.pipeline)

    def test_existing_partial_chunk_source_is_repaired_before_rasterizing(self):
        with tempfile.TemporaryDirectory() as directory:
            store = ChunkStore(cache=Path(directory))
            source = store.source_path("firmi", -1, 0).with_suffix(".osm.gz")
            source.parent.mkdir(parents=True)
            snapshot = ROOT / store.regions["firmi"]["snapshot"]
            with gzip.open(snapshot, "rb") as stream:
                root = ET.parse(stream).getroot()
            partial = ET.fromstring(ET.tostring(root))
            relation = ET.SubElement(partial, "relation", {"id": "987654321"})
            ET.SubElement(relation, "member", {"type": "way", "ref": "missing", "role": "outer"})
            ET.SubElement(relation, "tag", {"k": "type", "v": "multipolygon"})
            ET.SubElement(relation, "tag", {"k": "landuse", "v": "meadow"})
            source.write_bytes(gzip.compress(ET.tostring(partial)))

            def repair(bounds, name, output, refresh):
                self.assertTrue(refresh)
                self.assertEqual(output, source)
                b = root.find("bounds")
                b.attrib.update(dict(zip(("minlon", "minlat", "maxlon", "maxlat"), map(str, bounds))))
                output.write_bytes(gzip.compress(ET.tostring(root)))

            with patch("travel_server.download_region", side_effect=repair) as fetch, \
                    patch("travel_server.fetch_elevations", return_value={"values": [100] * 64}):
                data = store.build("firmi", -1, 0)
            fetch.assert_called_once()
            self.assertEqual(data["width"], 8)
            self.assertEqual(store.read("firmi", -1, 0), data)

    def test_origin_progress_is_polled_without_blocking_and_counts_only_requests(self):
        store = ChunkStore()
        origins = OriginStore(store)
        jobs = ChunkJobs(origins, workers=1)
        started, release = threading.Event(), threading.Event()

        def prepare(latitude, longitude, on_progress):
            on_progress({"phase": "sourceQueue"})
            on_progress({"phase": "download", "provider": "api.openstreetmap.org"})
            on_progress({"phase": "split"})
            on_progress({"phase": "download", "provider": "api.openstreetmap.org"})
            started.set()
            release.wait(timeout=3)
            return {"region": "test"}

        try:
            with patch.object(store, "prepare_origin", side_effect=prepare):
                self.assertEqual(jobs.request(42, 12)[0], 202)
                self.assertTrue(started.wait(timeout=3))
                status, payload = jobs.request(42, 12)
                self.assertEqual(status, 202)
                self.assertEqual(payload["progress"]["requests"], 2)
                self.assertEqual(payload["progress"]["provider"], "api.openstreetmap.org")
                payload["progress"]["requests"] = 999
                self.assertEqual(origins.get_progress(42, 12)["requests"], 2)
                release.set()
                jobs.jobs[(42, 12)].result(timeout=3)
                self.assertEqual(jobs.request(42, 12), (200, {"region": "test"}))
                self.assertEqual(origins.progress, {})
        finally:
            release.set()
            jobs.pool.shutdown()
        with patch.object(store, "prepare_origin", side_effect=ValueError("Unavailable")):
            with self.assertRaisesRegex(ValueError, "Unavailable"):
                origins.build(42, 12)
        self.assertEqual(origins.progress, {})

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

    def test_elevation_failure_preserves_visible_grid_across_restart_and_retries_after_cooldown(self):
        with tempfile.TemporaryDirectory() as directory:
            store = ChunkStore(cache=Path(directory))
            with patch("travel_server.fetch_elevations", side_effect=OSError("Provider offline")):
                data = store.build("firmi", 1, 1)
            self.assertIn("Provider offline", data["elevation"]["error"])
            self.assertNotIn("elevationMeters", data["rows"][0][0])
            restarted = ChunkStore(cache=Path(directory))
            self.assertEqual(restarted.read("firmi", 1, 1), data)
            with patch("travel_server.fetch_elevations", side_effect=AssertionError("Cooldown forbids network")):
                self.assertEqual(restarted.build("firmi", 1, 1), data)
            self.assertTrue(store.source_path("firmi", 1, 1).with_suffix(".osm.gz").exists())
            path = store.path("firmi", 1, 1).with_suffix(".json")
            os.utime(path, (0, 0))
            with patch("travel_server.fetch_elevations", return_value={"values": [100] * 64}), \
                    patch("travel_server.rasterize", side_effect=AssertionError("Reuse cached terrain")), \
                    patch("travel_server.download_region", side_effect=AssertionError("No new download")):
                retried = store.build("firmi", 1, 1)
            self.assertEqual(retried["rows"][0][0]["elevationMeters"], 100)
            self.assertNotIn("error", retried["elevation"])
            self.assertEqual(restarted.read("firmi", 1, 1), retried)

    def test_elevation_refresh_serves_cached_terrain_while_background_provider_is_pending(self):
        with tempfile.TemporaryDirectory() as directory:
            store = ChunkStore(cache=Path(directory))
            with patch("travel_server.fetch_elevations", side_effect=OSError("Provider offline")):
                data = store.build("firmi", 1, 1)
            path = store.path("firmi", 1, 1).with_suffix(".json")
            os.utime(path, (0, 0))
            started, release = threading.Event(), threading.Event()
            def heights(centers):
                started.set()
                release.wait(timeout=3)
                return {"values": [100] * len(centers)}
            jobs = ChunkJobs(store, workers=1)
            try:
                with patch("travel_server.fetch_elevations", side_effect=heights):
                    self.assertEqual(jobs.request("firmi", 1, 1), (200, data))
                    self.assertTrue(started.wait(timeout=3))
                    self.assertEqual(jobs.request("firmi", 1, 1), (200, data))
                    release.set()
                    jobs.jobs[("firmi", 1, 1)].result(timeout=3)
                    status, refreshed = jobs.request("firmi", 1, 1)
                    self.assertEqual(status, 200)
                    self.assertEqual(refreshed["rows"][0][0]["elevationMeters"], 100)
            finally:
                release.set()
                jobs.pool.shutdown()

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
                with urllib.request.urlopen(url + "/api/origins") as response:
                    self.assertEqual(json.load(response), [])
                cached_chunk = {"chunk": {"region": "firmi", "x": 0, "y": 0}}
                with patch.object(store, "read", side_effect=[cached_chunk, None]) as read, \
                        patch.object(jobs, "request") as request, \
                        patch.object(store, "build") as build:
                    query = urllib.parse.urlencode({"region": "firmi", "positions": "[[0,0],[1,0]]"})
                    with urllib.request.urlopen(url + "/api/chunks-cached?" + query) as response:
                        self.assertEqual(json.load(response), {"chunks": [cached_chunk]})
                    self.assertEqual(read.call_count, 2)
                    request.assert_not_called()
                    build.assert_not_called()
                place = {"latitude": 44.5, "longitude": 2.3, "name": "Firmi"}
                with patch.object(store.places, "search", return_value=[place]) as search:
                    with urllib.request.urlopen(url + "/api/places?q=Firmi") as response:
                        self.assertEqual(json.load(response), [place])
                    search.assert_called_once_with("Firmi")
                with patch.object(store.places, "reverse", return_value=place) as reverse:
                    with urllib.request.urlopen(url + "/api/location?latitude=44.5&longitude=2.3") as response:
                        self.assertEqual(json.load(response), place)
                    reverse.assert_called_once_with(44.5, 2.3)
                with patch.object(store.places, "country", return_value={"countryCode": "IT"}) as country:
                    with urllib.request.urlopen(url + "/api/pricing-country?latitude=42&longitude=12") as response:
                        self.assertEqual(json.load(response), {"countryCode": "IT"})
                    country.assert_called_once_with(42, 12)
                with patch.object(store.places, "country", side_effect=OSError("Country offline")):
                    with self.assertRaises(urllib.error.HTTPError) as raised:
                        urllib.request.urlopen(url + "/api/pricing-country?latitude=42&longitude=12")
                    self.assertEqual(raised.exception.code, 502)
                    raised.exception.close()
                with patch.object(store.places, "search", side_effect=OSError("Lookup offline")):
                    with self.assertRaises(urllib.error.HTTPError) as raised:
                        urllib.request.urlopen(url + "/api/places?q=Firmi")
                    self.assertEqual(raised.exception.code, 502)
                    raised.exception.close()
                with urllib.request.urlopen(url + "/public/config.json") as response:
                    settings = json.load(response)
                    self.assertEqual(settings["survival"]["reserve_kcal"], 1800)
                    self.assertEqual(settings["photos"]["max_per_cell"], 10)
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
                    *[("/api/chunks-cached?" + urllib.parse.urlencode({
                        "region": region, "positions": json.dumps(positions),
                    }), 400) for region, positions in [
                        ("unknown", [[0, 0]]), ("firmi", []), ("firmi", [[0, 0]] * 10),
                        ("firmi", [[True, 0]]), ("firmi", [[1001, 0]]),
                        ("firmi", [[0]]), ("firmi", {"x": 0}), ("firmi", [[0.5, 0]]),
                    ]],
                    ("/api/origin?latitude=nan&longitude=2.3", 502),
                    ("/api/origin-map?region=firmi", 400),
                    ("/api/trail?region=unknown&seed=00000001", 400),
                    ("/api/trail?region=firmi&seed=invalid", 400),
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
