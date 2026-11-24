import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from build_map import rasterize
from mapped_sites import SITE_KINDS, site_kind, enrich_sites
from fetch_osm import incomplete_landcover
import xml.etree.ElementTree as ET


class MappedSiteTests(unittest.TestCase):
    def test_all_twelve_categories_and_aliases_are_exact_tags_not_names_or_generic_attractions(self):
        examples = {"stadium": {"leisure": "stadium"}, "mall": {"shop": "mall"},
                    "cemetery": {"landuse": "cemetery"}, "airport": {"aeroway": "aerodrome"},
                    "hospital": {"amenity": "hospital"}, "university": {"amenity": "university"},
                    "industrial": {"landuse": "industrial"}, "harbour": {"leisure": "marina"},
                    "garden": {"leisure": "garden"}, "attraction": {"tourism": "zoo"},
                    "castle": {"historic": "castle"}, "exhibition": {"amenity": "exhibition_centre"}}
        self.assertEqual(set(examples), set(SITE_KINDS))
        for kind, tags in examples.items():
            with self.subTest(kind=kind):
                self.assertEqual(site_kind(tags), kind)
                self.assertIsNone(site_kind({**tags, "abandoned": "yes"}))
                self.assertIsNone(site_kind({**tags, "disused": "yes"}))
        for tags in ({"name": "Stadium Mall Airport"}, {"tourism": "attraction"},
                     {"shop": "supermarket"}, {"aeroway": "runway"}, {"amenity": "clinic"}):
            self.assertIsNone(site_kind(tags))
        self.assertEqual(site_kind({"industrial": "port"}), "harbour")
        self.assertEqual(site_kind({"tourism": "theme_park"}), "attraction")
        self.assertEqual(site_kind({"amenity": "conference_centre"}), "exhibition")

    def raster(self, source):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sites.osm"
            path.write_text(source)
            return rasterize(path, "Synthetic site fixture", cell_size_meters=250)

    def test_node_and_small_polygon_sites_preserve_terrain_pois_provenance_and_access(self):
        body = """<osm><bounds minlat="0" minlon="0" maxlat="0.009" maxlon="0.009"/>
          <node id="1" lat="0.0045" lon="0.0045"><tag k="leisure" v="stadium"/>
            <tag k="name" v="Synthetic stadium"/><tag k="access" v="private"/></node>
          <node id="2" lat="0.001" lon="0.001"/><node id="3" lat="0.001" lon="0.0011"/>
          <node id="4" lat="0.0011" lon="0.0011"/><node id="5" lat="0.0011" lon="0.001"/>
          <way id="9"><nd ref="2"/><nd ref="3"/><nd ref="4"/><nd ref="5"/><nd ref="2"/>
            <tag k="landuse" v="cemetery"/><tag k="name" v="Small cemetery"/></way></osm>"""
        output = self.raster(body)
        sites = [site for row in output["rows"] for cell in row for site in cell.get("sites", [])]
        self.assertEqual({site["osmId"] for site in sites}, {"node/1", "way/9"})
        stadium = next(site for site in sites if site["kind"] == "stadium")
        self.assertEqual(stadium["access"], "private")
        self.assertEqual(stadium["name"], "Synthetic stadium")
        self.assertTrue(all(cell["terrain"] == "plain" for row in output["rows"] for cell in row))
        self.assertTrue(all(not cell.get("pois") for row in output["rows"] for cell in row))
        baseline = self.raster(body.replace('<tag k="leisure" v="stadium"/>', "")
                               .replace('<tag k="landuse" v="cemetery"/>', ""))
        for grid in (output, baseline):
            for row in grid["rows"]:
                for cell in row:
                    cell.pop("sites", None)
        self.assertEqual(output, baseline)

    def test_multipolygon_fills_real_boundary_without_holes_or_outside_cells(self):
        body = """<osm><bounds minlat="0" minlon="0" maxlat="0.009" maxlon="0.009"/>
          <node id="1" lat="0" lon="0"/><node id="2" lat="0" lon="0.009"/>
          <node id="3" lat="0.009" lon="0.009"/><node id="4" lat="0.009" lon="0"/>
          <node id="5" lat="0.002" lon="0.002"/><node id="6" lat="0.002" lon="0.007"/>
          <node id="7" lat="0.007" lon="0.007"/><node id="8" lat="0.007" lon="0.002"/>
          <way id="1"><nd ref="1"/><nd ref="2"/><nd ref="3"/></way>
          <way id="2"><nd ref="3"/><nd ref="4"/><nd ref="1"/></way>
          <way id="3"><nd ref="5"/><nd ref="6"/><nd ref="7"/><nd ref="8"/><nd ref="5"/></way>
          <relation id="42"><member type="way" ref="1" role="outer"/>
            <member type="way" ref="2" role="outer"/><member type="way" ref="3" role="inner"/>
            <tag k="type" v="multipolygon"/><tag k="leisure" v="stadium"/></relation></osm>"""
        output = self.raster(body)
        self.assertFalse(output["rows"][2][2].get("sites"))
        self.assertEqual(output["rows"][0][0]["sites"], [{"osmId": "relation/42", "kind": "stadium"}])
        self.assertTrue(all(cell["terrain"] == "plain" for row in output["rows"] for cell in row))

    def test_invalid_partial_or_out_of_bounds_site_does_not_create_edge_phantoms(self):
        body = """<osm><bounds minlat="0" minlon="0" maxlat="0.009" maxlon="0.009"/>
          <node id="1" lat="1" lon="1"><tag k="shop" v="mall"/></node>
          <node id="2" lat="0.002" lon="0.002"/>
          <way id="1"><nd ref="2"/><nd ref="missing"/><tag k="leisure" v="stadium"/></way>
          <relation id="3"><member type="way" ref="absent" role="outer"/>
            <tag k="type" v="multipolygon"/><tag k="shop" v="mall"/></relation></osm>"""
        output = self.raster(body)
        self.assertTrue(all(not cell.get("sites") for row in output["rows"] for cell in row))
        root = ET.fromstring(body)
        self.assertEqual(incomplete_landcover(root), ["3"])

    def test_existing_grid_is_additively_enriched_from_cached_source_without_rasterizing_or_changing_gameplay(self):
        import copy
        from unittest.mock import patch
        body = """<osm><bounds minlat="0" minlon="0" maxlat="0.009" maxlon="0.009"/>
          <node id="1" lat="0.0045" lon="0.0045"><tag k="leisure" v="stadium"/></node></osm>"""
        output = self.raster(body)
        expected = copy.deepcopy(output)
        output.pop("sitesVersion")
        for row in output["rows"]:
            for cell in row:
                cell.pop("sites", None)
        original = copy.deepcopy(output)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "cached.osm"
            path.write_text(body)
            with patch("build_map.rasterize", side_effect=AssertionError("Terrain must stay unchanged")):
                enriched = enrich_sites(output, path)
                self.assertEqual(enriched, expected)
                self.assertEqual(enrich_sites(enriched, path), enriched)
        self.assertEqual(output, original)


if __name__ == "__main__":
    unittest.main()
