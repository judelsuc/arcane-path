"""Build long, sourced town-to-town trails without downloading regional geometry."""

import hashlib
import json
import math
import random
import threading
import time
import logging

from fetch_osm import fetch_towns, SourceUnavailable
from local_towns import LocalTowns

RADIUS = 6_371_008.8
MIN_METERS = 30_000
MAX_METERS = 60_000
STAGES = 10


def distance(a, b):
    lat1, lat2 = map(math.radians, (a["latitude"], b["latitude"]))
    dlat = lat2 - lat1
    dlon = math.radians(b["longitude"] - a["longitude"])
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return RADIUS * 2 * math.asin(math.sqrt(min(1, h)))


def grid_position(base, latitude, longitude):
    projection = base.get("projectionLatitude",
                          (base["bounds"]["minLatitude"] + base["bounds"]["maxLatitude"]) / 2)
    step = base["cellSizeMeters"] / RADIUS * 180 / math.pi
    return {
        "col": math.floor((longitude - base["bounds"]["minLongitude"])
                          / (step / math.cos(math.radians(projection)))),
        "row": math.floor((base["bounds"]["maxLatitude"] - latitude) / step),
    }


def starting_point(base):
    col, row = base["width"] // 2, base["height"] // 2
    projection = base.get("projectionLatitude",
                          (base["bounds"]["minLatitude"] + base["bounds"]["maxLatitude"]) / 2)
    step = base["cellSizeMeters"] / RADIUS * 180 / math.pi
    return {"col": col, "row": row,
            "latitude": base["bounds"]["maxLatitude"] - (row + 0.5) * step,
            "longitude": base["bounds"]["minLongitude"] +
            (col + 0.5) * step / math.cos(math.radians(projection))}


