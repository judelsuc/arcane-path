import io
import fcntl
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from abandoned_journals import JournalForbidden
from content_factory import WorkshopError
from encounter_art import EncounterArt, SCENES, WEEK, run_batch
from journeys import JourneyRequest


def picture():
    buffer = io.BytesIO()
    Image.new("RGB", (1024, 1024), "navy").save(buffer, "PNG")
    return buffer.getvalue()


class EncounterArtTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.auth = Mock()
        self.auth.authorize.return_value = ("owner", {})
        self.art = EncounterArt(Path(temporary.name) / "art.sqlite3", self.auth, True)
        self.writer = Mock(return_value=picture())
        self.item = {"scene": "event.food", "occurrence": "event:one"}

    def sync(self, *items):
        return self.art.request({"journey": "journey", "operation": "sync",
                                 "items": list(items or [self.item])}, "private")

    def test_each_occurrence_and_owner_gets_a_unique_private_image(self):
        self.assertEqual(self.sync()["entries"][0]["status"], "pending")
        first = self.art.generate("event.food", self.writer)
        entry = self.sync()["entries"][0]
        self.assertEqual(entry["id"], first)
        self.assertEqual(self.sync()["entries"][0], entry)
        second_item = {**self.item, "occurrence": "event:two"}
        self.assertEqual(self.sync(second_item)["entries"][0]["status"], "pending")
        second = self.art.generate("event.food", self.writer)
        self.assertNotEqual(first, second)
        raw = self.art.request({"journey": "journey", "operation": "image",
                                "occurrence": "event:one", "image": first}, "private")
        with Image.open(io.BytesIO(raw)) as image:
            self.assertEqual((image.format, image.size), ("WEBP", (1024, 1024)))
        self.auth.authorize.return_value = ("other", {})
        with self.assertRaises(JourneyRequest):
            self.art.request({"journey": "other", "operation": "image",
                              "occurrence": "event:one", "image": first}, "other-private")
        self.assertEqual(self.sync()["entries"][0]["status"], "pending")
        self.assertEqual(self.art.path.stat().st_mode & 0o777, 0o600)
        for call in self.writer.call_args_list:
            self.assertNotIn("private", json.dumps(call.args[0]))
            self.assertNotIn("journey", json.dumps(call.args[0]))

    def test_seven_real_day_boundary_retains_old_image_while_waiting_then_renews(self):
        with patch("encounter_art.time.time", return_value=100):
            self.sync()
            original = self.art.generate("event.food", self.writer)
        with patch("encounter_art.time.time", return_value=100 + WEEK - 0.001):
            self.assertFalse(self.sync()["entries"][0]["renewing"])
        with patch("encounter_art.time.time", return_value=100 + WEEK):
            entry = self.sync()["entries"][0]
            self.assertEqual(entry["id"], original)
            self.assertTrue(entry["renewing"])
            renewed = self.art.generate("event.food", self.writer)
            entry = self.sync()["entries"][0]
            self.assertEqual(entry["id"], renewed)
            self.assertFalse(entry["renewing"])
            self.assertNotEqual(renewed, original)
        with self.art.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM images WHERE claimed=1").fetchone()[0], 2)

    def test_bad_auth_prompts_duplicate_observations_and_scene_changes_are_rejected(self):
        self.auth.authorize.side_effect = JournalForbidden("private")
        with self.assertRaises(JournalForbidden):
            self.sync()
        self.auth.authorize.side_effect = None
        for item in [{**self.item, "prompt": "arbitrary"}, {**self.item, "scene": "custom"},
                     {**self.item, "occurrence": "bad\nkey"}]:
            with self.assertRaises(JourneyRequest):
                self.sync(item)
        with self.assertRaises(JourneyRequest):
            self.sync(self.item, self.item)
        self.sync()
        with self.assertRaises(JourneyRequest):
            self.sync({**self.item, "scene": "event.coins"})
        self.writer.assert_not_called()

    def test_reopening_preserves_assignments_and_disabled_mode_never_dispatches(self):
        self.sync()
        identity = self.art.generate("event.food", self.writer)
        reopened = EncounterArt(self.art.path, self.auth, False)
        result = reopened.request({"journey": "journey", "operation": "sync",
                                  "items": [self.item]}, "private")
        self.assertFalse(result["enabled"])
        self.assertEqual(result["entries"][0]["id"], identity)
        self.writer.assert_called_once()

    def test_batch_prioritizes_pending_observations_then_balances_ready_stock(self):
        self.sync({**self.item, "scene": "npc.hospitality.hosted"})
        clock = [0]
        def sleep(seconds):
            clock[0] += seconds
        generated = run_batch(self.art, self.writer, hours=30 / 3600, interval=15,
                              clock=lambda: clock[0], sleep=sleep)
        self.assertEqual(generated, 2)
        self.assertEqual(self.sync({**self.item, "scene": "npc.hospitality.hosted"})["entries"][0]["status"], "ready")
        with self.art.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(DISTINCT scene) FROM images").fetchone()[0], 2)

    def test_batch_storage_uses_live_blobs_not_unshrunk_sqlite_file_and_prunes_first(self):
        self.art.generate("event.food", self.writer, now=0)
        clock = [0]
        with patch("encounter_art.MAX_BYTES", 1):
            generated = run_batch(self.art, self.writer, hours=1 / 3600, interval=1,
                                  clock=lambda: clock[0], sleep=lambda seconds: clock.__setitem__(0, 1))
        self.assertEqual(generated, 1, "expired unclaimed blobs are pruned before the logical size check")

    def test_batch_stops_on_provider_failure_or_disk_limit_without_retry(self):
        self.writer.side_effect = WorkshopError("No free offer", 503)
        with self.assertRaises(WorkshopError):
            run_batch(self.art, self.writer, hours=1 / 3600)
        self.writer.assert_called_once()
        with patch("encounter_art.shutil.disk_usage", return_value=Mock(free=0)):
            self.assertEqual(run_batch(self.art, self.writer, hours=1 / 3600), 0)
        self.writer.assert_called_once()

    def test_event_dream_and_hospitality_catalogue_is_finite(self):
        self.assertIn("event.dogEncounter", SCENES)
        self.assertIn("dream.lost-player", SCENES)
        self.assertIn("npc.hospitality.greeting", SCENES)
        self.assertIn("npc.hospitality.hosted", SCENES)
        self.assertIn("npc.hospitality.refused", SCENES)
        self.assertNotIn("death", SCENES)

    def test_batch_cannot_overlap_another_batch(self):
        with self.art.path.with_suffix(".lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaises(BlockingIOError):
                run_batch(self.art, self.writer, hours=1 / 3600)
        self.writer.assert_not_called()
