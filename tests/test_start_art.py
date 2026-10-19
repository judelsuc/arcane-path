from datetime import date, datetime, timezone
from http.server import ThreadingHTTPServer
import io
import json
from pathlib import Path
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
from travel_server import ChunkJobs, ChunkStore, make_handler


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
                store.return_value.generate.assert_called_once_with(
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
