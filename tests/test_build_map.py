import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from build_map import classify, rasterize  # noqa: E402


class BuildMapTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.source = Path(self.temp_dir.name) / "region.osm"

    def tearDown(self):
        self.temp_dir.cleanup()

    def write_osm(self, content):
        self.source.write_text(content, encoding="utf-8")

    def test_rasterizes_osm_features_and_respects_water_priority(self):
        self.write_osm(
            """<?xml version="1.0"?>
            <osm version="0.6">
              <bounds minlat="0" minlon="0" maxlat="0.009" maxlon="0.009"/>
              <node id="1" lat="0.0045" lon="0"/>
              <node id="2" lat="0.0045" lon="0.009"/>
              <node id="3" lat="0.003" lon="0.003"/>
              <node id="4" lat="0.003" lon="0.006"/>
              <node id="5" lat="0.006" lon="0.006"/>
              <node id="6" lat="0.006" lon="0.003"/>
              <node id="7" lat="0.003" lon="0.0005"/>
              <node id="8" lat="0.003" lon="0.002"/>
              <node id="9" lat="0.006" lon="0.002"/>
              <node id="10" lat="0.006" lon="0.0005"/>
              <way id="10"><nd ref="1"/><nd ref="2"/><tag k="railway" v="rail"/></way>
              <way id="11"><nd ref="3"/><nd ref="4"/><nd ref="5"/><nd ref="6"/><nd ref="3"/>
                <tag k="natural" v="water"/></way>
              <way id="12"><nd ref="7"/><nd ref="8"/><nd ref="9"/><nd ref="10"/><nd ref="7"/>
                <tag k="building" v="yes"/></way>
            </osm>"""
        )

        result = rasterize(self.source, "Test", cell_size_meters=250)
        terrains = [cell["terrain"] for row in result["rows"] for cell in row]

        self.assertGreater(result["width"], 1)
        self.assertGreater(result["height"], 1)
        self.assertIn("rail", terrains)
        self.assertNotIn("water", terrains)
        self.assertEqual(result["cellSizeMeters"], 250)
        self.assertEqual(result["rows"][2][2]["terrain"], "rail")
        self.assertGreater(result["rows"][2][2]["waterCoveragePercent"], 0)
        self.assertLess(result["rows"][2][2]["waterCoveragePercent"], 50)
        self.assertEqual(result["rows"][2][0]["terrain"], "rail")
        self.assertEqual(result["rows"][1][0]["terrain"], "building")
        self.assertIn("building", terrains)
        self.assertIn("building", {entry["terrain"] for entry in result["legend"]})
        detail = rasterize(self.source, "Test", cell_size_meters=50)
        self.assertIn("water", {cell["terrain"] for row in detail["rows"] for cell in row})
        self.assertIn("building", {cell["terrain"] for row in detail["rows"] for cell in row})
        self.assertIn("building", {entry["terrain"] for entry in detail["legend"]})
        self.assertTrue(all(len(row) == result["width"] for row in result["rows"]))

    def test_rejects_invalid_osm_input(self):
        self.write_osm("<not-osm/>")
        with self.assertRaisesRegex(ValueError, "racine <osm>"):
            rasterize(self.source, "Test")

    def test_transport_stations_are_not_all_railway_stations(self):
        self.assertEqual(classify({"aerialway": "station", "public_transport": "station"}, is_node=True), "cable_station")
        self.assertIsNone(classify({"amenity": "ferry_terminal", "public_transport": "station"}, is_node=True))
        self.assertIsNone(classify({"bus": "yes", "public_transport": "station"}, is_node=True))
        self.assertIsNone(classify({"public_transport": "station"}, is_node=True))
        self.assertEqual(classify({"train": "yes", "public_transport": "station"}, is_node=True), "station")
        self.assertEqual(classify({"railway": "station"}, is_node=True), "station")
        self.assertEqual(classify({"aerialway": "cable_car"}), "cable")

    def test_low_peaks_are_hills_without_guessing_missing_elevation(self):
        self.assertEqual(classify({"natural": "peak", "ele": "479"}, is_node=True), "hill")
        self.assertEqual(classify({"natural": "peak", "ele": "600"}, is_node=True), "mountain")
        self.assertEqual(classify({"natural": "peak"}, is_node=True), "mountain")
        self.assertEqual(classify({"natural": "hill"}, is_node=True), "hill")

    def test_classifies_railways_and_mountain_features(self):
        for railway in ("rail", "light_rail", "narrow_gauge", "tram", "subway"):
            with self.subTest(railway=railway):
                self.assertEqual(classify({"railway": railway}), "rail")
        for railway in ("abandoned", "disused", "razed", "construction"):
            with self.subTest(railway=railway):
                self.assertIsNone(classify({"railway": railway}))
        for natural in ("ridge", "arete", "bare_rock", "scree", "glacier"):
            with self.subTest(natural=natural):
                self.assertEqual(classify({"natural": natural}), "mountain")
        self.assertEqual(classify({"natural": "peak"}, is_node=True), "mountain")
        self.assertEqual(classify({"railway": "station"}, is_node=True), "station")

    def test_rasterizes_mountains_rails_and_station_with_priority(self):
        self.write_osm(
            """<osm version="0.6">
              <bounds minlat="0" minlon="0" maxlat="0.009" maxlon="0.009"/>
              <node id="1" lat="0.0005" lon="0.0005"/>
              <node id="2" lat="0.0085" lon="0.0005"/>
              <node id="3" lat="0.0085" lon="0.0085"/>
              <node id="4" lat="0.0005" lon="0.0085"/>
              <node id="5" lat="0.0045" lon="0.0005"/>
              <node id="6" lat="0.0045" lon="0.008">
                <tag k="railway" v="station"/></node>
              <node id="7" lat="0.0005" lon="0.0045"/>
              <node id="8" lat="0.0085" lon="0.0045"/>
              <way id="10"><nd ref="5"/><nd ref="6"/><tag k="railway" v="rail"/></way>
              <way id="11"><nd ref="7"/><nd ref="8"/><tag k="highway" v="residential"/></way>
              <way id="12"><nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="4"/><nd ref="1"/>
                <tag k="natural" v="bare_rock"/></way>
            </osm>"""
        )
        result = rasterize(self.source, "Test")
        self.assertEqual(result["rows"][0][0], {"terrain": "mountain", "glyph": "^"})
        self.assertEqual(result["rows"][2][2], {"terrain": "rail", "glyph": "="})
        self.assertEqual(result["rows"][2][3]["terrain"], "station")
        self.assertEqual(result["rows"][1][2]["terrain"], "mountain")
        legend = {entry["terrain"]: entry["glyph"] for entry in result["legend"]}
        self.assertEqual(legend["rail"], "=")
        self.assertEqual(legend["mountain"], "^")

    def test_closed_railway_is_not_filled_as_an_area(self):
        self.write_osm(
            """<osm version="0.6">
              <bounds minlat="0" minlon="0" maxlat="0.009" maxlon="0.009"/>
              <node id="1" lat="0.0005" lon="0.0005"/>
              <node id="2" lat="0.0085" lon="0.0005"/>
              <node id="3" lat="0.0085" lon="0.0085"/>
              <node id="4" lat="0.0005" lon="0.0085"/>
              <way id="10"><nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="4"/><nd ref="1"/>
                <tag k="railway" v="rail"/></way>
            </osm>"""
        )
        result = rasterize(self.source, "Test")
        self.assertEqual(result["rows"][2][2]["terrain"], "plain")
        self.assertEqual(result["rows"][0][0]["terrain"], "rail")

    def test_fields_are_distinct_from_grass_and_vineyards(self):
        self.assertEqual(classify({"landuse": "farmland"}), "field")
        self.assertEqual(classify({"landuse": "meadow"}), "grass")
        self.assertEqual(classify({"landuse": "vineyard"}), "vineyard")
        self.write_osm(
            """<osm version="0.6">
              <bounds minlat="0" minlon="0" maxlat="0.009" maxlon="0.009"/>
              <node id="1" lat="0.0005" lon="0.0005"/>
              <node id="2" lat="0.0085" lon="0.0005"/>
              <node id="3" lat="0.0085" lon="0.0085"/>
              <node id="4" lat="0.0005" lon="0.0085"/>
              <node id="5" lat="0.0045" lon="0.0005"/>
              <node id="6" lat="0.0045" lon="0.0085"/>
              <way id="10"><nd ref="5"/><nd ref="6"/><tag k="highway" v="track"/></way>
              <way id="11"><nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="4"/><nd ref="1"/>
                <tag k="landuse" v="farmland"/></way>
            </osm>"""
        )
        result = rasterize(self.source, "Test")
        self.assertEqual(result["rows"][1][1], {"terrain": "field", "glyph": ":"})
        self.assertEqual(result["rows"][2][1]["terrain"], "field")
        detail = rasterize(self.source, "Test", 50)
        self.assertIn("road", {cell["terrain"] for row in detail["rows"] for cell in row})
        self.assertNotIn("road", {entry["terrain"] for entry in result["legend"]})

    def test_sample_includes_rails_mountains_and_fields(self):
        source = Path(__file__).resolve().parents[1] / "data" / "region.osm"
        result = rasterize(source, "Demo")
        terrains = {cell["terrain"] for row in result["rows"] for cell in row}
        self.assertTrue({"rail", "mountain", "field"} <= terrains)

    def test_outside_features_are_clipped_instead_of_painted_on_borders(self):
        self.write_osm(
            """<osm version="0.6">
              <bounds minlat="0" minlon="0" maxlat="0.009" maxlon="0.009"/>
              <node id="1" lat="0.02" lon="-0.01"/>
              <node id="2" lat="0.02" lon="0.02"/>
              <node id="3" lat="0.0045" lon="-0.01"/>
              <node id="4" lat="0.0045" lon="0.02"/>
              <node id="5" lat="0.02" lon="0.0045"><tag k="natural" v="peak"/></node>
              <way id="1"><nd ref="1"/><nd ref="2"/><tag k="railway" v="rail"/></way>
              <way id="2"><nd ref="3"/><nd ref="4"/><tag k="highway" v="primary"/></way>
            </osm>"""
        )
        result = rasterize(self.source, "Test")
        self.assertTrue(all(cell["terrain"] == "plain" for cell in result["rows"][0]))
        self.assertTrue(all(cell["terrain"] == "major_road" for cell in result["rows"][2]))
        terrains = {cell["terrain"] for row in result["rows"] for cell in row}
        self.assertNotIn("rail", terrains)
        self.assertNotIn("mountain", terrains)

    def test_rejects_nonpositive_cell_size(self):
        self.write_osm("<osm><node id='1' lat='0' lon='0'/></osm>")
        with self.assertRaisesRegex(ValueError, "taille d'une case"):
            rasterize(self.source, "Test", cell_size_meters=0)

    def test_major_roads_remain_visible_over_water_but_settlements_remain_distinct(self):
        self.write_osm(
            """<osm version="0.6">
              <bounds minlat="0" minlon="0" maxlat="0.009" maxlon="0.009"/>
              <node id="1" lat="0.0045" lon="0"/>
              <node id="2" lat="0.0045" lon="0.009"/>
              <node id="3" lat="0.0045" lon="0.0045"><tag k="place" v="village"/></node>
              <way id="1"><nd ref="1"/><nd ref="2"/><tag k="waterway" v="stream"/></way>
              <way id="2"><nd ref="1"/><nd ref="2"/><tag k="highway" v="primary"/></way>
            </osm>"""
        )
        result = rasterize(self.source, "Test")
        self.assertEqual(result["rows"][2][0], {"terrain": "major_road", "glyph": "+", "waterways": ["stream"]})
        self.assertEqual(result["rows"][2][2]["terrain"], "place")
        for highway in ("motorway", "trunk", "primary", "secondary", "primary_link"):
            with self.subTest(highway=highway):
                self.assertEqual(classify({"highway": highway}), "major_road")


if __name__ == "__main__":
    unittest.main()
