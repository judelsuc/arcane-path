from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import sys
import tempfile
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from abandoned_journals import AbandonedJournals, JournalForbidden
from asset_storage import AssetError, local_storage
from journal_art import JournalArt
from journeys import JourneyCapacity, JourneyConflict, JourneyStore
from live_narrative import LiveNarrative, version_for
from quest_destinations import QuestDestinations
from travel_server import ChunkStore, atomic_write


def wording_response():
    return {"choices": [{"finish_reason": "stop", "message": {"content": json.dumps({
        "en": "A passer-by offers you a few coins.", "fr": "Un passant vous offre quelques pièces.",
        "alternatives": [
            {"en": "Someone gives you coins.", "fr": "Quelqu'un vous donne des pièces."},
            {"en": "A small gift for the road.", "fr": "Un petit don pour la route."},
        ]})}}], "usage": {"prompt_tokens": 100, "completion_tokens": 30, "total_tokens": 130}}


class ContentStorageChecks:
    """The same checks run with local SQL and real PostgreSQL/S3 fixtures."""

    def content_root(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        return Path(temporary.name)

    def quests(self, name, build=None):
        root = self.content_root()
        journeys = SimpleNamespace(path=root / name / "journeys.sqlite3", assets=self.storage)
        auth = SimpleNamespace(journeys=journeys, authorize=Mock(
            return_value=("a" * 32, {"region": "test"})))
        chunks = SimpleNamespace(bases={"test": {"bounds": {
            "maxLatitude": 48, "minLatitude": 47.9, "minLongitude": 2},
            "cellSizeMeters": 250, "projectionLatitude": 48}})
        with patch.object(QuestDestinations, "kick"):
            service = QuestDestinations(chunks, auth, Mock(), fetcher=Mock(return_value=[]))
        service.build = build or Mock(return_value={"status": "ready", "destinations": ["fixture"]})
        self.addCleanup(service.close)
        return service

    @staticmethod
    def quest_request(nonce="c" * 32):
        return {"journey": "a" * 32, "template": "fool.first-address", "origin": {"col": 0, "row": 0},
                "scope": "local", "nonce": nonce}

    def text_services(self):
        root = self.content_root()
        journeys = JourneyStore(ChunkStore(cache=root / "one"), atomic_write, assets=self.storage)
        other = JourneyStore(ChunkStore(cache=root / "two"), atomic_write, assets=self.storage)
        record, _ = journeys.create({"requestId": str(uuid.uuid4()), "region": "firmi", "name": "Private fixture"})
        owner, token = record["state"]["serverJourney"]["id"], "a" * 64
        books = AbandonedJournals(journeys)
        books.bind(owner, token)
        auth = JournalArt(journeys, books, assets=self.storage)
        other_auth = JournalArt(other, AbandonedJournals(other), assets=self.storage)
        self.addCleanup(auth.close)
        self.addCleanup(other_auth.close)
        writer = Mock(return_value=wording_response())
        with patch.object(LiveNarrative, "kick"):
            first = LiveNarrative(journeys, auth, writer)
            second = LiveNarrative(other, other_auth, writer)
        self.addCleanup(first.close)
        self.addCleanup(second.close)
        return first, second, writer, {"journey": owner, "brief": "event.coins"}, token

    def test_shared_quests_deduplicate_inflight_and_preserve_nonce_conflicts(self):
        entered, release = threading.Event(), threading.Event()
        def build(*args):
            entered.set()
            if not release.wait(10):
                raise OSError("Fixture not released")
            return {"status": "ready", "destinations": ["fixture"]}
        builder = Mock(side_effect=build)
        first = self.quests("one", builder)
        second = self.quests("two", builder)
        data = self.quest_request()
        try:
            first.request(data, "capability")
            self.assertTrue(entered.wait(10))
            second.request(data, "capability")
            second.future.result(timeout=10)
            self.assertEqual(second.request(data, "capability")["status"], "running")
            with self.assertRaises(JourneyConflict):
                second.request({**data, "scope": "far"}, "capability")
        finally:
            release.set()
        first.future.result(timeout=10)
        self.assertEqual(second.request(data, "capability"), {"status": "ready", "destinations": ["fixture"]})
        builder.assert_called_once()
        self.assertFalse(first.path.parent.exists())
        self.assertFalse(second.path.parent.exists())

    def test_shared_quest_expiration_recovers_and_fences_late_output(self):
        first = self.quests("one")
        data = self.quest_request()
        with patch.object(first, "kick"):
            first.request(data, "capability")
        second = self.quests("two", Mock(return_value={"status": "ready", "winner": "new-worker"}))
        def old_build(*args):
            with first.connect() as db:
                db.execute("UPDATE quest_instances SET expires=0")
            second.drain()
            return {"status": "ready", "winner": "stale-worker"}
        first.build = Mock(side_effect=old_build)
        with self.assertLogs(level="ERROR"):
            first.drain()
        with patch.object(second, "kick"):
            self.assertEqual(second.request(data, "capability"), {"status": "ready", "winner": "new-worker"})
        self.assertEqual(second.build.call_count, 1)

    def test_shared_quest_limits_and_poi_cache_are_global(self):
        first, second = self.quests("one"), self.quests("two")
        with patch.object(first, "kick"):
            for i in range(16):
                first.request(self.quest_request(f"{i:032x}"), "capability")
        with self.assertRaises(JourneyCapacity):
            second.request(self.quest_request("f" * 32), "capability")
        town = {"id": "town-one", "name": "Fixture", "latitude": 48, "longitude": 2}
        self.assertEqual(first.pois(town, first.chunks.bases["test"]), [])
        self.assertEqual(second.pois(town, second.chunks.bases["test"]), [])
        first.fetcher.assert_called_once()
        second.fetcher.assert_not_called()
        with first.connect() as db:
            db.execute("UPDATE quest_instances SET status='running',attempts=3,expires=0")
        second.drain()
        with second.connect() as db:
            row = db.execute("SELECT status,output FROM quest_instances LIMIT 1").fetchone()
        self.assertEqual(row["status"], "failed")
        self.assertIn("attempt limit", json.loads(row["output"])["error"])

    def test_shared_text_services_preserve_active_dispatch_and_accounting(self):
        first, second, writer, data, token = self.text_services()
        entered, release = threading.Event(), threading.Event()
        def generate(brief):
            entered.set()
            if not release.wait(10):
                raise OSError("Fixture not released")
            return wording_response()
        writer.side_effect = generate
        try:
            first.request(data, token)
            self.assertTrue(entered.wait(10))
            second.request(data, token)
            second.future.result(timeout=10)
            active = second.request(data, token)
            self.assertEqual(active["status"], "running")
            self.assertEqual(active["accounting"]["attempts"], 1)
            self.assertEqual(active["accounting"]["unknownUsage"], 1)
            restarted = LiveNarrative(first.journeys, first.authorization, writer)
            self.addCleanup(restarted.close)
            restarted.future.result(timeout=10)
            self.assertEqual(restarted.request(data, token)["status"], "running")
            with self.assertRaises(JournalForbidden):
                second.request(data, "b" * 64)
        finally:
            release.set()
        first.future.result(timeout=10)
        result = second.request(data, token)
        self.assertEqual(result["status"], "ready")
        self.assertEqual(result["accounting"], {"attempts": 1, "unknownUsage": 0,
                                              "promptTokens": 100, "completionTokens": 30})
        self.assertEqual(len(result["alternatives"]), 2)
        self.assertNotIn("Private fixture", json.dumps(writer.call_args.args[0]))
        writer.assert_called_once()
        self.assertFalse(first.path.exists())
        self.assertFalse(second.path.exists())

    def test_shared_text_late_output_is_fenced_and_never_dispatched_again(self):
        first, second, writer, data, token = self.text_services()
        with patch.object(first, "kick"):
            first.request(data, token)
        def generate(brief):
            with first.connect() as db:
                db.execute("UPDATE narrative_wording SET expires=0")
            second.drain()
            return wording_response()
        writer.side_effect = generate
        with self.assertLogs(level="ERROR"):
            first.drain()
        result = second.request(data, token)
        self.assertEqual(result["status"], "failed")
        self.assertIsNone(result["text"])
        self.assertIn("No automatic retry", result["error"])
        self.assertEqual(result["accounting"]["unknownUsage"], 1)
        writer.assert_called_once()

    def test_shared_text_queued_work_can_be_taken_by_another_service(self):
        first, second, writer, data, token = self.text_services()
        with patch.object(first, "kick"):
            first.request(data, token)
        second.drain()
        self.assertEqual(first.request(data, token)["status"], "ready")
        writer.assert_called_once()
        with first.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM narrative_wording").fetchone()[0], 1)
        self.assertFalse(first.path.exists())

    def test_shared_text_concurrent_requests_create_one_dispatch(self):
        first, second, writer, data, token = self.text_services()
        with patch.object(first, "kick"), patch.object(second, "kick"):
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(lambda service: service.request(data, token), (first, second)))
        self.assertTrue(all(result["status"] == "queued" for result in results))
        with ThreadPoolExecutor(max_workers=2) as pool:
            list(pool.map(lambda service: service.drain(), (first, second)))
        self.assertEqual(first.request(data, token)["status"], "ready")
        writer.assert_called_once()

    def test_shared_text_capacity_is_global(self):
        first, second, writer, data, token = self.text_services()
        with first.connect() as db:
            for i in range(32):
                db.execute("INSERT INTO narrative_wording(owner,brief,version,status,created) "
                           "VALUES(?,?,?,'queued',0)", (f"other-{i}", data["brief"], version_for(data["brief"])))
        with self.assertRaises(JourneyCapacity):
            second.request(data, token)
        writer.assert_not_called()

    def test_shared_text_unknown_dispatch_expires_without_retry_after_service_restart(self):
        first, second, writer, data, token = self.text_services()
        with patch.object(first, "kick"):
            first.request(data, token)
        with first.connect() as db:
            db.execute("UPDATE narrative_wording SET status='running',calls=1,token='fixture',expires=0")
        second.drain()
        result = second.request(data, token)
        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["accounting"]["attempts"], 1)
        writer.assert_not_called()

    def test_shared_content_storage_errors_are_explicit_without_fallback(self):
        first, second, writer, data, token = self.text_services()
        with self.storage.catalogue.connection() as db:
            db.execute("ALTER TABLE narrative_wording RENAME TO unavailable_narrative_fixture")
        try:
            with self.assertRaises(AssetError):
                second.request(data, token)
        finally:
            with self.storage.catalogue.connection() as db:
                db.execute("ALTER TABLE unavailable_narrative_fixture RENAME TO narrative_wording")
        self.assertFalse(second.path.exists())
        writer.assert_not_called()


class LocalContentStorageTests(ContentStorageChecks, unittest.TestCase):
    def setUp(self):
        self.storage = local_storage(self.content_root() / "assets")
