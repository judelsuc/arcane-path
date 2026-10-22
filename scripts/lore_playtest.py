"""Isolated server-authoritative artifact world; no browser state checkpoints."""

from contextlib import contextmanager
from collections import deque
import hashlib
import hmac
import json
import logging
import math
import re
import secrets
import sqlite3
import subprocess
import time

from abandoned_journals import JournalForbidden, capability_hash
from journeys import JourneyRequest, JourneyConflict, JourneyCapacity

WORLD = "lore-playtest-v1"
ARTIFACTS = ("hermit", "chariot", "temperance", "fool", "wheel", "sun",
             "magician", "priestess", "empress", "emperor", "hierophant", "lovers", "justice",
             "strength", "hanged", "nameless", "devil", "tower", "star", "moon", "judgement", "world")
MAX_RECEIPTS = 100000
ACTION_FIELDS = {
    "walk": {"type", "dc", "dr"}, "rest": {"type"}, "sleep": {"type"},
    "meal": {"type"}, "parent-search": {"type"}, "inquire": {"type"}, "inquire-clue": {"type"},
    "claim": {"type", "id"}, "cache": {"type", "id"}, "share": {"type", "id"},
    "use": {"type", "id"}, "pack": {"type", "id", "x", "y", "rotated"},
    "abandon": {"type"},
    "interpret-clue": {"type", "evidence"},
    "work-start": {"type", "language"}, "work-move": {"type", "move"},
    "archive": {"type"}, "dismiss-compass": {"type"},
    "parent-inquiry": {"type"},
}


