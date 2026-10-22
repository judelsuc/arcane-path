"""Private durable quests: bounded real POIs and verified game-route topology.

Discovery visits at most six towns (2-km OSM queries, 512 records, 2 MB each).
Game walking uses existing terrain plus at most eight chunk downloads. Transport
must come from JourneyTransport, including its explicitly fictional coaches.
This is not a real-world routing engine or proof of private player progress.
"""

from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import hashlib
import heapq
import json
import logging
import math
import re
import sqlite3
import threading
import time
import urllib.parse
import urllib.request

from journeys import JourneyRequest, JourneyConflict, JourneyCapacity
from local_towns import LocalTowns
from parent_paths import find_path, PathLimit
from quest_wording import template
from town_trail import distance, grid_position

VERSION = "quest-destinations-1"
SCOPES = {"local": (0, 15000), "regional": (15000, 100000),
          "far": (100000, 500000), "europe": (500000, 2500000)}
MAX_BYTES = 2_000_000
MAX_ELEMENTS = 512
MAX_TOWNS = 6
MAX_ROUTE_NODES = 64
MAX_CHUNKS = 16
MAX_DOWNLOADS = 8
MAX_SECONDS = 120
TTL = 30 * 86400

# Concrete categories only; proximity or a plausible name is never a category.
TAGS = {
    "hotel": ("tourism", {"hotel", "hostel", "guest_house"}),
    "drinking_water": ("amenity", {"drinking_water"}),
    "workshop": ("shop", {"bicycle", "car_repair"}),
    "hardware": ("shop", {"hardware", "doityourself"}),
    "market": ("amenity", {"marketplace"}),
    "townhall": ("amenity", {"townhall"}),
    "library": ("amenity", {"library"}),
    "post_office": ("amenity", {"post_office"}),
    "garden": ("leisure", {"garden"}),
    "park": ("leisure", {"park"}),
    "bakery": ("shop", {"bakery"}),
    "community_centre": ("amenity", {"community_centre"}),
    "church": ("amenity", {"place_of_worship"}),
    "station": ("railway", {"station", "halt"}),
    "cafe": ("amenity", {"cafe"}),
    "administrative": ("office", {"government"}),
    "tourism": ("tourism", {"information"}),
    "alpine_hut": ("tourism", {"alpine_hut"}),
    "viewpoint": ("tourism", {"viewpoint"}),
    "school": ("amenity", {"school"}),
    "cemetery": ("landuse", {"cemetery"}),
    "restaurant": ("amenity", {"restaurant"}),
    "shop": ("shop", {"convenience", "general", "supermarket", "rental", "bicycle", "outdoor", "sports"}),
    "museum": ("tourism", {"museum"}),
}
TOWN_GROUPS = {
    "chariot.checked-passage": (0, 1), "chariot.journey-stages": (0, 1, 2),
    "justice.common-measure": (0, 1, 1), "hermit.old-road-water": (0, 1, 1),
    "temperance.useful-surplus": (0, 1), "devil.independent-work": (0, 1, 1),
    "sun.celebration-photo": (0, 1), "sun.village-music": (0, 1),
    "world.travel-recipes": (0, 1, 2), "world.travelling-exhibition": (0, 1, 2),
}


def acquire(town):
    """One 2-km query, bounded timeout, count and response bytes; no arbitrary URL."""
    filters = sorted({f'["{key}"~"^({"|".join(sorted(values))})$"]'
                      for key, values in TAGS.values()})
    area = f'(around:2000,{town["latitude"]:.6f},{town["longitude"]:.6f})'
    query = "[out:json][timeout:20][maxsize:4000000];(" + "".join(
        f"nwr{area}{tags};" for tags in filters) + f");out center tags {MAX_ELEMENTS};"
    request = urllib.request.Request(
        "https://overpass-api.de/api/interpreter",
        data=urllib.parse.urlencode({"data": query}).encode("ascii"),
        headers={"User-Agent": "ArcanePath/0.3 (bounded quest POIs)", "Accept-Encoding": "identity"})
    with urllib.request.urlopen(request, timeout=25) as response:
        raw = response.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError("Quest OSM response exceeds its byte limit.")
    payload = json.loads(raw)
    if (not isinstance(payload, dict) or payload.get("remark") or
            not isinstance(payload.get("elements"), list) or len(payload["elements"]) > MAX_ELEMENTS):
        raise ValueError("Incomplete or invalid quest OSM response.")
    return payload["elements"]


