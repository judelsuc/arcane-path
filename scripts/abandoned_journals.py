"""Capability-protected journal lifecycle, separate from immutable journey genesis."""

from contextlib import contextmanager
import hashlib
import base64
import binascii
import hmac
import json
import math
import re
import sqlite3
import time

from journeys import JourneyRequest, JourneyConflict

LEASE_SECONDS = 7 * 24 * 60 * 60
MAX_NOTEBOOK_BYTES = 48 * 1024 * 1024


def validate_notebook(entries, clues):
    if not isinstance(entries, list) or len(entries) > 1000 or not isinstance(clues, list) or len(clues) > 2000:
        raise JourneyRequest("Invalid notebook content.")
    if any(not isinstance(text, str) or len(text) > 4000 for text in clues):
        raise JourneyRequest("Invalid notebook clues.")
    seen, total = set(), 0
    for entry in entries:
        if not isinstance(entry, dict) or set(entry) != {
                "id", "title", "sourceUrl", "attribution", "license", "licenseUrl",
                "note", "caption", "unannotated", "pinnedAt", "mime", "image"}:
            raise JourneyRequest("Invalid notebook entry.")
        for field, maximum in (("id", 1000), ("title", 1000), ("attribution", 2000),
                               ("license", 1000), ("note", 2000), ("caption", 1000),
                               ("pinnedAt", 40), ("sourceUrl", 4000), ("licenseUrl", 4000)):
            if not isinstance(entry[field], str) or len(entry[field]) > maximum:
                raise JourneyRequest("Invalid notebook metadata.")
        if not entry["id"] or entry["id"] in seen or any(not entry[k].strip()
                for k in ("title", "attribution", "license", "pinnedAt")):
            raise JourneyRequest("Invalid or duplicate notebook entry.")
        seen.add(entry["id"])
        if (type(entry["unannotated"]) is not bool
                or any(not entry[k].startswith(("https://", "http://"))
                       for k in ("sourceUrl", "licenseUrl"))
                or entry["mime"] not in ("image/jpeg", "image/png", "image/webp", "image/gif")
                or not isinstance(entry["image"], str)):
            raise JourneyRequest("Unsupported notebook image or source.")
        try:
            image = base64.b64decode(entry["image"], validate=True)
        except (binascii.Error, ValueError) as error:
            raise JourneyRequest("Invalid notebook image encoding.") from error
        total += len(image)
        valid = {"image/jpeg": image.startswith(b"\xff\xd8\xff"),
                 "image/png": image.startswith(b"\x89PNG\r\n\x1a\n"),
                 "image/webp": image.startswith(b"RIFF") and image[8:12] == b"WEBP",
                 "image/gif": image.startswith((b"GIF87a", b"GIF89a"))}
        if not valid[entry["mime"]] or not 0 < len(image) <= 12_000_000:
            raise JourneyRequest("Invalid notebook image.")
        if total > MAX_NOTEBOOK_BYTES:
            raise JourneyRequest("Notebook exceeds the 48 MiB sharing limit. Nothing was published.")


class JournalForbidden(ValueError):
    pass


def capability_hash(token):
    if not isinstance(token, str) or not re.fullmatch(r"[a-f0-9]{64}", token):
        raise JournalForbidden("A private journal capability is required.")
    return hashlib.sha256(token.encode()).hexdigest()


def distance(a, b):
    lat = math.radians((a[0] + b[0]) / 2)
    return math.hypot(a[0] - b[0], (a[1] - b[1]) * math.cos(lat)) * 111195


