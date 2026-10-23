import gzip
import json
import math
import sys
import tempfile
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from starting_places import PlaceLookup, coordinates, european
from asset_storage import AssetConflict, AssetError, local_storage
from travel_server import CELL_METERS, RADIUS, ChunkStore, chunk_geometry


class StartingPlaceTests(unittest.TestCase):
    def test_european_coverage_and_invalid_coordinates(self):
        for latitude, longitude, country in [
            (44.5, 2.3, "fr"), (64.1, -21.9, "is"), (35, 33, "cy"),
            (59.9, 30.3, "ru"), (41.1, 28.8, "tr"),
        ]:
            european(latitude, longitude, country)
        for latitude, longitude, country in [
            (-17, -149, "pf"), (40, -74, "us"), (36, 3, "dz"), (39, 33, "tr"),
            (0, 0, "fr"), (44, 2, "xx"),
        ]:
            with self.assertRaises(ValueError):
                european(latitude, longitude, country)
        for latitude, longitude in [(math.nan, 2), (44, math.inf), ("bad", 2)]:
            with self.assertRaises(ValueError):
                coordinates(latitude, longitude)

    def test_search_filters_and_reverse_preserves_requested_position(self):
        lookup = PlaceLookup()
        item = {"lat": "44.54", "lon": "2.30", "display_name": "Firmi, France",
                "address": {"country_code": "fr"}}
        with patch.object(lookup, "request", return_value=[
            item, {**item, "lat": "-17", "lon": "-149"},
            {**item, "address": {"country_code": "dz"}},
        ]) as request:
            self.assertEqual(lookup.search("Firmi"), [
                {"latitude": 44.54, "longitude": 2.3, "name": "Firmi, France"}])
            self.assertEqual(request.call_args.args[0], "search")
        with patch.object(lookup, "request", return_value=item):
            result = lookup.reverse(44.5412344, 2.3012344)
            self.assertEqual(result["latitude"], 44.541234)
            self.assertEqual(result["longitude"], 2.301234)
        with self.assertRaisesRegex(ValueError, "between"):
            lookup.search("x")
        with patch.object(lookup, "request", return_value={"error": "Unable to geocode"}):
            with self.assertRaisesRegex(ValueError, "no usable"):
                lookup.reverse(44.5, 2.3)

    def test_pricing_country_is_explicitly_resolved_not_inferred_from_region(self):
        lookup = PlaceLookup()
        with patch.object(lookup, "request", return_value={"address": {"country_code": "it"}}) as request:
            self.assertEqual(lookup.country(42, 12)["countryCode"], "IT")
            self.assertEqual(request.call_args.args, ("reverse", {"lat": 42.0, "lon": 12.0, "zoom": 3}))
        for response in [{}, {"address": {"country_code": "unknown"}}, []]:
            with patch.object(lookup, "request", return_value=response):
                with self.assertRaisesRegex(ValueError, "no usable country"):
                    lookup.country(42, 12)

    def test_requests_are_identified_cached_and_rate_limited(self):
        lookup = PlaceLookup()
        class Response:
            def __enter__(self):
                return self
            def __exit__(self, *args):
                pass
            def read(self):
                return b"[]"
        with patch("starting_places.urllib.request.urlopen", return_value=Response()) as fetch, \
                patch("starting_places.time.sleep") as sleep:
            lookup.search("Firmi")
            lookup.search("Firmi")
            lookup.search("Paris")
            self.assertEqual(fetch.call_count, 2)
            self.assertIn("github.com/judelsuc/arcane-path",
                          fetch.call_args.args[0].get_header("User-agent"))
            self.assertGreater(sleep.call_args.args[0], 1)

    def test_origin_geometry_persistence_and_offline_chunk_reuse(self):
        with tempfile.TemporaryDirectory() as directory:
            store = ChunkStore(cache=Path(directory))
            latitude, longitude = 44.540499, 2.309377
            place = {"latitude": latitude, "longitude": longitude, "name": "Test place"}
            events = []
            def download(bounds, name, output, on_progress=None):
                if on_progress:
                    on_progress({"phase": "download", "provider": "test.example"})
                output.parent.mkdir(parents=True, exist_ok=True)
                with gzip.open(output, "wt") as stream:
                    stream.write(f"""<osm><bounds minlon="{bounds[0]}" minlat="{bounds[1]}"
                        maxlon="{bounds[2]}" maxlat="{bounds[3]}"/>
                        <node id="1" lon="{longitude}" lat="{latitude}"/></osm>""")
            with patch.object(store.places, "reverse", return_value=place), \
                    patch("travel_server.download_region", side_effect=download) as fetch:
                origin = store.prepare_origin(latitude, longitude, on_progress=events.append)
                self.assertEqual([event["phase"] for event in events],
                                 ["queued", "location", "download", "geometry", "rasterize", "saving"])
                events.clear()
                self.assertEqual(store.prepare_origin(latitude, longitude, on_progress=events.append), origin)
                self.assertEqual([event["phase"] for event in events], ["queued", "cache"])
                self.assertEqual(fetch.call_count, 1)
            data, key = origin["map"], origin["region"]
            self.assertEqual((data["width"], data["height"]), (24, 24))
            lat_step = CELL_METERS / RADIUS * 180 / math.pi
            lon_step = lat_step / math.cos(math.radians(latitude))
            self.assertAlmostEqual(data["bounds"]["maxLatitude"] - 12.5 * lat_step, latitude)
            self.assertAlmostEqual(data["bounds"]["minLongitude"] + 12.5 * lon_step, longitude)
            bounds, projection, centers = chunk_geometry(data, 1, 1)
            self.assertEqual(projection, latitude)
            self.assertAlmostEqual(centers[4 * 8 + 4][0], latitude)
            self.assertAlmostEqual(centers[4 * 8 + 4][1], longitude)
            restored = ChunkStore(cache=Path(directory))
            self.assertEqual(restored.bases[key], data)
            self.assertEqual(restored.fingerprints[key], store.fingerprints[key])
            with patch("travel_server.fetch_elevations", return_value={"values": [100] * 64}), \
                    patch("travel_server.download_region", side_effect=AssertionError("Network forbidden")):
                chunk = restored.build(key, 1, 1)
                self.assertEqual(chunk["chunk"]["region"], key)
                self.assertEqual(chunk["projectionLatitude"], latitude)

    def test_shared_custom_origin_and_osm_source_survive_another_api_restart(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            assets = local_storage(root / "shared")
            first = ChunkStore(cache=root / "one")
            second = ChunkStore(cache=root / "two")
            first.set_shared_assets(assets)
            second.set_shared_assets(assets)
            latitude, longitude = 44.540499, 2.309377
            place = {"latitude": latitude, "longitude": longitude, "name": "Test place"}

            def download(bounds, name, output, on_progress=None):
                output.parent.mkdir(parents=True, exist_ok=True)
                with gzip.open(output, "wt") as stream:
                    stream.write(f'<osm><bounds minlon="{bounds[0]}" minlat="{bounds[1]}" '
                                 f'maxlon="{bounds[2]}" maxlat="{bounds[3]}"/>'
                                 f'<node id="1" lon="{longitude}" lat="{latitude}"/></osm>')

            with patch.object(first.places, "reverse", return_value=place), \
                    patch("travel_server.download_region", side_effect=download) as fetch:
                expected = first.prepare_origin(latitude, longitude)
                assets_reopened = local_storage(root / "shared")
                restarted = ChunkStore(cache=root / "three")
                restarted.set_shared_assets(assets_reopened)
                self.assertTrue(restarted.load_origin(expected["region"]))
                self.assertEqual(restarted.prepare_origin(latitude, longitude), expected)
                self.assertEqual(fetch.call_count, 1)
                with patch("travel_server.fetch_elevations", return_value={"values": [100] * 64}), \
                        patch("travel_server.download_region",
                              side_effect=AssertionError("Shared OSM source must be reused")):
                    chunk = restarted.build(expected["region"], 1, 1)
                self.assertEqual(chunk["chunk"]["region"], expected["region"])
                restored_source = Path(restarted.regions[expected["region"]]["snapshot"])
                self.assertTrue(restored_source.is_file())
                source_request, source_hash, _ = restarted.origin_sources[expected["region"]]
                record, raw = assets_reopened.read("custom-origin-source", source_request)
                self.assertEqual(record.sha256, source_hash)
                self.assertEqual(restored_source.read_bytes(), raw)
            self.assertFalse((root / "three" / "journeys.sqlite3").exists())

    def test_two_api_workers_coordinate_origin_download_and_publish_one_result(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            assets = local_storage(root / "shared")
            stores = [ChunkStore(cache=root / name) for name in ("one", "two")]
            for store in stores:
                store.set_shared_assets(assets)
            latitude, longitude = 44.540499, 2.309377
            place = {"latitude": latitude, "longitude": longitude, "name": "Test place"}
            entered, release = threading.Event(), threading.Event()
            calls = []

            def download(bounds, name, output, on_progress=None):
                calls.append(output)
                entered.set()
                if not release.wait(10):
                    raise OSError("Fixture was not released.")
                output.parent.mkdir(parents=True, exist_ok=True)
                with gzip.open(output, "wt") as stream:
                    stream.write(f'<osm><bounds minlon="{bounds[0]}" minlat="{bounds[1]}" '
                                 f'maxlon="{bounds[2]}" maxlat="{bounds[3]}"/>'
                                 f'<node id="1" lon="{longitude}" lat="{latitude}"/></osm>')

            with patch.object(stores[0].places, "reverse", return_value=place), \
                    patch.object(stores[1].places, "reverse", return_value=place), \
                    patch("travel_server.download_region", side_effect=download):
                with ThreadPoolExecutor(max_workers=2) as workers:
                    first = workers.submit(stores[0].prepare_origin, latitude, longitude)
                    self.assertTrue(entered.wait(5))
                    second = workers.submit(stores[1].prepare_origin, latitude, longitude)
                    time.sleep(.1)
                    release.set()
                    first_result, second_result = first.result(timeout=10), second.result(timeout=10)
            self.assertEqual(first_result, second_result)
            self.assertEqual(len(calls), 1)

    def test_shared_origin_integrity_errors_are_explicit(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            assets = local_storage(root / "shared")
            writer = ChunkStore(cache=root / "writer")
            latitude, longitude = 44.540499, 2.309377
            place = {"latitude": latitude, "longitude": longitude, "name": "Test place"}

            def download(bounds, name, output, on_progress=None):
                output.parent.mkdir(parents=True, exist_ok=True)
                with gzip.open(output, "wt") as stream:
                    stream.write(f'<osm><bounds minlon="{bounds[0]}" minlat="{bounds[1]}" '
                                 f'maxlon="{bounds[2]}" maxlat="{bounds[3]}"/>'
                                 f'<node id="1" lon="{longitude}" lat="{latitude}"/></osm>')

            writer.set_shared_assets(assets)
            with patch.object(writer.places, "reverse", return_value=place), \
                    patch("travel_server.download_region", side_effect=download):
                origin = writer.prepare_origin(latitude, longitude)
            with assets.catalogue.connection() as db:
                db.execute("UPDATE custom_origins SET payload='{}' WHERE region=?", (origin["region"],))
            reader = ChunkStore(cache=root / "reader")
            with self.assertRaisesRegex(AssetError, "integrity"):
                reader.set_shared_assets(assets)

    def test_expired_custom_origin_lease_cannot_publish_a_late_map(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            assets = local_storage(root / "shared")
            store = ChunkStore(cache=root / "writer")
            store.set_shared_assets(assets)
            latitude, longitude = 44.540499, 2.309377
            place = {"latitude": latitude, "longitude": longitude, "name": "Test place"}

            def download(bounds, name, output, on_progress=None):
                output.parent.mkdir(parents=True, exist_ok=True)
                with gzip.open(output, "wt") as stream:
                    stream.write(f'<osm><bounds minlon="{bounds[0]}" minlat="{bounds[1]}" '
                                 f'maxlon="{bounds[2]}" maxlat="{bounds[3]}"/>'
                                 f'<node id="1" lon="{longitude}" lat="{latitude}"/></osm>')

            with patch.object(store.places, "reverse", return_value=place), \
                    patch("travel_server.download_region", side_effect=download):
                origin = store.prepare_origin(latitude, longitude)
            key = origin["region"]
            stale = store._claim_origin(key)
            self.assertIsNotNone(stale)
            with assets.catalogue.connection() as db:
                db.execute("UPDATE custom_origin_leases SET expires=0 WHERE region=?", (key,))
            current = store._claim_origin(key)
            self.assertIsNotNone(current)
            self.assertNotEqual(stale, current)
            source = Path(store.regions[key]["snapshot"])
            with self.assertRaisesRegex(AssetConflict, "lease expired"):
                store.register_origin(key, origin["map"], source, lease_token=stale)
            with assets.catalogue.connection() as db:
                self.assertEqual(db.execute(
                    "SELECT token FROM custom_origin_leases WHERE region=?", (key,)).fetchone()[0], current)
                self.assertEqual(db.execute(
                    "SELECT COUNT(*) FROM custom_origins WHERE region=?", (key,)).fetchone()[0], 1)
            store._release_origin(key, current)
