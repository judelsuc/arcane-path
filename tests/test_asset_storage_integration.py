"""Opt-in real PostgreSQL/S3 test; containers are isolated and removed after use."""

from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
import copy
from datetime import date
import gzip
import io
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import urllib.request
import uuid
from unittest.mock import Mock, patch

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from PIL import Image
import psycopg
from psycopg_pool import ConnectionPool

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from asset_storage import AssetCatalogue, AssetConflict, AssetError, AssetStorage, S3Blobs
from content_factory import IMAGE_MODEL, WorkshopError
from durable_jobs import DurableJobs
from start_art import StartArt, art_brief
from shared_images import SharedImages
from encounter_art import EncounterArt
from journal_art import JournalArt
from journal_storage import JournalStorage
from abandoned_journals import AbandonedJournals, JournalForbidden, LEASE_SECONDS
from journeys import JourneyConflict, JourneyStore
from travel_server import ChunkStore, atomic_write
from main_artifacts import MainArtifacts, WORLD as ARTIFACT_WORLD
from tests.test_content_storage import ContentStorageChecks


@unittest.skipUnless(os.environ.get("ARCANE_STORAGE_INTEGRATION") == "1",
                     "Set ARCANE_STORAGE_INTEGRATION=1 to run isolated Docker services.")
