import gzip
import io
import sys
import tempfile
import unittest
import urllib.error
import urllib.parse
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from fetch_osm import (_request_map, _request_overpass, _request_sources, _COOLDOWNS, OVERPASS_URLS,
                       _SOURCE_CURSORS, download_region, incomplete_landcover, fetch_towns)

OSM_RESPONSE = b"""<osm version="0.6" copyright="OpenStreetMap and contributors">
  <bounds minlat="0" minlon="0" maxlat="0.009" maxlon="0.009"/>
  <node id="1" lat="0.0045" lon="0.0045" user="unused" uid="123" version="1">
    <tag k="natural" v="peak"/>
  </node>
</osm>"""


class FetchOsmTests(unittest.TestCase):
    def test_overpass_recurses_only_multipolygons_not_long_transport_or_admin_relations(self):
        with patch("fetch_osm.urllib.request.urlopen", return_value=io.BytesIO(OSM_RESPONSE)) as fetch:
            root, _ = _request_overpass([2.34, 48.88, 2.36, 48.90], OVERPASS_URLS[0])
        query = urllib.parse.parse_qs(fetch.call_args.args[0].data.decode())["data"][0]
        self.assertIn("node(48.88,2.34,48.9,2.36)", query)
        self.assertIn("way(48.88,2.34,48.9,2.36)", query)
        self.assertIn("rel(48.88,2.34,48.9,2.36)[type=multipolygon]", query)
        self.assertIn("(._;>>;)", query)
        self.assertNotIn("nwr(", query)
        self.assertEqual(root.find("bounds").attrib["minlon"], "2.34")

    def test_primary_completes_landcover_members_before_caching(self):
        partial = OSM_RESPONSE.replace(b"</osm>", b"""
          <relation id="12"><member type="way" ref="20" role="outer"/>
            <tag k="type" v="multipolygon"/><tag k="landuse" v="meadow"/>
          </relation></osm>""")
        complete = b"""<osm><node id="2" lat="0.001" lon="0.001"/>
          <node id="3" lat="0.001" lon="0.008"/>
          <node id="4" lat="0.008" lon="0.008"/>
          <node id="5" lat="0.008" lon="0.001"/>
          <way id="20"><nd ref="2"/><nd ref="3"/><nd ref="4"/><nd ref="5"/><nd ref="2"/></way>
          <relation id="12"><member type="way" ref="20" role="outer"/>
            <tag k="type" v="multipolygon"/><tag k="landuse" v="meadow"/>
          </relation></osm>"""
        with patch("fetch_osm.urllib.request.urlopen", side_effect=[
                io.BytesIO(partial), io.BytesIO(complete)]) as request:
            root, urls = _request_map([0, 0, 0.009, 0.009])
        self.assertEqual(request.call_count, 2)
        self.assertEqual(urls[-1], "https://api.openstreetmap.org/api/0.6/relation/12/full")
        self.assertEqual(incomplete_landcover(root), [])
        self.assertIsNotNone(root.find("node[@id='1']"))
        with tempfile.TemporaryDirectory() as directory:
            from build_map import rasterize
            path = Path(directory) / "complete.osm"
            path.write_bytes(ET.tostring(root))
            data = rasterize(path, "Complete meadow", 250)
            self.assertEqual(data["rows"][2][2]["terrain"], "grass")

    def test_completion_failure_uses_fallback_and_does_not_accept_partial_geometry(self):
        partial = OSM_RESPONSE.replace(b"</osm>", b"""
          <relation id="12"><member type="way" ref="20" role="outer"/>
            <tag k="type" v="multipolygon"/><tag k="landuse" v="forest"/>
          </relation></osm>""")
        with patch("fetch_osm.urllib.request.urlopen", side_effect=[
                io.BytesIO(partial), OSError("Completion offline"),
                io.BytesIO(partial), io.BytesIO(OSM_RESPONSE)]):
            root, urls = _request_sources([0, 0, 0.009, 0.009])
        self.assertEqual(urls, [OVERPASS_URLS[1]])
        self.assertEqual(incomplete_landcover(root), [])

    def test_completion_detects_missing_nodes_but_ignores_unrendered_boundaries(self):
        root = ET.fromstring("""<osm><way id="20"><nd ref="2"/></way>
          <relation id="12"><member type="way" ref="20" role="outer"/>
            <tag k="type" v="multipolygon"/><tag k="natural" v="wood"/></relation>
          <relation id="13"><member type="way" ref="99" role="outer"/>
            <tag k="type" v="boundary"/></relation></osm>""")
        self.assertEqual(incomplete_landcover(root), ["12"])

    def test_prepared_snapshot_can_still_be_reused_offline(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "old.osm"
            root = ET.fromstring(OSM_RESPONSE)
            root.set("source_url", "https://api.openstreetmap.org/api/0.6/map?bbox=0,0,0.009,0.009")
            root.set("region_name", "Test")
            relation = ET.SubElement(root, "relation", {"id": "12"})
            ET.SubElement(relation, "member", {"type": "way", "ref": "20", "role": "outer"})
            ET.SubElement(relation, "tag", {"k": "type", "v": "multipolygon"})
            ET.SubElement(relation, "tag", {"k": "landuse", "v": "meadow"})
            output.write_bytes(ET.tostring(root))
            with patch("fetch_osm.urllib.request.urlopen", side_effect=AssertionError("Offline")) as request:
                _, _, reused = download_region([0, 0, 0.009, 0.009], "Test", output)
            self.assertTrue(reused)
            request.assert_not_called()

    def setUp(self):
        _COOLDOWNS.clear()
        _SOURCE_CURSORS.clear()

    def tearDown(self):
        _COOLDOWNS.clear()
        _SOURCE_CURSORS.clear()

    def test_healthy_map_sources_rotate_and_wrap_without_parallel_requests(self):
        urls = []
        def response(request, **kwargs):
            urls.append(request.full_url.split("/api/0.6/map?")[0])
            return io.BytesIO(OSM_RESPONSE)
        with patch("fetch_osm.urllib.request.urlopen", side_effect=response):
            for _ in range(6):
                _request_sources([0, 0, 0.009, 0.009])
        self.assertEqual(urls, ["https://api.openstreetmap.org", *OVERPASS_URLS] * 2)

    def test_map_rotation_skips_cooldown_until_expiry_and_advances_after_fallback(self):
        sources = ("https://api.openstreetmap.org", *OVERPASS_URLS)
        _COOLDOWNS[OVERPASS_URLS[0]] = 142
        with patch("fetch_osm.time.monotonic", return_value=100), \
                patch("fetch_osm._request_map", return_value=("map", [])) as primary, \
                patch("fetch_osm._request_overpass", return_value=("overpass", [])) as overpass:
            _request_sources([0, 0, 0.009, 0.009])
            _request_sources([0, 0, 0.009, 0.009])
            self.assertEqual(primary.call_count, 1)
            self.assertEqual(overpass.call_args.args[1], OVERPASS_URLS[1])
            self.assertEqual(_SOURCE_CURSORS[sources], 0)
        with patch("fetch_osm.time.monotonic", return_value=143), \
                patch("fetch_osm._request_map", return_value=("map", [])), \
                patch("fetch_osm._request_overpass", return_value=("overpass", [])) as overpass:
            _request_sources([0, 0, 0.009, 0.009])
            _request_sources([0, 0, 0.009, 0.009])
            self.assertEqual(overpass.call_args.args[1], OVERPASS_URLS[0])

    def test_town_catalogues_rotate_and_share_provider_cooldowns_with_maps(self):
        responses = lambda *args, **kwargs: io.BytesIO(b'{"elements":[]}')
        with patch("fetch_osm.urllib.request.urlopen", side_effect=responses):
            self.assertEqual([fetch_towns(44, 2)["sourceUrl"] for _ in range(4)],
                             list(OVERPASS_URLS) * 2)
        error = urllib.error.HTTPError(
            OVERPASS_URLS[0], 429, "Too many requests", {"Retry-After": "120"}, io.BytesIO(b"Slow down"))
        with patch("fetch_osm.time.monotonic", return_value=100), \
                patch("fetch_osm.urllib.request.urlopen", side_effect=[
                    error, io.BytesIO(b'{"elements":[]}')]):
            self.assertEqual(fetch_towns(44, 2)["sourceUrl"], OVERPASS_URLS[1])
        self.assertEqual(_COOLDOWNS[OVERPASS_URLS[0]], 220)
        _SOURCE_CURSORS[("https://api.openstreetmap.org", *OVERPASS_URLS)] = 1
        with patch("fetch_osm.time.monotonic", return_value=150), \
                patch("fetch_osm._request_overpass", return_value=("map", [])) as overpass:
            _request_sources([0, 0, 0.009, 0.009])
            self.assertEqual(overpass.call_args.args[1], OVERPASS_URLS[1])

    def test_all_cooling_sources_make_no_network_requests(self):
        for source in ("https://api.openstreetmap.org", *OVERPASS_URLS):
            _COOLDOWNS[source] = 200
        with patch("fetch_osm.time.monotonic", return_value=100), \
                patch("fetch_osm.urllib.request.urlopen") as request:
            from fetch_osm import SourceUnavailable
            with self.assertRaises(SourceUnavailable):
                _request_sources([0, 0, 0.009, 0.009])
            with self.assertRaises(SourceUnavailable):
                fetch_towns(44, 2)
            request.assert_not_called()

    def test_throttle_uses_overpass_and_honors_server_cooldown(self):
        error = urllib.error.HTTPError(
            "https://api.openstreetmap.org", 509, "Throttled", {},
            io.BytesIO(b"Please try again in 42 seconds."),
        )
        xml = OSM_RESPONSE.replace(
            b'<bounds minlat="0" minlon="0" maxlat="0.009" maxlon="0.009"/>', b""
        )
        with patch("fetch_osm.time.monotonic", return_value=100), \
                patch("fetch_osm.urllib.request.urlopen", side_effect=[
                    error, io.BytesIO(xml), io.BytesIO(xml),
                ]) as request:
            root, urls = _request_sources([0, 0, 0.009, 0.009])
            self.assertEqual(urls, [OVERPASS_URLS[0]])
            self.assertEqual(root.find("bounds").attrib["maxlon"], "0.009")
            self.assertEqual(_COOLDOWNS["https://api.openstreetmap.org"], 142)
            _request_sources([0, 0, 0.009, 0.009])
            self.assertEqual(request.call_count, 3)
            query = request.call_args.args[0].data.decode()
            self.assertIn("data=", query)

    def test_incomplete_overpass_is_not_cached_and_next_source_is_used(self):
        with patch("fetch_osm.urllib.request.urlopen", side_effect=[
            OSError("Offline"), io.BytesIO(b"<osm><remark>timeout</remark></osm>"),
            io.BytesIO(OSM_RESPONSE),
        ]):
            _, urls = _request_sources([0, 0, 0.009, 0.009])
        self.assertEqual(urls, [OVERPASS_URLS[1]])

    def test_splits_node_limited_requests_and_deduplicates_osm_ids(self):
        error = urllib.error.HTTPError(
            "https://api.openstreetmap.org", 400, "Bad Request", {},
            io.BytesIO(b"You requested too many nodes (limit is 50000)."),
        )
        events = []
        with patch("fetch_osm.urllib.request.urlopen", side_effect=[
            error, io.BytesIO(OSM_RESPONSE), io.BytesIO(OSM_RESPONSE),
        ]) as request:
            root, urls = _request_map([0, 0, 0.009, 0.009], on_progress=events.append)
        self.assertEqual(request.call_count, 3)
        self.assertEqual(len(root.findall("node")), 1)
        self.assertEqual(len(urls), 2)
        self.assertEqual(root.find("bounds").attrib["maxlon"], "0.009")
        self.assertEqual([e["phase"] for e in events], ["download", "split", "download", "download"])
        self.assertEqual([e["depth"] for e in events if e["phase"] == "download"], [0, 1, 1])

    def test_progress_reports_shared_queue_cooldown_and_actual_backup_requests(self):
        events = []
        _COOLDOWNS["https://api.openstreetmap.org"] = 142
        with patch("fetch_osm.time.monotonic", return_value=100), \
                patch("fetch_osm.urllib.request.urlopen", side_effect=[
                    OSError("Provider offline"), io.BytesIO(OSM_RESPONSE),
                ]):
            _request_sources([0, 0, 0.009, 0.009], on_progress=events.append)
        self.assertEqual([e["phase"] for e in events],
                         ["sourceQueue", "cooldown", "download", "fallback", "download"])
        self.assertEqual(events[1]["seconds"], 42)
        self.assertEqual(events[-1]["provider"], "overpass.kumi.systems")
        self.assertTrue(events[-1]["backup"])

    def test_reports_other_http_errors_without_splitting(self):
        error = urllib.error.HTTPError(
            "https://api.openstreetmap.org", 400, "Bad Request", {},
            io.BytesIO(b"Invalid query"),
        )
        with patch("fetch_osm.urllib.request.urlopen", side_effect=error) as request:
            with self.assertRaisesRegex(ValueError, "Invalid query"):
                _request_map([0, 0, 0.009, 0.009])
            request.assert_called_once()

    def test_exhausted_node_limit_splitting_uses_fallback_with_original_bounds(self):
        errors = [
            urllib.error.HTTPError("https://api.openstreetmap.org", 400, "Bad Request", {},
                io.BytesIO(b"You requested too many nodes (limit is 50000)."))
            for _ in range(5)
        ]
        with patch("fetch_osm.urllib.request.urlopen", side_effect=[
            *errors, io.BytesIO(b"<osm><remark>timeout</remark></osm>"),
            io.BytesIO(OSM_RESPONSE),
        ]) as request:
            root, urls = _request_sources([0, 0, 0.009, 0.009])
        self.assertEqual(request.call_count, 7)
        self.assertEqual(urls, [OVERPASS_URLS[1]])
        self.assertEqual(root.find("bounds").attrib, {
            "minlon": "0", "minlat": "0", "maxlon": "0.009", "maxlat": "0.009",
        })
        self.assertIn("https://api.openstreetmap.org", _COOLDOWNS)
        self.assertIn(OVERPASS_URLS[0], _COOLDOWNS)

    def test_invalid_primary_response_uses_fallback(self):
        with patch("fetch_osm.urllib.request.urlopen", side_effect=[
            io.BytesIO(b"<osm/>"), io.BytesIO(OSM_RESPONSE),
        ]):
            root, urls = _request_sources([0, 0, 0.009, 0.009])
        self.assertEqual(urls, [OVERPASS_URLS[0]])
        self.assertIsNotNone(root.find("node"))

    def test_primary_http_rejection_uses_fallback_without_splitting(self):
        error = urllib.error.HTTPError("https://api.openstreetmap.org", 403, "Forbidden", {},
                                     io.BytesIO(b"Provider rejected request"))
        with patch("fetch_osm.urllib.request.urlopen", side_effect=[
            error, io.BytesIO(OSM_RESPONSE),
        ]) as request:
            _, urls = _request_sources([0, 0, 0.009, 0.009])
        self.assertEqual(request.call_count, 2)
        self.assertEqual(urls, [OVERPASS_URLS[0]])

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
                with self.assertRaisesRegex(ValueError, "All OSM sources unavailable"):
                    download_region([0, 0, 0.009, 0.009], "Test", output, refresh=True)
            self.assertEqual(output.read_bytes(), OSM_RESPONSE)


if __name__ == "__main__":
    unittest.main()
