import hashlib
import io
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
import urllib.error
from contextlib import contextmanager
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from osm_mirror import (ExtractIndex, MapDataPending, OsmMirror, build_poi_index, dated_candidates,
                        version_of)

OSMIUM = shutil.which("osmium")
FIXTURE = """<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6" generator="fixture">
  <node id="1" version="1" lat="44.600" lon="2.350"><tag k="amenity" v="cafe"/><tag k="name" v="Cafe A"/></node>
  <node id="2" version="1" lat="44.601" lon="2.351"/>
  <node id="3" version="1" lat="44.601" lon="2.353"/>
  <node id="4" version="1" lat="44.603" lon="2.353"/>
  <node id="5" version="1" lat="44.603" lon="2.351"/>
  <node id="6" version="1" lat="44.700" lon="2.500"/>
  <node id="7" version="1" lat="44.610" lon="2.360"/>
  <node id="8" version="1" lat="44.612" lon="2.360"/>
  <node id="9" version="1" lat="44.612" lon="2.364"/>
  <node id="10" version="1" lat="44.610" lon="2.364"/>
  <node id="11" version="1" lat="44.620" lon="2.340"><tag k="place" v="town"/><tag k="name" v="Bourg"/></node>
  <node id="12" version="1" lat="44.599" lon="2.349"><tag k="amenity" v="bench"/></node>
  <way id="100" version="1"><nd ref="2"/><nd ref="3"/><nd ref="4"/><nd ref="5"/><nd ref="2"/>
    <tag k="amenity" v="restaurant"/><tag k="name" v="Resto B"/><tag k="building" v="yes"/></way>
  <way id="101" version="1"><nd ref="1"/><nd ref="6"/><tag k="highway" v="primary"/></way>
  <way id="102" version="1"><nd ref="7"/><nd ref="8"/><nd ref="9"/><nd ref="10"/><nd ref="7"/></way>
  <relation id="200" version="1"><member type="way" ref="102" role="outer"/>
    <tag k="type" v="multipolygon"/><tag k="leisure" v="park"/><tag k="name" v="Parc C"/></relation>
</osm>
"""


def square(west, south, east, north):
    return [[[west, south], [east, south], [east, north], [west, north], [west, south]]]


def index_data():
    def feature(identity, parent, bounds):
        return {"type": "Feature", "properties": {
            "id": identity, "parent": parent, "name": identity.title(),
            "urls": {"pbf": f"https://download.geofabrik.de/europe/{identity}-latest.osm.pbf"}},
            "geometry": {"type": "Polygon", "coordinates": square(*bounds)}}
    return {"features": [
        feature("country", "europe", (0, 40, 10, 50)),
        feature("south", "country", (0, 40, 10, 45)),
        feature("north", "country", (0, 45, 10, 50)),
        feature("island", "europe", (20, 40, 21, 41)),
    ]}


class IndexTests(unittest.TestCase):
    def test_smallest_leaf_contains_the_point(self):
        index = ExtractIndex(index_data())
        self.assertEqual(index.leaf_for(44.6, 2.35), "south")
        self.assertEqual(index.leaf_for(46.0, 2.35), "north")
        self.assertEqual(index.leaf_for(40.5, 20.5), "island")
        self.assertIsNone(index.leaf_for(60.0, 2.0))
        self.assertTrue(index.contains("country", 44.6, 2.35), "parents still contain their children")

    def test_unpublished_latest_falls_back_to_previous_days(self):
        candidates = dated_candidates("https://download.geofabrik.de/europe/x/y-261122.osm.pbf", days=2)
        self.assertEqual(candidates, ["https://download.geofabrik.de/europe/x/y-261122.osm.pbf",
                                      "https://download.geofabrik.de/europe/x/y-261121.osm.pbf",
                                      "https://download.geofabrik.de/europe/x/y-261120.osm.pbf"])
        self.assertEqual(version_of(candidates[1]), "20261121")
        self.assertEqual(dated_candidates("https://download.geofabrik.de/a-latest.osm.pbf"),
                         ["https://download.geofabrik.de/a-latest.osm.pbf"])


class FakeS3:
    def __init__(self):
        self.objects = {}

    def upload_file(self, path, bucket, key):
        self.objects[key] = Path(path).read_bytes()

    def put_object(self, Bucket, Key, Body, ContentType=None):
        self.objects[Key] = Body

    def get_object(self, Bucket, Key):
        if Key not in self.objects:
            raise KeyError(Key)
        return {"Body": io.BytesIO(self.objects[Key])}

    def download_file(self, bucket, key, path):
        Path(path).write_bytes(self.objects[key])

    def delete_object(self, Bucket, Key):
        self.objects.pop(Key, None)

    def list_objects_v2(self, Bucket, Prefix, Delimiter=None):
        keys = [key for key in self.objects if key.startswith(Prefix)]
        if Delimiter:
            prefixes = sorted({Prefix + key[len(Prefix):].split("/")[0] + "/" for key in keys
                               if "/" in key[len(Prefix):]})
            return {"CommonPrefixes": [{"Prefix": prefix} for prefix in prefixes]}
        return {"Contents": [{"Key": key} for key in keys]}


