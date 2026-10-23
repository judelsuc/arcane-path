from concurrent.futures import ThreadPoolExecutor
import io
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import Mock

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from asset_storage import AssetConflict, AssetError, local_storage
from durable_jobs import DurableJobs
from journal_art import JournalArt, art_prompt
from journal_storage import JournalStorage
from journeys import JourneyCapacity, JourneyRequest


class JournalStorageTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.assets = local_storage(self.root / "assets")
        DurableJobs(self.assets.catalogue).configure_quota("images", daily=None, monthly=None)
        self.queue = JournalStorage(self.assets)
        self.brief = {"key": "cover", "birth": "fool", "daily": "moon",
                      "scenes": ["forest"], "activities": [], "partial": False}
        image = io.BytesIO()
        Image.new("RGB", (1024, 1024), "navy").save(image, "PNG")
        self.writer = Mock(return_value=image.getvalue())

    def enqueue(self, owner="owner", **limits):
        self.queue.enqueue(owner, self.brief, **{"per_owner": 366, "total_limit": 1000, **limits})

    def expire(self):
        with self.assets.catalogue.connection() as db:
            db.execute("UPDATE journal_illustrations SET expires=0")

    def service(self, name, writer=None):
        journeys = Mock()
        journeys.path = self.root / name / "journeys.sqlite3"
        art = JournalArt(journeys, Mock(), writer, assets=self.assets)
        self.addCleanup(art.close)
        return art

    def test_queue_is_idempotent_shared_and_has_global_capacity(self):
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(lambda _: self.enqueue(), range(8)))
        self.assertEqual(len(self.queue.entries("owner")), 1)
        self.queue.enqueue("owner", {**self.brief, "daily": "sun"}, per_owner=1, total_limit=1)
        self.assertEqual(len(self.queue.entries("owner")), 1)
        with self.assertRaises(JourneyCapacity):
            self.enqueue("other", total_limit=1)
        with self.assertRaises(JourneyCapacity):
            self.queue.enqueue("owner", {**self.brief, "key": "2026-10-23"}, per_owner=1, total_limit=1000)
        with self.assertRaises(JourneyCapacity):
            self.enqueue("other", queue_limit=1)

    def test_acquire_and_stale_worker_fencing(self):
        self.enqueue()
        with ThreadPoolExecutor(max_workers=4) as pool:
            claims = list(pool.map(lambda _: self.queue.acquire(), range(8)))
        self.assertEqual(sum(job is not None for job in claims), 1)
        first = next(job for job in claims if job)
        self.expire()
        second = JournalStorage(local_storage(self.root / "assets")).acquire()
        self.assertNotEqual(first["token"], second["token"])
        with self.assertRaises(AssetConflict):
            self.queue.finish(first, 1)
        self.queue.finish(second, 1, error="Known failure")
        self.assertIsNone(self.queue.acquire())
        self.assertEqual(self.queue.entries("owner")[0]["status"], "failed")

    def test_worker_drains_other_vm_queue_and_image_is_scoped_without_local_database(self):
        self.enqueue()
        art = self.service("worker", self.writer)
        art.future.result(timeout=10)
        reader = self.service("reader")
        self.assertEqual(reader.shared.entries("owner")[0]["status"], "ready")
        self.assertTrue(reader.shared.image("owner", "cover"))
        with self.assertRaises(JourneyRequest):
            reader.shared.image("other", "cover")
        self.assertFalse(art.path.parent.exists())
        self.assertFalse(reader.path.parent.exists())
        with self.assertRaises(AssetError):
            with reader.connect():
                pass
        self.writer.assert_called_once()

    def test_second_service_does_not_fail_or_duplicate_active_generation(self):
        self.enqueue()
        entered, release = threading.Event(), threading.Event()
        raw = self.writer.return_value
        def writer(brief):
            entered.set()
            if not release.wait(5):
                raise AssetError("Test provider was not released.")
            return raw
        self.writer.side_effect = writer
        art = self.service("first", self.writer)
        try:
            self.assertTrue(entered.wait(5))
            other = self.service("second", self.writer)
            other.future.result(timeout=5)
            self.assertEqual(other.shared.entries("owner")[0]["status"], "running")
        finally:
            release.set()
        art.future.result(timeout=5)
        self.assertEqual(other.shared.entries("owner")[0]["status"], "ready")
        self.writer.assert_called_once()

    def test_interruption_after_asset_publication_recovers_without_provider_call(self):
        self.enqueue()
        job = self.queue.acquire()
        self.queue.generate(job, self.writer, art_prompt(job["brief"]))
        self.expire()
        art = self.service("restarted", self.writer)
        art.future.result(timeout=10)
        self.assertEqual(art.shared.entries("owner")[0]["status"], "ready")
        self.writer.assert_called_once()

    def test_expired_pre_dispatch_work_can_be_resumed_without_local_state(self):
        self.enqueue()
        first = self.queue.acquire()
        self.expire()
        art = self.service("restarted", self.writer)
        art.future.result(timeout=10)
        self.assertEqual(art.shared.entries("owner")[0]["status"], "ready")
        with self.assertRaises(AssetConflict):
            self.queue.finish(first, 1)
        self.writer.assert_called_once()

    def test_interrupted_dispatch_is_failed_explicitly_without_repeating_call(self):
        self.enqueue()
        job = self.queue.acquire()
        request = self.queue.request_id(job["owner"], job["key"])
        jobs = DurableJobs(self.assets.catalogue)
        from content_factory import IMAGE_MODEL
        jobs.enqueue("image-journal-art", request,
                     {"brief": art_prompt(job["brief"]), "model": IMAGE_MODEL, "version": "1"},
                     provider="images")
        provider_job = jobs.acquire("image-journal-art")
        jobs.dispatch(provider_job)
        with self.assets.catalogue.connection() as db:
            db.execute("UPDATE worker_jobs SET expires=0")
        self.expire()
        with self.assertLogs(level="WARNING"):
            art = self.service("restarted", self.writer)
            art.future.result(timeout=10)
        entry = art.shared.entries("owner")[0]
        self.assertEqual(entry["status"], "failed")
        self.assertIn("no retry", entry["error"])
        self.writer.assert_not_called()

    def test_corruption_and_database_failure_do_not_return_success(self):
        self.enqueue()
        art = self.service("worker", self.writer)
        art.future.result(timeout=10)
        record, _ = self.assets.read("journal-art", self.queue.request_id("owner", "cover"))
        (self.assets.blobs.root / record.key).write_bytes(b"corrupt")
        with self.assertRaisesRegex(AssetError, "integrity"):
            art.shared.image("owner", "cover")
        with self.assets.catalogue.connection() as db:
            db.execute("DROP TABLE journal_illustrations")
        with self.assertRaises(AssetError):
            art.shared.entries("owner")
        self.assertFalse(art.path.parent.exists())
