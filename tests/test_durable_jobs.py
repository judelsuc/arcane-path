from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from asset_storage import AssetConflict, AssetError, local_storage
from durable_jobs import DurableJobs


class DurableJobsTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.storage = local_storage(self.root / "assets")
        self.jobs = DurableJobs(self.storage.catalogue)

    def enqueue(self, request="one", **kwargs):
        self.jobs.enqueue("test", request, {"version": 1}, **kwargs)

    def expire(self, job):
        with self.storage.catalogue.connection() as db:
            db.execute("UPDATE worker_jobs SET expires=0 WHERE kind=? AND request=?",
                       (job["kind"], job["request"]))

    def test_idempotent_enqueue_and_concurrent_claim(self):
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(lambda _: self.enqueue(), range(8)))
            leases = list(pool.map(lambda _: self.jobs.acquire("test"), range(8)))
        self.assertEqual(sum(job is not None for job in leases), 1)
        with self.assertRaises(AssetConflict):
            self.jobs.enqueue("test", "one", {"version": 2})
        job = next(job for job in leases if job)
        self.jobs.renew(job, seconds=120)
        self.jobs.finish(job)
        self.assertEqual(self.jobs.inspect("test", "one")["status"], "ready")
        self.assertIsNone(self.jobs.acquire("test"))
        with self.assertRaises(AssetConflict):
            self.jobs.finish(job)
        with self.assertRaises(AssetConflict):
            self.jobs.renew(job)

    def test_expired_safe_work_is_reclaimed_with_fencing_and_attempt_bound(self):
        self.enqueue(max_attempts=2)
        first = self.jobs.acquire("test")
        self.expire(first)
        reopened = DurableJobs(local_storage(self.root / "assets").catalogue)
        second = reopened.acquire("test")
        self.assertNotEqual(first["token"], second["token"])
        for action in (self.jobs.finish, self.jobs.renew, self.jobs.dispatch):
            with self.assertRaises(AssetConflict):
                action(first)
        self.expire(second)
        self.assertIsNone(reopened.acquire("test"))
        self.assertEqual(reopened.inspect("test", "one"),
                         {"status": "failed", "attempts": 2, "error": "Attempt limit reached"})

    def test_dispatched_work_is_never_replayed_or_finished_by_stale_worker(self):
        self.jobs.configure_quota("images", daily=None, monthly=None)
        self.enqueue(provider="images")
        job = self.jobs.acquire("test")
        with self.assertRaises(AssetConflict):
            self.jobs.finish(job)
        self.jobs.dispatch(job)
        with self.assertRaises(AssetConflict):
            self.jobs.dispatch(job)
        self.expire(job)
        self.assertIsNone(self.jobs.acquire("test"))
        self.assertEqual(self.jobs.inspect("test", "one")["status"], "uncertain")
        for action in (self.jobs.finish, self.jobs.renew):
            with self.assertRaises(AssetConflict):
                action(job)
        with self.storage.catalogue.connection() as db:
            self.assertEqual([row[0] for row in db.execute("SELECT calls FROM provider_usage")], [1, 1])

    def test_missing_quota_refuses_dispatch_and_limits_are_atomic_with_rollback(self):
        for request in ("one", "two", "three"):
            self.enqueue(request, provider="images")
        first = self.jobs.acquire("test")
        with self.assertRaisesRegex(AssetError, "not configured"):
            self.jobs.dispatch(first)
        self.jobs.configure_quota("images", daily=1, monthly=10)
        self.jobs.dispatch(first)
        self.jobs.finish(first)
        second = self.jobs.acquire("test")
        with self.assertRaisesRegex(AssetError, "exhausted"):
            self.jobs.dispatch(second)
        self.jobs.configure_quota("images", daily=10, monthly=1)
        with self.assertRaisesRegex(AssetError, "exhausted"):
            self.jobs.dispatch(second)
        # The daily increment rolls back when the monthly quota rejects the call.
        with self.storage.catalogue.connection() as db:
            self.assertEqual([row[0] for row in db.execute("SELECT calls FROM provider_usage")], [1, 1])
        self.jobs.configure_quota("images", daily=None, monthly=None)
        self.jobs.dispatch(second)
        self.jobs.finish(second, error="Provider explicitly refused")
        self.assertEqual(self.jobs.inspect("test", second["request"])["status"], "failed")

    def test_zero_quotas_and_invalid_parameters(self):
        self.jobs.configure_quota("images", daily=0, monthly=0)
        self.enqueue(provider="images")
        job = self.jobs.acquire("test")
        with self.assertRaises(AssetError):
            self.jobs.dispatch(job)
        for limit in (-1, True, 1.5, "unlimited"):
            with self.assertRaises(ValueError):
                self.jobs.configure_quota("images", daily=limit, monthly=None)
        for attempts in (0, True, 101):
            with self.assertRaises(ValueError):
                self.enqueue(max_attempts=attempts)
        for seconds in (0, True, 3601):
            with self.assertRaises(ValueError):
                self.jobs.acquire("test", seconds=seconds)
        for payload in ([], {"value": float("nan")}, {"value": "x" * 64_001}):
            with self.assertRaises(ValueError):
                self.jobs.enqueue("test", "invalid", payload)

    def test_admin_command_requires_configuration_and_explicit_limits(self):
        config = self.root / "private.json"
        config.write_text(json.dumps({"backend": "local", "root": str(self.root / "assets")}))
        config.chmod(0o600)
        import os
        env = {**os.environ, "ARCANE_ASSET_STORAGE_CONFIG_FILE": str(config)}
        command = [sys.executable, str(ROOT / "scripts/durable_jobs.py")]
        result = subprocess.run([*command, "quota", "--provider", "images", "--daily", "unlimited",
                                 "--monthly", "unlimited"], env=env, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), {"provider": "images", "daily": None, "monthly": None})
        result = subprocess.run([*command, "inspect", "--kind", "test", "--request", "missing"],
                                env=env, text=True, capture_output=True)
        self.assertEqual(result.returncode, 1)
        self.assertIn("No job exists", result.stderr)
