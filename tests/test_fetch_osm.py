import gzip
import io
import sys
import tempfile
import unittest
import urllib.error
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from fetch_osm import _request_map, download_region

OSM_RESPONSE = b"""<osm version="0.6" copyright="OpenStreetMap and contributors">
  <bounds minlat="0" minlon="0" maxlat="0.009" maxlon="0.009"/>
  <node id="1" lat="0.0045" lon="0.0045" user="unused" uid="123" version="1">
    <tag k="natural" v="peak"/>
  </node>
</osm>"""


class FetchOsmTests(unittest.TestCase):
    def test_splits_node_limited_requests_and_deduplicates_osm_ids(self):
        error = urllib.error.HTTPError(
            "https://api.openstreetmap.org", 400, "Bad Request", {},
            io.BytesIO(b"You requested too many nodes (limit is 50000)."),
        )
        with patch("fetch_osm.urllib.request.urlopen", side_effect=[
            error, io.BytesIO(OSM_RESPONSE), io.BytesIO(OSM_RESPONSE),
        ]) as request:
            root, urls = _request_map([0, 0, 0.009, 0.009])
        self.assertEqual(request.call_count, 3)
        self.assertEqual(len(root.findall("node")), 1)
        self.assertEqual(len(urls), 2)
        self.assertEqual(root.find("bounds").attrib["maxlon"], "0.009")

    def test_reports_other_http_errors_without_splitting(self):
        error = urllib.error.HTTPError(
            "https://api.openstreetmap.org", 400, "Bad Request", {},
            io.BytesIO(b"Invalid query"),
        )
        with patch("fetch_osm.urllib.request.urlopen", side_effect=error) as request:
            with self.assertRaisesRegex(ValueError, "Invalid query"):
                _request_map([0, 0, 0.009, 0.009])
            request.assert_called_once()

    def test_refresh_replaces_cached_snapshot_and_preserves_osm_geometry(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "test.osm.gz"
            bounds = [0, 0, 0.009, 0.009]
            with patch("fetch_osm.urllib.request.urlopen", return_value=io.BytesIO(OSM_RESPONSE)) as request:
                url, _, reused = download_region(bounds, "Test", output)
                self.assertFalse(reused)
                request.assert_called_once()
            with gzip.open(output, "rb") as stream:
                root = ET.parse(stream).getroot()
            self.assertEqual(root.attrib["source_url"], url)
            self.assertEqual(root.find("node").attrib, {"id": "1", "lat": "0.0045", "lon": "0.0045"})
            self.assertEqual(root.find("node/tag").attrib, {"k": "natural", "v": "peak"})
            with patch("fetch_osm.urllib.request.urlopen", return_value=io.BytesIO(OSM_RESPONSE)) as request:
                _, _, reused = download_region(bounds, "Test", output, refresh=True)
                self.assertFalse(reused)
                request.assert_called_once()

    def test_invalid_bounds_do_not_make_a_network_request(self):
        with patch("fetch_osm.urllib.request.urlopen") as request:
            for bounds in ([1, 0, 0, 1], [0, 0, 1, 1], [0, 0, float("nan"), 1]):
                with self.subTest(bounds=bounds), self.assertRaises(ValueError):
                    download_region(bounds, "Test", Path("unused.osm"))
            request.assert_not_called()

    def test_failed_download_preserves_existing_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "test.osm"
            output.write_bytes(OSM_RESPONSE)
            with patch("fetch_osm.urllib.request.urlopen", side_effect=OSError("Unavailable")):
                with self.assertRaisesRegex(OSError, "Unavailable"):
                    download_region([0, 0, 0.009, 0.009], "Test", output, refresh=True)
            self.assertEqual(output.read_bytes(), OSM_RESPONSE)


if __name__ == "__main__":
    unittest.main()
