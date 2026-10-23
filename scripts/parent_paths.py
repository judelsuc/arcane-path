"""Bounded game-grid parent paths, persisted separately from immutable genesis."""

from concurrent.futures import ThreadPoolExecutor
import hashlib
import heapq
import json
import logging
import math
import re
import threading
import time
import xml.etree.ElementTree as ET
import unicodedata
import uuid

from asset_storage import AssetConflict, AssetError
from content_storage import clock
from local_towns import LocalTowns
from journeys import JourneyRequest
from town_trail import grid_position
from journey_storage import StoreConnection

VERSION = "grid-walk-v1"
GROUND_COST = {
    "plain": 1.1, "water": 1.5, "road": 1, "major_road": 1, "rail": 1.15,
    "cable": 1.3, "cable_station": 1.1, "mountain": 1.7, "hill": 1.35,
    "building": 1.1, "forest": 1.35, "grass": 1.15, "field": 1.25,
    "vineyard": 1.3, "park": 1.05, "church": 1.1, "station": 1.1, "place": 1.05,
}
CELL_METERS = 250
MAX_EXPANSIONS = 50_000
MAX_CHUNKS = 256
MAX_DOWNLOADS = 96
MAX_SECONDS = 180
CORRIDORS = (8, 16, 32)


class PathLimit(ValueError):
    pass


def walk_minutes(source, target):
    """Match travel.mjs at zero fatigue with the reference 4.5 km/h walker."""
    if source.get("unavailable") or target.get("unavailable"):
        return math.inf
    terrain = (GROUND_COST[source["terrain"]] + GROUND_COST[target["terrain"]]) / 2
    elevations = (source.get("elevationMeters"), target.get("elevationMeters"))
    known = all(type(v) in (int, float) and math.isfinite(v) for v in elevations)
    slope = max(-0.5, min(0.5, (elevations[1] - elevations[0]) / CELL_METERS)) if known else 0
    speed = max(0.5, min(6, 4.5 * math.exp(-3.5 * (abs(slope + 0.05) - 0.05)) / terrain))
    return CELL_METERS / 1000 / speed * 60


def in_corridor(point, start, goal, width):
    dx, dy = goal[0] - start[0], goal[1] - start[1]
    length = dx * dx + dy * dy
    fraction = max(0, min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / length)) if length else 0
    return ((point[0] - start[0] - fraction * dx) ** 2 +
            (point[1] - start[1] - fraction * dy) ** 2 <= width ** 2)


