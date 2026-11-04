from concurrent.futures import ThreadPoolExecutor
import json
from http.server import ThreadingHTTPServer
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
from abandoned_journals import AbandonedJournals, JournalForbidden, LEASE_SECONDS
from asset_storage import AssetError, local_storage
from journal_art import JournalArt
from journeys import JourneyCapacity, JourneyConflict, JourneyStore
from travel_server import ChunkJobs, ChunkStore, atomic_write, make_handler


class SharedJourneyTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.assets = local_storage(self.root / "assets")
        self.first = JourneyStore(ChunkStore(cache=self.root / "first"), atomic_write, assets=self.assets)
        self.second = JourneyStore(ChunkStore(cache=self.root / "second"), atomic_write,
                                   assets=local_storage(self.root / "assets"))
        self.now = 1_000_000
        self.books = AbandonedJournals(self.first, clock=lambda: self.now)
        self.other = AbandonedJournals(self.second, clock=lambda: self.now)

    def create(self, name="Alex"):
        record, _ = self.first.create({"requestId": str(uuid.uuid4()), "region": "firmi", "name": name})
        identity = record["state"]["serverJourney"]["id"]
        token = uuid.uuid4().hex + uuid.uuid4().hex
        self.books.bind(identity, token)
        return record, identity, token

    def call(self, identity, token, store=None, **extra):
        return (store or self.books).request({"journey": identity, "col": 10, "row": 10, **extra}, token)

    def test_concurrent_creation_is_global_idempotent_and_never_uses_local_databases(self):
        request = {"requestId": str(uuid.uuid4()), "region": "firmi", "name": "Alex"}
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(lambda i: (self.first if i % 2 else self.second).create(request), range(8)))
        self.assertEqual(sum(created for _, created in results), 1)
        self.assertTrue(all(record == results[0][0] for record, _ in results))
        record = results[0][0]
        self.assertEqual(self.second.read(record["state"]["serverJourney"]["id"]), record)
        with self.assertRaises(JourneyConflict):
            self.second.create({**request, "name": "Other"})
        with patch("journeys.MAX_JOURNEYS", 1):
            with self.assertRaises(JourneyCapacity):
                self.create("Full")
            self.assertEqual(self.second.create(request), (record, False))
        for path in (self.first.path, self.second.path, self.books.path, self.other.path):
            self.assertFalse(path.exists())

    def test_capability_binding_race_is_exclusive_and_cross_vm_authorization_works(self):
        record, identity, token = self.create()
        def bind(other_token):
            try:
                self.other.bind(identity, other_token)
                return True
            except JournalForbidden:
                return False
        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(list(pool.map(bind, (token, "f" * 64))), [True, False])
        art = JournalArt(self.second, self.other, assets=self.assets)
        self.addCleanup(art.close)
        self.assertEqual(art.authorize({"journey": identity}, token), (identity, record))
        with self.assertRaises(JournalForbidden):
            art.authorize({"journey": identity}, "f" * 64)

    def test_keeper_registration_is_transactional_and_shared(self):
        record, identity, token = self.create()
        keeper = uuid.uuid4().hex
        self.call(identity, token, action="register", keeper=keeper)
        art = JournalArt(self.second, self.other, assets=self.assets)
        self.addCleanup(art.close)
        self.assertEqual(art.authorize({"journey": identity, "keeper": keeper}, token), (keeper, record))
        _, other_id, _ = self.create("Other")
        with self.assertRaises(JournalForbidden):
            self.call(other_id, "b" * 64, store=self.other, action="register", keeper=keeper)
        with self.other.connect() as db:
            self.assertEqual(db.execute("SELECT genesis FROM keepers WHERE id=?", (keeper,)).fetchone()[0], identity)

    def test_abandoned_publication_claim_race_and_expiry_are_shared(self):
        record, identity, token = self.create()
        self.call(identity, token, action="publish", index=0, notebook=[], clues=["A shared clue"])
        finders = [self.create(name) for name in ("One", "Two")]
        def claim(finder):
            try:
                self.call(finder[1], finder[2], store=self.other, action="claim", journal=identity)
                return True
            except JourneyConflict:
                return False
        with ThreadPoolExecutor(max_workers=2) as pool:
            winners = list(pool.map(claim, finders))
        self.assertEqual(sum(winners), 1)
        winner = finders[winners.index(True)]
        self.assertEqual(self.call(winner[1], winner[2], store=self.other, action="read", journal=identity),
                         {"notebook": {"photos": [], "clues": ["A shared clue"]}})
        loser = finders[winners.index(False)]
        with self.assertRaises(JourneyConflict):
            self.call(loser[1], loser[2], action="read", journal=identity)
        self.now += LEASE_SECONDS
        self.assertTrue(claim(loser))
        self.assertEqual(self.second.read(identity), record)
        with self.assertRaises(JourneyConflict):
            self.call(identity, token)

    def test_earned_rumour_order_and_mapping_row_contract_are_portable(self):
        _, identity, token = self.create()
        self.call(identity, token, ended="hunger", index=0)
        finder, finder_id, finder_token = self.create("Finder")
        with self.books.connect() as db:
            row = db.execute("SELECT * FROM journals WHERE id=?", (identity,)).fetchone()
            observation = self.books.indication(row, self.books.position(finder, 10, 10), "town:fixture", 0)
            db.execute("INSERT INTO rumours(finder,evidence,journal,observation) VALUES(?,?,?,?)",
                       (finder_id, "town:fixture", identity, json.dumps(observation)))
        result = self.call(finder_id, finder_token, store=self.other)
        self.assertEqual(result["rumours"][0]["id"], identity)
        self.assertEqual(result["nearby"][0]["id"], identity)

    def test_generation_failure_and_corruption_are_explicit_without_fallback(self):
        with patch.object(self.first.trails, "build", side_effect=ValueError("No towns")):
            with self.assertLogs(level="WARNING"), self.assertRaises(ValueError):
                self.create()
        with self.assets.catalogue.connection() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM journeys").fetchone()[0], 0)
        _, identity, _ = self.create()
        with self.assets.catalogue.connection() as db:
            db.execute("UPDATE journeys SET payload='{}'")
        with self.assertRaisesRegex(ValueError, "Corrupt"):
            self.second.read(identity)
        with self.assets.catalogue.connection() as db:
            db.execute("DROP TABLE capabilities")
        with self.assertRaises(AssetError):
            self.other.bind(identity, "a" * 64)
        self.assertFalse(self.other.path.exists())

    def test_factory_uses_configured_shared_storage(self):
        with patch("journeys.configured_storage", return_value=self.assets):
            store = JourneyStore.configured(self.second.chunks, atomic_write)
        self.assertIs(store.assets, self.assets)

    def test_http_handler_reuses_one_catalogue_for_all_configured_services(self):
        jobs = ChunkJobs(self.first.chunks)
        self.addCleanup(jobs.pool.shutdown, wait=True)
        with patch("journeys.configured_storage", return_value=self.assets) as configured, \
                patch("journal_art.configured_storage") as journal_storage, \
                patch("encounter_art.configured_storage") as encounter_storage, \
                patch("start_art.configured_storage") as title_storage:
            handler = make_handler(self.first.chunks, jobs)
        self.addCleanup(handler.journal_art.close)
        self.addCleanup(handler.live_narrative.close)
        self.addCleanup(handler.quest_destinations.close)
        self.addCleanup(handler.living_world.pool.shutdown, wait=True)
        self.assertIs(handler.journal_art.assets, self.assets)
        self.assertIs(handler.encounter_art.assets, self.assets)
        self.assertIs(handler.live_narrative.assets, self.assets)
        self.assertIs(handler.quest_destinations.assets, self.assets)
        configured.assert_called_once()
        journal_storage.assert_not_called()
        encounter_storage.assert_not_called()
        title_storage.assert_not_called()

    def test_two_http_servers_share_creation_and_capabilities_with_sanitized_storage_failures(self):
        config = self.root / "private.json"
        config.write_text(json.dumps({"backend": "local", "root": str(self.root / "assets")}))
        config.chmod(0o600)
        servers = []
        try:
            for store in (self.first, self.second):
                jobs = ChunkJobs(store.chunks)
                with patch.dict("os.environ", {"ARCANE_ASSET_STORAGE_CONFIG_FILE": str(config)}):
                    handler = make_handler(store.chunks, jobs)
                server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
                thread = threading.Thread(target=server.serve_forever, daemon=True)
                thread.start()
                servers.append((server, thread, handler, jobs))
            def post(index, endpoint, body, token):
                return urllib.request.urlopen(urllib.request.Request(
                    f"http://127.0.0.1:{servers[index][0].server_port}/api/" + endpoint,
                    data=json.dumps(body).encode(), headers={
                        "Content-Type": "application/json", "X-Journal-Capability": token}), timeout=10)
            body = {"requestId": str(uuid.uuid4()), "region": "firmi", "name": "Alex"}
            token = "a" * 64
            with post(0, "journeys", body, token) as response:
                self.assertEqual(response.status, 201)
                record = json.load(response)
            with post(1, "journeys", body, token) as response:
                self.assertEqual(response.status, 200)
                self.assertEqual(json.load(response), record)
            identity = record["state"]["serverJourney"]["id"]
            sync = {"journey": identity, "col": 10, "row": 10}
            with post(1, "abandoned-journals", sync, token) as response:
                self.assertEqual(json.load(response)["sidequests"], [])
            with self.assertRaises(urllib.error.HTTPError) as error:
                post(1, "abandoned-journals", sync, "b" * 64)
            self.assertEqual(error.exception.code, 403)
            error.exception.close()
            with self.assets.catalogue.connection() as db:
                db.execute("DROP TABLE capabilities")
            with self.assertLogs(level="ERROR"), self.assertRaises(urllib.error.HTTPError) as error:
                post(1, "abandoned-journals", sync, token)
            self.assertEqual(error.exception.code, 503)
            self.assertEqual(json.load(error.exception),
                             {"error": "Asset storage unavailable; check server logs."})
            error.exception.close()
            for store in (self.first, self.second):
                self.assertFalse(store.path.exists())
                self.assertFalse((store.path.parent / "abandoned-journals.sqlite3").exists())
        finally:
            for server, thread, handler, jobs in servers:
                server.shutdown()
                server.server_close()
                thread.join(5)
                handler.journal_art.close()
                handler.live_narrative.close()
                jobs.pool.shutdown(wait=True)
