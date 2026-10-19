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
    def __init__(self, path):
        self.path = path
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

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def snapshot(self):
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
        with self.connect() as db:
            row = db.execute("SELECT image FROM attempts WHERE day=? AND status='ready'", (day,)).fetchone()
        return row["image"] if row else None

    def generate(self, day, writer):
        key = day.isoformat()
        brief = art_brief(day)
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
            image = normalize_image(writer(brief))
        except WorkshopError as error:
            with self.connect() as db:
                db.execute("UPDATE attempts SET status='failed',error=?,finished=? WHERE day=?",
                           (str(error), datetime.now(timezone.utc).isoformat(), key))
            logging.error("Daily title illustration failed for %s; previous image retained: %s", key, error)
            raise
        with self.connect() as db:
            db.execute("UPDATE attempts SET status='ready',image=?,finished=? WHERE day=?",
                       (image, datetime.now(timezone.utc).isoformat(), key))
        logging.info("Published daily title illustration for %s (%s bytes).", key, len(image))
        return self.snapshot()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, default=ROOT / ".cache/travel")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    try:
        key_path = os.environ.get("ARCANE_START_IMAGES_TOKEN_FILE")
        if not key_path:
            raise ValueError("Set ARCANE_START_IMAGES_TOKEN_FILE to a private OVH access-key file.")
        token = private_file(Path(key_path)).strip()
        if not token or not token.isascii() or any(char.isspace() for char in token):
            raise ValueError("Invalid private daily title illustration access key.")
        art = StartArt(args.cache / "start-art.sqlite3")
        art.generate(datetime.now(PARIS).date(), OvhImageWriter(token))
    except (OSError, ValueError, sqlite3.Error, WorkshopError) as error:
        logging.error("Daily title illustration job stopped: %s", error)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