class AbandonedJournals:
    def __init__(self, journeys, clock=time.time):
        self.journeys, self.clock = journeys, clock
        self.path = journeys.path.parent / "abandoned-journals.sqlite3"
        with self.connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS capabilities (
                    journey TEXT PRIMARY KEY, digest TEXT NOT NULL, dead INTEGER NOT NULL DEFAULT 0);
                CREATE TABLE IF NOT EXISTS journals (
                    id TEXT PRIMARY KEY, payload TEXT NOT NULL, latitude REAL NOT NULL,
                    longitude REAL NOT NULL, finder TEXT, touched REAL,
                    step INTEGER NOT NULL, delivered INTEGER NOT NULL DEFAULT 0);
                CREATE TABLE IF NOT EXISTS notebooks (
                    id TEXT PRIMARY KEY, content TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS keepers (
                    id TEXT PRIMARY KEY, genesis TEXT NOT NULL);
            """)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def bind(self, journey, token):
        digest = capability_hash(token)
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute("INSERT OR IGNORE INTO capabilities(journey,digest) VALUES (?,?)",
                       (journey, digest))
            if not hmac.compare_digest(db.execute(
                    "SELECT digest FROM capabilities WHERE journey=?", (journey,)).fetchone()[0], digest):
                raise JournalForbidden("This journey already has a private capability.")

    @staticmethod
    def position(record, col, row):
        if any(type(v) is not int or abs(v) > 8007 for v in (col, row)):
            raise JourneyRequest("Invalid journal position.")
        _, _, meters, bounds, projection = json.loads(record["mapIdentity"])
        step = meters / 6371008.8 * 180 / math.pi
        latitude = projection if projection is not None else (
            bounds["minLatitude"] + bounds["maxLatitude"]) / 2
        return (bounds["maxLatitude"] - (row + .5) * step,
                bounds["minLongitude"] + (col + .5) * step / math.cos(math.radians(latitude)))

    def request(self, data, token):
        if not isinstance(data, dict) or set(data) - {
                "journey", "keeper", "col", "row", "ended", "index", "action", "journal", "step",
                "notebook", "clues", "elapsedMinutes"}:
            raise JourneyRequest("Invalid journal request.")
        digest = capability_hash(token)
        record = self.journeys.read(data.get("journey"))
        if not record:
            raise JournalForbidden("Unknown journal capability.")
        journey = data.get("keeper", data["journey"])
        if not isinstance(journey, str) or not re.fullmatch(r"[a-f0-9]{32}", journey):
            raise JourneyRequest("Invalid notebook keeper.")
        position = self.position(record, data.get("col"), data.get("row"))
        ended = data.get("ended")
        if ended not in (None, "health", "hunger", "fatigue", "sleep", "reunion", "placement"):
            raise JourneyRequest("Invalid journey outcome.")
        action = data.get("action", "sync")
        if action not in ("sync", "claim", "advance", "register", "publish", "read"):
            raise JourneyRequest("Invalid journal action.")
        if action in ("claim", "advance", "read") and (
                not isinstance(data.get("journal"), str)
                or not re.fullmatch(r"[a-f0-9]{32}", data["journal"])):
            raise JourneyRequest("Invalid abandoned journal ID.")
        now = self.clock()
        if action == "publish":
            validate_notebook(data.get("notebook"), data.get("clues"))
        elif "notebook" in data or "clues" in data:
            raise JourneyRequest("Notebook content is only accepted when publishing.")
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            if action == "register":
                if "keeper" not in data or journey == data["journey"]:
                    raise JourneyRequest("Legacy keepers need a separate random identity.")
                db.execute("INSERT OR IGNORE INTO capabilities(journey,digest) VALUES (?,?)", (journey, digest))
                db.execute("INSERT OR IGNORE INTO keepers(id,genesis) VALUES (?,?)", (journey, data["journey"]))
            if "keeper" in data:
                keeper = db.execute("SELECT genesis FROM keepers WHERE id=?", (journey,)).fetchone()
                if not keeper or keeper["genesis"] != data["journey"]:
                    raise JournalForbidden("This notebook keeper belongs to another source journey.")
            access = db.execute("SELECT digest,dead FROM capabilities WHERE journey=?", (journey,)).fetchone()
            if not access or not hmac.compare_digest(access["digest"], digest):
                raise JournalForbidden("Invalid journal capability.")
            if action == "register":
                return {"registered": True}
            db.execute("""UPDATE journals SET finder=NULL,touched=NULL
                          WHERE delivered=0 AND touched<=?""", (now - LEASE_SECONDS,))
            if action == "publish" or ended in ("health", "hunger", "fatigue", "sleep", "placement"):
                index = data.get("index")
                stages = record["state"]["trail"]["stages"]
                if type(index) is not int or not 0 <= index < len(stages):
                    raise JourneyRequest("Invalid fictional journal progress.")
                elapsed = data.get("elapsedMinutes", 0)
                if type(elapsed) not in (int, float) or not math.isfinite(elapsed) or elapsed < 0:
                    raise JourneyRequest("Invalid notebook game time.")
                story = record["state"]["trail"].get("story")
                if story:
                    parent = max([9] + [move["stage"] for move in story["movement"]
                                        if elapsed >= move["elapsedMinutes"]])
                    stages = stages[:max(index, parent) + 1]
                # Canonical quest fiction stays separate from explicitly shared notebook content.
                payload = {
                    "parent": record["state"]["trail"]["parentName"],
                    "stages": [{k: stage[k] for k in ("name", "latitude", "longitude")}
                               for stage in stages],
                    "history": [stage["name"] for stage in stages[:index]],
                }
                db.execute("""INSERT OR IGNORE INTO journals
                    (id,payload,latitude,longitude,step) VALUES (?,?,?,?,?)""",
                           (journey, json.dumps(payload), *position, index))
                if action == "publish":
                    db.execute("INSERT OR IGNORE INTO notebooks(id,content) VALUES (?,?)",
                               (journey, json.dumps({"photos": data["notebook"], "clues": data["clues"]})))
                db.execute("UPDATE capabilities SET dead=1 WHERE journey=?", (journey,))
                db.execute("""UPDATE journals SET finder=NULL,touched=NULL,latitude=?,longitude=?
                              WHERE finder=? AND delivered=0""", (*position, journey))
            elif access["dead"]:
                raise JourneyConflict("This finder journey has ended.")
            elif ended != "reunion":
                db.execute("""UPDATE journals SET touched=?,latitude=?,longitude=?
                              WHERE finder=? AND delivered=0""", (now, *position, journey))
                if action == "read":
                    target = db.execute("SELECT id FROM journals WHERE id=? AND finder=?",
                                        (data["journal"], journey)).fetchone()
                    if not target:
                        raise JourneyConflict("Pick up this notebook before reading it.")
                    content = db.execute("SELECT content FROM notebooks WHERE id=?", (target["id"],)).fetchone()
                    return {"notebook": json.loads(content["content"]) if content else {"photos": [], "clues": []}}
                if action == "claim":
                    target = db.execute("SELECT * FROM journals WHERE id=?", (data.get("journal"),)).fetchone()
                    if (not target or target["id"] == journey or target["delivered"]
                            or distance(position, (target["latitude"], target["longitude"])) > 200):
                        raise JourneyConflict("This journal is not available here.")
                    if target["finder"] not in (None, journey):
                        raise JourneyConflict("Another finder already carries this journal.")
                    db.execute("UPDATE journals SET finder=?,touched=? WHERE id=?", (journey, now, target["id"]))
                elif action == "advance":
                    target = db.execute("SELECT * FROM journals WHERE id=? AND finder=?",
                                        (data.get("journal"), journey)).fetchone()
                    if not target:
                        raise JourneyConflict("This journal claim is no longer active.")
                    expected = data.get("step")
                    if type(expected) is not int or expected < 0 or expected > target["step"]:
                        raise JourneyRequest("Invalid side quest progress.")
                    if expected < target["step"] or target["delivered"]:
                        action = "sync"
                    payload = json.loads(target["payload"])
                    stage = payload["stages"][target["step"]]
                    if action == "advance" and distance(position, (stage["latitude"], stage["longitude"])) > 350:
                        raise JourneyConflict("Visit the journal's next town to continue.")
                    step = target["step"] + 1
                    if action == "advance":
                        db.execute("UPDATE journals SET step=?,delivered=? WHERE id=?",
                                   (min(step, len(payload["stages"]) - 1),
                                    int(step == len(payload["stages"])), target["id"]))
            claimed = db.execute("SELECT * FROM journals WHERE finder=? ORDER BY id", (journey,)).fetchall()
            nearby = db.execute("""SELECT * FROM journals WHERE finder IS NULL AND delivered=0
                AND id!=? AND latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ? LIMIT 100""",
                                (journey, position[0] - .003, position[0] + .003,
                                 position[1] - .03, position[1] + .03)).fetchall()
            def public(row):
                payload = json.loads(row["payload"])
                return {"id": row["id"], **payload, "step": row["step"],
                        "delivered": bool(row["delivered"])}
            return {"sidequests": [public(row) for row in claimed],
                    "nearby": [public(row) for row in nearby if distance(
                        position, (row["latitude"], row["longitude"])) <= 200],
                    "published": bool(action == "publish" or ended in ("health", "hunger", "fatigue", "sleep", "placement"))}
