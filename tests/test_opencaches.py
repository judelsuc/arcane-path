import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock

from asset_storage import AssetError, local_storage
from opencaches import MAX_AGE, fetch, offers, synchronize


class OpenCachesTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.assets = local_storage(Path(directory.name))
        self.addCleanup(self.assets.catalogue.close)
        self.cache = {"code": "OC123", "name": "Old oak", "location": "48.85|2.35",
                      "type": "Traditional", "status": "Available",
                      "url": "https://www.opencaching.de/viewcache.php?wp=OC123",
                      "attribution_note": 'OpenCaching contributor · <a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA</a>',
                      "oc_team_annotation": "Follow the listing's access conditions."}
        self.opener = Mock()

    def fetch(self, cache=None, more=False):
        response = Mock(status=200)
        response.read.return_value = json.dumps({"results": {"OC123": cache or self.cache}, "more": more}).encode()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        self.opener.open.return_value = response
        return fetch("de", (48.85, 2.35), 5, "fixture-consumer-key", opener=self.opener)

    def test_only_public_available_traditional_cache_metadata_is_fetched_with_attribution(self):
        records = self.fetch()
        self.assertEqual(records[0]["id"], "de:OC123")
        self.assertIn("CC BY-SA", records[0]["attribution"])
        self.assertIn("https://creativecommons.org/licenses/by-sa/3.0/", records[0]["attribution"])
        request = self.opener.open.call_args.args[0]
        self.assertEqual(request.full_url, "https://www.opencaching.de/okapi/services/caches/shortcuts/search_and_retrieve")
        self.assertNotIn("journey", request.data.decode())
        self.assertNotIn("player", request.data.decode())
        for patch in ({"type": "Unknown"}, {"status": "Archived"}, {"type": "Multi"}):
            self.assertEqual(self.fetch({**self.cache, **patch}), [])

    def test_untrusted_urls_missing_attribution_nonfinite_coordinates_and_truncation_fail_closed(self):
        for patch in ({"url": "javascript:alert(1)"}, {"url": "https://evil.test/cache"},
                      {"url": "https://www.opencaching.de:evil/cache"}, {"attribution_note": None},
                      {"location": "nan|2"}, {"location": "50|30"}, {"code": "OC999"}):
            with self.assertRaises(AssetError):
                self.fetch({**self.cache, **patch})
        with self.assertRaisesRegex(AssetError, "smaller import"):
            self.fetch(more=True)

    def test_real_cache_only_appears_on_matching_game_cell_and_expires_without_invented_replacements(self):
        records = self.fetch()
        synchronize(self.assets, "de", (48.85, 2.35), 5, records, now=1000000)
        base = {"cellSizeMeters": 250, "projectionLatitude": 48.85,
                "bounds": {"maxLatitude": 48.851, "minLatitude": 48.8, "minLongitude": 2.349}}
        from journey_storage import grid_position
        col, row = grid_position(base, 48.85, 2.35)
        position = {"col": col, "row": row}
        with self.assets.catalogue.connection() as db:
            select = lambda pos, opened=(), now=1000000: offers(db, self.assets.catalogue.sql, base, pos, opened, now)
            self.assertEqual(select(position), records)
            self.assertEqual(select({"col": col + 1, "row": row}), [])
            self.assertEqual(select(position, ["de:OC123"]), [])
            self.assertEqual(select(position, now=1000000 + MAX_AGE + 1), [])
        synchronize(self.assets, "de", (48.85, 2.35), 5, [], now=1000100)
        with self.assets.catalogue.connection() as db:
            self.assertEqual(offers(db, self.assets.catalogue.sql, base, position, [], 1000100), [])

    def test_unsupported_hosts_large_areas_or_invalid_keys_do_not_make_a_request(self):
        for site, center, radius, key in (
                ("other", (48, 2), 5, "key"), ("de", (48, 2), 21, "key"),
                ("de", (0, 0), 5, "key"), ("de", (48, 2), 5, "two words")):
            with self.assertRaises(ValueError):
                fetch(site, center, radius, key, opener=self.opener)
        self.opener.open.assert_not_called()
