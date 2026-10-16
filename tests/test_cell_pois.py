import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from build_map import rasterize


class CellPoiTests(unittest.TestCase):
    def test_content_tags_survive_without_a_poi_category(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "content.osm"
            source.write_text("""<osm version="0.6">
              <bounds minlat="0" minlon="0" maxlat="0.009" maxlon="0.009"/>
              <node id="1" lat="0.0045" lon="0.0045">
                <tag k="description:fr" v="Un lieu"/>
                <tag k="wikimedia_commons" v="File:Lieu.jpg"/>
                <tag k="wikipedia" v="fr:Lieu"/>
              </node></osm>""", encoding="utf-8")
            result = rasterize(source, "Region")
        sources = [source for row in result["rows"] for cell in row
                   for source in cell.get("contentSources", [])]
        self.assertEqual(len(sources), 1)
        self.assertEqual(sources[0]["osmId"], "node/1")
        self.assertEqual(sources[0]["tags"]["description:fr"], "Un lieu")
        self.assertEqual(sources[0]["tags"]["wikimedia_commons"], "File:Lieu.jpg")

    def test_hidden_building_pois_and_nodes_survive_without_changing_terrain(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "pois.osm"
            source.write_text(
                """<osm version="0.6">
                <bounds minlat="0" minlon="0" maxlat="0.009" maxlon="0.009"/>
                <node id="1" lat="0.0045" lon="0.0045">
                  <tag k="name" v="Town"/><tag k="place" v="village"/></node>
                <node id="2" lat="0.004" lon="0.0045">
                  <tag k="name" v="Bakery"/><tag k="shop" v="bakery"/></node>
                <node id="3" lat="0.005" lon="0.004"/>
                <node id="4" lat="0.005" lon="0.005"/>
                <node id="5" lat="0.004" lon="0.005"/>
                <node id="6" lat="0.02" lon="0.02">
                  <tag k="name" v="Outside"/><tag k="tourism" v="viewpoint"/></node>
                <way id="10">
                  <nd ref="2"/><nd ref="3"/><nd ref="4"/><nd ref="5"/><nd ref="2"/>
                  <tag k="building" v="yes"/><tag k="amenity" v="restaurant"/>
                  <tag k="name" v="Cafe"/></way>
                </osm>""", encoding="utf-8",
            )
            result = rasterize(source, "Region")
        self.assertEqual(result["name"], "Region")
        cell = result["rows"][2][2]
        self.assertEqual(cell["terrain"], "place")
        self.assertEqual(cell["names"], ["Town"])
        self.assertEqual(cell["pois"], [
            {"osmId": "node/2", "category": "shop", "name": "Bakery"},
            {"osmId": "way/10", "category": "amenity", "name": "Cafe"},
        ])
        all_pois = [poi for row in result["rows"] for cell in row for poi in cell.get("pois", [])]
        self.assertNotIn("Outside", [poi.get("name") for poi in all_pois])


if __name__ == "__main__":
    unittest.main()
