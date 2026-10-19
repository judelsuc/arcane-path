import math
import sys
import tempfile
import unittest
from pathlib import Path
import xml.etree.ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from build_map import EARTH_RADIUS_METERS, rasterize


class UrbanCoverageTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.source = Path(self.directory.name) / "urban.osm"
        self.root = ET.Element("osm")
        degree = 180 / math.pi / EARTH_RADIUS_METERS
        self.degree = degree
        ET.SubElement(self.root, "bounds", minlat="0", minlon="0",
                      maxlat=str(240 * degree), maxlon=str(240 * degree))

    def rectangle(self, identity, left, right, terrain="building"):
        for i, (x, y) in enumerate([(left, 0), (right, 0), (right, 240), (left, 240)]):
            ET.SubElement(self.root, "node", id=f"{identity}-{i}",
                          lon=str(x * self.degree), lat=str(y * self.degree))
        way = ET.SubElement(self.root, "way", id=str(identity))
        for i in (0, 1, 2, 3, 0):
            ET.SubElement(way, "nd", ref=f"{identity}-{i}")
        ET.SubElement(way, "tag", k="building" if terrain == "building" else "natural",
                      v="yes" if terrain == "building" else terrain)
        return way

    def result(self):
        self.source.write_bytes(ET.tostring(self.root))
        return rasterize(self.source, "Urban test")

    def test_substantial_union_not_any_house_or_duplicate_coverage(self):
        self.rectangle(1, 0, 24)
        self.rectangle(2, 0, 24)
        cell = self.result()["rows"][0][0]
        self.assertEqual(cell["terrain"], "plain")
        self.assertEqual(cell["buildingCoveragePercent"], 10)
        self.rectangle(3, 48, 72)
        cell = self.result()["rows"][0][0]
        self.assertEqual(cell["terrain"], "building")
        self.assertEqual(cell["glyph"], "#")
        self.assertEqual(cell["buildingCoveragePercent"], 20)
        self.assertEqual(self.result()["buildingCoverageThresholdPercent"], 15)

    def test_exact_threshold_and_order_independence(self):
        self.rectangle(1, 0, 36)
        before = self.result()
        self.assertEqual(before["rows"][0][0]["terrain"], "building")
        self.assertEqual(before["rows"][0][0]["buildingCoveragePercent"], 15)
        self.root[:] = list(reversed(self.root[:]))
        self.assertEqual(self.result()["rows"], before["rows"])

    def test_roads_rail_water_and_named_landmarks_remain_visible(self):
        self.rectangle(1, 0, 240)
        for key, value, expected in [("highway", "primary", "major_road"),
                                      ("railway", "rail", "rail"), ("natural", "water", "water")]:
            with self.subTest(expected=expected):
                way = self.rectangle(2, 0, 240, "water")
                way.find("tag").attrib.update(k=key, v=value)
                self.assertEqual(self.result()["rows"][0][0]["terrain"], expected)
                self.root.remove(way)
        node = ET.SubElement(self.root, "node", id="landmark",
                             lon=str(120 * self.degree), lat=str(120 * self.degree))
        ET.SubElement(node, "tag", k="amenity", v="place_of_worship")
        ET.SubElement(node, "tag", k="name", v="Mapped landmark")
        cell = self.result()["rows"][0][0]
        self.assertEqual(cell["terrain"], "church")
        self.assertEqual(cell["names"], ["Mapped landmark"])

    def test_multipolygon_courtyards_do_not_count_as_buildings(self):
        outer = self.rectangle(1, 0, 240)
        inner = self.rectangle(2, 24, 216)
        for way in (outer, inner):
            way.remove(way.find("tag"))
        relation = ET.SubElement(self.root, "relation", id="building")
        ET.SubElement(relation, "member", type="way", ref="1", role="outer")
        ET.SubElement(relation, "member", type="way", ref="2", role="inner")
        ET.SubElement(relation, "tag", k="type", v="multipolygon")
        ET.SubElement(relation, "tag", k="building", v="yes")
        cell = self.result()["rows"][0][0]
        self.assertEqual(cell["terrain"], "building")
        self.assertEqual(cell["buildingCoveragePercent"], 20)
