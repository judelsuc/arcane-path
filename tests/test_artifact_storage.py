import copy
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
import uuid
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from abandoned_journals import AbandonedJournals, JournalForbidden
from asset_storage import AssetError, local_storage
from journeys import JourneyCapacity, JourneyConflict, JourneyRequest, JourneyStore
from lore_playtest import LorePlaytest
from main_artifacts import MainArtifacts, WORLD
from travel_server import ChunkJobs, ChunkStore, atomic_write, make_handler


class ArtifactStorageTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.assets = local_storage(self.root / "assets")
        self.first = JourneyStore(ChunkStore(cache=self.root / "one"), atomic_write, assets=self.assets)
        self.second = JourneyStore(ChunkStore(cache=self.root / "two"), atomic_write,
                                   assets=local_storage(self.root / "assets"))
        self.books = AbandonedJournals(self.first)
        self.other_books = AbandonedJournals(self.second)
        self.now = 10_000_000
        self.api = MainArtifacts(self.first, self.books, clock=lambda: self.now)
        self.other = MainArtifacts(self.second, self.other_books, clock=lambda: self.now)
        self.record, self.journey, self.token = self.source()
        self.state = copy.deepcopy(self.record["state"])

    def source(self):
        with patch("journeys.datetime", wraps=datetime) as clock:
            clock.now.return_value = datetime(2026, 10, 19, 12, tzinfo=timezone.utc)
            record, _ = self.first.create({"requestId": str(uuid.uuid4()), "region": "firmi", "name": "Alex"})
        identity = record["state"]["serverJourney"]["id"]
        token = uuid.uuid4().hex + uuid.uuid4().hex
        self.books.bind(identity, token)
        return record, identity, token

    def body(self, action=None, state=None, journey=None):
        return {"journey": journey or self.journey, "requestId": str(uuid.uuid4()),
                "state": copy.deepcopy(self.state if state is None else state), "action": action}

    def act(self, action=None):
        body = self.body(action)
        result = self.api.request(body, self.token)
        self.state = result["state"]
        return result, body

    def world(self):
        with self.other.connect() as db:
            return self.other.decode(db.execute("SELECT * FROM main_artifact_world WHERE id=?", (WORLD,)).fetchone())

    def test_cross_vm_receipt_replay_cannot_double_cost_or_conflict(self):
        result, body = self.act({"type": "inquire", "id": "hermit"})
        self.assertEqual(self.other.request(body, self.token), result)
        result, body = self.act({"type": "claim", "id": "hermit"})
        with ThreadPoolExecutor(max_workers=4) as pool:
            replays = list(pool.map(lambda _: self.other.request(body, self.token), range(8)))
        self.assertTrue(all(replay == result for replay in replays))
        self.assertEqual([item["id"] for item in result["owned"]], ["hermit"])
        self.assertEqual(result["state"]["lore"]["carriedGrams"], 15)
        with self.assertRaises(JourneyConflict):
            self.other.request({**body, "action": None}, self.token)
        with self.other.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM main_artifact_receipts").fetchone()[0], 2)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM main_artifact_sessions").fetchone()[0], 1)
        for path in (self.api.path, self.other.path, self.first.path, self.second.path):
            self.assertFalse(path.exists())

    def test_concurrent_claims_have_single_owner_and_receipt(self):
        self.act({"type": "inquire", "id": "hermit"})
        record, identity, token = self.source()
        view = self.other.request(self.body({"type": "inquire", "id": "hermit"},
                                           state=record["state"], journey=identity), token)
        inputs = [(self.api, self.body({"type": "claim", "id": "hermit"}), self.token),
                  (self.other, self.body({"type": "claim", "id": "hermit"}, state=view["state"],
                                         journey=identity), token)]
        def claim(args):
            api, body, capability = args
            try:
                return api.request(body, capability)
            except JourneyRequest as error:
                self.assertIn("unavailable", str(error))
                return None
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(claim, inputs))
        self.assertEqual(sum(result is not None for result in results), 1)
        owner = next(item for item in self.world()["instances"] if item["id"] == "hermit")["owner"]
        self.assertIn(owner, (self.journey, identity))
        with self.other.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM main_artifact_receipts").fetchone()[0], 3)

    def test_late_receipt_failure_rolls_back_world_and_session_and_allows_exact_retry(self):
        self.act({"type": "inquire", "id": "hermit"})
        before = self.world()
        body = self.body({"type": "claim", "id": "hermit"})
        with self.assets.catalogue.connection() as db:
            db.execute("CREATE TRIGGER reject_receipt BEFORE INSERT ON main_artifact_receipts "
                       "BEGIN SELECT RAISE(ABORT, 'Fixture receipt unavailable'); END")
        with self.assertRaises(AssetError):
            self.api.request(body, self.token)
        self.assertEqual(self.world(), before)
        with self.assets.catalogue.connection() as db:
            db.execute("DROP TRIGGER reject_receipt")
        view = self.other.request(body, self.token)
        self.assertEqual([item["id"] for item in view["owned"]], ["hermit"])
        self.assertEqual(self.api.request(body, self.token), view)

    def test_terminal_sessions_release_custody_and_remain_replayable(self):
        self.act({"type": "inquire", "id": "hermit"})
        self.act({"type": "claim", "id": "hermit"})
        self.state.update(ended="health", health=0)
        view, body = self.act()
        self.assertEqual(view["owned"], [])
        self.assertIsNone(next(item for item in self.world()["instances"] if item["id"] == "hermit")["owner"])
        self.assertEqual(self.other.request(body, self.token), view)

    def test_power_cache_and_transfer_use_one_shared_physical_object(self):
        self.act({"type": "inquire", "id": "hermit"})
        self.act({"type": "claim", "id": "hermit"})
        self.act({"type": "use", "id": "hermit", "target": "chariot"})
        self.assertTrue(any(entry["targetId"] == "chariot" and entry["precision"] == "local"
                            for entry in self.state["discovery"]["entries"]))
        anchor = next(item for item in self.world()["instances"] if item["id"] == "hermit")
        self.state.update(col=anchor["col"], row=anchor["row"])
        view, body = self.act({"type": "cache", "id": "hermit"})
        self.assertEqual(view["owned"], [])
        self.assertEqual(self.other.request(body, self.token), view)
        record, identity, token = self.source()
        state = copy.deepcopy(record["state"])
        state.update(col=anchor["col"], row=anchor["row"])
        for action in ({"type": "inquire", "id": "hermit"}, {"type": "claim", "id": "hermit"}):
            view = self.other.request(self.body(action, state=state, journey=identity), token)
            state = view["state"]
        self.assertEqual([item["id"] for item in view["owned"]], ["hermit"])
        self.assertGreater(view["owned"][0]["cooldownUntil"], 0)
        self.assertEqual(len(self.world()["instances"]), 22)
        self.assertEqual(next(item for item in self.world()["instances"] if item["id"] == "hermit")["owner"],
                         identity)

    def test_stale_session_release_is_shared_and_genesis_is_unchanged(self):
        self.act({"type": "inquire", "id": "hermit"})
        self.act({"type": "claim", "id": "hermit"})
        self.now += 30 * 86400
        record, identity, token = self.source()
        self.other.request(self.body(state=record["state"], journey=identity), token)
        instance = next(item for item in self.world()["instances"] if item["id"] == "hermit")
        self.assertIsNone(instance["owner"])
        self.assertEqual(instance["recallJourney"], self.journey)
        self.assertEqual(self.second.read(self.journey), self.record)

    def test_capacity_authorization_corruption_and_prototype_isolation(self):
        body = self.body()
        with self.assertRaises(JournalForbidden):
            self.other.request(body, "f" * 64)
        with patch("main_artifacts.MAX_RECEIPTS", 0), self.assertRaises(JourneyCapacity):
            self.api.request(body, self.token)
        with self.other.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM main_artifact_world").fetchone()[0], 0)
        result = self.api.request(body, self.token)
        with patch("main_artifacts.MAX_RECEIPTS", 0):
            self.assertEqual(self.other.request(body, self.token), result)
        self.first.path.parent.mkdir(parents=True, exist_ok=True)
        prototype = LorePlaytest(self.first, self.books)
        with prototype.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM world").fetchone()[0], 0)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM receipts").fetchone()[0], 0)
        with self.other.connect() as db:
            db.execute("UPDATE main_artifact_world SET payload='{}'")
        with self.assertRaisesRegex(ValueError, "Corrupt"):
            self.other.request(self.body(), self.token)
        self.assertFalse(self.api.path.exists())

    def test_http_receipts_and_storage_failure_are_shared_and_sanitized(self):
        config = self.root / "private.json"
        config.write_text(json.dumps({"backend": "local", "root": str(self.root / "assets")}))
        config.chmod(0o600)
        jobs = ChunkJobs(self.second.chunks)
        with patch.dict("os.environ", {"ARCANE_ASSET_STORAGE_CONFIG_FILE": str(config)}):
            handler = make_handler(self.second.chunks, jobs)
        server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        view, body = self.act({"type": "inquire", "id": "hermit"})
        def post(body, token=self.token):
            return urllib.request.urlopen(urllib.request.Request(
                f"http://127.0.0.1:{server.server_port}/api/artifacts",
                data=json.dumps(body).encode(), headers={
                    "Content-Type": "application/json", "X-Journal-Capability": token}), timeout=10)
        try:
            with post(body) as response:
                self.assertEqual(json.load(response), view)
            with self.assertRaises(urllib.error.HTTPError) as error:
                post(body, token="f" * 64)
            self.assertEqual(error.exception.code, 403)
            error.exception.close()
            with self.assertRaises(urllib.error.HTTPError) as error:
                post({**body, "action": None})
            self.assertEqual(error.exception.code, 409)
            error.exception.close()
            with self.assets.catalogue.connection() as db:
                db.execute("DROP TABLE main_artifact_receipts")
            with self.assertLogs(level="ERROR"), self.assertRaises(urllib.error.HTTPError) as error:
                post(body)
            self.assertEqual(error.exception.code, 503)
            self.assertEqual(json.load(error.exception),
                             {"error": "Asset storage unavailable; check server logs."})
            error.exception.close()
            self.assertFalse(self.api.path.exists())
            self.assertFalse(self.other.path.exists())
        finally:
            server.shutdown()
            server.server_close()
            thread.join(5)
            handler.journal_art.close()
            handler.live_narrative.close()
            jobs.pool.shutdown(wait=True)
