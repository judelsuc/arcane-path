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
import uuid
from http.server import ThreadingHTTPServer

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from abandoned_journals import AbandonedJournals, JournalForbidden
from content_factory import LIMIT, OvhWriter, WorkshopError
from journal_art import JournalArt
from journeys import JourneyStore, JourneyRequest, JourneyCapacity
from live_narrative import CATALOGUE, MODEL, VERSION, LiveNarrative, provider_request, validate_output
from opening_story import BRIEF_ID, opening_brief, validate_parent_reference
from travel_server import ChunkStore, ChunkJobs, atomic_write, make_handler


def response(en="A passer-by offers you a few coins.", fr="Un passant vous offre quelques pièces."):
    return {"choices": [{"finish_reason": "stop", "message": {
        "content": json.dumps({"en": en, "fr": fr})}}],
        "usage": {"prompt_tokens": 100, "completion_tokens": 30, "total_tokens": 130}}


class LiveNarrativeTests(unittest.TestCase):
    def test_opening_story_uses_only_saved_public_context_and_higher_temperature(self):
        record = self.journeys.read(self.owner)
        original = json.dumps(record, sort_keys=True)
        with patch("opening_story.secrets.token_hex", return_value="fixed-variation"):
            brief = opening_brief(record, self.chunks)
        self.assertEqual(set(brief), {"kind", "parent", "departure", "startingPlace",
                                     "landscape", "birthCard", "season", "variation"})
        self.assertEqual(brief["parent"], record["state"]["trail"]["parentName"])
        self.assertEqual(brief["birthCard"], record["state"]["birthCard"])
        self.assertEqual(brief["startingPlace"], "Firmi")
        serialized = json.dumps(brief)
        for secret in ["PRIVATE PLAYER", self.owner, self.token, "visits", "falseLeads", "coordinates"]:
            self.assertNotIn(secret, serialized)
        self.assertEqual(json.dumps(record, sort_keys=True), original)
        request = provider_request(brief, MODEL)
        self.assertEqual(request["temperature"], 0.9)
        self.assertEqual(request["max_tokens"], 1400)
        self.assertGreater(request["temperature"], provider_request(CATALOGUE["event.coins"], MODEL)["temperature"])
        self.assertEqual(json.loads(request["messages"][1]["content"]), brief)
        self.assertNotEqual(opening_brief(record, self.chunks)["variation"],
                            opening_brief(record, self.chunks)["variation"])

    def test_opening_story_is_durable_immutable_and_bilingual_without_mutating_genesis(self):
        before = self.journeys.read(self.owner)
        name = before["state"]["trail"]["parentName"]
        self.writer.return_value = response(en=(f"Your parent {name} left. " * 30).strip(),
                                            fr=(f"Votre parent {name} est parti. " * 30).strip())
        self.request(BRIEF_ID)
        result = self.settle(BRIEF_ID)
        self.assertEqual(result["status"], "ready")
        self.assertGreater(len(result["text"]["fr"]), 500)
        self.assertEqual(result["accounting"]["attempts"], 1)
        self.assertEqual(self.writer.call_args.args[0]["parent"], name)
        self.assertEqual(self.journeys.read(self.owner), before)
        self.service.close()
        reopened = LiveNarrative(self.journeys, self.auth, self.writer)
        self.addCleanup(reopened.close)
        self.assertEqual(reopened.request({"journey": self.owner, "brief": BRIEF_ID}, self.token), result)
        # Prompt revisions must not replace an already generated opening story.
        with patch("live_narrative.VERSION", "future-version"):
            self.assertEqual(reopened.request({"journey": self.owner, "brief": BRIEF_ID}, self.token), result)
        self.writer.assert_called_once()

    def test_opening_story_truncated_invalid_and_provider_failures_never_retry(self):
        self.writer.return_value = response()
        self.request(BRIEF_ID)
        result = self.settle(BRIEF_ID)
        self.assertEqual(result["status"], "failed")
        self.assertIsNone(result["text"])
        for _ in range(3):
            self.request(BRIEF_ID)
        self.writer.assert_called_once()
        for value in [response(en="a" * 1801, fr="b" * 600),
                      response(en="<script>" + "a" * 600, fr="b" * 600)]:
            with self.assertRaises(WorkshopError):
                validate_output(value, story=True)
        for text in ["Your mother Camille left.", "Your father Camille left.",
                     "Votre mère Camille est partie.", "Camille left; she said goodbye.",
                     "Your parent Alex left."]:
            self.assertFalse(validate_parent_reference({"en": text, "fr": "Camille"}, {"parent": "Camille"}))

    def test_opening_story_rejects_invented_parent_gender_without_retry(self):
        name = self.journeys.read(self.owner)["state"]["trail"]["parentName"]
        self.writer.return_value = response(en=(f"Your mother {name} left. " * 30).strip(),
                                            fr=(f"Votre parent {name} est parti. " * 30).strip())
        self.request(BRIEF_ID)
        result = self.settle(BRIEF_ID)
        self.assertEqual(result["status"], "failed")
        self.assertIsNone(result["text"])
        self.assertIn("parent identity", result["error"])
        self.request(BRIEF_ID)
        self.writer.assert_called_once()

    def setUp(self):
        (ROOT / ".cache").mkdir(exist_ok=True)
        directory = tempfile.TemporaryDirectory(dir=ROOT / ".cache", prefix="live-narrative-test-")
        self.addCleanup(directory.cleanup)
        self.chunks = ChunkStore(cache=Path(directory.name))
        self.journeys = JourneyStore(self.chunks, atomic_write)
        abandoned = AbandonedJournals(self.journeys)
        record, _ = self.journeys.create({
            "requestId": str(uuid.uuid4()), "region": "firmi", "name": "PRIVATE PLAYER",
        })
        self.owner = record["state"]["serverJourney"]["id"]
        self.token = "a" * 64
        abandoned.bind(self.owner, self.token)
        self.auth = JournalArt(self.journeys, abandoned)
        self.addCleanup(self.auth.close)
        self.writer = Mock(return_value=response())
        self.service = LiveNarrative(self.journeys, self.auth, self.writer)
        self.addCleanup(self.service.close)

    def request(self, brief="event.coins", **extra):
        return self.service.request({"journey": self.owner, "brief": brief, **extra}, self.token)

    def settle(self, brief="event.coins"):
        self.service.future.result(timeout=5)
        return self.request(brief)

    def test_async_durable_dedup_bilingual_output_and_private_accounting(self):
        self.request()
        result = self.settle()
        self.assertEqual(result["status"], "ready")
        self.assertEqual(set(result["text"]), {"en", "fr"})
        self.assertEqual(result["accounting"], {
            "attempts": 1, "unknownUsage": 0, "promptTokens": 100, "completionTokens": 30,
        })
        self.assertEqual(self.writer.call_args.args, (CATALOGUE["event.coins"],))
        self.assertNotIn("PRIVATE", json.dumps(self.writer.call_args.args))
        self.assertNotIn(self.owner, json.dumps(self.writer.call_args.args))
        self.service.close()
        reopened = LiveNarrative(self.journeys, self.auth, self.writer)
        self.addCleanup(reopened.close)
        self.assertEqual(reopened.request({"journey": self.owner, "brief": "event.coins"}, self.token), result)
        self.writer.assert_called_once()
        self.assertEqual(self.service.path.stat().st_mode & 0o777, 0o600)

    def test_capability_and_keeper_isolation(self):
        with self.assertRaises(JournalForbidden):
            self.service.request({"journey": self.owner, "brief": "event.coins"}, "b" * 64)
        with self.assertRaises(JournalForbidden):
            self.request(keeper="b" * 32)
        self.writer.assert_not_called()

    def test_other_authenticated_owner_gets_separate_cache_and_accounting(self):
        self.request()
        first = self.settle()
        record, _ = self.journeys.create({
            "requestId": str(uuid.uuid4()), "region": "firmi", "name": "OTHER PRIVATE PLAYER",
        })
        other = record["state"]["serverJourney"]["id"]
        self.auth.abandoned.bind(other, "b" * 64)
        result = self.service.request({"journey": other, "brief": "event.coins"}, "b" * 64)
        self.assertIsNone(result["text"])
        self.service.future.result(timeout=5)
        result = self.service.request({"journey": other, "brief": "event.coins"}, "b" * 64)
        self.assertEqual(result["accounting"]["attempts"], 1)
        self.assertEqual(first["accounting"]["attempts"], 1)
        self.assertEqual(self.writer.call_count, 2)

    def test_arbitrary_prompts_source_secrets_and_lore_keys_rejected(self):
        for extra in [{"prompt": "write anything"}, {"name": "private"}, {"coordinates": [1, 2]}]:
            with self.assertRaises(JourneyRequest):
                self.request(**extra)
        for brief in ["event.whiteDeer", "event.stranger", "event.dogEncounter", "lore.artifact", {}, "x" * 4096]:
            with self.assertRaises(JourneyRequest):
                self.request(brief)
        self.writer.assert_not_called()

    def test_failure_and_invalid_json_count_once_never_retry_even_on_restart(self):
        self.writer.return_value = response(en="<script>unsafe</script>")
        self.request()
        failed = self.settle()
        self.assertEqual(failed["status"], "failed")
        self.assertEqual(failed["accounting"]["attempts"], 1)
        self.assertEqual(failed["accounting"]["promptTokens"], 100)
        self.assertIsNone(failed["text"])
        for _ in range(3):
            self.request()
        self.service.close()
        reopened = LiveNarrative(self.journeys, self.auth, self.writer)
        self.addCleanup(reopened.close)
        self.assertEqual(reopened.request({"journey": self.owner, "brief": "event.coins"}, self.token)["status"], "failed")
        self.writer.assert_called_once()

    def test_provider_error_has_unknown_billing_and_explicit_failure(self):
        self.writer.side_effect = WorkshopError("OVH unavailable. No automatic retry.", 502)
        self.request()
        result = self.settle()
        self.assertEqual(result["status"], "failed")
        self.assertIn("unavailable", result["error"])
        self.assertEqual(result["accounting"]["unknownUsage"], 1)

    def test_disabled_does_not_dispatch_or_enqueue(self):
        disabled = LiveNarrative(self.journeys, self.auth)
        self.addCleanup(disabled.close)
        result = disabled.request({"journey": self.owner, "brief": "event.coins"}, self.token)
        self.assertFalse(result["enabled"])
        self.assertEqual(result["status"], "disabled")
        self.assertEqual(result["accounting"]["attempts"], 0)
        self.writer.assert_not_called()

    def test_disabling_key_retains_accounting_but_uses_authored_text(self):
        self.request()
        self.settle()
        self.service.close()
        disabled = LiveNarrative(self.journeys, self.auth)
        self.addCleanup(disabled.close)
        result = disabled.request({"journey": self.owner, "brief": "event.coins"}, self.token)
        self.assertEqual(result["status"], "disabled")
        self.assertIsNone(result["text"])
        self.assertEqual(result["accounting"]["attempts"], 1)
        self.writer.assert_called_once()

    def test_queue_and_concurrency_bounded_without_blocking_authored_ui(self):
        entered, release = threading.Event(), threading.Event()
        def generate(brief):
            entered.set()
            if not release.wait(5):
                raise WorkshopError("Test was not released", 502)
            return response()
        self.writer.side_effect = generate
        self.request()
        try:
            self.assertTrue(entered.wait(5))
            with patch("live_narrative.QUEUE_LIMIT", 1):
                with self.assertRaises(JourneyCapacity):
                    self.request("event.food")
            for _ in range(5):
                self.assertEqual(self.request()["status"], "running")
            self.assertEqual(self.writer.call_count, 1)
        finally:
            release.set()
        self.settle()

    def test_no_live_total_cap_beyond_separate_workshop_twenty(self):
        self.assertEqual(LIMIT, 20)
        for brief in CATALOGUE:
            self.request(brief)
            self.settle(brief)
        self.assertGreater(self.writer.call_count, 20)
        self.assertEqual(self.request()["accounting"]["attempts"], len(CATALOGUE))

    def test_interrupted_running_attempt_never_retried_queued_resumes(self):
        self.service.close()
        with self.service.connect() as db:
            db.execute("INSERT INTO wording(owner,brief,version,status,created,calls) VALUES(?,?,?,'running',0,1)",
                       (self.owner, "event.coins", VERSION))
            db.execute("INSERT INTO wording(owner,brief,version,status,created) VALUES(?,?,?,'queued',0)",
                       (self.owner, "event.food", VERSION))
        resumed = LiveNarrative(self.journeys, self.auth, self.writer)
        self.addCleanup(resumed.close)
        resumed.future.result(timeout=5)
        self.assertEqual(resumed.request({"journey": self.owner, "brief": "event.coins"}, self.token)["status"], "failed")
        self.assertEqual(resumed.request({"journey": self.owner, "brief": "event.food"}, self.token)["status"], "ready")
        self.writer.assert_called_once_with(CATALOGUE["event.food"])

    def test_optional_key_loader_and_fixed_provider_request(self):
        with patch.dict("os.environ", {}, clear=True), patch("live_narrative.private_file") as loader:
            disabled = LiveNarrative.configured(self.journeys, self.auth)
            self.addCleanup(disabled.close)
            loader.assert_not_called()
        with patch.dict("os.environ", {"ARCANE_LIVE_TEXT_TOKEN_FILE": "/private/key"}):
            with patch("live_narrative.private_file", return_value="test-private-key\n") as loader:
                configured = LiveNarrative.configured(self.journeys, self.auth)
                self.addCleanup(configured.close)
                loader.assert_called_once_with(Path("/private/key"))
                self.assertIsInstance(configured.writer, OvhWriter)
                self.assertEqual(configured.writer.model, MODEL)
        request = provider_request(CATALOGUE["event.coins"], MODEL)
        self.assertEqual(request["max_tokens"], 500)
        self.assertFalse(request["stream"])
        self.assertEqual(json.loads(request["messages"][1]["content"]), CATALOGUE["event.coins"])
        self.assertEqual(set(request["response_format"]["json_schema"]["schema"]["properties"]), {"en", "fr"})

    def test_truncation_structure_and_output_bounds_rejected(self):
        invalid = [{}, {"choices": []}, response(en="x" * 401), response(fr="line\nbreak"), response(en="https://url")]
        truncated = response()
        truncated["choices"][0]["finish_reason"] = "length"
        invalid.append(truncated)
        for value in invalid:
            with self.assertRaises(WorkshopError):
                validate_output(value)

    def test_real_http_route_requires_auth_origin_and_registered_brief(self):
        jobs = ChunkJobs(self.chunks)
        self.addCleanup(lambda: jobs.pool.shutdown(wait=True))
        with patch("travel_server.LiveNarrative.configured", return_value=self.service):
            handler = make_handler(self.chunks, jobs)
        self.addCleanup(handler.journal_art.close)
        server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        thread = threading.Thread(target=server.serve_forever)
        thread.start()
        self.addCleanup(thread.join)
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        url = f"http://127.0.0.1:{server.server_port}/api/live-narrative"
        def post(data, token=self.token, origin=None):
            headers = {"Content-Type": "application/json", "X-Journal-Capability": token}
            if origin:
                headers["Origin"] = origin
            return urllib.request.urlopen(urllib.request.Request(
                url, data=json.dumps(data).encode(), headers=headers), timeout=5)
        data = {"journey": self.owner, "brief": "event.coins"}
        with post(data) as result:
            self.assertEqual(result.status, 200)
            self.assertEqual(result.headers["Cache-Control"], "no-store")
        self.settle()
        for changed, token, origin, status in [
            (data, "b" * 64, None, 403),
            ({**data, "prompt": "arbitrary"}, self.token, None, 400),
            (data, self.token, "https://evil.example", 403),
        ]:
            with self.assertRaises(urllib.error.HTTPError) as error:
                post(changed, token, origin)
            self.assertEqual(error.exception.code, status)
            error.exception.close()
        self.writer.assert_called_once()


if __name__ == "__main__":
    unittest.main()
