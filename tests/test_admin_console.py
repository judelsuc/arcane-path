import copy
import json
import os
from pathlib import Path
import secrets
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from http.server import ThreadingHTTPServer
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from admin_console import AdminConsole, AdminDenied, COOKIE, main, password_hash, save_collection, validate_collection
from asset_storage import local_storage
from change_requests import delete_report
from journeys import JourneyConflict, JourneyRequest
from travel_server import ChunkJobs, make_handler
import test_change_requests as reports
import test_lore_playtest as fixtures


def draft():
    return {"version": 1, "id": "rain-couriers", "theme": "Rain couriers", "model": "fixture",
            "icons": [{"id": "courier", "en": "Courier", "fr": "Messager",
                       "coat": "#557799", "accent": "#eedd99",
                       "pixels": ["............", "....oooo....", "...occcco...", "..occcccco..",
                                  "...ososo....", "...ossso....", "..occccco...", ".ocaccccoco.",
                                  ".osocaaaaco.", "..occaaoaco.", "...oo.oo....", "..ooo.ooo..."]}]}


class AdminConsoleTests(unittest.TestCase):
    def setUp(self):
        self.fixture = reports.ChangeRequestTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.assets = self.fixture.assets
        self.credentials = self.fixture.root / "administrator.json"
        self.password = secrets.token_urlsafe(24)
        salt = secrets.token_hex(16)
        self.credentials.write_text(json.dumps({"username": "keeper", "salt": salt,
                                                "hash": password_hash(self.password, salt)}))
        self.credentials.chmod(0o600)
        self.now = 1800000000
        self.service = AdminConsole(self.assets, self.credentials, now=lambda: self.now)
        self.session, token = self.service.login({"action": "login", "username": "keeper", "password": self.password})
        self.cookie = f"{COOKIE}={token}"

    def request(self, data, **changes):
        result, _ = self.service.request(data, changes.get("cookie", self.cookie),
                                         changes.get("csrf", self.session["csrf"]))
        return result

    def store_draft(self, value):
        with self.service.transaction() as db:
            return save_collection(db, value)

    def test_dedicated_login_cookie_csrf_expiry_logout_and_password_rotation(self):
        with self.assertRaises(AdminDenied):
            self.request({"action": "feedback-list", "status": "all", "offset": 0}, cookie="")
        with self.assertRaises(AdminDenied):
            self.request({"action": "collection-review", "id": "rain-couriers", "revision": 1,
                          "icon": "courier", "decision": "approved"}, csrf="wrong")
        restored, _ = self.service.request({"action": "session"}, self.cookie, None)
        self.assertEqual(restored, self.session)
        self.now += 8 * 3600
        with self.assertRaises(AdminDenied):
            self.request({"action": "session"})
        self.now -= 8 * 3600
        self.credentials.write_text(self.credentials.read_text().replace('"keeper"', '"different"'))
        with self.assertRaises(AdminDenied):
            self.request({"action": "session"})

    def test_logout_revokes_persistent_session_and_tokens_are_not_stored_raw(self):
        with self.assets.catalogue.connection() as db:
            row = db.execute("SELECT digest FROM admin_sessions").fetchone()
        self.assertNotIn(row[0], self.cookie)
        self.assertEqual(self.request({"action": "logout"}), {"loggedOut": True})
        with self.assertRaises(AdminDenied):
            self.request({"action": "session"})

    def test_failed_login_attempts_are_retained_across_service_instances(self):
        for _ in range(5):
            with self.assertRaisesRegex(AdminDenied, "Invalid"):
                self.service.login({"action": "login", "username": "keeper", "password": "incorrect"})
        reopened = AdminConsole(self.assets, self.credentials, now=lambda: self.now)
        with self.assertRaisesRegex(AdminDenied, "Too many"):
            reopened.login({"action": "login", "username": "keeper", "password": self.password})
        self.now += 901
        session, _ = reopened.login({"action": "login", "username": "keeper", "password": self.password})
        self.assertEqual(session["username"], "keeper")

    def test_feedback_has_private_evidence_filters_revision_guards_and_retention(self):
        self.fixture.submit()
        listed = self.request({"action": "feedback-list", "status": "new", "offset": 0})
        identity = listed["items"][0]["id"]
        self.assertNotIn("owner", listed["items"][0])
        report = self.request({"action": "feedback-detail", "id": identity})
        self.assertEqual(report["snapshot"], self.fixture.data["snapshot"])
        self.assertEqual(self.request({"action": "feedback-image", "id": identity}), reports.screenshot())
        updated = self.request({"action": "feedback-update", "id": identity, "status": "investigating",
                                "note": "Check the controls.", "revision": 0})
        self.assertEqual(updated["revision"], 1)
        with self.assertRaises(JourneyConflict):
            self.request({"action": "feedback-update", "id": identity, "status": "resolved", "note": "", "revision": 0})
        self.assertEqual(self.request({"action": "feedback-list", "status": "new", "offset": 0})["items"], [])
        delete_report(self.assets, identity)
        with self.assets.catalogue.connection() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM admin_feedback").fetchone()[0], 0)
        for action in ("feedback-detail", "feedback-image"):
            with self.assertRaises(JourneyRequest):
                self.request({"action": action, "id": identity})

    def test_collection_validation_rejects_executable_data_duplicates_and_invalid_grids(self):
        validate_collection(draft())
        for change in (
            lambda value: value["icons"][0].update(coat="url(https://example.test)"),
            lambda value: value["icons"][0].update(pixels=["x" * 12] * 12),
            lambda value: value["icons"][0].update(pixels=["." * 12] * 12),
            lambda value: value["icons"][0].update(script="alert(1)"),
            lambda value: value["icons"].append({**value["icons"][0], "id": "recolour"}),
        ):
            value = copy.deepcopy(draft())
            change(value)
            with self.assertRaises(JourneyRequest):
                validate_collection(value)

    def test_server_draft_approval_publication_are_durable_immutable_and_idempotent(self):
        first = self.store_draft(draft())
        self.assertFalse(first["existing"])
        self.assertTrue(self.store_draft(draft())["existing"])
        with self.assertRaisesRegex(JourneyRequest, "Unknown"):
            self.request({"action": "collection-import", "collection": draft()})
        changed = draft()
        changed["theme"] = "Another theme"
        with self.assertRaises(JourneyConflict):
            self.store_draft(changed)
        with self.assertRaises(JourneyRequest):
            self.request({"action": "collection-publish", "id": "rain-couriers", "revision": 1})
        approved = self.request({"action": "collection-review", "id": "rain-couriers", "revision": 1,
                                 "icon": "courier", "decision": "approved"})
        self.assertEqual(approved["revision"], 2)
        self.service = AdminConsole(self.assets, self.credentials, now=lambda: self.now)
        self.request({"action": "collection-publish", "id": "rain-couriers", "revision": 2})
        row = self.request({"action": "collection-list", "offset": 0})["items"][0]
        self.assertEqual(row["status"], "published")
        self.assertEqual(row["decisions"], {"courier": "approved"})
        with self.assertRaises(JourneyConflict):
            self.request({"action": "collection-review", "id": "rain-couriers", "revision": 3,
                          "icon": "courier", "decision": "rejected"})

    def test_concurrent_review_rejects_stale_revision(self):
        self.store_draft(draft())
        def review():
            try:
                self.request({"action": "collection-review", "id": "rain-couriers", "revision": 1,
                              "icon": "courier", "decision": "approved"})
                return "saved"
            except JourneyConflict:
                return "conflict"
        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertCountEqual(list(pool.map(lambda _: review(), range(2))), ["saved", "conflict"])

    def test_only_approved_icons_export_and_published_similarity_checks_span_pages(self):
        value = draft()
        second = copy.deepcopy(value["icons"][0])
        second["id"] = "second"
        second["pixels"][1] = ".....ooo...."
        value["icons"].append(second)
        self.store_draft(value)
        for revision, icon, decision in ((1, "courier", "approved"), (2, "second", "rejected")):
            self.request({"action": "collection-review", "id": value["id"], "revision": revision,
                          "icon": icon, "decision": decision})
        self.request({"action": "collection-publish", "id": value["id"], "revision": 3})
        exported = self.request({"action": "collection-export", "id": value["id"]})
        self.assertEqual([icon["id"] for icon in exported["icons"]], ["courier"])
        for index in range(21):
            self.now += 1
            other = draft()
            other["id"] = f"draft-{index}"
            self.store_draft(other)
        listing = self.request({"action": "collection-list", "offset": 0})
        self.assertTrue(listing["hasMore"])
        self.assertNotIn(value["id"], [entry["id"] for entry in listing["items"]])
        for entry in listing["items"]:
            self.assertEqual(entry["warnings"]["courier"]["collection"], value["id"])
        with self.assertRaises(JourneyRequest):
            self.request({"action": "collection-export", "id": "draft-0"})

    def test_insecure_credential_permissions_fail_closed(self):
        self.credentials.chmod(0o644)
        with self.assertRaisesRegex(ValueError, "group or others"):
            AdminConsole(self.assets, self.credentials)

    def test_daily_run_status_appears_without_a_manual_upload(self):
        from datetime import date
        from daily_cosmetics import DailyCosmetics, PROVIDER
        from content_factory import WorkshopError
        worker = DailyCosmetics(self.assets)
        worker.queue.configure_quota(PROVIDER, daily=1, monthly=31)
        day = date(2026, 11, 9)
        brief = worker.prepare(day)
        def unavailable(_):
            raise WorkshopError("Fixture provider stopped", 503)
        with self.assertRaises(WorkshopError):
            worker.generate(day, unavailable)
        result = self.request({"action": "collection-list", "offset": 0})
        self.assertEqual(result["generation"][0]["title"], brief["theme"]["title"])
        self.assertEqual(result["generation"][0]["status"], "failed")
        self.assertIn("Fixture provider stopped", result["generation"][0]["error"])
        self.assertEqual(result["items"], [])

    def test_password_command_prompts_creates_private_hash_and_refuses_overwrite(self):
        target = self.fixture.root / "created-credential.json"
        with patch.object(sys, "argv", ["admin_console.py", "password", "--file", str(target),
                                       "--username", "another-admin"]), \
                patch("admin_console.getpass.getpass", return_value=self.password):
            main()
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)
            self.assertNotIn(self.password, target.read_text())
            created = AdminConsole(self.assets, target, now=lambda: self.now)
            session, _ = created.login({"action": "login", "username": "another-admin", "password": self.password})
            self.assertEqual(session["username"], "another-admin")
            with self.assertRaises(FileExistsError):
                main()

    def test_http_boundary_enforces_auth_origin_csrf_and_cookie_flags(self):
        fixture = fixtures.LorePlaytestTests()
        fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        jobs = ChunkJobs(fixture.chunks, workers=1)
        self.addCleanup(jobs.pool.shutdown)
        with patch("travel_server.AdminConsole.configured", return_value=self.service):
            handler = make_handler(fixture.chunks, jobs)
        self.addCleanup(handler.town_legends.close)
        server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        self.addCleanup(server.server_close)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(thread.join, 5)
        self.addCleanup(server.shutdown)
        base = f"http://127.0.0.1:{server.server_port}"
        def post(data, **headers):
            return urllib.request.urlopen(urllib.request.Request(base + "/api/admin",
                data=json.dumps(data).encode(), headers={"Content-Type": "application/json", **headers}), timeout=20)
        for headers, code in (({}, 401), ({"Origin": "https://other.invalid"}, 403)):
            with self.assertRaises(urllib.error.HTTPError) as error:
                post({"action": "session"}, **headers)
            self.assertEqual(error.exception.code, code)
            error.exception.close()
        with post({"action": "login", "username": "keeper", "password": self.password}) as response:
            cookie = response.headers["Set-Cookie"]
            for flag in ("HttpOnly", "Secure", "SameSite=Strict", "Path=/"):
                self.assertIn(flag, cookie)
            session = json.load(response)
        with self.assertRaises(urllib.error.HTTPError) as error:
            post({"action": "collection-list", "offset": 0}, Cookie=cookie.split(";")[0])
        self.assertEqual(error.exception.code, 401)
        error.exception.close()
        with post({"action": "collection-list", "offset": 0},
                  Cookie=cookie.split(";")[0], **{"X-Admin-CSRF": session["csrf"]}) as response:
            self.assertEqual(response.status, 200)
            self.assertIn("no-store", response.headers["Cache-Control"])
        with urllib.request.urlopen(base + "/admin.html", timeout=10) as response:
            self.assertIn("frame-ancestors 'none'", response.headers["Content-Security-Policy"])


if __name__ == "__main__":
    unittest.main()
