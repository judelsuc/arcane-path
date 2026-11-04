import copy
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from migrate_chunk_grids import migrate
from travel_server import ChunkStore


class GridMigrationTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.chunks = ChunkStore(cache=Path(directory.name))
        with patch("travel_server.fetch_elevations", return_value={"values": [100] * 64}), \
                patch("travel_server.download_region", side_effect=AssertionError("Offline")):
            self.data = self.chunks.build("firmi", 1, 1)
        self.old = self.chunks.pipeline
        self.chunks.pipeline = "a" * 64

    def test_existing_geometry_is_reused_without_rasterization_or_network_and_is_idempotent(self):
        with patch("travel_server.rasterize", side_effect=AssertionError("No rebuild")), \
                patch("urllib.request.urlopen", side_effect=AssertionError("No network")):
            self.assertEqual(migrate(self.chunks, self.old), 1)
            self.assertEqual(self.chunks.read("firmi", 1, 1), self.data)
            self.assertEqual(migrate(self.chunks, self.old), 0)
        self.assertEqual(self.chunks.pipeline, "a" * 64)

    def test_corrupt_or_incompatible_legacy_grids_fail_instead_of_becoming_current(self):
        old = copy.copy(self.chunks)
        old.pipeline = self.old
        path = old.path("firmi", 1, 1).with_suffix(".json")
        original = json.loads(path.read_text())
        corrupt = copy.deepcopy(original)
        corrupt["data"]["rows"][0][0]["terrain"] = "water"
        path.write_text(json.dumps(corrupt))
        with self.assertRaisesRegex(ValueError, "Corrupt"):
            migrate(self.chunks, self.old)
        incompatible = copy.deepcopy(original)
        incompatible["data"]["bounds"]["maxLatitude"] += 1
        incompatible["sha256"] = hashlib.sha256(
            json.dumps(incompatible["data"], sort_keys=True).encode()).hexdigest()
        path.write_text(json.dumps(incompatible))
        with self.assertRaisesRegex(ValueError, "Incompatible"):
            migrate(self.chunks, self.old)
        self.assertIsNone(self.chunks.read("firmi", 1, 1))

    def test_migration_requires_exact_operator_selected_previous_hash(self):
        for invalid in [None, "latest", "../cache", "a" * 63]:
            with self.assertRaisesRegex(ValueError, "exact previous"):
                migrate(self.chunks, invalid)


if __name__ == "__main__":
    unittest.main()
