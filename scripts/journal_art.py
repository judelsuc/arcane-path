"""Private, durable background illustrations from bounded symbolic journey briefs."""

from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import date, datetime, timezone
import hmac
import json
import logging
import os
from pathlib import Path
import re
import sqlite3
import threading
import time

from abandoned_journals import capability_hash, JournalForbidden
from content_factory import (
    IMAGE_LICENSE, IMAGE_MODEL, IMAGE_STYLE, OvhImageWriter, WorkshopError, normalize_image,
)
from journeys import JourneyRequest, JourneyCapacity
from terraform_ovh import private_file

CARDS = {
    "fool": "an open road", "magician": "a hand of possibilities",
    "priestess": "hidden writing without readable letters", "empress": "a growing garden",
    "emperor": "a shelter of stone", "hierophant": "an old promise symbolized by a knot",
    "lovers": "two entwined threads", "chariot": "a moving wheel",
    "justice": "a balanced scale", "hermit": "a solitary lantern", "wheel": "a turning circle",
    "strength": "a quiet strength symbolized by a rooted tree",
    "hanged": "an upside-down reflection", "nameless": "a changing threshold",
    "temperance": "water passing between cups", "devil": "a tangled cord",
    "tower": "a broken outline", "star": "a distant light", "moon": "a silver reflection",
    "sun": "a warm dawn", "judgement": "a returning voice symbolized by ripples",
    "world": "a circle of paths",
}
SCENES = {
    "mountains": "mountain scenery", "town": "an unnamed town",
    "forest": "a forest", "countryside": "open countryside",
    "water": "a stretch of water", "rain": "rain", "snow": "snow",
}
ACTIVITIES = {
    "walking": "walking along a path", "rest": "a quiet pause",
    "sleep": "sleep and dreams", "meal": "a simple meal",
    "music": "playing music", "work": "ordinary work",
    "forage": "gathering food", "encounter": "a roadside encounter",
    "arrival": "arrival in an unnamed settlement",
}
MAX_ART = 1000
MAX_PER_JOURNEY = 366


def validate_brief(brief, started):
    if not isinstance(brief, dict) or set(brief) != {"key", "birth", "daily", "scenes", "activities", "partial"}:
        raise JourneyRequest("Invalid journal illustration fields.")
    if not isinstance(brief["key"], str):
        raise JourneyRequest("Invalid journal illustration key.")
    if brief["key"] != "cover":
        try:
            day = date.fromisoformat(brief["key"])
        except ValueError as error:
            raise JourneyRequest("Invalid illustrated day.") from error
        if brief["key"] != day.isoformat() or not 0 <= (day - started).days < 366:
            raise JourneyRequest("Illustrated day is outside this journey's first year.")
    for field in ("birth", "daily"):
        if not isinstance(brief[field], str) or brief[field] not in CARDS:
            raise JourneyRequest("Invalid illustration tarot motif.")
    for field, allowed, limit in (("scenes", SCENES, 7), ("activities", ACTIVITIES, 9)):
        values = brief[field]
        if (not isinstance(values, list) or len(values) > limit
                or any(not isinstance(value, str) or value not in allowed for value in values)
                or len(set(values)) != len(values)):
            raise JourneyRequest("Only approved symbolic illustration tags are accepted.")
    if type(brief["partial"]) is not bool or brief["key"] == "cover" and brief["activities"]:
        raise JourneyRequest("Invalid illustration observation coverage.")
    return brief


def art_prompt(brief):
    scenes = ", ".join(SCENES[value] for value in brief["scenes"]) or "an abstract paper landscape"
    activities = ", ".join(ACTIVITIES[value] for value in brief["activities"])
    return {"prompt": (
        "A symbolic dream illustration for a traveller's notebook. "
        f"Combine the motifs of {CARDS[brief['birth']]} and {CARDS[brief['daily']]}. "
        f"Broad atmosphere: {scenes}. "
        + (f"Visual memories of recorded activities: {activities}. " if activities else "")
        + "No exact place, identifiable person, readable text, maps or clues. "
        "This is decorative atmosphere, not a documentary image."
    )}