class LorePlaytest:
    def __init__(self, journeys, abandoned, clock=time.time, paths=None, chunk_jobs=None,
                 database="lore-playtest.sqlite3"):
        self.journeys, self.abandoned = journeys, abandoned
        self.clock = clock
        self.paths, self.chunk_jobs = paths, chunk_jobs
        self.path = journeys.path.parent / database
        with self.connect() as db:
            version = db.execute("PRAGMA user_version").fetchone()[0]
            if version not in (0, 1):
                raise ValueError("Unsupported lore playtest database version.")
            db.executescript("""
                CREATE TABLE IF NOT EXISTS world (
                    id TEXT PRIMARY KEY, region TEXT NOT NULL, payload TEXT NOT NULL,
                    checksum TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS sessions (
                    journey TEXT PRIMARY KEY, payload TEXT NOT NULL, checksum TEXT NOT NULL,
                    touched REAL NOT NULL);
                CREATE TABLE IF NOT EXISTS receipts (
                    journey TEXT NOT NULL, request TEXT NOT NULL, digest TEXT NOT NULL,
                    payload TEXT NOT NULL, PRIMARY KEY(journey,request));
                PRAGMA user_version=1;
            """)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=15)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    @staticmethod
    def encode(payload):
        raw = json.dumps(payload, separators=(",", ":"), allow_nan=False)
        return raw, hashlib.sha256(raw.encode()).hexdigest()

    @staticmethod
    def decode(row):
        if hashlib.sha256(row["payload"].encode()).hexdigest() != row["checksum"]:
            raise ValueError("Corrupt lore state; restore the playtest database from backup.")
        return json.loads(row["payload"])

    def authorize(self, journey, token):
        digest = capability_hash(token)
        if not isinstance(journey, str) or not re.fullmatch(r"[a-f0-9]{32}", journey):
            raise JourneyRequest("Invalid lore journey identity.")
        with self.abandoned.connect() as db:
            row = db.execute("SELECT digest FROM capabilities WHERE journey=?", (journey,)).fetchone()
        if not row or not hmac.compare_digest(row["digest"], digest):
            raise JournalForbidden("This private capability does not own the source journey.")
        record = self.journeys.read(journey)
        if not record:
            raise JournalForbidden("Unknown source journey.")
        return record

    @staticmethod
    def initial_world(base, origin):
        reachable = {(origin["col"], origin["row"])}
        queue = deque(reachable)
        while queue:
            col, row = queue.popleft()
            for dc, dr in ((0, 1), (1, 0), (0, -1), (-1, 0)):
                point = col + dc, row + dr
                if point in reachable or not (0 <= point[0] < base["width"] and 0 <= point[1] < base["height"]):
                    continue
                cell = base["rows"][point[1]][point[0]]
                if cell.get("unavailable") or cell["terrain"] == "water":
                    continue
                reachable.add(point)
                queue.append(point)
        candidates = []
        for row, cells in enumerate(base["rows"]):
            for col, cell in enumerate(cells):
                names = sorted(place["name"] for place in cell.get("settlements", [])
                               if isinstance(place.get("name"), str) and place["name"].strip())
                if (col, row) in reachable and cell.get("terrain") == "place" and names:
                    candidates.append((math.hypot(col - origin["col"], row - origin["row"]),
                                       col, row, names[0]))
        candidates.sort()
        if len(candidates) < 6:
            raise JourneyRequest("The loaded base needs six reachable real mapped settlements for this playtest.")
        instances = [
            {"id": artifact, "col": anchor[1], "row": anchor[2], "town": anchor[3],
             "marker": f"virtual:{artifact}", "owner": None, "placement": None,
             "generation": 1, "cooldownUntil": 0, "recallJourney": None}
            for artifact, anchor in zip(ARTIFACTS, (candidates[i % len(candidates)] for i in range(len(ARTIFACTS))))
        ]
        return {"map": base, "instances": instances, "minutes": 0}

    def worker(self, operation, world, journey, **values):
        body = {"operation": operation, "map": world["map"], "instances": world["instances"],
                "journey": journey, "worldMinutes": world["minutes"], "seed": secrets.token_hex(32),
                "nowMillis": self.clock() * 1000,
                **values}
        try:
            process = subprocess.run(
                ["node", str(self.journeys.chunks.root / "scripts/lore_worker.mjs")],
                input=json.dumps(body, allow_nan=False), text=True, capture_output=True,
                timeout=8, check=False, cwd=self.journeys.chunks.root)
        except FileNotFoundError as error:
            raise JourneyCapacity("Lore playtest requires Node.js on the game server.") from error
        except subprocess.TimeoutExpired as error:
            raise JourneyCapacity("Lore action timed out; retry the same request.") from error
        if process.returncode not in (0, 2):
            logging.error("Lore worker internal failure: %s", process.stderr.strip())
            raise ValueError(f"Lore worker failed (exit {process.returncode}).")
        result = json.loads(process.stdout)
        if process.returncode == 2:
            raise JourneyRequest(result["error"])
        return result

    def revalidate_journal_discovery(self, result):
        state = result["runtime"]["state"]
        unavailable = set()
        changed = False
        for entry in state["discovery"]["entries"]:
            if entry["targetType"] == "abandoned-journal":
                availability = self.abandoned.discovery_status(entry["targetId"], entry["targetRevision"],
                                                               state["serverJourney"]["id"])
                changed |= entry["availability"] != availability
                entry["availability"] = availability
                if availability != "current":
                    unavailable.add(json.dumps([entry[key] for key in
                        ("targetType", "targetId", "targetRevision", "evidenceKey", "precision")],
                        separators=(",", ":")))
        for episode in state["lore"].get("dreams", {}).get("episodes", []):
            if episode["outcome"] == "clue" and episode["clue"] in unavailable:
                episode["outcome"] = "unavailable"
                changed = True
        for receipt in state["lore"].get("moonReceipts", []):
            for clue in receipt["clues"]:
                if clue["evidence"] in unavailable and clue["availability"] == "current":
                    clue["availability"] = "historical"
                    changed = True
        return changed

    def prepare_chunks(self, world, region, points):
        base = world["map"]
        coordinates = sorted({(col // 8, row // 8) for col, row in points
                              if not (0 <= col < base["width"] and 0 <= row < base["height"])})
        if len(set(world["map"].get("loreChunks", {})) |
               {f"{x},{y}" for x, y in coordinates}) > 256:
            raise JourneyCapacity("The isolated world's 256-chunk terrain limit has been reached.")
        prepared, missing = {}, 0
        for x, y in coordinates:
            chunk = self.journeys.chunks.read(region, x, y)
            if chunk is None:
                missing += 1
                if self.chunk_jobs is None:
                    raise JourneyCapacity("The terrain preparation worker is unavailable.")
                status, payload = self.chunk_jobs.request(region, x, y)
                if status not in (200, 202, 429):
                    raise JourneyCapacity(payload.get("error", "Terrain preparation failed."))
            else:
                prepared[f"{x},{y}"] = chunk
        world["map"]["loreChunks"] = {**world["map"].get("loreChunks", {}), **prepared}
        return {"status": "loading" if missing else "ready", "missingChunks": missing}

    def journal_context(self, genesis, runtime, journey):
        state = runtime["state"]
        return {"col": state["col"], "row": state["row"],
                "rumours": self.abandoned.discovery_rumours(genesis, state["col"], state["row"]),
                "truths": self.abandoned.discovery_truths(journey, state["discovery"]["entries"], state["elapsedMinutes"])}

    @staticmethod
    def validate_action(action):
        if not isinstance(action, dict) or not isinstance(action.get("type"), str):
            raise JourneyRequest("Invalid lore command.")
        fields = ACTION_FIELDS.get(action["type"])
        if fields is None:
            raise JourneyRequest("Unknown lore command.")
        optional = {"id"} if action["type"] == "inquire" else {"target", "targets"} if action["type"] == "use" else set()
        if set(action) - optional != fields:
            raise JourneyRequest("Lore commands cannot supply positions, time or resource results.")
        if "id" in action and action["id"] not in ARTIFACTS:
            raise JourneyRequest("Unknown artifact.")
        if "target" in action:
            if action["id"] == "magician":
                if action["target"] not in ("harvest", "workshop", "sketch", "market", "bookshop",
                                             "deliveries", "petanque", "lanterns", "lost-found"):
                    raise JourneyRequest("Unknown earning activity.")
            elif action["id"] in ("fool", "world", "priestess"):
                if not isinstance(action["target"], str) or not action["target"] or len(action["target"]) > 3000:
                    raise JourneyRequest("Invalid visited settlement target.")
            elif action["id"] not in ("hermit", "wheel", "judgement") or action["target"] not in ARTIFACTS:
                raise JourneyRequest("Unknown artifact power target.")
        if "targets" in action and (action.get("id") != "hierophant" or
                not isinstance(action["targets"], list) or not 1 <= len(action["targets"]) <= 3 or
                any(not isinstance(value, str) or len(value) > 200 for value in action["targets"]) or
                len(set(action["targets"])) != len(action["targets"])):
            raise JourneyRequest("Choose one to three fragment identifiers.")
        if action["type"] == "work-start" and action["language"] not in ("fr", "en"):
            raise JourneyRequest("Invalid mini-game language.")
        if action["type"] == "work-move":
            move = action["move"]
            shapes = {"select": {"type", "bookId"}, "place": {"type", "shelf", "slot"},
                      "serve": {"type"}, "cancel": {"type"}}
            if not isinstance(move, dict) or not isinstance(move.get("type"), str) or set(move) != shapes.get(move["type"]):
                raise JourneyRequest("Invalid bookshop input.")
            if move["type"] == "select" and (not isinstance(move["bookId"], str) or
                    not re.fullmatch(r"book-([1-9]|1[0-6])", move["bookId"])):
                raise JourneyRequest("Invalid book identifier.")
            if move["type"] == "place" and any(type(move[key]) is not int or not 0 <= move[key] < 4
                                              for key in ("shelf", "slot")):
                raise JourneyRequest("Invalid shelf position.")
        if action["type"] == "interpret-clue" and (
                not isinstance(action["evidence"], str) or not action["evidence"] or
                len(action["evidence"]) > 3000):
            raise JourneyRequest("Invalid clue interpretation evidence.")
        if action["type"] == "walk" and (
                any(type(action[k]) is not int for k in ("dc", "dr"))
                or abs(action["dc"]) + abs(action["dr"]) != 1):
            raise JourneyRequest("Walk one orthogonal cell.")
        if action["type"] == "pack" and (
                any(type(action[k]) is not int or not 0 <= action[k] < 6 for k in ("x", "y"))
                or type(action["rotated"]) is not bool):
            raise JourneyRequest("Invalid bag placement.")

    def request(self, data, token):
        if not isinstance(data, dict) or data.get("operation") not in ("start", "sync", "action", "map", "route", "terrain"):
            raise JourneyRequest("Invalid lore playtest request.")
        operation, journey = data["operation"], data.get("journey")
        fields = {"operation", "journey"}
        if operation == "action":
            fields |= {"requestId", "expectedRevision", "action"}
        if operation == "route" and "retry" in data:
            fields.add("retry")
            if type(data["retry"]) is not bool:
                raise JourneyRequest("Invalid route retry choice.")
        if set(data) != fields:
            raise JourneyRequest("Invalid lore request fields.")
        genesis = self.authorize(journey, token)
        if operation == "action":
            if (not isinstance(data["requestId"], str)
                    or not re.fullmatch(r"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}", data["requestId"])
                    or type(data["expectedRevision"]) is not int or data["expectedRevision"] < 1):
                raise JourneyRequest("Invalid lore receipt or revision.")
            self.validate_action(data["action"])
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM world WHERE id=?", (WORLD,)).fetchone()
            if row is None:
                if operation != "start":
                    raise JourneyConflict("Start the artifact playtest first.")
                world = self.initial_world(self.journeys.chunks.bases[genesis["region"]], genesis["state"])
                raw, checksum = self.encode(world)
                db.execute("INSERT INTO world VALUES (?,?,?,?)", (WORLD, genesis["region"], raw, checksum))
            else:
                if row["region"] != genesis["region"]:
                    raise JourneyConflict(f"This test world uses region {row['region']}. Choose a journey from that region.")
                world = self.decode(row)
            # Extend the local test catalogue without resetting existing custody or journeys.
            missing = set(ARTIFACTS) - {item["id"] for item in world["instances"]}
            expanded = bool(missing)
            if missing:
                additions = self.initial_world(world["map"], genesis["state"])["instances"]
                world["instances"].extend(item for item in additions if item["id"] in missing)
            recovered = expanded
            for stale in db.execute("SELECT * FROM sessions WHERE touched<=?",
                                    (self.clock() - 30 * 86400,)).fetchall():
                owned = [item for item in world["instances"] if item["owner"] == stale["journey"]]
                if not owned:
                    continue
                saved = self.decode(stale)["state"]["lore"]["lastSettlement"]
                for item in owned:
                    item.update(owner=None, placement=None, col=saved["col"], row=saved["row"],
                                town=saved["town"], marker=f"cache:{item['id']}",
                                generation=item["generation"] + 1, recallJourney=stale["journey"])
                recovered = True
            if recovered:
                raw, checksum = self.encode(world)
                db.execute("UPDATE world SET payload=?,checksum=? WHERE id=?", (raw, checksum, WORLD))
            if operation == "map":
                return {"world": WORLD, "map": {key: value for key, value in world["map"].items()
                                               if key != "loreChunks"}}
            row = db.execute("SELECT * FROM sessions WHERE journey=?", (journey,)).fetchone()
            if row is None:
                if operation != "start":
                    raise JourneyConflict("Start the artifact playtest first.")
                result = self.worker("start", world, journey, genesis=genesis)
                runtime = result["runtime"]
                raw, checksum = self.encode(runtime)
                db.execute("INSERT INTO sessions VALUES (?,?,?,?)", (journey, raw, checksum, self.clock()))
                return result["view"]
            runtime = self.decode(row)
            runtime["worldMinutes"] = world["minutes"]
            if operation in ("route", "terrain"):
                state = runtime["state"]
                if state["ended"]:
                    raise JourneyRequest("This playtest journey has ended.")
                position = state["col"], state["row"]
                if operation == "route":
                    if not any(item["owner"] == journey and item["id"] in ("star", "lovers")
                               for item in world["instances"]):
                        raise JourneyRequest("Carry Star or Lovers before preparing its private magical route.")
                    if self.paths is None:
                        raise JourneyCapacity("The authoritative parent route adapter is unavailable.")
                    stage = state["trail"]["index"]
                    status, route_status = self.paths.request_lore(journey, stage, position, data.get("retry", False))
                    if status == 200:
                        route = self.paths.decode(self.paths.location(*self.paths.lore_key(journey, stage, position)))
                        route_status = self.prepare_chunks(world, genesis["region"], route["points"])
                    elif status == 429:
                        route_status = {"status": "busy", "error": route_status.get("error", "Route worker is busy.")}
                    elif status not in (202, 429):
                        route_status = {"status": "error", "error": route_status.get("error", "Route preparation failed.")}
                else:
                    landing_points = []
                    if any(item["owner"] == journey and item["id"] == "world" for item in world["instances"]):
                        known = {entry["facts"]["place"] for entry in state["discovery"]["entries"]
                                 if entry["targetType"] == "parent-trail" and entry["kind"] == "place"
                                 and "place" in entry["facts"]}
                        landing_points = [(stage["col"], stage["row"]) for stage in
                                          state["trail"]["stages"][:state["trail"]["index"] + 1]
                                          if stage["name"] in known]
                    route_status = self.prepare_chunks(world, genesis["region"], landing_points +
                        [(position[0] + dc * 8, position[1] + dr * 8)
                         for dc in (-1, 0, 1) for dr in (-1, 0, 1)
                         if abs((position[0] + dc * 8) // 8) <= 1000
                         and abs((position[1] + dr * 8) // 8) <= 1000])
                raw, checksum = self.encode(world)
                db.execute("UPDATE world SET payload=?,checksum=? WHERE id=?", (raw, checksum, WORLD))
                self.revalidate_journal_discovery({"runtime": runtime})
                return {**self.worker("view", world, journey, runtime=runtime,
                                      journalContext=self.journal_context(genesis, runtime, journey))["view"],
                        "routing": route_status}
            context = self.journal_context(genesis, runtime, journey)
            if operation != "action":
                result = {"runtime": runtime}
                self.revalidate_journal_discovery(result)
                return self.worker("view", world, journey, runtime=runtime, journalContext=context)["view"]
            digest = hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()
            receipt = db.execute("SELECT * FROM receipts WHERE journey=? AND request=?",
                                 (journey, data["requestId"])).fetchone()
            if receipt:
                if receipt["digest"] != digest:
                    raise JourneyConflict("That receipt belongs to a different lore command.")
                return json.loads(receipt["payload"])
            if runtime["revision"] != data["expectedRevision"]:
                raise JourneyConflict("The playtest changed in another tab. Refresh before acting.")
            if db.execute("SELECT count(*) FROM receipts").fetchone()[0] >= MAX_RECEIPTS:
                raise JourneyCapacity("Lore action storage is full; contact the administrator.")
            col, row = runtime["state"]["col"], runtime["state"]["row"]
            if data["action"]["type"] == "walk":
                col, row = col + data["action"]["dc"], row + data["action"]["dr"]
            context = {"col": col, "row": row,
                       "rumours": self.abandoned.discovery_rumours(genesis, col, row), "truths": context["truths"]}
            result = self.worker("action", world, journey, runtime=runtime, action=data["action"],
                                 journalContext=context)
            if self.revalidate_journal_discovery(result):
                result["view"] = self.worker("view", {**world, "instances": result["instances"]},
                                             journey, runtime=result["runtime"], journalContext=context)["view"]
            world["instances"], world["minutes"] = result["instances"], result["runtime"]["worldMinutes"]
            raw, checksum = self.encode(world)
            db.execute("UPDATE world SET payload=?,checksum=? WHERE id=?", (raw, checksum, WORLD))
            raw, checksum = self.encode(result["runtime"])
            db.execute("UPDATE sessions SET payload=?,checksum=?,touched=? WHERE journey=?",
                       (raw, checksum, self.clock(), journey))
            db.execute("INSERT INTO receipts VALUES (?,?,?,?)",
                       (journey, data["requestId"], digest, json.dumps(result["view"], allow_nan=False)))
            return result["view"]
