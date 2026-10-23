from concurrent.futures import ThreadPoolExecutor
import io
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import Mock, patch

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from asset_storage import AssetConflict, AssetError, local_storage
from content_factory import WorkshopError
from shared_images import SharedImages


def fixture_image():
    output = io.BytesIO()
    Image.new("RGB", (1024, 1024), "navy").save(output, "PNG")
    return output.getvalue()


class SharedImagesTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.assets = local_storage(self.root)
        self.images = SharedImages(self.assets)
        self.images.jobs.configure_quota("images", daily=None, monthly=None)
        self.writer = Mock(return_value=fixture_image())
        self.brief = {"prompt": "A decorative countryside"}

    def generate(self, kind="journal-art", request="one"):
        return self.images.generate(kind, request, self.brief, self.writer)

    def test_all_image_kinds_share_accounting_and_durable_assets(self):
        for kind in ("title-art", "journal-art", "encounter-art"):
            image = self.generate(kind)
            with Image.open(io.BytesIO(image)) as decoded:
                self.assertEqual(decoded.format, "WEBP")
            reopened = SharedImages(local_storage(self.root))
            self.assertEqual(reopened.generate(kind, "one", self.brief, self.writer), image)
            self.assertEqual(reopened.jobs.inspect("image-" + kind, "one")["status"], "ready")
        self.assertEqual(self.writer.call_count, 3)
        with self.assets.catalogue.connection() as db:
            self.assertEqual([row[0] for row in db.execute("SELECT calls FROM provider_usage")], [3, 3])
        with self.assertRaises(AssetConflict):
            self.images.generate("journal-art", "one", {"prompt": "Changed"}, self.writer)
        self.assertEqual(self.writer.call_count, 3)

    def test_competing_workers_never_repeat_an_inflight_provider_call(self):
        entered, release = threading.Event(), threading.Event()
        def writer(brief):
            entered.set()
            if not release.wait(5):
                raise WorkshopError("Test provider was not released")
            return fixture_image()
        self.writer.side_effect = writer
        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(self.generate)
            try:
                self.assertTrue(entered.wait(5))
                with self.assertRaisesRegex(AssetError, "no retry"):
                    SharedImages(local_storage(self.root)).generate(
                        "journal-art", "one", self.brief, self.writer)
            finally:
                release.set()
            image = future.result(timeout=5)
        self.assertEqual(self.generate(), image)
        self.writer.assert_called_once()

    def test_quota_applies_across_producers_and_missing_policy_refuses_calls(self):
        self.images.jobs.configure_quota("images", daily=1, monthly=1)
        self.generate("journal-art")
        with self.assertRaisesRegex(AssetError, "quota exhausted"):
            self.generate("encounter-art")
        self.writer.assert_called_once()
        with self.assets.catalogue.connection() as db:
            db.execute("DELETE FROM provider_quotas")
        with self.assertRaisesRegex(AssetError, "not configured"):
            self.generate("title-art")
        self.writer.assert_called_once()

    def test_provider_and_publication_failures_cannot_repeat_call(self):
        for failure in ("provider", "upload"):
            request = failure
            with self.subTest(failure=failure):
                if failure == "provider":
                    self.writer.side_effect = WorkshopError("Provider unavailable")
                    with self.assertLogs(level="ERROR"), self.assertRaises(WorkshopError):
                        self.generate(request=request)
                    self.writer.side_effect = None
                else:
                    with patch.object(self.assets, "publish", side_effect=AssetError("Upload unavailable")):
                        with self.assertLogs(level="ERROR"), self.assertRaises(AssetError):
                            self.generate(request=request)
                with self.assertRaisesRegex(AssetError, "no retry"):
                    self.generate(request=request)
                self.assertEqual(self.images.jobs.inspect("image-journal-art", request)["status"], "failed")
        self.assertEqual(self.writer.call_count, 2)

    def test_verified_asset_survives_lost_finish_without_provider_retry(self):
        with patch.object(self.images.jobs, "finish", side_effect=AssetError("Lost SQL acknowledgement")):
            with self.assertRaises(AssetError):
                self.generate()
        image = self.generate()
        self.assertEqual(image, self.assets.read("journal-art", "one")[1])
        self.assertEqual(self.images.jobs.inspect("image-journal-art", "one")["status"], "ready")
        self.writer.assert_called_once()
        record, _ = self.assets.read("journal-art", "one")
        (self.assets.blobs.root / record.key).write_bytes(b"corrupt")
        with self.assertRaisesRegex(AssetError, "integrity"):
            self.generate()
        self.writer.assert_called_once()

    def test_invalid_recipe_is_rejected_before_provider_dispatch(self):
        for kind, brief, version in (("unknown", self.brief, "1"), ("title-art", {}, "1"),
                                     ("title-art", self.brief, ""), ("title-art", self.brief, "bad\n")):
            with self.subTest(kind=kind, version=version), self.assertRaises(ValueError):
                self.images.generate(kind, "one", brief, self.writer, version=version)
        self.writer.assert_not_called()

    def test_expired_dispatch_cannot_publish_or_repeat_provider_call(self):
        def writer(brief):
            with self.assets.catalogue.connection() as db:
                db.execute("UPDATE worker_jobs SET expires=0")
            return fixture_image()
        self.writer.side_effect = writer
        with self.assertLogs(level="ERROR"), self.assertRaises(AssetConflict):
            self.generate()
        self.assertIsNone(self.assets.catalogue.find("journal-art", "one"))
        with self.assertRaisesRegex(AssetError, "no retry"):
            self.generate()
        self.assertEqual(self.images.jobs.inspect("image-journal-art", "one")["status"], "uncertain")
        self.writer.assert_called_once()
