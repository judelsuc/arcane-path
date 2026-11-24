import copy
import json
import unittest
from unittest.mock import Mock, patch
from concurrent.futures import ThreadPoolExecutor

from abandoned_journals import JournalForbidden
from content_factory import WorkshopError
from journal_art import JournalArt
from journeys import JourneyRequest, JourneyConflict
from live_narrative import LiveNarrative, MODEL, provider_request
import legend_wording
import test_legend_sessions as fixtures


def output():
    return {
        "en": "They kept the memory of an evening shared by neighbours, long after the gathering had faded.",
        "fr": "Le souvenir d'une soirée entre voisins est resté vivant bien après la fin des rencontres.",
        "alternatives": [
            {"en": "What mattered was preserving something others could remember, not showing off a fortune.",
             "fr": "Le plus utile était de conserver un souvenir commun, pas de faire étalage d'une fortune."},
            {"en": "I like to think the old memento still carries a little of the warmth they shared.",
             "fr": "J'aime croire que cet ancien souvenir garde un peu de la chaleur qu'ils partageaient."},
            {"en": "People embroider these tales, but keeping a memory hardly needs an extraordinary explanation.",
             "fr": "On embellit ces histoires, mais garder un souvenir ne demande aucune explication extraordinaire."},
        ]}


def response(value=None):
    return {"choices": [{"finish_reason": "stop", "message": {"content": json.dumps(value or output())}}],
            "usage": {"prompt_tokens": 20, "completion_tokens": 80, "total_tokens": 100}}


