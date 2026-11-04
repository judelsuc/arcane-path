import json
import math
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from prepare_regions import CONFIG, prepare_region, viewport_bounds


class PrepareRegionTests(unittest.TestCase):
    def test_covers_measured_osm_embed_viewports(self):
        references = (
            ([2.33, 48.85, 2.34, 48.86], [2.3178338, 48.8465284, 2.3521662, 48.8634706]),
            ([2.29, 44.53, 2.32, 44.56], [2.2706677, 44.5266475, 2.3393323, 44.5633505]),
        )
        for reference, measured in references:
            bounds = viewport_bounds(reference, 518, 360)
            self.assertLessEqual(bounds[0], measured[0])
            self.assertLessEqual(bounds[1], measured[1])
            self.assertGreaterEqual(bounds[2], measured[2])
            self.assertGreaterEqual(bounds[3], measured[3])

    def test_covers_reference_bounds_and_viewport_aspect_in_mercator(self):
        config = json.loads(CONFIG.read_text())
        for region in config["regions"].values():
            for width, height in ((518, 360), (900, 360), (358, 360)):
                with self.subTest(region=region["name"], width=width):
                    ref = region["referenceBounds"]
                    west, south, east, north = viewport_bounds(ref, width, height)
                    self.assertLessEqual(west, ref[0])
                    self.assertLessEqual(south, ref[1])
                    self.assertGreaterEqual(east, ref[2])
                    self.assertGreaterEqual(north, ref[3])
                    projected_height = (
                        math.asinh(math.tan(math.radians(north)))
                        - math.asinh(math.tan(math.radians(south)))
                    )
                    ratio = math.radians(east - west) / projected_height
                    self.assertAlmostEqual(ratio, width / height, places=4)
                    self.assertEqual([west, south, east, north], viewport_bounds(ref, width, height))

    def test_invalid_geometry_is_rejected(self):
        for bounds, width, height in (
            ([3, 44, 2, 45], 518, 360),
            ([2, 44, 3, 45], 0, 360),
            ([2, 44, 3, float("nan")], 518, 360),
        ):
            with self.assertRaises(ValueError):
                viewport_bounds(bounds, width, height)

    def test_one_command_wires_download_and_grid_cache_with_refresh_controls(self):
        region = {
            "name": "Test", "referenceBounds": [2.29, 44.53, 2.32, 44.56],
            "snapshot": "test.osm.gz", "map": "test.json",
        }
        viewport = {"width": 518, "height": 360}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch("prepare_regions.download_region", return_value=("url", 10, True)) as download:
                with patch("prepare_regions.build_cached", return_value=({"width": 4, "height": 4}, True)) as build:
                    prepare_region(region, viewport, refresh=True, force=True, root=root)
            download.assert_called_once_with(
                viewport_bounds(region["referenceBounds"], 518, 360), "Test", root / "test.osm.gz",
                refresh=True, reference_bounds=region["referenceBounds"],
            )
            build.assert_called_once_with(root / "test.osm.gz", root / "test.json", "Test",
                                          force=True, shoreline=None)


if __name__ == "__main__":
    unittest.main()
