import io
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from content_factory import WorkshopError
from legend_art import LegendArt, SCENES, main


def fixture_image():
    stream = io.BytesIO()
    Image.new("RGB", (1024, 1024), "darkgreen").save(stream, "PNG")
    return stream.getvalue()


class LegendArtTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.art = LegendArt(self.root / "private/art.sqlite3")
        self.output = self.root / "public"

    def test_not_generated_manifest_and_single_background(self):
        result = self.art.publish(self.output)
        self.assertEqual([entry["status"] for entry in result["entries"]], ["not-generated"] * 2)
        writer = Mock(return_value=fixture_image())
        self.art.generate("passage", writer)
        result = self.art.publish(self.output)
        self.assertEqual(result["entries"][0]["status"], "ready")
        self.assertEqual(result["entries"][1]["status"], "not-generated")
        with Image.open(self.output / "passage.webp") as image:
            self.assertEqual(image.format, "WEBP")
            self.assertEqual(image.size, (1024, 1024))
        self.assertEqual(self.art.path.stat().st_mode & 0o777, 0o600)
        self.assertEqual((self.output / "passage.webp").stat().st_mode & 0o777, 0o644)
        writer.assert_called_once_with({"prompt": SCENES["passage"], "version": 1})

    def test_ready_art_is_retained_and_republished_without_provider_calls(self):
        writer = Mock(return_value=fixture_image())
        self.art.generate("passage", writer)
        self.art.generate("interior", writer)
        self.assertEqual(writer.call_count, 2)
        reopened = LegendArt(self.art.path)
        reopened.generate("passage", writer)
        reopened.generate("interior", writer)
        self.assertEqual(writer.call_count, 2)
        result = reopened.publish(self.output)
        self.assertTrue(all(entry["status"] == "ready" for entry in result["entries"]))

    def test_failure_is_persisted_without_public_provider_error_or_automatic_retry(self):
        writer = Mock(side_effect=WorkshopError("provider unavailable", 503))
        with self.assertRaises(WorkshopError):
            self.art.generate("passage", writer)
        with self.assertRaisesRegex(WorkshopError, "already attempted"):
            LegendArt(self.art.path).generate("passage", writer)
        writer.assert_called_once()
        result = self.art.publish(self.output)
        self.assertEqual(result["entries"][0], {"scene": "passage", "status": "failed"})
        self.assertNotIn("provider unavailable", json.dumps(result))

    def test_reservation_precedes_io_and_blocks_a_concurrent_or_interrupted_attempt(self):
        other = LegendArt(self.art.path)

        def writer(_brief):
            published = json.loads((self.output / "manifest.json").read_text())
            self.assertEqual(published["entries"][0]["status"], "pending")
            self.assertEqual(other.publish(self.output)["entries"][0]["status"], "pending")
            with self.assertRaisesRegex(WorkshopError, "already attempted"):
                other.generate("passage", Mock())
            return fixture_image()

        self.art.generate("passage", writer, output=self.output)
        with self.art.connect() as db:
            db.execute("INSERT INTO backgrounds(scene,status,brief) VALUES('interior','pending','{}')")
        with self.assertRaisesRegex(WorkshopError, "already attempted"):
            other.generate("interior", Mock())

    def test_unknown_scene_invalid_image_and_unsupported_database_fail_explicitly(self):
        with self.assertRaises(ValueError):
            self.art.generate("arbitrary", Mock())
        with self.assertRaises(WorkshopError):
            self.art.generate("passage", lambda _: b"invalid")
        path = self.root / "future.sqlite3"
        with sqlite3.connect(path) as db:
            db.execute("PRAGMA user_version=9")
        with self.assertRaisesRegex(ValueError, "Unsupported"):
            LegendArt(path)

    def test_cli_publish_only_never_requires_a_token_or_calls_the_provider(self):
        argv = ["legend_art.py", "--cache", str(self.root / "private"),
                "--output", str(self.output), "--publish-only"]
        with patch.object(sys, "argv", argv), patch("legend_art.OvhImageWriter") as writer:
            self.assertEqual(main(), 0)
        writer.assert_not_called()
        published = json.loads((self.output / "manifest.json").read_text())
        self.assertTrue(all(entry["status"] == "not-generated" for entry in published["entries"]))

    def test_cli_stops_on_provider_failure_and_publishes_actual_status(self):
        argv = ["legend_art.py", "--cache", str(self.root / "private"), "--output", str(self.output)]
        writer = Mock(side_effect=WorkshopError("free offer unavailable", 503))
        with patch.object(sys, "argv", argv), \
                patch.dict("os.environ", {"ARCANE_START_IMAGES_TOKEN_FILE": "/fixture-key"}), \
                patch("legend_art.private_file", return_value="fixture"), \
                patch("legend_art.OvhImageWriter", return_value=writer), \
                self.assertLogs(level="ERROR"):
            self.assertEqual(main(), 1)
        writer.assert_called_once()
        published = json.loads((self.output / "manifest.json").read_text())
        self.assertEqual([entry["status"] for entry in published["entries"]], ["failed", "not-generated"])
