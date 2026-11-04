import copy
import io
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from living_world import LivingWorld, acquire, instant, normalize, query_position
from travel_server import atomic_write, ChunkStore, ChunkJobs, make_handler

NOW = instant("2026-10-19T12:00:00Z") / 1000


def fixture():
    return {"total_count": 1, "results": [{
        "uid": "1234", "title_fr": "Concert public",
        "canonicalurl": "https://openagenda.com/example/events/concert",
        "location_coordinates": {"lat": 48.8566, "lon": 2.3522},
        "timings": json.dumps([{"begin": "2026-10-19T13:00:00Z", "end": "2026-10-19T15:00:00Z"}]),
        "status": '{"id":1}',
        "contributor_email": "MUST NOT BE RETAINED", "image": "https://example.org/copyright.jpg",
    }]}


class LivingWorldTests(unittest.TestCase):
    def test_real_records_are_attributed_bounded_and_never_include_publicity_or_contact_data(self):
        result = normalize(fixture(), 48.86, 2.35, NOW)
        self.assertEqual(len(result["records"]), 1)
        event = result["records"][0]
        self.assertEqual(event["reality"], "public")
        self.assertEqual(event["title"], {"fr": "Concert public", "en": "Concert public"})
        self.assertEqual(event["area"]["lat"], 48.8566)
        self.assertEqual(event["source"]["observedAt"], NOW * 1000)
        self.assertEqual(event["source"]["validUntil"], (NOW + 86400) * 1000)
        self.assertNotIn("copyright.jpg", json.dumps(result))
        self.assertNotIn("MUST NOT BE RETAINED", json.dumps(result))
        self.assertFalse(result["coverage"]["eventImagesIncluded"])

    def test_cancelled_missing_timezone_bad_location_and_source_are_explicitly_omitted(self):
        for modify in [
            lambda r: r.update(status='{"id":2}'), lambda r: r.pop("status"),
            lambda r: r.update(location_coordinates={"lat": 1, "lon": 1}),
            lambda r: r.update(location_coordinates={"lat": True, "lon": 2.35}),
            lambda r: r.update(status='{"id":true}'),
            lambda r: r.update(canonicalurl="https://openagenda.com.evil.org/x"),
            lambda r: r.update(timings='[{"begin":"2026-10-19T13:00:00","end":"2026-10-19T15:00:00"}]'),
            lambda r: r.update(timings='[{"begin":"2026-10-19T15:00:00Z","end":"2026-10-19T13:00:00Z"}]'),
        ]:
            data = fixture(); modify(data["results"][0])
            with self.assertLogs(level="WARNING"):
                result = normalize(data, 48.86, 2.35, NOW)
            self.assertEqual(result["records"], [])
            self.assertEqual(result["coverage"]["rejectedRows"], 1)

    def test_duplicates_old_occurrences_and_out_of_window_events_are_not_manufactured(self):
        data = fixture()
        timings = json.loads(data["results"][0]["timings"])
        timings += copy.deepcopy(timings)
        timings += [{"begin": "2021-01-01T00:00:00Z", "end": "2021-01-01T01:00:00Z"},
                    {"begin": "2027-01-01T00:00:00Z", "end": "2027-01-01T01:00:00Z"}]
        data["results"][0]["timings"] = json.dumps(timings)
        data["total_count"] = 100
        result = normalize(data, 48.86, 2.35, NOW)
        self.assertEqual(len(result["records"]), 1)
        self.assertTrue(result["coverage"]["truncated"])
        self.assertEqual(normalize({"results": [], "total_count": 0}, 48.86, 2.35, NOW)["records"], [])

    def test_invalid_later_occurrence_rejects_whole_source_row_without_partial_import(self):
        data = fixture()
        timings = json.loads(data["results"][0]["timings"])
        timings.append({"begin": "not a date", "end": "not a date"})
        data["results"][0]["timings"] = json.dumps(timings)
        with self.assertLogs(level="WARNING"):
            result = normalize(data, 48.86, 2.35, NOW)
        self.assertEqual(result["records"], [])
        self.assertEqual(result["coverage"]["rejectedRows"], 1)

    def test_payload_is_capped_at_canonical_js_byte_limit_and_occurrence_count(self):
        data = fixture()
        row = data["results"][0]
        row["title_fr"] = "界" * 240
        row["canonicalurl"] = "https://openagenda.com/" + "a" * 2000
        row["timings"] = json.dumps([
            {"begin": f"2026-10-{day:02}T{hour:02}:00:00Z",
             "end": f"2026-10-{day:02}T{hour:02}:30:00Z"}
            for day in range(20, 26) for hour in range(24)])
        result = normalize(data, 48.86, 2.35, NOW)
        self.assertLessEqual(len(result["records"]), 128)
        self.assertLessEqual(len(json.dumps(result, ensure_ascii=False).encode()), 262144)
        self.assertTrue(result["coverage"]["truncated"])
        self.assertGreater(len(result["records"]), 0)

    def test_provider_request_is_fixed_bounded_and_excludes_images_and_contacts(self):
        with patch("living_world.urllib.request.urlopen",
                   return_value=io.BytesIO(json.dumps(fixture()).encode())) as request:
            acquire(48.86, 2.35, NOW)
        from urllib.parse import urlsplit, parse_qs
        query = parse_qs(urlsplit(request.call_args.args[0].full_url).query)
        self.assertEqual(query["limit"], ["64"])
        self.assertIn("20km", query["where"][0])
        self.assertIn("2026-10-19T12:00:00", query["where"][0])
        self.assertNotIn("image", query["select"][0])
        self.assertNotIn("contributor", query["select"][0])

    def test_cache_survives_restart_expires_and_detects_corruption_without_fake_fallback(self):
        with tempfile.TemporaryDirectory() as directory:
            now = [NOW]
            calls = []
            def fetcher(lat, lon, at):
                calls.append((lat, lon, at))
                return normalize(fixture(), lat, lon, at)
            store = LivingWorld(Path(directory), atomic_write, fetcher=fetcher, clock=lambda: now[0])
            first = store.build(48.86, 2.35)
            self.assertEqual(store.build(48.86, 2.35), first)
            restarted = LivingWorld(Path(directory), atomic_write, fetcher=fetcher, clock=lambda: now[0])
            self.assertEqual(restarted.read(48.86, 2.35), first)
            self.assertEqual(len(calls), 1)
            now[0] += 21600
            self.assertIsNone(restarted.read(48.86, 2.35))
            restarted.build(48.86, 2.35)
            self.assertEqual(len(calls), 2)
            path = store.path(48.86, 2.35)
            data = json.loads(path.read_text()); data["data"]["coverage"]["sourceRows"] = 999
            path.write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError, "Corrupt"):
                restarted.read(48.86, 2.35)
            with self.assertRaises(ValueError):
                query_position(float("nan"), 0)

    def test_http_endpoint_rounds_coordinates_polls_and_explicitly_reports_provider_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            store = ChunkStore(cache=Path(directory))
            jobs = ChunkJobs(store)
            handler = make_handler(store, jobs)
            public = handler.living_world
            public.store.clock = lambda: NOW
            public.store.fetcher = lambda lat, lon, now: normalize(fixture(), lat, lon, now)
            server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            base = f"http://127.0.0.1:{server.server_port}"
            def get(path):
                with urllib.request.urlopen(base + path, timeout=5) as response:
                    return response.status, json.load(response)
            try:
                status, _ = get("/api/living-world?lat=48.8566&lon=2.3522")
                self.assertEqual(status, 202)
                public.jobs[(48.86, 2.35)].result(timeout=5)
                status, data = get("/api/living-world?lat=48.8566&lon=2.3522")
                self.assertEqual(status, 200)
                self.assertEqual(data["coverage"]["latitude"], 48.86)
                self.assertEqual(len(data["records"]), 1)
                public.store.path(48.86, 2.35).write_text("{}")
                with self.assertLogs(level="ERROR"), self.assertRaises(urllib.error.HTTPError) as response:
                    get("/api/living-world?lat=48.8566&lon=2.3522")
                self.assertEqual(response.exception.code, 500, "server cache corruption is not a bad user query")
                response.exception.close()
                for query in ["lat=nan&lon=0", "lat=0&lon=181", "lat=0", "lat=0&lon=0&other=x",
                              "lat=0&lat=1&lon=0"]:
                    with self.assertRaises(urllib.error.HTTPError) as response:
                        get("/api/living-world?" + query)
                    self.assertEqual(response.exception.code, 400)
                    response.exception.close()
                def fail(*_):
                    raise OSError("Provider unavailable.")
                public.store.fetcher = fail
                self.assertEqual(get("/api/living-world?lat=1&lon=1")[0], 202)
                with self.assertRaises(OSError):
                    public.jobs[(1.0, 1.0)].result(timeout=5)
                with self.assertLogs(level="ERROR"), self.assertRaises(urllib.error.HTTPError) as response:
                    get("/api/living-world?lat=1&lon=1")
                self.assertEqual(response.exception.code, 502)
                response.exception.close()
            finally:
                server.shutdown(); server.server_close(); thread.join(timeout=5)
                public.pool.shutdown(wait=True)
                handler.journal_art.close(); handler.live_narrative.close()
                jobs.pool.shutdown(wait=True)
