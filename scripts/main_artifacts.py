"""Artifact custody for the main journey; isolated playtest data is never imported."""

import hashlib
import json
import re
import time
import copy
import math
from contextlib import contextmanager

from journeys import JourneyRequest, JourneyConflict, JourneyCapacity
from lore_playtest import LorePlaytest, MAX_RECEIPTS
from journey_storage import StoreConnection

WORLD = "main-artifacts-v1"
COMMANDS = {"inquire", "claim", "cache", "share", "use", "pack", "interpret-clue", "archive"}


def geographic_position(base, col, row):
    step = base["cellSizeMeters"] / 6371008.8 * 180 / math.pi
    projection = base.get("projectionLatitude", (base["bounds"]["minLatitude"] + base["bounds"]["maxLatitude"]) / 2)
    return (base["bounds"]["maxLatitude"] - (row + 0.5) * step,
            base["bounds"]["minLongitude"] + (col + 0.5) * step / math.cos(math.radians(projection)))


def grid_position(base, latitude, longitude):
    step = base["cellSizeMeters"] / 6371008.8 * 180 / math.pi
    projection = base.get("projectionLatitude", (base["bounds"]["minLatitude"] + base["bounds"]["maxLatitude"]) / 2)
    return (math.floor((longitude - base["bounds"]["minLongitude"]) / (step / math.cos(math.radians(projection)))),
            math.floor((base["bounds"]["maxLatitude"] - latitude) / step))