def normalize(elements, town, base):
    if not isinstance(elements, list) or len(elements) > MAX_ELEMENTS:
        raise ValueError("Invalid bounded quest POI list.")
    result, seen = [], set()
    for element in elements:
        if not isinstance(element, dict):
            continue
        tags = element.get("tags")
        if not isinstance(tags, dict):
            continue
        kind_type, identity = element.get("type"), element.get("id")
        if kind_type not in {"node", "way", "relation"} or type(identity) is not int or identity <= 0:
            continue
        osm_id = f"osm:{kind_type}/{identity}"
        if osm_id in seen:
            continue
        seen.add(osm_id)
        if (tags.get("access") in {"private", "no", "customers", "permit"} or
                any(tags.get(key, "no") != "no" for key in ("disused", "abandoned", "demolished")) or
                tags.get("opening_hours") in {"closed", "off"}):
            continue
        point = element if kind_type == "node" else element.get("center", {})
        if not isinstance(point, dict):
            continue
        lat, lon = point.get("lat"), point.get("lon")
        if (any(type(v) not in (float, int) or not math.isfinite(v) for v in (lat, lon)) or
                not 34 <= lat <= 72 or not -32 <= lon <= 60):
            continue
        geo = {"latitude": lat, "longitude": lon}
        if distance(town, geo) > 2000:
            continue
        position = grid_position(base, lat, lon)
        if any(abs(v // 8) > 1000 for v in position.values()):
            continue
        name = tags.get("name") or tags.get("name:en") or tags.get("name:fr")
        if (not isinstance(name, str) or not name.strip() or len(name) > 200 or
                any(ord(c) < 32 or c in "<>" for c in name)):
            continue
        for kind, (key, values) in TAGS.items():
            if tags.get(key) not in values:
                continue
            if kind == "church" and (tags.get("religion") != "christian" or
                                     tags.get("building") not in {"church", "chapel", "cathedral"}):
                continue
            if kind == "drinking_water" and tags.get("drinking_water", "yes") != "yes":
                continue
            if kind == "tourism" and tags.get("information") != "office":
                continue
            if kind in {"museum", "school", "garden"} and tags.get("access") not in {"yes", "permissive", "designated"}:
                continue
            result.append({"id": osm_id, "name": name.strip(), **geo, **position,
                           "town": town["name"], "kind": kind,
                           "_rental": tags.get("shop") == "rental" or tags.get("rental") == "yes",
                           "_accessDocumented": tags.get("wheelchair") in {"yes", "limited"},
                           "sourceUrl": f"https://www.openstreetmap.org/{kind_type}/{identity}"})
    return sorted(result, key=lambda value: (value["kind"], value["id"]))


class QuestUnavailable(ValueError):
    pass


class QuestDestinations:
    def __init__(self, chunks, authorization, transport, *, fetcher=acquire, towns=None):
        self.chunks, self.authorization, self.transport = chunks, authorization, transport
        self.path = authorization.journeys.path.parent / "quest-destinations.sqlite3"
        self.fetcher, self.towns = fetcher, towns
        self.lock = threading.Lock()
        self.closed = False
        self.running = False
        self.future = None
        self.pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="quest-destinations")
        with self.connect() as db:
            if db.execute("PRAGMA user_version").fetchone()[0] not in (0, 1):
                raise ValueError("Unsupported quest destination database version.")
            db.executescript("""
                CREATE TABLE IF NOT EXISTS instances (
                    owner TEXT NOT NULL, nonce TEXT NOT NULL, request TEXT NOT NULL,
                    region TEXT NOT NULL, authored TEXT NOT NULL, status TEXT NOT NULL,
                    created REAL NOT NULL, output TEXT, PRIMARY KEY(owner,nonce)
                );
                CREATE TABLE IF NOT EXISTS pois (
                    town TEXT PRIMARY KEY, observed REAL NOT NULL, elements TEXT NOT NULL
                );
                PRAGMA user_version=1;
            """)
            db.execute("UPDATE instances SET status='queued' WHERE status='running'")
        self.path.chmod(0o600)
        self.kick()

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def request(self, data, token):
        expected = {"journey", "template", "origin", "scope", "nonce"}
        if isinstance(data, dict) and "keeper" in data:
            expected.add("keeper")
        if not isinstance(data, dict) or set(data) != expected:
            raise JourneyRequest("Invalid quest destination request fields.")
        owner, record = self.authorization.authorize(data, token)
        if (not isinstance(data["nonce"], str) or not re.fullmatch(r"[a-f0-9]{32}", data["nonce"]) or
                not isinstance(data["scope"], str) or data["scope"] not in SCOPES or
                not isinstance(data["origin"], dict) or set(data["origin"]) != {"col", "row"} or
                any(type(v) is not int or abs(v // 8) > 1000 for v in data["origin"].values())):
            raise JourneyRequest("Invalid bounded quest destination parameters.")
        canonical = json.dumps(data, sort_keys=True)
        with self.lock, self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM instances WHERE owner=? AND nonce=?",
                             (owner, data["nonce"])).fetchone()
            if row is not None and row["request"] != canonical:
                raise JourneyConflict("Quest nonce already belongs to another origin, template or scope.")
            if row is None:
                authored = template(data["template"])
                if self.closed:
                    raise JourneyCapacity("Quest discovery is shutting down.")
                if db.execute("SELECT COUNT(*) FROM instances WHERE status IN ('queued','running')").fetchone()[0] >= 16:
                    raise JourneyCapacity("Quest discovery queue is full.")
                if db.execute("SELECT COUNT(*) FROM instances WHERE owner=?", (owner,)).fetchone()[0] >= 1000:
                    raise JourneyCapacity("This journal has reached its quest discovery limit.")
                db.execute("INSERT INTO instances VALUES(?,?,?,?,?,'queued',?,NULL)",
                           (owner, data["nonce"], canonical, record["region"], json.dumps(authored), time.time()))
                row = db.execute("SELECT * FROM instances WHERE owner=? AND nonce=?",
                                 (owner, data["nonce"])).fetchone()
        self.kick()
        return json.loads(row["output"]) if row["output"] else {
            "status": row["status"], "nonce": data["nonce"], "retryAfter": 2}

    def kick(self):
        with self.lock:
            if not self.running and not self.closed:
                self.running = True
                self.future = self.pool.submit(self.drain)

    def drain(self):
        try:
            while True:
                with self.lock, self.connect() as db:
                    if self.closed:
                        return
                    db.execute("BEGIN IMMEDIATE")
                    row = db.execute("SELECT * FROM instances WHERE status='queued' ORDER BY created LIMIT 1").fetchone()
                    if row is None:
                        return
                    db.execute("UPDATE instances SET status='running' WHERE owner=? AND nonce=?",
                               (row["owner"], row["nonce"]))
                try:
                    result = self.build(json.loads(row["request"]), row["region"], json.loads(row["authored"]))
                except (QuestUnavailable, PathLimit) as error:
                    result = {"status": "unavailable", "reason": str(error)}
                except Exception:
                    logging.exception("Bounded quest destination discovery failed")
                    result = {"status": "failed", "error": "Quest discovery failed; no destination was invented."}
                with self.connect() as db:
                    db.execute("UPDATE instances SET status=?,output=? WHERE owner=? AND nonce=?",
                               (result["status"], json.dumps(result), row["owner"], row["nonce"]))
        finally:
            with self.lock:
                self.running = False
                # A request can enqueue between the empty read and this finally block.
                if not self.closed:
                    with self.connect() as db:
                        pending = db.execute("SELECT 1 FROM instances WHERE status='queued' LIMIT 1").fetchone()
                    if pending:
                        self.running = True
                        self.future = self.pool.submit(self.drain)

    def town_list(self, base):
        if self.towns is None:
            self.towns = LocalTowns()
        result = []
        for rows in self.towns.buckets.values():
            for identity, name, lat, lon, country, _ in rows:
                position = grid_position(base, lat, lon)
                if all(abs(v // 8) <= 1000 for v in position.values()):
                    result.append({"id": f"geoname:{identity}", "name": name, "latitude": lat,
                                   "longitude": lon, "country": country, **position})
        return result

    def pois(self, town, base):
        with self.connect() as db:
            row = db.execute("SELECT * FROM pois WHERE town=?", (town["id"],)).fetchone()
        if row is not None and 0 <= time.time() - row["observed"] < TTL:
            elements = json.loads(row["elements"])
        else:
            elements = self.fetcher(town)
            # Validate before persisting public provider data.
            normalize(elements, town, base)
            with self.connect() as db:
                db.execute("INSERT OR REPLACE INTO pois VALUES(?,?,?)",
                           (town["id"], time.time(), json.dumps(elements)))
        return normalize(elements, town, base)

    def build(self, request, region, authored):
        started = time.monotonic()
        base = self.chunks.bases[region]
        origin = request["origin"]
        projection = base.get("projectionLatitude",
                              (base["bounds"]["minLatitude"] + base["bounds"]["maxLatitude"]) / 2)
        step = base["cellSizeMeters"] / 6371008.8 * 180 / math.pi
        point = {"latitude": base["bounds"]["maxLatitude"] - (origin["row"] + .5) * step,
                 "longitude": base["bounds"]["minLongitude"] + (origin["col"] + .5) * step /
                 math.cos(math.radians(projection))}
        if not 34 <= point["latitude"] <= 72 or not -32 <= point["longitude"] <= 60:
            raise QuestUnavailable("Quest discovery currently supports European game coordinates only.")
        towns = self.town_list(base)
        lower, upper = SCOPES[request["scope"]]
        targets = [town for town in towns if lower <= distance(point, town) <= upper]
        targets.sort(key=lambda town: hashlib.sha256(
            (request["nonce"] + town["id"]).encode()).hexdigest())
        if request["scope"] == "local":
            targets.sort(key=lambda town: (distance(point, town), town["id"]))
        local = sorted((town for town in towns if distance(point, town) <= 10000),
                       key=lambda town: (distance(point, town), town["id"]))[:3]
        chunks, downloads = {}, [0]

        def check():
            if self.closed or time.monotonic() - started > MAX_SECONDS:
                raise QuestUnavailable("Quest route verification reached its time limit.")

        def cell(col, row):
            check()
            key = (col // 8, row // 8)
            if key not in chunks:
                if len(chunks) >= MAX_CHUNKS:
                    raise QuestUnavailable("Quest walking verification reached its chunk limit.")
                chunk = self.chunks.read(region, *key)
                if chunk is None:
                    if downloads[0] >= MAX_DOWNLOADS:
                        raise QuestUnavailable("Quest walking verification reached its download limit.")
                    downloads[0] += 1
                    chunk = self.chunks.build(region, *key)
                chunks[key] = chunk
            return chunks[key]["rows"][row % 8][col % 8]

        def walk(a, b):
            result = find_path((a["col"], a["row"]), (b["col"], b["row"]), cell,
                               check=check, corridors=(4, 8), max_expansions=2048)
            # find_path's zero-length shortcut does not itself check the endpoint.
            if cell(b["col"], b["row"]).get("unavailable"):
                raise QuestUnavailable("A quest endpoint is unavailable on the game grid.")
            return {"mode": "walk", **result}

        day = datetime.now(timezone.utc).date().isoformat()
        public_pois = {}
        groups = TOWN_GROUPS.get(authored["id"], (0,) * len(authored["roles"]))
        for anchor in targets[:3]:
            check()
            selected = [None] * len(authored["roles"])
            assigned, used_ids, used_cells = {}, set(), {(origin["col"], origin["row"])}
            for group in sorted(set(groups)):
                candidates = ([anchor] if group == 0 else sorted(
                    (town for town in targets if town["id"] not in {value["id"] for value in assigned.values()}
                     and all((town["col"], town["row"]) != (value["col"], value["row"])
                             for value in assigned.values())),
                    key=lambda town: (distance(anchor, town), town["id"]))[:3])
                for town in candidates:
                    check()
                    if town["id"] not in public_pois:
                        if len(public_pois) >= MAX_TOWNS:
                            break
                        public_pois[town["id"]] = self.pois(town, base)
                    trial, trial_ids, trial_cells = {}, set(used_ids), set(used_cells)
                    for index, role in enumerate(authored["roles"]):
                        if groups[index] != group:
                            continue
                        matches = [
                            poi for poi in public_pois[town["id"]]
                            if poi["kind"] == role["kind"] and poi["id"] not in trial_ids
                            and (poi["col"], poi["row"]) not in trial_cells
                            and (authored["id"] != "devil.unclear-contract" or role["kind"] != "shop" or poi["_rental"])
                            and (authored["id"] != "hanged.other-entrance" or role["kind"] != "museum" or poi["_accessDocumented"])]
                        matches.sort(key=lambda poi: hashlib.sha256((request["nonce"] + poi["id"]).encode()).hexdigest())
                        if not matches:
                            break
                        trial[index] = matches[0]
                        trial_ids.add(matches[0]["id"])
                        trial_cells.add((matches[0]["col"], matches[0]["row"]))
                    if len(trial) == groups.count(group):
                        for index, poi in trial.items():
                            selected[index] = poi
                        used_ids, used_cells = trial_ids, trial_cells
                        assigned[group] = town
                        break
                if group not in assigned:
                    break
            if any(poi is None for poi in selected):
                continue
            first_town = assigned[0]
            earliest = datetime.fromisoformat(day).replace(tzinfo=timezone.utc)
            legs = []

            def walking(a, b):
                nonlocal earliest
                leg = walk(a, b)
                earliest += timedelta(minutes=leg["walkingMinutes"])
                legs.append(leg)

            def riding(starts, destination):
                nonlocal earliest
                connections = self.connections(region, starts, destination, earliest.date().isoformat(), check)
                if connections is None:
                    return False
                _, rides = connections
                scheduled = self.schedule(region, rides, earliest, check)
                if scheduled is None:
                    return False
                legs.extend(scheduled)
                if scheduled:
                    earliest = datetime.fromisoformat(scheduled[-1]["arrival"])
                return True

            if request["scope"] == "local":
                walking(origin, selected[0])
            else:
                if not local:
                    continue
                # Check each potential boarding walk before using its actual timetable.
                boarding = local[0]
                walking(origin, boarding)
                if not riding([boarding], first_town):
                    continue
                walking(first_town, selected[0])
            complete = True
            for index in range(1, len(selected)):
                a, b = selected[index - 1:index + 1]
                source_town, target_town = assigned[groups[index - 1]], assigned[groups[index]]
                if source_town["id"] == target_town["id"]:
                    walking(a, b)
                else:
                    walking(a, source_town)
                    if not riding([source_town], target_town):
                        complete = False
                        break
                    walking(target_town, b)
            if not complete:
                continue
            meters = sum(leg.get("distanceMeters", 0) for leg in legs)
            destinations = [{key: value for key, value in poi.items() if not key.startswith("_")} for poi in selected]
            return {"status": "ready", "destinations": destinations, "distanceKm": round(meters / 1000, 3),
                    "route": {"version": VERSION, "verified": "game-route-topology", "legs": legs,
                              "serviceDate": day, "chunks": len(chunks), "downloads": downloads[0],
                              "scheduleVerified": True, "departureBasis": "planning-day-midnight-UTC",
                              "notice": "Verified traversable game-grid walking and connecting transport calls "
                              "after the initial walk from planning-day midnight UTC, "
                              "not a real-world road itinerary. Coaches are fictional game links. "
                              "Distance combines grid walking and transport estimates/lower bounds. "
                              "The player's current time, money, fatigue, access/opening hours and progress are not certified; "
                              "check current transport offers before booking."}}
        raise QuestUnavailable("No compatible real POIs with a verified supported game route in the bounded search.")

    def connections(self, region, starts, goal, day, check):
        queue, serial = [], 0
        for start in starts:
            heapq.heappush(queue, (distance(start, goal), serial, start, start, []))
            serial += 1
        seen = set()
        for _ in range(MAX_ROUTE_NODES):
            check()
            if not queue:
                return None
            _, _, current, first, legs = heapq.heappop(queue)
            key = (current["col"], current["row"])
            if key == (goal["col"], goal["row"]):
                return first, legs
            if key in seen or len(legs) >= 32:
                continue
            seen.add(key)
            payload = self.transport.lookup(region, *key, day)
            feeds = payload.get("realFeeds", []) + ([payload["fictionalFeed"]] if payload.get("fictionalFeed") else [])
            for feed in feeds:
                stops = {stop["id"]: stop for stop in feed["stops"]}
                emitted = set()
                for trip in feed["trips"]:
                    calls = trip["calls"]
                    for index, boarding in enumerate(calls[:-1]):
                        source = stops[boarding["stopId"]]
                        if (source["col"], source["row"]) != key or boarding.get("pickupType", 0) != 0:
                            continue
                        for arrival in calls[index + 1:]:
                            target = stops[arrival["stopId"]]
                            target_key = (target["col"], target["row"])
                            if target_key in seen or target_key in emitted or arrival.get("dropOffType", 0) != 0:
                                continue
                            emitted.add(target_key)
                            leg = {"mode": trip["mode"], "feedId": feed["id"], "tripId": trip["id"],
                                   "serviceKind": feed.get("kind"), "from": source, "to": target,
                                   "distanceMeters": trip.get("estimatedDistanceMeters", distance(source, target)),
                                   "distanceKind": "game-estimate" if "estimatedDistanceMeters" in trip else "geographic-lower-bound",
                                   "departure": boarding["departure"], "arrival": arrival["arrival"]}
                            heapq.heappush(queue, (distance(target, goal), serial, target, first, [*legs, leg]))
                            serial += 1
        return None

    def schedule(self, region, rides, earliest, check):
        """Resolve graph edges to actual connecting calls, including next-day coaches."""
        result = []
        for ride in rides:
            check()
            candidates = []
            for offset in (0, 1):
                day = (earliest + timedelta(days=offset)).date().isoformat()
                payload = self.transport.lookup(region, ride["from"]["col"], ride["from"]["row"], day)
                feeds = payload.get("realFeeds", []) + ([payload["fictionalFeed"]] if payload.get("fictionalFeed") else [])
                for feed in feeds:
                    stops = {stop["id"]: stop for stop in feed["stops"]}
                    for trip in feed["trips"]:
                        calls = trip["calls"]
                        for index, boarding in enumerate(calls[:-1]):
                            source = stops[boarding["stopId"]]
                            if (source["col"], source["row"]) != (ride["from"]["col"], ride["from"]["row"]) or boarding.get("pickupType", 0):
                                continue
                            departure = datetime.fromisoformat(boarding["departure"])
                            if departure < earliest:
                                continue
                            for arrival in calls[index + 1:]:
                                target = stops[arrival["stopId"]]
                                ends = datetime.fromisoformat(arrival["arrival"])
                                if ((target["col"], target["row"]) != (ride["to"]["col"], ride["to"]["row"]) or
                                        arrival.get("dropOffType", 0) or ends <= departure):
                                    continue
                                candidates.append((departure, ends, {**ride, "feedId": feed["id"],
                                    "tripId": trip["id"], "mode": trip["mode"], "serviceKind": feed.get("kind"),
                                    "from": source, "to": target, "departure": boarding["departure"],
                                    "arrival": arrival["arrival"],
                                    "distanceMeters": trip.get("estimatedDistanceMeters", distance(source, target)),
                                    "distanceKind": "game-estimate" if "estimatedDistanceMeters" in trip else "geographic-lower-bound"}))
                if candidates:
                    break
            if not candidates:
                return None
            _, earliest, leg = min(candidates, key=lambda value: (value[0], value[1], value[2]["tripId"]))
            result.append(leg)
        return result

    def close(self):
        with self.lock:
            self.closed = True
        self.pool.shutdown(wait=True)