@unittest.skipUnless(OSMIUM, "osmium-tool is required for extract processing")
class MirrorTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name) / "mirror"
        (self.root / "index").mkdir(parents=True)
        (self.root / "index" / "geofabrik-index.json").write_text(json.dumps(index_data()))
        osm = Path(self.directory.name) / "fixture.osm"
        osm.write_text(FIXTURE)
        self.pbf = Path(self.directory.name) / "fixture.osm.pbf"
        subprocess.run([OSMIUM, "cat", str(osm), "-o", str(self.pbf), "-O"], check=True, capture_output=True)

    def tearDown(self):
        self.directory.cleanup()

    def install(self, identity="south", version="20261121"):
        target = self.root / "extracts" / identity / version
        target.mkdir(parents=True)
        shutil.copy(self.pbf, target / "source.osm.pbf")
        build_poi_index(target / "source.osm.pbf", target / "pois.sqlite")
        (target.parent / "current.json").write_text(json.dumps({
            "version": version, "sourceUrl": f"https://download.geofabrik.de/europe/{identity}-261121.osm.pbf"}))

    def test_points_of_interest_match_overpass_shape_nearest_first(self):
        self.install()
        mirror = OsmMirror(self.root)
        found = mirror.around(44.6, 2.35, 2000, [("amenity", {"cafe", "restaurant"}), ("leisure", {"park"})])
        self.assertEqual([(e["type"], e["id"]) for e in found], [("node", 1), ("way", 100), ("relation", 200)])
        self.assertEqual(found[0]["lat"], 44.6)
        self.assertAlmostEqual(found[1]["center"]["lat"], 44.602)
        self.assertEqual(found[2]["tags"]["name"], "Parc C")
        towns = mirror.around(44.6, 2.35, 5000, [("place", {"town"})], named=True, types=("node",))
        self.assertEqual([e["tags"]["name"] for e in towns], ["Bourg"])
        self.assertEqual(len(mirror.around(44.6, 2.35, 2000, [("amenity", None)], limit=2)), 2)

    def test_bbox_map_keeps_ways_complete_and_sets_requested_bounds(self):
        self.install()
        root, label = OsmMirror(self.root).bbox_map((2.34, 44.59, 2.37, 44.62))
        bounds = root.find("bounds").attrib
        self.assertEqual((bounds["minlon"], bounds["maxlat"]), ("2.34", "44.62"))
        self.assertIsNotNone(root.find("node[@id='6']"), "the road leaving the box stays complete")
        self.assertIn("south@20261121", label)

    def test_uncovered_areas_answer_none_and_queue_their_sub_region(self):
        self.install()
        mirror = OsmMirror(self.root)
        self.assertIsNone(mirror.around(44.99, 2.35, 5000, [("place", None)]),
                          "a circle crossing into an uninstalled sub-region is never answered partially")
        self.assertTrue((self.root / "queue" / "north.json").is_file())
        self.assertIsNone(mirror.bbox_map((2.3, 46.0, 2.31, 46.01)))
        self.assertFalse(mirror.request("north", "again"), "queueing is idempotent")

    def test_ingest_downloads_the_newest_published_file_verifies_md5_publishes_and_prunes(self):
        data = self.pbf.read_bytes()
        files = {"https://download.geofabrik.de/europe/south-261121.osm.pbf": data,
                 "https://download.geofabrik.de/europe/south-261121.osm.pbf.md5":
                     f"{hashlib.md5(data).hexdigest()}  south-261121.osm.pbf\n".encode()}

        def opener(request, timeout=None):
            url = request.full_url
            if url not in files:
                raise urllib.error.HTTPError(url, 404, "Not Found", {}, None)

            @contextmanager
            def response():
                yield io.BytesIO(files[url])
            return response()

        s3 = FakeS3()
        for old in ("20260801", "20260901", "20261001"):
            s3.objects[f"osm/south/{old}/source.osm.pbf"] = b"old"
        mirror = OsmMirror(self.root, bucket="maps", s3_factory=lambda: s3, opener=opener,
                           resolver=lambda url: "https://download.geofabrik.de/europe/south-261122.osm.pbf")
        self.assertTrue(mirror.request("south"))
        self.assertEqual(mirror.drain(max_age_days=100000), ["south"])
        self.assertEqual(mirror.installed()["south"]["version"], "20261121", "the unpublished 261122 file was skipped")
        self.assertEqual(json.loads(s3.objects["osm/south/current.json"])["version"], "20261121")
        versions = sorted({key.split("/")[2] for key in s3.objects if key.count("/") == 3})
        self.assertEqual(versions, ["20261001", "20261121"], "the current and one previous version are kept")
        self.assertEqual(len(mirror.around(44.6, 2.35, 2000, [("amenity", {"cafe"})])), 1)
        self.assertFalse((self.root / "queue" / "south.json").exists())

        fresh = OsmMirror(Path(self.directory.name) / "second", bucket="maps", s3_factory=lambda: s3,
                          opener=lambda *a, **k: self.fail("a published copy must come from S3"))
        (fresh.root / "index").mkdir(parents=True)
        shutil.copy(self.root / "index" / "geofabrik-index.json", fresh.root / "index")
        self.assertEqual(fresh.ingest("south", max_age_days=100000), "s3")
        self.assertEqual(fresh.installed()["south"]["version"], "20261121")


class QuestMirrorTests(unittest.TestCase):
    def test_quests_wait_for_complete_regional_data_instead_of_partial_caches(self):
        from quest_destinations import QuestDestinations

        class Uncovered:
            def around(self, *args, **kwargs):
                return None
        quests = QuestDestinations.__new__(QuestDestinations)
        quests.mirror = Uncovered()
        with self.assertRaises(MapDataPending):
            quests.pois({"id": "geoname:1", "latitude": 44.6, "longitude": 2.35}, {})
        self.assertFalse(issubclass(MapDataPending, (OSError, ValueError)),
                         "provider fallbacks catch OSError/ValueError and must not swallow it")


if __name__ == "__main__":
    unittest.main()
