import copy
import base64
import json
from pathlib import Path
import shutil
import sys
import threading
import unittest
import urllib.error
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor
from http.server import ThreadingHTTPServer
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from abandoned_journals import AbandonedJournals, JournalForbidden, LEASE_SECONDS
from journeys import JourneyConflict, JourneyRequest
from travel_server import ChunkJobs, make_handler


class JournalsTests(unittest.TestCase):
    def setUp(self):
        self.directory = Path(".journal-test-state-" + uuid.uuid4().hex)
        self.directory.mkdir()
        self.addCleanup(lambda: shutil.rmtree(self.directory))
        self.ids = [str(n) * 32 for n in range(1, 5)]
        self.tokens = [str(n) * 64 for n in range(1, 5)]
        bounds = {"minLatitude": 44, "maxLatitude": 45, "minLongitude": 2, "maxLongitude": 3}
        identity = json.dumps([8, 8, 250, bounds, 44.5])
        self.records = {id: {"mapIdentity": identity, "state": {"serverJourney": {"id": id}, "trail": {
            "parentName": "Fictional parent", "stages": [
                {"name": f"Town {n}", "latitude": 45 - (n + .5) * 250 / 111195,
                 "longitude": 2 + .5 * 250 / 111195 / .71325, "private": "never publish"}
                for n in range(10)]}, "photos": ["private"], "name": "personal"}}
            for id in self.ids}
        self.genesis = copy.deepcopy(self.records)
        self.journeys = SimpleNamespace(path=self.directory / "journeys.sqlite3",
                                       read=lambda id: self.records.get(id))
        self.now = 1000000
        self.store = AbandonedJournals(self.journeys, lambda: self.now)
        for id, token in zip(self.ids, self.tokens):
            self.store.bind(id, token)

    def call(self, finder=0, **changes):
        body = {"journey": self.ids[finder], "col": 0, "row": 0, "ended": None, "index": 0}
        return self.store.request({**body, **changes}, self.tokens[finder])

    def publish(self):
        return self.call(ended="hunger", index=2)

    def test_publish_is_private_idempotent_immutable_and_reunion_never_publishes(self):
        self.assertEqual(self.call(ended="reunion")["nearby"], [])
        self.publish()
        self.call(ended="hunger", index=3, row=10)
        nearby = self.call(1)["nearby"]
        self.assertEqual(len(nearby), 1)
        self.assertEqual(nearby[0]["history"], ["Town 0", "Town 1"])
        encoded = json.dumps(nearby)
        for secret in ["photos", "personal", "private", self.tokens[0]]:
            self.assertNotIn(secret, encoded)
        self.assertEqual(self.genesis, self.records)
        self.assertEqual(AbandonedJournals(self.journeys).request({
            "journey": self.ids[1], "col": 0, "row": 0}, self.tokens[1])["nearby"], nearby)

    def test_capabilities_cannot_be_rebound_or_guessed_from_public_ids(self):
        self.store.bind(self.ids[0], self.tokens[0])
        for token in [None, self.ids[0], "f" * 64]:
            with self.assertRaises(JournalForbidden):
                self.store.request({"journey": self.ids[0], "col": 0, "row": 0}, token)
        with self.assertRaises(JournalForbidden):
            self.store.bind(self.ids[0], self.tokens[1])

    def test_terminal_placement_publishes_at_last_position_and_releases_carried_journal(self):
        self.publish()
        self.call(1, action="claim", journal=self.ids[0])
        result = self.call(1, ended="placement", row=5, index=1)
        self.assertTrue(result["published"])
        nearby = self.call(2, row=5)["nearby"]
        self.assertIn(self.ids[1], [q["id"] for q in nearby])
        self.assertIn(self.ids[0], [q["id"] for q in nearby])
        self.assertEqual(self.records, self.genesis)

    def test_zero_health_death_publishes_and_releases_notebook_without_rewriting_genesis(self):
        self.publish()
        self.call(1, action="claim", journal=self.ids[0])
        result = self.call(1, ended="health", row=5, index=1)
        self.assertTrue(result["published"])
        nearby = self.call(2, row=5)["nearby"]
        self.assertIn(self.ids[0], [q["id"] for q in nearby])
        self.assertIn(self.ids[1], [q["id"] for q in nearby])
        self.assertEqual(self.records, self.genesis)

    def test_atomic_claim_and_same_finder_retry(self):
        self.publish()
        def claim(n):
            try:
                return self.call(n, action="claim", journal=self.ids[0])
            except JourneyConflict:
                return None
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(claim, [1, 2]))
        self.assertEqual(sum(r is not None for r in results), 1)
        winner = 1 if results[0] else 2
        self.assertEqual(len(self.call(winner, action="claim", journal=self.ids[0])["sidequests"]), 1)
        self.assertEqual(self.call(3)["nearby"], [])

    def test_lease_activity_expiry_and_death_release(self):
        self.publish()
        self.call(1, action="claim", journal=self.ids[0])
        self.now += LEASE_SECONDS - 1
        self.call(1)
        self.now += LEASE_SECONDS - 1
        self.assertEqual(self.call(2)["nearby"], [])
        self.now += 1
        self.assertEqual(len(self.call(2)["nearby"]), 1)
        self.call(2, action="claim", journal=self.ids[0])
        self.call(2, ended="fatigue")
        self.assertIn(self.ids[0], [q["id"] for q in self.call(1)["nearby"]])
        with self.assertRaises(JourneyConflict):
            self.call(2)

    def test_delivery_progress_and_final_retry_never_replace_own_trail(self):
        self.publish()
        self.call(1, action="claim", journal=self.ids[0])
        with self.assertRaises(JourneyConflict):
            self.call(1, action="advance", journal=self.ids[0], step=2, row=50)
        for step in range(2, 10):
            body = dict(action="advance", journal=self.ids[0], step=step, row=step)
            result = self.call(1, **body)
            self.assertEqual(self.call(1, **body), result)
        self.assertTrue(result["sidequests"][0]["delivered"])
        self.assertEqual(self.records, self.genesis)

    def test_invalid_and_distant_requests(self):
        self.publish()
        for changes in [{"col": True}, {"row": 9000}, {"index": 99, "ended": "sleep"},
                        {"ended": "other"}, {"action": "delete"}, {"photos": []},
                        {"action": "claim", "journal": []}]:
            with self.assertRaises(JourneyRequest):
                self.call(1, **changes)
        with self.assertRaises(JourneyConflict):
            self.call(1, action="claim", journal=self.ids[0], row=50)

    def notebook(self):
        return [{"id": "photo:one", "title": "A photo", "sourceUrl": "https://example.org/image",
                 "attribution": "Author", "license": "CC0", "licenseUrl": "https://example.org/license",
                 "note": "A shared handwritten note", "caption": "My memory", "unannotated": False,
                 "pinnedAt": "2026-10-17T12:00:00Z", "mime": "image/jpeg",
                 "image": base64.b64encode(b"\xff\xd8\xffimage").decode()}]

    def test_full_notebook_survives_restart_and_pickup_with_immutable_snapshot(self):
        photos = self.notebook()
        result = self.call(action="publish", notebook=photos, clues=["The town begins with To"], row=5)
        self.assertTrue(result["published"])
        self.assertEqual(self.call(1)["nearby"], [])
        nearby = self.call(1, row=5)["nearby"]
        self.assertEqual(len(nearby), 1)
        self.assertNotIn("notebook", nearby[0])
        with self.assertRaises(JourneyConflict):
            self.call(1, action="read", journal=self.ids[0], row=5)
        self.call(1, action="claim", journal=self.ids[0], row=5)
        shared = self.call(1, action="read", journal=self.ids[0], row=5)["notebook"]
        self.assertEqual(shared, {"photos": photos, "clues": ["The town begins with To"]})
        changed = self.notebook()
        changed[0]["note"] = "Do not overwrite the published snapshot"
        self.call(action="publish", notebook=changed, clues=[], row=100)
        self.assertEqual(self.call(1, action="read", journal=self.ids[0], row=5)["notebook"], shared)
        self.call(1, action="publish", notebook=[], clues=[], row=8)
        nearby = self.call(2, row=8)["nearby"]
        self.assertIn(self.ids[0], [q["id"] for q in nearby])
        self.assertEqual(self.genesis, self.records)

    def test_legacy_keeper_cannot_rebind_public_journey_or_another_keeper(self):
        keeper, token = "a" * 32, "b" * 64
        body = {"journey": self.ids[0], "keeper": keeper, "col": 0, "row": 0, "index": 0}
        self.assertTrue(self.store.request({**body, "action": "register"}, token)["registered"])
        with self.assertRaises(JournalForbidden):
            self.store.request({**body, "action": "register"}, "c" * 64)
        with self.assertRaises(JournalForbidden):
            self.store.request({**body, "journey": self.ids[1], "action": "register"}, token)
        with self.assertRaises(JourneyRequest):
            self.store.request({**body, "keeper": self.ids[0], "action": "register"}, token)
        self.store.request({**body, "action": "publish", "notebook": self.notebook(), "clues": []}, token)
        self.assertIn(keeper, [q["id"] for q in self.call(1)["nearby"]])
        self.assertEqual(self.call()["nearby"][0]["id"], keeper)

    def test_invalid_notebook_does_not_publish_partial_content(self):
        for change in [{"mime": "image/svg+xml"}, {"image": "not base64"},
                       {"image": base64.b64encode(b"not an image").decode()},
                       {"note": "a" * 2001}, {"sourceUrl": "javascript:alert(1)"},
                       {"unannotated": "false"}]:
            photos = self.notebook()
            photos[0].update(change)
            with self.assertRaises(JourneyRequest):
                self.call(action="publish", notebook=photos, clues=[])
            self.assertEqual(self.call(1)["nearby"], [])

    def test_mobile_parent_delivery_uses_its_position_when_the_notebook_was_left(self):
        trail = self.records[self.ids[0]]["state"]["trail"]
        trail["stages"] += [{**trail["stages"][-1], "name": f"Later {i}"} for i in range(3)]
        trail["story"] = {"movement": [
            {"stage": 10 + i, "elapsedMinutes": (i + 1) * 7 * 1440} for i in range(3)]}
        self.call(action="publish", notebook=[], clues=[], elapsedMinutes=5 * 1440, index=2)
        self.assertEqual(len(self.call(1)["nearby"][0]["stages"]), 10)
        self.call(1, action="claim", journal=self.ids[0])
        for step in range(2, 10):
            result = self.call(1, action="advance", journal=self.ids[0], step=step, row=step)
        self.assertTrue(result["sidequests"][0]["delivered"])

    def test_http_origin_bounded_body_and_nginx_allowlist(self):
        chunks = SimpleNamespace(cache=self.directory, root=Path.cwd())
        jobs = ChunkJobs(chunks)
        self.addCleanup(jobs.pool.shutdown)
        with patch("travel_server.JourneyStore", return_value=self.journeys):
            handler = make_handler(chunks, jobs)
        server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        thread = threading.Thread(target=server.serve_forever)
        thread.start()
        def close():
            server.shutdown()
            server.server_close()
            thread.join()
        self.addCleanup(close)
        host = f"127.0.0.1:{server.server_port}"
        def post(body, extra=None, endpoint="/api/abandoned-journals"):
            headers = {"Content-Type": "application/json", "X-Journal-Capability": self.tokens[1],
                       "Origin": "https://" + host, **(extra or {})}
            request = urllib.request.Request("http://" + host + endpoint,
                                             data=body, headers=headers)
            try:
                response = urllib.request.urlopen(request, timeout=5)
            except urllib.error.HTTPError as error:
                response = error
            with response:
                self.assertEqual(response.headers["Cache-Control"], "no-store")
                return response.status
        body = json.dumps({"journey": self.ids[1], "col": 0, "row": 0}).encode()
        self.assertEqual(post(body), 200)
        self.assertEqual(post(body, {"Origin": "https://elsewhere.example"}), 403)
        self.assertEqual(post(body, {"Sec-Fetch-Site": "cross-site"}), 403)
        self.assertEqual(post(body, {"X-Journal-Capability": "f" * 64}), 403)
        self.assertEqual(post(b"x" * 4097), 400)
        self.assertEqual(post(b"x" * 4097, endpoint="/api/journeys"), 413)
        self.assertEqual(post(b"[]"), 400)
        new_id, new_token = "5" * 32, "6" * 64
        new_record = copy.deepcopy(self.records[self.ids[0]])
        new_record["state"]["serverJourney"]["id"] = new_id
        self.records[new_id] = new_record
        self.journeys.create = lambda request: (new_record, False)
        headers = {"X-Journal-Capability": new_token}
        self.assertEqual(post(b"{}", headers, "/api/journeys"), 200)
        self.assertEqual(post(b"{}", headers, "/api/journeys"), 200)
        self.assertEqual(post(b"{}", {"X-Journal-Capability": "7" * 64}, "/api/journeys"), 403)
        self.assertEqual(post(json.dumps({"journey": new_id, "col": 0, "row": 0}).encode(), headers), 200)
        self.assertNotIn(new_token, json.dumps(new_record))
        config = Path("infra/nginx/preview.conf").read_text()
        location = config.split("location = /api/abandoned-journals {")[1].split("}")[0]
        self.assertIn("limit_except POST", location)
        self.assertIn("client_max_body_size 4k;", config)


if __name__ == "__main__":
    unittest.main()
