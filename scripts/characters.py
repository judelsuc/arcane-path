"""Persistent fictional characters with shared identity and journey-private memories."""

from contextlib import contextmanager
import hashlib
import json
import logging
import re
import sqlite3
import threading
import time
from concurrent.futures import ThreadPoolExecutor

from content_factory import IMAGE_MODEL
from asset_storage import AssetRecord
from content_storage import clock as database_clock
from character_encounters import SCHEMAS as ENCOUNTER_SCHEMAS
from shared_images import SharedImages
from journey_storage import StoreConnection, cached_journey_cell
from journeys import JourneyConflict, JourneyRequest, character_name

WORLD = "roadside-characters-v1"
PORTRAIT_VERSION = "character-portrait-v1"
FACT_VERSION = 1
REQUEST_ID = re.compile(r"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}")
CHARACTER_ID = re.compile(r"[a-f0-9]{32}")
OSM_ID = re.compile(r"(?:node|way)/\d+")
CONTRACT_ID = re.compile(r"[a-f0-9]{32}")
TOPICS = {"parent", "clues", "notebooks", "artifacts", "services",
          "shelter", "food", "work", "transport", "town"}
CONTRACT_EVENTS = {"offered", "accepted", "declined", "advanced", "completed", "abandoned"}
MAX_TOWN_CHARACTERS = 4
MAX_ROADSIDE_CHARACTERS = 1
MAX_REGION_CHARACTERS = 1000
MAX_WORLD_CHARACTERS = 5000
COUNTRYSIDE_CHUNK = 8
PRESENCE_PHASES = ("day", "dawn", "dusk", "night")
# Chance that someone is around, by place and journey time of day.
PRESENCE_CHANCES = {
    "town": {"day": .95, "dawn": .8, "dusk": .8, "night": .45},
    "road": {"day": .75, "dawn": .5, "dusk": .5, "night": .2},
    "countryside": {"day": .5, "dawn": .3, "dusk": .3, "night": .1},
}
MAX_PRIVATE_MEMORIES_PER_JOURNEY = 1000
MAX_PENDING_PORTRAITS = 16
PORTRAIT_PENDING_SECONDS = 1800
NAMING_LOCALES = {"firmi": "fr-FR", "paris": "fr-FR",
                  "alps": "fr-FR", "tahiti": "fr-FR"}
COUNTRY_NAMING_LOCALES = {
    "GB": "en-GB", "IE": "en-GB", "US": "en-US", "CA": "en-US",
    "ES": "es-ES", "IT": "it-IT", "DE": "de-DE", "AT": "de-DE",
    "CH": "de-DE", "PL": "pl-PL", "FI": "fi-FI", "FR": "fr-FR",
    "BE": "fr-FR", "LU": "fr-FR", "MC": "fr-FR",
}
NAMES = {
    "fr-FR": {
        "given": ("Anaïs", "Camille", "Émile", "Inès", "Jules", "Lucie",
                  "Maëlle", "Noémie", "Raphaël", "Zoé"),
        "family": ("Aubry", "Bazin", "Collet", "Delaunay", "Fabre",
                   "Leroux", "Mercier", "Perrin", "Roussel", "Vidal"),
    },
    "en-GB": {
        "given": ("Ada", "Arthur", "Beatrice", "Elliot", "Florence", "Iris",
                  "Oliver", "Rowan", "Thomas", "Violet"),
        "family": ("Ainsworth", "Bennett", "Clarke", "Ellis", "Fletcher",
                   "Hughes", "Marlow", "Parker", "Turner", "Wells"),
    },
    "en-US": {
        "given": ("Avery", "Casey", "Eleanor", "Emmett", "Harper", "Jordan",
                  "Morgan", "Quinn", "Riley", "Sage"),
        "family": ("Brooks", "Carter", "Ellis", "Hayes", "Morgan",
                   "Parker", "Reed", "Rivera", "Taylor", "Woods"),
    },
    "es-ES": {
        "given": ("Alba", "Clara", "Diego", "Elena", "Inés", "Lucía",
                  "Mateo", "Nicolás", "Pablo", "Vega"),
        "family": ("Alonso", "Blanco", "Castro", "García", "López",
                   "Martín", "Navarro", "Ortega", "Ruiz", "Santos"),
    },
    "it-IT": {
        "given": ("Alessia", "Andrea", "Carlo", "Elena", "Giorgio", "Luca",
                  "Marta", "Nadia", "Paolo", "Sofia"),
        "family": ("Bianchi", "Conti", "Costa", "Esposito", "Ferrari",
                   "Gallo", "Greco", "Marino", "Romano", "Rossi"),
    },
    "de-DE": {
        "given": ("Amalia", "Anton", "Emil", "Greta", "Hanna", "Jonas",
                  "Lena", "Mila", "Theo", "Yara"),
        "family": ("Bauer", "Becker", "Fischer", "Hoffmann", "Keller",
                   "Koch", "Meyer", "Schneider", "Schulz", "Weber"),
    },
    "pl-PL": {
        "given": ("Adam", "Agnieszka", "Ania", "Jan", "Kasia", "Marek",
                  "Marta", "Piotr", "Tomasz", "Zofia"),
        "family": ("Dąbrowski", "Kowalski", "Kozłowski", "Lewandowski", "Mazur",
                   "Nowak", "Szymański", "Woźniak", "Zieliński", "Żuk"),
    },
    "fi-FI": {
        "given": ("Aino", "Eero", "Helmi", "Ilmari", "Kaisa", "Lauri",
                  "Matti", "Noora", "Sanni", "Veikko"),
        "family": ("Aalto", "Heikkinen", "Hämäläinen", "Järvinen", "Korhonen",
                   "Laine", "Nieminen", "Virtanen", "Vuori", "Äijälä"),
    },
}
ROLES = (
    ("artisan", "patient", "keeps a small repair workshop"),
    ("gardener", "curious", "tends a shared garden"),
    ("bookseller", "thoughtful", "looks after a bookstall"),
    ("traveller", "observant", "takes familiar local roads"),
)
ROLE_KNOWLEDGE = {
    "artisan": (["services", "work"], ["own_workshop"]),
    "gardener": (["services", "town"], ["own_garden"]),
    "bookseller": (["services", "town"], ["own_bookstall"]),
    "traveller": (["transport", "town"], ["familiar_local_roads"]),
}
FACT_TOPICS = {
    "own_workshop": {"services", "work"},
    "own_garden": {"services", "town"},
    "own_bookstall": {"services", "town"},
    "familiar_local_roads": {"transport", "town"},
    "general_local_services": {"services", "work"},
    "public_places": {"services", "town"},
    "local_routes": {"transport", "town"},
}
FACT_TEXT = {
    "own_workshop": "I keep a small repair workshop.",
    "own_garden": "I tend a shared garden.",
    "own_bookstall": "I look after a bookstall.",
    "familiar_local_roads": "I travel familiar local roads, but I have no verified route details to share.",
    "general_local_services": "I keep a small repair workshop.",
    "public_places": "I tend a shared garden or bookstall; I do not have a verified public-place list.",
    "local_routes": "I travel familiar local roads, but I have no verified route details to share.",
}
PORTRAIT_ROLE_PROMPTS = {
    "artisan": "a fictional adult craftsperson who repairs small everyday objects",
    "gardener": "a fictional adult community gardener",
    "bookseller": "a fictional adult bookseller",
    "traveller": "a fictional adult local traveller",
}


