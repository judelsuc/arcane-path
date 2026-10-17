import json
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from journeys import JourneyStore, JourneyRequest, JourneyConflict, JourneyCapacity, character_name
from travel_server import ChunkStore, ChunkJobs, atomic_write, make_handler


def request():
    return {"requestId": str(uuid.uuid4()), "region": "firmi", "name": "Alex"}


class JourneyTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.chunks = ChunkStore(cache=Path(self.directory.name))
        self.store = JourneyStore(self.chunks, atomic_write)

    def test_persisted_genesis_is_offline_and_survives_restart_and_config_changes(self):
        data = request()
        with patch("urllib.request.urlopen", side_effect=AssertionError("Network forbidden")):
            record, created = self.store.create(data)
        self.assertTrue(created)
        state = record["state"]
        self.assertEqual(state["name"], "Alex")
        self.assertEqual(len(state["trail"]["stages"]), 10)
        self.assertEqual(state["trail"]["generation"]["requests"], 0)
        self.assertEqual(state["elapsedMinutes"], 0)
        self.assertEqual(state["dailyCard"], state["birthCard"])
        self.assertEqual(state["reserveKcal"], record["survival"]["reserve_kcal"])
        restarted = JourneyStore(ChunkStore(cache=Path(self.directory.name)), atomic_write)
        with patch("journeys.load_config", side_effect=AssertionError("Pinned content only")), \
                patch.object(restarted.trails, "build", side_effect=AssertionError("No reroll")):
            self.assertEqual(restarted.create(data), (record, False))
            self.assertEqual(restarted.read(state["serverJourney"]["id"]), record)

    def test_parallel_retries_create_exactly_one_journey(self):
        data = request()
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(lambda _: self.store.create(data), range(4)))
        self.assertEqual(sum(created for _, created in results), 1)
        self.assertTrue(all(record == results[0][0] for record, _ in results))
        with self.store.connect() as db:
            self.assertEqual(db.execute("SELECT count(*) FROM journeys").fetchone()[0], 1)

    def test_conflicts_never_replace_existing_records(self):
        data = request()
        record, _ = self.store.create(data)
        for changes in [{"name": "Noa"}, {"region": "paris"}]:
            with self.assertRaises(JourneyConflict):
                self.store.create({**data, **changes})
        self.assertEqual(self.store.create(data), (record, False))

    def test_invalid_requests_and_utf16_names_match_browser_rules(self):
        self.assertEqual(character_name(" \ufeffE\u0301milie   du chemin "), "\u00c9milie du chemin")
        self.assertEqual(character_name("\U0001f600" * 20), "\U0001f600" * 20)
        for invalid in [None, [], {}, {**request(), "region": "../firmi"},
                        {**request(), "seed": "00000000"}, {**request(), "requestId": "bad"},
                        {**request(), "region": []}]:
            with self.assertRaises(JourneyRequest):
                self.store.create(invalid)
        for name in ["", "  ", 42, "A\nB", "A\x7f", "A" * 41, "\U0001f600" * 21]:
            with self.assertRaises(JourneyRequest):
                character_name(name)
        with self.assertRaises(JourneyRequest):
            self.store.read("../journeys.sqlite3")

    def test_failure_rolls_back_and_storage_limit_allows_existing_retries(self):
        data = request()
        with patch.object(self.store.trails, "build", side_effect=ValueError("No onward town")):
            with self.assertRaisesRegex(ValueError, "No onward town"):
                self.store.create(data)
        with self.store.connect() as db:
            self.assertEqual(db.execute("SELECT count(*) FROM journeys").fetchone()[0], 0)
        record, _ = self.store.create(data)
        with patch("journeys.MAX_JOURNEYS", 1):
            with self.assertRaises(JourneyCapacity):
                self.store.create(request())
            self.assertEqual(self.store.create(data), (record, False))

    def test_corruption_and_unsupported_database_version_fail_explicitly(self):
        data = request()
        record, _ = self.store.create(data)
        with self.store.connect() as db:
            db.execute("UPDATE journeys SET payload = '{}'")
        with self.assertRaisesRegex(ValueError, "Corrupt"):
            self.store.read(record["state"]["serverJourney"]["id"])
        with self.assertRaisesRegex(ValueError, "Corrupt"):
            self.store.create(data)
        with self.store.connect() as db:
            db.execute("PRAGMA user_version = 2")
        with self.assertRaisesRegex(ValueError, "Unsupported"):
            JourneyStore(self.chunks, atomic_write)


class JourneyHttpTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.store = ChunkStore(cache=Path(self.directory.name))
        jobs = ChunkJobs(self.store)
        self.addCleanup(jobs.pool.shutdown)
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(self.store, jobs))
        thread = threading.Thread(target=self.server.serve_forever)
        thread.start()
        def close():
            self.server.shutdown()
            self.server.server_close()
            thread.join()
        self.addCleanup(close)
        self.url = f"http://127.0.0.1:{self.server.server_port}"

    def call(self, path="/api/journeys", data=None, headers=None):
        req = urllib.request.Request(self.url + path, data=data,
                                     headers=headers or {"Content-Type": "application/json"})
        try:
            response = urllib.request.urlopen(req, timeout=5)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            self.assertEqual(response.headers["Cache-Control"], "no-store")
            return response.status, json.load(response)

    def test_create_retry_and_retrieve_same_immutable_start(self):
        data = json.dumps(request()).encode()
        status, record = self.call(data=data)
        self.assertEqual(status, 201)
        self.assertEqual(self.call(data=data), (200, record))
        journey_id = record["state"]["serverJourney"]["id"]
        self.assertEqual(self.call("/api/journeys/" + journey_id), (200, record))
        self.assertEqual(self.call("/api/journeys/" + "f" * 32)[0], 404)
        self.assertEqual(self.call("/api/journeys/not-an-id")[0], 400)
        self.assertEqual(self.call()[0], 404)

    def test_body_origin_and_content_type_checks(self):
        data = json.dumps(request()).encode()
        for headers, expected in [
            ({"Content-Type": "text/plain"}, 415),
            ({"Content-Type": "application/json", "Origin": "https://example.org"}, 403),
            ({"Content-Type": "application/json", "Origin": "http://["}, 403),
            ({"Content-Type": "application/json", "Sec-Fetch-Site": "cross-site"}, 403),
            ({"Content-Type": "application/json", "Origin": self.url}, 201),
        ]:
            self.assertEqual(self.call(data=data, headers=headers)[0], expected)
        for data, status in [(b"{", 400), (b"[]", 400), (b"x" * 4097, 413), (b"", 413)]:
            self.assertEqual(self.call(data=data)[0], status)
        self.assertEqual(self.call("/api/unknown", data=b"{}")[0], 404)
        _, error = self.call(data=json.dumps({**request(), "region": "tahiti"}).encode())
        self.assertIn("Europe only", error["error"])

    def test_failed_creation_and_corrupt_lookup_report_errors_not_success(self):
        data = json.dumps(request()).encode()
        with patch("journeys.load_config", side_effect=OSError("Unreadable configuration")), \
                self.assertLogs(level="ERROR"):
            self.assertEqual(self.call(data=data)[0], 500)
        _, record = self.call(data=data)
        journey_id = record["state"]["serverJourney"]["id"]
        with JourneyStore(self.store, atomic_write).connect() as db:
            db.execute("UPDATE journeys SET payload = '{}'")
        with self.assertLogs(level="ERROR"):
            self.assertEqual(self.call("/api/journeys/" + journey_id)[0], 500)
            self.assertEqual(self.call(data=data)[0], 500)


if __name__ == "__main__":
    unittest.main()
