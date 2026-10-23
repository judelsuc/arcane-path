from concurrent.futures import ThreadPoolExecutor
import io
import json
from http.server import ThreadingHTTPServer
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import Mock, patch

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from asset_storage import AssetError, local_storage
from durable_jobs import DurableJobs
from encounter_art import EncounterArt, WEEK, run_batch
from journeys import JourneyCapacity, JourneyRequest
from travel_server import ChunkJobs, ChunkStore, make_handler


def picture():
    output = io.BytesIO()
    Image.new("RGB", (1024, 1024), "navy").save(output, "PNG")
    return output.getvalue()


class EncounterStorageTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.assets = local_storage(self.root / "assets")
        DurableJobs(self.assets.catalogue).configure_quota("images", daily=None, monthly=None)
        self.auth = Mock()
        self.auth.authorize.side_effect = lambda data, token: (token, {})
        self.art = EncounterArt(self.root / "vm-one" / "art.sqlite3", self.auth, True, assets=self.assets)
        self.other = EncounterArt(self.root / "vm-two" / "art.sqlite3", self.auth, True,
                                  assets=local_storage(self.root / "assets"))
        self.writer = Mock(return_value=picture())
        self.item = {"scene": "event.food", "occurrence": "event:one"}

    def sync(self, art=None, owner="owner", items=None):
        return (art or self.art).request({"journey": "fixture", "operation": "sync",
                                         "items": [self.item] if items is None else items}, owner)

    def image(self, art, identity, owner="owner"):
        return art.request({"journey": "fixture", "operation": "image",
                            "occurrence": "event:one", "image": identity}, owner)

    def test_shared_assignment_image_and_no_vm_database(self):
        self.assertEqual(self.sync()["entries"][0]["status"], "pending")
        identity = self.art.generate("event.food", self.writer, request="a" * 32)
        self.assertEqual(self.sync(self.other)["entries"][0]["id"], identity)
        self.assertEqual(self.image(self.art, identity), self.image(self.other, identity))
        reopened = EncounterArt(self.root / "third" / "unused.sqlite3", self.auth, False, assets=self.assets)
        self.assertEqual(self.sync(reopened)["entries"][0]["id"], identity)
        self.assertFalse(self.sync(reopened)["enabled"])
        with self.assertRaises(JourneyRequest):
            self.image(self.other, identity, owner="other")
        with self.assertRaises(AssetError):
            self.art.connect().__enter__()
        self.assertFalse(self.art.path.parent.exists())
        self.assertFalse(self.other.path.parent.exists())
        self.writer.assert_called_once()

    def test_racing_observers_cannot_claim_same_image_and_replays_are_stable(self):
        identity = self.art.generate("event.food", self.writer)
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda owner: self.sync(self.other, owner), ("one", "two")))
        self.assertEqual(sum(result["entries"][0]["id"] == identity for result in results), 1)
        with ThreadPoolExecutor(max_workers=4) as pool:
            replays = list(pool.map(lambda _: self.sync(self.art, "one"), range(8)))
        self.assertTrue(all(result == replays[0] for result in replays))
        with self.assets.catalogue.connection() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM encounter_assignments").fetchone()[0], 2)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM encounter_stock WHERE claimed=1").fetchone()[0], 1)

    def test_expiration_retains_previous_until_shared_renewal(self):
        with patch("encounter_art.time.time", return_value=100):
            self.sync()
            original = self.art.generate("event.food", self.writer)
        with patch("encounter_art.time.time", return_value=100 + WEEK - 0.001):
            self.assertFalse(self.sync(self.other)["entries"][0]["renewing"])
        with patch("encounter_art.time.time", return_value=100 + WEEK):
            entry = self.sync(self.other)["entries"][0]
            self.assertEqual(entry["id"], original)
            self.assertTrue(entry["renewing"])
            self.assertTrue(self.image(self.other, original))
            renewed = self.other.generate("event.food", self.writer)
            self.assertNotEqual(original, renewed)
            self.assertEqual(self.sync()["entries"][0]["id"], renewed)
            with self.assertRaises(JourneyRequest):
                self.image(self.art, original)

    def test_scene_change_and_partial_batch_roll_back(self):
        self.sync()
        changed = {**self.item, "scene": "event.coins"}
        new = {**self.item, "occurrence": "event:two"}
        with self.assertRaises(JourneyRequest):
            self.sync(self.other, items=[new, changed])
        with self.assets.catalogue.connection() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM encounter_assignments").fetchone()[0], 1)
        self.assertEqual(self.sync(items=[])["entries"], [])

    def test_global_owner_capacity_and_existing_entries_remain_available(self):
        self.sync()
        with self.assets.catalogue.connection() as db:
            db.executemany("INSERT INTO encounter_assignments(owner,occurrence,scene,requested) "
                           "VALUES(?,?,?,?)",
                           [("owner", f"fixture:{i}", "event.food", 0) for i in range(1999)])
        with self.assertRaises(JourneyCapacity):
            self.sync(self.other, items=[{**self.item, "occurrence": "over-limit"}])
        self.assertEqual(self.sync(self.other)["entries"][0]["status"], "pending")

    def test_database_or_corrupt_asset_failure_never_falls_back_locally(self):
        self.sync()
        identity = self.art.generate("event.food", self.writer)
        record, _ = self.assets.read("encounter-art", identity)
        (self.assets.blobs.root / record.key).write_bytes(b"corrupt")
        with self.assertRaisesRegex(AssetError, "integrity"):
            self.image(self.other, identity)
        with self.assets.catalogue.connection() as db:
            db.execute("DROP TABLE encounter_assignments")
        with self.assertRaises(AssetError):
            self.sync(self.other)
        self.assertFalse(self.other.path.parent.exists())
        self.writer.assert_called_once()

    def test_publication_interruption_recovers_without_provider_and_batch_uses_no_local_disk(self):
        with patch.object(self.art.shared, "publish", side_effect=AssetError("Lost SQL")):
            with self.assertRaises(AssetError):
                self.art.generate("event.food", self.writer, request="b" * 32)
        self.other.generate("event.food", self.writer, request="b" * 32)
        self.writer.assert_called_once()
        clock = [0]
        with patch("encounter_art.shutil.disk_usage", side_effect=AssertionError("No local stock")):
            result = run_batch(self.art, self.writer, hours=1 / 3600, interval=1,
                               clock=lambda: clock[0], sleep=lambda seconds: clock.__setitem__(0, 1))
        self.assertEqual(result, 1)
        self.assertFalse(self.art.path.parent.exists())

    def test_batch_prunes_metadata_not_durable_assets_and_preserves_claimed_stock(self):
        unclaimed = self.art.generate("event.food", self.writer, now=0)
        self.art.shared.sync("owner", [self.item], 1)
        unused = self.art.generate("event.coins", self.writer, now=0)
        stored, scene, counts = self.art.shared.batch_state(WEEK + 1)
        self.assertGreater(stored, 0)
        self.assertEqual(scene, "event.food")
        self.assertEqual(counts, {})
        self.assertEqual(self.art.shared.previous(unclaimed), "event.food")
        self.assertIsNone(self.art.shared.previous(unused))
        self.assertTrue(self.assets.read("encounter-art", unused)[1])

    def test_http_shared_image_is_private_and_storage_errors_are_sanitized(self):
        import urllib.error
        import urllib.request

        chunks = ChunkStore(cache=self.root / "http")
        jobs = ChunkJobs(chunks)
        with patch("travel_server.EncounterArt.configured", return_value=self.other):
            handler = make_handler(chunks, jobs)
        server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.sync(owner="a" * 64)
        identity = self.art.generate("event.food", self.writer)
        url = f"http://127.0.0.1:{server.server_port}/api/encounter-art"
        body = json.dumps({"journey": "fixture", "operation": "image",
                           "occurrence": "event:one", "image": identity}).encode()
        def post():
            return urllib.request.urlopen(urllib.request.Request(
                url, data=body, headers={"Content-Type": "application/json",
                                        "X-Journal-Capability": "a" * 64}), timeout=5)
        try:
            with post() as response:
                self.assertEqual(response.headers["Content-Type"], "image/webp")
                self.assertEqual(response.headers["Cache-Control"], "private, no-store")
                self.assertEqual(response.read(), self.image(self.art, identity, "a" * 64))
            record, _ = self.assets.read("encounter-art", identity)
            (self.assets.blobs.root / record.key).write_bytes(b"corrupt")
            with self.assertLogs(level="ERROR"), self.assertRaises(urllib.error.HTTPError) as error:
                post()
            self.assertEqual(error.exception.code, 503)
            self.assertEqual(json.load(error.exception),
                             {"error": "Asset storage unavailable; check server logs."})
            error.exception.close()
        finally:
            server.shutdown()
            server.server_close()
            thread.join(5)
            handler.journal_art.close()
            handler.live_narrative.close()
            jobs.pool.shutdown()
