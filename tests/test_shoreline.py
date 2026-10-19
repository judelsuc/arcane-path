import struct
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from shoreline import Shoreline
from build_map import rasterize


def polygon(points, level=1):
    xs, ys = zip(*points)
    header = (0, len(points), level, min(xs), max(xs), min(ys), max(ys), 0, 0, -1, -1)
    return struct.pack(">11i", *header) + b"".join(struct.pack(">ii", *point) for point in points)


class ShorelineTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "land.b"
        self.path.write_bytes(polygon([(0, 0), (1000000, 0), (1000000, 1000000), (0, 1000000)]))

    def test_closed_land_ocean_islands_and_longitude_wrap(self):
        self.path.write_bytes(self.path.read_bytes() + polygon([
            (2000000, 0), (3000000, 0), (3000000, 1000000), (2000000, 1000000)]))
        mask = Shoreline(self.path)
        self.assertEqual(mask.ocean_samples([-.5, .5, 1.5, 2.5, 3.5], [.5]), [[0, 2, 4]])
        self.assertEqual(mask.ocean_samples([.5, 2.5], [1.5]), [[0, 1]])
        self.path.write_bytes(polygon([(350000000, 0), (351000000, 0),
                                       (351000000, 1000000), (350000000, 1000000)]))
        self.assertEqual(Shoreline(self.path).ocean_samples([-10.5, -9.5, -8.5], [.5]), [[0, 2]])

    def test_greenwich_crossing_and_antarctic_icefront(self):
        points = [(359000000, 0), (1000000, 0), (1000000, 1000000), (359000000, 1000000)]
        self.path.write_bytes(struct.pack(">11i", 0, 4, 1 | 1 << 16,
                                         -1000000, 1000000, 0, 1000000, 0, 0, -1, -1)
                              + b"".join(struct.pack(">ii", *p) for p in points))
        self.assertEqual(Shoreline(self.path).ocean_samples([-1.5, -.5, .5, 1.5], [.5]), [[0, 3]])
        points = [(180000000, -70000000), (0, -70000000), (-180000000, -70000000)]
        self.path.write_bytes(struct.pack(">11i", 0, 3, 5, -180000000, 180000000,
                                         -90000000, -70000000, 0, 0, -1, -1)
                              + b"".join(struct.pack(">ii", *p) for p in points))
        self.assertEqual(Shoreline(self.path).ocean_samples([-179, 0, 179], [-84, -65]),
                         [[], [0, 1, 2]])

    def test_empty_offshore_osm_and_land_mask_do_not_infer_water_from_absence(self):
        source = self.path.with_suffix(".osm")
        source.write_text('<osm><bounds minlat="0.5" maxlat="0.502" minlon="2" maxlon="2.002"/></osm>')
        sea = rasterize(source, "Open sea", shoreline=Shoreline(self.path))
        self.assertEqual(sea["rows"][0][0]["terrain"], "water")
        self.assertEqual(sea["rows"][0][0]["waterCoveragePercent"], 100)
        source.write_text('<osm><bounds minlat="0.5" maxlat="0.502" minlon="0.5" maxlon="0.502"/></osm>')
        land = rasterize(source, "Unmapped land", shoreline=Shoreline(self.path))
        self.assertEqual(land["rows"][0][0]["terrain"], "plain")
        self.assertEqual(land["oceanCoverage"]["sha256"], Shoreline(self.path).sha256)
        self.assertEqual(rasterize(source, "No mask")["oceanCoverage"], None)

    def test_damaged_binary_data_fails_explicitly(self):
        for data in [b"x", self.path.read_bytes()[:-1], struct.pack(">11i", *([0] * 11))]:
            self.path.write_bytes(data)
            with self.assertRaises(ValueError):
                Shoreline(self.path)