class RealStorageTests(ContentStorageChecks, unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.containers = []
        cls.addClassCleanup(cls.cleanup)
        password = secrets.token_hex(24)
        cls.password = password
        cls.postgres = cls.launch(["-e", "POSTGRES_PASSWORD=" + password, "-e", "POSTGRES_DB=assets",
                                  "-p", "127.0.0.1::5432", "postgres:16-alpine"])
        cls.object_server = cls.launch(["-e", "RUSTFS_ACCESS_KEY=integration",
                                       "-e", "RUSTFS_SECRET_KEY=" + password,
                                       "-e", "RUSTFS_CONSOLE_ENABLE=false",
                                       "-p", "127.0.0.1::9000",
                                       "rustfs/rustfs@sha256:9ca9559533b537d10482fe923288b676ad08f92a7069d9a17327fbae3cab688b",
                                       "/data"])
        pg_port = cls.port(cls.postgres, "5432/tcp")
        cls.dsn = f"host=127.0.0.1 port={pg_port} dbname=assets user=postgres password={password} connect_timeout=2"
        cls.client = boto3.client("s3", endpoint_url="http://127.0.0.1:" + cls.port(cls.object_server, "9000/tcp"),
                                  region_name="us-east-1", aws_access_key_id="integration",
                                  aws_secret_access_key=password,
                                  config=Config(connect_timeout=2, read_timeout=3,
                                                retries={"total_max_attempts": 1}))
        for attempt in range(60):
            try:
                with psycopg.connect(cls.dsn):
                    pass
                cls.client.list_buckets()
                break
            except (psycopg.OperationalError, BotoCoreError, ClientError):
                if attempt == 59:
                    raise
                time.sleep(1)
        cls.client.create_bucket(Bucket="integration-assets")
        cls.catalogue = AssetCatalogue(lambda: psycopg.connect(cls.dsn), postgres=True)
        cls.catalogue.initialize()
        cls.storage = AssetStorage(S3Blobs(cls.client, "integration-assets"), cls.catalogue)

    @classmethod
    def launch(cls, args):
        result = subprocess.run(["docker", "run", "--detach", "--rm", *args],
                                check=True, text=True, capture_output=True, timeout=180)
        container = result.stdout.strip()
        cls.containers.append(container)
        return container

    @staticmethod
    def port(container, target):
        result = subprocess.run(["docker", "inspect", container], check=True, text=True,
                                capture_output=True, timeout=10)
        return json.loads(result.stdout)[0]["NetworkSettings"]["Ports"][target][0]["HostPort"]

    @classmethod
    def cleanup(cls):
        for container in reversed(cls.containers):
            subprocess.run(["docker", "rm", "--force", container], check=True,
                           capture_output=True, timeout=30)

    def publish(self, request, data=b"test-image"):
        return self.storage.publish("integration", request, data, media_type="image/webp",
                                    retention="durable", provenance={
                                        "source": "local-fixture", "license": "test", "version": "1"})

    def setUp(self):
        with self.catalogue.connection() as db:
            db.execute("TRUNCATE TABLE generation_jobs,asset_catalogue,worker_jobs,provider_quotas,provider_usage,"
                       "encounter_assignments,encounter_stock,journal_illustrations,"
                       "journeys,capabilities,keepers,journals,notebooks,rumours,"
                       "main_artifact_world,main_artifact_sessions,main_artifact_receipts,"
                       "quest_instances,quest_pois,narrative_wording,custom_origins,custom_origin_leases,"
                       "travel_chunk_cache,travel_provider_cooldowns,parent_path_assignments")
        DurableJobs(self.catalogue).configure_quota("images", daily=None, monthly=None)

    def pooled_catalogue(self, *, max_size=2, max_waiting=1, timeout=1):
        pool = ConnectionPool(
            self.dsn, min_size=0, max_size=max_size, max_waiting=max_waiting, timeout=timeout,
            kwargs={"options": "-c statement_timeout=30000 -c lock_timeout=5000"},
            check=ConnectionPool.check_connection, open=False)
        catalogue = AssetCatalogue(postgres=True, pool=pool)
        self.addCleanup(catalogue.close)
        return catalogue

    def test_postgres_pool_reuses_connections_and_cleans_failed_transactions(self):
        catalogue = self.pooled_catalogue(max_size=1)
        with catalogue.connection() as db:
            identity = db.execute("SELECT pg_backend_pid()").fetchone()[0]
            self.assertEqual(db.execute("SHOW statement_timeout").fetchone()[0], "30s")
            self.assertEqual(db.execute("SHOW lock_timeout").fetchone()[0], "5s")
            db.execute("INSERT INTO quest_pois VALUES('committed',0,'[]')")
        with self.assertRaisesRegex(AssetError, "catalogue operation failed"):
            with catalogue.connection() as db:
                db.execute("INSERT INTO quest_pois VALUES('rolled-back',0,'[]')")
                db.execute("SELECT 1/0")
        with self.assertRaisesRegex(ValueError, "application failure"):
            with catalogue.connection() as db:
                db.execute("INSERT INTO quest_pois VALUES('application-rollback',0,'[]')")
                raise ValueError("application failure")
        with catalogue.connection() as db:
            self.assertEqual(db.execute("SELECT pg_backend_pid()").fetchone()[0], identity)
            self.assertEqual(db.execute("SELECT town FROM quest_pois ORDER BY town").fetchall(),
                             [("committed",)])
        catalogue.close()
        with self.assertRaisesRegex(AssetError, "closed"):
            with catalogue.connection():
                self.fail("Closed catalogue returned a connection.")
        with self.catalogue.connection() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM pg_stat_activity WHERE pid=%s",
                                       (identity,)).fetchone()[0], 0)

    def test_postgres_pool_enforces_capacity_and_bounded_waiting(self):
        catalogue = self.pooled_catalogue(max_size=2, max_waiting=1, timeout=.3)
        with catalogue.connection() as first, catalogue.connection() as second:
            identities = {first.execute("SELECT pg_backend_pid()").fetchone()[0],
                          second.execute("SELECT pg_backend_pid()").fetchone()[0]}
            self.assertEqual(len(identities), 2)
            with ThreadPoolExecutor(max_workers=1) as workers:
                waiting = workers.submit(lambda: catalogue.find("integration", "missing"))
                deadline = time.monotonic() + 5
                while catalogue.pool.get_stats().get("requests_waiting", 0) != 1:
                    if time.monotonic() >= deadline:
                        self.fail("Pool did not register its waiting request.")
                    time.sleep(.001)
                with self.assertRaises(AssetError) as overflow:
                    catalogue.find("integration", "overflow")
                from psycopg_pool import PoolTimeout, TooManyRequests
                self.assertIsInstance(overflow.exception.__cause__, TooManyRequests)
                started = time.monotonic()
                with self.assertRaises(AssetError) as timeout:
                    waiting.result(timeout=5)
                self.assertIsInstance(timeout.exception.__cause__, PoolTimeout)
                self.assertLess(time.monotonic() - started, 2)
        self.assertIsNone(catalogue.find("integration", "missing"))
        self.assertEqual(catalogue.pool.get_stats()["pool_size"], 2)

    def test_postgres_pool_replaces_a_dead_idle_connection(self):
        catalogue = self.pooled_catalogue(max_size=1)
        with catalogue.connection() as db:
            previous = db.execute("SELECT pg_backend_pid()").fetchone()[0]
        with self.catalogue.connection() as db:
            self.assertTrue(db.execute("SELECT pg_terminate_backend(%s)", (previous,)).fetchone()[0])
        with catalogue.connection() as db:
            self.assertNotEqual(db.execute("SELECT pg_backend_pid()").fetchone()[0], previous)
            self.assertEqual(db.execute("SELECT 42").fetchone()[0], 42)

    def test_postgres_pool_serves_all_api_stores_and_reports_saturation_as_503(self):
        from http.server import ThreadingHTTPServer
        import urllib.error
        import urllib.request
        from travel_server import ChunkJobs, make_handler

        catalogue = self.pooled_catalogue(max_size=1, timeout=.2)
        assets = AssetStorage(self.storage.blobs, catalogue)
        with tempfile.TemporaryDirectory() as directory:
            chunks = ChunkStore(cache=Path(directory))
            jobs = ChunkJobs(chunks)
            try:
                with patch("journeys.configured_storage", return_value=assets):
                    handler = make_handler(chunks, jobs)
                try:
                    handler.quest_destinations.future.result(timeout=10)
                    self.assertIs(handler.journal_art.assets, assets)
                    self.assertIs(handler.encounter_art.assets, assets)
                    self.assertIs(handler.live_narrative.assets, assets)
                    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
                    thread = threading.Thread(target=server.serve_forever)
                    thread.start()
                    try:
                        url = f"http://127.0.0.1:{server.server_port}/api/start-art"
                        with catalogue.connection():
                            with self.assertLogs(level="ERROR"), self.assertRaises(urllib.error.HTTPError) as failure:
                                urllib.request.urlopen(url, timeout=5)
                            self.assertEqual(failure.exception.code, 503)
                            self.assertEqual(json.load(failure.exception),
                                             {"error": "Asset storage unavailable; check server logs."})
                            failure.exception.close()
                        with urllib.request.urlopen(url, timeout=5) as response:
                            self.assertEqual(response.status, 200)
                            self.assertIn("lastAttempt", json.load(response))
                    finally:
                        server.shutdown()
                        server.server_close()
                        thread.join(5)
                finally:
                    handler.quest_destinations.close()
                    handler.live_narrative.close()
                    handler.journal_art.close()
                    handler.living_world.pool.shutdown(wait=True)
            finally:
                jobs.pool.shutdown(wait=True)

    def test_real_custom_origin_is_published_once_and_reused_after_api_restart(self):
        latitude, longitude = 44.540499, 2.309377
        place = {"latitude": latitude, "longitude": longitude, "name": "Integration fixture"}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first = ChunkStore(cache=root / "first")
            second = ChunkStore(cache=root / "second")
            first.set_shared_assets(self.storage)
            second.set_shared_assets(AssetStorage(
                self.storage.blobs, AssetCatalogue(lambda: psycopg.connect(self.dsn), postgres=True)))
            entered, release = threading.Event(), threading.Event()
            calls = []

            def download(bounds, name, output, on_progress=None):
                calls.append(output)
                entered.set()
                if not release.wait(10):
                    raise OSError("Integration download was not released.")
                output.parent.mkdir(parents=True, exist_ok=True)
                with gzip.open(output, "wt") as stream:
                    stream.write(f'<osm><bounds minlon="{bounds[0]}" minlat="{bounds[1]}" '
                                 f'maxlon="{bounds[2]}" maxlat="{bounds[3]}"/>'
                                 f'<node id="1" lon="{longitude}" lat="{latitude}"/></osm>')

            with patch.object(first.places, "reverse", return_value=place), \
                    patch.object(second.places, "reverse", return_value=place), \
                    patch("travel_server.download_region", side_effect=download):
                with ThreadPoolExecutor(max_workers=2) as workers:
                    pending = workers.submit(first.prepare_origin, latitude, longitude)
                    self.assertTrue(entered.wait(10))
                    duplicate = workers.submit(second.prepare_origin, latitude, longitude)
                    time.sleep(.1)
                    release.set()
                    origin = pending.result(timeout=15)
                    self.assertEqual(duplicate.result(timeout=15), origin)
            self.assertEqual(len(calls), 1)
            key = origin["region"]
            with self.catalogue.connection() as db:
                self.assertEqual(db.execute(self.catalogue.sql(
                    "SELECT COUNT(*) FROM custom_origins WHERE region=?"), (key,)).fetchone()[0], 1)
                self.assertIsNone(db.execute(self.catalogue.sql(
                    "SELECT region FROM custom_origin_leases WHERE region=?"), (key,)).fetchone())

            restarted = ChunkStore(cache=root / "restarted")
            restarted.set_shared_assets(AssetStorage(
                self.storage.blobs, AssetCatalogue(lambda: psycopg.connect(self.dsn), postgres=True)))
            self.assertTrue(restarted.load_origin(key))
            with patch("travel_server.fetch_elevations", return_value={"values": [100] * 64}), \
                    patch("travel_server.download_region",
                          side_effect=AssertionError("Shared source must be restored from S3")):
                chunk = restarted.build(key, 1, 1)
            self.assertEqual(chunk["chunk"]["region"], key)
            source = root / "restarted" / "origins" / key / "source.osm.gz"
            self.assertTrue(source.is_file())
            source_request, source_hash, source_size = restarted.origin_sources[key]
            record, raw = self.storage.read("custom-origin-source", source_request)
            self.assertEqual(source.read_bytes(), raw)
            self.assertEqual((source_hash, source_size), (record.sha256, record.size))

            from http.server import ThreadingHTTPServer
            from travel_server import ChunkJobs, make_handler

            api_store = ChunkStore(cache=root / "api")
            jobs = ChunkJobs(api_store)
            path_pool = ThreadPoolExecutor(max_workers=1)
            api_journeys = JourneyStore(api_store, atomic_write, assets=AssetStorage(
                self.storage.blobs, AssetCatalogue(lambda: psycopg.connect(self.dsn), postgres=True)))
            with patch("travel_server.JourneyStore.configured", return_value=api_journeys):
                handler = make_handler(api_store, jobs, path_pool)
            server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
            thread = threading.Thread(target=server.serve_forever)
            thread.start()
            try:
                base_url = f"http://127.0.0.1:{server.server_port}"
                with urllib.request.urlopen(base_url + "/api/origins", timeout=5) as response:
                    self.assertIn({"region": key, "name": origin["map"]["name"]}, json.load(response))
                with urllib.request.urlopen(base_url + "/api/origin-map?region=" + key,
                                            timeout=5) as response:
                    self.assertEqual(json.load(response), origin["map"])
            finally:
                server.shutdown()
                server.server_close()
                thread.join(5)
                handler.quest_destinations.close()
                handler.live_narrative.close()
                handler.journal_art.close()
                handler.living_world.pool.shutdown(wait=True)
                jobs.pool.shutdown(wait=True)
                path_pool.shutdown(wait=True)

    def test_real_travel_chunk_is_computed_once_and_shared_between_services(self):
        from asset_storage import AssetCatalogue
        from travel_server import ChunkStore

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first = ChunkStore(cache=root / "first")
            second = ChunkStore(cache=root / "second")
            second_assets = AssetStorage(
                self.storage.blobs,
                AssetCatalogue(lambda: psycopg.connect(self.dsn), postgres=True))
            first.set_shared_assets(self.storage)
            second.set_shared_assets(second_assets)
            entered, release = threading.Event(), threading.Event()
            calls = []

            def elevations(centers):
                calls.append(len(centers))
                entered.set()
                if not release.wait(10):
                    raise OSError("Integration elevation request was not released.")
                return {"values": [100] * len(centers)}

            try:
                with patch("travel_server.fetch_elevations", side_effect=elevations):
                    with ThreadPoolExecutor(max_workers=2) as workers:
                        pending = workers.submit(first.build, "firmi", 1, 1)
                        self.assertTrue(entered.wait(10))
                        duplicate = workers.submit(second.build, "firmi", 1, 1)
                        time.sleep(.1)
                        release.set()
                        expected = pending.result(timeout=15)
                        self.assertEqual(duplicate.result(timeout=15), expected)
                self.assertEqual(calls, [64])
                with self.catalogue.connection() as db:
                    self.assertEqual(db.execute(self.catalogue.sql(
                        "SELECT COUNT(*) FROM travel_chunk_cache WHERE status='ready'")).fetchone()[0], 1)
            finally:
                release.set()

    def test_real_parent_route_is_pinned_across_independent_services_and_restart(self):
        from parent_paths import ParentPaths
        from tests.test_parent_paths import Grid, Journeys

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            genesis = Journeys()
            genesis.assets = self.storage
            other_genesis = Journeys()
            other_genesis.assets = AssetStorage(
                self.storage.blobs, AssetCatalogue(lambda: psycopg.connect(self.dsn), postgres=True))
            first = ParentPaths(Grid(root / "first"), genesis, atomic_write)
            second = ParentPaths(Grid(root / "second"), other_genesis, atomic_write)
            self.addCleanup(first.pool.shutdown, wait=True)
            self.addCleanup(second.pool.shutdown, wait=True)

            key = ("a" * 32, 0)
            status, loading = first.request_record(key, genesis.read(key[0]))
            self.assertEqual(status, 202)
            first.jobs[first.assignment_id(key)].result(timeout=15)
            status, pinned = first.request_record(key, genesis.read(key[0]))
            self.assertEqual(status, 200)
            self.assertNotIn("points", pinned)
            path = first.decode(first.location(*key))

            second.build = lambda *args: self.fail("Another service must reuse the pinned route.")
            status, reopened = second.request_record(key, other_genesis.read(key[0]))
            self.assertEqual((status, reopened), (200, pinned))
            self.assertEqual(second.decode(second.location(*key)), path)
            with self.catalogue.connection() as db:
                assignment = db.execute(self.catalogue.sql(
                    "SELECT status,asset_request,sha256 FROM parent_path_assignments WHERE assignment=?"),
                    (first.assignment_id(key),)).fetchone()
            self.assertEqual(assignment[0], "ready")
            asset, content = self.storage.read("parent-path", assignment[1])
            self.assertEqual(asset.sha256, assignment[2])
            self.assertEqual(json.loads(content), path)

    def test_real_leases_reclaim_safe_work_and_fence_stale_workers(self):
        queue = DurableJobs(self.catalogue)
        queue.enqueue("safe", "one", {"version": 1}, max_attempts=2)
        with ThreadPoolExecutor(max_workers=4) as pool:
            claims = list(pool.map(lambda _: queue.acquire("safe"), range(8)))
        first = next(job for job in claims if job)
        self.assertEqual(sum(job is not None for job in claims), 1)
        with self.catalogue.connection() as db:
            db.execute("UPDATE worker_jobs SET expires=0")
        reopened = DurableJobs(AssetCatalogue(lambda: psycopg.connect(self.dsn), postgres=True))
        second = reopened.acquire("safe")
        self.assertNotEqual(first["token"], second["token"])
        with self.assertRaises(AssetConflict):
            queue.finish(first)
        reopened.renew(second, seconds=120)
        reopened.finish(second)
        self.assertEqual(queue.inspect("safe", "one")["status"], "ready")

    def test_real_provider_quotas_serialize_dispatch_and_never_replay_uncertain_calls(self):
        queue = DurableJobs(self.catalogue)
        queue.configure_quota("images", daily=1, monthly=1)
        for key in ("one", "two", "three"):
            queue.enqueue("image", key, {}, provider="images")
        jobs = [queue.acquire("image"), queue.acquire("image")]
        def dispatch(job):
            try:
                queue.dispatch(job)
                return True
            except AssetError as error:
                self.assertIn("quota exhausted", str(error))
                return False
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(dispatch, jobs))
        self.assertEqual(sum(results), 1)
        with self.catalogue.connection() as db:
            self.assertEqual([row[0] for row in db.execute("SELECT calls FROM provider_usage")], [1, 1])
            db.execute("UPDATE worker_jobs SET expires=0 WHERE status='dispatched'")
        third = queue.acquire("image")
        self.assertIsNotNone(third)
        winner = jobs[results.index(True)]
        self.assertEqual(queue.inspect("image", winner["request"])["status"], "uncertain")
        with self.assertRaises(AssetConflict):
            queue.finish(winner)
        queue.configure_quota("images", daily=None, monthly=None)
        queue.dispatch(third)
        queue.finish(third)

    def test_postgres_s3_roundtrip_and_concurrent_idempotency(self):
        with ThreadPoolExecutor(max_workers=4) as pool:
            records = list(pool.map(lambda _: self.publish("concurrent"), range(8)))
        self.assertTrue(all(record == records[0] for record in records))
        with self.catalogue.connection() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM asset_catalogue WHERE request='concurrent'").fetchone()[0], 1)
        with self.assertRaises(AssetConflict):
            self.publish("concurrent", b"different")
        reopened = AssetStorage(S3Blobs(self.client, "integration-assets"), self.catalogue)
        self.assertEqual(reopened.read("integration", "concurrent")[1], b"test-image")
        def compete(data):
            try:
                return self.publish("contested", data)
            except AssetConflict:
                return None
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(compete, [b"first", b"second"]))
        self.assertEqual(sum(result is not None for result in results), 1)

    def test_real_conditional_write_cannot_overwrite_or_publish_corruption(self):
        record = self.publish("immutable")
        with self.assertRaises(AssetConflict):
            self.storage.blobs.put(record.key, b"different")
        self.assertEqual(self.storage.read("integration", "immutable")[1], b"test-image")
        self.client.put_object(Bucket="integration-assets", Key=record.key, Body=b"corruption")
        with self.assertRaises(AssetError):
            self.storage.read("integration", "immutable")
        bad = AssetStorage(S3Blobs(self.client, "nonexistent-bucket"), self.catalogue)
        with self.assertRaises(AssetError):
            bad.publish("integration", "failed-upload", b"data", media_type="image/webp",
                        retention="durable", provenance={"source": "test", "license": "test", "version": "1"})
        self.assertIsNone(self.catalogue.find("integration", "failed-upload"))

    def test_title_image_producer_uses_real_postgres_s3_storage(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "attempts.sqlite3"
            art = StartArt(path, assets=self.storage)
            output = io.BytesIO()
            Image.new("RGB", (1024, 1024), "navy").save(output, "PNG")
            calls = []
            def writer(brief):
                calls.append(brief)
                return output.getvalue()
            day = date(2026, 10, 23)
            art.generate(day, writer)
            self.assertEqual(len(calls), 1)
            record, raw = self.storage.read("title-art", day.isoformat())
            self.assertEqual(record.retention, "durable")
            with Image.open(io.BytesIO(raw)) as image:
                self.assertEqual(image.format, "WEBP")
            self.assertEqual(StartArt(path, assets=self.storage).image(day.isoformat()), raw)
            art.generate(day, writer)
            self.assertEqual(len(calls), 1)
            self.assertFalse(path.exists())

    def test_all_three_image_producers_share_real_dispatch_accounting_and_s3_assets(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = io.BytesIO()
            Image.new("RGB", (1024, 1024), "navy").save(output, "PNG")
            writer = Mock(return_value=output.getvalue())
            StartArt(root / "unused.sqlite3", assets=self.storage).generate(date(2026, 10, 23), writer)
            encounters = EncounterArt(root / "encounters.sqlite3", assets=self.storage)
            identity = encounters.generate("event.food", writer, request="e" * 32)
            other = EncounterArt(root / "other-vm.sqlite3", assets=self.storage)
            self.assertEqual(other.generate("event.food", writer, request=identity), identity)
            journeys = JourneyStore(ChunkStore(cache=root), atomic_write)
            abandoned = AbandonedJournals(journeys)
            record, _ = journeys.create({"requestId": str(uuid.uuid4()), "region": "firmi", "name": "Fixture"})
            owner = record["state"]["serverJourney"]["id"]
            token = "a" * 64
            abandoned.bind(owner, token)
            journal = JournalArt(journeys, abandoned, writer, assets=self.storage)
            try:
                journal.request({"journey": owner, "operation": "enqueue", "brief": {
                    "key": "cover", "birth": record["state"]["birthCard"], "daily": "moon",
                    "scenes": ["forest"], "activities": [], "partial": False}}, token)
                journal.future.result(timeout=10)
                self.assertEqual(journal.request({"journey": owner, "operation": "sync"}, token)
                                 ["entries"][0]["status"], "ready")
            finally:
                journal.close()
            self.assertEqual(writer.call_count, 3)
            with self.catalogue.connection() as db:
                rows = db.execute("SELECT kind,status FROM worker_jobs ORDER BY kind").fetchall()
                self.assertEqual(rows, [("image-encounter-art", "ready"),
                                        ("image-journal-art", "ready"), ("image-title-art", "ready")])
                self.assertEqual([row[0] for row in db.execute("SELECT calls FROM provider_usage")], [3, 3])
            DurableJobs(self.catalogue).configure_quota("images", daily=3, monthly=3)
            with self.assertRaisesRegex(AssetError, "quota exhausted"):
                encounters.generate("event.food", writer, request="f" * 32)
            self.assertEqual(writer.call_count, 3)

    def test_real_encounter_stock_has_one_winner_and_stable_cross_vm_assignments(self):
        with tempfile.TemporaryDirectory() as directory:
            auth = Mock()
            auth.authorize.side_effect = lambda data, token: (token, {})
            first = EncounterArt(Path(directory) / "first" / "encounters.sqlite3", auth, True, assets=self.storage)
            second = EncounterArt(Path(directory) / "second" / "encounters.sqlite3", auth, True, assets=self.storage)
            output = io.BytesIO()
            Image.new("RGB", (1024, 1024), "navy").save(output, "PNG")
            writer = Mock(return_value=output.getvalue())
            identity = first.generate("event.food", writer, request="c" * 32)
            data = {"journey": "fixture", "operation": "sync",
                    "items": [{"scene": "event.food", "occurrence": "event:one"}]}
            barrier = threading.Barrier(2)
            def observe(owner):
                barrier.wait(timeout=10)
                return second.request(data, owner)
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(observe, ("one", "two")))
            self.assertEqual(sum(result["entries"][0]["id"] == identity for result in results), 1)
            winner = ("one", "two")[next(i for i, result in enumerate(results)
                                        if result["entries"][0]["id"] == identity)]
            image_request = {"journey": "fixture", "operation": "image",
                             "occurrence": "event:one", "image": identity}
            self.assertEqual(first.request(image_request, winner), self.storage.read("encounter-art", identity)[1])
            from journeys import JourneyRequest
            with self.assertRaises(JourneyRequest):
                second.request(image_request, "unauthorized-owner")
            with ThreadPoolExecutor(max_workers=4) as pool:
                replays = list(pool.map(lambda _: first.request(data, winner), range(8)))
            self.assertTrue(all(result["entries"][0]["id"] == identity for result in replays))
            with self.catalogue.connection() as db:
                self.assertEqual(db.execute("SELECT COUNT(*) FROM encounter_assignments").fetchone()[0], 2)
                self.assertEqual(db.execute("SELECT COUNT(*) FROM encounter_stock WHERE claimed=1").fetchone()[0], 1)
            self.assertFalse(first.path.parent.exists())
            self.assertFalse(second.path.parent.exists())
            writer.assert_called_once()

    def test_real_encounter_publication_restarts_without_regeneration_and_renews_atomically(self):
        from encounter_art import WEEK

        with tempfile.TemporaryDirectory() as directory:
            auth = Mock()
            auth.authorize.return_value = ("owner", {})
            art = EncounterArt(Path(directory) / "unused.sqlite3", auth, True, assets=self.storage)
            output = io.BytesIO()
            Image.new("RGB", (1024, 1024), "navy").save(output, "PNG")
            writer = Mock(return_value=output.getvalue())
            with patch.object(art.shared, "publish", side_effect=AssetError("Lost SQL acknowledgement")):
                with self.assertRaises(AssetError):
                    art.generate("event.food", writer, now=100, request="a" * 32)
            other = EncounterArt(Path(directory) / "other.sqlite3", auth, True, assets=self.storage)
            original = other.generate("event.food", writer, now=100, request="a" * 32)
            writer.assert_called_once()
            item = {"scene": "event.food", "occurrence": "event:one"}
            self.assertEqual(other.shared.sync("owner", [item], 100)[0]["id"], original)
            self.assertEqual(art.shared.sync("owner", [item], 100 + WEEK)[0]["id"], original)
            renewed = art.generate("event.food", writer, now=100 + WEEK, request="b" * 32)
            self.assertEqual(other.shared.sync("owner", [item], 100 + WEEK)[0]["id"], renewed)
            self.assertNotEqual(original, renewed)
            self.assertEqual(writer.call_count, 2)

    def test_real_journal_queue_fences_workers_and_recovers_published_image(self):
        queue = JournalStorage(self.storage)
        brief = {"key": "cover", "birth": "fool", "daily": "moon",
                 "scenes": ["forest"], "activities": [], "partial": False}
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(lambda _: queue.enqueue("owner", brief, per_owner=366, total_limit=1000), range(8)))
            claims = list(pool.map(lambda _: queue.acquire(), range(8)))
        self.assertEqual(len(queue.entries("owner")), 1)
        self.assertEqual(sum(job is not None for job in claims), 1)
        first = next(job for job in claims if job)
        output = io.BytesIO()
        Image.new("RGB", (1024, 1024), "navy").save(output, "PNG")
        writer = Mock(return_value=output.getvalue())
        from journal_art import art_prompt
        queue.generate(first, writer, art_prompt(brief))
        with self.catalogue.connection() as db:
            db.execute("UPDATE journal_illustrations SET expires=0")
        other_assets = AssetStorage(S3Blobs(self.client, "integration-assets"),
                                   AssetCatalogue(lambda: psycopg.connect(self.dsn), postgres=True))
        second_queue = JournalStorage(other_assets)
        second = second_queue.acquire()
        self.assertNotEqual(first["token"], second["token"])
        with self.assertRaises(AssetConflict):
            queue.finish(first, 1)
        raw = second_queue.generate(second, writer, art_prompt(brief))
        second_queue.finish(second, 1)
        self.assertEqual(queue.image("owner", "cover"), raw)
        from journeys import JourneyRequest
        with self.assertRaises(JourneyRequest):
            second_queue.image("other-owner", "cover")
        writer.assert_called_once()
        self.assertEqual(queue.entries("owner")[0]["status"], "ready")

    def test_real_two_journal_services_share_live_status_and_private_asset(self):
        from journal_art import art_prompt

        queue = JournalStorage(self.storage)
        brief = {"key": "cover", "birth": "fool", "daily": "moon",
                 "scenes": ["forest"], "activities": [], "partial": False}
        queue.enqueue("owner", brief, per_owner=366, total_limit=1000)
        entered, release = threading.Event(), threading.Event()
        output = io.BytesIO()
        Image.new("RGB", (1024, 1024), "navy").save(output, "PNG")
        def generate(theme):
            entered.set()
            if not release.wait(10):
                raise WorkshopError("Test provider was not released.")
            return output.getvalue()
        writer = Mock(side_effect=generate)
        with tempfile.TemporaryDirectory() as directory:
            journeys = Mock()
            journeys.path = Path(directory) / "vm-one" / "journeys.sqlite3"
            first = JournalArt(journeys, Mock(), writer, assets=self.storage)
            second = None
            try:
                self.assertTrue(entered.wait(10))
                journeys.path = Path(directory) / "vm-two" / "journeys.sqlite3"
                second = JournalArt(journeys, Mock(), writer, assets=self.storage)
                second.future.result(timeout=10)
                self.assertEqual(second.shared.entries("owner")[0]["status"], "running")
            finally:
                release.set()
                first.close()
                if second is not None:
                    second.close()
            self.assertEqual(second.shared.entries("owner")[0]["status"], "ready")
            self.assertTrue(second.shared.image("owner", "cover"))
            self.assertFalse(first.path.parent.exists())
            self.assertFalse(second.path.parent.exists())
            writer.assert_called_once_with(art_prompt(brief))

    def test_real_shared_genesis_capability_keeper_and_private_journal_read(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first = JourneyStore(ChunkStore(cache=root / "first"), atomic_write, assets=self.storage)
            second = JourneyStore(ChunkStore(cache=root / "second"), atomic_write, assets=self.storage)
            body = {"requestId": str(uuid.uuid4()), "region": "firmi", "name": "Fixture"}
            with ThreadPoolExecutor(max_workers=4) as pool:
                records = list(pool.map(lambda i: (first if i % 2 else second).create(body), range(8)))
            self.assertEqual(sum(created for _, created in records), 1)
            self.assertTrue(all(record == records[0][0] for record, _ in records))
            record = records[0][0]
            identity = record["state"]["serverJourney"]["id"]
            self.assertEqual(second.read(identity), record)
            books, other = AbandonedJournals(first), AbandonedJournals(second)
            tokens = ["a" * 64, "b" * 64]
            def bind(token):
                try:
                    other.bind(identity, token)
                    return True
                except JournalForbidden:
                    return False
            with ThreadPoolExecutor(max_workers=2) as pool:
                winners = list(pool.map(bind, tokens))
            self.assertEqual(sum(winners), 1)
            token = tokens[winners.index(True)]
            keeper = uuid.uuid4().hex
            books.request({"journey": identity, "keeper": keeper, "action": "register", "col": 10, "row": 10}, token)
            output = io.BytesIO()
            Image.new("RGB", (1024, 1024), "navy").save(output, "PNG")
            writer = Mock(return_value=output.getvalue())
            art = JournalArt(first, books, writer, assets=self.storage)
            reader = JournalArt(second, other, assets=self.storage)
            try:
                self.assertEqual(reader.authorize({"journey": identity, "keeper": keeper}, token), (keeper, record))
                with self.assertRaises(JournalForbidden):
                    reader.authorize({"journey": identity}, tokens[winners.index(False)])
                art.request({"journey": identity, "keeper": keeper, "operation": "enqueue", "brief": {
                    "key": "cover", "birth": record["state"]["birthCard"], "daily": "moon",
                    "scenes": ["forest"], "activities": [], "partial": False}}, token)
                art.future.result(timeout=10)
                request = {"journey": identity, "keeper": keeper, "operation": "image", "key": "cover"}
                self.assertEqual(reader.request(request, token), art.request(request, token))
            finally:
                art.close()
                reader.close()
            writer.assert_called_once()
            for path in (first.path, second.path, books.path, other.path, art.path, reader.path):
                self.assertFalse(path.exists())

    def test_real_shared_notebook_publication_exclusive_claim_rumours_and_lease_expiry(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first = JourneyStore(ChunkStore(cache=root / "first"), atomic_write, assets=self.storage)
            second = JourneyStore(ChunkStore(cache=root / "second"), atomic_write, assets=self.storage)
            now = [1_000_000]
            books = AbandonedJournals(first, clock=lambda: now[0])
            other = AbandonedJournals(second, clock=lambda: now[0])
            identities = []
            for name in ("Owner", "Finder One", "Finder Two"):
                record, _ = first.create({"requestId": str(uuid.uuid4()), "region": "firmi", "name": name})
                identity = record["state"]["serverJourney"]["id"]
                token = uuid.uuid4().hex + uuid.uuid4().hex
                books.bind(identity, token)
                identities.append((identity, token, record))
            identity, token, record = identities[0]
            def call(pair, store=other, **extra):
                return store.request({"journey": pair[0], "col": 10, "row": 10, **extra}, pair[1])
            call(identities[0], action="publish", index=0, notebook=[], clues=["Shared clue"])
            finder = identities[1]
            with books.connect() as db:
                row = db.execute("SELECT * FROM journals WHERE id=?", (identity,)).fetchone()
                observation = books.indication(row, books.position(finder[2], 10, 10), "town:fixture", 0)
                db.execute("INSERT INTO rumours(finder,evidence,journal,observation) VALUES(?,?,?,?)",
                           (finder[0], "town:fixture", identity, json.dumps(observation)))
            self.assertEqual(call(finder)["rumours"][0]["id"], identity)
            def claim(pair):
                try:
                    call(pair, action="claim", journal=identity)
                    return True
                except JourneyConflict:
                    return False
            with ThreadPoolExecutor(max_workers=2) as pool:
                winners = list(pool.map(claim, identities[1:]))
            self.assertEqual(sum(winners), 1)
            winner = identities[1:][winners.index(True)]
            loser = identities[1:][winners.index(False)]
            self.assertEqual(call(winner, action="read", journal=identity),
                             {"notebook": {"photos": [], "clues": ["Shared clue"]}})
            with self.assertRaises(JourneyConflict):
                call(loser, action="read", journal=identity)
            now[0] += LEASE_SECONDS
            self.assertTrue(claim(loser))
            self.assertEqual(second.read(identity), record)

    def test_real_main_artifact_claim_race_has_one_owner_and_exact_receipt_replay(self):
        with tempfile.TemporaryDirectory() as directory:
            first = JourneyStore(ChunkStore(cache=Path(directory) / "one"), atomic_write, assets=self.storage)
            second = JourneyStore(ChunkStore(cache=Path(directory) / "two"), atomic_write, assets=self.storage)
            books = AbandonedJournals(first)
            apis = (MainArtifacts(first, books), MainArtifacts(second, AbandonedJournals(second)))
            players = []
            for api in apis:
                record, _ = first.create({"requestId": str(uuid.uuid4()), "region": "firmi", "name": "Fixture"})
                identity = record["state"]["serverJourney"]["id"]
                token = uuid.uuid4().hex + uuid.uuid4().hex
                books.bind(identity, token)
                body = {"journey": identity, "requestId": str(uuid.uuid4()), "state": record["state"],
                        "action": {"type": "inquire", "id": "hermit"}}
                view = api.request(body, token)
                players.append((identity, token, view["state"]))
            barrier = threading.Barrier(2)
            def claim(index):
                identity, token, state = players[index]
                body = {"journey": identity, "requestId": str(uuid.uuid4()), "state": state,
                        "action": {"type": "claim", "id": "hermit"}}
                barrier.wait(timeout=10)
                try:
                    return apis[index].request(body, token), body, token
                except JourneyRequest as error:
                    self.assertIn("unavailable", str(error))
                    return None
            from journeys import JourneyRequest
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(claim, range(2)))
            self.assertEqual(sum(result is not None for result in results), 1)
            view, body, token = next(result for result in results if result is not None)
            self.assertEqual([item["id"] for item in view["owned"]], ["hermit"])
            with ThreadPoolExecutor(max_workers=4) as pool:
                replays = list(pool.map(lambda i: apis[i % 2].request(body, token), range(8)))
            self.assertTrue(all(replay == view for replay in replays))
            with self.assertRaises(JourneyConflict):
                apis[0].request({**body, "action": None}, token)
            with self.catalogue.connection() as db:
                self.assertEqual(db.execute("SELECT COUNT(*) FROM main_artifact_receipts").fetchone()[0], 3)
                row = db.execute("SELECT payload,checksum FROM main_artifact_world WHERE id=%s",
                                 (ARTIFACT_WORLD,)).fetchone()
            world = apis[0].decode({"payload": row[0], "checksum": row[1]})
            self.assertEqual(len(world["instances"]), 22)
            self.assertEqual(next(item for item in world["instances"] if item["id"] == "hermit")["owner"],
                             body["journey"])
            self.assertFalse(apis[0].path.exists())
            self.assertFalse(apis[1].path.exists())

    def test_real_main_artifact_receipt_failure_rolls_back_custody_and_session(self):
        from journey_storage import StoreConnection

        with tempfile.TemporaryDirectory() as directory:
            journeys = JourneyStore(ChunkStore(cache=Path(directory)), atomic_write, assets=self.storage)
            books = AbandonedJournals(journeys)
            record, _ = journeys.create({"requestId": str(uuid.uuid4()), "region": "firmi", "name": "Fixture"})
            identity, token = record["state"]["serverJourney"]["id"], "a" * 64
            books.bind(identity, token)
            api = MainArtifacts(journeys, books)
            view = api.request({"journey": identity, "requestId": str(uuid.uuid4()), "state": record["state"],
                                "action": {"type": "inquire", "id": "hermit"}}, token)
            with api.connect() as db:
                before = dict(db.execute("SELECT * FROM main_artifact_world").fetchone())
                session = dict(db.execute("SELECT * FROM main_artifact_sessions").fetchone())
            body = {"journey": identity, "requestId": str(uuid.uuid4()), "state": view["state"],
                    "action": {"type": "claim", "id": "hermit"}}
            execute = StoreConnection.execute
            def fail_receipt(connection, sql, parameters=()):
                if sql.startswith("INSERT INTO main_artifact_receipts"):
                    raise psycopg.OperationalError("Fixture receipt write failed")
                return execute(connection, sql, parameters)
            with patch.object(StoreConnection, "execute", fail_receipt), self.assertRaises(AssetError):
                api.request(body, token)
            with api.connect() as db:
                self.assertEqual(dict(db.execute("SELECT * FROM main_artifact_world").fetchone()), before)
                self.assertEqual(dict(db.execute("SELECT * FROM main_artifact_sessions").fetchone()), session)
                self.assertEqual(db.execute("SELECT COUNT(*) FROM main_artifact_receipts").fetchone()[0], 1)
            view = api.request(body, token)
            self.assertEqual([item["id"] for item in view["owned"]], ["hermit"])
            self.assertEqual(api.request(body, token), view)

    def test_shared_image_workers_race_and_recover_verified_result_on_real_services(self):
        output = io.BytesIO()
        Image.new("RGB", (1024, 1024), "navy").save(output, "PNG")
        writer = Mock(return_value=output.getvalue())
        first = SharedImages(self.storage)
        second = SharedImages(AssetStorage(S3Blobs(self.client, "integration-assets"),
                                          AssetCatalogue(lambda: psycopg.connect(self.dsn), postgres=True)))
        entered, release = threading.Event(), threading.Event()
        def generate(brief):
            entered.set()
            if not release.wait(10):
                raise WorkshopError("Test provider was not released.")
            return output.getvalue()
        writer.side_effect = generate
        brief = {"prompt": "A symbolic notebook illustration"}
        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(first.generate, "journal-art", "contested-image", brief, writer)
            try:
                self.assertTrue(entered.wait(10))
                with self.assertRaisesRegex(AssetError, "no retry"):
                    second.generate("journal-art", "contested-image", brief, writer)
            finally:
                release.set()
            image = future.result(timeout=10)
        self.assertEqual(second.generate("journal-art", "contested-image", brief, writer), image)
        writer.assert_called_once()
        writer.side_effect = None
        with patch.object(first.jobs, "finish", side_effect=AssetError("Lost finalization")):
            with self.assertRaises(AssetError):
                first.generate("encounter-art", "recover-image", brief, writer)
        self.assertIsNotNone(second.generate("encounter-art", "recover-image", brief, writer))
        self.assertEqual(second.jobs.inspect("image-encounter-art", "recover-image")["status"], "ready")
        self.assertEqual(writer.call_count, 2)

    def test_two_producers_share_one_postgres_reservation_and_api_state(self):
        with tempfile.TemporaryDirectory() as directory:
            first = StartArt(Path(directory) / "vm-one" / "attempts.sqlite3", assets=self.storage)
            other_storage = AssetStorage(S3Blobs(self.client, "integration-assets"),
                                         AssetCatalogue(lambda: psycopg.connect(self.dsn), postgres=True))
            second = StartArt(Path(directory) / "vm-two" / "attempts.sqlite3", assets=other_storage)
            day = date(2026, 11, 1)
            barrier = threading.Barrier(2)
            entered, release = threading.Event(), threading.Event()
            calls = []
            output = io.BytesIO()
            Image.new("RGB", (1024, 1024), "navy").save(output, "PNG")
            def writer(brief):
                calls.append(brief)
                entered.set()
                if not release.wait(10):
                    raise WorkshopError("Test provider was not released.")
                return output.getvalue()
            def generate(art):
                barrier.wait(timeout=10)
                try:
                    art.generate(day, writer)
                    return "ready"
                except WorkshopError as error:
                    self.assertIn("running", str(error))
                    return "blocked"
            with ThreadPoolExecutor(max_workers=2) as pool:
                futures = [pool.submit(generate, art) for art in (first, second)]
                try:
                    self.assertTrue(entered.wait(10))
                    self.assertIsNone(second.image(str(day)))
                    self.assertEqual(second.snapshot()["lastAttempt"], {"day": str(day), "status": "running"})
                    # The loser must finish while the winning provider is still blocked.
                    done, _ = wait(futures, timeout=10, return_when=FIRST_COMPLETED)
                    self.assertEqual(len(done), 1)
                    self.assertEqual(next(iter(done)).result(), "blocked")
                finally:
                    release.set()
                self.assertEqual(sorted(future.result() for future in futures), ["blocked", "ready"])
            self.assertEqual(len(calls), 1)
            self.assertEqual(first.snapshot(), second.snapshot())
            self.assertEqual(first.image(str(day)), second.image(str(day)))
            second.generate(day, writer)
            self.assertEqual(len(calls), 1)
            self.assertFalse(first.path.parent.exists())
            self.assertFalse(second.path.parent.exists())
            with self.catalogue.connection() as db:
                self.assertEqual(db.execute(
                    "SELECT COUNT(*) FROM generation_jobs WHERE kind='title-art' AND request=%s",
                    (str(day),)).fetchone()[0], 1)

    def test_published_job_can_recover_after_finalization_failure_without_paid_retry(self):
        with tempfile.TemporaryDirectory() as directory:
            art = StartArt(Path(directory) / "vm-one.sqlite3", assets=self.storage)
            output = io.BytesIO()
            Image.new("RGB", (1024, 1024), "navy").save(output, "PNG")
            calls = []
            def writer(brief):
                calls.append(brief)
                return output.getvalue()
            day = date(2026, 11, 2)
            with patch.object(art.jobs, "finish", side_effect=AssetError("Lost finalization")):
                with self.assertRaises(AssetError):
                    art.generate(day, writer)
            reopened = StartArt(Path(directory) / "vm-two.sqlite3", assets=self.storage)
            with self.assertRaisesRegex(WorkshopError, "no retry"):
                reopened.generate(day, writer)
            self.assertIsNone(reopened.image(str(day)))
            reopened.recover_published(str(day))
            self.assertEqual(reopened.jobs.status("title-art", str(day)), "ready")
            self.assertIsNotNone(reopened.image(str(day)))
            self.assertEqual(len(calls), 1)

    def test_published_assets_survive_both_service_restarts(self):
        record = self.publish("survives-restart")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "unused.sqlite3"
            art = StartArt(path, assets=self.storage)
            day = date(2026, 11, 5)
            self.assertTrue(art.jobs.claim("title-art", str(day), art_brief(day), IMAGE_MODEL))
            encounter = EncounterArt(path, assets=self.storage)
            output = io.BytesIO()
            Image.new("RGB", (1024, 1024), "navy").save(output, "PNG")
            writer = Mock(return_value=output.getvalue())
            identity = encounter.generate("event.food", writer, now=100, request="d" * 32)
            item = {"scene": "event.food", "occurrence": "event:restart"}
            self.assertEqual(encounter.shared.sync("owner", [item], 100)[0]["id"], identity)
            raw = encounter.shared.image("owner", item["occurrence"], identity)
            journal_queue = JournalStorage(self.storage)
            journal_brief = {"key": "cover", "birth": "fool", "daily": "moon",
                             "scenes": ["forest"], "activities": [], "partial": False}
            journal_queue.enqueue("journal-owner", journal_brief, per_owner=366, total_limit=1000)
            journeys = JourneyStore(ChunkStore(cache=Path(directory)), atomic_write, assets=self.storage)
            genesis, _ = journeys.create({"requestId": str(uuid.uuid4()), "region": "firmi", "name": "Restart"})
            journey_id = genesis["state"]["serverJourney"]["id"]
            books = AbandonedJournals(journeys)
            books.bind(journey_id, "a" * 64)
            artifacts = MainArtifacts(journeys, books)
            artifact_body = {"journey": journey_id, "requestId": str(uuid.uuid4()),
                             "state": copy.deepcopy(genesis["state"]), "action": None}
            artifact_view = artifacts.request(artifact_body, "a" * 64)
        for container in (self.postgres, self.object_server):
            subprocess.run(["docker", "restart", container], check=True, capture_output=True, timeout=60)
        cls = type(self)
        cls.dsn = psycopg.conninfo.make_conninfo(cls.dsn, port=self.port(self.postgres, "5432/tcp"))
        cls.client = boto3.client(
            "s3", endpoint_url="http://127.0.0.1:" + self.port(self.object_server, "9000/tcp"),
            region_name="us-east-1", aws_access_key_id="integration", aws_secret_access_key=cls.password,
            config=Config(connect_timeout=2, read_timeout=3, retries={"total_max_attempts": 1}))
        cls.storage = AssetStorage(S3Blobs(cls.client, "integration-assets"), cls.catalogue)
        for attempt in range(60):
            try:
                result = self.storage.read("integration", "survives-restart")
                break
            except (AssetError, OSError):
                if attempt == 59:
                    raise
                time.sleep(1)
        self.assertEqual(result, (record, b"test-image"))
        reopened = StartArt(path, assets=self.storage)
        self.assertEqual(reopened.jobs.status("title-art", str(day)), "running")
        def forbidden_writer(brief):
            self.fail("A restarted producer must not retry an uncertain paid call.")
        with self.assertRaisesRegex(WorkshopError, "no retry"):
            reopened.generate(day, forbidden_writer)
        encounter = EncounterArt(path, assets=self.storage)
        self.assertEqual(encounter.shared.sync("owner", [item], 100)[0]["id"], identity)
        self.assertEqual(encounter.shared.image("owner", item["occurrence"], identity), raw)
        self.assertEqual(encounter.generate("event.food", forbidden_writer, request=identity), identity)
        self.assertFalse(path.exists())
        writer.assert_called_once()
        journal_queue = JournalStorage(self.storage)
        self.assertEqual(journal_queue.entries("journal-owner")[0]["status"], "queued")
        job = journal_queue.acquire()
        self.assertEqual(job["brief"], journal_brief)
        self.assertEqual(job["owner"], "journal-owner")
        journeys = JourneyStore(ChunkStore(cache=path.parent), atomic_write, assets=self.storage)
        self.assertEqual(journeys.read(journey_id), genesis)
        books = AbandonedJournals(journeys)
        reader = JournalArt(journeys, books, assets=self.storage)
        try:
            self.assertEqual(reader.authorize({"journey": journey_id}, "a" * 64), (journey_id, genesis))
        finally:
            reader.close()
        artifacts = MainArtifacts(journeys, books)
        with patch.object(artifacts, "worker", side_effect=AssertionError("Receipt must not execute again")):
            self.assertEqual(artifacts.request(artifact_body, "a" * 64), artifact_view)
        self.assertFalse(artifacts.path.exists())