class LegendWordingTests(unittest.TestCase):
    def setUp(self):
        fixture = fixtures.LegendSessionTests()
        fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        self.fixture = fixture
        self.entry = fixture.discover()
        with fixture.legends.assets.catalogue.connection() as db:
            db.execute("DELETE FROM town_legend_rewards WHERE town_id=?", (self.entry["townId"],))
        self.auth = JournalArt(fixture.fixture.journeys, fixture.fixture.abandoned)
        self.addCleanup(self.auth.close)
        self.writer = Mock(return_value=response())
        self.service = self.make_service()
        self.journey, self.token = fixture.journey, fixture.token

    def make_service(self, writer=True):
        service = LiveNarrative(self.fixture.fixture.journeys, self.auth, self.writer if writer else None)
        service.town_legends = self.fixture.legends
        self.addCleanup(service.close)
        return service

    def request(self, **fields):
        return self.service.request({"journey": self.journey, "brief": legend_wording.BRIEF,
                                     "townId": self.entry["townId"], **fields}, self.token)

    def settle(self):
        self.service.future.result(timeout=5)
        return self.request()

    def test_retained_shared_story_and_three_voices_are_one_attempt_without_private_provider_data(self):
        before = self.fixture.fixture.journeys.read(self.journey)
        self.request()
        result = self.settle()
        self.assertEqual(result["status"], "ready")
        self.assertEqual(result["text"], {key: output()[key] for key in ("en", "fr")})
        self.assertEqual(result["alternatives"], output()["alternatives"])
        self.assertEqual(result["accounting"]["attempts"], 1)
        brief = self.writer.call_args.args[0]
        prompt = json.dumps(brief)
        for secret in (self.journey, self.token, self.entry["townId"], "col", "row", "latitude", "longitude"):
            self.assertNotIn(secret, prompt)
        self.assertEqual(brief["voices"], list(legend_wording.VOICES))
        self.assertEqual(self.fixture.fixture.journeys.read(self.journey), before)
        with self.fixture.legends.assets.catalogue.connection() as db:
            original = self.fixture.legends.search(db, self.entry["townId"])[1]
        self.service.close()
        self.service = self.make_service()
        self.assertEqual(self.request(), result)
        with patch.object(legend_wording, "VERSION", "town-legend-wording-future"):
            self.assertEqual(self.request(), result, "prepared stories never regenerate after a wording version change")
        other, token = self.fixture.fixture.source()
        self.fixture.legends.request({"journey": other, "action": "discover", "location": self.fixture.location}, token)
        shared = self.service.request({"journey": other, "brief": legend_wording.BRIEF,
                                       "townId": self.entry["townId"]}, token)
        self.assertEqual(shared, result)
        self.writer.assert_called_once()
        with self.fixture.legends.assets.catalogue.connection() as db:
            self.assertEqual(self.fixture.legends.search(db, self.entry["townId"])[1], original)

    def test_composed_tales_wait_for_retained_name_and_every_witness_must_use_it_verbatim(self):
        from legend_rewards import choose_reward
        assets = self.fixture.legends.assets
        with assets.catalogue.connection() as db:
            reward = choose_reward(db, assets.catalogue.sql, self.entry["seed"])
            db.execute("INSERT INTO town_legend_rewards VALUES(?,?)", (self.entry["townId"], json.dumps(reward)))
        waiting = self.request()
        self.assertEqual(waiting["status"], "queued")
        self.assertEqual(waiting["phase"], "treasure-name")
        self.writer.assert_not_called()
        name = {"en": "The Northern Leaves", "fr": "Les Feuilles du nord"}
        reward["name"] = name
        with assets.catalogue.connection() as db:
            db.execute("UPDATE town_legend_rewards SET payload=? WHERE town_id=?",
                       (json.dumps(reward), self.entry["townId"]))
        named = output()
        for pair in [named, *named["alternatives"]]:
            for language in ("en", "fr"):
                pair[language] = name[language] + ": " + pair[language]
        self.writer.return_value = response(named)
        self.request()
        ready = self.settle()
        self.assertEqual(ready["status"], "ready")
        self.assertEqual(ready["treasureName"], name)
        brief = self.writer.call_args.args[0]
        self.assertEqual(brief["treasureName"], name)
        self.assertEqual(brief["treasureNature"], reward["nature"])
        for pair in [ready["text"], *ready["alternatives"]]:
            for language in ("en", "fr"):
                self.assertIn(name[language], pair[language])
        for index in range(4):
            invalid = copy.deepcopy(named)
            pair = invalid if index == 0 else invalid["alternatives"][index - 1]
            pair["en"] = pair["en"].replace(name["en"], "Another object")
            with self.assertRaises(WorkshopError):
                legend_wording.validate_output(response(invalid), brief)

    def test_failed_naming_does_not_dispatch_an_unnamed_legend(self):
        from legend_rewards import choose_reward
        from reward_names import KIND, request_key
        assets = self.fixture.legends.assets
        with assets.catalogue.connection() as db:
            reward = choose_reward(db, assets.catalogue.sql, self.entry["seed"])
            db.execute("INSERT INTO town_legend_rewards VALUES(?,?)", (self.entry["townId"], json.dumps(reward)))
            db.execute("UPDATE worker_jobs SET status='failed',error='Naming failed' WHERE kind=? AND request=?",
                       (KIND, request_key(self.entry["townId"])))
        result = self.request()
        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["phase"], "treasure-name")
        self.assertEqual(result["error"], "Naming failed")
        self.writer.assert_not_called()

    def test_undiscovered_towns_private_capabilities_and_arbitrary_prompts_never_dispatch(self):
        for extra in ({"prompt": "invent"}, {"seed": 1}, {"clues": ["invent"]},
                      {"keeper": self.journey}, {"regenerate": "a" * 32}, {"townId": "invalid"}):
            with self.assertRaises(JourneyRequest):
                self.request(**extra)
        with self.assertRaises(JourneyConflict):
            self.request(townId="node/99999")
        with self.assertRaises(JournalForbidden):
            self.service.request({"journey": self.journey, "brief": legend_wording.BRIEF,
                                   "townId": self.entry["townId"]}, "b" * 64)
        other, token = self.fixture.fixture.source()
        with self.assertRaises(JourneyConflict):
            self.service.request({"journey": other, "brief": legend_wording.BRIEF,
                                   "townId": self.entry["townId"]}, token)
        self.writer.assert_not_called()

    def test_invalid_prose_or_provider_failure_remains_failed_without_rebilling(self):
        self.writer.return_value = response({**output(), "en": "Go north and pay 50 coins to enter the hidden cellar."})
        self.request()
        result = self.settle()
        self.assertEqual(result["status"], "failed")
        self.assertIsNone(result["text"])
        self.assertEqual(result["accounting"]["attempts"], 1)
        self.service.close()
        self.service = self.make_service()
        self.assertEqual(self.request(), result)
        self.writer.assert_called_once()

    def test_disabled_generation_does_not_dispatch_and_canonical_search_stays_available(self):
        self.service.close()
        self.service = self.make_service(writer=False)
        self.assertEqual(self.request()["status"], "disabled")
        self.writer.assert_not_called()
        self.assertEqual(self.fixture.discover()["exploration"]["clues"], self.entry["exploration"]["clues"])

    def test_schema_variation_and_strict_output_bounds(self):
        payload = self.fixture.legends.narrative_definition(self.journey, self.entry["townId"], self.token)
        request = provider_request(payload, MODEL)
        self.assertEqual(request["response_format"]["json_schema"]["schema"]["properties"]["alternatives"]["minItems"], 3)
        self.assertIn("exact canonical entrance clues separately", request["messages"][0]["content"])
        self.assertEqual(legend_wording.validate_output(response()), output())
        for alter in (
            lambda value: value.update(en="<script>" + value["en"]),
            lambda value: value.update(en="x" * 701),
            lambda value: value["alternatives"].pop(),
            lambda value: value["alternatives"].append(value["alternatives"][0]),
            lambda value: value["alternatives"][1].update(en=value["alternatives"][0]["en"]),
            lambda value: value.update(extra="invented"),
        ):
            value = copy.deepcopy(output())
            alter(value)
            with self.assertRaises(WorkshopError):
                legend_wording.validate_output(response(value))

    def test_shared_catalogue_instances_dispatch_only_once_and_restart_reuses_output(self):
        from asset_storage import local_storage
        self.service.close()
        assets = local_storage(self.fixture.fixture.journeys.path.parent / "legend-wording-shared")
        self.addCleanup(assets.catalogue.close)
        with self.fixture.fixture.journeys.connect() as db:
            row = db.execute("SELECT id,request_id,payload,checksum FROM journeys WHERE id=?", (self.journey,)).fetchone()
        with assets.catalogue.connection() as db:
            db.execute("INSERT INTO journeys(id,request_id,payload,checksum) VALUES(?,?,?,?)", row)
        self.fixture.fixture.journeys.assets = assets
        self.service = self.make_service()
        other = self.make_service()
        body = {"journey": self.journey, "brief": legend_wording.BRIEF, "townId": self.entry["townId"]}
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda index: (self.service if index % 2 else other).request(body, self.token), range(12)))
        self.assertTrue(all(result["status"] in ("queued", "running", "ready") for result in results))
        for service in (self.service, other):
            if service.future:
                service.future.result(timeout=5)
        result = self.request()
        self.assertEqual(result["status"], "ready")
        self.writer.assert_called_once()
        self.service.close()
        other.close()
        self.service = self.make_service()
        self.assertEqual(self.request(), result)
