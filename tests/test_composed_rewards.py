import copy
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import Mock

from admin_console import save_collection
from asset_storage import AssetError, local_storage
from content_factory import WorkshopError
from daily_cosmetics import MODEL
from durable_jobs import DurableJobs
from legend_rewards import CATALOGUE, choose_reward
from reward_names import (KIND, PROVIDER, enqueue_name, generate_one, naming_brief,
                          provider_request, request_key, validate_name)
import test_admin_console as admin
import test_town_legends as towns


class ComposedRewardsTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.assets = local_storage(Path(directory.name))
        self.addCleanup(self.assets.catalogue.close)
        self.queue = DurableJobs(self.assets.catalogue)
        self.queue.configure_quota(PROVIDER, daily=10, monthly=310)
        self.town = "node/42"

    def retain(self, seed=1):
        with self.assets.catalogue.connection() as db:
            reward = choose_reward(db, self.assets.catalogue.sql, seed)
            db.execute("INSERT INTO town_legends VALUES(?,?,1,?,'investigation',0)", (self.town, "Town", seed))
            db.execute("INSERT INTO town_legend_rewards VALUES(?,?)", (self.town, json.dumps(reward)))
            enqueue_name(self.assets.catalogue, db, self.town, reward)
        return reward

    def read(self):
        with self.assets.catalogue.connection() as db:
            return json.loads(db.execute("SELECT payload FROM town_legend_rewards WHERE town_id=?", (self.town,)).fetchone()[0])

    def response(self, brief):
        return {"model": MODEL, "choices": [{"finish_reason": "stop", "message": {
            "content": json.dumps({"en": "The Copper Vigil", "fr": "La Veille de cuivre"})}}],
            "usage": {"prompt_tokens": 200, "completion_tokens": 40, "total_tokens": 240}}

    def test_javascript_and_python_compose_the_same_nature_then_compatible_effect_and_characteristics(self):
        seeds = list(range(256)) + [123456, 0xffffffff]
        script = ("import {composedReward} from './legend-rewards.mjs';"
                  f"console.log(JSON.stringify({json.dumps(seeds)}.map(composedReward)));")
        result = subprocess.run(["node", "--input-type=module", "-e", script],
                                cwd=Path(__file__).resolve().parents[1], check=True,
                                capture_output=True, text=True, timeout=30)
        with self.assets.catalogue.connection() as db:
            expected = [choose_reward(db, self.assets.catalogue.sql, seed) for seed in seeds]
        self.assertEqual(json.loads(result.stdout), expected)
        self.assertEqual(len({reward["nature"] for reward in expected}), len(CATALOGUE["natures"]))
        for reward in expected:
            nature = next(item for item in CATALOGUE["natures"] if item["id"] == reward["nature"])
            self.assertIn(reward["effect"], nature["effects"])

    def test_only_published_approved_icons_can_be_selected(self):
        value = admin.draft()
        from journey_storage import StoreConnection
        with self.assets.catalogue.connection() as raw:
            db = StoreConnection(raw, self.assets.catalogue, mapping=True)
            save_collection(db, value)
            self.assertNotIn("icon", choose_reward(raw, self.assets.catalogue.sql, 6))
            raw.execute("UPDATE admin_collections SET status='published',decisions=?", ('{"courier":"rejected"}',))
            self.assertNotIn("icon", choose_reward(raw, self.assets.catalogue.sql, 6))
            raw.execute("UPDATE admin_collections SET decisions=?", ('{"courier":"approved"}',))
            reward = choose_reward(raw, self.assets.catalogue.sql, 6)
        self.assertEqual(reward["nature"], "badge")
        self.assertEqual(reward["effect"], "portrait")
        self.assertEqual(reward["icon"]["id"], "generated:rain-couriers:courier")

    def test_first_discovery_pins_composition_and_artwork_even_after_more_publications(self):
        fixture = towns.TownLegendsTests()
        fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        fixture.random.side_effect = [0, 6, 1]
        fixture.request()
        with fixture.assets.catalogue.connection() as db:
            before = db.execute("SELECT payload FROM town_legend_rewards").fetchone()[0]
            self.assertNotIn("icon", json.loads(before))
            value = admin.draft()
            db.execute("INSERT INTO admin_collections VALUES(?,?,?,'published',1,0)",
                       (value["id"], json.dumps(value), '{"courier":"approved"}'))
        fixture.request(player=2)
        with fixture.assets.catalogue.connection() as db:
            self.assertEqual(db.execute("SELECT payload FROM town_legend_rewards").fetchone()[0], before)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM worker_jobs WHERE kind=?", (KIND,)).fetchone()[0], 1)

    def test_model_receives_selected_nature_effects_and_characteristics_and_only_returns_names(self):
        reward = self.retain(49)
        brief = naming_brief(reward)
        self.assertEqual(brief["nature"]["id"], "ring")
        self.assertTrue(brief["effect"]["cursed"])
        self.assertEqual(brief["effect"]["healthPercent"], 150)
        self.assertEqual(brief["characteristics"], {"material": reward["material"], "motif": reward["motif"]})
        request = provider_request(brief, MODEL)
        self.assertEqual(json.loads(request["messages"][1]["content"]), brief)
        self.assertEqual(request["response_format"]["json_schema"]["schema"]["required"], ["en", "fr"])
        self.assertNotIn(self.town, json.dumps(request))
        self.assertFalse(any(key in brief for key in ("journey", "player", "coordinates")))

    def test_generated_names_do_not_change_any_retained_mechanics_and_never_redispatch(self):
        before = self.retain()
        writer = Mock(side_effect=self.response)
        self.assertTrue(generate_one(self.assets, writer))
        after = self.read()
        self.assertEqual({key: value for key, value in after.items() if key != "name"}, before)
        self.assertEqual(after["name"]["en"], "The Copper Vigil")
        self.assertEqual(self.queue.inspect(KIND, request_key(self.town))["status"], "ready")
        self.assertFalse(generate_one(self.assets, writer))
        writer.assert_called_once_with(naming_brief(before))

    def test_invalid_name_or_provider_failure_keeps_composition_and_never_retries(self):
        before = self.retain()
        writer = Mock(return_value={})
        with self.assertRaises(WorkshopError):
            generate_one(self.assets, writer)
        self.assertEqual(self.read(), before)
        self.assertEqual(self.queue.inspect(KIND, request_key(self.town))["status"], "failed")
        self.assertFalse(generate_one(self.assets, writer))
        writer.assert_called_once()

    def test_late_name_is_rolled_back_and_no_automatic_second_dispatch_occurs(self):
        before = self.retain()
        def late(brief):
            with self.assets.catalogue.connection() as db:
                db.execute("UPDATE worker_jobs SET expires=0 WHERE kind=?", (KIND,))
            return self.response(brief)
        with self.assertRaisesRegex(AssetError, "lease expired"):
            generate_one(self.assets, late)
        self.assertEqual(self.read(), before)
        self.assertFalse(generate_one(self.assets, Mock(side_effect=AssertionError("redispatch"))))
        self.assertEqual(self.queue.inspect(KIND, request_key(self.town))["status"], "uncertain")

    def test_extra_effects_markup_or_missing_usage_in_model_output_are_not_accepted(self):
        response = self.response({})
        for name in ({"en": "A name", "fr": "Un nom", "effect": "invincible"},
                     {"en": "<script>alert(1)</script>", "fr": "Un nom"},
                     {"en": "Valid name", "fr": "https://example.test"}):
            invalid = copy.deepcopy(response)
            invalid["choices"][0]["message"]["content"] = json.dumps(name)
            with self.assertRaises(WorkshopError):
                validate_name(invalid)
        del response["usage"]
        with self.assertRaises(WorkshopError):
            validate_name(response)