class MainArtifacts(LorePlaytest):
    def __init__(self, journeys, abandoned, clock=time.time, **kwargs):
        self.assets = getattr(journeys, "assets", None)
        if self.assets is None:
            super().__init__(journeys, abandoned, clock=clock, database="main-artifacts.sqlite3", **kwargs)
        else:
            self.journeys, self.abandoned, self.clock = journeys, abandoned, clock
            self.paths = kwargs.pop("paths", None)
            self.chunk_jobs = kwargs.pop("chunk_jobs", None)
            if kwargs:
                raise TypeError("Unexpected main artifact options: " + ", ".join(kwargs))
            self.path = journeys.path.parent / "main-artifacts.sqlite3"
        self.world_table = "main_artifact_world" if self.assets is not None else "world"
        self.sessions_table = "main_artifact_sessions" if self.assets is not None else "sessions"
        self.receipts_table = "main_artifact_receipts" if self.assets is not None else "receipts"

    @contextmanager
    def connect(self):
        if self.assets is None:
            with super().connect() as db:
                yield db
        else:
            with self.assets.catalogue.connection() as db:
                yield StoreConnection(db, self.assets.catalogue, mapping=True)

    def request(self, data, token):
        if (not isinstance(data, dict) or set(data) != {"journey", "requestId", "state", "action"}
                or not isinstance(data["requestId"], str)
                or not re.fullmatch(r"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}", data["requestId"])
                or not isinstance(data["state"], dict)):
            raise JourneyRequest("Invalid main artifact request.")
        journey, action, snapshot = data["journey"], data["action"], data["state"]
        genesis = self.authorize(journey, token)
        prepare_route = action == {"type": "prepare-route"}
        if action is not None and not prepare_route:
            self.validate_action(action)
            if action["type"] not in COMMANDS:
                raise JourneyRequest("Use the main journey controls for ordinary travel.")
        if (not isinstance(snapshot.get("serverJourney"), dict)
                or snapshot["serverJourney"].get("id") != journey
                or type(snapshot.get("col")) is not int or type(snapshot.get("row")) is not int
                or max(abs(snapshot["col"]), abs(snapshot["row"])) > 8000):
            raise JourneyRequest("Invalid main artifact journey position.")
        if (not isinstance(snapshot.get("trail"), dict)
                or type(snapshot["trail"].get("index")) is not int
                or snapshot["trail"]["index"] < 0
                or type(snapshot.get("elapsedMinutes")) not in (int, float)
                or not math.isfinite(snapshot["elapsedMinutes"]) or snapshot["elapsedMinutes"] < 0
                or not isinstance(snapshot.get("discovery", {"entries": []}), dict)
                or "discovery" in snapshot and (
                    not isinstance(snapshot["discovery"].get("entries"), list)
                    or any(not isinstance(entry, dict) or not isinstance(entry.get("targetType"), str)
                           or not isinstance(entry.get("targetId"), str)
                           for entry in snapshot["discovery"]["entries"]))):
            raise JourneyRequest("Invalid main artifact investigation.")
        digest = hashlib.sha256(json.dumps(data, sort_keys=True, allow_nan=False).encode()).hexdigest()
        with self.connect() as db:
            if self.assets is None:
                db.execute("BEGIN IMMEDIATE")
            else:
                db.begin("main-artifacts")
            receipt = db.execute(f"SELECT * FROM {self.receipts_table} WHERE journey=? AND request=?",
                                 (journey, data["requestId"])).fetchone()
            if receipt:
                if receipt["digest"] != digest:
                    raise JourneyConflict("This receipt belongs to a different artifact request.")
                return json.loads(receipt["payload"])
            row = db.execute(f"SELECT * FROM {self.world_table} WHERE id=?", (WORLD,)).fetchone()
            if row is None:
                world = self.initial_world(self.journeys.chunks.bases[genesis["region"]], genesis["state"])
            else:
                world = self.decode(row)
            anchor_map = world["map"]
            for instance in world["instances"]:
                if "latitude" not in instance:
                    instance["latitude"], instance["longitude"] = geographic_position(
                        anchor_map, instance["col"], instance["row"])
            for stale in db.execute(f"SELECT * FROM {self.sessions_table} WHERE touched<=?",
                                    (self.clock() - 30 * 86400,)).fetchall():
                owned = [item for item in world["instances"] if item["owner"] == stale["journey"]]
                if not owned:
                    continue
                cache = self.decode(stale)["cacheLocation"]
                for instance in owned:
                    col, row_index = grid_position(anchor_map, cache["latitude"], cache["longitude"])
                    instance.update(owner=None, placement=None, col=col, row=row_index,
                                    latitude=cache["latitude"], longitude=cache["longitude"], town=cache["town"],
                                    marker=f"cache:{instance['id']}", generation=instance["generation"] + 1,
                                    recallJourney=stale["journey"])
            local = {"map": {**self.journeys.chunks.bases[genesis["region"]], "loreChunks": {}},
                     "instances": copy.deepcopy(world["instances"]), "minutes": world["minutes"]}
            for instance in local["instances"]:
                instance["col"], instance["row"] = grid_position(local["map"], instance["latitude"], instance["longitude"])
            original_positions = {item["id"]: (item["col"], item["row"]) for item in local["instances"]}
            runtime_row = db.execute(f"SELECT * FROM {self.sessions_table} WHERE journey=?", (journey,)).fetchone()
            runtime = self.decode(runtime_row) if runtime_row else None
            if prepare_route:
                if not runtime or not any(item["owner"] == journey and item["id"] in ("star", "lovers")
                                          for item in world["instances"]):
                    raise JourneyRequest("Carry Star or Lovers before preparing a magical route.")
                if self.paths is None:
                    raise JourneyCapacity("The route preparation worker is unavailable.")
                position, stage = (snapshot["col"], snapshot["row"]), snapshot.get("trail", {}).get("index")
                status, route = self.paths.request_lore(journey, stage, position)
                if status != 200:
                    if status in (202, 429):
                        raise JourneyCapacity("The magical route is being prepared; retry the same request.")
                    raise JourneyRequest(route.get("error", "The magical route is unavailable."))
                route = self.paths.decode(self.paths.location(*self.paths.lore_key(journey, stage, position)))
                route_terrain = self.prepare_chunks(local, genesis["region"], route["points"])
                if route_terrain["status"] != "ready":
                    raise JourneyCapacity("The magical route terrain is being prepared; retry the same request.")
            if "lore" in snapshot and not isinstance(snapshot["lore"], dict):
                raise JourneyRequest("Invalid main artifact progress.")
            visits = snapshot.get("lore", {}).get("visitedSettlements", [])
            if (not isinstance(visits, list) or len(visits) > 256 or
                    any(not isinstance(visit, dict) or type(visit.get("col")) is not int
                        or type(visit.get("row")) is not int for visit in visits)):
                raise JourneyRequest("Invalid personally visited settlements.")
            prepared = [(int(key.split(",")[0]) * 8, int(key.split(",")[1]) * 8)
                        for key in (runtime or {}).get("preparedChunks", [])]
            terrain = self.prepare_chunks(local, genesis["region"], [(snapshot["col"], snapshot["row"])] +
                                          [(visit["col"], visit["row"]) for visit in visits] + prepared)
            if terrain["status"] != "ready":
                raise JourneyCapacity("Artifact terrain is being prepared; retry the same request.")
            if db.execute(f"SELECT count(*) FROM {self.receipts_table}").fetchone()[0] >= MAX_RECEIPTS:
                raise JourneyCapacity("Artifact receipt capacity reached.")
            context = self.journal_context(genesis, {"state": snapshot}, journey) if snapshot.get("discovery") else None
            result = self.worker("main-artifacts", local, journey, genesis=genesis, runtime=runtime,
                                 snapshot=snapshot, action=None if prepare_route else action, journalContext=context)
            for instance in result["instances"]:
                moved = (instance["col"], instance["row"]) != original_positions[instance["id"]]
                recached = action is not None and action.get("type") == "cache" and action.get("id") == instance["id"]
                if moved or recached:
                    instance["latitude"], instance["longitude"] = geographic_position(
                        local["map"], instance["col"], instance["row"])
                instance["col"], instance["row"] = grid_position(anchor_map, instance["latitude"], instance["longitude"])
            world["instances"], world["minutes"] = result["instances"], result["runtime"]["worldMinutes"]
            result["runtime"]["preparedChunks"] = list(local["map"].get("loreChunks", {}))
            last = result["runtime"]["state"]["lore"]["lastSettlement"]
            latitude, longitude = geographic_position(local["map"], last["col"], last["row"])
            result["runtime"]["cacheLocation"] = {"latitude": latitude, "longitude": longitude, "town": last["town"]}
            raw, checksum = self.encode(world)
            db.execute(f"INSERT INTO {self.world_table}(id,region,payload,checksum) VALUES (?,?,?,?) "
                       "ON CONFLICT(id) DO UPDATE SET region=excluded.region,payload=excluded.payload,"
                       "checksum=excluded.checksum",
                       (WORLD, row["region"] if row is not None else genesis["region"], raw, checksum))
            raw, checksum = self.encode(result["runtime"])
            db.execute(f"INSERT INTO {self.sessions_table}(journey,payload,checksum,touched) VALUES (?,?,?,?) "
                       "ON CONFLICT(journey) DO UPDATE SET payload=excluded.payload,checksum=excluded.checksum,"
                       "touched=excluded.touched", (journey, raw, checksum, self.clock()))
            db.execute(f"INSERT INTO {self.receipts_table}(journey,request,digest,payload) VALUES (?,?,?,?)",
                       (journey, data["requestId"], digest, json.dumps(result["view"], allow_nan=False)))
            return result["view"]
