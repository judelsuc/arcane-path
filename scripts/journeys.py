"""Persist immutable, idempotent journey beginnings for the private prototype."""

from datetime import datetime, timezone
from contextlib import contextmanager
import hashlib
import json
import logging
import math
import random
import re
import secrets
import sqlite3
import unicodedata
import uuid

from config import load_config
from town_trail import TownTrailStore
from parent_story import story_profile, build_parent_story

MAX_JOURNEYS = 1000
GENERATOR_VERSION = "parent-story-genesis-v2"


class JourneyConflict(ValueError):
    pass


class JourneyCapacity(ValueError):
    pass


class JourneyRequest(ValueError):
    pass


class JourneyGeneration(ValueError):
    pass


def character_name(value):
    if not isinstance(value, str) or any(ord(c) < 32 or 127 <= ord(c) <= 159 for c in value):
        raise JourneyRequest("Invalid character name.")
    name = " ".join(unicodedata.normalize("NFC", value).replace("\ufeff", " ").split())
    if not name or len(name.encode("utf-16-le", errors="surrogatepass")) // 2 > 40:
        raise JourneyRequest("Character name must contain 1 to 40 characters.")
    return name


def map_identity(base):
    return json.dumps([base["width"], base["height"], base["cellSizeMeters"],
                       base["bounds"], base.get("projectionLatitude")], separators=(",", ":"))


def initial_state(base, name, started_at, card, survival, economy, trail):
    attributes = card.get("attributes")
    if (not isinstance(attributes, dict) or set(attributes) != {"strength", "endurance", "pace"}
            or any(type(v) is not int or not 1 <= v <= 5 for v in attributes.values())
            or type(card.get("mealUnits")) is not int or card["mealUnits"] <= 0):
        raise ValueError("Invalid starting tarot configuration.")
    strength, endurance, pace = (attributes[k] for k in ("strength", "endurance", "pace"))
    day = datetime.fromtimestamp(started_at / 1000, timezone.utc).date().isoformat()
    return {
        "col": base["width"] // 2, "row": base["height"] // 2, "startedAt": started_at,
        "mode": "walk", "distanceMeters": 0, "elapsedMinutes": 0, "fatigue": 0,
        "energyKcal": 0, "ascentMeters": 0, "descentMeters": 0, "lastMove": None,
        "profileId": "tarot",
        "character": {
            **attributes, "bodyMassKg": 40 + (strength - 3) * 5,
            "baseSpeedKmh": 4.5 * (1 + (pace - 3) * 0.06 + (strength - 3) * 0.025),
            "effortFactor": 1 + (pace - 3) * 0.08,
            "enduranceFactor": 1 + (endurance - 3) * 0.12,
        },
        "reserveKcal": survival["reserve_kcal"], "awakeHours": 0, "ended": None,
        "meals": 0, "sleeps": 0, "birthCard": card["id"], "dailyCard": card["id"],
        "tarotDay": day, "dailyTarotSeenDay": day,
        "walletCents": card["mealUnits"] * economy["pricing"]["referenceCents"],
        "outdoorNightMinutes": 0, "lastExpenseCents": 0, "name": name, "trail": trail,
    }