class JournalArt:
    def __init__(self, journeys, abandoned, writer=None):
        self.journeys, self.abandoned, self.writer = journeys, abandoned, writer
        self.path = journeys.path.parent / "journal-art.sqlite3"
        self.lock = threading.Lock()
        self.running = False
        self.closed = False
        self.pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="journal-art") if writer else None
        self.future = None
        with self.connect() as db:
            version = db.execute("PRAGMA user_version").fetchone()[0]
            if version not in (0, 1):
                raise ValueError("Unsupported journal illustration database version.")
            db.executescript("""
                CREATE TABLE IF NOT EXISTS art (
                    owner TEXT NOT NULL, key TEXT NOT NULL, brief TEXT NOT NULL,
                    status TEXT NOT NULL, created TEXT NOT NULL, finished TEXT,
                    elapsed REAL, error TEXT, image BLOB,
                    PRIMARY KEY(owner,key)
                );
                PRAGMA user_version=1;
            """)
            if writer:
                db.execute("UPDATE art SET status='failed',error=? WHERE status='running'",
                           ("Generation was interrupted; the existing journal remains available.",))
        self.path.chmod(0o600)
        self.kick()

    @classmethod
    def configured(cls, journeys, abandoned):
        path = os.environ.get("ARCANE_JOURNAL_IMAGES_TOKEN_FILE")
        writer = None
        if path:
            token = private_file(Path(path)).strip()
            if not token or not token.isascii() or any(char.isspace() for char in token):
                raise ValueError("Invalid private journal illustration access key.")
            writer = OvhImageWriter(token)
        return cls(journeys, abandoned, writer)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def authorize(self, data, token):
        record = self.journeys.read(data.get("journey"))
        if record is None:
            raise JournalForbidden("Unknown illustration journey.")
        owner = data.get("keeper", data["journey"])
        if not isinstance(owner, str) or not re.fullmatch(r"[a-f0-9]{32}", owner):
            raise JourneyRequest("Invalid illustration owner.")
        digest = capability_hash(token)
        with self.abandoned.connect() as db:
            access = db.execute("SELECT digest FROM capabilities WHERE journey=?", (owner,)).fetchone()
            if owner != data["journey"]:
                keeper = db.execute("SELECT genesis FROM keepers WHERE id=?", (owner,)).fetchone()
                if keeper is None or keeper["genesis"] != data["journey"]:
                    raise JournalForbidden("This illustration keeper belongs to another journey.")
        if access is None or not hmac.compare_digest(access["digest"], digest):
            raise JournalForbidden("Invalid illustration capability.")
        return owner, record

    def request(self, data, token):
        if not isinstance(data, dict) or set(data) - {"journey", "keeper", "operation", "brief", "key"}:
            raise JourneyRequest("Invalid journal illustration request.")
        owner, record = self.authorize(data, token)
        operation = data.get("operation")
        if operation not in {"sync", "enqueue", "image"}:
            raise JourneyRequest("Unknown journal illustration operation.")
        expected = {"journey", "operation"} | ({"keeper"} if "keeper" in data else set())
        expected |= {"brief"} if operation == "enqueue" else {"key"} if operation == "image" else set()
        if set(data) != expected:
            raise JourneyRequest("Unexpected illustration request fields.")
        if operation == "enqueue":
            if self.writer is None:
                return {"enabled": False, "entries": []}
            state = record["state"]
            started = datetime.fromtimestamp(state["startedAt"] / 1000, timezone.utc).date()
            brief = validate_brief(data["brief"], started)
            if brief["birth"] != state["birthCard"]:
                raise JourneyRequest("The birth-card motif must match the journey.")
            with self.connect() as db:
                db.execute("BEGIN IMMEDIATE")
                if not db.execute("SELECT 1 FROM art WHERE owner=? AND key=?", (owner, brief["key"])).fetchone():
                    count = db.execute("SELECT COUNT(*) FROM art WHERE owner=?", (owner,)).fetchone()[0]
                    total = db.execute("SELECT COUNT(*) FROM art").fetchone()[0]
                    queued = db.execute("SELECT COUNT(*) FROM art WHERE status IN ('queued','running')").fetchone()[0]
                    if count >= MAX_PER_JOURNEY or total >= MAX_ART or queued >= 32:
                        raise JourneyCapacity("Journal illustration queue is full; keep the existing journal and try later.")
                    db.execute("INSERT INTO art(owner,key,brief,status,created) VALUES(?,?,?,'queued',?)",
                               (owner, brief["key"], json.dumps({
                                   **brief, "recipe": {
                                       "version": 1, "model": IMAGE_MODEL, "license": IMAGE_LICENSE,
                                       "prompt": IMAGE_STYLE + art_prompt(brief)["prompt"],
                                       "purpose": "decorative-only",
                                   },
                               }), datetime.now(timezone.utc).isoformat()))
            self.kick()
        if operation == "image":
            if not isinstance(data["key"], str):
                raise JourneyRequest("Invalid illustration key.")
            with self.connect() as db:
                row = db.execute("SELECT image FROM art WHERE owner=? AND key=? AND status='ready'",
                                 (owner, data["key"])).fetchone()
            if row is None:
                raise JourneyRequest("Illustration is not ready.")
            return bytes(row["image"])
        self.kick()
        with self.connect() as db:
            rows = db.execute(
                "SELECT key,brief,status,created,finished,elapsed,error FROM art WHERE owner=? ORDER BY key", (owner,),
            ).fetchall()
        return {
            "enabled": self.writer is not None,
            "entries": [{**dict(row), "brief": json.loads(row["brief"]),
                         "model": IMAGE_MODEL, "license": IMAGE_LICENSE} for row in rows],
        }

    def kick(self):
        if self.pool is None:
            return
        with self.lock:
            if not self.running and not self.closed:
                self.running = True
                self.future = self.pool.submit(self.drain)

    def drain(self):
        try:
            self.drain_queue()
        except Exception:
            logging.exception("Journal illustration queue failed; queued records retained for restart")
            with self.lock:
                self.running = False

    def drain_queue(self):
        while True:
            with self.lock:
                if self.closed:
                    self.running = False
                    return
                with self.connect() as db:
                    db.execute("BEGIN IMMEDIATE")
                    row = db.execute("SELECT * FROM art WHERE status='queued' ORDER BY rowid LIMIT 1").fetchone()
                    if row is None:
                        self.running = False
                        return
                    db.execute("UPDATE art SET status='running' WHERE owner=? AND key=?", (row["owner"], row["key"]))
            started = time.monotonic()
            try:
                image = normalize_image(self.writer(art_prompt(json.loads(row["brief"]))))
            except WorkshopError as error:
                logging.warning("Journal illustration generation failed: %s", error)
                with self.connect() as db:
                    db.execute("UPDATE art SET status='failed',error=? WHERE owner=? AND key=?",
                               (str(error), row["owner"], row["key"]))
            except Exception:
                logging.exception("Unexpected journal illustration worker failure")
                with self.connect() as db:
                    db.execute("UPDATE art SET status='failed',error=? WHERE owner=? AND key=?",
                               ("Illustration worker failed; consult server logs. No automatic retry.",
                                row["owner"], row["key"]))
            else:
                with self.connect() as db:
                    db.execute("UPDATE art SET status='ready',image=?,finished=?,elapsed=? WHERE owner=? AND key=?",
                               (image, datetime.now(timezone.utc).isoformat(),
                                round(time.monotonic() - started, 2), row["owner"], row["key"]))

    def close(self):
        with self.lock:
            self.closed = True
        if self.pool:
            self.pool.shutdown(wait=True)
