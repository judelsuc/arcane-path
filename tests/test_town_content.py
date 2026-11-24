import copy
from contextlib import contextmanager
from decimal import Decimal
import io
import json
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
from unittest.mock import patch

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from abandoned_journals import JournalForbidden
from asset_storage import local_storage
from journeys import JourneyConflict, JourneyRequest
from town_content import DocumentarySources, TownContent, Wikimedia, allowed_url


def town(tags=None):
    return {"osmId": "node/10", "name": "Firmi", "coordinates": (44.545, 2.305),
            "tags": tags or {}}


def photograph(number, **overrides):
    metadata = {
        "Artist": {"value": "<a>Camera Author</a>"},
        "LicenseShortName": {"value": "CC BY-SA 4.0"},
        "LicenseUrl": {"value": "https://creativecommons.org/licenses/by-sa/4.0/"},
        "ImageDescription": {"value": f"<p>Town photograph {number}</p>"},
    }
    return {"title": f"File:Town {number}.jpg", "coordinates": [{"lat": 44.545, "lon": 2.305}],
            "imageinfo": [{"sha1": str(number), "mime": "image/jpeg",
                           "thumburl": f"https://thumb.wikimedia.org/{number}.jpg",
                           "descriptionurl": f"https://commons.wikimedia.org/wiki/File:Town_{number}.jpg",
                           "extmetadata": {**metadata, **overrides}}]}


class Sources:
    def __init__(self, count=5, center=(44.545, 2.305), name="Firmi"):
        self.calls = []
        self.count = count
        self.block = None
        self.started = threading.Event()
        self.fail_images = set()
        self.center, self.name = center, name

    def api(self, host, **parameters):
        self.calls.append((host, parameters))
        self.started.set()
        if self.block:
            if not self.block.wait(5):
                raise TimeoutError("Fixture source did not resume.")
        if host == "www.wikidata.org":
            return {"entities": {"Q123": {"sitelinks": {
                "enwiki": {"title": self.name}, "frwiki": {"title": self.name}},
                "claims": {"P18": [{"mainsnak": {"datavalue": {"value": "Town 0.jpg"}}}]}}}}
        if host.endswith("wikipedia.org"):
            return {"query": {"pages": {"1": {
                "title": self.name, "extract": "A sourced town description.",
                "fullurl": f"https://{host}/wiki/{self.name}", "pageimage": "Town 0.jpg",
                "coordinates": [{"lat": self.center[0], "lon": self.center[1]}],
            }}}}
        if host == "commons.wikimedia.org":
            return {"query": {"pages": {str(n): {
                **photograph(n), "coordinates": [{"lat": self.center[0], "lon": self.center[1]}],
            } for n in range(self.count)}}}
        raise AssertionError(host)

    def read(self, url, image=False):
        if not image:
            raise AssertionError(url)
        number = int(url.rsplit("/", 1)[1].split(".")[0])
        if number in self.fail_images:
            raise OSError("Fixture photograph unavailable")
        stream = io.BytesIO()
        Image.new("RGB", (20, 20), (number, 0, 0)).save(stream, "JPEG")
        return stream.getvalue(), "image/jpeg"


