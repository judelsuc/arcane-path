"""Generate one shared title illustration per Paris calendar day; never retry a day."""

import argparse
from contextlib import contextmanager
from datetime import date, datetime, timezone
import json
import logging
import os
from pathlib import Path
import sqlite3
from zoneinfo import ZoneInfo

from content_factory import IMAGE_LICENSE, IMAGE_MODEL, OvhImageWriter, WorkshopError, normalize_image
from journal_art import CARDS
from terraform_ovh import private_file
from asset_storage import AssetError, GenerationJobs, configured_storage
from durable_jobs import DurableJobs
from shared_images import SharedImages

ROOT = Path(__file__).resolve().parents[1]
PARIS = ZoneInfo("Europe/Paris")
LANDSCAPES = (
    "a winding footpath through European mountain foothills",
    "a quiet European riverside village and a distant bridge",
    "a sunken lane through an old European forest",
    "terraced Mediterranean hills above an unnamed coast",
    "a rural European railway halt beside open fields",
    "a stone shelter on a high European mountain pass",
    "a canal towpath beside an unnamed European town",
)
SEASONS = ("winter", "spring", "summer", "autumn")


def valid_day(value):
    if not isinstance(value, str) or date.fromisoformat(value).isoformat() != value:
        raise ValueError("Invalid daily title illustration date.")
    return value


def art_brief(day):
    offset = day.toordinal()
    card = tuple(CARDS)[offset % len(CARDS)]
    return {
        "prompt": (
            "A welcoming opening illustration for a European walking adventure. "
            f"An imaginary scene: {LANDSCAPES[offset % len(LANDSCAPES)]}, "
            f"in {SEASONS[(day.month % 12) // 3]}. "
            f"A subtle tarot-inspired motif: {CARDS[card]}. "
            "A wide-feeling landscape composition with a clear inviting path. "
            "No identifiable people, real landmarks, readable text, tarot card border, "
            "maps, clues or destinations. Decorative fiction, not a player's location or story."
        ),
        "landscape": offset % len(LANDSCAPES), "card": card, "version": 1,
    }