def portrait_request(character_id):
    return hashlib.sha256(
        f"{PORTRAIT_VERSION}:{IMAGE_MODEL}:{character_id}".encode()
    ).hexdigest()


def portrait_prompt(role):
    if role not in PORTRAIT_ROLE_PROMPTS:
        raise ValueError("Unknown portrait role.")
    return {"prompt": (
        f"An original illustrated bust portrait of {PORTRAIT_ROLE_PROMPTS[role]}, "
        "with generic non-identifiable features, gentle expression, simple role-appropriate clothing, "
        "soft watercolor and ink on warm paper, restrained indigo and ochre palette. "
        "One fictional adult only; no name, place, readable text, symbols, maps, realism, "
        "photographic likeness, or reference to any real person."
    )}


class Characters:
    def __init__(self, journeys, authorization, *, clock=time.time, writer=None):
        self.journeys, self.authorization, self.clock = journeys, authorization, clock
        self.assets = getattr(journeys, "assets", None)
        self.writer = writer if self.assets is not None else None
        self.portrait_pool = (ThreadPoolExecutor(max_workers=1, thread_name_prefix="character-portrait")
                             if self.writer else None)
        self.portrait_tasks = set()
        self.portrait_lock = threading.Lock()
        self.path = journeys.path.parent / "characters.sqlite3"
        if self.assets is None:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with self.connect() as db:
                db.executescript("""
                    CREATE TABLE IF NOT EXISTS journey_store_locks(name TEXT PRIMARY KEY);
                    INSERT INTO journey_store_locks(name) VALUES('character-registry')
                        ON CONFLICT(name) DO NOTHING;
                    CREATE TABLE IF NOT EXISTS world_characters (
                        character_id TEXT PRIMARY KEY, world_id TEXT NOT NULL, region TEXT NOT NULL,
                        location_id TEXT NOT NULL, location_kind TEXT NOT NULL, location_name TEXT NOT NULL,
                        naming_locale TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL,
                        profile TEXT NOT NULL, knowledge TEXT NOT NULL, needs TEXT NOT NULL,
                        portrait_ref TEXT, portrait_status TEXT NOT NULL, portrait_model TEXT,
                        portrait_provenance TEXT NOT NULL,
                        portrait_revision INTEGER NOT NULL, revision INTEGER NOT NULL, slot INTEGER NOT NULL,
                        created_at DOUBLE PRECISION NOT NULL, UNIQUE(world_id,location_id,slot));
                    CREATE INDEX IF NOT EXISTS world_characters_location
                        ON world_characters(world_id,region,location_id,slot);
                    CREATE TABLE IF NOT EXISTS character_creation_requests (
                        journey TEXT NOT NULL, request_id TEXT NOT NULL, fingerprint TEXT NOT NULL,
                        character_id TEXT NOT NULL, created_at DOUBLE PRECISION NOT NULL,
                        PRIMARY KEY(journey,request_id));
                    CREATE TABLE IF NOT EXISTS character_private_memories (
                        journey TEXT NOT NULL, character_id TEXT NOT NULL, event_id TEXT NOT NULL,
                        event_type TEXT NOT NULL, topic TEXT, created_at DOUBLE PRECISION NOT NULL,
                        PRIMARY KEY(journey,event_id));
                    CREATE INDEX IF NOT EXISTS character_private_memories_history
                        ON character_private_memories(journey,character_id,created_at);
                    CREATE TABLE IF NOT EXISTS character_private_exchanges (
                        journey TEXT NOT NULL, event_id TEXT NOT NULL, character_id TEXT NOT NULL,
                        topic TEXT NOT NULL, fact_ids TEXT NOT NULL,
                        fact_version INTEGER NOT NULL DEFAULT 1, created_at DOUBLE PRECISION NOT NULL,
                        PRIMARY KEY(journey,event_id));
                    CREATE TABLE IF NOT EXISTS character_quest_contracts (
                        journey TEXT NOT NULL, character_id TEXT NOT NULL, contract_id TEXT NOT NULL,
                        status TEXT NOT NULL, step INTEGER NOT NULL, total_steps INTEGER NOT NULL,
                        outcome TEXT, updated_at DOUBLE PRECISION NOT NULL,
                        PRIMARY KEY(journey,contract_id));
                    CREATE TABLE IF NOT EXISTS character_quest_events (
                        journey TEXT NOT NULL, event_id TEXT NOT NULL, character_id TEXT NOT NULL,
                        contract_id TEXT NOT NULL, event TEXT NOT NULL, step INTEGER NOT NULL,
                        total_steps INTEGER NOT NULL, created_at DOUBLE PRECISION NOT NULL,
                        PRIMARY KEY(journey,event_id), UNIQUE(journey,contract_id,event,step));
                    CREATE INDEX IF NOT EXISTS character_quest_contracts_history
                        ON character_quest_contracts(journey,character_id,updated_at);
                """)
                self._ensure_exchange_version(db)
                for schema in ENCOUNTER_SCHEMAS:
                    db.execute(schema)
            self.path.chmod(0o600)
        if self.assets is not None:
            self._resume_portraits()

    @staticmethod
    def _ensure_exchange_version(db):
        columns = {row[1] for row in db.execute(
            "PRAGMA table_info(character_private_exchanges)").fetchall()}
        if "fact_version" not in columns:
            db.execute(
                "ALTER TABLE character_private_exchanges "
                "ADD COLUMN fact_version INTEGER NOT NULL DEFAULT 1")

    @contextmanager
    def connect(self):
        if self.assets is not None:
            with self.assets.catalogue.connection() as db:
                yield StoreConnection(db, self.assets.catalogue, mapping=True)
        else:
            db = sqlite3.connect(self.path, timeout=10)
            db.row_factory = sqlite3.Row
            try:
                with db:
                    yield db
            finally:
                db.close()

    def _begin(self, db):
        if self.assets is None:
            db.execute("BEGIN IMMEDIATE")
        else:
            db.begin("character-registry")

    def _authorized_journey(self, request, token):
        journey = request.get("journey")
        if not isinstance(journey, str) or not CHARACTER_ID.fullmatch(journey):
            raise JourneyRequest("Invalid character journey.")
        genesis = self.authorization.authorize(journey, token)
        region = genesis["region"]
        chunks = self.journeys.chunks
        chunks.require_origin(region)
        base = chunks.bases.get(region)
        return journey, genesis, region, base

    def _authorized_location(self, request, token):
        journey, genesis, region, base = self._authorized_journey(request, token)
        _, _, cell, _, _ = cached_journey_cell(self.journeys.chunks, region, request.get("location"))
        col, row = request["location"]["col"], request["location"]["row"]
        if cell.get("unavailable") or cell.get("terrain") == "water":
            raise JourneyConflict("No character encounter is available in this cell.")
        settlements = sorted(
            (place for place in cell.get("settlements", [])
             if isinstance(place, dict) and isinstance(place.get("osmId"), str)
             and OSM_ID.fullmatch(place["osmId"]) and place["osmId"].startswith(("node/", "way/"))
             and isinstance(place.get("name"), str) and place["name"].strip()),
            key=lambda place: place["osmId"])
        if settlements and cell.get("terrain") == "place":
            town = settlements[0]
            location = {"id": "town:" + town["osmId"], "kind": "town",
                        "name": town["name"].strip(), "col": col, "row": row}
        elif cell.get("terrain") == "major_road":
            location = {"id": f"road:{region}:{col}:{row}", "kind": "roadside",
                        "name": base.get("name", region), "col": col, "row": row}
        else:
            # One wandering character per map chunk keeps the countryside population bounded.
            location = {"id": f"wild:{region}:{col // COUNTRYSIDE_CHUNK}:{row // COUNTRYSIDE_CHUNK}",
                        "kind": "countryside", "name": base.get("name", region), "col": col, "row": row}
        location["terrain"] = cell.get("terrain")
        country_codes = cell.get("countryCodes", [])
        if not isinstance(country_codes, list):
            country_codes = []
        country_codes = sorted({code for code in country_codes
                                if isinstance(code, str) and re.fullmatch(r"[A-Z]{2}", code)})
        naming_locale = cell.get("namingLocale")
        if "namingLocale" in cell:
            naming_locale = naming_locale if isinstance(naming_locale, str) and naming_locale in NAMES else None
        elif country_codes:
            naming_locale = next((COUNTRY_NAMING_LOCALES[code] for code in country_codes
                                  if code in COUNTRY_NAMING_LOCALES), None)
        elif 0 <= col < base["width"] and 0 <= row < base["height"]:
            explicit = base.get("namingLocale")
            naming_locale = (explicit if isinstance(explicit, str) and explicit in NAMES
                             else NAMING_LOCALES.get(region) if explicit is None else None)
        if naming_locale not in NAMES:
            location["canCreate"] = False
        else:
            location["canCreate"] = True
        location["namingLocale"] = naming_locale
        return journey, genesis, region, location

    @staticmethod
    def _character(row, memories=(), position=None):
        location = {"id": row["location_id"], "kind": row["location_kind"],
                    "name": row["location_name"]}
        current = {**location}
        if position:
            current.update({key: position[key] for key in ("col", "row")})
            current["region"] = position.get("region", row["region"])
        return {
            "id": row["character_id"], "name": row["name"], "role": row["role"],
            "location": location, "home": location, "current": current,
            "availability": "present",
            "availabilityClock": "shared-world-static-v1",
            "namingLocale": row["naming_locale"],
            "profile": json.loads(row["profile"]), "knowledge": json.loads(row["knowledge"]),
            "needs": json.loads(row["needs"]),
            "portrait": {"ref": row["portrait_ref"], "status": row["portrait_status"],
                         "model": row["portrait_model"],
                         "provenance": json.loads(row["portrait_provenance"]),
                         "revision": row["portrait_revision"]},
            "revision": row["revision"], "memories": list(memories), "contracts": [],
        }

    def _memories(self, db, journey, character_id):
        rows = db.execute(self._sql(
            "SELECT m.event_type,m.topic,m.created_at,e.fact_ids,e.fact_version "
            "FROM character_private_memories m "
            "LEFT JOIN character_private_exchanges e ON e.journey=m.journey AND e.event_id=m.event_id "
            "WHERE m.journey=? AND m.character_id=? ORDER BY m.created_at DESC,m.event_id DESC LIMIT 20"),
            (journey, character_id)).fetchall()
        return [{"type": row["event_type"], "topic": row["topic"], "at": row["created_at"],
                 **({"facts": json.loads(row["fact_ids"]),
                     "factVersion": row["fact_version"]} if row["fact_ids"] is not None else {})}
                for row in reversed(rows)]

    def _contracts(self, db, journey, character_id):
        rows = db.execute(self._sql(
            "SELECT contract_id,status,step,total_steps,outcome,updated_at FROM character_quest_contracts "
            "WHERE journey=? AND character_id=? ORDER BY updated_at DESC,contract_id DESC LIMIT 20"),
            (journey, character_id)).fetchall()
        return [{"id": row["contract_id"], "status": row["status"], "step": row["step"],
                 "totalSteps": row["total_steps"], "outcome": row["outcome"], "updatedAt": row["updated_at"]}
                for row in reversed(rows)]

    def _sql(self, query):
        return query

    @staticmethod
    def _visitor_name(genesis):
        value = genesis.get("state", {}).get("name")
        try:
            name = character_name(value)
        except (JourneyRequest, UnicodeError):
            return None
        if any(char in "<>" for char in name):
            return None
        return name

    def _encounter_clock(self, db):
        if self.assets:
            return float(db.execute("SELECT " + database_clock(self.assets.catalogue)).fetchone()[0])
        return self.clock()

    def _backfill_encounters(self, journey, genesis):
        name = self._visitor_name(genesis)
        with self.connect() as db:
            self._begin(db)
            if name:
                db.execute(self._sql(
                    "INSERT INTO character_visitor_identities(journey,fictional_name) VALUES(?,?) "
                    "ON CONFLICT(journey) DO NOTHING"), (journey, name))
            db.execute(self._sql(
                "INSERT INTO character_encounter_events(journey,event_id,character_id,seen_at) "
                "SELECT journey,event_id,character_id,created_at FROM character_private_memories "
                "WHERE journey=? AND event_type='met' "
                "ON CONFLICT(journey,event_id) DO NOTHING"), (journey,))
            db.execute(self._sql(
                "INSERT INTO character_encounters(character_id,journey,first_seen,last_seen,meeting_count) "
                "SELECT character_id,journey,MIN(seen_at),MAX(seen_at),COUNT(*) "
                "FROM character_encounter_events WHERE journey=? GROUP BY character_id,journey "
                "ON CONFLICT(character_id,journey) DO UPDATE SET "
                "first_seen=excluded.first_seen,last_seen=excluded.last_seen,"
                "meeting_count=excluded.meeting_count"), (journey,))

    def _familiarity(self, db, journey, character_id):
        row = db.execute(self._sql(
            "SELECT meeting_count FROM character_encounters WHERE character_id=? AND journey=?"),
            (character_id, journey)).fetchone()
        return {"known": row is not None, "meetings": row["meeting_count"] if row else 0}

    def _visitors(self, db, journey, character_id, cursor=None, limit=3, offset=0):
        rows = db.execute(self._sql(
            "SELECT DISTINCT i.fictional_name FROM character_encounters e "
            "JOIN character_visitor_identities i ON i.journey=e.journey "
            "WHERE e.character_id=? AND e.journey<>? "
            "AND i.fictional_name<>COALESCE((SELECT fictional_name FROM character_visitor_identities "
            "WHERE journey=?),'') AND i.fictional_name>? ORDER BY i.fictional_name LIMIT ? OFFSET ?"),
            (character_id, journey, journey, cursor or "", limit + 1, offset)).fetchall()
        return {"facts": [{"name": row["fictional_name"], "type": "met"}
                          for row in rows[:limit]],
                "nextCursor": rows[limit - 1]["fictional_name"] if len(rows) > limit else None}

    def _visitor_mention(self, db, journey, character_id, seed):
        if seed % 3:
            return []
        count = db.execute(self._sql(
            "SELECT COUNT(DISTINCT i.fictional_name) FROM character_encounters e "
            "JOIN character_visitor_identities i ON i.journey=e.journey "
            "WHERE e.character_id=? AND e.journey<>? "
            "AND i.fictional_name<>COALESCE((SELECT fictional_name FROM character_visitor_identities "
            "WHERE journey=?),'')"), (character_id, journey, journey)).fetchone()[0]
        if not count:
            return []
        return self._visitors(db, journey, character_id, limit=1, offset=(seed // 3) % count)["facts"]

    def _visitor_page(self, journey, location, character_id, cursor, limit):
        if (type(limit) is not int or not 1 <= limit <= 20 or
                cursor is not None and (not isinstance(cursor, str) or
                                        len(cursor) > 40 or self._visitor_name(
                                            {"state": {"name": cursor}}) != cursor)):
            raise JourneyRequest("Invalid visitor page.")
        with self.connect() as db:
            row = db.execute(self._sql(
                "SELECT 1 FROM world_characters WHERE character_id=? AND world_id=? AND location_id=?"),
                (character_id, WORLD, location["id"])).fetchone()
            if row is None:
                raise JourneyConflict("That character is not available at this location.")
            return self._visitors(db, journey, character_id, cursor, limit)

    def _list(self, journey, region, location):
        if self.assets:
            with self.connect() as db:
                pending = db.execute(self._sql(
                    "SELECT character_id FROM world_characters WHERE world_id=? AND location_id=? "
                    "AND portrait_status IN ('pending','failed') ORDER BY slot LIMIT ?"),
                    (WORLD, location["id"], MAX_TOWN_CHARACTERS)).fetchall()
            for row in pending:
                self._reconcile_portrait(row["character_id"])
        with self.connect() as db:
            rows = db.execute(self._sql(
                "SELECT * FROM world_characters WHERE world_id=? AND location_id=? ORDER BY slot"),
                (WORLD, location["id"])).fetchall()
            characters = []
            for row in rows:
                character = self._character(
                    row, self._memories(db, journey, row["character_id"]), {**location, "region": region})
                character["contracts"] = self._contracts(db, journey, row["character_id"])
                character["familiarity"] = self._familiarity(db, journey, row["character_id"])
                character["visitorFacts"] = self._visitors(db, journey, row["character_id"])["facts"]
                characters.append(character)
        limit = MAX_TOWN_CHARACTERS if location["kind"] == "town" else MAX_ROADSIDE_CHARACTERS
        location = {key: value for key, value in location.items() if key not in ("namingLocale", "terrain")}
        return {"location": location, "characters": characters,
                "canCreate": bool(location.get("canCreate") and len(characters) < limit),
                "limit": limit}

    @staticmethod
    def _presence_chance(location, phase):
        if location["kind"] == "town":
            group = "town"
        elif location["kind"] == "roadside" or location.get("terrain") == "road":
            group = "road"
        else:
            group = "countryside"
        return PRESENCE_CHANCES[group][phase]

    def _encounter(self, journey, region, location, presence):
        if (not isinstance(presence, dict) or set(presence) != {"phase", "hour"}
                or presence["phase"] not in PRESENCE_PHASES
                or type(presence["hour"]) is not int or not 0 <= presence["hour"] < 2 ** 40):
            raise JourneyRequest("Invalid character presence request.")
        # Deterministic per journey, place and journey hour: reopening never rerolls.
        seed = hashlib.sha256(f"presence:{journey}:{location['id']}:{presence['hour']}".encode()).hexdigest()
        if int(seed[:8], 16) / 2 ** 32 >= self._presence_chance(location, presence["phase"]):
            result = self._list(journey, region, location)
            return {**result, "characters": [], "canCreate": False, "absent": True}
        result = self._list(journey, region, location)
        if result["characters"] or not location["canCreate"]:
            return result
        request_id = "-".join((seed[8:16], seed[16:20], seed[20:24], seed[24:28], seed[28:40]))
        try:
            arrived = self._create(journey, region, location, request_id)
        except JourneyConflict:
            result = self._list(journey, region, location)
            return result if result["characters"] else {**result, "canCreate": False, "absent": True}
        return {**self._list(journey, region, location), "arrived": arrived["id"]}

    def _create(self, journey, region, location, request_id):
        if not location["canCreate"]:
            raise JourneyConflict("Character creation is unavailable until this place has a supported naming locale.")
        fingerprint = hashlib.sha256(json.dumps(
            [WORLD, location["id"]], separators=(",", ":")).encode()).hexdigest()
        schedule_portrait = False
        with self.connect() as db:
            self._begin(db)
            receipt = db.execute(self._sql(
                "SELECT fingerprint,character_id FROM character_creation_requests "
                "WHERE journey=? AND request_id=?"), (journey, request_id)).fetchone()
            if receipt:
                if receipt["fingerprint"] != fingerprint:
                    raise JourneyConflict("This character request id already belongs to another location.")
                row = db.execute(self._sql(
                    "SELECT * FROM world_characters WHERE character_id=?"), (receipt["character_id"],)).fetchone()
                if row is None:
                    raise JourneyConflict("The requested character is no longer available.")
                character_id = row["character_id"]
                result = self._character(
                    row, self._memories(db, journey, row["character_id"]), {**location, "region": region})
                schedule_portrait = row["portrait_status"] == "pending"
            else:
                limit = MAX_TOWN_CHARACTERS if location["kind"] == "town" else MAX_ROADSIDE_CHARACTERS
                rows = db.execute(self._sql(
                    "SELECT slot FROM world_characters WHERE world_id=? AND location_id=? ORDER BY slot"),
                    (WORLD, location["id"])).fetchall()
                if len(rows) >= limit:
                    raise JourneyConflict("This place has reached its character limit; choose someone already here.")
                if db.execute(self._sql(
                        "SELECT count(*) FROM world_characters WHERE region=?"), (region,)).fetchone()[0] >= MAX_REGION_CHARACTERS:
                    raise JourneyConflict("This region has reached its character population limit.")
                if db.execute(self._sql(
                        "SELECT count(*) FROM world_characters WHERE world_id=?"), (WORLD,)).fetchone()[0] >= MAX_WORLD_CHARACTERS:
                    raise JourneyConflict("The shared character population limit has been reached.")
                occupied = {row["slot"] for row in rows}
                slot = next(slot for slot in range(limit) if slot not in occupied)
                seed = hashlib.sha256(f"{WORLD}:{region}:{location['id']}:{slot}".encode()).hexdigest()
                character_id = seed[:32]
                names = NAMES[location["namingLocale"]]
                name_index = (int(seed[:8], 16) + slot) % (len(names["given"]) * len(names["family"]))
                first = name_index % len(names["given"])
                last = name_index // len(names["given"])
                role, trait, need = ROLES[int(seed[16:24], 16) % len(ROLES)]
                profile = {"trait": trait, "version": 1}
                topics, facts = ROLE_KNOWLEDGE[role]
                knowledge = {
                    "topics": topics, "facts": [{"id": item, "scope": "public"} for item in facts],
                    "parentWitnesses": [],
                }
                needs = {"description": need, "version": 1}
                pending = bool(self.writer and db.execute(self._sql(
                    "SELECT count(*) FROM world_characters WHERE portrait_status='pending'")).fetchone()[0]
                    < MAX_PENDING_PORTRAITS)
                portrait_status = "pending" if pending else "failed"
                provenance = ({"source": "pending", "reason": "generation-queued", "version": PORTRAIT_VERSION}
                              if pending else {
                                  "source": "not-generated",
                                  "reason": "portrait-provider-not-configured" if not self.writer
                                  else "portrait-queue-full",
                                  "version": PORTRAIT_VERSION,
                              })
                db.execute(self._sql(
                    "INSERT INTO world_characters(character_id,world_id,region,location_id,location_kind,"
                    "location_name,naming_locale,name,role,profile,knowledge,needs,portrait_ref,portrait_status,"
                    "portrait_model,portrait_provenance,portrait_revision,revision,slot,created_at) "
                    "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,NULL,?,NULL,?,1,1,?,?)"),
                    (character_id, WORLD, region, location["id"], location["kind"], location["name"],
                     location["namingLocale"], names["given"][first] + " " + names["family"][last],
                     role, json.dumps(profile), json.dumps(knowledge), json.dumps(needs), portrait_status,
                     json.dumps(provenance), slot, self.clock()))
                db.execute(self._sql(
                    "INSERT INTO character_creation_requests(journey,request_id,fingerprint,character_id,created_at) "
                    "VALUES(?,?,?,?,?)"), (journey, request_id, fingerprint, character_id, self.clock()))
                row = db.execute(self._sql(
                    "SELECT * FROM world_characters WHERE character_id=?"), (character_id,)).fetchone()
                result = self._character(row, position={**location, "region": region})
                schedule_portrait = pending
        if schedule_portrait:
            self._schedule_portrait(character_id)
        return result

    def _resume_portraits(self):
        with self.connect() as db:
            rows = db.execute(self._sql(
                "SELECT character_id FROM world_characters WHERE portrait_status IN ('pending','failed') "
                "ORDER BY created_at,character_id LIMIT ?"), (MAX_WORLD_CHARACTERS,)).fetchall()
        for row in rows:
            self._reconcile_portrait(row["character_id"], schedule=True)

    def _reconcile_portrait(self, character_id, *, schedule=False, failed=False):
        request = portrait_request(character_id)
        should_schedule = False
        with self.connect() as db:
            self._begin(db)
            row = db.execute(self._sql(
                "SELECT portrait_status,portrait_provenance,created_at "
                "FROM world_characters WHERE character_id=?"),
                (character_id,)).fetchone()
            if row is None or row["portrait_status"] == "ready":
                return
            if row["portrait_status"] == "failed" and json.loads(row["portrait_provenance"]).get(
                    "reason") not in {"generation-failed", "dispatch-uncertain",
                                      "worker-lease-expired", "pending-expired"}:
                return
            lock = " FOR UPDATE" if self.assets.catalogue.postgres else ""
            now_sql = database_clock(self.assets.catalogue)
            job = db.execute(self._sql(
                "SELECT status,expires FROM worker_jobs "
                "WHERE kind=? AND request=?" + lock),
                ("image-character-portrait", request)).fetchone()
            now = float(db.execute("SELECT " + now_sql).fetchone()[0])
            published = db.execute(self._sql(
                "SELECT payload FROM asset_catalogue WHERE scope=? AND request=?"),
                ("character-portrait", request)).fetchone()
            if published:
                record = AssetRecord(**json.loads(published["payload"]))
                self.assets._verify(record, self.assets.blobs.get(record.key))
                provenance = record.provenance
                db.execute(self._sql(
                    "UPDATE world_characters SET portrait_ref=?,portrait_status='ready',portrait_model=?,"
                    "portrait_provenance=? WHERE character_id=?"),
                    (request, provenance.get("source"), json.dumps(provenance), character_id))
                if job:
                    db.execute(self._sql(
                        "UPDATE worker_jobs SET status='ready',error=NULL WHERE kind=? AND request=?"),
                        ("image-character-portrait", request))
                return
            if (job and job["status"] in {"leased", "dispatched"}
                    and job["expires"] is not None and job["expires"] > now):
                return
            if row["portrait_status"] == "failed":
                return
            expired = now >= row["created_at"] + PORTRAIT_PENDING_SECONDS
            if job and job["status"] in {"leased", "dispatched"}:
                status = "uncertain" if job["status"] == "dispatched" else "failed"
                db.execute(self._sql(
                    "UPDATE worker_jobs SET status=?,error='Portrait lease expired; no automatic retry' "
                    "WHERE kind=? AND request=?"),
                    (status, "image-character-portrait", request))
                reason = "dispatch-uncertain" if status == "uncertain" else "worker-lease-expired"
            elif job and job["status"] in {"failed", "uncertain", "ready"}:
                reason = "dispatch-uncertain" if job["status"] == "uncertain" else "generation-failed"
            elif failed or expired or not self.writer:
                reason = ("generation-failed" if failed else "pending-expired" if expired
                          else "portrait-provider-not-configured")
                if job and job["status"] == "queued":
                    db.execute(self._sql(
                        "UPDATE worker_jobs SET status='failed',error=? WHERE kind=? AND request=?"),
                        (reason, "image-character-portrait", request))
            else:
                should_schedule = schedule
                reason = None
            if reason:
                db.execute(self._sql(
                    "UPDATE world_characters SET portrait_status='failed',portrait_ref=NULL,"
                    "portrait_model=NULL,portrait_provenance=? WHERE character_id=? AND portrait_status='pending'"),
                    (json.dumps({"source": "not-generated", "reason": reason,
                                 "version": PORTRAIT_VERSION}), character_id))
        if should_schedule:
            self._schedule_portrait(character_id)

    def _schedule_portrait(self, character_id):
        if not self.portrait_pool:
            return
        with self.portrait_lock:
            if character_id in self.portrait_tasks or len(self.portrait_tasks) >= MAX_PENDING_PORTRAITS:
                return
            self.portrait_tasks.add(character_id)
        try:
            future = self.portrait_pool.submit(self._generate_portrait, character_id)
        except RuntimeError:
            self._portrait_finished(character_id)
            return
        future.add_done_callback(lambda _: self._portrait_finished(character_id))

    def _portrait_finished(self, character_id):
        with self.portrait_lock:
            self.portrait_tasks.discard(character_id)

    def _generate_portrait(self, character_id):
        request = portrait_request(character_id)
        images = SharedImages(self.assets)
        try:
            with self.connect() as db:
                self._begin(db)
                row = db.execute(self._sql(
                    "SELECT role,portrait_status FROM world_characters WHERE character_id=?"),
                    (character_id,)).fetchone()
                if row is None or row["portrait_status"] != "pending":
                    return
                brief = portrait_prompt(row["role"])
                images.jobs.enqueue("image-character-portrait", request,
                                    {"brief": brief, "model": IMAGE_MODEL, "version": PORTRAIT_VERSION},
                                    provider="images", connection=db.db)
            images.generate(
                "character-portrait", request, brief, self.writer,
                version=PORTRAIT_VERSION)
            record = self.assets.catalogue.find("character-portrait", request)
            if record is None:
                raise RuntimeError("Portrait was not durably published.")
            provenance = record[1].provenance
            with self.connect() as db:
                db.execute(self._sql(
                    "UPDATE world_characters SET portrait_ref=?,portrait_status='ready',portrait_model=?,"
                    "portrait_provenance=? WHERE character_id=? AND portrait_status='pending'"),
                    (request, provenance.get("source"), json.dumps(provenance), character_id))
        except Exception as error:
            logging.warning("Character portrait %s failed without blocking dialogue: %s",
                            character_id, str(error)[:300])
            self._reconcile_portrait(character_id, failed=True)

    def _portrait_image(self, location, character_id):
        if not self.assets:
            raise JourneyConflict("Portrait storage is unavailable.")
        with self.connect() as db:
            row = db.execute(self._sql(
                "SELECT portrait_ref,portrait_status FROM world_characters "
                "WHERE character_id=? AND world_id=? AND location_id=?"),
                (character_id, WORLD, location["id"])).fetchone()
        if row is None:
            raise JourneyConflict("That character is not available at this location.")
        if (row["portrait_status"] != "ready" or not isinstance(row["portrait_ref"], str)
                or not re.fullmatch(r"[a-f0-9]{64}", row["portrait_ref"])):
            raise JourneyConflict("This character portrait is not ready.")
        return self.assets.read("character-portrait", row["portrait_ref"])[1]

    def close(self):
        if self.portrait_pool:
            self.portrait_pool.shutdown(wait=True)

    def _record(self, journey, region, location, request_id, character_id, event_type, topic=None):
        with self.connect() as db:
            self._begin(db)
            row = db.execute(self._sql(
                "SELECT * FROM world_characters WHERE character_id=? AND world_id=? AND location_id=?"),
                (character_id, WORLD, location["id"])).fetchone()
            if row is None:
                raise JourneyConflict("That character is not available at this location.")
            encounter = db.execute(self._sql(
                "SELECT character_id FROM character_encounter_events WHERE journey=? AND event_id=?"),
                (journey, request_id)).fetchone()
            if encounter is not None and encounter["character_id"] != character_id:
                raise JourneyConflict("This encounter event id belongs to another character.")
            memory = db.execute(self._sql(
                "SELECT character_id,event_type,topic FROM character_private_memories "
                "WHERE journey=? AND event_id=?"), (journey, request_id)).fetchone()
            if memory is not None and (
                    memory["character_id"], memory["event_type"], memory["topic"]
            ) != (character_id, event_type, topic):
                raise JourneyConflict("This memory event id already belongs to another exchange.")
            if encounter is None:
                now = self._encounter_clock(db)
                db.execute(self._sql(
                    "INSERT INTO character_encounter_events(journey,event_id,character_id,seen_at) "
                    "VALUES(?,?,?,?)"), (journey, request_id, character_id, now))
                db.execute(self._sql(
                    "INSERT INTO character_encounters(character_id,journey,first_seen,last_seen,meeting_count) "
                    "VALUES(?,?,?,?,1) ON CONFLICT(character_id,journey) DO UPDATE SET "
                    "last_seen=CASE WHEN excluded.last_seen>character_encounters.last_seen "
                    "THEN excluded.last_seen ELSE character_encounters.last_seen END,"
                    "meeting_count=character_encounters.meeting_count+1"),
                    (character_id, journey, now, now))
            if memory is None:
                count = db.execute(self._sql(
                    "SELECT count(*) FROM character_private_memories WHERE journey=?"), (journey,)).fetchone()[0]
                if count < MAX_PRIVATE_MEMORIES_PER_JOURNEY:
                    db.execute(self._sql(
                        "INSERT INTO character_private_memories(journey,character_id,event_id,event_type,topic,created_at) "
                        "VALUES(?,?,?,?,?,?)"), (journey, character_id, request_id, event_type, topic,
                                                 self._encounter_clock(db)))
            return {"recorded": True, "type": event_type, "characterId": character_id,
                    "familiarity": self._familiarity(db, journey, character_id)}

    def _exchange(self, journey, location, request_id, character_id, topic):
        with self.connect() as db:
            self._begin(db)
            row = db.execute(self._sql(
                "SELECT * FROM world_characters WHERE character_id=? AND world_id=? AND location_id=?"),
                (character_id, WORLD, location["id"])).fetchone()
            if row is None:
                raise JourneyConflict("That character is not available at this location.")
            met = db.execute(self._sql(
                "SELECT 1 FROM character_encounters WHERE journey=? AND character_id=?"),
                (journey, character_id)).fetchone()
            if met is None:
                raise JourneyConflict("Meet this character before beginning a conversation.")
            knowledge = json.loads(row["knowledge"])
            allowed = set(knowledge.get("topics", ()))
            facts = sorted({
                item.get("id") for item in knowledge.get("facts", ())
                if isinstance(item, dict) and item.get("scope") == "public"
                and item.get("id") in FACT_TEXT and topic in FACT_TOPICS[item["id"]]
            }) if topic in allowed else []
            existing = db.execute(self._sql(
                "SELECT character_id,event_type,topic FROM character_private_memories "
                "WHERE journey=? AND event_id=?"), (journey, request_id)).fetchone()
            if db.execute(self._sql(
                    "SELECT 1 FROM character_encounter_events WHERE journey=? AND event_id=?"),
                    (journey, request_id)).fetchone():
                raise JourneyConflict("This event id already belongs to a meeting.")
            if existing is not None:
                if (existing["character_id"], existing["event_type"], existing["topic"]) != (
                        character_id, "exchanged", topic):
                    raise JourneyConflict("This memory event id already belongs to another exchange.")
                recorded = db.execute(self._sql(
                    "SELECT fact_ids,fact_version FROM character_private_exchanges "
                    "WHERE journey=? AND event_id=?"), (journey, request_id)).fetchone()
                if recorded is None:
                    raise JourneyConflict("The original exchange record is incomplete or inconsistent.")
                facts = json.loads(recorded["fact_ids"])
                fact_version = recorded["fact_version"]
                if not isinstance(facts, list) or type(fact_version) is not int or fact_version < 1:
                    raise JourneyConflict("The original exchange record is incomplete or inconsistent.")
            else:
                count = db.execute(self._sql(
                    "SELECT count(*) FROM character_private_memories WHERE journey=?"),
                    (journey,)).fetchone()[0]
                if count >= MAX_PRIVATE_MEMORIES_PER_JOURNEY:
                    raise JourneyConflict("This journey has reached its character-memory limit.")
                now = self.clock()
                db.execute(self._sql(
                    "INSERT INTO character_private_memories(journey,character_id,event_id,event_type,topic,created_at) "
                    "VALUES(?,?,?,'exchanged',?,?)"), (journey, character_id, request_id, topic, now))
                db.execute(self._sql(
                    "INSERT INTO character_private_exchanges(journey,event_id,character_id,topic,fact_ids,"
                    "fact_version,created_at) VALUES(?,?,?,?,?,?,?)"),
                    (journey, request_id, character_id, topic, json.dumps(facts), FACT_VERSION, now))
                fact_version = FACT_VERSION
            seed = int(hashlib.sha256(f"{character_id}:{journey}:{topic}".encode()).hexdigest()[:8], 16)
            mention = self._visitor_mention(db, journey, character_id, seed)
        return {"recorded": True, "type": "exchanged", "characterId": character_id,
                "topic": topic, "factIds": facts, "factVersion": fact_version, "visitorFacts": mention}

    @staticmethod
    def _contract_status(event):
        return {
            "offered": ("offered", "offered"),
            "accepted": ("active", "accepted"),
            "declined": ("declined", "declined"),
            "advanced": ("active", "advanced"),
            "completed": ("completed", "completed"),
            "abandoned": ("abandoned", "abandoned"),
        }[event]

    def _contract(self, data, token):
        journey, genesis, _, _ = self._authorized_journey(data, token)
        self._backfill_encounters(journey, genesis)
        contract = data["contract"]
        if not isinstance(contract, dict) or set(contract) != {"id", "event", "step", "totalSteps"}:
            raise JourneyRequest("Invalid character quest contract fields.")
        position = data.get("location")
        if (not isinstance(position, dict) or set(position) != {"col", "row"}
                or any(type(position[key]) is not int or not -8000 <= position[key] <= 8007
                       for key in ("col", "row"))):
            raise JourneyRequest("A current map position is required.")
        character_id, contract_id, event = data["characterId"], contract.get("id"), contract.get("event")
        step, total = contract.get("step"), contract.get("totalSteps")
        if (not isinstance(character_id, str) or not CHARACTER_ID.fullmatch(character_id)
                or not isinstance(contract_id, str) or not CONTRACT_ID.fullmatch(contract_id)
                or not isinstance(event, str) or event not in CONTRACT_EVENTS
                or type(step) is not int or type(total) is not int
                or not 1 <= total <= 3 or not 0 <= step <= total):
            raise JourneyRequest("Invalid character quest contract.")
        request_id = data["requestId"]
        if event == "offered":
            _, _, _, location = self._authorized_location(data, token)
            with self.connect() as db:
                row = db.execute(self._sql(
                    "SELECT 1 FROM world_characters WHERE character_id=? AND world_id=? AND location_id=?"),
                    (character_id, WORLD, location["id"])).fetchone()
                met = db.execute(self._sql(
                    "SELECT 1 FROM character_encounters WHERE journey=? AND character_id=?"),
                    (journey, character_id)).fetchone()
            if row is None:
                raise JourneyConflict("This character cannot offer a quest away from their location.")
            if met is None:
                raise JourneyConflict("A character quest cannot be attributed before the characters meet.")

        status, outcome = self._contract_status(event)
        event_type = f"quest_{event}"
        with self.connect() as db:
            self._begin(db)
            character = db.execute(self._sql(
                "SELECT 1 FROM world_characters WHERE character_id=? AND world_id=?"),
                (character_id, WORLD)).fetchone()
            if character is None:
                raise JourneyConflict("That character is no longer available.")
            if db.execute(self._sql(
                    "SELECT 1 FROM character_encounter_events WHERE journey=? AND event_id=?"),
                    (journey, request_id)).fetchone():
                raise JourneyConflict("This event id already belongs to a meeting.")
            repeated = db.execute(self._sql(
                "SELECT character_id,contract_id,event,step,total_steps FROM character_quest_events "
                "WHERE journey=? AND event_id=?"), (journey, request_id)).fetchone()
            if repeated is not None:
                if (repeated["character_id"], repeated["contract_id"], repeated["event"],
                        repeated["step"], repeated["total_steps"]) != (
                        character_id, contract_id, event, step, total):
                    raise JourneyConflict("This event id already belongs to a different quest contract change.")
                return {"recorded": True, "status": status, "step": step, "contractId": contract_id}
            same_transition = db.execute(self._sql(
                "SELECT character_id,total_steps FROM character_quest_events "
                "WHERE journey=? AND contract_id=? AND event=? AND step=?"),
                (journey, contract_id, event, step)).fetchone()
            if same_transition is not None:
                if (same_transition["character_id"], same_transition["total_steps"]) != (character_id, total):
                    raise JourneyConflict("This quest transition belongs to a different contract.")
                return {"recorded": True, "status": status, "step": step, "contractId": contract_id}
            current = db.execute(self._sql(
                "SELECT character_id,status,step,total_steps FROM character_quest_contracts "
                "WHERE journey=? AND contract_id=?"), (journey, contract_id)).fetchone()
            if current is None:
                if event != "offered" or step != 0:
                    raise JourneyConflict("A character quest must be offered before it can change.")
                count = db.execute(self._sql(
                    "SELECT count(*) FROM character_private_memories WHERE journey=?"),
                    (journey,)).fetchone()[0]
                if count >= MAX_PRIVATE_MEMORIES_PER_JOURNEY:
                    raise JourneyConflict("This journey has reached its character-memory limit.")
                db.execute(self._sql(
                    "INSERT INTO character_quest_contracts(journey,character_id,contract_id,status,step,"
                    "total_steps,outcome,updated_at) VALUES(?,?,?,'offered',0,?,NULL,?)"),
                    (journey, character_id, contract_id, total, self.clock()))
            else:
                if current["character_id"] != character_id or current["total_steps"] != total:
                    raise JourneyConflict("This quest id belongs to another character or contract.")
                prior_status, prior_step = current["status"], current["step"]
                valid = (
                    event == "accepted" and prior_status == "offered" and step == 0
                    or event == "declined" and prior_status == "offered" and step == 0
                    or event == "advanced" and prior_status == "active" and step == prior_step + 1
                    and step < total
                    or event == "completed" and prior_status == "active" and step == total
                    and step == prior_step + 1
                    or event == "abandoned" and prior_status == "active" and step == prior_step
                )
                if not valid:
                    raise JourneyConflict("This character quest cannot make that state transition.")
                db.execute(self._sql(
                    "UPDATE character_quest_contracts SET status=?,step=?,outcome=?,updated_at=? "
                    "WHERE journey=? AND contract_id=?"),
                    (status, step, outcome if status in {"completed", "declined", "abandoned"} else None,
                     self.clock(), journey, contract_id))
            memory_count = db.execute(self._sql(
                "SELECT count(*) FROM character_private_memories WHERE journey=?"),
                (journey,)).fetchone()[0]
            if memory_count >= MAX_PRIVATE_MEMORIES_PER_JOURNEY:
                raise JourneyConflict("This journey has reached its character-memory limit.")
            now = self.clock()
            db.execute(self._sql(
                "INSERT INTO character_quest_events(journey,event_id,character_id,contract_id,event,step,"
                "total_steps,created_at) VALUES(?,?,?,?,?,?,?,?)"),
                (journey, request_id, character_id, contract_id, event, step, total, now))
            db.execute(self._sql(
                "INSERT INTO character_private_memories(journey,character_id,event_id,event_type,topic,created_at) "
                "VALUES(?,?,?,?,?,?)"),
                (journey, character_id, request_id, event_type, contract_id, now))
        return {"recorded": True, "status": status, "step": step, "contractId": contract_id}

    def request(self, data, token):
        if not isinstance(data, dict) or data.get("action") not in {
                "list", "create", "meet", "exchange", "contract", "portrait", "visitors"}:
            raise JourneyRequest("Invalid character registry request.")
        action = data["action"]
        expected = {"action", "journey", "location"}
        if action == "create":
            expected |= {"requestId"}
        elif action == "list" and "presence" in data:
            expected.add("presence")
        elif action in {"meet", "exchange", "portrait", "visitors"}:
            expected |= {"characterId"}
            if action == "visitors":
                expected |= {"cursor", "limit"}
            if action in {"meet", "exchange"}:
                expected.add("requestId")
            if action == "exchange":
                expected.add("topic")
        elif action == "contract":
            expected |= {"requestId", "characterId"}
            expected.add("contract")
        if set(data) != expected:
            raise JourneyRequest("Invalid character registry request fields.")
        if action == "contract":
            if not isinstance(data["requestId"], str) or not REQUEST_ID.fullmatch(data["requestId"]):
                raise JourneyRequest("Invalid character request id.")
            return self._contract(data, token)
        journey, genesis, region, location = self._authorized_location(data, token)
        self._backfill_encounters(journey, genesis)
        if action == "list":
            if "presence" in data:
                return self._encounter(journey, region, location, data["presence"])
            return self._list(journey, region, location)
        if action in {"portrait", "visitors"}:
            character_id = data["characterId"]
            if not isinstance(character_id, str) or not CHARACTER_ID.fullmatch(character_id):
                raise JourneyRequest("Invalid character identity.")
            if action == "portrait":
                return self._portrait_image(location, character_id)
            return self._visitor_page(journey, location, character_id, data["cursor"], data["limit"])
        if not isinstance(data["requestId"], str) or not REQUEST_ID.fullmatch(data["requestId"]):
            raise JourneyRequest("Invalid character request id.")
        if action == "create":
            return self._create(journey, region, location, data["requestId"])
        character_id = data["characterId"]
        if not isinstance(character_id, str) or not CHARACTER_ID.fullmatch(character_id):
            raise JourneyRequest("Invalid character identity.")
        if action == "meet":
            return self._record(journey, region, location, data["requestId"],
                                character_id, "met")
        topic = data["topic"]
        if not isinstance(topic, str) or topic not in TOPICS:
            raise JourneyRequest("Unknown character conversation topic.")
        return self._exchange(journey, location, data["requestId"], character_id, topic)
