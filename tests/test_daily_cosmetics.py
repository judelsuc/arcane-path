import copy
from datetime import date, datetime, timedelta, timezone
import json
from pathlib import Path
import random
import subprocess
import sys
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from asset_storage import AssetError, local_storage
from content_factory import WorkshopError
from cosmetic_themes import THEMES
from daily_cosmetics import (DailyCosmetics, FreeIconWriter, KIND, MODEL, PARIS, PROVIDER,
                            choose_theme, provider_request, validate_response)
from journeys import JourneyRequest

ROOT = Path(__file__).resolve().parents[1]


class DailyCosmeticsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.icons = json.loads(subprocess.run(
            ["node", "--input-type=module", "-e",
             "import {PLAYER_ICONS} from './player-icons.mjs';console.log(JSON.stringify(PLAYER_ICONS.slice(0,6)));"],
            cwd=ROOT, check=True, capture_output=True, text=True, timeout=30).stdout)

    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.assets = local_storage(Path(directory.name))
        self.addCleanup(self.assets.catalogue.close)
        self.service = DailyCosmetics(self.assets)
        self.service.queue.configure_quota(PROVIDER, daily=1, monthly=31)
        self.day = date(2026, 11, 9)

    def response(self, brief):
        icons = [{key: value for key, value in icon.items() if key not in ("coat", "accent")}
                 for icon in copy.deepcopy(self.icons)]
        for index, icon in enumerate(icons):
            icon["id"] = f"role-{index + 1}"
        return {"choices": [{"finish_reason": "stop", "message": {"content": json.dumps({"icons": icons})}}],
                "model": MODEL, "usage": {"prompt_tokens": 500, "completion_tokens": 1800, "total_tokens": 2300}}

    def test_120_curated_themes_rotate_without_repeat_with_family_and_palette_diversity(self):
        self.assertEqual(len(THEMES), 120)
        self.assertEqual(len({theme["id"] for theme in THEMES}), 120)
        self.assertEqual(len({theme["family"] for theme in THEMES}), 12)
        for theme in THEMES:
            self.assertEqual(len(set(theme["roles"])), 6)
            self.assertTrue(theme["motifs"] and theme["title"])
        history = []
        with patch("daily_cosmetics.secrets.choice", side_effect=random.Random(42).choice):
            for index in range(240):
                day = (self.day + timedelta(days=index)).isoformat()
                cycle, theme, palette = choose_theme(history)
                self.assertEqual(cycle, index // 120)
                if history:
                    self.assertNotEqual(theme["family"], history[-1]["family"])
                self.assertNotIn(palette[0], [row["palette"] for row in history[-4:]])
                self.assertNotIn(theme["id"], [row["theme"] for row in history if row["cycle"] == cycle])
                history.append({"day": day, "cycle": cycle, "theme": theme["id"],
                                "family": theme["family"], "palette": palette[0]})

    def test_one_daily_set_is_retained_and_enters_administrator_review_without_import(self):
        brief = self.service.prepare(self.day)
        writer = Mock(side_effect=self.response)
        self.assertEqual(self.service.generate(self.day, writer)["status"], "ready")
        writer.assert_called_once_with(brief)
        reopened = DailyCosmetics(self.assets)
        with patch("daily_cosmetics.choose_theme", side_effect=AssertionError("reroll")):
            self.assertEqual(reopened.prepare(self.day), brief)
            self.assertEqual(reopened.generate(self.day, writer)["status"], "ready")
        writer.assert_called_once()
        with self.assets.catalogue.connection() as db:
            payload, decisions, status = db.execute("SELECT payload,decisions,status FROM admin_collections").fetchone()
            usage, actual = db.execute("SELECT usage,response_model FROM cosmetic_days").fetchone()
        collection = json.loads(payload)
        self.assertEqual(len(collection["icons"]), 6)
        self.assertEqual(status, "draft")
        self.assertEqual(decisions, "{}")
        self.assertEqual(json.loads(usage)["total_tokens"], 2300)
        self.assertEqual(actual, MODEL)
        self.assertEqual({icon["coat"] for icon in collection["icons"]}, {brief["palette"]["coat"]})
        self.assertEqual(collection["theme"], brief["theme"]["title"])

    def test_two_servers_dispatch_exactly_once_and_commit_one_draft(self):
        entered, release = threading.Event(), threading.Event()
        def write(brief):
            entered.set()
            release.wait(5)
            return self.response(brief)
        writer = Mock(side_effect=write)
        with ThreadPoolExecutor(max_workers=2) as pool:
            first = pool.submit(self.service.generate, self.day, writer)
            self.assertTrue(entered.wait(5))
            second = pool.submit(DailyCosmetics(self.assets).generate, self.day, writer)
            self.assertEqual(second.result(5)["status"], "dispatched")
            release.set()
            self.assertEqual(first.result(5)["status"], "ready")
        writer.assert_called_once()
        with self.assets.catalogue.connection() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM cosmetic_days").fetchone()[0], 1)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM admin_collections").fetchone()[0], 1)

    def test_provider_failure_never_retries_or_changes_the_retained_theme(self):
        writer = Mock(side_effect=WorkshopError("Provider unavailable", 503))
        brief = self.service.prepare(self.day)
        with self.assertRaises(WorkshopError):
            self.service.generate(self.day, writer)
        self.assertEqual(self.service.generate(self.day, writer)["status"], "failed")
        self.assertEqual(self.service.prepare(self.day), brief)
        writer.assert_called_once()

    def test_expired_dispatched_attempt_becomes_uncertain_without_second_call(self):
        self.service.prepare(self.day)
        job = self.service.queue.acquire(KIND, request=self.day.isoformat(), seconds=600)
        self.service.queue.dispatch(job)
        with self.assets.catalogue.connection() as db:
            db.execute("UPDATE worker_jobs SET expires=0 WHERE kind=?", (KIND,))
        writer = Mock(side_effect=AssertionError("must not retry"))
        self.assertEqual(self.service.generate(self.day, writer)["status"], "uncertain")
        writer.assert_not_called()

    def test_missing_quota_or_exhausted_budget_prevents_provider_dispatch(self):
        with self.assets.catalogue.connection() as db:
            db.execute("DELETE FROM provider_quotas WHERE provider=?", (PROVIDER,))
        writer = Mock()
        with self.assertRaisesRegex(AssetError, "quota"):
            self.service.generate(self.day, writer)
        self.assertEqual(self.service.queue.inspect(KIND, self.day.isoformat())["status"], "failed")
        writer.assert_not_called()
        self.service.queue.configure_quota(PROVIDER, daily=0, monthly=31)
        next_day = self.day + timedelta(days=1)
        with self.assertRaisesRegex(AssetError, "exhausted"):
            self.service.generate(next_day, writer)
        self.assertEqual(self.service.queue.inspect(KIND, next_day.isoformat())["status"], "failed")
        writer.assert_not_called()

    def test_expired_reply_cannot_commit_artwork_or_accounting_and_is_never_retried(self):
        def late_reply(brief):
            with self.assets.catalogue.connection() as db:
                db.execute("UPDATE worker_jobs SET expires=0 WHERE kind=?", (KIND,))
            return self.response(brief)
        writer = Mock(side_effect=late_reply)
        with self.assertRaisesRegex(AssetError, "lease expired"):
            self.service.generate(self.day, writer)
        with self.assets.catalogue.connection() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM admin_collections").fetchone()[0], 0)
            self.assertEqual(tuple(db.execute("SELECT usage,response_model FROM cosmetic_days").fetchone()), (None, None))
        self.assertEqual(self.service.generate(self.day, writer)["status"], "uncertain")
        writer.assert_called_once()

    def test_invalid_reply_records_failure_without_creating_a_reviewable_draft(self):
        writer = Mock(return_value={"choices": []})
        with self.assertRaises(JourneyRequest):
            self.service.generate(self.day, writer)
        with self.assets.catalogue.connection() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM admin_collections").fetchone()[0], 0)
        self.assertEqual(self.service.generate(self.day, writer)["status"], "failed")
        writer.assert_called_once()

    def test_incomplete_bad_grid_repeated_silhouette_and_bad_usage_are_rejected(self):
        brief = self.service.prepare(self.day)
        valid = self.response(brief)
        validate_response(valid, brief)
        for change in (
            lambda response: response["choices"][0].update(finish_reason="length"),
            lambda response: response.update(usage=None),
            lambda response: response.update(usage={"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 3}),
            lambda response: response["choices"][0]["message"].update(content='{"icons":[]}'),
        ):
            response = copy.deepcopy(valid)
            change(response)
            with self.assertRaises(JourneyRequest):
                validate_response(response, brief)
        body = json.loads(valid["choices"][0]["message"]["content"])
        body["icons"][1]["pixels"] = body["icons"][0]["pixels"]
        response = copy.deepcopy(valid)
        response["choices"][0]["message"]["content"] = json.dumps(body)
        with self.assertRaises(JourneyRequest):
            validate_response(response, brief)
        body["icons"][1]["pixels"] = ["." * 12] * 12
        response["choices"][0]["message"]["content"] = json.dumps(body)
        with self.assertRaises(JourneyRequest):
            validate_response(response, brief)

    def test_duplicate_previous_generated_art_rejects_next_set_without_creating_draft(self):
        self.service.generate(self.day, self.response)
        self.service.queue.configure_quota(PROVIDER, daily=2, monthly=31)
        next_day = self.day + timedelta(days=1)
        with self.assertRaisesRegex(JourneyRequest, "previous"):
            self.service.generate(next_day, self.response)
        with self.assets.catalogue.connection() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM admin_collections").fetchone()[0], 1)

    def test_prompt_is_bounded_structured_and_contains_only_public_art_direction(self):
        brief = self.service.prepare(self.day)
        request = provider_request(brief, MODEL)
        self.assertEqual(request["response_format"]["type"], "json_schema")
        self.assertEqual(request["response_format"]["json_schema"]["schema"]["properties"]["icons"]["minItems"], 6)
        self.assertEqual(json.loads(request["messages"][1]["content"]), brief)
        self.assertLess(len(json.dumps(request)), 64000)
        self.assertEqual(datetime(2026, 11, 9, 23, 30, tzinfo=timezone.utc).astimezone(PARIS).date(), date(2026, 11, 10))

    def test_free_only_writer_refuses_unknown_or_paid_pricing_without_generation(self):
        brief = self.service.prepare(self.day)
        writer = FreeIconWriter("fixture-token")
        writer.writer = Mock(side_effect=self.response)
        pricing = {"currency_unit": "USD", **{key: "0" for key in
                   ("completion", "prompt", "request", "input_cache_reads", "input_cache_writes")}}
        def offer(value):
            response = Mock(status=200)
            response.read.return_value = json.dumps({"data": [{"id": MODEL, "pricing": value}]}).encode()
            response.__enter__ = Mock(return_value=response)
            response.__exit__ = Mock(return_value=False)
            return response
        for value in (None, {}, {**pricing, "completion": "0.001"}):
            writer.opener = Mock()
            writer.opener.open.return_value = offer(value)
            with self.assertRaises(WorkshopError):
                writer(brief)
            writer.writer.assert_not_called()
        writer.opener.open.return_value = offer(pricing)
        writer(brief)
        writer.writer.assert_called_once_with(brief)
        with self.assertRaisesRegex(WorkshopError, "original model"):
            writer({**brief, "model": "another-model"})
        writer.writer.assert_called_once()

    def test_timer_and_service_provide_daily_server_generation_not_browser_import(self):
        timer = (ROOT / "infra/systemd/arcane-daily-cosmetics.timer").read_text()
        service = (ROOT / "infra/systemd/arcane-daily-cosmetics.service").read_text()
        self.assertIn("OnCalendar=*-*-* 05:30:00 Europe/Paris", timer)
        self.assertIn("Persistent=true", timer)
        self.assertIn("scripts/daily_cosmetics.py", service)
        self.assertNotIn("Restart=", service)
        for name in ("admin.html", "admin-console.mjs"):
            self.assertNotIn("collection-import", (ROOT / name).read_text())


if __name__ == "__main__":
    unittest.main()
