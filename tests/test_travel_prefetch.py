import copy
import hashlib
import json
import tempfile
import threading
import time
import unittest
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from http.server import ThreadingHTTPServer
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from asset_storage import local_storage
from travel_prefetch import candidates, complete_ring, seed_existing
from travel_server import ChunkStore, make_handler


class TravelPrefetchTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        root = Path(self.temporary.name)
        self.assets = local_storage(root / "assets")
        self.addCleanup(self.assets.catalogue.close)
        self.store = ChunkStore(cache=root / "cache")
        self.store.set_shared_assets(self.assets)

    def chunk(self, region, x, y):
        data = copy.deepcopy(self.store.bases[region])
        data.update(width=8, height=8, sitesVersion=1, chunk={"region": region, "x": x, "y": y, "size": 8})
        data["rows"] = [row[:8] for row in data["rows"][:8]]
        return data

    def test_completion_runs_without_browser_and_never_expands_beyond_one_ring(self):
        self.store.request_chunks("firmi", [(1, 1)])
        expected = {("firmi", x, y) for x in range(3) for y in range(3)}
        self.assertEqual(set(candidates(self.store, 10)), expected)
        with patch.object(self.store, "compute_chunk", side_effect=self.chunk) as compute:
            while candidates(self.store, 2):
                result = complete_ring(self.store, 2)
                self.assertLessEqual(result["selected"], 2)
                self.assertEqual(result["failed"], 0)
            self.assertEqual(compute.call_count, 9)
        self.assertEqual(candidates(self.store, 10), [])
        with self.assets.catalogue.connection() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM travel_chunk_interests").fetchone()[0], 1)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM travel_chunk_cache WHERE status='ready'").fetchone()[0], 9)
        self.store.request_chunks("firmi", [(2, 1)])
        self.assertEqual(set(candidates(self.store, 10)), {("firmi", 3, y) for y in range(3)})

    def test_overlapping_rings_deduplicate_targets_and_preserve_provider_cooldowns(self):
        self.store.request_chunks("firmi", [(1, 1)])
        region, x, y = candidates(self.store, 1)[0]
        token = self.store.claim_shared_chunk(region, x, y, False)
        self.assertNotIn((region, x, y), candidates(self.store, 10), "active jobs must not be duplicated")
        self.store.fail_shared_chunk(region, x, y, token, ValueError("OSM unavailable"))
        self.assertNotIn((region, x, y), candidates(self.store, 10), "server retries respect cooldown")
        with self.assets.catalogue.connection() as db:
            db.execute("UPDATE travel_chunk_cache SET expires=? WHERE chunk_id=?",
                       (time.time() - 1, self.store.chunk_id(region, x, y)))
        self.assertIn((region, x, y), candidates(self.store, 10))
        self.store.request_chunks("firmi", [(2, 1)])
        self.assertEqual(len(set(candidates(self.store, 10))), 10)
        with patch.object(self.store, "compute_chunk", side_effect=ValueError("OSM unavailable")), \
                self.assertLogs(level="ERROR"):
            result = complete_ring(self.store, 1)
        self.assertEqual(result, {"selected": 1, "completed": 0, "failed": 1})

    def test_explicit_bootstrap_reuses_existing_cache_but_is_not_repeated_by_worker(self):
        with patch.object(self.store, "compute_chunk", side_effect=self.chunk):
            self.store.build("firmi", 1, 1)
        self.assertEqual(candidates(self.store, 10), [])
        self.assertEqual(seed_existing(self.store), 1)
        self.assertEqual(len(candidates(self.store, 10)), 8)
        with patch.object(self.store, "compute_chunk", side_effect=self.chunk):
            complete_ring(self.store, 2)
        self.assertEqual(len(candidates(self.store, 10)), 6)
        with self.assets.catalogue.connection() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM travel_chunk_interests").fetchone()[0], 1)
        for invalid in [0, -1, 11]:
            with self.assertRaises(ValueError):
                candidates(self.store, invalid)

    def test_old_snapshot_or_pipeline_does_not_schedule_new_downloads(self):
        self.store.request_chunks("firmi", [(1, 1)])
        with self.assets.catalogue.connection() as db:
            db.execute("UPDATE travel_chunk_interests SET snapshot='obsolete'")
        self.assertEqual(candidates(self.store, 10), [])

    def test_identical_chunk_bytes_from_an_old_pipeline_do_not_conflict_on_provenance(self):
        data = self.chunk("firmi", 1, 1)
        checksum = hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()
        raw = json.dumps({"data": data, "sha256": checksum}, sort_keys=True).encode()
        old_request = hashlib.sha256(raw).hexdigest()
        self.assets.publish("travel-chunk", old_request, raw, media_type="application/json", retention="cache",
                            provenance={"source": "OpenStreetMap and Open-Meteo elevation service",
                                        "license": "ODbL and CC BY 4.0", "version": "old-pipeline"})
        with patch.object(self.store, "compute_chunk", return_value=data):
            self.assertEqual(self.store.build("firmi", 1, 1), data)
        self.assertEqual(self.store.read_shared_chunk("firmi", 1, 1), data)
        with self.assets.catalogue.connection() as db:
            request = db.execute("SELECT asset_request FROM travel_chunk_cache WHERE chunk_id=?",
                                 (self.store.chunk_id("firmi", 1, 1),)).fetchone()[0]
        self.assertNotEqual(request, old_request)

    def test_both_browser_chunk_endpoints_persist_seeds_but_invalid_requests_do_not(self):
        with ThreadPoolExecutor(max_workers=1) as pool:
            jobs = SimpleNamespace(pool=pool, request=lambda region, x, y: (200, self.chunk(region, x, y)))
            handler = make_handler(self.store, jobs)
            with ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
                thread = threading.Thread(target=server.serve_forever)
                thread.start()
                try:
                    base = f"http://127.0.0.1:{server.server_port}"
                    for path in [
                        "/api/chunk?region=firmi&x=1&y=1",
                        "/api/chunks-cached?region=firmi&positions=%5B%5B2,1%5D,%5B2,2%5D%5D",
                    ]:
                        with urllib.request.urlopen(base + path) as response:
                            self.assertEqual(response.status, 200)
                    with self.assertRaises(urllib.error.HTTPError) as error:
                        urllib.request.urlopen(base + "/api/chunk?region=firmi&x=1001&y=0")
                    self.assertEqual(error.exception.code, 400)
                finally:
                    server.shutdown()
                    thread.join()
            with self.assets.catalogue.connection() as db:
                self.assertEqual(db.execute("SELECT COUNT(*) FROM travel_chunk_interests").fetchone()[0], 3)
