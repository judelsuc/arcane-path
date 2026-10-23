import hashlib
import io
from pathlib import Path
import sys
import tempfile
import subprocess
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import MagicMock, Mock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from asset_storage import (AssetConflict, AssetError, AssetNotFound, AssetStorage, GenerationJobs,
                           AssetCatalogue, S3Blobs, local_storage, ovh_storage)
from botocore.exceptions import ClientError

PROVENANCE = {"source": "original illustration", "license": "internal", "version": "portrait-1"}


class AssetStorageTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.storage = local_storage(self.root)

    def publish(self, scope="world-one", request="portrait-one", data=b"image", **changes):
        return self.storage.publish(scope, request, data, **{
            "media_type": "image/webp", "retention": "durable", "provenance": PROVENANCE, **changes})

    def test_restart_idempotency_and_private_scope(self):
        record = self.publish()
        self.assertEqual(record.sha256, hashlib.sha256(b"image").hexdigest())
        self.assertNotIn("world-one", record.key)
        self.storage = local_storage(self.root)
        self.assertEqual(self.publish(), record)
        self.assertEqual(self.storage.read("world-one", "portrait-one"), (record, b"image"))
        with self.assertRaises(AssetNotFound):
            self.storage.read("another-player", "portrait-one")
        self.assertEqual((self.root / "assets.sqlite3").stat().st_mode & 0o777, 0o600)
        self.assertEqual((self.root / "blobs" / record.key).stat().st_mode & 0o777, 0o600)

    def test_changed_content_or_metadata_cannot_reuse_a_request(self):
        self.publish()
        for changes in ({"data": b"other"}, {"retention": "cache"},
                        {"media_type": "image/png"}, {"provenance": {**PROVENANCE, "version": "2"}}):
            with self.assertRaises(AssetConflict):
                self.publish(**changes)
        self.assertEqual(self.storage.read("world-one", "portrait-one")[1], b"image")

    def test_durable_and_cache_objects_are_separate(self):
        durable = self.publish()
        cache = self.publish(request="cached-photo", retention="cache")
        self.assertNotEqual(durable.key, cache.key)
        self.assertTrue(durable.key.startswith("v1/durable/"))
        self.assertTrue(cache.key.startswith("v1/cache/"))

    def test_corruption_never_serves_or_publishes_success(self):
        record = self.publish()
        (self.root / "blobs" / record.key).write_bytes(b"bad")
        with self.assertRaises(AssetError):
            self.storage.read("world-one", "portrait-one")
        with self.assertRaises(AssetError):
            self.publish()
        blobs = Mock()
        blobs.get.return_value = b"wrong"
        store = AssetStorage(blobs, self.storage.catalogue)
        with self.assertRaises(AssetError):
            store.publish("world-one", "new", b"image", media_type="image/webp",
                          retention="durable", provenance=PROVENANCE)
        self.assertIsNone(self.storage.catalogue.find("world-one", "new"))

    def test_upload_failure_never_publishes_metadata(self):
        self.storage.blobs.put = Mock(side_effect=OSError("storage unavailable"))
        with self.assertRaisesRegex(OSError, "storage unavailable"):
            self.publish()
        self.assertIsNone(self.storage.catalogue.find("world-one", "portrait-one"))

    def test_database_failure_can_retry_already_uploaded_blob(self):
        original = self.storage.catalogue.publish
        self.storage.catalogue.publish = Mock(side_effect=OSError("database unavailable"))
        with self.assertRaisesRegex(OSError, "database unavailable"):
            self.publish()
        self.assertIsNone(self.storage.catalogue.find("world-one", "portrait-one"))
        self.storage.catalogue.publish = original
        record = self.publish()
        self.assertEqual(self.storage.read("world-one", "portrait-one")[0], record)

    def test_command_line_publishes_verifies_and_reports_failure(self):
        source = self.root / "fixture.webp"
        source.write_bytes(b"image")
        command = [sys.executable, str(ROOT / "scripts/asset_storage.py"),
                   "--root", str(self.root / "cli")]
        put = subprocess.run([*command, "put", str(source), "--scope", "world-one",
                              "--request", "portrait-one", "--media-type", "image/webp",
                              "--retention", "durable", "--source", PROVENANCE["source"],
                              "--license", PROVENANCE["license"], "--version", PROVENANCE["version"]],
                             capture_output=True, text=True)
        self.assertEqual(put.returncode, 0, put.stderr)
        verified = subprocess.run([*command, "verify", "--scope", "world-one",
                                   "--request", "portrait-one"], capture_output=True, text=True)
        self.assertEqual(verified.returncode, 0, verified.stderr)
        self.assertEqual(verified.stdout, put.stdout)
        missing = subprocess.run([*command, "verify", "--scope", "someone-else",
                                  "--request", "portrait-one"], capture_output=True, text=True)
        self.assertEqual(missing.returncode, 1)
        self.assertIn("Asset storage failed", missing.stderr)
        self.assertEqual(missing.stdout, "")

    def test_concurrent_same_request_has_one_consistent_result(self):
        with ThreadPoolExecutor(max_workers=4) as pool:
            records = list(pool.map(lambda _: self.publish(), range(8)))
        self.assertTrue(all(record == records[0] for record in records))
        with ThreadPoolExecutor(max_workers=2) as pool:
            def compete(data):
                try:
                    return self.publish(request="contested", data=data)
                except AssetConflict:
                    return None
            results = list(pool.map(compete, [b"first", b"second"]))
        self.assertEqual(sum(record is not None for record in results), 1)

    def test_generation_jobs_are_durable_atomic_and_terminal(self):
        jobs = GenerationJobs(self.storage.catalogue)
        self.assertEqual(jobs.snapshot("title-art"), {"lastAttempt": None, "image": None})
        with ThreadPoolExecutor(max_workers=4) as pool:
            claims = list(pool.map(lambda _: jobs.claim("title-art", "2026-10-23", {"version": 1}, "test-model"),
                                   range(8)))
        self.assertEqual(sum(claims), 1)
        reopened = GenerationJobs(local_storage(self.root).catalogue)
        self.assertEqual(reopened.status("title-art", "2026-10-23"), "running")
        self.assertFalse(reopened.claim("title-art", "2026-10-23", {"version": 2}, "changed-model"))
        with self.storage.catalogue.connection() as db:
            row = db.execute("SELECT payload,model FROM generation_jobs").fetchone()
            self.assertEqual(row, ('{"version": 1}', "test-model"))
        reopened.finish("title-art", "2026-10-23")
        self.assertEqual(jobs.snapshot("title-art")["image"], {"day": "2026-10-23", "model": "test-model"})
        self.assertTrue(jobs.claim("title-art", "2026-10-24", {}, "test-model"))
        jobs.finish("title-art", "2026-10-24", error="Provider unavailable")
        self.assertFalse(jobs.claim("title-art", "2026-10-24", {}, "test-model"))
        self.assertEqual(jobs.snapshot("title-art"), {
            "lastAttempt": {"day": "2026-10-24", "status": "failed"},
            "image": {"day": "2026-10-23", "model": "test-model"}})
        self.assertIsNone(jobs.status("another-kind", "2026-10-23"))
        for request in ("2026-10-23", "2026-10-24", "missing"):
            with self.assertRaises(AssetConflict):
                jobs.finish("title-art", request)

    def test_invalid_input_is_rejected_before_writes(self):
        for changes in ({"scope": "../secret"}, {"request": ""}, {"data": b""},
                        {"data": b"x" * 12_000_001}, {"retention": "unknown"},
                        {"media_type": "text/html\r\nbad"}, {"provenance": {}},
                        {"provenance": {**PROVENANCE, "source": "\n"}}):
            with self.assertRaises(ValueError):
                self.publish(**changes)

    def test_s3_conditional_upload_and_read_closes_stream(self):
        client = Mock()
        blobs = S3Blobs(client, "private-assets")
        key = self.publish().key
        blobs.put(key, b"image")
        self.assertEqual(client.put_object.call_args.kwargs["IfNoneMatch"], "*")
        client.put_object.side_effect = ClientError(
            {"Error": {"Code": "PreconditionFailed"}, "ResponseMetadata": {"HTTPStatusCode": 412}}, "PutObject")
        body = io.BytesIO(b"image")
        client.get_object.return_value = {"Body": body}
        blobs.put(key, b"image")
        self.assertTrue(body.closed)
        client.get_object.return_value = {"Body": io.BytesIO(b"other")}
        with self.assertRaises(AssetConflict):
            blobs.put(key, b"image")
        client.put_object.side_effect = ClientError(
            {"Error": {"Code": "AccessDenied"}, "ResponseMetadata": {"HTTPStatusCode": 403}}, "PutObject")
        with self.assertRaises(AssetError):
            blobs.put(key, b"image")

    def test_remote_configuration_rejects_insecure_endpoints_without_network(self):
        for endpoint, dsn in [
            ("http://storage.example", "host=db sslmode=verify-full connect_timeout=5"),
            ("https://user:secret@storage.example", "host=db sslmode=verify-full connect_timeout=5"),
            ("https://storage.example", "host=db sslmode=require connect_timeout=5"),
            ("https://storage.example", "host=db sslmode=verify-full"),
            ("https://storage.example", "host=db sslmode=verify-full connect_timeout=-1"),
            ("https://storage.example", "host=db sslmode=verify-full connect_timeout=999"),
        ]:
            with self.assertRaises(ValueError):
                ovh_storage(dsn=dsn, endpoint=endpoint, region="region", bucket="private-assets")

    def test_remote_clients_do_not_initialize_schema_or_connect_implicitly(self):
        with patch("boto3.client") as s3, patch("psycopg_pool.ConnectionPool") as factory, \
                patch("atexit.register"):
            store = ovh_storage(dsn="host=db.example sslmode=verify-full connect_timeout=5",
                                endpoint="https://storage.example", region="region",
                                bucket="private-assets")
            pool = factory.return_value
            pool.open.assert_not_called()
            self.assertFalse(factory.call_args.kwargs["open"])
            self.assertEqual(factory.call_args.kwargs["min_size"], 0)
            self.assertEqual(factory.call_args.kwargs["max_size"], 4)
            self.assertEqual(factory.call_args.kwargs["max_waiting"], 16)
            self.assertEqual(factory.call_args.kwargs["timeout"], 5)
            self.assertTrue(store.catalogue.postgres)
            self.assertEqual(store.catalogue.sql("WHERE scope=?"), "WHERE scope=%s")
            config = s3.call_args.kwargs["config"]
            self.assertEqual(config.connect_timeout, 5)
            self.assertEqual(config.read_timeout, 30)
            db = MagicMock()
            pool.connection.return_value.__enter__.return_value = db
            store.catalogue.initialize()
            self.assertIn("statement_timeout=30000", factory.call_args.kwargs["kwargs"]["options"])
            pool.open.assert_called_once()
            self.assertEqual(db.execute.call_count, 47)
            self.assertIn("generation_jobs", db.execute.call_args_list[1].args[0])
            db.close.assert_not_called()
            db.execute.return_value.fetchone.return_value = None
            store.catalogue.find("world-one", "missing")
            pool.open.assert_called_once()
            store.catalogue.close()
            pool.close.assert_called_once()
            with self.assertRaisesRegex(AssetError, "closed"):
                store.catalogue.find("world-one", "missing")

    def test_pool_exhaustion_and_closed_pool_fail_without_unpooled_fallback(self):
        from psycopg_pool import PoolClosed, PoolTimeout, TooManyRequests

        for error in (PoolClosed("closed"), PoolTimeout("busy"), TooManyRequests("queue full")):
            pool, connect = MagicMock(), Mock()
            pool.connection.return_value.__enter__.side_effect = error
            catalogue = AssetCatalogue(connect, postgres=True, pool=pool)
            with self.assertRaisesRegex(AssetError, "Asset catalogue operation failed"):
                with catalogue.connection():
                    self.fail("An unavailable pool must not return a connection.")
            connect.assert_not_called()
            catalogue.close()

    def test_s3_driver_accepts_conditional_write_request_without_network(self):
        import boto3
        from botocore.stub import Stubber

        client = boto3.client("s3", region_name="eu-west-1",
                              aws_access_key_id="test-only", aws_secret_access_key="test-only")
        key = self.publish().key
        with Stubber(client) as stub:
            stub.add_response("put_object", {}, {"Bucket": "private-assets", "Key": key,
                              "Body": b"image", "ContentType": "application/octet-stream",
                              "IfNoneMatch": "*"})
            S3Blobs(client, "private-assets").put(key, b"image")
            stub.assert_no_pending_responses()