def build_town_trail(base, seed, catalogue, venues=None, on_progress=None, random_coordinates=False,
                     prefix=None, stage_count=STAGES):
    rng = random.Random(seed)
    origin = starting_point(base)
    stages = [dict(stage) for stage in prefix] if prefix else []
    current = stages[-1] if stages else origin
    visited = [origin, *stages]
    heading = rng.uniform(-math.pi, math.pi)
    for index in range(len(stages), stage_count):
        if on_progress:
            on_progress({"phase": "towns", "stage": index + 1})
        envelope = catalogue(current["latitude"], current["longitude"])
        if random_coordinates:
            angle = heading + rng.uniform(-math.pi / 3, math.pi / 3)
            arc = rng.uniform(MIN_METERS, MAX_METERS) / RADIUS
            latitude = math.radians(current["latitude"])
            target_lat = math.asin(math.sin(latitude) * math.cos(arc) +
                                   math.cos(latitude) * math.sin(arc) * math.sin(angle))
            target_lon = math.radians(current["longitude"]) + math.atan2(
                math.cos(angle) * math.sin(arc) * math.cos(latitude),
                math.cos(arc) - math.sin(latitude) * math.sin(target_lat))
            random_point = {"latitude": math.degrees(target_lat), "longitude": math.degrees(target_lon)}
        candidates = []
        for item in envelope["elements"]:
            tags = item.get("tags", {})
            latitude, longitude = item.get("lat"), item.get("lon")
            if (item.get("type") not in {"node", "geoname"} or not isinstance(item.get("id"), int)
                    or item["id"] <= 0 or tags.get("place") not in {"city", "town"}
                    or not isinstance(tags.get("name"), str) or not tags["name"].strip()
                    or any(isinstance(v, bool) or not isinstance(v, (float, int))
                           or not math.isfinite(v) for v in (latitude, longitude))
                    or not -85 <= latitude <= 85 or not -180 <= longitude <= 180):
                continue
            candidate = {"latitude": latitude, "longitude": longitude}
            meters = distance(current, candidate)
            if not MIN_METERS <= meters <= MAX_METERS:
                continue
            position = grid_position(base, latitude, longitude)
            if (abs(position["col"] // 8) > 1000 or abs(position["row"] // 8) > 1000
                    or any(distance(point, candidate) < 20_000 for point in visited)):
                continue
            identity = ({"geonameId": item["id"]} if item["type"] == "geoname"
                        else {"osmId": f'node/{item["id"]}'})
            if any(all(stage.get(k) == v for k, v in identity.items()) for stage in stages):
                continue
            angle = math.atan2(latitude - current["latitude"],
                               (longitude - current["longitude"]) *
                               math.cos(math.radians(current["latitude"])))
            turn = abs(math.atan2(math.sin(angle - heading), math.cos(angle - heading)))
            candidates.append((distance(random_point, candidate) if random_coordinates else turn,
                               abs(meters - 45_000), item["id"], {
                **candidate, **position, **identity, "name": tags["name"].strip(),
                "placeType": tags["place"], "legMeters": round(meters, 3),
                "sourceUrl": envelope["sourceUrl"], "retrievedAt": envelope["retrievedAt"],
                "witnessId": f"fictional-traveler-{index + 1}",
            }, angle))
        if not candidates:
            raise ValueError(
                f"No onward town 30–60 km away for stage {index + 1}/{stage_count}. "
                "Try another route or starting point; no short-distance substitute was generated.")
        candidates.sort(key=lambda candidate: candidate[:3])
        chosen = candidates[0] if random_coordinates else candidates[rng.randrange(min(3, len(candidates)))]
        current = chosen[3]
        if venues and index % 2 == 1:
            if on_progress:
                on_progress({"phase": "venues", "stage": index + 1})
            places = venues(current["latitude"], current["longitude"])
            for item in sorted(places["elements"], key=lambda p: p.get("id", 0)):
                tags = item.get("tags", {})
                if (item.get("type") == "node" and isinstance(item.get("id"), int)
                        and item["id"] > 0 and isinstance(tags.get("name"), str)
                        and tags["name"].strip() and tags.get("access") not in {"private", "no"}
                        and tags.get("disused", "no") == "no" and tags.get("abandoned", "no") == "no"
                        and tags.get("amenity") in {"library", "cafe", "restaurant", "theatre"}
                        and isinstance(item.get("lat"), (int, float))
                        and isinstance(item.get("lon"), (int, float))
                        and math.isfinite(item["lat"]) and math.isfinite(item["lon"])
                        and -85 <= item["lat"] <= 85 and -180 <= item["lon"] <= 180
                        and distance(current, {"latitude": item["lat"], "longitude": item["lon"]}) <= 2000):
                    current["venue"] = {"name": tags["name"].strip(), "osmId": f'node/{item["id"]}',
                                        "sourceUrl": places["sourceUrl"]}
                    break
        heading = chosen[4]
        stages.append(current)
        visited.append(current)
    return {"version": 2, "origin": origin, "parentName": rng.choice(["Camille", "Alex", "Sacha", "Noa"]),
            "stages": stages, "index": 0, "history": [], "completed": False}


class TownTrailStore:
    def __init__(self, chunks, write, offline=True):
        self.chunks = chunks
        self.write = write
        self.cache = chunks.cache / "towns"
        self.progress = {}
        self.lock = threading.Lock()
        self.offline = offline
        self.local = None

    def extend(self, region, seed, trail):
        if self.local is None:
            self.local = LocalTowns()
        extended = build_town_trail(
            self.chunks.bases[region], "continuation:" + seed, self.local.catalogue,
            random_coordinates=True, prefix=trail["stages"], stage_count=13)
        return {**trail, "stages": extended["stages"], "generation": {
            **trail.get("generation", {}), "townSearches": 13,
            "initialStages": 10, "continuationStages": 3,
        }}

    def get_progress(self, region, seed):
        with self.lock:
            return dict(self.progress.get((region, seed), {"phase": "queued"}))

    def catalogue(self, latitude, longitude, venues=False, on_progress=None):
        key = hashlib.sha256(f"v1:{venues}:{latitude:.6f},{longitude:.6f}".encode()).hexdigest()[:24]
        path = self.cache / f"{key}.json"
        if path.exists():
            if on_progress:
                on_progress({"phase": "cache"})
            return json.loads(path.read_text())
        for attempt in range(1, 4):
            try:
                data = fetch_towns(latitude, longitude, venues=venues, on_progress=on_progress)
                break
            except SourceUnavailable as error:
                if attempt == 3:
                    raise
                logging.warning("Town catalogue attempt %s/3 failed: %s", attempt, error)
                delay = error.retry_after
                if on_progress:
                    on_progress({"phase": "retry", "attempt": attempt + 1,
                                 "retryAt": time.time() + delay, "lastError": str(error)})
                time.sleep(delay)
        self.write(path, json.dumps(data).encode())
        return data

    def read(self, region, seed):
        return None

    def build(self, region, seed):
        key = (region, seed)
        def update(detail):
            with self.lock:
                previous = self.progress.get(key, {})
                self.progress[key] = {"stage": previous.get("stage", 1),
                                      "requests": previous.get("requests", 0) + (detail.get("phase") == "provider"),
                                      "cacheHits": previous.get("cacheHits", 0) + (detail.get("phase") == "cache"),
                                      **detail}
        try:
            if self.offline:
                update({"phase": "local"})
                with self.lock:
                    if self.local is None:
                        self.local = LocalTowns()
                route = build_town_trail(self.chunks.bases[region], seed, self.local.catalogue,
                                         on_progress=lambda detail: update({**detail, "phase": "local"}),
                                         random_coordinates=True)
                route["generation"] = {"algorithm": "random-coordinate-local-towns",
                                       "requests": 0, "townSearches": STAGES, "optionalVenues": "deferred"}
                return route
            return build_town_trail(self.chunks.bases[region], seed,
                                   lambda lat, lon: self.catalogue(lat, lon, on_progress=update),
                                   lambda lat, lon: self.catalogue(lat, lon, venues=True, on_progress=update),
                                   on_progress=update)
        finally:
            with self.lock:
                self.progress.pop(key, None)
