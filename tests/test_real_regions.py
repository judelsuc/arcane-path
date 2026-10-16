import gzip
import json
import math
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from build_map import TERRAINS, build_cached, project, rasterize
from fetch_osm import download_region
from prepare_regions import viewport_bounds

ROOT = Path(__file__).resolve().parents[1]
CONFIG = json.loads((ROOT / "data" / "regions.json").read_text())
REGIONS = {
    "paris": {
        "name": "Paris",
        "size": (14, 10),
        "minimums": {"major_road": 3, "station": 1},
    },
    "alps": {
        "name": "Alpes — Chamonix",
        "size": (28, 20),
        "minimums": {"mountain": 5, "grass": 10, "cable": 3, "cable_station": 1},
    },
    "firmi": {
        "name": "Firmi",
        "size": (29, 20),
        "minimums": {"forest": 15, "grass": 15, "place": 1, "major_road": 8},
    },
}
for region_id, expected in REGIONS.items():
    expected["reference_bbox"] = CONFIG["regions"][region_id]["referenceBounds"]
    expected["bbox"] = viewport_bounds(
        expected["reference_bbox"], CONFIG["viewport"]["width"], CONFIG["viewport"]["height"]
    )


class RealRegionTests(unittest.TestCase):
    def test_tahiti_snapshot_and_cached_grid_are_real_and_in_southern_hemisphere(self):
        region = CONFIG["regions"]["tahiti"]
        data = json.loads((ROOT / region["map"]).read_text())
        self.assertFalse(data["illustrative"])
        self.assertEqual((data["width"], data["height"]), (38, 27))
        self.assertLess(data["bounds"]["maxLatitude"], 0)
        self.assertLess(data["bounds"]["maxLongitude"], 0)
        self.assertTrue((ROOT / region["snapshot"]).exists())
        self.assertTrue(any(cell["terrain"] == "major_road" for row in data["rows"] for cell in row))
        with patch("fetch_osm.urllib.request.urlopen", side_effect=AssertionError("Cache only")):
            _, _, reused = download_region(
                viewport_bounds(region["referenceBounds"], CONFIG["viewport"]["width"], CONFIG["viewport"]["height"]),
                region["name"], ROOT / region["snapshot"], reference_bounds=region["referenceBounds"],
            )
        self.assertTrue(reused)

    def test_puy_de_wolf_is_a_named_hill_in_expanded_firmi_map(self):
        result = rasterize(ROOT / "data" / "regions" / "firmi.osm.gz", "Firmi")
        self.assertEqual(result["name"], "Firmi")
        hills = [
            cell for row in result["rows"] for cell in row
            if "Puy de Wolf" in cell.get("names", [])
        ]
        self.assertEqual(len(hills), 1)
        self.assertEqual(hills[0]["terrain"], "hill")
        self.assertEqual(hills[0]["glyph"], "n")

    def test_firmi_settlement_name_is_preserved(self):
        result = rasterize(ROOT / "data" / "regions" / "firmi.osm.gz", "Firmi")
        named_places = [
            cell for row in result["rows"] for cell in row
            if cell["terrain"] == "place" and "Firmi" in cell.get("names", [])
        ]
        self.assertEqual(len(named_places), 1)

    def test_alpine_cable_station_is_connected_and_not_a_railway(self):
        result = rasterize(ROOT / "data" / "regions" / "alps.osm.gz", "Alps")
        terrains = Counter(cell["terrain"] for row in result["rows"] for cell in row)
        self.assertGreater(terrains["cable_station"], 0)
        aerial_station_cells = [
            cell for row in result["rows"] for cell in row
            if any(poi["osmId"] == "node/31000524" for poi in cell.get("pois", []))
        ]
        self.assertEqual(len(aerial_station_cells), 1)
        self.assertEqual(aerial_station_cells[0]["terrain"], "cable_station")
        for row_index, row in enumerate(result["rows"]):
            for col_index, cell in enumerate(row):
                if any(poi["osmId"] == "node/31000524" for poi in cell.get("pois", [])):
                    neighbours = [
                        result["rows"][y][x]["terrain"]
                        for y in range(max(0, row_index - 1), min(result["height"], row_index + 2))
                        for x in range(max(0, col_index - 1), min(result["width"], col_index + 2))
                    ]
                    self.assertIn("cable", neighbours)

    def test_firmi_d840_nodes_are_visible_on_travel_map(self):
        source = ROOT / "data" / "regions" / "firmi.osm.gz"
        result = rasterize(source, "Firmi")
        with gzip.open(source, "rb") as stream:
            root = ET.parse(stream).getroot()
        refs = set()
        for way in root.findall("way"):
            tags = {tag.attrib["k"]: tag.attrib["v"] for tag in way.findall("tag")}
            if tags.get("ref") == "D 840":
                self.assertEqual(tags["highway"], "primary")
                refs.update(node.attrib["ref"] for node in way.findall("nd"))
        bounds = result["bounds"]
        latitude = (bounds["minLatitude"] + bounds["maxLatitude"]) / 2
        min_x, max_y = project(bounds["minLongitude"], bounds["maxLatitude"], latitude)
        checked_cells = set()
        for node in root.findall("node"):
            if node.attrib["id"] not in refs:
                continue
            lon, lat = float(node.attrib["lon"]), float(node.attrib["lat"])
            if not (bounds["minLongitude"] <= lon <= bounds["maxLongitude"]
                    and bounds["minLatitude"] <= lat <= bounds["maxLatitude"]):
                continue
            x, y = project(lon, lat, latitude)
            col = min(result["width"] - 1, math.floor((x - min_x) / 250))
            row = min(result["height"] - 1, math.floor((max_y - y) / 250))
            self.assertIn(result["rows"][row][col]["terrain"], {"major_road", "place", "rail", "station"})
            checked_cells.add((col, row))
        self.assertGreaterEqual(len(checked_cells), 10)

    def test_real_region_snapshots_at_travel_and_detail_scales(self):
        for region, expected in REGIONS.items():
            source = ROOT / "data" / "regions" / f"{region}.osm.gz"
            for cell_size in (250, 50):
                with self.subTest(region=region, cell_size=cell_size):
                    result = rasterize(source, expected["name"], cell_size)
                    self.assertFalse(result["illustrative"])
                    self.assertEqual(result["copyright"], "OpenStreetMap and contributors")
                    self.assertIn("opendatacommons.org/licenses/odbl", result["license"])
                    self.assertTrue(result["sourceUrl"].startswith("https://api.openstreetmap.org/api/0.6/map?bbox="))
                    self.assertTrue(result["downloadedAt"])
                    for cell in (cell for row in result["rows"] for cell in row):
                        if cell["terrain"] == "water":
                            self.assertGreaterEqual(cell["waterCoveragePercent"], 50)
                    bounds = result["bounds"]
                    self.assertEqual(
                        [bounds["minLongitude"], bounds["minLatitude"],
                         bounds["maxLongitude"], bounds["maxLatitude"]],
                        expected["bbox"],
                    )
                    if cell_size == 250:
                        self.assertEqual((result["width"], result["height"]), expected["size"])
                        counts = Counter(cell["terrain"] for row in result["rows"] for cell in row)
                        for terrain, minimum in expected["minimums"].items():
                            self.assertGreaterEqual(counts[terrain], minimum, terrain)
                        self.assertEqual(counts["building"], 0)
                        self.assertEqual(counts["road"], 0)
                        self.assertNotIn("building", {entry["terrain"] for entry in result["legend"]})
                        self.assertNotIn("road", {entry["terrain"] for entry in result["legend"]})
                        if region == "firmi":
                            self.assertLess(counts["water"] / (result["width"] * result["height"]), 0.1)
                            self.assertTrue(any(cell.get("waterways") for row in result["rows"] for cell in row))
                            green = sum(counts[terrain] for terrain in ("grass", "forest", "field", "park"))
                            self.assertGreaterEqual(green / (result["width"] * result["height"]), 0.35)
                            self.assertGreater(green, counts["major_road"])
                    else:
                        counts = Counter(cell["terrain"] for row in result["rows"] for cell in row)
                        self.assertGreater(counts["water"], 0)
                        self.assertGreater(counts["building"], 0)
                        if region == "paris":
                            self.assertGreater(counts["rail"], 0)
                    self.assertEqual(len(result["rows"]), result["height"])
                    for row in result["rows"]:
                        self.assertEqual(len(row), result["width"])
                        for cell in row:
                            self.assertEqual(cell["glyph"], TERRAINS[cell["terrain"]]["glyph"])
                    self.assertEqual(result, rasterize(source, expected["name"], cell_size))

    def test_each_real_snapshot_and_generated_grid_can_be_reused_offline(self):
        for region, expected in REGIONS.items():
            with self.subTest(region=region), tempfile.TemporaryDirectory() as directory:
                source = ROOT / "data" / "regions" / f"{region}.osm.gz"
                with patch("fetch_osm.urllib.request.urlopen", side_effect=AssertionError("Network should not be used")):
                    _, _, reused = download_region(
                        expected["bbox"], expected["name"], source,
                        reference_bounds=expected.get("reference_bbox"),
                    )
                    self.assertTrue(reused)
                output = Path(directory) / f"{region}.json"
                first, reused = build_cached(source, output, expected["name"])
                self.assertFalse(reused)
                mtime = output.stat().st_mtime_ns
                with patch("build_map.rasterize", side_effect=AssertionError("Map should not be regenerated")):
                    second, reused = build_cached(source, output, expected["name"])
                self.assertTrue(reused)
                self.assertEqual(first, second)
                self.assertEqual(output.stat().st_mtime_ns, mtime)
                self.assertEqual(json.loads(output.read_text()), first)


if __name__ == "__main__":
    unittest.main()
