"""Private encounter assignments backed by a weekly, free-only illustration batch."""

import argparse
from contextlib import contextmanager, nullcontext
import fcntl
import hashlib
import json
import logging
import os
from pathlib import Path
import re
import shutil
import sqlite3
import time
import uuid

from closing_story import EVENT_FACTS
from content_factory import IMAGE_LICENSE, IMAGE_MODEL, OvhImageWriter, normalize_image
from journeys import JourneyCapacity, JourneyRequest
from terraform_ovh import private_file
from asset_storage import AssetError, configured_storage
from shared_images import SharedImages
from encounter_storage import EncounterStorage

WEEK = 7 * 24 * 60 * 60
MAX_BYTES = 2 * 1024**3
MIN_FREE = 2 * 1024**3
SCENES = {f"event.{key}": value for key, value in EVENT_FACTS.items()}
SCENES.update({
    "dream.lost-player": "A dream of a fading thread becoming visible again, without a direction or destination.",
    "npc.hospitality.greeting": "An open doorway and a lantern, before any offer or refusal of hospitality.",
    "npc.hospitality.hosted": "A quiet sheltered place for the night, with a welcoming light.",
    "npc.hospitality.refused": "A closed doorway beside an ordinary road, with no menace or invented reason.",
})


class EncounterArt:
    def __init__(self, path, authorization=None, enabled=False, assets=None):
        self.path, self.authorization, self.enabled = Path(path), authorization, enabled
        self.assets = assets
        self.shared = EncounterStorage(assets, week=WEEK) if assets is not None else None
        if self.shared is not None:
            return
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS images (
                    id TEXT PRIMARY KEY, scene TEXT NOT NULL, created REAL NOT NULL,
                    claimed INTEGER NOT NULL DEFAULT 0, image BLOB NOT NULL
                );
                CREATE TABLE IF NOT EXISTS encounters (
                    owner TEXT NOT NULL, occurrence TEXT NOT NULL, scene TEXT NOT NULL,
                    requested REAL NOT NULL, image_id TEXT REFERENCES images(id),
                    PRIMARY KEY(owner,occurrence)
                );
                CREATE INDEX IF NOT EXISTS available_art ON images(scene,claimed,created);
            """)
        self.path.chmod(0o600)

    @classmethod
    def configured(cls, path, authorization=None, enabled=False):
        assets = getattr(authorization, "assets", None)
        return cls(path, authorization, enabled,
                   assets=assets if assets is not None else configured_storage())

    @contextmanager
    def connect(self):
        if self.shared is not None:
            raise AssetError("Configured encounter stock uses the shared catalogue, not a local database.")
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        try:
            with db:
                yield db
        finally:
            db.close()

    @staticmethod
    def assign(db, owner, occurrence, scene, now):
        row = db.execute(
            "SELECT i.id,i.created FROM encounters e LEFT JOIN images i ON e.image_id=i.id "
            "WHERE e.owner=? AND e.occurrence=?", (owner, occurrence)).fetchone()
        if row and row["id"] and row["created"] > now - WEEK:
            return
        available = db.execute(
            "SELECT id FROM images WHERE scene=? AND claimed=0 AND created>? ORDER BY created,id LIMIT 1",
            (scene, now - WEEK)).fetchone()
        if available:
            db.execute("UPDATE images SET claimed=1 WHERE id=?", (available["id"],))
            db.execute("UPDATE encounters SET image_id=? WHERE owner=? AND occurrence=?",
                       (available["id"], owner, occurrence))

    def request(self, data, token):
        if not isinstance(data, dict):
            raise JourneyRequest("Invalid encounter illustration request.")
        expected = {"journey", "operation"} | ({"keeper"} if "keeper" in data else set())
        operation = data.get("operation")
        expected |= {"items"} if operation == "sync" else {"occurrence", "image"} if operation == "image" else set()
        if operation not in {"sync", "image"} or set(data) != expected:
            raise JourneyRequest("Invalid encounter illustration operation or fields.")
        owner, _ = self.authorization.authorize(data, token)
        if operation == "image":
            if (not isinstance(data["occurrence"], str) or not isinstance(data["image"], str)
                    or not re.fullmatch(r"[a-f0-9]{32}", data["image"])):
                raise JourneyRequest("Invalid encounter image identity.")
            if self.shared is not None:
                return self.shared.image(owner, data["occurrence"], data["image"])
            with self.connect() as db:
                row = db.execute(
                    "SELECT i.image FROM images i JOIN encounters e ON e.image_id=i.id "
                    "WHERE e.owner=? AND e.occurrence=? AND i.id=?",
                    (owner, data["occurrence"], data["image"])).fetchone()
            if row is None:
                raise JourneyRequest("This encounter illustration is unavailable.")
            return bytes(row["image"])
        items = data["items"]
        if not isinstance(items, list) or len(items) > 16:
            raise JourneyRequest("At most sixteen encounter illustration observations are accepted.")
        for item in items:
            if (not isinstance(item, dict) or set(item) != {"scene", "occurrence"}
                    or not isinstance(item["scene"], str) or item["scene"] not in SCENES
                    or not isinstance(item["occurrence"], str)
                    or not re.fullmatch(r"[a-zA-Z0-9:._-]{1,120}", item["occurrence"])):
                raise JourneyRequest("Only registered scenes and bounded encounter identities are accepted.")
        if len({item["occurrence"] for item in items}) != len(items):
            raise JourneyRequest("Duplicate encounter observations.")
        now = time.time()
        if self.shared is not None:
            rows = self.shared.sync(owner, items, now)
        else:
            rows = self.sync_local(owner, items, now)
        return {"enabled": self.enabled, "entries": [
            {**dict(row), "status": "ready" if row["id"] else "pending",
             "renewing": bool(row["id"] and row["created"] <= now - WEEK),
             "model": IMAGE_MODEL, "license": IMAGE_LICENSE} for row in rows]}

    def sync_local(self, owner, items, now):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            count = db.execute("SELECT COUNT(*) FROM encounters WHERE owner=?", (owner,)).fetchone()[0]
            for item in items:
                existing = db.execute("SELECT scene FROM encounters WHERE owner=? AND occurrence=?",
                                      (owner, item["occurrence"])).fetchone()
                if existing and existing["scene"] != item["scene"]:
                    raise JourneyRequest("An encounter cannot change its illustration scene.")
                if not existing:
                    if count >= 2000:
                        raise JourneyCapacity("This notebook has reached its encounter illustration storage limit.")
                    db.execute("INSERT INTO encounters VALUES(?,?,?,?,NULL)",
                               (owner, item["occurrence"], item["scene"], now))
                    count += 1
                self.assign(db, owner, item["occurrence"], item["scene"], now)
            rows = [db.execute(
                "SELECT e.occurrence,e.scene,i.id,i.created FROM encounters e "
                "LEFT JOIN images i ON e.image_id=i.id WHERE e.owner=? AND e.occurrence=?",
                (owner, item["occurrence"])).fetchone() for item in items]
        return rows

    def generate(self, scene, writer, now=None, *, request=None):
        if scene not in SCENES:
            raise JourneyRequest("Unknown illustration scene.")
        now = time.time() if now is None else now
        identity = uuid.uuid4().hex if request is None else request
        if not isinstance(identity, str) or not re.fullmatch(r"[a-f0-9]{32}", identity):
            raise JourneyRequest("Invalid encounter generation request.")
        if self.shared is not None:
            previous = self.shared.previous(identity)
        else:
            with self.connect() as db:
                row = db.execute("SELECT scene FROM images WHERE id=?", (identity,)).fetchone()
            previous = row["scene"] if row else None
        if previous is not None:
            if previous != scene:
                raise JourneyRequest("An encounter generation request cannot change its scene.")
            return identity
        brief = {"prompt":
            f"An individual travel encounter: {SCENES[scene]} "
            "Express the scene through objects, scenery and atmosphere, without people or readable text. "
            "No exact place, route, documentary evidence, extra event or magical power. "
            "Make a fresh original composition with a different arrangement and viewpoint."}
        image = (normalize_image(writer(brief)) if self.assets is None else
                 SharedImages(self.assets).generate("encounter-art", identity, brief, writer))
        if self.shared is not None:
            self.shared.publish(identity, scene, now, len(image))
            return identity
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute("INSERT INTO images VALUES(?,?,?,0,?) ON CONFLICT(id) DO NOTHING",
                       (identity, scene, now, image))
            pending = db.execute(
                "SELECT e.owner,e.occurrence FROM encounters e LEFT JOIN images i ON e.image_id=i.id "
                "WHERE e.scene=? AND (i.id IS NULL OR i.created<=?) ORDER BY e.requested LIMIT 1",
                (scene, now - WEEK)).fetchone()
            if pending:
                self.assign(db, pending["owner"], pending["occurrence"], scene, now)
        return identity


def run_batch(art, writer, *, hours=7, interval=15, clock=time.monotonic, sleep=time.sleep):
    deadline, generated = clock() + hours * 3600, 0
    lock_context = nullcontext() if art.shared is not None else art.path.with_suffix(".lock").open("a")
    with lock_context as lock:
        if lock is not None:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        while clock() < deadline:
            now = time.time()
            if art.shared is not None:
                stored, pending_scene, counts = art.shared.batch_state(now)
            else:
                with art.connect() as db:
                    db.execute("DELETE FROM images WHERE claimed=0 AND created<=?", (now - WEEK,))
                    stored = db.execute("SELECT COALESCE(SUM(length(image)),0) FROM images").fetchone()[0]
                    pending = db.execute(
                        "SELECT e.scene FROM encounters e LEFT JOIN images i ON e.image_id=i.id "
                        "WHERE i.id IS NULL OR i.created<=? ORDER BY e.requested LIMIT 1", (now - WEEK,)).fetchone()
                    counts = {row["scene"]: row["n"] for row in db.execute(
                        "SELECT scene,COUNT(*) n FROM images WHERE claimed=0 AND created>? GROUP BY scene",
                        (now - WEEK,))}
                pending_scene = pending["scene"] if pending else None
            if stored >= MAX_BYTES or (art.shared is None and shutil.disk_usage(art.path.parent).free < MIN_FREE):
                logging.warning("Illustration batch stopped: storage safety threshold reached.")
                break
            scene = pending_scene if pending_scene else min(SCENES, key=lambda key: counts.get(key, 0))
            request = (hashlib.sha256(f"encounter-batch-v1:{interval}:{int(now // interval)}".encode())
                       .hexdigest()[:32] if art.assets is not None else None)
            art.generate(scene, writer, request=request)
            generated += 1
            logging.info("Encounter illustration generated: scene=%s total=%d", scene, generated)
            sleep(max(0, min(interval, deadline - clock())))
    return generated


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--hours", type=float, default=7)
    parser.add_argument("--interval", type=float, default=15)
    args = parser.parse_args()
    if not 0 < args.hours <= 7 or not 1 <= args.interval <= 3600:
        parser.error("Duration must be within seven hours; spacing must be 1-3600 seconds.")
    logging.basicConfig(level=logging.INFO)
    token = private_file(Path(os.environ["ARCANE_JOURNAL_IMAGES_TOKEN_FILE"])).strip()
    if not token or not token.isascii() or any(char.isspace() for char in token):
        raise ValueError("Invalid private illustration access key.")
    art = EncounterArt.configured(args.cache / "encounter-art.sqlite3")
    logging.info("Starting free-only illustration batch, duration=%sh, no item-count limit.", args.hours)
    total = run_batch(art, OvhImageWriter(token), hours=args.hours, interval=args.interval)
    logging.info("Illustration batch finished: %d new images.", total)


if __name__ == "__main__":
    main()