class StartArt:
    def __init__(self, path, assets=None):
        self.path = path
        self.assets = assets
        self.jobs = GenerationJobs(assets.catalogue) if assets is not None else None
        if self.jobs is not None:
            return
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with self.connect() as db:
            version = db.execute("PRAGMA user_version").fetchone()[0]
            if version not in (0, 1):
                raise ValueError("Unsupported daily title illustration database version.")
            db.executescript("""
                CREATE TABLE IF NOT EXISTS attempts (
                    day TEXT PRIMARY KEY, status TEXT NOT NULL, brief TEXT NOT NULL,
                    model TEXT NOT NULL, created TEXT NOT NULL, finished TEXT,
                    error TEXT, image BLOB
                );
                PRAGMA user_version=1;
            """)
        path.chmod(0o600)

    @classmethod
    def configured(cls, path):
        return cls(path, assets=configured_storage())

    @contextmanager
    def connect(self):
        if self.jobs is not None:
            raise AssetError("Configured title jobs use the shared catalogue, not a local attempts database.")
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def snapshot(self):
        if self.jobs is not None:
            result = self.jobs.snapshot("title-art")
            if result["image"] is not None:
                result["image"]["license"] = IMAGE_LICENSE
            return {"version": 1, **result}
        with self.connect() as db:
            latest = db.execute("SELECT day,status FROM attempts ORDER BY day DESC LIMIT 1").fetchone()
            ready = db.execute(
                "SELECT day,model FROM attempts WHERE status='ready' ORDER BY day DESC LIMIT 1"
            ).fetchone()
        return {
            "version": 1,
            "image": {**dict(ready), "license": IMAGE_LICENSE} if ready else None,
            "lastAttempt": dict(latest) if latest else None,
        }

    def image(self, day):
        valid_day(day)
        if self.jobs is not None:
            if self.jobs.status("title-art", day) != "ready":
                return None
            return self.assets.read("title-art", day)[1]
        with self.connect() as db:
            row = db.execute("SELECT image FROM attempts WHERE day=? AND status='ready'", (day,)).fetchone()
        if not row:
            return None
        if row["image"] is not None:
            return row["image"]
        raise AssetError("Daily image uses external storage, but asset storage is not configured.")

    def recover_published(self, day):
        """Complete a committed asset after interruption, without calling the provider."""
        valid_day(day)
        if self.jobs is None:
            raise ValueError("Published-image recovery requires configured shared storage.")
        status = self.jobs.status("title-art", day)
        if status not in ("running", "ready", "failed"):
            raise WorkshopError("An existing title job is required to recover a published image.", 409)
        self.assets.read("title-art", day)
        shared = SharedImages(self.assets)
        if shared.jobs.inspect("image-title-art", day) is not None:
            shared.jobs.complete_verified("image-title-art", day)
        self.jobs.complete_verified("title-art", day)
        logging.info("Recovered verified daily title illustration for %s; no provider call.", day)
        return self.snapshot()

    def queue_recovery(self, day):
        valid_day(day)
        if self.assets is None:
            raise ValueError("Recovery jobs require configured shared storage.")
        DurableJobs(self.assets.catalogue).enqueue("title-recovery", day, {"day": day})

    def work_recovery(self):
        if self.assets is None:
            raise ValueError("Recovery jobs require configured shared storage.")
        queue = DurableJobs(self.assets.catalogue)
        job = queue.acquire("title-recovery", seconds=300)
        if job is None:
            logging.info("No title-image recovery job is available.")
            return False
        try:
            self.recover_published(job["payload"]["day"])
        except (AssetError, WorkshopError, ValueError, OSError, sqlite3.Error) as error:
            logging.error("Title recovery failed for %s: %s", job["request"], error)
            queue.finish(job, error=str(error)[:2000])
            raise
        queue.finish(job)
        return True

    def generate(self, day, writer):
        key = day.isoformat()
        brief = art_brief(day)
        if self.jobs is not None:
            if not self.jobs.claim("title-art", key, brief, IMAGE_MODEL):
                status = self.jobs.status("title-art", key)
                if status == "ready":
                    logging.info("Daily title illustration already published for %s; no provider call.", key)
                    return self.snapshot()
                raise WorkshopError(
                    f"Title illustration for {key} was already attempted ({status}); "
                    "no retry. The previous published image is unchanged.", 409)
        else:
            with self.connect() as db:
                db.execute("BEGIN IMMEDIATE")
                previous = db.execute("SELECT status FROM attempts WHERE day=?", (key,)).fetchone()
                if previous:
                    if previous["status"] == "ready":
                        logging.info("Daily title illustration already published for %s; no provider call.", key)
                        return self.snapshot()
                    raise WorkshopError(
                        f"Title illustration for {key} was already attempted ({previous['status']}); "
                        "no retry. The previous published image is unchanged.", 409)
                db.execute(
                    "INSERT INTO attempts(day,status,brief,model,created) VALUES(?,'running',?,?,?)",
                    (key, json.dumps(brief), IMAGE_MODEL, datetime.now(timezone.utc).isoformat()),
                )
        logging.info("Generating daily title illustration for %s using %s.", key, IMAGE_MODEL)
        try:
            if self.assets is not None:
                image = SharedImages(self.assets).generate(
                    "title-art", key, brief, writer, version=str(brief["version"]))
            else:
                image = normalize_image(writer(brief))
        except (WorkshopError, AssetError, OSError, sqlite3.Error) as error:
            logging.error("Daily title illustration failed for %s; previous image retained: %s", key, error)
            if self.jobs is not None:
                self.jobs.finish("title-art", key, error=str(error))
            else:
                with self.connect() as db:
                    db.execute("UPDATE attempts SET status='failed',error=?,finished=? WHERE day=?",
                               (str(error), datetime.now(timezone.utc).isoformat(), key))
            raise
        if self.jobs is not None:
            self.jobs.finish("title-art", key)
        else:
            with self.connect() as db:
                db.execute("UPDATE attempts SET status='ready',image=?,finished=? WHERE day=?",
                           (image, datetime.now(timezone.utc).isoformat(), key))
        logging.info("Published daily title illustration for %s (%s bytes).", key, len(image))
        return self.snapshot()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, default=ROOT / ".cache/travel")
    operations = parser.add_mutually_exclusive_group()
    operations.add_argument("--recover-published", metavar="YYYY-MM-DD",
                            help="Finish an interrupted shared job from its verified asset; never generate.")
    operations.add_argument("--queue-recovery", metavar="YYYY-MM-DD",
                            help="Enqueue a safe, leased recovery of an already published image.")
    operations.add_argument("--work-recovery", action="store_true",
                            help="Process at most one safe recovery job without calling the provider.")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    try:
        if args.queue_recovery is not None or args.work_recovery:
            art = StartArt.configured(args.cache / "start-art.sqlite3")
            if args.queue_recovery is not None:
                art.queue_recovery(args.queue_recovery)
            else:
                art.work_recovery()
            return 0
        if args.recover_published is not None:
            StartArt.configured(args.cache / "start-art.sqlite3").recover_published(args.recover_published)
            return 0
        key_path = os.environ.get("ARCANE_START_IMAGES_TOKEN_FILE")
        if not key_path:
            raise ValueError("Set ARCANE_START_IMAGES_TOKEN_FILE to a private OVH access-key file.")
        token = private_file(Path(key_path)).strip()
        if not token or not token.isascii() or any(char.isspace() for char in token):
            raise ValueError("Invalid private daily title illustration access key.")
        art = StartArt.configured(args.cache / "start-art.sqlite3")
        art.generate(datetime.now(PARIS).date(), OvhImageWriter(token))
    except (OSError, ValueError, sqlite3.Error, WorkshopError, AssetError) as error:
        logging.error("Daily title illustration job stopped: %s", error)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
