"""One shared, accounted provider dispatch per immutable image request."""

import logging
import sqlite3

from asset_storage import AssetConflict, AssetError
from content_factory import IMAGE_LICENSE, IMAGE_MODEL, WorkshopError, normalize_image
from durable_jobs import DurableJobs


class SharedImages:
    def __init__(self, assets):
        self.assets = assets
        self.jobs = DurableJobs(assets.catalogue)

    def _published(self, kind, request):
        if self.assets.catalogue.find(kind, request) is None:
            return None
        image = self.assets.read(kind, request)[1]
        self.jobs.complete_verified("image-" + kind, request)
        logging.info("Reusing verified %s image %s; no provider call.", kind, request)
        return image

    def generate(self, kind, request, brief, writer, *, version="1"):
        if (kind not in {"title-art", "journal-art", "encounter-art"}
                or not isinstance(brief, dict) or not isinstance(brief.get("prompt"), str)
                or not brief["prompt"].strip() or not isinstance(version, str)
                or not 0 < len(version) <= 1000 or any(ord(char) < 32 for char in version)):
            raise ValueError("Invalid shared image kind, prompt or recipe version.")
        job_kind = "image-" + kind
        payload = {"brief": brief, "model": IMAGE_MODEL, "version": version}
        self.jobs.enqueue(job_kind, request, payload, provider="images")
        image = self._published(kind, request)
        if image is not None:
            return image
        job = self.jobs.acquire(job_kind, request=request, seconds=900)
        if job is None:
            image = self._published(kind, request)
            if image is not None:
                return image
            raise AssetError("Image job already dispatched, finished or owned by another worker; no retry.")
        self.jobs.dispatch(job)
        try:
            image = normalize_image(writer(brief))
            self.jobs.renew(job, seconds=900)
            self.assets.publish(kind, request, image, media_type="image/webp",
                                retention="durable", provenance={
                                    "source": IMAGE_MODEL, "license": IMAGE_LICENSE, "version": version})
        except (WorkshopError, AssetError, OSError, sqlite3.Error) as error:
            logging.error("Shared image job failed for %s/%s: %s", kind, request, error)
            self.jobs.finish(job, error=str(error)[:2000])
            raise
        try:
            self.jobs.finish(job)
        except AssetConflict:
            if self.jobs.inspect(job_kind, request)["status"] != "ready":
                raise
            self.assets.read(kind, request)
        return image