class DocumentarySourceTests(unittest.TestCase):
    def resolve(self, sources=None, info=None, language="en"):
        progress = []
        source = sources or Sources()
        def publish(url, metadata):
            source.read(url, image=True)
            return {**metadata, "imageId": url.rsplit("/", 1)[1]}
        result = DocumentarySources(source).resolve(
            info or town({"wikidata": "Q123", "wikipedia": "fr:Firmi"}), language,
            lambda value: progress.append(copy.deepcopy(value)), publish)
        return result, progress, source

    def test_requested_translation_and_progressive_zero_one_five_photo_galleries(self):
        for count in (0, 1, 5, 12):
            with self.subTest(count=count):
                result, progress, source = self.resolve(Sources(count))
                self.assertEqual(len(result["photos"]), min(count, 5))
                self.assertEqual(result["content"]["language"], "en")
                self.assertIn("en.wikipedia.org", result["content"]["sourceUrl"])
                self.assertEqual(progress[0]["photos"], [])
                self.assertTrue(progress[0]["content"])
                self.assertFalse(progress[-1]["loading"])
                self.assertTrue(all(p["attribution"] == "Camera Author" for p in result["photos"]))
                self.assertTrue(all("<" not in p["caption"] for p in result["photos"]))
                self.assertTrue(any(host == "en.wikipedia.org" for host, _ in source.calls))

    def test_fallback_language_and_osm_description_are_explicit(self):
        source = Sources(0)
        original = source.api
        def api(host, **params):
            if host == "www.wikidata.org":
                return {"entities": {}}
            return original(host, **params)
        source.api = api
        result, _, _ = self.resolve(source, town({"wikipedia": "fr:Firmi"}))
        self.assertEqual(result["content"]["language"], "fr")
        source.api = lambda host, **params: {"query": {"pages": {}}}
        result, _, _ = self.resolve(source, town({"description:en": "Recorded OSM description."}))
        self.assertEqual(result["content"]["text"], "Recorded OSM description.")
        self.assertEqual(result["content"]["license"], "ODbL 1.0")
        result, _, _ = self.resolve(source, town({"description:fr": "Description source."}))
        self.assertEqual(result["content"]["language"], "fr")

    def test_no_association_requires_matching_name_and_coordinates_not_nearest_landmark(self):
        source = Sources(0)
        def api(host, **params):
            if host.endswith("wikipedia.org"):
                return {"query": {"pages": {
                    "1": {"title": "Nearby landmark", "extract": "Wrong landmark",
                          "fullurl": f"https://{host}/wiki/Landmark",
                          "coordinates": [{"lat": 44.545, "lon": 2.305}]},
                    "2": {"title": "Firmi", "extract": "Distant homonym",
                          "fullurl": f"https://{host}/wiki/Firmi",
                          "coordinates": [{"lat": 48, "lon": 2}]},
                }}}
            return {"query": {"pages": {}}}
        source.api = api
        result, _, _ = self.resolve(source, town())
        self.assertIsNone(result["content"])
        self.assertEqual(result["photos"], [])

    def test_partial_outage_keeps_summary_and_other_photos_and_logs_errors(self):
        source = Sources(5)
        source.fail_images = {0, 2}
        with self.assertLogs(level="WARNING"):
            result, progress, _ = self.resolve(source)
        self.assertTrue(result["content"])
        self.assertEqual(len(result["photos"]), 3)
        self.assertEqual(len(result["errors"]), 2)
        self.assertTrue(any(value["content"] and value["loading"] for value in progress))

    def test_multiple_nearby_homonyms_are_ambiguous_and_distant_wikidata_is_not_used(self):
        source = Sources(0)
        original = source.api
        def api(host, **params):
            if host.endswith("wikipedia.org"):
                return {"query": {"pages": {
                    str(n): {"title": name, "extract": "Ambiguous town", "fullurl": f"https://{host}/wiki/{n}",
                             "coordinates": [{"lat": 44.545, "lon": 2.305}]}
                    for n, name in enumerate(("Firmi", "Firmi (France)"))}}}
            return original(host, **params)
        source.api = api
        value, _, _ = self.resolve(source, town())
        self.assertIsNone(value["content"])
        self.assertTrue(any("ambiguous" in error for error in value["errors"]))
        def distant(host, **params):
            if host == "www.wikidata.org":
                return {"entities": {"Q123": {"sitelinks": {"enwiki": {"title": "Wrong town"}},
                    "claims": {"P625": [{"mainsnak": {"datavalue": {
                        "value": {"latitude": 1, "longitude": 1}}}}]}}}}
            return {"query": {"pages": {}}}
        source.api = distant
        value, _, _ = self.resolve(source, town({"wikidata": "Q123", "description": "OSM fallback"}))
        self.assertEqual(value["content"]["text"], "OSM fallback")
        self.assertTrue(any("too far" in error for error in value["errors"]))

    def test_nearby_photos_are_not_presented_as_proven_town_photos(self):
        source = Sources(3)
        original = source.api
        def api(host, **params):
            if host == "commons.wikimedia.org" and "titles" in params:
                return {"query": {"pages": {}}}
            return original(host, **params)
        source.api = api
        result, _, _ = self.resolve(source)
        self.assertEqual({photo["association"] for photo in result["photos"]}, {"nearby"})

    def test_commons_sitelink_category_and_wikidata_only_language_fallback(self):
        source = Sources(1)
        original = source.api
        categories = []
        def api(host, **params):
            if host == "www.wikidata.org":
                return {"entities": {"Q123": {"sitelinks": {
                    "enwiki": {"title": "Firmi"}, "commonswiki": {"title": "Category:Firmi"}},
                    "claims": {}}}}
            if params.get("list") == "categorymembers":
                categories.append(params["cmtitle"])
                return {"query": {"categorymembers": [{"title": "File:Town 0.jpg"}]}}
            return original(host, **params)
        source.api = api
        value, _, _ = self.resolve(source, town({"wikidata": "Q123"}), "fr")
        self.assertEqual(value["content"]["language"], "en")
        self.assertEqual(categories, ["Category:Firmi"])
        self.assertEqual(len(value["photos"]), 1)
        self.assertEqual(value["photos"][0]["association"], "town")

    def test_duplicate_unlicensed_synthetic_and_nonphotographic_files_are_excluded(self):
        source = Sources()
        original = source.api
        def api(host, **params):
            if host == "commons.wikimedia.org":
                entries = [photograph(0), photograph(0),
                           photograph(1, Artist={"value": ""}),
                           photograph(2, LicenseShortName={"value": "All rights reserved"}),
                           photograph(3, Categories={"value": "AI-generated images"}),
                           photograph(4, Categories={"value": "Maps of Firmi"})]
                return {"query": {"pages": {str(n): p for n, p in enumerate(entries)}}}
            return original(host, **params)
        source.api = api
        result, _, _ = self.resolve(source)
        self.assertEqual(len(result["photos"]), 1)
        self.assertEqual(result["photos"][0]["license"], "CC BY-SA 4.0")

    def test_remote_urls_and_redirects_cannot_target_arbitrary_hosts(self):
        for url in ("http://commons.wikimedia.org/w/api.php", "https://localhost/",
                    "https://commons.wikimedia.org.evil.test/", "https://user:pass@www.wikidata.org/",
                    "https://commons.wikimedia.org:8443/", "file:///etc/passwd"):
            self.assertFalse(allowed_url(url))
            with self.assertRaises(ValueError):
                Wikimedia().read(url)
        self.assertTrue(allowed_url("https://en.wikipedia.org/w/api.php"))
        self.assertTrue(allowed_url("https://upload.wikimedia.org/image.jpg", True))
        self.assertTrue(allowed_url("https://thumb.wikimedia.org/image.jpg", True))


class TownContentTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.assets = local_storage(self.root / "shared")
        self.addCleanup(self.assets.catalogue.close)
        settlement = {**town(), "wikipedia": "fr:Firmi", "wikidata": "Q123"}
        cell = {"terrain": "place", "settlements": [settlement]}
        self.grid = {"width": 2, "height": 1, "cellSizeMeters": 250,
                     "bounds": {"minLatitude": 44.54, "maxLatitude": 44.55,
                                "minLongitude": 2.30, "maxLongitude": 2.31},
                     "rows": [[cell, copy.deepcopy(cell)]]}
        self.chunks = SimpleNamespace(
            bases={"firmi": self.grid}, require_origin=lambda region: None,
            read=lambda region, x, y: None)
        class Authorization:
            def authorize(self, journey, token):
                if token != "fixture":
                    raise JournalForbidden("Invalid capability")
                return {"region": "firmi"}
        self.journeys = SimpleNamespace(path=self.root / "journeys.sqlite3", assets=self.assets, chunks=self.chunks)
        self.source = Sources()
        self.service = TownContent(self.journeys, Authorization(), source=self.source)
        self.addCleanup(self.service.close)
        self.authorization = Authorization()
        self.payload = {"journey": "a" * 32, "location": {"col": 0, "row": 0},
                        "town": "node/10", "language": "en"}

    def request(self, **changed):
        return self.service.request({**self.payload, **changed}, "fixture")

    def settled(self):
        for _ in range(500):
            value = self.request()
            if not value["loading"]:
                return value
            time.sleep(.01)
        self.fail("Town documentary worker did not finish.")

    def test_shared_cache_persists_metadata_and_real_bytes_across_service_instances(self):
        initial = self.request()
        self.assertTrue(initial["loading"])
        result = self.settled()
        self.assertEqual(len(result["photos"]), 5)
        calls = len(self.source.calls)
        second_assets = local_storage(self.root / "shared")
        self.addCleanup(second_assets.catalogue.close)
        second = TownContent(SimpleNamespace(**{**vars(self.journeys), "assets": second_assets}),
                             self.authorization, source=Sources(0))
        self.addCleanup(second.close)
        cached = second.request({**self.payload, "journey": "b" * 32,
                                 "location": {"col": 1, "row": 0}}, "fixture")
        self.assertEqual(cached["photos"], result["photos"])
        self.assertTrue(cached["cached"])
        self.assertEqual(len(self.source.calls), calls)
        image, media = second.request({**self.payload, "image": result["photos"][0]["imageId"]}, "fixture")
        self.assertEqual(media, "image/jpeg")
        self.assertEqual(Image.open(io.BytesIO(image)).format, "JPEG")
        self.assertNotIn("journey", json.dumps(result))

    def test_cross_process_lease_deduplicates_concurrent_reads_and_refresh_is_bounded(self):
        self.source.block = threading.Event()
        second = TownContent(self.journeys, self.authorization, source=self.source)
        self.addCleanup(second.close)
        self.request()
        self.assertTrue(self.source.started.wait(2))
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda index: (self.service if index % 2 else second).request(
                self.payload, "fixture"), range(12)))
        self.assertTrue(all(result["loading"] for result in results))
        self.assertEqual(len(self.source.calls), 1)
        self.source.block.set()
        self.settled()
        calls = len(self.source.calls)
        refreshed = self.request(refresh=True)
        self.assertTrue(refreshed["cached"])
        self.assertGreater(refreshed["refreshAfter"], time.time() * 1000)
        self.assertEqual(len(self.source.calls), calls)

    def test_bad_capabilities_arbitrary_towns_unloaded_cells_and_client_sources_rejected(self):
        with self.assertRaises(JournalForbidden):
            self.service.request(self.payload, "wrong")
        for extra in ({"language": "evil.test"}, {"url": "https://localhost"},
                      {"refresh": 1}, {"journey": "bad"}, {"image": "arbitrary"}):
            with self.subTest(extra=extra), self.assertRaises(JourneyRequest):
                self.request(**extra)
        with self.assertRaises(JourneyConflict):
            self.request(town="node/99")
        with self.assertRaises(JourneyConflict):
            self.request(location={"col": -1, "row": 0})
        self.grid["rows"][0][0]["terrain"] = "forest"
        with self.assertRaises(JourneyConflict):
            self.request()
        self.assertEqual(self.source.calls, [])

    def test_streamed_negative_position_uses_cached_grid_without_downloading(self):
        self.chunks.read = lambda region, x, y: {
            **self.grid, "width": 8, "height": 8,
            "rows": [[self.grid["rows"][0][0]] * 8 for _ in range(8)]}
        value = self.service.town({**self.payload, "location": {"col": -1, "row": -1}}, "fixture")
        self.assertEqual(value["osmId"], "node/10")

    def test_complete_source_failure_is_visible_cached_briefly_and_can_recover(self):
        self.source.api = lambda *args, **kwargs: (_ for _ in ()).throw(OSError("offline"))
        with self.assertLogs(level="WARNING"):
            self.request()
            value = self.settled()
        self.assertIsNone(value["content"])
        self.assertFalse(value["loading"])
        self.assertTrue(value["errors"])
        self.assertLess(value["expiresAt"] - time.time() * 1000, 301000)

    def test_expired_worker_lease_recovers_even_if_partial_content_ttl_is_still_fresh(self):
        self.request()
        complete = self.settled()
        with self.assets.catalogue.connection() as db:
            db.execute("UPDATE town_documents SET token='stopped-worker',lease=0,payload=?",
                       (json.dumps({**complete, "loading": True}),))
        previous_calls = len(self.source.calls)
        self.assertTrue(self.request()["loading"])
        recovered = self.settled()
        self.assertEqual(len(recovered["photos"]), 5)
        self.assertGreater(len(self.source.calls), previous_calls)

    def test_postgresql_decimal_epoch_is_normalized_before_json_and_datetime_conversion(self):
        connection = self.assets.catalogue.connection
        @contextmanager
        def decimal_clock():
            with connection() as db:
                def execute(sql, parameters=()):
                    cursor = db.execute(sql, parameters)
                    if sql.startswith("SELECT (julianday"):
                        return SimpleNamespace(fetchone=lambda: (Decimal(str(cursor.fetchone()[0])),))
                    return cursor
                yield SimpleNamespace(execute=execute)
        with patch.object(self.assets.catalogue, "connection", decimal_clock):
            self.request()
            result = self.settled()
        self.assertFalse(result["loading"])
        self.assertFalse(result["errors"])
        self.assertIsInstance(result["expiresAt"], float)

    def test_shared_schema_is_initialized_explicitly_not_by_api_constructor(self):
        with patch.object(self.assets.catalogue, "initialize", side_effect=AssertionError("runtime migration")):
            another = TownContent(self.journeys, self.authorization, source=self.source)
            another.close()
        with self.assets.catalogue.connection() as db:
            self.assertIsNotNone(db.execute(
                "SELECT name FROM sqlite_master WHERE name='town_documents'").fetchone())


if __name__ == "__main__":
    unittest.main()