def find_path(start, goal, cell, progress=None, check=lambda: None,
              corridors=CORRIDORS, max_expansions=MAX_EXPANSIONS):
    if any(type(v) is not int or abs(v // 8) > 1000 for p in (start, goal) for v in p):
        raise ValueError("Parent path endpoints are outside supported game coordinates.")
    expanded = 0
    for width in corridors:
        if progress:
            progress(corridorCells=width, expanded=expanded)
        heuristic = lambda p: (abs(goal[0] - p[0]) + abs(goal[1] - p[1])) * 2.5
        queue = [(heuristic(start), 0, start)]
        scores, parents = {start: 0}, {}
        while queue:
            check()
            _, cost, current = heapq.heappop(queue)
            if cost != scores[current]:
                continue
            if current == goal:
                points = [goal]
                while points[-1] != start:
                    points.append(parents[points[-1]])
                points.reverse()
                heights = [cell(*p).get("elevationMeters") for p in points]
                return {"version": VERSION, "points": [list(p) for p in points],
                        "distanceMeters": (len(points) - 1) * CELL_METERS,
                        "walkingMinutes": cost, "elevationComplete": all(
                            type(h) in (float, int) and math.isfinite(h) for h in heights),
                        "expanded": expanded, "corridorCells": width}
            expanded += 1
            if expanded > max_expansions:
                raise PathLimit(f"Parent path search reached its {max_expansions}-cell work limit.")
            source = cell(*current)
            for dx, dy in ((1, 0), (0, 1), (-1, 0), (0, -1)):
                target = (current[0] + dx, current[1] + dy)
                if (abs(target[0] // 8) > 1000 or abs(target[1] // 8) > 1000
                        or not in_corridor(target, start, goal, width)):
                    continue
                candidate = cost + walk_minutes(source, cell(*target))
                if candidate < scores.get(target, math.inf):
                    scores[target], parents[target] = candidate, current
                    heapq.heappush(queue, (candidate + heuristic(target), candidate, target))
            if progress and expanded % 128 == 0:
                progress(expanded=expanded)
    raise PathLimit("No traversable game-grid path within the bounded search corridors.")


class ParentPaths:
    def __init__(self, chunks, journeys, write, pool=None):
        self.chunks, self.journeys, self.write = chunks, journeys, write
        self.cache = chunks.cache / "parent-paths"
        self.pool = pool or ThreadPoolExecutor(max_workers=1, thread_name_prefix="parent-path")
        self.lock = threading.Lock()
        self.jobs, self.progress, self.errors = {}, {}, {}
        self.towns = None
        self.assets = getattr(journeys, "assets", None)
        self.active_shared = None
        if self.assets is not None:
            self.wake_shared()

    def location(self, journey_id, stage):
        return self.cache / "journeys" / journey_id / f"{stage}.json"

    @staticmethod
    def decode(path):
        envelope = json.loads(path.read_text())
        data = envelope["data"]
        if hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest() != envelope["sha256"]:
            raise ValueError("Corrupt persisted parent path; restore its cache from backup.")
        if data["version"] != VERSION:
            raise ValueError("Unsupported persisted parent path version.")
        return data

    def save(self, path, data):
        self.write(path, json.dumps({"data": data, "sha256": hashlib.sha256(
            json.dumps(data, sort_keys=True).encode()).hexdigest()}).encode())

    @staticmethod
    def summary(data):
        return {key: data[key] for key in ("version", "distanceMeters", "walkingMinutes",
                "elevationComplete", "expanded", "corridorCells", "chunks", "downloads")}

    def recognition(self, record, stage, position, kind):
        if kind not in {"vague-prefix", "partial-prefix", "vague-photo", "partial-photo"} or position is None:
            raise ValueError("Invalid clue recognition request.")
        with self.lock:
            if self.towns is None:
                self.towns = LocalTowns()
        target = record["state"]["trail"]["stages"][stage]
        base = self.chunks.bases[record["region"]]
        prefix_length = min(max(1, len(target["name"]) // 2), 5 if kind.startswith("partial") else 2)
        normalize = lambda text: "".join(c for c in unicodedata.normalize("NFKD", text.casefold())
                                         if not unicodedata.combining(c))
        prefix = normalize(target["name"][:prefix_length])
        candidates = []
        for rows in self.towns.buckets.values():
            for row in rows:
                if kind.endswith("prefix") and not normalize(row[1]).startswith(prefix):
                    continue
                point = grid_position(base, row[2], row[3])
                player_distance = math.hypot(point["col"] - position[0], point["row"] - position[1])
                target_distance = math.hypot(point["col"] - target["col"], point["row"] - target["row"])
                candidates.append((player_distance if kind.endswith("prefix") else target_distance,
                                   row[0], {"name": row[1], "latitude": row[2], "longitude": row[3]}))
        candidates.sort(key=lambda c: c[:2])
        towns = [c[2] for c in candidates[:8]]
        return {"status": "recognition", "stage": stage, "col": position[0], "row": position[1],
                "kind": kind, "towns": towns, "sourceUrl": "https://www.geonames.org/"}

    def request(self, journey_id, stage, retry=False, position=None, recognize=None):
        if position is not None and (len(position) != 2 or any(
                type(v) is not int or abs(v // 8) > 1000 for v in position)):
            raise ValueError("Invalid clue search position.")
        record = self.journeys.read(journey_id)
        if record is None:
            return 404, {"error": "Server journey not found."}
        if hasattr(self.chunks, "require_origin"):
            self.chunks.require_origin(record["region"])
        if type(stage) is not int or not 0 <= stage < len(record["state"]["trail"]["stages"]):
            raise ValueError("Invalid parent path stage.")
        if recognize is not None:
            return 200, self.recognition(record, stage, position, recognize)
        key = (journey_id, stage)
        return self.request_record(key, record, retry, position)

    @staticmethod
    def lore_key(journey_id, stage, position):
        return f"lore-{journey_id}-{position[0]}-{position[1]}", stage

    def request_lore(self, journey_id, stage, position, retry=False):
        record = self.journeys.read(journey_id)
        if record is None:
            return 404, {"error": "Server journey not found."}
        if hasattr(self.chunks, "require_origin"):
            self.chunks.require_origin(record["region"])
        trail = record["state"]["trail"]
        if (type(stage) is not int or not 0 <= stage < len(trail["stages"]) or len(position) != 2 or
                any(type(value) is not int or abs(value // 8) > 1000 for value in position)):
            raise ValueError("Invalid authoritative lore route.")
        source = dict(trail["origin"] if stage == 0 else trail["stages"][stage - 1])
        source.update(col=position[0], row=position[1])
        if stage == 0:
            trail["origin"] = source
        else:
            trail["stages"][stage - 1] = source
        record["loreLandOnly"] = True
        return self.request_record(self.lore_key(journey_id, stage, position), record, retry)

    def request_record(self, key, record, retry=False, position=None):
        if self.assets is not None:
            return self.request_shared(key, record, retry, position)
        stage = key[1]
        with self.lock:
            for finished_key, job in list(self.jobs.items()):
                if not job.done():
                    continue
                del self.jobs[finished_key]
                self.progress.pop(finished_key, None)
                try:
                    job.result()
                except (OSError, ValueError, KeyError, ET.ParseError) as error:
                    logging.exception("Parent path failed for %s stage %s", *finished_key)
                    self.errors[finished_key] = str(error)
            path = self.location(*key)
            if path.exists():
                data = self.decode(path)
                proximity = {} if position is None else {"pathDistanceMeters": min(
                    math.hypot(position[0] - col, position[1] - row) * CELL_METERS
                    for col, row in data["points"]), "col": position[0], "row": position[1]}
                return 200, {"status": "ready", "stage": stage, **self.summary(data), **proximity}
            if key in self.errors:
                if not retry:
                    return 422, {"error": self.errors[key], "stage": stage}
                del self.errors[key]
            if key not in self.jobs:
                if len(self.jobs) >= 2:
                    return 429, {"error": "Parent path worker is busy; retry shortly."}
                self.progress[key] = {"expanded": 0, "chunks": 0, "downloads": 0}
                self.jobs[key] = self.pool.submit(self.build, key, record)
            return 202, {"status": "loading", "stage": stage, **self.progress[key]}

    @staticmethod
    def assignment_id(key):
        return hashlib.sha256(json.dumps([key[0], key[1]], separators=(",", ":")).encode()).hexdigest()

    def shared_connection(self):
        return self.assets.catalogue.connection()

    def request_shared(self, key, record, retry=False, position=None):
        stage = key[1]
        match = re.fullmatch(r"lore-([a-f0-9]{32})-(-?\d+)-(-?\d+)", key[0])
        journey = match[1] if match else key[0]
        if not re.fullmatch(r"[a-f0-9]{32}", journey):
            raise JourneyRequest("Invalid parent route assignment.")
        route_key = key[0]
        lore = match is not None
        if lore:
            start_col, start_row = int(match[2]), int(match[3])
        else:
            source = record["state"]["trail"]["origin"] if stage == 0 else record["state"]["trail"]["stages"][stage - 1]
            start_col, start_row = source["col"], source["row"]
        assignment = self.assignment_id(key)
        ready_row = None
        with self.lock, self.shared_connection() as raw:
            db = StoreConnection(raw, self.assets.catalogue, mapping=True)
            db.begin("parent-paths")
            now_sql = clock(self.assets.catalogue)
            db.execute(f"UPDATE parent_path_assignments SET status='failed',error=?,expires=NULL "
                       f"WHERE status='running' AND expires<=({now_sql}) AND attempts>=3",
                       ("Parent route retry limit reached.",))
            db.execute(f"UPDATE parent_path_assignments SET status='queued',token=NULL,expires=NULL "
                       f"WHERE status='running' AND expires<=({now_sql}) AND attempts<3")
            row = db.execute("SELECT * FROM parent_path_assignments WHERE assignment=?", (assignment,)).fetchone()
            if row is None:
                active = db.execute("SELECT COUNT(*) FROM parent_path_assignments "
                                    "WHERE status IN ('queued','running')").fetchone()[0]
                if active >= 2:
                    return 429, {"status": "busy", "error": "Parent path worker is busy; retry shortly."}
                db.execute("INSERT INTO parent_path_assignments(assignment,journey,route_key,stage,start_col,"
                           "start_row,land_only,status,created) VALUES(?,?,?,?,?,?,?,'queued',?)",
                           (assignment, journey, route_key, stage, start_col, start_row, int(lore), time.time()))
                row = db.execute("SELECT * FROM parent_path_assignments WHERE assignment=?",
                                 (assignment,)).fetchone()
            elif (row["journey"], row["route_key"], row["stage"], row["start_col"], row["start_row"],
                  row["land_only"]) != (journey, route_key, stage, start_col, start_row, int(lore)):
                raise AssetConflict("Parent path assignment already has different route parameters.")
            if row["status"] == "ready":
                ready_row = row
            elif row["status"] == "failed":
                if not retry:
                    return 422, {"error": row["error"], "stage": stage}
                if row["attempts"] >= 3:
                    return 422, {"error": "Parent route retry limit reached.", "stage": stage}
                db.execute("UPDATE parent_path_assignments SET status='queued',error=NULL "
                           "WHERE assignment=?", (assignment,))
            queued = db.execute("SELECT assignment,route_key,stage FROM parent_path_assignments "
                                "WHERE status='queued' ORDER BY created,assignment LIMIT 2").fetchall()
        for job in queued:
            self.schedule_shared(job["assignment"], (job["route_key"], job["stage"]))
        if ready_row:
            data = self.read_shared_route(ready_row)
            self.save(self.location(*key), data)
            proximity = {} if position is None else {"pathDistanceMeters": min(
                math.hypot(position[0] - col, position[1] - row_index) * CELL_METERS
                for col, row_index in data["points"]), "col": position[0], "row": position[1]}
            return 200, {"status": "ready", "stage": stage, **json.loads(ready_row["summary"]), **proximity}
        self.schedule_shared(assignment, key)
        return 202, {"status": "loading", "stage": stage,
                     "expanded": 0, "chunks": 0, "downloads": 0}

    def read_shared_route(self, row):
        record, raw = self.assets.read("parent-path", row["asset_request"])
        if record.sha256 != row["sha256"]:
            raise AssetError("Pinned parent route checksum does not match its manifest.")
        try:
            data = json.loads(raw)
            if (data["version"] != VERSION or not isinstance(data["points"], list) or
                    not data["points"] or any(not isinstance(point, list) or len(point) != 2 or
                    any(type(value) is not int for value in point) for point in data["points"]) or
                    hashlib.sha256(raw).hexdigest() != row["sha256"]):
                raise ValueError("Invalid pinned path envelope.")
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
            raise AssetError("Pinned parent route failed integrity validation.") from error
        return data

    def schedule_shared(self, assignment, key):
        with self.lock:
            if assignment in self.jobs and not self.jobs[assignment].done():
                return
            self.jobs[assignment] = self.pool.submit(self.build_shared, assignment, key)

    def wake_shared(self):
        with self.shared_connection() as raw:
            rows = raw.execute(self.assets.catalogue.sql(
                "SELECT assignment,route_key,stage FROM parent_path_assignments "
                "WHERE status='queued' ORDER BY created,assignment LIMIT 2")).fetchall()
        for assignment, route_key, stage in rows:
            self.schedule_shared(assignment, (route_key, stage))

    def claim_shared(self, assignment):
        with self.shared_connection() as raw:
            db = StoreConnection(raw, self.assets.catalogue, mapping=True)
            db.begin("parent-paths")
            now_sql = clock(self.assets.catalogue)
            db.execute(f"UPDATE parent_path_assignments SET status='failed',error=?,expires=NULL "
                       f"WHERE assignment=? AND status='running' AND expires<=({now_sql}) AND attempts>=3",
                       ("Parent route retry limit reached.", assignment))
            row = db.execute(f"SELECT * FROM parent_path_assignments WHERE assignment=? AND "
                             f"(status='queued' OR (status='running' AND expires<=({now_sql}) AND attempts<3))",
                             (assignment,)).fetchone()
            if row is None:
                return None
            token = uuid.uuid4().hex
            db.execute(f"UPDATE parent_path_assignments SET status='running',token=?,"
                       f"expires=({now_sql})+300,attempts=attempts+1 WHERE assignment=?",
                       (token, assignment))
            return {**row, "token": token, "attempts": row["attempts"] + 1}

    def renew_shared(self, assignment, token):
        now_sql = clock(self.assets.catalogue)
        with self.shared_connection() as raw:
            row = raw.execute(self.assets.catalogue.sql(
                f"UPDATE parent_path_assignments SET expires=({now_sql})+300 "
                f"WHERE assignment=? AND token=? AND status='running' AND expires>({now_sql}) RETURNING assignment"),
                (assignment, token)).fetchone()
        if row is None:
            raise AssetConflict("Parent route lease expired or ownership changed.")

    def finish_shared(self, assignment, token, route):
        raw = json.dumps(route, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
        request = hashlib.sha256(raw).hexdigest()
        asset = self.assets.publish(
            "parent-path", request, raw, media_type="application/json", retention="durable",
            provenance={"source": "Arcane Path terrain routing", "license": "internal",
                        "version": route["version"]})
        summary = self.summary(route)
        now_sql = clock(self.assets.catalogue)
        with self.shared_connection() as raw_db:
            row = raw_db.execute(self.assets.catalogue.sql(
                f"UPDATE parent_path_assignments SET status='ready',asset_request=?,sha256=?,summary=?,"
                f"error=NULL,expires=NULL WHERE assignment=? AND token=? AND status='running' "
                f"AND expires>({now_sql}) RETURNING assignment"),
                (request, asset.sha256, json.dumps(summary, sort_keys=True), assignment, token)).fetchone()
        if row is None:
            raise AssetConflict("Parent route lease expired; late result was not assigned.")

    def build_shared(self, assignment, key):
        claim = self.claim_shared(assignment)
        if claim is None:
            return
        try:
            record = self.journeys.read(claim["journey"])
            if record is None:
                raise ValueError("Server journey for pinned parent route is missing.")
            if hasattr(self.chunks, "require_origin"):
                self.chunks.require_origin(record["region"])
            if claim["land_only"]:
                trail = record["state"]["trail"]
                source = dict(trail["origin"] if claim["stage"] == 0 else trail["stages"][claim["stage"] - 1])
                source.update(col=claim["start_col"], row=claim["start_row"])
                if claim["stage"] == 0:
                    trail["origin"] = source
                else:
                    trail["stages"][claim["stage"] - 1] = source
                record["loreLandOnly"] = True
            with self.lock:
                self.progress[key] = {"expanded": 0, "chunks": 0, "downloads": 0}
                self.active_shared = (assignment, claim["token"])
            self.renew_shared(assignment, claim["token"])
            self.build(key, record)
            self.renew_shared(assignment, claim["token"])
            route = self.decode(self.location(*key))
            self.finish_shared(assignment, claim["token"], route)
        except Exception as error:
            logging.exception("Pinned parent route preparation failed for %s", assignment)
            now_sql = clock(self.assets.catalogue)
            with self.shared_connection() as raw:
                raw.execute(self.assets.catalogue.sql(
                    f"UPDATE parent_path_assignments SET status='failed',error=?,expires=NULL "
                    f"WHERE assignment=? AND token=? AND status='running' AND expires>({now_sql})"),
                    (str(error)[:1000], assignment, claim["token"]))
        finally:
            with self.lock:
                self.progress.pop(key, None)
                self.active_shared = None
                self.jobs.pop(assignment, None)

    def build(self, key, record):
        region = record["region"]
        trail = record["state"]["trail"]
        stage = key[1]
        source = trail["origin"] if stage == 0 else trail["stages"][stage - 1]
        target = trail["stages"][stage]
        start, goal = (source["col"], source["row"]), (target["col"], target["row"])
        land_only = record.get("loreLandOnly", False)
        identity = hashlib.sha256(json.dumps([VERSION, self.chunks.pipeline,
            self.chunks.fingerprints[region], region, start, goal] +
            (["land-only-v1"] if land_only else []), sort_keys=True).encode()).hexdigest()
        shared = self.cache / "routes" / f"{identity}.json"
        if shared.exists():
            data = self.decode(shared)
            self.save(self.location(*key), data)
            return data
        loaded, downloads = {}, 0
        started = time.monotonic()

        def check():
            if time.monotonic() - started >= MAX_SECONDS:
                raise PathLimit(f"Parent path preparation reached its {MAX_SECONDS}-second budget; cached terrain is kept.")

        def progress(**detail):
            with self.lock:
                self.progress[key].update(detail)

        def cell(col, row):
            nonlocal downloads
            check()
            base = self.chunks.bases[region] if land_only else None
            if land_only and 0 <= col < base["width"] and 0 <= row < base["height"]:
                result = base["rows"][row][col]
                return {**result, "unavailable": True} if result["terrain"] == "water" else result
            chunk = (col // 8, row // 8)
            if chunk not in loaded:
                if len(loaded) >= MAX_CHUNKS:
                    raise PathLimit(f"Parent path reached its {MAX_CHUNKS}-chunk memory limit.")
                if self.assets is not None and self.active_shared is not None:
                    self.renew_shared(*self.active_shared)
                data = self.chunks.read(region, *chunk)
                if data is None:
                    if downloads >= MAX_DOWNLOADS:
                        raise PathLimit(f"Parent path reached its {MAX_DOWNLOADS}-chunk preparation limit; cached terrain is kept.")
                    downloads += 1
                    progress(downloads=downloads)
                    data = self.chunks.build(region, *chunk)
                loaded[chunk] = data
                progress(chunks=len(loaded))
            result = loaded[chunk]["rows"][row % 8][col % 8]
            return {**result, "unavailable": True} if land_only and result["terrain"] == "water" else result

        data = find_path(start, goal, cell, progress=progress, check=check)
        data.update(chunks=len(loaded), downloads=downloads,
                    terrainSource={"region": region, "pipeline": self.chunks.pipeline,
                                   "mapSource": self.chunks.fingerprints[region],
                                   "cellSizeMeters": CELL_METERS})
        self.save(shared, data)
        self.save(self.location(*key), data)
        return data
