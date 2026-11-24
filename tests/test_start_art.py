from datetime import date, datetime, timezone
from http.server import ThreadingHTTPServer
import io
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import threading
import unittest
from unittest.mock import Mock, patch
import urllib.error
import urllib.request

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from content_factory import IMAGE_MODEL, WorkshopError
from start_art import StartArt, PARIS, art_brief, main
from asset_storage import AssetError, AssetNotFound, configured_storage, local_storage
from travel_server import ChunkJobs, ChunkStore, make_handler
from durable_jobs import DurableJobs


def fixture_image():
    stream = io.BytesIO()
    Image.new("RGB", (1024, 1024), "navy").save(stream, "PNG")
    return stream.getvalue()


class StartArtTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.cache = Path(temporary.name)
        self.art = StartArt(self.cache / "start-art.sqlite3")
        self.day = date(2026, 10, 19)
        self.writer = Mock(return_value=fixture_image())
        DurableJobs(local_storage(self.cache / "assets").catalogue).configure_quota(
            "images", daily=None, monthly=None)

    def test_single_shared_daily_image_is_normalized_private_and_durable(self):
        self.assertEqual(self.art.snapshot(), {"version": 1, "image": None, "lastAttempt": None})
        result = self.art.generate(self.day, self.writer)
        self.assertEqual(result["image"]["day"], self.day.isoformat())
        self.assertEqual(result["image"]["model"], IMAGE_MODEL)
        raw = self.art.image(self.day.isoformat())
        with Image.open(io.BytesIO(raw)) as image:
            self.assertEqual(image.format, "WEBP")
            self.assertEqual(image.size, (1024, 1024))
        reopened = StartArt(self.art.path)
        self.assertEqual(reopened.generate(self.day, self.writer), result)
        self.assertEqual(reopened.image(self.day.isoformat()), raw)
        self.writer.assert_called_once_with(art_brief(self.day))
        self.assertEqual(self.art.path.stat().st_mode & 0o777, 0o600)

    def test_external_assets_and_jobs_are_shared_without_local_attempt_database(self):
        assets = local_storage(self.cache / "assets")
        art = StartArt(self.cache / "external.sqlite3", assets=assets)
        art.generate(self.day, self.writer)
        self.assertFalse(art.path.exists())
        record, raw = assets.read("title-art", self.day.isoformat())
        self.assertEqual(record.retention, "durable")
        self.assertEqual(record.media_type, "image/webp")
        other = StartArt(self.cache / "another-vm" / "attempts.sqlite3", assets=local_storage(self.cache / "assets"))
        self.assertEqual(other.image(self.day.isoformat()), raw)
        self.assertEqual(other.generate(self.day, self.writer), art.snapshot())
        self.assertFalse(other.path.parent.exists())
        self.writer.assert_called_once()
        (assets.blobs.root / record.key).write_bytes(b"corrupt")
        with self.assertRaisesRegex(AssetError, "integrity"):
            art.image(self.day.isoformat())

    def test_shared_reservation_blocks_second_producer_and_survives_reopening(self):
        assets = local_storage(self.cache / "assets")
        art = StartArt(self.cache / "vm-one" / "attempts.sqlite3", assets=assets)
        art.generate(self.day, self.writer)
        tomorrow = date(2026, 10, 20)
        other = StartArt(self.cache / "vm-two" / "attempts.sqlite3",
                         assets=local_storage(self.cache / "assets"))
        def writer(brief):
            self.assertEqual(other.snapshot()["lastAttempt"], {"day": str(tomorrow), "status": "running"})
            self.assertEqual(other.snapshot()["image"]["day"], str(self.day))
            self.assertIsNone(other.image(str(tomorrow)))
            with self.assertRaisesRegex(WorkshopError, "running"):
                other.generate(tomorrow, self.writer)
            return fixture_image()
        art.generate(tomorrow, writer)
        self.assertEqual(other.snapshot(), art.snapshot())
        self.writer.assert_called_once()
        self.assertFalse(art.path.exists())
        self.assertFalse(other.path.exists())

    def test_shared_catalogue_failure_does_not_call_provider_or_fall_back_to_sqlite(self):
        assets = local_storage(self.cache / "assets")
        art = StartArt(self.cache / "vm" / "attempts.sqlite3", assets=assets)
        with patch.object(assets.catalogue, "connect", side_effect=sqlite3.OperationalError("unavailable")):
            with self.assertRaises(AssetError):
                art.generate(self.day, self.writer)
            with self.assertRaises(AssetError):
                art.snapshot()
        self.writer.assert_not_called()
        self.assertFalse(art.path.parent.exists())

    def test_recovery_only_finishes_verified_publication_without_regeneration(self):
        assets = local_storage(self.cache / "assets")
        art = StartArt(self.cache / "external.sqlite3", assets=assets)
        with patch.object(art.jobs, "finish", side_effect=AssetError("Lost database connection")):
            with self.assertRaises(AssetError):
                art.generate(self.day, self.writer)
        self.assertEqual(art.snapshot()["lastAttempt"]["status"], "running")
        self.assertIsNone(art.image(str(self.day)))
        with self.assertRaisesRegex(WorkshopError, "no retry"):
            art.generate(self.day, self.writer)
        reopened = StartArt(art.path, assets=local_storage(self.cache / "assets"))
        self.assertEqual(reopened.recover_published(str(self.day))["image"]["day"], str(self.day))
        self.assertEqual(reopened.recover_published(str(self.day)), reopened.snapshot())
        self.writer.assert_called_once()

    def test_missing_or_corrupt_published_image_cannot_be_recovered(self):
        assets = local_storage(self.cache / "assets")
        art = StartArt(self.cache / "external.sqlite3", assets=assets)
        key = str(self.day)
        self.assertTrue(art.jobs.claim("title-art", key, art_brief(self.day), IMAGE_MODEL))
        with self.assertRaises(AssetNotFound):
            art.recover_published(key)
        with self.assertRaisesRegex(WorkshopError, "no retry"):
            art.generate(self.day, self.writer)
        record = assets.publish("title-art", key, b"fixture", media_type="image/webp",
                                retention="durable", provenance={"source": "test", "license": "test", "version": "1"})
        (assets.blobs.root / record.key).write_bytes(b"corrupt")
        with self.assertRaisesRegex(AssetError, "integrity"):
            art.recover_published(key)
        self.assertEqual(art.jobs.status("title-art", key), "running")
        self.writer.assert_not_called()
        with self.assertRaises(ValueError):
            self.art.recover_published(key)
        with self.assertRaises(WorkshopError):
            art.recover_published("2026-10-20")

    def test_cli_recovery_needs_no_provider_token(self):
        with patch.dict("os.environ", {}, clear=True), \
                patch("start_art.StartArt.configured") as configured, \
                patch("start_art.OvhImageWriter") as writer, \
                patch("sys.argv", ["start_art.py", "--recover-published", str(self.day)]):
            self.assertEqual(main(), 0)
            configured.return_value.recover_published.assert_called_once_with(str(self.day))
            writer.assert_not_called()

    def test_leased_recovery_worker_finishes_verified_publication_without_provider(self):
        assets = local_storage(self.cache / "assets")
        art = StartArt(self.cache / "unused.sqlite3", assets=assets)
        with patch.object(art.jobs, "finish", side_effect=AssetError("Lost finalization")):
            with self.assertRaises(AssetError):
                art.generate(self.day, self.writer)
        art.queue_recovery(str(self.day))
        art.queue_recovery(str(self.day))
        self.assertTrue(art.work_recovery())
        self.assertFalse(art.work_recovery())
        self.assertEqual(art.snapshot()["image"]["day"], str(self.day))
        self.writer.assert_called_once()
        art.queue_recovery("2026-10-20")
        with self.assertLogs(level="ERROR"), self.assertRaises(WorkshopError):
            art.work_recovery()
        from durable_jobs import DurableJobs
        self.assertEqual(DurableJobs(assets.catalogue).inspect(
            "title-recovery", "2026-10-20")["status"], "failed")

    def test_recovery_reconciles_both_job_records_after_shared_finish_acknowledgement_loss(self):
        from shared_images import SharedImages

        assets = local_storage(self.cache / "assets")
        art = StartArt(self.cache / "unused.sqlite3", assets=assets)
        original_finish = DurableJobs.finish
        def finish(jobs, job, **kwargs):
            if kwargs.get("error") is None:
                raise AssetError("Lost shared finalization")
            return original_finish(jobs, job, **kwargs)
        with patch.object(DurableJobs, "finish", finish):
            with self.assertLogs(level="ERROR"), self.assertRaises(AssetError):
                art.generate(self.day, self.writer)
        self.assertEqual(art.jobs.status("title-art", str(self.day)), "failed")
        self.assertIsNone(art.image(str(self.day)))
        art.recover_published(str(self.day))
        self.assertEqual(SharedImages(assets).jobs.inspect("image-title-art", str(self.day))["status"], "ready")
        self.assertEqual(art.jobs.status("title-art", str(self.day)), "ready")
        self.writer.assert_called_once()

    def test_concurrent_recovery_is_idempotent(self):
        from concurrent.futures import ThreadPoolExecutor

        assets = local_storage(self.cache / "assets")
        art = StartArt(self.cache / "unused.sqlite3", assets=assets)
        with patch.object(art.jobs, "finish", side_effect=AssetError("Lost finalization")):
            with self.assertRaises(AssetError):
                art.generate(self.day, self.writer)
        barrier = threading.Barrier(2)
        original_read = assets.read
        def read(*args):
            result = original_read(*args)
            barrier.wait(timeout=5)
            return result
        with patch.object(assets, "read", side_effect=read), ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: art.recover_published(str(self.day)), range(2)))
        self.assertEqual(results[0], results[1])
        self.writer.assert_called_once()

    def test_failed_asset_publication_retains_previous_image_and_does_not_retry_provider(self):
        assets = local_storage(self.cache / "assets")
        art = StartArt(self.cache / "external.sqlite3", assets=assets)
        art.generate(self.day, self.writer)
        tomorrow = date(2026, 10, 20)
        with patch.object(assets, "publish", side_effect=AssetError("Storage failed")):
            with self.assertLogs(level="ERROR"), self.assertRaises(AssetError):
                art.generate(tomorrow, self.writer)
        self.assertEqual(art.snapshot()["image"]["day"], self.day.isoformat())
        self.assertEqual(art.snapshot()["lastAttempt"]["status"], "failed")
        self.assertIsNone(art.image(tomorrow.isoformat()))
        with self.assertRaisesRegex(WorkshopError, "no retry"):
            art.generate(tomorrow, self.writer)
        self.assertEqual(self.writer.call_count, 2)

    def test_private_configuration_is_opt_in_and_shared_by_api_and_job(self):
        config = self.cache / "storage.json"
        config.write_text(json.dumps({"backend": "local", "root": str(self.cache / "assets")}))
        config.chmod(0o600)
        with patch.dict("os.environ", {}, clear=True):
            self.assertIsNone(configured_storage())
        with patch.dict("os.environ", {"ARCANE_ASSET_STORAGE_CONFIG_FILE": str(config)}, clear=True):
            art = StartArt.configured(self.cache / "configured.sqlite3")
            art.generate(self.day, self.writer)
            self.assertEqual(StartArt.configured(art.path).image(self.day.isoformat()),
                             art.image(self.day.isoformat()))
            config.chmod(0o644)
            with self.assertRaisesRegex(ValueError, "600"):
                StartArt.configured(art.path)

    def test_failure_retains_previous_image_and_no_same_day_retry(self):
        self.art.generate(self.day, self.writer)
        previous = self.art.image(self.day.isoformat())
        tomorrow = date(2026, 10, 20)
        self.writer.side_effect = WorkshopError("OVH no longer confirms free pricing.", 503)
        with self.assertLogs(level="ERROR"), self.assertRaises(WorkshopError):
            self.art.generate(tomorrow, self.writer)
        result = StartArt(self.art.path).snapshot()
        self.assertEqual(result["image"]["day"], self.day.isoformat())
        self.assertEqual(result["lastAttempt"], {"day": tomorrow.isoformat(), "status": "failed"})
        self.assertEqual(self.art.image(self.day.isoformat()), previous)
        self.assertIsNone(self.art.image(tomorrow.isoformat()))
        with self.assertRaisesRegex(WorkshopError, "no retry"):
            StartArt(self.art.path).generate(tomorrow, self.writer)
        self.assertEqual(self.writer.call_count, 2)
        self.writer.side_effect = None
        next_day = date(2026, 10, 21)
        self.assertEqual(self.art.generate(next_day, self.writer)["image"]["day"], next_day.isoformat())
        self.assertEqual(self.art.image(self.day.isoformat()), previous)

    def test_inflight_generation_does_not_publish_partial_data_or_duplicate_call(self):
        self.art.generate(self.day, self.writer)
        tomorrow = date(2026, 10, 20)
        entered, release = threading.Event(), threading.Event()
        def generate(brief):
            entered.set()
            if not release.wait(5):
                raise WorkshopError("Test provider was not released.")
            return fixture_image()
        self.writer.side_effect = generate
        failures = []
        def run():
            try:
                self.art.generate(tomorrow, self.writer)
            except WorkshopError as error:
                failures.append(error)
        worker = threading.Thread(target=run)
        worker.start()
        try:
            self.assertTrue(entered.wait(5))
            other = StartArt(self.art.path)
            self.assertEqual(other.snapshot()["image"]["day"], self.day.isoformat())
            self.assertEqual(other.snapshot()["lastAttempt"]["status"], "running")
            with self.assertRaisesRegex(WorkshopError, "already attempted"):
                other.generate(tomorrow, self.writer)
            self.assertIsNone(other.image(tomorrow.isoformat()))
        finally:
            release.set()
            worker.join(5)
        self.assertFalse(worker.is_alive())
        self.assertEqual(failures, [])
        self.assertEqual(self.writer.call_count, 2)
        self.assertEqual(self.art.snapshot()["image"]["day"], tomorrow.isoformat())

    def test_interrupted_dispatch_and_corrupt_response_never_replace_ready_image(self):
        self.art.generate(self.day, self.writer)
        tomorrow = date(2026, 10, 20)
        with self.art.connect() as db:
            db.execute("INSERT INTO attempts(day,status,brief,model,created) VALUES(?,?,?,?,?)",
                       (tomorrow.isoformat(), "running", "{}", IMAGE_MODEL, "interrupted"))
        with self.assertRaisesRegex(WorkshopError, "running"):
            StartArt(self.art.path).generate(tomorrow, self.writer)
        self.writer.return_value = b"corrupt image"
        with self.assertLogs(level="ERROR"), self.assertRaises(WorkshopError):
            self.art.generate(date(2026, 10, 21), self.writer)
        self.assertEqual(self.art.snapshot()["image"]["day"], self.day.isoformat())
        self.assertEqual(self.writer.call_count, 2)

    def test_prompts_rotate_landscape_and_all_22_tarot_motifs_without_player_data(self):
        prompts = [art_brief(date.fromordinal(self.day.toordinal() + i)) for i in range(22)]
        self.assertEqual(len({brief["card"] for brief in prompts}), 22)
        self.assertEqual(len({brief["landscape"] for brief in prompts}), 7)
        self.assertEqual(len({brief["prompt"] for brief in prompts}), 22)
        for brief in prompts:
            self.assertEqual(set(brief), {"prompt", "landscape", "card", "version"})
            self.assertIn("imaginary", brief["prompt"])
            self.assertIn("No identifiable people", brief["prompt"])
        self.assertIn("winter", art_brief(date(2026, 12, 1))["prompt"])
        self.assertIn("summer", art_brief(date(2026, 8, 1))["prompt"])

    def test_invalid_dates_and_unknown_schema_are_explicit_errors(self):
        for day in ["2026-1-1", "bad", "2026-02-30", "../private", None]:
            with self.subTest(day=day), self.assertRaises(ValueError):
                self.art.image(day)
        with self.art.connect() as db:
            db.execute("PRAGMA user_version=2")
        with self.assertRaisesRegex(ValueError, "Unsupported"):
            StartArt(self.art.path)

    def test_cli_requires_private_key_and_uses_paris_day_not_utc_day(self):
        with patch.dict("os.environ", {}, clear=True), patch("sys.argv", ["start_art.py"]):
            with self.assertLogs(level="ERROR"):
                self.assertEqual(main(), 1)
        # In both summer and winter, 23:30 UTC already belongs to the next Paris day.
        for month in (1, 7):
            now = datetime(2026, month, 19, 23, 30, tzinfo=timezone.utc)
            with patch.dict("os.environ", {"ARCANE_START_IMAGES_TOKEN_FILE": "private-key"}), \
                    patch("start_art.private_file", return_value="fictional-test-key"), \
                    patch("start_art.OvhImageWriter", return_value=self.writer), \
                    patch("start_art.StartArt") as store, \
                    patch("start_art.datetime") as clock, \
                    patch("sys.argv", ["start_art.py", "--cache", str(self.cache)]):
                clock.now.return_value = now.astimezone(PARIS)
                self.assertEqual(main(), 0)
                clock.now.assert_called_once_with(PARIS)
                store.configured.return_value.generate.assert_called_once_with(
                    date(2026, month, 20), self.writer)

    def test_title_api_is_read_only_and_serves_only_ready_webp(self):
        chunks = ChunkStore(cache=self.cache)
        jobs = ChunkJobs(chunks)
        handler = make_handler(chunks, jobs)
        server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = f"http://127.0.0.1:{server.server_port}"
        def read(path):
            return urllib.request.urlopen(base + path, timeout=5)
        try:
            with read("/api/start-art") as response:
                self.assertIsNone(json.load(response)["image"])
            self.art.generate(self.day, self.writer)
            with read("/api/start-art") as response:
                snapshot = json.load(response)
                self.assertEqual(set(snapshot), {"version", "image", "lastAttempt"})
                self.assertNotIn("prompt", json.dumps(snapshot))
            with read(f"/api/start-art/image?day={self.day}") as response:
                self.assertEqual(response.headers["Content-Type"], "image/webp")
                self.assertEqual(response.headers["Cache-Control"], "no-store")
                self.assertEqual(response.read(), self.art.image(str(self.day)))
            for path, status in [
                ("/api/start-art?prompt=arbitrary", 400),
                ("/api/start-art/image", 400),
                ("/api/start-art/image?day=2026-10-19&day=2026-10-20", 400),
                ("/api/start-art/image?day=2026-02-30", 400),
                ("/api/start-art/image?day=2026-10-20", 404),
                ("/api/start-art/private", 404),
            ]:
                with self.subTest(path=path), self.assertRaises(urllib.error.HTTPError) as error:
                    read(path)
                self.assertEqual(error.exception.code, status)
                error.exception.close()
            request = urllib.request.Request(base + "/api/start-art", data=b"{}", method="POST")
            with self.assertRaises(urllib.error.HTTPError) as error:
                urllib.request.urlopen(request, timeout=5)
            self.assertEqual(error.exception.code, 404)
            error.exception.close()
            self.writer.assert_called_once()
        finally:
            server.shutdown()
            server.server_close()
            thread.join(5)
            handler.journal_art.close()
            handler.live_narrative.close()
            jobs.pool.shutdown()

    def test_title_api_reads_configured_assets_and_reports_integrity_failure(self):
        config = self.cache / "storage.json"
        config.write_text(json.dumps({"backend": "local", "root": str(self.cache / "assets")}))
        config.chmod(0o600)
        with patch.dict("os.environ", {"ARCANE_ASSET_STORAGE_CONFIG_FILE": str(config)}):
            art = StartArt.configured(self.cache / "another-vm" / "attempts.sqlite3")
            art.generate(self.day, self.writer)
            chunks = ChunkStore(cache=self.cache)
            jobs = ChunkJobs(chunks)
            handler = make_handler(chunks, jobs)
        server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        url = f"http://127.0.0.1:{server.server_port}/api/start-art/image?day={self.day}"
        try:
            with urllib.request.urlopen(url.split("/image?")[0], timeout=5) as response:
                self.assertEqual(json.load(response), art.snapshot())
            with urllib.request.urlopen(url, timeout=5) as response:
                self.assertEqual(response.headers["Content-Type"], "image/webp")
                self.assertEqual(response.read(), art.image(str(self.day)))
            record, _ = art.assets.read("title-art", self.day.isoformat())
            (art.assets.blobs.root / record.key).write_bytes(b"corrupt")
            with self.assertLogs(level="ERROR"), self.assertRaises(urllib.error.HTTPError) as error:
                urllib.request.urlopen(url, timeout=5)
            self.assertEqual(error.exception.code, 503)
            payload = json.load(error.exception)
            error.exception.close()
            self.assertEqual(payload, {"error": "Asset storage unavailable; check server logs."})
            with art.assets.catalogue.connection() as db:
                db.execute("DROP TABLE generation_jobs")
            with self.assertLogs(level="ERROR"), self.assertRaises(urllib.error.HTTPError) as error:
                urllib.request.urlopen(url.split("/image?")[0], timeout=5)
            self.assertEqual(error.exception.code, 503)
            self.assertEqual(json.load(error.exception), {"error": "Asset storage unavailable; check server logs."})
            error.exception.close()
            self.assertFalse(art.path.parent.exists())
            self.writer.assert_called_once()
        finally:
            server.shutdown()
            server.server_close()
            thread.join(5)
            handler.journal_art.close()
            handler.live_narrative.close()
            jobs.pool.shutdown()
