import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from build_map import build_cached


class MapCacheTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.source = Path(self.directory.name) / "input.osm"
        self.output = Path(self.directory.name) / "map.json"
        self.source.write_text(
            '<osm><bounds minlat="0" minlon="0" maxlat="0.009" maxlon="0.009"/>'
            '<node id="1" lat="0.0045" lon="0.0045"><tag k="natural" v="peak"/></node></osm>'
        )

    def tearDown(self):
        self.directory.cleanup()

    def test_invalidates_when_source_resolution_name_or_schema_changes(self):
        previous, _ = build_cached(self.source, self.output, "Test")
        for name, size in (("Renamed", 250), ("Renamed", 100)):
            result, reused = build_cached(self.source, self.output, name, size)
            self.assertFalse(reused)
            self.assertNotEqual(previous["cache"]["key"], result["cache"]["key"])
            previous = result
        self.source.write_text(self.source.read_text().replace('v="peak"', 'v="water"'))
        result, reused = build_cached(self.source, self.output, "Renamed", 100)
        self.assertFalse(reused)
        self.assertNotEqual(previous["cache"]["sourceSha256"], result["cache"]["sourceSha256"])
        with patch("build_map.CACHE_SCHEMA_VERSION", 2):
            updated, reused = build_cached(self.source, self.output, "Renamed", 100)
        self.assertFalse(reused)
        self.assertNotEqual(result["cache"]["key"], updated["cache"]["key"])

    def test_reports_corrupt_cache_and_force_repairs_it(self):
        original, _ = build_cached(self.source, self.output, "Test")
        corrupt = json.loads(self.output.read_text())
        corrupt["rows"][0][0]["glyph"] = "?"
        self.output.write_text(json.dumps(corrupt))
        with self.assertRaisesRegex(ValueError, "Cache corrompu"):
            build_cached(self.source, self.output, "Test")
        repaired, reused = build_cached(self.source, self.output, "Test", force=True)
        self.assertFalse(reused)
        self.assertEqual(repaired, original)

    def test_force_bypasses_valid_cache(self):
        original, _ = build_cached(self.source, self.output, "Test")
        regenerated, reused = build_cached(self.source, self.output, "Test", force=True)
        self.assertFalse(reused)
        self.assertEqual(regenerated, original)

    def test_pipeline_code_change_invalidates_generated_grid(self):
        original, _ = build_cached(self.source, self.output, "Test")
        pipeline = Path(self.directory.name) / "pipeline.py"
        pipeline.write_text("changed pipeline")
        with patch("build_map.__file__", str(pipeline)):
            regenerated, reused = build_cached(self.source, self.output, "Test")
        self.assertFalse(reused)
        self.assertNotEqual(original["cache"]["pipelineSha256"], regenerated["cache"]["pipelineSha256"])
        self.assertNotEqual(original["cache"]["key"], regenerated["cache"]["key"])


if __name__ == "__main__":
    unittest.main()
