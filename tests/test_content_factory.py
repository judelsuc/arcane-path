from concurrent.futures import ThreadPoolExecutor
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
import uuid
from unittest.mock import MagicMock, Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from content_factory import (
    BRIEFS, ENDPOINT, LIMIT, MAX_TOKENS, NoRedirect, OvhWriter, Workshop,
    WorkshopError, make_handler, provider_request, validate_response,
)


def provider_response():
    return {
        "model": "fictional-test-model",
        "choices": [{"finish_reason": "stop", "message": {"content": json.dumps({
            "en": {
                "rumour": "They say the pierced thimble was seen in Brumeval; no one knows exactly where.",
                "riddle": "A village name remains, Brumeval; the pierced thimble's hiding place does not.",
            },
            "fr": {
                "rumour": "Le dé à coudre ajouré aurait été vu à Brumeval, sans cachette connue.",
                "riddle": "Un nom demeure, Brumeval ; la cachette du dé à coudre ajouré reste inconnue.",
            },
        }, ensure_ascii=False)}}],
        "usage": {"prompt_tokens": 300, "completion_tokens": 150, "total_tokens": 450},
    }


class ContentFactoryTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.path = Path(directory.name) / "private/workshop.sqlite3"
        self.writer = Mock(side_effect=lambda brief: provider_response())
        self.workshop = Workshop(self.path, "fictional-test-model", self.writer)

    def generate(self, brief="artifact-town", request_id=None):
        return self.workshop.generate(request_id or str(uuid.uuid4()), brief)

    def test_disabled_is_explicit_and_does_not_consume_attempts(self):
        disabled = Workshop(self.path)
        self.assertFalse(disabled.snapshot()["liveEnabled"])
        with self.assertRaisesRegex(WorkshopError, "disabled"):
            disabled.generate(str(uuid.uuid4()), "artifact-town")
        self.assertEqual(disabled.snapshot()["used"], 0)
        self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)

    def test_only_fixed_fictional_brief_is_sent_and_no_game_data(self):
        row = self.generate()
        self.writer.assert_called_once_with(BRIEFS["artifact-town"])
        payload = provider_request(self.writer.call_args.args[0], "test-model")
        self.assertEqual(json.loads(payload["messages"][1]["content"]), BRIEFS["artifact-town"])
        self.assertEqual(payload["max_tokens"], MAX_TOKENS)
        self.assertFalse(payload["stream"])
        self.assertEqual(payload["response_format"]["type"], "json_schema")
        self.assertNotIn("token", payload["messages"][1]["content"])
        self.assertEqual(row["status"], "draft")
        self.assertIsNone(row["acceptedAt"])
        self.assertEqual(row["result"]["usage"]["total_tokens"], 450)

    def test_invalid_requests_do_not_call_provider(self):
        for request_id, brief_id in [
            ("not-a-uuid", "artifact-town"), (42, "artifact-town"),
            (str(uuid.uuid4()), "arbitrary private prompt"), (str(uuid.uuid4()), {}),
        ]:
            with self.subTest(request_id=request_id, brief_id=brief_id), self.assertRaises(WorkshopError):
                self.workshop.generate(request_id, brief_id)
        self.writer.assert_not_called()
        self.assertEqual(self.workshop.snapshot()["used"], 0)

    def test_replay_and_reload_never_issue_another_provider_call(self):
        row = self.generate()
        replay = Workshop(self.path, "other-model", self.writer)
        self.assertEqual(replay.generate(row["id"], "artifact-town"), row)
        with self.assertRaisesRegex(WorkshopError, "different brief"):
            replay.generate(row["id"], "parent-direction")
        self.writer.assert_called_once()

    def test_failures_consume_budget_and_replay_without_retry(self):
        self.writer.side_effect = WorkshopError("OVH unavailable; no automatic retry.", 502)
        request_id = str(uuid.uuid4())
        with self.assertRaisesRegex(WorkshopError, "unavailable"):
            self.generate(request_id=request_id)
        replay = self.generate(request_id=request_id)
        self.assertEqual(replay["status"], "failed")
        self.assertIn("unavailable", replay["error"])
        self.assertEqual(self.workshop.snapshot()["used"], 1)
        self.writer.assert_called_once()

    def test_interrupted_request_remains_reserved_after_restart(self):
        self.writer.side_effect = RuntimeError("Simulated process interruption")
        request_id = str(uuid.uuid4())
        with self.assertRaisesRegex(RuntimeError, "interruption"):
            self.generate(request_id=request_id)
        row = Workshop(self.path, "fictional-test-model", self.writer).generate(request_id, "artifact-town")
        self.assertEqual(row["status"], "pending")
        self.assertEqual(self.workshop.snapshot()["remaining"], LIMIT - 1)
        self.writer.assert_called_once()

    def test_twenty_attempt_cap_is_atomic_and_persistent(self):
        def attempt(_):
            try:
                self.generate()
                return True
            except WorkshopError as error:
                self.assertEqual(error.status, 429)
                return False
        with ThreadPoolExecutor(max_workers=6) as pool:
            outcomes = list(pool.map(attempt, range(26)))
        self.assertEqual(sum(outcomes), 20)
        self.assertEqual(self.writer.call_count, 20)
        reopened = Workshop(self.path, "fictional-test-model", self.writer)
        self.assertEqual(reopened.snapshot()["remaining"], 0)
        with self.assertRaisesRegex(WorkshopError, "exhausted"):
            reopened.generate(str(uuid.uuid4()), "artifact-town")
        self.assertEqual(self.writer.call_count, 20)

    def test_same_request_concurrency_reserves_one_provider_attempt(self):
        entered, release = threading.Event(), threading.Event()
        def delayed(brief):
            entered.set()
            if not release.wait(5):
                raise RuntimeError("Test did not release provider")
            return provider_response()
        self.writer.side_effect = delayed
        request_id = str(uuid.uuid4())
        with ThreadPoolExecutor(max_workers=1) as pool:
            first = pool.submit(self.generate, "artifact-town", request_id)
            try:
                self.assertTrue(entered.wait(5))
                self.assertEqual(self.generate(request_id=request_id)["status"], "pending")
            finally:
                release.set()
            self.assertEqual(first.result()["status"], "draft")
        self.writer.assert_called_once()

    def test_acceptance_is_explicit_idempotent_and_exports_only_reviewed_drafts(self):
        row = self.generate()
        self.generate("parent-direction")
        self.assertEqual(self.workshop.export()["entries"], [])
        for reviewed in [False, None, 1, "true"]:
            with self.assertRaises(WorkshopError):
                self.workshop.accept(row["id"], reviewed)
        accepted = self.workshop.accept(row["id"], True)
        self.assertEqual(self.workshop.accept(row["id"], True), accepted)
        exported = self.workshop.export()
        self.assertTrue(exported["fictionalSamplesOnly"])
        self.assertFalse(exported["gameplayIntegration"])
        self.assertEqual(exported["entries"], [accepted])
        self.assertEqual(Workshop(self.path).export(), exported)
        with self.assertRaises(WorkshopError):
            self.workshop.accept("missing", True)

    def test_bad_provider_shapes_and_text_are_not_saved_as_drafts(self):
        responses = []
        for key, value in [("choices", []), ("usage", {"total_tokens": 1}), ("model", {})]:
            response = provider_response()
            response[key] = value
            responses.append(response)
        for choice in [
            {"finish_reason": "length", "message": {"content": "{}"}},
            {"finish_reason": "stop", "message": {"content": "not JSON"}},
            {"finish_reason": "stop", "message": {"content": "{}", "refusal": "refused"}},
        ]:
            response = provider_response()
            response["choices"] = [choice]
            responses.append(response)
        for text in ["short", 12, "<script>pretend this is a long draft</script>",
                     "A long enough text with https://example.org", "A newline\nis not valid here", "x" * 701]:
            response = provider_response()
            output = json.loads(response["choices"][0]["message"]["content"])
            output["en"]["rumour"] = text
            response["choices"][0]["message"]["content"] = json.dumps(output)
            responses.append(response)
        response = provider_response()
        response["choices"][0]["message"]["content"] = json.dumps({"en": {}, "fr": {}, "plain": "forbidden"})
        responses.append(response)
        for response in responses:
            with self.subTest(response=response):
                self.writer.side_effect = None
                self.writer.return_value = response
                with self.assertRaises(WorkshopError):
                    self.generate()
        self.assertTrue(all(row["status"] == "failed" for row in self.workshop.snapshot()["attempts"]))
        self.assertEqual(self.workshop.export()["entries"], [])

    def test_missing_usage_is_explicitly_unknown(self):
        response = provider_response()
        del response["usage"]
        self.assertIsNone(validate_response(response)["usage"])

    def test_network_uses_only_ovh_and_does_not_follow_redirects_or_expose_key(self):
        writer = OvhWriter("private-fixture-key", "test-model")
        writer.opener = MagicMock()
        response = writer.opener.open.return_value.__enter__.return_value
        response.status = 200
        response.headers.get_content_type.return_value = "application/json"
        response.read.return_value = json.dumps(provider_response()).encode()
        validate_response(writer(BRIEFS["artifact-town"]))
        call = writer.opener.open.call_args
        request = call.args[0]
        self.assertEqual(request.full_url, ENDPOINT)
        self.assertEqual(request.get_header("Authorization"), "Bearer private-fixture-key")
        self.assertNotIn(b"private-fixture-key", request.data)
        self.assertEqual(call.kwargs["timeout"], 45)
        self.assertIsNone(NoRedirect().redirect_request(None, None, 302, "", {}, "https://example.org"))
        for status in [301, 401, 429, 500]:
            writer.opener.open.side_effect = urllib.error.HTTPError(
                ENDPOINT, status, "PRIVATE UPSTREAM DETAILS", {}, None)
            with self.assertRaises(WorkshopError) as raised:
                writer(BRIEFS["artifact-town"])
            self.assertNotIn("PRIVATE", str(raised.exception))
            self.assertNotIn("private-fixture-key", str(raised.exception))
        self.assertEqual(writer.opener.open.call_count, 5)

    def test_cli_requires_explicit_live_and_pricing_flags(self):
        script = Path(__file__).resolve().parents[1] / "scripts/content_factory.py"
        for args in [["--enable-live"], ["--model", "test-model"], ["--enable-live", "--model", "test-model"],
                     ["--enable-live", "--pricing-reviewed", "--model", "bad model"]]:
            result = subprocess.run([sys.executable, str(script), *args], capture_output=True, text=True)
            self.assertEqual(result.returncode, 2)
            self.assertNotIn("Content workshop:", result.stdout)

    def test_http_origin_csrf_path_and_schema_boundaries(self):
        server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(self.workshop))
        thread = threading.Thread(target=server.serve_forever)
        thread.start()
        base = f"http://127.0.0.1:{server.server_port}"
        def send(path, body=None, headers=None):
            request = urllib.request.Request(base + path, data=json.dumps(body).encode() if body is not None else None,
                                             headers=headers or {})
            with urllib.request.urlopen(request, timeout=10) as response:
                return response.headers, response.read()
        try:
            for path in ["/", "/content-workshop.mjs", "/content-workshop.css"]:
                headers, raw = send(path)
                self.assertTrue(raw)
                self.assertIn("default-src 'none'", headers["Content-Security-Policy"])
            _, raw = send("/api/workshop")
            snapshot = json.loads(raw)
            headers = {"Content-Type": "application/json", "X-Workshop-Token": snapshot["csrf"]}
            payload = {"id": str(uuid.uuid4()), "briefId": "artifact-town"}
            for path, body, extra, status in [
                ("/scripts/content_factory.py", None, {}, 404),
                ("/.cache/content-factory/workshop.sqlite3", None, {}, 404),
                ("/api/generate", payload, {}, 403),
                ("/api/generate", payload, {**headers, "Origin": "https://example.org"}, 403),
                ("/api/generate", payload, {**headers, "Sec-Fetch-Site": "cross-site"}, 403),
                ("/api/generate", payload, {**headers, "Host": "example.org"}, 403),
                ("/api/generate", {**payload, "prompt": "arbitrary"}, headers, 400),
                ("/api/generate", {**payload, "briefId": "missing"}, headers, 400),
            ]:
                with self.subTest(path=path, extra=extra), self.assertRaises(urllib.error.HTTPError) as raised:
                    send(path, body, extra)
                self.assertEqual(raised.exception.code, status)
                raised.exception.close()
            _, raw = send("/api/generate", payload, headers)
            row = json.loads(raw)
            self.assertEqual(row["status"], "draft")
            send("/api/generate", payload, headers)
            self.writer.assert_called_once()
            send("/api/accept", {"id": row["id"], "reviewed": True}, headers)
            _, raw = send("/api/export")
            self.assertEqual(json.loads(raw)["entries"][0]["id"], row["id"])
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == "__main__":
    unittest.main()
