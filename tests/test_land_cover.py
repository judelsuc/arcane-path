import contextlib
import io
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from build_map import rasterize


class LandCoverTests(unittest.TestCase):
    def render(self, members, extra_ways=""):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "cover.osm"
            source.write_text(
                f"""<osm version="0.6">
                  <bounds minlat="0" minlon="0" maxlat="0.009" maxlon="0.009"/>
                  <node id="1" lat="0" lon="0"/>
                  <node id="2" lat="0.009" lon="0"/>
                  <node id="3" lat="0.009" lon="0.009"/>
                  <node id="4" lat="0" lon="0.009"/>
                  <node id="5" lat="0.003" lon="0.003"/>
                  <node id="6" lat="0.006" lon="0.003"/>
                  <node id="7" lat="0.006" lon="0.006"/>
                  <node id="8" lat="0.003" lon="0.006"/>
                  <way id="1"><nd ref="1"/><nd ref="2"/><nd ref="3"/></way>
                  <way id="2"><nd ref="1"/><nd ref="4"/><nd ref="3"/></way>
                  <way id="3"><nd ref="5"/><nd ref="6"/><nd ref="7"/><nd ref="8"/><nd ref="5"/></way>
                  {extra_ways}
                  <relation id="100">
                    {members}
                    <tag k="type" v="multipolygon"/><tag k="landuse" v="forest"/>
                  </relation>
                </osm>""",
                encoding="utf-8",
            )
            return rasterize(source, "Land cover")

    def test_joins_reversed_outer_ways_and_preserves_inner_hole(self):
        result = self.render(
            '<member type="way" ref="1" role="outer"/>'
            '<member type="way" ref="2" role="outer"/>'
            '<member type="way" ref="3" role="inner"/>'
        )
        self.assertEqual(result["rows"][0][0]["terrain"], "forest")
        self.assertEqual(result["rows"][2][2]["terrain"], "plain")

    def test_incomplete_relation_is_reported_and_not_invented(self):
        for members in (
            '<member type="way" ref="1" role="outer"/>',
            '<member type="way" ref="999" role="outer"/>',
            '<member type="way" ref="1" role="outer"/>'
            '<member type="way" ref="2" role="outer"/>'
            '<member type="way" ref="999" role="inner"/>',
        ):
            with self.subTest(members=members):
                errors = io.StringIO()
                with contextlib.redirect_stderr(errors):
                    result = self.render(members)
                self.assertIn("relation OSM 100 ignoree", errors.getvalue())
                self.assertTrue(all(cell["terrain"] == "plain" for row in result["rows"] for cell in row))

    def test_small_roads_leave_forest_visible_but_main_roads_remain(self):
        members = (
            '<member type="way" ref="1" role="outer"/>'
            '<member type="way" ref="2" role="outer"/>'
        )
        for highway, expected in (("residential", "forest"), ("primary", "major_road")):
            with self.subTest(highway=highway):
                result = self.render(
                    members,
                    f'<way id="10"><nd ref="1"/><nd ref="3"/><tag k="highway" v="{highway}"/></way>',
                )
                self.assertEqual(result["rows"][2][2]["terrain"], expected)


if __name__ == "__main__":
    unittest.main()
