import io
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import threading
import unittest
from unittest.mock import MagicMock, Mock
import uuid
from datetime import datetime, timezone
from http.server import ThreadingHTTPServer
import urllib.error
import urllib.request
from unittest.mock import patch

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from abandoned_journals import AbandonedJournals, JournalForbidden
from content_factory import IMAGE_MODEL, OvhImageWriter, WorkshopError, normalize_image
from journal_art import JournalArt, art_prompt, validate_brief
from journeys import JourneyStore, JourneyRequest
from travel_server import ChunkStore, ChunkJobs, atomic_write, make_handler


def fixture_image(size=(1024, 1024)):
    data = io.BytesIO()
    Image.new("RGB", size, "navy").save(data, "PNG")
    return data.getvalue()


class JournalArtTests(unittest.TestCase):
    def test_production_configuration_enables_separate_personal_art_and_cover_prompt(self):
        config = (Path(__file__).resolve().parents[1] /
                  "infra/systemd/arcane-path-content-factory.conf").read_text()
        self.assertIn("ARCANE_JOURNAL_IMAGES_TOKEN_FILE=/etc/arcane-path/ovh-ai-endpoints-token", config)
        prompt = art_prompt(self.brief)["prompt"]
        self.assertIn("personal notebook cover", prompt)
        self.assertNotEqual(prompt, art_prompt({**self.brief, "key": "2026-10-20"})["prompt"])
        self.assertNotIn("Private name", prompt)

    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        chunks = ChunkStore(cache=Path(temporary.name))
        self.chunks = chunks
        self.journeys = JourneyStore(chunks, atomic_write)
        self.abandoned = AbandonedJournals(self.journeys)
        self.record, _ = self.journeys.create({"requestId": str(uuid.uuid4()), "region": "firmi", "name": "Private name"})
        self.owner = self.record["state"]["serverJourney"]["id"]
        self.token = "a" * 64
        self.abandoned.bind(self.owner, self.token)
        self.writer = Mock(return_value=fixture_image())
        self.art = JournalArt(self.journeys, self.abandoned, self.writer)
        self.addCleanup(self.art.close)
        self.brief = {
            "key": "cover", "birth": self.record["state"]["birthCard"], "daily": "moon",
            "scenes": ["forest", "rain"], "activities": [], "partial": False,
        }

    def request(self, operation="sync", **extra):
        return self.art.request({"journey": self.owner, "operation": operation, **extra}, self.token)

    def settle(self):
        self.art.future.result(timeout=10)
        return self.request()

    def test_durable_background_cover_is_private_normalized_and_immutable(self):
        result = self.request("enqueue", brief=self.brief)
        self.assertTrue(result["enabled"])
        result = self.settle()
        self.assertEqual(result["entries"][0]["status"], "ready")
        self.assertNotIn("Private name", json.dumps(result))
        self.assertNotIn(self.token, json.dumps(result))
        changed = {**self.brief, "daily": "sun"}
        self.request("enqueue", brief=changed)
        self.settle()
        self.writer.assert_called_once()
        raw = self.request("image", key="cover")
        with Image.open(io.BytesIO(raw)) as image:
            self.assertEqual(image.format, "WEBP")
            self.assertEqual(image.size, (1024, 1024))
        reopened = JournalArt(self.journeys, self.abandoned)
        self.addCleanup(reopened.close)
        self.assertEqual(reopened.request({"journey": self.owner, "operation": "image", "key": "cover"}, self.token), raw)
        self.assertEqual(self.art.path.stat().st_mode & 0o777, 0o600)

    def test_bad_auth_arbitrary_prompts_and_invalid_tags_do_not_generate(self):
        with self.assertRaises(JournalForbidden):
            self.art.request({"journey": self.owner, "operation": "sync"}, "b" * 64)
        for brief in [
            {**self.brief, "name": "private"}, {**self.brief, "scenes": ["exact location"]},
            {**self.brief, "activities": ["arbitrary instruction"]},
            {**self.brief, "birth": "invalid"}, {**self.brief, "key": "2030-01-01"},
        ]:
            with self.assertRaises(JourneyRequest):
                self.request("enqueue", brief=brief)
        self.writer.assert_not_called()
        self.assertEqual(self.request()["entries"], [])

    def test_daily_page_is_separate_and_does_not_replace_cover(self):
        self.request("enqueue", brief=self.brief)
        self.settle()
        cover = self.request("image", key="cover")
        day = datetime.fromtimestamp(self.record["state"]["startedAt"] / 1000, timezone.utc).date().isoformat()
        self.request("enqueue", brief={**self.brief, "key": day, "activities": ["walking", "meal"]})
        result = self.settle()
        self.assertEqual(len(result["entries"]), 2)
        self.assertEqual(self.request("image", key="cover"), cover)
        prompt = self.writer.call_args.args[0]["prompt"]
        self.assertIn("walking", prompt)
        self.assertNotIn("Private name", prompt)
        self.assertNotIn(self.owner, prompt)

    def test_disabled_service_does_not_queue_or_call_provider(self):
        self.art.close()
        disabled = JournalArt(self.journeys, self.abandoned)
        self.assertEqual(disabled.request({
            "journey": self.owner, "operation": "enqueue", "brief": self.brief,
        }, self.token), {"enabled": False, "entries": []})
        self.writer.assert_not_called()

    def test_failure_is_explicit_and_never_automatically_retried(self):
        self.writer.side_effect = WorkshopError("OVH free service unavailable", 502)
        self.request("enqueue", brief=self.brief)
        result = self.settle()
        self.assertEqual(result["entries"][0]["status"], "failed")
        self.assertIn("unavailable", result["entries"][0]["error"])
        self.request("enqueue", brief=self.brief)
        self.settle()
        self.writer.assert_called_once()

    def test_enqueue_is_fast_while_worker_waits_and_ready_image_is_owner_scoped(self):
        entered, release = threading.Event(), threading.Event()
        def generate(theme):
            entered.set()
            if not release.wait(5):
                raise WorkshopError("Test provider not released", 502)
            return fixture_image()
        self.writer.side_effect = generate
        self.request("enqueue", brief=self.brief)
        try:
            self.assertTrue(entered.wait(5))
            self.assertEqual(self.request()["entries"][0]["status"], "running")
            self.request("enqueue", brief=self.brief)
        finally:
            release.set()
        self.settle()
        self.writer.assert_called_once()
        other, _ = self.journeys.create({"requestId": str(uuid.uuid4()), "region": "firmi", "name": "Other"})
        other_id = other["state"]["serverJourney"]["id"]
        self.abandoned.bind(other_id, "b" * 64)
        with self.assertRaises(JourneyRequest):
            self.art.request({"journey": other_id, "operation": "image", "key": "cover"}, "b" * 64)

    def test_corrupt_oversized_wrong_dimensions_and_non_images_are_rejected(self):
        for raw in [b"", b"not an image", b"x" * (10 * 1024 * 1024 + 1), fixture_image((16, 16))]:
            with self.subTest(size=len(raw)), self.assertRaises(WorkshopError):
                normalize_image(raw)
        raw = fixture_image()
        with self.assertRaises(WorkshopError):
            normalize_image(raw[:100])

    def test_free_price_is_checked_before_generation_and_no_paid_fallback_exists(self):
        writer = OvhImageWriter("private-fixture")
        writer.opener = MagicMock()
        response = writer.opener.open.return_value.__enter__.return_value
        response.status = 200
        pricing = {key: "0" for key in ("completion", "image", "prompt", "request", "input_cache_reads", "input_cache_writes")}
        pricing["currency_unit"] = "USD"
        catalogue = {"data": [{"id": IMAGE_MODEL, "pricing": pricing}]}
        response.read.side_effect = [json.dumps(catalogue).encode(), fixture_image()]
        normalize_image(writer(art_prompt(self.brief)))
        self.assertEqual(writer.opener.open.call_count, 2)
        request = writer.opener.open.call_args.args[0]
        self.assertTrue(request.full_url.startswith("https://stable-diffusion-xl."))
        self.assertNotIn(b"private-fixture", request.data)
        pricing["image"] = "0.01"
        response.read.side_effect = None
        response.read.return_value = json.dumps(catalogue).encode()
        writer.opener.reset_mock()
        with self.assertRaisesRegex(WorkshopError, "free"):
            writer(art_prompt(self.brief))
        self.assertEqual(writer.opener.open.call_count, 1)

    def test_http_queues_without_waiting_and_returns_only_private_image_bytes(self):
        jobs = ChunkJobs(self.chunks)
        with patch("travel_server.JournalArt.configured", return_value=self.art):
            handler = make_handler(self.chunks, jobs)
        server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        thread = threading.Thread(target=server.serve_forever)
        thread.start()
        url = f"http://127.0.0.1:{server.server_port}/api/journal-art"
        def post(body, token=self.token):
            return urllib.request.urlopen(urllib.request.Request(url, data=json.dumps(body).encode(),
                headers={"Content-Type": "application/json", "X-Journal-Capability": token}), timeout=10)
        try:
            with post({"journey": self.owner, "operation": "enqueue", "brief": self.brief}) as response:
                self.assertTrue(json.load(response)["enabled"])
            self.settle()
            with post({"journey": self.owner, "operation": "image", "key": "cover"}) as response:
                self.assertEqual(response.headers["Content-Type"], "image/webp")
                self.assertEqual(response.headers["Cache-Control"], "private, no-store")
                self.assertTrue(response.read())
            with self.assertRaises(urllib.error.HTTPError) as raised:
                post({"journey": self.owner, "operation": "image", "key": "cover"}, "b" * 64)
            self.assertEqual(raised.exception.code, 403)
            raised.exception.close()
        finally:
            server.shutdown()
            server.server_close()
            thread.join()
            jobs.pool.shutdown(wait=True)


if __name__ == "__main__":
    unittest.main()
