import json
import hashlib
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
from live_narrative import CATALOGUE, COVER_BRIEF, DREAM_BRIEF, MODEL, VERSION, LiveNarrative, provider_request, validate_output, version_for
from opening_story import BRIEF_ID, opening_brief, validate_parent_reference
from closing_story import BRIEF_ID as CLOSING_BRIEF, LIMITS, closing_brief
from travel_server import ChunkStore, ChunkJobs, atomic_write, make_handler


def response(en="A passer-by offers you a few coins.", fr="Un passant vous offre quelques pièces.", variants=False):
    output = {"en": en, "fr": fr}
    if variants:
        output["alternatives"] = [
            {"en": "You receive a few coins from a passer-by.", "fr": "Vous recevez quelques pièces d'un passant."},
            {"en": "For the road, a passer-by gives you some coins.", "fr": "Pour la route, un passant vous donne des pièces."},
        ]
    return {"choices": [{"finish_reason": "stop", "message": {
        "content": json.dumps(output)}}],
        "usage": {"prompt_tokens": 100, "completion_tokens": 30, "total_tokens": 130}}


class LiveNarrativeTests(unittest.TestCase):
    def test_explicit_regeneration_retains_previous_story_and_deduplicates_stable_request(self):
        name = self.journeys.read(self.owner)["state"]["trail"]["parentName"]
        self.writer.return_value = response(en=(f"Your parent {name} left. " * 30).strip(),
                                            fr=(f"Votre parent {name} est parti. " * 30).strip())
        self.request(BRIEF_ID)
        original = self.settle(BRIEF_ID)
        self.assertEqual(original["status"], "ready")
        request_id = "e" * 32
        entered, release = threading.Event(), threading.Event()
        def write(brief):
            entered.set()
            if not release.wait(5):
                raise WorkshopError("Test wait expired", 502)
            return response(en=(f"You follow your parent {name} with playful curiosity. " * 20).strip(),
                            fr=(f"Votre parent {name} inspire votre curiosité malicieuse. " * 20).strip())
        self.writer.side_effect = write
        try:
            pending = self.request(BRIEF_ID, nameFlavour=True, regenerate=request_id)
            self.assertTrue(entered.wait(5))
            self.assertEqual(pending["previousText"], original["text"])
            self.assertEqual(self.request(BRIEF_ID)["previousText"], original["text"])
            self.request(BRIEF_ID, nameFlavour=True, regenerate=request_id)
        finally:
            release.set()
        self.service.future.result(timeout=5)
        result = self.request(BRIEF_ID)
        self.assertEqual(result["status"], "ready")
        self.assertNotEqual(result["text"], original["text"])
        self.assertEqual(self.request(BRIEF_ID, nameFlavour=True, regenerate=request_id), result)
        self.assertEqual(self.writer.call_count, 2)
        with self.service.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM wording WHERE brief=?", (BRIEF_ID,)).fetchone()[0], 2)
        self.assertEqual(self.writer.call_args.args[0]["characterName"], self.journeys.read(self.owner)["state"]["name"])
        self.writer.side_effect = WorkshopError("Provider unavailable", 502)
        self.request(BRIEF_ID, nameFlavour=True, regenerate="f" * 32)
        self.service.future.result(timeout=5)
        failed = self.request(BRIEF_ID)
        self.assertEqual(failed["status"], "failed")
        self.assertEqual(failed["previousText"], result["text"])
        for invalid in [{"regenerate": "a" * 32}, {"regenerate": "bad", "nameFlavour": True}]:
            with self.assertRaises(JourneyRequest):
                self.request(BRIEF_ID, **invalid)

    def test_contextual_events_cache_three_versions_per_kind_day_and_consent_without_leaking_private_state(self):
        context = {"day": 1, "walkingKm": 12, "sleeps": 1, "encounters": 2, "daily": "star"}
        self.request("event.clearHead", context=context, nameFlavour=True)
        self.service.future.result(timeout=5)
        result = self.request("event.clearHead", context=context, nameFlavour=True)
        self.assertEqual(result["status"], "ready")
        self.assertEqual(len(result["alternatives"]), 2)
        brief = self.writer.call_args.args[0]
        self.assertEqual(brief["facts"], CATALOGUE["event.clearHead"]["facts"])
        self.assertEqual(brief["characterName"], self.journeys.read(self.owner)["state"]["name"])
        self.assertEqual(brief["recordedJourney"]["walkingKm"], 12)
        self.assertNotIn(self.owner, json.dumps(brief))
        self.assertNotIn(self.token, json.dumps(brief))
        self.assertNotIn("trail", json.dumps(brief))
        self.request("event.clearHead", context={**context, "walkingKm": 15}, nameFlavour=True)
        self.assertEqual(self.writer.call_count, 1)
        self.request("event.clearHead", context={**context, "day": 2}, nameFlavour=True)
        self.service.future.result(timeout=5)
        self.assertEqual(self.writer.call_count, 2)
        self.request("event.clearHead", context=context)
        self.service.future.result(timeout=5)
        self.assertNotIn("characterName", self.writer.call_args.args[0])
        for bad in [{**context, "notes": "private"}, {**context, "day": True},
                    {**context, "walkingKm": -1}, {**context, "daily": "arbitrary prompt"}]:
            with self.assertRaises(JourneyRequest):
                self.request("event.clearHead", context=bad)

    def test_cover_subtitle_is_canonical_private_bilingual_durable_and_immutable(self):
        self.writer.return_value = response(en="A lantern on the autumn road.",
                                            fr="Une lanterne sur le chemin d'automne.")
        before = self.journeys.read(self.owner)
        self.request(COVER_BRIEF)
        result = self.settle(COVER_BRIEF)
        self.assertEqual(result["status"], "ready")
        self.assertEqual(result["alternatives"], [])
        self.assertEqual(result["accounting"]["attempts"], 1)
        brief = self.writer.call_args.args[0]
        self.assertEqual(set(brief), {"kind", "departure", "startingPlace", "landscape", "birthCard", "season"})
        self.assertEqual(brief["kind"], COVER_BRIEF)
        self.assertEqual(brief["birthCard"], before["state"]["birthCard"])
        encoded = json.dumps(brief)
        for secret in ["PRIVATE PLAYER", self.owner, self.token, "parentName", "latitude", "longitude",
                       *[stage["name"] for stage in before["state"]["trail"]["stages"]]]:
            self.assertNotIn(secret, encoded)
        request = provider_request(brief, MODEL)
        self.assertIn("subtitle", request["messages"][0]["content"])
        self.assertEqual(request["response_format"]["json_schema"]["schema"]["properties"]["fr"]["maxLength"], 160)
        self.assertEqual(self.journeys.read(self.owner), before)
        self.service.close()
        reopened = LiveNarrative(self.journeys, self.auth, self.writer)
        self.addCleanup(reopened.close)
        with patch("live_narrative.version_for", return_value="future-subtitle"):
            self.assertEqual(reopened.request({"journey": self.owner, "brief": COVER_BRIEF}, self.token), result)
        self.writer.assert_called_once()

    def test_cover_subtitle_rejects_client_prompts_and_invalid_generated_text_without_retry(self):
        for extra in [{"summary": {"name": "PRIVATE"}}, {"nameFlavour": True}, {"prompt": "invent"}]:
            with self.assertRaises(JourneyRequest):
                self.request(COVER_BRIEF, **extra)
        self.writer.assert_not_called()
        self.writer.return_value = response(en="x" * 161, fr="Un sous-titre.")
        self.request(COVER_BRIEF)
        result = self.settle(COVER_BRIEF)
        self.assertEqual(result["status"], "failed")
        self.assertIsNone(result["text"])
        self.request(COVER_BRIEF)
        self.writer.assert_called_once()

    def closing_summary(self, outcome="reunion"):
        return {"outcome": outcome, **{key: 0 for key in LIMITS},
                "walkingMeters": 309000, "elapsedMinutes": 40525, "stagesReached": 10,
                "meals": 46, "sleeps": 25,
                "reachedStages": [{"stage": stage, "elapsedMinutes": stage * 100} for stage in range(10)],
                "events": []}

    def test_closing_chronicle_is_bilingual_immutable_private_and_durable(self):
        self.writer.return_value = response(
            en=("Your search has ended, and the road remains in memory. " * 15).strip(),
            fr=("Votre recherche est finie, et la route reste en mémoire. " * 15).strip())
        before = self.journeys.read(self.owner)
        summary = self.closing_summary()
        self.request(CLOSING_BRIEF, summary=summary)
        result = self.settle_closing(summary)
        self.assertEqual(result["status"], "ready")
        self.assertEqual(result["accounting"]["attempts"], 1)
        self.assertEqual(result["alternatives"], [])
        self.assertGreaterEqual(len(result["text"]["fr"]), 600)
        brief = self.writer.call_args.args[0]
        self.assertEqual(brief["recordedJourney"]["walkingMeters"], 309000)
        self.assertIn("triumphant", brief["tone"])
        for secret in ["PRIVATE PLAYER", self.owner, self.token, "latitude", "longitude", "parentName"]:
            self.assertNotIn(secret, json.dumps(brief))
        self.assertEqual(self.journeys.read(self.owner), before)
        self.assertEqual(self.request(CLOSING_BRIEF, summary=self.closing_summary("hunger")), result)
        request = provider_request(brief, MODEL)
        self.assertEqual(request["max_tokens"], 2400)
        self.assertIn("ending is immutable", request["messages"][0]["content"])
        self.assertEqual(request["response_format"]["json_schema"]["schema"]["properties"]["fr"]["maxLength"], 3000)
        self.service.close()
        reopened = LiveNarrative(self.journeys, self.auth, self.writer)
        self.addCleanup(reopened.close)
        with patch("live_narrative.CLOSING_VERSION", "future-ending"):
            self.assertEqual(reopened.request({
                "journey": self.owner, "brief": CLOSING_BRIEF, "summary": summary}, self.token), result)
        self.writer.assert_called_once()

    def settle_closing(self, summary):
        self.service.future.result(timeout=5)
        return self.request(CLOSING_BRIEF, summary=summary)

    def test_closing_rewrite_is_explicit_replay_safe_and_preserves_original_ending(self):
        self.writer.return_value = response(
            en=("Your search has ended, and the road remains in memory. " * 15).strip(),
            fr=("Votre recherche est finie, et la route reste en mémoire. " * 15).strip())
        summary = self.closing_summary("hunger")
        self.request(CLOSING_BRIEF, summary=summary)
        original = self.settle_closing(summary)
        before = self.journeys.read(self.owner)
        brief = self.writer.call_args.args[0]
        entered, release = threading.Event(), threading.Event()

        def write(payload):
            entered.set()
            if not release.wait(5):
                raise WorkshopError("Test wait expired", 502)
            return response(
                en=("Your courage on the road belongs to this remembered journey. " * 15).strip(),
                fr=("Votre courage sur le chemin appartient au souvenir de ce voyage. " * 15).strip())

        self.writer.side_effect = write
        altered = {**summary, "outcome": "reunion", "meals": 99}
        try:
            pending = self.request(CLOSING_BRIEF, summary=altered, regenerate="d" * 32)
            self.assertTrue(entered.wait(5))
            self.assertEqual(pending["previousText"], original["text"])
            self.request(CLOSING_BRIEF, summary=altered, regenerate="d" * 32)
        finally:
            release.set()
        result = self.settle_closing(summary)
        self.assertEqual(result["status"], "ready")
        self.assertEqual(self.writer.call_count, 2)
        self.assertEqual(self.writer.call_args.args[0], brief)
        self.assertEqual(self.request(CLOSING_BRIEF, summary=summary, regenerate="d" * 32), result)
        self.writer.side_effect = WorkshopError("Provider unavailable", 502)
        self.request(CLOSING_BRIEF, summary=summary, regenerate="e" * 32)
        failed = self.settle_closing(summary)
        self.assertEqual(failed["status"], "failed")
        self.assertEqual(failed["previousText"], result["text"])
        self.assertEqual(self.journeys.read(self.owner), before)
        self.assertIn("back cover", provider_request(brief, MODEL)["messages"][0]["content"])
        for changes in [{"regenerate": "bad"}, {"regenerate": "f" * 32, "nameFlavour": True}]:
            with self.assertRaises(JourneyRequest):
                self.request(CLOSING_BRIEF, summary=summary, **changes)

    def test_closing_prompt_includes_only_reached_places_and_canonical_retained_events(self):
        record = self.journeys.read(self.owner)
        before = json.dumps(record, sort_keys=True)
        summary = {**self.closing_summary("hunger"), "stagesReached": 2,
                   "reachedStages": [{"stage": 0, "elapsedMinutes": 120}, {"stage": 1, "elapsedMinutes": None}],
                   "recordedEncounters": 3, "events": [
                       {"kind": "food", "elapsedMinutes": 60},
                       {"kind": "whiteDeer", "elapsedMinutes": 200},
                       {"kind": "dogEncounter", "elapsedMinutes": 300},
                   ]}
        brief = closing_brief(summary, record)
        stages = record["state"]["trail"]["stages"]
        self.assertEqual(brief["reachedStages"], [
            {"place": stages[0]["name"], "elapsedMinutes": 120},
            {"place": stages[1]["name"], "elapsedMinutes": None},
        ])
        serialized = json.dumps(brief)
        for stage in stages[2:]:
            self.assertNotIn(stage["name"], serialized)
        self.assertIn("snack", brief["recordedEvents"][0]["event"])
        self.assertIn("seemed", brief["recordedEvents"][1]["event"])
        self.assertIn("not established", brief["recordedEvents"][2]["event"])
        self.assertEqual([event["elapsedMinutes"] for event in brief["recordedEvents"]], [60, 200, 300])
        self.assertIn("Older events may be missing", brief["coverage"])
        self.assertEqual(json.dumps(record, sort_keys=True), before)
        prompt = provider_request(brief, MODEL)["messages"][0]["content"]
        self.assertIn("several meaningful intermediate encounters", prompt)
        self.assertIn("null time supplies no chronology", prompt)

    def test_closing_milestones_reject_arbitrary_text_hidden_details_and_invalid_order(self):
        base = self.closing_summary("hunger")
        for changes in [
            {"reachedStages": []},
            {"reachedStages": [{"stage": 0, "elapsedMinutes": 1, "place": "INVENTED"}], "stagesReached": 1},
            {"reachedStages": [{"stage": -1, "elapsedMinutes": 1}], "stagesReached": 1},
            {"reachedStages": [{"stage": 13, "elapsedMinutes": 1}], "stagesReached": 1},
            {"reachedStages": [{"stage": True, "elapsedMinutes": 1}], "stagesReached": 1},
            {"reachedStages": [{"stage": 0, "elapsedMinutes": -1}], "stagesReached": 1},
            {"reachedStages": [{"stage": 0, "elapsedMinutes": 50000}], "stagesReached": 1},
            {"reachedStages": [{"stage": 0, "elapsedMinutes": 2}, {"stage": 0, "elapsedMinutes": 3}], "stagesReached": 2},
            {"reachedStages": [{"stage": 0, "elapsedMinutes": 2}, {"stage": 1, "elapsedMinutes": 1}], "stagesReached": 2},
            {"events": [{"kind": "food", "elapsedMinutes": 1}]},
            {"events": [{"kind": "PRIVATE PROMPT", "elapsedMinutes": 1}], "recordedEncounters": 1},
            {"events": [{"kind": "food", "elapsedMinutes": 1, "text": "PRIVATE"}], "recordedEncounters": 1},
            {"events": [{"kind": "food", "elapsedMinutes": True}], "recordedEncounters": 1},
            {"events": [{"kind": "food", "elapsedMinutes": -1}], "recordedEncounters": 1},
            {"events": [{"kind": "food", "elapsedMinutes": 50000}], "recordedEncounters": 1},
            {"events": [{"kind": "food", "elapsedMinutes": 2}, {"kind": "coins", "elapsedMinutes": 1}], "recordedEncounters": 2},
            {"events": [{"kind": "food", "elapsedMinutes": 1}] * 33, "recordedEncounters": 33},
        ]:
            with self.subTest(changes=changes), self.assertRaises(JourneyRequest):
                self.request(CLOSING_BRIEF, summary={**base, **changes})
        self.writer.assert_not_called()

    def test_closing_input_accepts_only_terminal_outcomes_and_strict_bounded_counters(self):
        record = self.journeys.read(self.owner)
        for outcome in ["health", "hunger", "fatigue", "sleep", "reunion"]:
            brief = closing_brief(self.closing_summary(outcome), record)
            self.assertIn("triumphant" if outcome == "reunion" else "bittersweet", brief["tone"])
            self.assertIn("reunited" if outcome == "reunion" else "died", brief["ending"])
        for summary in [
            None, {}, self.closing_summary(None), self.closing_summary("placement"),
            {**self.closing_summary(), "notes": "PRIVATE"}, {**self.closing_summary(), "name": "PRIVATE"},
            {**self.closing_summary(), "walkingMeters": True},
            {**self.closing_summary(), "elapsedMinutes": float("nan")},
            {**self.closing_summary(), "ascentMeters": float("inf")},
            {**self.closing_summary(), "meals": -1}, {**self.closing_summary(), "sleeps": 1.5},
            {**self.closing_summary(), "recordedDreams": 129},
            {**self.closing_summary(), "stagesReached": len(record["state"]["trail"]["stages"]) + 1},
        ]:
            with self.assertRaises(JourneyRequest):
                self.request(CLOSING_BRIEF, summary=summary)
        with self.assertRaises(JourneyRequest):
            self.request("event.coins", summary=self.closing_summary())
        with self.assertRaises(JourneyRequest):
            self.request(CLOSING_BRIEF)
        with self.assertRaises(JourneyRequest):
            self.request(CLOSING_BRIEF, summary=self.closing_summary(), nameFlavour=True)
        with self.assertRaises(JournalForbidden):
            self.service.request({"journey": self.owner, "brief": CLOSING_BRIEF,
                                  "summary": self.closing_summary()}, "b" * 64)
        self.writer.assert_not_called()

    def test_closing_failure_is_once_only_and_uses_separate_output_bounds(self):
        summary = self.closing_summary("hunger")
        self.writer.return_value = response()
        self.request(CLOSING_BRIEF, summary=summary)
        result = self.settle_closing(summary)
        self.assertEqual(result["status"], "failed")
        self.assertIsNone(result["text"])
        self.assertIn("authored text retained", result["error"])
        self.request(CLOSING_BRIEF, summary=summary)
        self.writer.assert_called_once()
        for value in [response(en="a" * 599, fr="b" * 600),
                      response(en="a" * 3001, fr="b" * 600),
                      response(en="<script>" + "a" * 600, fr="b" * 600)]:
            with self.assertRaises(WorkshopError):
                validate_output(value, closing=True)
        valid = response(en="a" * 600 + "\n\n" + "b" * 600, fr="c" * 3000)
        self.assertEqual(len(validate_output(valid, closing=True)["fr"]), 3000)

    def test_dream_variants_are_private_durable_and_do_not_reversion_existing_content(self):
        old_catalogue = {key: value for key, value in CATALOGUE.items() if key != DREAM_BRIEF}
        self.assertEqual(VERSION, hashlib.sha256(json.dumps(old_catalogue, sort_keys=True).encode()).hexdigest()[:16] + "-2")
        self.assertEqual(version_for("event.coins"), VERSION + "-variants-1")
        self.assertEqual(version_for("npc.hospitality.greeting"), VERSION)
        self.assertNotEqual(version_for(DREAM_BRIEF), VERSION)
        before = self.journeys.read(self.owner)
        self.request(DREAM_BRIEF)
        result = self.settle(DREAM_BRIEF)
        self.assertEqual(result["status"], "ready")
        self.assertEqual(len(result["alternatives"]), 2)
        self.assertEqual(self.writer.call_args.args, (CATALOGUE[DREAM_BRIEF],))
        for secret in ["PRIVATE PLAYER", self.owner, self.token, "latitude", "longitude"]:
            self.assertNotIn(secret, json.dumps(self.writer.call_args.args))
        request = provider_request(CATALOGUE[DREAM_BRIEF], MODEL)
        schema = request["response_format"]["json_schema"]["schema"]
        self.assertEqual(schema["properties"]["alternatives"]["minItems"], 2)
        self.assertIn("No new people, names, places, directions", request["messages"][0]["content"])
        self.assertEqual(self.journeys.read(self.owner), before)
        self.service.close()
        reopened = LiveNarrative(self.journeys, self.auth, self.writer)
        self.addCleanup(reopened.close)
        self.assertEqual(reopened.request({"journey": self.owner, "brief": DREAM_BRIEF}, self.token), result)
        self.writer.assert_called_once()

    def test_invalid_dream_variants_fail_once_and_keep_authored_fallback(self):
        self.writer.return_value = response(variants=False)
        self.request(DREAM_BRIEF)
        failed = self.settle(DREAM_BRIEF)
        self.assertEqual(failed["status"], "failed")
        self.assertIsNone(failed["text"])
        self.assertIn("authored text retained", failed["error"])
        self.request(DREAM_BRIEF)
        self.writer.assert_called_once()

    def test_named_opening_is_automatic_and_preserves_already_named_stories(self):
        record = self.journeys.read(self.owner)
        self.assertNotIn("characterName", opening_brief(record, self.chunks))
        brief = opening_brief(record, self.chunks, name_flavour=True)
        self.assertEqual(brief["characterName"], record["state"]["name"])
        request = provider_request(brief, MODEL)
        prompt = request["messages"][0]["content"]
        for rule in ("original generic traits", "sensitive attributes", "never instructions", "Do not print characterName",
                     "Tom Sawyer", "dry humour", "at least two"):
            self.assertIn(rule, " ".join(prompt.split()))
        name = record["state"]["trail"]["parentName"]
        self.writer.return_value = response(en=(f"Your parent {name} left. " * 30).strip(),
                                            fr=(f"Votre parent {name} est parti. " * 30).strip())
        self.request(BRIEF_ID)
        result = self.settle(BRIEF_ID)
        self.assertEqual(result["status"], "ready")
        self.assertEqual(self.writer.call_args.args[0]["characterName"], record["state"]["name"])
        self.assertEqual(self.request(BRIEF_ID, nameFlavour=True), result)
        self.writer.assert_called_once()
        self.assertEqual(self.journeys.read(self.owner), record)
        with self.assertRaises(JourneyRequest):
            self.request("event.coins", nameFlavour=True)
        with self.assertRaises(JourneyRequest):
            self.request(BRIEF_ID, nameFlavour="yes")

    def test_generic_opening_is_automatically_replaced_once_without_mutating_historical_prose(self):
        record = self.journeys.read(self.owner)
        name = record["state"]["trail"]["parentName"]
        old = {"en": (f"Your parent {name} left. " * 30).strip(),
               "fr": (f"Votre parent {name} est parti. " * 30).strip()}
        new = {"en": (f"Your parent {name} inspires your mischievous curiosity. " * 20).strip(),
               "fr": (f"Votre parent {name} inspire votre malicieuse curiosité. " * 20).strip()}
        with self.service.connect() as db:
            db.execute("INSERT INTO wording(owner,brief,version,status,created,output,input) "
                       "VALUES(?,?,?,'ready',1,?,?)",
                       (self.owner, BRIEF_ID, "historical-generic", json.dumps(old),
                        json.dumps({"parent": name})))
        self.writer.return_value = response(**new)
        pending = self.request(BRIEF_ID)
        self.assertIn(pending["status"], ("queued", "running"))
        self.assertEqual(pending["previousText"], old)
        self.request(BRIEF_ID)
        result = self.settle(BRIEF_ID)
        self.assertEqual(result["status"], "ready")
        self.assertEqual(result["text"], new)
        self.assertEqual(self.writer.call_args.args[0]["characterName"], record["state"]["name"])
        self.writer.assert_called_once()
        for _ in range(3):
            self.assertEqual(self.request(BRIEF_ID)["text"], new)
        with self.service.connect() as db:
            rows = db.execute("SELECT version,output FROM wording WHERE brief=? ORDER BY created",
                              (BRIEF_ID,)).fetchall()
        self.assertEqual(len(rows), 2)
        self.assertEqual(json.loads(rows[0]["output"]), old)
        self.assertTrue(rows[1]["version"].endswith("-named-1"))
        self.assertEqual(self.journeys.read(self.owner), record)
        self.service.close()
        reopened = LiveNarrative(self.journeys, self.auth, self.writer)
        self.addCleanup(reopened.close)
        with patch("live_narrative.VERSION", "another-prompt"):
            self.assertEqual(reopened.request({"journey": self.owner, "brief": BRIEF_ID}, self.token)["text"], new)
        self.writer.assert_called_once()

    def test_failed_automatic_named_upgrade_is_not_retried(self):
        with self.service.connect() as db:
            db.execute("INSERT INTO wording(owner,brief,version,status,created) VALUES(?,?,?,'failed',1)",
                       (self.owner, BRIEF_ID, "historical-generic"))
        self.writer.side_effect = WorkshopError("Provider unavailable", 502)
        self.request(BRIEF_ID)
        failed = self.settle(BRIEF_ID)
        self.assertEqual(failed["status"], "failed")
        for _ in range(3):
            self.assertEqual(self.request(BRIEF_ID)["status"], "failed")
        self.writer.assert_called_once()

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
        self.writer = Mock(return_value=response(variants=True))
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
        self.assertEqual(len(result["alternatives"]), 2)
        self.assertEqual(len({result["text"]["fr"], *(v["fr"] for v in result["alternatives"])}), 3)
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
            return response(variants=True)
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
        self.writer.side_effect = lambda brief: response(variants=brief["kind"] == "introduction")
        for brief in CATALOGUE:
            self.request(brief)
            self.settle(brief)
        self.assertGreater(self.writer.call_count, 20)
        self.assertEqual(self.request()["accounting"]["attempts"], len(CATALOGUE))

    def test_interrupted_running_attempt_never_retried_queued_resumes(self):
        self.service.close()
        with self.service.connect() as db:
            db.execute("INSERT INTO wording(owner,brief,version,status,created,calls) VALUES(?,?,?,'running',0,1)",
                       (self.owner, "event.coins", version_for("event.coins")))
            db.execute("INSERT INTO wording(owner,brief,version,status,created) VALUES(?,?,?,'queued',0)",
                       (self.owner, "event.food", version_for("event.food")))
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
        self.assertEqual(request["max_tokens"], 1400)
        self.assertFalse(request["stream"])
        self.assertEqual(json.loads(request["messages"][1]["content"]), CATALOGUE["event.coins"])
        self.assertEqual(set(request["response_format"]["json_schema"]["schema"]["properties"]), {"en", "fr", "alternatives"})
        self.assertEqual(provider_request(CATALOGUE["npc.hospitality.greeting"], MODEL)["max_tokens"], 500)

    def test_variants_require_three_distinct_bounded_bilingual_versions(self):
        self.assertEqual(len(validate_output(response(variants=True), variants=True)["alternatives"]), 2)
        for alternatives in [[], [{"en": "Only one.", "fr": "Une seule."}],
                             [{"en": "A passer-by offers you a few coins.", "fr": "Autre phrase."}] * 2,
                             [{"en": "x" * 401, "fr": "Autre phrase."}] * 2]:
            value = response(variants=True)
            content = json.loads(value["choices"][0]["message"]["content"])
            content["alternatives"] = alternatives
            value["choices"][0]["message"]["content"] = json.dumps(content)
            with self.assertRaises(WorkshopError):
                validate_output(value, variants=True)

    def test_event_revision_preserves_old_text_without_rewriting_story_or_npc_cache(self):
        self.service.close()
        with self.service.connect() as db:
            db.execute("INSERT INTO wording(owner,brief,version,status,created,calls,output) "
                       "VALUES(?,?,?,'ready',0,1,?)",
                       (self.owner, "event.coins", VERSION, json.dumps({"en": "Previous text.", "fr": "Ancien texte."})))
        reopened = LiveNarrative(self.journeys, self.auth, self.writer)
        self.addCleanup(reopened.close)
        reopened.request({"journey": self.owner, "brief": "event.coins"}, self.token)
        reopened.future.result(timeout=5)
        result = reopened.request({"journey": self.owner, "brief": "event.coins"}, self.token)
        self.assertEqual(len(result["alternatives"]), 2)
        self.assertEqual(result["accounting"]["attempts"], 2)
        self.assertEqual(version_for("npc.hospitality.hosted"), VERSION)
        self.assertEqual(version_for(BRIEF_ID), VERSION)
        with reopened.connect() as db:
            old = json.loads(db.execute("SELECT output FROM wording WHERE version=?", (VERSION,)).fetchone()[0])
        self.assertEqual(old["fr"], "Ancien texte.")

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

        self.writer.return_value = response(en=("The road remains in memory. " * 30).strip(),
                                            fr=("La route reste en mémoire. " * 30).strip())
        ending = {"journey": self.owner, "brief": CLOSING_BRIEF, "summary": self.closing_summary("hunger")}
        with post(ending) as result:
            self.assertEqual(result.status, 200)
        self.assertEqual(self.settle_closing(ending["summary"])["status"], "ready")
        with self.assertRaises(urllib.error.HTTPError) as error:
            post({**ending, "summary": {**ending["summary"], "notes": "PRIVATE"}})
        self.assertEqual(error.exception.code, 400)
        error.exception.close()
        self.assertEqual(self.writer.call_count, 2)


if __name__ == "__main__":
    unittest.main()