class JourneyStore:
    def __init__(self, chunks, write):
        self.chunks = chunks
        self.trails = TownTrailStore(chunks, write)
        self.path = chunks.cache / "journeys.sqlite3"
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            version = db.execute("PRAGMA user_version").fetchone()[0]
            if version not in (0, 1):
                raise ValueError("Unsupported server journey database version.")
            db.execute("""CREATE TABLE IF NOT EXISTS journeys (
                id TEXT PRIMARY KEY, request_id TEXT UNIQUE NOT NULL,
                payload TEXT NOT NULL, checksum TEXT NOT NULL)""")
            db.execute("PRAGMA user_version = 1")

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=5)
        try:
            with db:
                yield db
        finally:
            db.close()

    @staticmethod
    def decode(row):
        payload, checksum = row
        if hashlib.sha256(payload.encode()).hexdigest() != checksum:
            raise ValueError("Corrupt server journey record; restore from backup.")
        record = json.loads(payload)
        if record.get("version") != 1:
            raise ValueError("Unsupported server journey record version.")
        return record

    def read(self, journey_id):
        if not isinstance(journey_id, str) or not re.fullmatch(r"[a-f0-9]{32}", journey_id):
            raise JourneyRequest("Invalid server journey ID.")
        with self.connect() as db:
            row = db.execute("SELECT payload, checksum FROM journeys WHERE id = ?",
                             (journey_id,)).fetchone()
        return self.decode(row) if row else None

    def create(self, request):
        if not isinstance(request, dict) or set(request) != {"requestId", "region", "name"}:
            raise JourneyRequest("Journey creation requires requestId, region and name only.")
        request_id, region = request["requestId"], request["region"]
        if (not isinstance(request_id, str)
                or not re.fullmatch(r"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}", request_id)
                or not isinstance(region, str) or region not in self.chunks.bases):
            raise JourneyRequest("Invalid journey request ID or region.")
        name = character_name(request["name"])
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT payload, checksum FROM journeys WHERE request_id = ?",
                             (request_id,)).fetchone()
            if row:
                record = self.decode(row)
                if record["region"] != region or record["state"]["name"] != name:
                    raise JourneyConflict("This creation request already belongs to another journey.")
                return record, False
            if db.execute("SELECT count(*) FROM journeys").fetchone()[0] >= MAX_JOURNEYS:
                raise JourneyCapacity("Server journey storage is full; contact the administrator.")
            base = self.chunks.bases[region]
            survival = load_config(self.chunks.root / "config.yml")["survival"]
            economy = json.loads((self.chunks.root / "public/economy.json").read_text())
            cards = economy.get("tarot", [])
            reference = economy.get("pricing", {}).get("referenceCents")
            if (len(cards) != 22 or len({card["id"] for card in cards}) != 22
                    or type(reference) is not int or reference <= 0):
                raise ValueError("Invalid server economy configuration.")
            root_seed = secrets.token_hex(4)
            started_at = math.floor(datetime.now(timezone.utc).timestamp() * 1000)
            for attempt in range(3):
                seed = root_seed if attempt == 0 else hashlib.sha256(
                    f"parent-retry:{root_seed}:{attempt}".encode()).hexdigest()[:8]
                card = random.Random("birth:" + seed).choice(cards)
                profile = story_profile(seed, card["id"])
                try:
                    trail = self.trails.build(region, seed)
                    if profile["finalState"] == "mobile":
                        trail = self.trails.extend(region, seed, trail)
                    trail["story"] = build_parent_story(trail, seed, card["id"], started_at, profile)
                    break
                except ValueError as error:
                    logging.warning("Parent story generation attempt %s/3 failed: %s", attempt + 1, error)
                    if attempt == 2:
                        raise JourneyGeneration(str(error)) from error
            journey_id = uuid.uuid4().hex
            content = {"generator": GENERATOR_VERSION, "survival": survival, "economy": economy,
                       "mapIdentity": json.loads(map_identity(base)),
                       "mapSource": self.chunks.fingerprints[region],
                       "code": {name: hashlib.sha256((self.chunks.root / "scripts" / name).read_bytes()).hexdigest()
                                for name in ("journeys.py", "town_trail.py", "local_towns.py", "parent_story.py")},
                       "towns": hashlib.sha256(
                           (self.chunks.root / "data/europe-towns.json.gz").read_bytes()).hexdigest()}
            content_version = hashlib.sha256(json.dumps(content, sort_keys=True).encode()).hexdigest()
            created_at = datetime.fromtimestamp(started_at / 1000, timezone.utc).isoformat(
                timespec="milliseconds").replace("+00:00", "Z")
            state = initial_state(base, name, started_at, card, survival, economy, trail)
            state["serverJourney"] = {"id": journey_id, "seed": seed, "createdAt": created_at,
                                      "contentVersion": content_version}
            record = {"version": 1, "region": region, "mapIdentity": map_identity(base),
                      "state": state, "survival": survival, "economy": economy}
            payload = json.dumps(record, ensure_ascii=True, allow_nan=False)
            db.execute("INSERT INTO journeys VALUES (?, ?, ?, ?)",
                       (journey_id, request_id, payload, hashlib.sha256(payload.encode()).hexdigest()))
            return record, True
