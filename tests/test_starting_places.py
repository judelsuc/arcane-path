import gzip
import json
import math
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from starting_places import PlaceLookup, coordinates, european
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
