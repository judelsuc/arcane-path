import base64
import io
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import Mock, patch

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from abandoned_journals import JournalForbidden
from asset_storage import AssetError, S3Blobs, local_storage
from change_requests import (ChangeRequests, PREFIX, RETENTION, SCOPE, delete_versions,
                             export_report, delete_report, report_storage, purge, validate_image, validate_snapshot)
from journeys import JourneyCapacity, JourneyConflict, JourneyRequest


def snapshot():
    return {"version": 1, "capturedAt": "2026-10-27T12:00:00.000Z",
            "build": {"commit": "a" * 40, "version": 1}, "language": "en",
            "viewport": {"width": 800, "height": 600, "pixelRatio": 2, "scrollX": 0, "scrollY": 0},
            "appearance": {"tileset": "ascii", "skin": "default"},
            "visible": {"screen": "travel-controls", "dialogs": ["town-dialog"]},
            "game": {"col": -1, "row": 4, "health": 70, "elapsedMinutes": 20}}


def screenshot():
    image = Image.new("RGB", (800, 600), "#102030")
    image.putpixel((400, 300), (240, 240, 240))
    stream = io.BytesIO()
    image.save(stream, "PNG")
    return stream.getvalue()


class ChangeRequestTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.assets = local_storage(self.root / "shared")
        self.addCleanup(self.assets.catalogue.close)
        self.journeys = SimpleNamespace(assets=self.assets)
        class Authorization:
            def authorize(self, journey, capability):
                if capability != "private":
                    raise JournalForbidden("Invalid capability.")
                return {"region": "fixture"}
        self.service = ChangeRequests(self.journeys, Authorization(), enabled=True)
        purge(self.assets)
        self.data = {"id": "b" * 32, "journey": "a" * 32,
                     "comment": "The buttons are too small on my device.",
                     "snapshot": snapshot(), "image": base64.b64encode(screenshot()).decode()}

    def submit(self, **changes):
        return self.service.submit({**self.data, **changes}, "private")

    def test_persistence_cross_instance_export_and_idempotent_concurrent_retries(self):
        with ThreadPoolExecutor(max_workers=8) as pool:
            receipts = list(pool.map(lambda _: self.submit(), range(8)))
        self.assertEqual(receipts, [{"id": "b" * 32, "status": "submitted"}] * 8)
        with self.assets.catalogue.connection() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM change_requests").fetchone()[0], 1)
            row = db.execute("SELECT status,created,expires FROM change_requests").fetchone()
            self.assertEqual(row[0], "submitted")
            self.assertEqual(row[2] - row[1], RETENTION)
        reopened = local_storage(self.root / "shared")
        self.addCleanup(reopened.catalogue.close)
        output = self.root / "private-review"
        export_report(reopened, "b" * 32, output)
        report = json.loads((output / "request.json").read_text())
        self.assertEqual(report["comment"], self.data["comment"])
        self.assertEqual(report["snapshot"], self.data["snapshot"])
        self.assertEqual((output / "screenshot.png").read_bytes(), screenshot())
        self.assertEqual(output.stat().st_mode & 0o777, 0o700)
        self.assertEqual((output / "request.json").stat().st_mode & 0o777, 0o600)
        self.assertNotIn("private", json.dumps(report))

    def test_manual_local_storage_accepts_without_a_retention_timer_and_can_delete_after_review(self):
        root = self.root / "reports"
        root.mkdir(mode=0o700)
        with patch.dict("os.environ", {"ARCANE_CHANGE_REQUESTS_LOCAL_DIR": str(root)}):
            assets = report_storage(self.assets)
        service = ChangeRequests(self.journeys, self.service.authorization,
                                 enabled=True, assets=assets, manual_cleanup=True)
        with self.assets.catalogue.connection() as db:
            db.execute("DELETE FROM change_request_retention")
        service.submit(self.data, "private")
        self.assertTrue(list(root.rglob("*")))
        export_report(assets, self.data["id"], self.root / "manual-review")
        self.assertEqual(delete_report(assets, self.data["id"]), 1)
        with self.assets.catalogue.connection() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM change_requests").fetchone()[0], 0)
        self.assertFalse(any(path.is_file() for path in root.rglob("*")))

    def test_local_report_directory_must_be_private_and_manual_cleanup_cannot_use_s3(self):
        root = self.root / "public"
        root.mkdir(mode=0o755)
        with patch.dict("os.environ", {"ARCANE_CHANGE_REQUESTS_LOCAL_DIR": str(root)}), self.assertRaises(AssetError):
            report_storage(self.assets)
        bad = SimpleNamespace(blobs=S3Blobs(Mock(), "fixture-bucket"), catalogue=self.assets.catalogue)
        with self.assertRaises(AssetError):
            ChangeRequests(self.journeys, self.service.authorization, assets=bad, manual_cleanup=True)

    def test_invalid_capability_changed_evidence_and_unconfigured_collection_are_rejected(self):
        with self.assertRaises(JournalForbidden):
            self.service.submit(self.data, "wrong")
        self.submit()
        with self.assertRaises(JourneyConflict):
            self.submit(comment="Changed evidence")
        disabled = ChangeRequests(self.journeys, self.service.authorization)
        with self.assertRaises(JourneyCapacity):
            disabled.submit(self.data, "private")

    def test_snapshot_rejects_credentials_hidden_answers_and_unknown_fields_recursively(self):
        for field in ("journalAccess", "capability", "localStorage", "trail", "parentName"):
            altered = snapshot()
            altered[field] = "secret"
            with self.subTest(field=field), self.assertRaises(JourneyRequest):
                validate_snapshot(altered)
        for section in ("game", "build", "visible", "viewport", "appearance"):
            altered = snapshot()
            altered[section]["secret"] = "private"
            with self.subTest(section=section), self.assertRaises(JourneyRequest):
                validate_snapshot(altered)
        for change in ({"version": True}, {"capturedAt": "yesterday"}, {"language": "de"},
                       {"game": {"health": float("nan")}},
                       {"visible": {"screen": "game", "dialogs": ["token?secret"]}}):
            with self.assertRaises(JourneyRequest):
                validate_snapshot({**snapshot(), **change})

    def test_comment_image_size_decode_format_and_viewport_are_bounded(self):
        for value in ("", " " * 3, "x" * 2001, "\x00secret", ["text"]):
            with self.subTest(value=type(value)), self.assertRaises(JourneyRequest):
                self.submit(comment=value)
        for encoded in ("bad base64", base64.b64encode(b"not an image").decode(), "a" * 4_000_004):
            with self.assertRaises(JourneyRequest):
                validate_image(encoded, snapshot())
        large = Image.new("RGB", (4096, 4096), "blue")
        stream = io.BytesIO()
        large.save(stream, "PNG")
        with self.assertRaises(JourneyRequest):
            validate_image(base64.b64encode(stream.getvalue()).decode(), snapshot())
        altered = snapshot()
        altered["viewport"]["height"] = 200
        with self.assertRaises(JourneyRequest):
            validate_image(self.data["image"], altered)
        self.assertEqual(validate_image(self.data["image"], snapshot()), screenshot())

    def test_selected_pixel_tileset_is_valid_diagnostic_evidence_but_arbitrary_styles_are_not(self):
        state = snapshot()
        state["appearance"]["tileset"] = "path-pixel"
        self.assertEqual(json.loads(validate_snapshot(state))["appearance"]["tileset"], "path-pixel")
        for value in ("remote-pack", "<style>", {}, None):
            state["appearance"]["tileset"] = value
            with self.assertRaises(JourneyRequest):
                validate_snapshot(state)

    def test_upload_failure_never_publishes_and_identical_retry_preserves_reservation(self):
        with patch.object(self.assets.blobs, "put", side_effect=AssetError("S3 unavailable")):
            with self.assertRaises(AssetError):
                self.submit()
        with self.assets.catalogue.connection() as db:
            self.assertEqual(db.execute("SELECT status FROM change_requests").fetchone()[0], "preparing")
        with self.assertRaises(ValueError):
            export_report(self.assets, self.data["id"], self.root / "absent")
        self.assertEqual(self.submit()["status"], "submitted")

    def test_sql_failure_after_verified_image_is_retryable_without_success_acknowledgement(self):
        publish = self.assets.publish
        def fail_after_publish(*args, **kwargs):
            publish(*args, **kwargs)
            raise AssetError("Database interrupted after image persistence")
        with patch.object(self.assets, "publish", side_effect=fail_after_publish):
            with self.assertRaises(AssetError):
                self.submit()
        self.assertEqual(self.submit()["status"], "submitted")

    def test_rate_global_quota_and_stale_or_failed_retention_gate(self):
        self.submit()
        with self.assertRaises(JourneyCapacity):
            self.submit(id="c" * 32)
        with self.assets.catalogue.connection() as db:
            db.execute("UPDATE change_request_retention SET checked=0")
        with self.assertRaises(JourneyCapacity):
            self.submit(id="c" * 32, journey="c" * 32)
        with patch("change_requests.delete_versions", side_effect=AssetError("Deletion denied")):
            with self.assertRaises(AssetError):
                purge(self.assets)
        with self.assets.catalogue.connection() as db:
            self.assertIsNone(db.execute("SELECT checked FROM change_request_retention").fetchone())
        with self.assertRaises(JourneyCapacity):
            self.submit(id="d" * 32, journey="d" * 32)

    def test_expired_reports_and_incomplete_uploads_are_physically_deleted_with_no_export(self):
        self.submit()
        record, _ = self.assets.read(SCOPE, self.data["id"])
        with self.assets.catalogue.connection() as db:
            db.execute("UPDATE change_requests SET expires=0")
        with self.assertRaises(ValueError):
            export_report(self.assets, self.data["id"], self.root / "expired")
        self.assertEqual(purge(self.assets), 1)
        self.assertFalse((self.assets.blobs.root / record.key).exists())
        with self.assets.catalogue.connection() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM change_requests").fetchone()[0], 0)
            self.assertIsNone(db.execute("SELECT request FROM asset_catalogue WHERE scope=?", (SCOPE,)).fetchone())

    def test_duplicate_image_shared_with_current_report_is_not_deleted_early(self):
        self.submit()
        self.submit(id="c" * 32, journey="c" * 32)
        with self.assets.catalogue.connection() as db:
            db.execute("UPDATE change_requests SET expires=0 WHERE id=?", (self.data["id"],))
        self.assertEqual(purge(self.assets), 1)
        self.assets.read(SCOPE, "c" * 32)

    def test_incomplete_upload_expiry_late_catalogue_write_and_old_orphan_bytes_are_cleaned(self):
        import os
        import time
        self.submit()
        with self.assets.catalogue.connection() as db:
            db.execute("UPDATE change_requests SET status='preparing',expires=0")
        self.assertEqual(purge(self.assets), 1)
        late = self.assets.publish(SCOPE, self.data["id"], screenshot(), media_type="image/png",
                                   retention="durable", provenance={"source": "synthetic late fixture",
                                                                   "license": "private", "version": "fixture-v1"})
        orphan = self.assets.blobs.root / late.key
        os.utime(orphan, (time.time() - 172800,) * 2)
        self.assertEqual(purge(self.assets), 0)
        self.assertFalse(orphan.exists())
        with self.assets.catalogue.connection() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM asset_catalogue WHERE scope=?", (SCOPE,)).fetchone()[0], 0)

    def test_three_daily_and_global_capacity_limits_reject_without_new_reservation(self):
        import time
        self.submit()
        for identity in ("c" * 32, "d" * 32):
            with self.assets.catalogue.connection() as db:
                db.execute("UPDATE change_requests SET created=?", (time.time() - 1000,))
            self.submit(id=identity)
        with self.assertRaises(JourneyCapacity):
            self.submit(id="e" * 32)
        with self.assets.catalogue.connection() as db:
            db.execute("UPDATE change_requests SET image_size=512000000")
        with self.assertRaises(JourneyCapacity):
            self.submit(id="f" * 32, journey="f" * 32)
        with self.assets.catalogue.connection() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM change_requests").fetchone()[0], 3)

    def test_only_a_nonblank_image_without_camera_metadata_is_accepted(self):
        from PIL.PngImagePlugin import PngInfo
        for color in ("black", "white", "red"):
            stream = io.BytesIO()
            Image.new("RGB", (800, 600), color).save(stream, "PNG")
            with self.assertRaises(JourneyRequest):
                validate_image(base64.b64encode(stream.getvalue()).decode(), snapshot())
        metadata = PngInfo()
        metadata.add_text("XML:com.adobe.xmp", "PRIVATE CAMERA METADATA")
        stream = io.BytesIO()
        Image.open(io.BytesIO(screenshot())).save(stream, "PNG", pnginfo=metadata)
        with self.assertRaises(JourneyRequest):
            validate_image(base64.b64encode(stream.getvalue()).decode(), snapshot())

    def test_versioned_s3_delete_is_exact_scoped_and_verifies_all_versions(self):
        client = Mock()
        key = PREFIX + "f" * 64
        client.get_paginator.return_value.paginate.return_value = [{
            "Versions": [{"Key": key, "VersionId": "one"}, {"Key": key + "other", "VersionId": "other"}],
            "DeleteMarkers": [{"Key": key, "VersionId": "marker"}],
        }]
        client.list_object_versions.return_value = {}
        assets = SimpleNamespace(blobs=S3Blobs(client, "private-fixtures"))
        delete_versions(assets, key)
        self.assertEqual(client.delete_object.call_count, 2)
        self.assertEqual({call.kwargs["VersionId"] for call in client.delete_object.call_args_list},
                         {"one", "marker"})
        with self.assertRaises(AssetError):
            delete_versions(assets, "v1/durable/" + "a" * 64 + "/" + "f" * 64)
        client.list_object_versions.return_value = {"Versions": [{"Key": key}]}
        with self.assertRaises(AssetError):
            delete_versions(assets, key)


if __name__ == "__main__":
    unittest.main()
