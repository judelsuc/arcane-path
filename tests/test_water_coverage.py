import math
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from build_map import rasterize, build_cached
from config import load_config


class WaterCoverageTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.source = Path(self.directory.name) / "map.osm"

    def tearDown(self):
        self.directory.cleanup()

    def write(self, polygons=(), line_width=None, stream=False, hole=False):
        scale = 180 / (math.pi * 6_371_008.8)
        parts = [f'<osm projection_latitude="0"><bounds minlon="0" minlat="0" '
                 f'maxlon="{100 * scale}" maxlat="{100 * scale}"/>']
        node_id = 0
        for index, (left, bottom, right, top) in enumerate(polygons):
            ids = []
            for x, y in [(left, bottom), (right, bottom), (right, top), (left, top)]:
                node_id += 1
                ids.append(str(node_id))
                parts.append(f'<node id="{node_id}" lon="{x * scale}" lat="{y * scale}"/>')
            parts.append(f'<way id="{index}">' + "".join(f'<nd ref="{i}"/>' for i in ids + ids[:1]) +
                         '<tag k="natural" v="water"/></way>')
        if stream:
            parts += [f'<node id="100" lon="0" lat="{50 * scale}"/>',
                      f'<node id="101" lon="{100 * scale}" lat="{50 * scale}"/>',
                      '<way id="100"><nd ref="100"/><nd ref="101"/><tag k="waterway" v="stream"/>' +
                      (f'<tag k="width" v="{line_width}"/>' if line_width is not None else "") + '</way>']
        if hole:
            parts.append('<relation id="1"><member type="way" ref="0" role="outer"/>'
                         '<member type="way" ref="1" role="inner"/>'
                         '<tag k="type" v="multipolygon"/><tag k="natural" v="water"/></relation>')
        parts.append("</osm>")
        self.source.write_text("".join(parts))

    def cell(self, threshold=50):
        with patch("build_map.load_config", return_value={"map": {"water_coverage_percent": threshold}}):
            return rasterize(self.source, "Test", 100)["rows"][0][0]

    def test_threshold_below_at_and_above_half_cell(self):
        for width, expected in [(45, "plain"), (50, "water"), (55, "water")]:
            with self.subTest(width=width):
                self.write([(0, 0, width, 100)])
                self.assertEqual(self.cell()["terrain"], expected)
                self.assertAlmostEqual(self.cell()["waterCoveragePercent"], width)
        self.assertEqual(self.cell(threshold=60)["terrain"], "plain")

    def test_union_counts_disjoint_water_but_not_overlapping_duplicates_twice(self):
        self.write([(0, 0, 30, 100), (0, 0, 30, 100)])
        self.assertEqual(self.cell()["terrain"], "plain")
        self.assertEqual(self.cell()["waterCoveragePercent"], 30)
        self.write([(0, 0, 30, 100), (70, 0, 100, 100)])
        self.assertEqual(self.cell()["terrain"], "water")
        self.assertEqual(self.cell()["waterCoveragePercent"], 60)

    def test_multipolygon_hole_remains_dry_even_with_tagged_member_ways(self):
        self.write([(0, 0, 100, 100), (10, 10, 90, 90)], hole=True)
        self.assertEqual(self.cell()["terrain"], "plain")
        self.assertEqual(self.cell()["waterCoveragePercent"], 36)

    def test_stream_unknown_or_small_width_is_secondary_and_large_width_counts(self):
        for width, terrain in [(None, "plain"), (10, "plain"), (60, "water")]:
            with self.subTest(width=width):
                self.write(stream=True, line_width=width)
                cell = self.cell()
                self.assertEqual(cell["terrain"], terrain)
                self.assertEqual(cell["waterways"], ["stream"])

    def test_configuration_changes_invalidate_static_cache(self):
        self.write([(0, 0, 55, 100)])
        output = Path(self.directory.name) / "map.json"
        with patch("build_map.load_config", return_value={"map": {"water_coverage_percent": 50}}):
            first, reused = build_cached(self.source, output, "Test", 100)
            self.assertFalse(reused)
        with patch("build_map.load_config", return_value={"map": {"water_coverage_percent": 60}}):
            second, reused = build_cached(self.source, output, "Test", 100)
            self.assertFalse(reused)
        self.assertNotEqual(first["cache"]["key"], second["cache"]["key"])
        self.assertEqual(second["rows"][0][0]["terrain"], "plain")

    def test_yaml_configuration_is_validated(self):
        config = Path(self.directory.name) / "config.yml"
        for value in ["0", "101", "true", ".nan", "wrong"]:
            config.write_text(f"map:\n  water_coverage_percent: {value}\n")
            with self.subTest(value=value), self.assertRaises(ValueError):
                load_config(config)
        config.write_text("map:\n  water_coverage_percent: 65\n")
        self.assertEqual(load_config(config)["map"]["water_coverage_percent"], 65)

    def test_photo_count_configuration_accepts_one_to_twenty_only(self):
        config = Path(self.directory.name) / "config.yml"
        for value in ["0", "21", "true", "1.5", "wrong"]:
            config.write_text(f"map:\n  water_coverage_percent: 50\nphotos:\n  max_per_cell: {value}\n")
            with self.subTest(value=value), self.assertRaises(ValueError):
                load_config(config)
        config.write_text("map:\n  water_coverage_percent: 50\nphotos:\n  max_per_cell: 12\n")
        self.assertEqual(load_config(config)["photos"]["max_per_cell"], 12)

    def test_country_is_extracted_from_osm_not_region_name(self):
        self.write([(0, 0, 100, 100)])
        xml = self.source.read_text().replace(
            '</osm>', '<node id="999" lat="0.0001" lon="0.0001">'
            '<tag k="addr:country" v="PF"/></node></osm>')
        self.source.write_text(xml)
        self.assertEqual(self.cell()["countryCodes"], ["PF"])
        self.write([(0, 0, 100, 100)])
        self.assertNotIn("countryCodes", self.cell())
