#!/usr/bin/env python3
"""Local travel prototype server with bounded, persistent OSM/elevation caching."""

import argparse
import gzip
import hashlib
import inspect
import json
import logging
import math
import os
import re
import sqlite3
import tempfile
import threading
import time
import uuid
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from build_map import rasterize
from shoreline import load_shoreline
from living_world import LivingWorld, query_position
from journey_transport import JourneyTransport
from fetch_osm import download_region, incomplete_landcover
from weather import fetch_climate
from config import load_config
from starting_places import PlaceLookup, coordinates
from town_trail import TownTrailStore
from journeys import JourneyStore, JourneyRequest, JourneyConflict, JourneyCapacity, JourneyGeneration
from journey_storage import StoreConnection
from abandoned_journals import AbandonedJournals, JournalForbidden, capability_hash
from parent_paths import ParentPaths
from accommodations import Accommodations
from journey_terrain import cached_terrain
from lore_playtest import LorePlaytest
from main_artifacts import MainArtifacts
from journal_art import JournalArt
from encounter_art import EncounterArt
from live_narrative import LiveNarrative
from start_art import StartArt
from asset_storage import AssetConflict, AssetError
from content_storage import clock
from quest_destinations import QuestDestinations

ROOT = Path(__file__).resolve().parents[1]
CHUNK_SIZE = 8
CELL_METERS = 250
LEGACY_CHUNK_PIPELINE = "7b8785f23301fe9ec1131aa44cb64d4f68781494db3dfb1aefefdc0520122fab"
COMPATIBLE_CHUNK_PIPELINE = "2f4ee763ae407722a3eaa363372b342e6a8aa5b9ec09cbf345ce069960f04df7"
RADIUS = 6_371_008.8
ELEVATION_URL = "https://api.open-meteo.com/v1/elevation"
ELEVATION_CREDIT = {
    "source": "Open-Meteo / Copernicus DEM GLO-90",
    "sourceUrl": "https://open-meteo.com/en/docs/elevation-api",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
}


def atomic_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(data)
        temporary.replace(path)
    finally:
        if temporary:
            temporary.unlink(missing_ok=True)


def chunk_geometry(base, x, y):
    latitude = base.get("projectionLatitude",
                        (base["bounds"]["minLatitude"] + base["bounds"]["maxLatitude"]) / 2)
    lat_step = CELL_METERS / RADIUS * 180 / math.pi
    lon_step = lat_step / math.cos(math.radians(latitude))
    west = base["bounds"]["minLongitude"] + x * CHUNK_SIZE * lon_step
    north = base["bounds"]["maxLatitude"] - y * CHUNK_SIZE * lat_step
    bounds = [west, north - CHUNK_SIZE * lat_step, west + CHUNK_SIZE * lon_step, north]
    if not (-180 <= bounds[0] < bounds[2] <= 180 and -85 <= bounds[1] < bounds[3] <= 85):
        raise ValueError("Travel chunk is outside supported geographic bounds.")
    centers = [
        (north - (row + 0.5) * lat_step, west + (col + 0.5) * lon_step)
        for row in range(CHUNK_SIZE) for col in range(CHUNK_SIZE)
    ]
    return bounds, latitude, centers


def fetch_elevations(centers):
    query = urllib.parse.urlencode({
        "latitude": ",".join(f"{lat:.7f}" for lat, _ in centers),
        "longitude": ",".join(f"{lon:.7f}" for _, lon in centers),
    })
    url = f"{ELEVATION_URL}?{query}"
    request = urllib.request.Request(url, headers={"User-Agent": "ArcanePath/0.2 (local travel prototype)"})
    with urllib.request.urlopen(request, timeout=25) as response:
        values = json.load(response).get("elevation")
    if (not isinstance(values, list) or len(values) != len(centers)
            or any(isinstance(value, bool) or not isinstance(value, (int, float))
                   or not math.isfinite(value) or not -500 <= value <= 9000 for value in values)):
        raise ValueError("Elevation service returned missing or invalid heights.")
    return {**ELEVATION_CREDIT, "sourceRequest": url, "values": values,
            "retrievedAt": datetime.now(timezone.utc).isoformat()}


class ChunkStore:
    def __init__(self, root=ROOT, cache=None):
        self.root = root
        self.cache = cache or root / ".cache" / "travel"
        self.regions = json.loads((root / "data/regions.json").read_text())["regions"]
        self.shoreline = load_shoreline(root / ".cache/shorelines/gshhs_f.b")
        self.pipeline = hashlib.sha256(
            b"chunk-pipeline-v2" +
            inspect.getsource(chunk_geometry).encode() +
            inspect.getsource(fetch_elevations).encode() +
            inspect.getsource(ChunkStore.source_path).encode() +
            inspect.getsource(ChunkStore.build_locked).encode() +
            inspect.getsource(ChunkStore.compute_chunk).encode() +
            (ROOT / "scripts/build_map.py").read_bytes() +
            (ROOT / "scripts/shoreline.py").read_bytes() +
            (self.shoreline.sha256.encode() if self.shoreline else b"no-ocean-mask") +
            json.dumps([CHUNK_SIZE, CELL_METERS, load_config()["map"]], sort_keys=True).encode()
        ).hexdigest()
        self.bases = {
            key: json.loads((root / region["map"]).read_text())
            for key, region in self.regions.items()
        }
        self.fingerprints = {
            key: hashlib.sha256((root / region["snapshot"]).read_bytes()).hexdigest()
            for key, region in self.regions.items()
        }
        self.origin_lock = threading.Lock()
        self.chunk_locks = [threading.Lock() for _ in range(32)]
        self.assets = None
        self.origin_sources = {}
        self.elevation_lock = threading.Lock()
        self.elevation_cooldown = self.cache / "elevation-cooldown.json"
        self.elevation_retry_at = (json.loads(self.elevation_cooldown.read_text())["retryAt"]
                                   if self.elevation_cooldown.exists() else 0)
        if (type(self.elevation_retry_at) not in (float, int) or
                not math.isfinite(self.elevation_retry_at) or self.elevation_retry_at < 0):
            raise ValueError("Invalid persisted elevation cooldown.")
        self.places = PlaceLookup()
        for path in (self.cache / "origins").glob("origin-*/map.json"):
            self.register_origin(path.parent.name, json.loads(path.read_text()), path.parent / "source.osm.gz")

    def register_origin(self, key, data, source, lease_token=None):
        source_bytes = source.read_bytes()
        fingerprint = hashlib.sha256(source_bytes).hexdigest()
        if self.assets is not None:
            if lease_token is None:
                raise AssetError("Publishing a shared custom origin requires its active lease.")
            source_request = f"{key}-{fingerprint[:16]}"
            source_record = self.assets.publish(
                "custom-origin-source", source_request, source_bytes,
                media_type="application/gzip", retention="durable",
                provenance={"source": "https://www.openstreetmap.org/copyright",
                            "license": "ODbL", "version": "osm-origin-v1"})
            payload = json.dumps(data, sort_keys=True, ensure_ascii=False, allow_nan=False)
            payload_hash = hashlib.sha256(payload.encode()).hexdigest()
            with self.assets.catalogue.connection() as db:
                db.execute(self.assets.catalogue.sql(
                    "INSERT INTO custom_origins(region,payload,payload_sha256,source_request,source_sha256,"
                    "source_size,created) VALUES(?,?,?,?,?,?,?) ON CONFLICT(region) DO NOTHING"),
                    (key, payload, payload_hash, source_request, source_record.sha256,
                     source_record.size, time.time()))
                row = db.execute(self.assets.catalogue.sql(
                    "SELECT payload,payload_sha256,source_request,source_sha256,source_size "
                    "FROM custom_origins WHERE region=?"),
                    (key,)).fetchone()
                lease = db.execute(self.assets.catalogue.sql(
                    "SELECT token FROM custom_origin_leases WHERE region=? AND token=? AND expires>(" +
                    clock(self.assets.catalogue) + ")" +
                    (" FOR UPDATE" if self.assets.catalogue.postgres else "")),
                    (key, lease_token)).fetchone()
                if lease is None:
                    raise AssetConflict("Custom origin preparation lease expired; result was not published.")
                if (row[1] != payload_hash or row[2] != source_request or
                        row[3] != source_record.sha256 or row[4] != source_record.size or row[0] != payload):
                    raise AssetError("Custom origin identity already has different map or source data.")
            self.origin_sources[key] = (source_request, source_record.sha256, source_record.size)
        self._install_origin(key, data, source, fingerprint)

    def _install_origin(self, key, data, source, fingerprint):
        self.bases[key] = data
        self.fingerprints[key] = fingerprint
        self.regions[key] = {"name": data["name"], "snapshot": str(source.resolve())}

    def set_shared_assets(self, assets):
        self.assets = assets
        local_origins = {key for key in self.bases if key.startswith("origin-")}
        self.load_shared_origins()
        missing = local_origins - self.origin_sources.keys()
        if missing:
            raise AssetError("Local custom origins are not in shared storage; publish them explicitly before enabling shared mode.")

    def load_shared_origins(self):
        if self.assets is None:
            return
        with self.assets.catalogue.connection() as db:
            rows = db.execute("SELECT region,payload,payload_sha256,source_request,source_sha256,source_size "
                              "FROM custom_origins ORDER BY region").fetchall()
        for row in rows:
            self._load_shared_origin(row)

    def load_origin(self, key):
        if key in self.bases:
            return True
        if self.assets is None or not isinstance(key, str) or not re.fullmatch(r"origin-[a-f0-9]{20}", key):
            return False
        with self.assets.catalogue.connection() as db:
            row = db.execute(self.assets.catalogue.sql(
                "SELECT region,payload,payload_sha256,source_request,source_sha256,source_size "
                "FROM custom_origins WHERE region=?"), (key,)).fetchone()
        if row is None:
            return False
        self._load_shared_origin(row)
        return True

    def require_origin(self, key):
        if self.load_origin(key):
            return
        if isinstance(key, str) and key.startswith("origin-"):
            raise AssetError("A journey references a custom origin missing from shared storage.")

    def _load_shared_origin(self, row):
        key, payload, payload_hash, source_request, source_hash, source_size = row
        if (not re.fullmatch(r"origin-[a-f0-9]{20}", key) or
                hashlib.sha256(payload.encode()).hexdigest() != payload_hash or
                not isinstance(source_request, str) or not source_request.startswith(key + "-") or
                not re.fullmatch(r"[a-f0-9]{64}", source_hash) or
                type(source_size) is not int or not 0 < source_size <= self.assets.max_bytes):
            raise AssetError("Shared custom origin metadata failed integrity validation.")
        try:
            data = json.loads(payload)
            if (data["width"] != 24 or data["height"] != 24 or len(data["rows"]) != 24 or
                    any(len(line) != 24 for line in data["rows"]) or
                    not isinstance(data["name"], str) or not isinstance(data["origin"], dict)):
                raise ValueError("Invalid custom origin map shape.")
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
            raise AssetError("Shared custom origin map failed validation.") from error
        source = self.cache / "origins" / key / "source.osm.gz"
        self.origin_sources[key] = (source_request, source_hash, source_size)
        self._install_origin(key, data, source, source_hash)

    def _claim_origin(self, key):
        token = uuid.uuid4().hex
        now = clock(self.assets.catalogue)
        query = (f"INSERT INTO custom_origin_leases(region,token,expires) VALUES(?,?,({now})+600) "
                 f"ON CONFLICT(region) DO UPDATE SET token=excluded.token,expires=excluded.expires "
                 f"WHERE custom_origin_leases.expires<=({now}) RETURNING token")
        with self.assets.catalogue.connection() as db:
            row = db.execute(self.assets.catalogue.sql(query), (key, token)).fetchone()
        return token if row else None

    def _release_origin(self, key, token):
        with self.assets.catalogue.connection() as db:
            db.execute(self.assets.catalogue.sql(
                "DELETE FROM custom_origin_leases WHERE region=? AND token=?"), (key, token))

    def prepare_origin(self, latitude, longitude, on_progress=None):
        latitude, longitude = coordinates(latitude, longitude)
        key = "origin-" + hashlib.sha256(f"{latitude:.6f},{longitude:.6f}".encode()).hexdigest()[:20]

        def progress(phase):
            if on_progress:
                on_progress({"phase": phase})

        token = None
        if self.assets is not None:
            progress("queued")
            deadline = time.monotonic() + 600
            while True:
                if self.load_origin(key):
                    progress("cache")
                    return {"region": key, "map": self.bases[key]}
                token = self._claim_origin(key)
                if token:
                    break
                if time.monotonic() >= deadline:
                    raise ValueError("Custom origin preparation is still active; retry shortly.")
                time.sleep(.25)
        try:
            return self._prepare_origin(latitude, longitude, key, progress, on_progress, token)
        finally:
            if token is not None:
                self._release_origin(key, token)

    def _prepare_origin(self, latitude, longitude, key, progress, on_progress, lease_token):
        progress("queued")
        with self.origin_lock:
            if key in self.bases:
                progress("cache")
                data = self.bases[key]
                expected = self.shoreline.sha256 if self.shoreline else None
                if ("buildingCoverageThresholdPercent" not in data
                        or (data.get("oceanCoverage") or {}).get("sha256") != expected):
                    if self.assets is not None:
                        raise AssetError("Shared custom origin map needs an explicit versioned rebuild.")
                    progress("rasterize")
                    directory = self.cache / "origins" / key
                    updated = rasterize(directory / "source.osm.gz", data["name"], CELL_METERS,
                                        shoreline=self.shoreline)
                    updated["rows"] = [row[:24] for row in updated["rows"][:24]]
                    updated["width"] = updated["height"] = 24
                    updated["origin"] = data["origin"]
                    if len(updated["rows"]) != 24 or any(len(row) != 24 for row in updated["rows"]):
                        raise ValueError("Unexpected cached starting map dimensions.")
                    atomic_write(directory / "map.json", json.dumps(updated).encode())
                    self.bases[key] = updated
                return {"region": key, "map": self.bases[key]}
            progress("location")
            place = self.places.reverse(latitude, longitude)
            lat_step = CELL_METERS / RADIUS * 180 / math.pi
            lon_step = lat_step / math.cos(math.radians(latitude))
            # Cell (12,12), the normal starting cell, is centred on the requested point.
            bounds = [longitude - 12.5 * lon_step, latitude - 11.5 * lat_step,
                      longitude + 11.5 * lon_step, latitude + 12.5 * lat_step]
            directory = self.cache / "origins" / key
            source = directory / "source.osm.gz"
            download_region(bounds, place["name"], source, on_progress=on_progress)
            progress("geometry")
            with gzip.open(source, "rb") as stream:
                root = ET.parse(stream).getroot()
            root.set("projection_latitude", str(latitude))
            atomic_write(source, gzip.compress(ET.tostring(root), mtime=0))
            progress("rasterize")
            data = rasterize(source, place["name"], CELL_METERS, shoreline=self.shoreline)
            data["rows"] = [row[:24] for row in data["rows"][:24]]
            if len(data["rows"]) != 24 or any(len(row) != 24 for row in data["rows"]):
                raise ValueError("Unexpected starting map dimensions.")
            data["width"] = data["height"] = 24
            data["origin"] = place
            progress("saving")
            atomic_write(directory / "map.json", json.dumps(data).encode())
            self.register_origin(key, data, source, lease_token=lease_token)
            return {"region": key, "map": data}

    def path(self, region, x, y):
        identity = hashlib.sha256(
            f"{self.pipeline}:{self.fingerprints[region]}:{CELL_METERS}:{CHUNK_SIZE}".encode()
        ).hexdigest()[:20]
        return self.cache / region / identity / f"{x}_{y}"

    def legacy_path(self, region, x, y):
        identity = hashlib.sha256(
            f"{LEGACY_CHUNK_PIPELINE}:{self.fingerprints[region]}:{CELL_METERS}:{CHUNK_SIZE}".encode()
        ).hexdigest()[:20]
        return self.cache / region / identity / f"{x}_{y}"

    def source_path(self, region, x, y):
        bounds, latitude, _ = chunk_geometry(self.bases[region], x, y)
        identity = hashlib.sha256(json.dumps({
            "snapshot": self.fingerprints[region], "bounds": bounds,
            "projectionLatitude": latitude, "cellSize": CELL_METERS,
        }, sort_keys=True).encode()).hexdigest()[:20]
        return self.cache / region / "sources" / identity / f"{x}_{y}"

    def chunk_id(self, region, x, y):
        return hashlib.sha256(
            f"{region}:{self.fingerprints[region]}:{self.pipeline}:{x}:{y}".encode()
        ).hexdigest()

    def shared_chunk_row(self, region, x, y):
        if self.assets is None:
            return None
        with self.assets.catalogue.connection() as raw:
            db = StoreConnection(raw, self.assets.catalogue, mapping=True)
            return db.execute(
                "SELECT * FROM travel_chunk_cache WHERE chunk_id=?",
                (self.chunk_id(region, x, y),)).fetchone()

    def read_shared_chunk(self, region, x, y):
        row = self.shared_chunk_row(region, x, y)
        if row is None or not row["asset_request"] or not row["sha256"]:
            return None
        path = self.path(region, x, y).with_suffix(".json")
        raw = path.read_bytes() if path.is_file() else None
        if raw is None or hashlib.sha256(raw).hexdigest() != row["sha256"]:
            record, raw = self.assets.read("travel-chunk", row["asset_request"])
            if record.sha256 != row["sha256"]:
                raise AssetError("Shared travel chunk checksum does not match its manifest.")
        try:
            envelope = json.loads(raw)
            data = envelope["data"]
            checksum = hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()
            chunk = data["chunk"]
            if (checksum != envelope["sha256"] or chunk != {
                    "region": region, "x": x, "y": y, "size": CHUNK_SIZE} or
                    data["width"] != CHUNK_SIZE or data["height"] != CHUNK_SIZE or
                    len(data["rows"]) != CHUNK_SIZE or
                    any(len(line) != CHUNK_SIZE for line in data["rows"])):
                raise ValueError("Invalid shared travel chunk shape or checksum.")
        except (KeyError, TypeError, ValueError, UnicodeDecodeError, json.JSONDecodeError) as error:
            raise AssetError("Shared travel chunk failed integrity validation.") from error
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != row["sha256"]:
            atomic_write(path, raw)
        if type(row["created"]) in (int, float) and math.isfinite(row["created"]) and row["created"] > 0:
            os.utime(path, (row["created"], row["created"]))
        return data

    def read(self, region, x, y):
        if self.assets is not None:
            shared = self.read_shared_chunk(region, x, y)
            if shared is not None:
                return shared
        path = self.path(region, x, y).with_suffix(".json")
        if not path.exists():
            legacy = self.legacy_path(region, x, y).with_suffix(".json")
            if self.pipeline != COMPATIBLE_CHUNK_PIPELINE or not legacy.exists():
                return None
            envelope = json.loads(legacy.read_text())
            payload = envelope["data"]
            checksum = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
            chunk = payload.get("chunk", {})
            if (checksum != envelope["sha256"] or chunk != {
                    "region": region, "x": x, "y": y, "size": CHUNK_SIZE} or
                    payload.get("width") != CHUNK_SIZE or payload.get("height") != CHUNK_SIZE or
                    len(payload.get("rows", [])) != CHUNK_SIZE or
                    any(len(line) != CHUNK_SIZE for line in payload["rows"])):
                raise ValueError("Legacy travel cache failed compatibility validation.")
            atomic_write(path, legacy.read_bytes())
            return payload
        envelope = json.loads(path.read_text())
        payload = envelope["data"]
        checksum = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
        if checksum != envelope["sha256"]:
            raise ValueError(f"Corrupt travel cache: {path}. Remove this chunk cache to rebuild.")
        return payload

    def claim_shared_chunk(self, region, x, y, refresh):
        chunk_id = self.chunk_id(region, x, y)
        token = uuid.uuid4().hex
        now_sql = clock(self.assets.catalogue)
        with self.assets.catalogue.connection() as raw:
            db = StoreConnection(raw, self.assets.catalogue, mapping=True)
            db.begin("travel-chunks")
            db.execute(f"UPDATE travel_chunk_cache SET status='failed',error=?,expires=NULL "
                       f"WHERE status='running' AND expires<=({now_sql}) AND attempts>=3",
                       ("Travel chunk retry limit reached.",))
            db.execute(f"UPDATE travel_chunk_cache SET status='queued',token=NULL,expires=NULL "
                       f"WHERE status='running' AND expires<=({now_sql}) AND attempts<3")
            db.execute("INSERT INTO travel_chunk_cache(chunk_id,region,pipeline,snapshot,x,y,status,created) "
                       "VALUES(?,?,?,?,?,?,'queued',?) ON CONFLICT(chunk_id) DO NOTHING",
                       (chunk_id, region, self.pipeline, self.fingerprints[region], x, y, time.time()))
            row = db.execute("SELECT * FROM travel_chunk_cache WHERE chunk_id=?",
                             (chunk_id,)).fetchone()
            if row["status"] == "ready" and not refresh:
                return "ready"
            if row["status"] == "ready":
                if row["attempts"] >= 3:
                    return "ready"
                db.execute("UPDATE travel_chunk_cache SET status='queued',token=NULL,expires=NULL "
                           "WHERE chunk_id=?", (chunk_id,))
            if row["status"] == "failed":
                if row["attempts"] >= 3:
                    if row["asset_request"]:
                        return "ready"
                    raise ValueError("Travel chunk retry limit reached; inspect server logs.")
                db.execute("UPDATE travel_chunk_cache SET status='queued',error=NULL "
                           "WHERE chunk_id=?", (chunk_id,))
            if row["status"] in {"queued", "running"} and row["asset_request"]:
                return "ready"
            active = db.execute(
                f"SELECT COUNT(*) FROM travel_chunk_cache WHERE status='running' AND expires>({now_sql})"
            ).fetchone()[0]
            queued = db.execute(
                "SELECT chunk_id FROM travel_chunk_cache WHERE status='queued' "
                "ORDER BY created,chunk_id LIMIT 2").fetchall()
            if active >= 2 or not queued or queued[0]["chunk_id"] != chunk_id:
                return None
            db.execute(f"UPDATE travel_chunk_cache SET status='running',token=?,"
                       f"expires=({now_sql})+900,attempts=attempts+1,error=NULL "
                       "WHERE chunk_id=? AND status='queued'", (token, chunk_id))
            return token

    def publish_shared_chunk(self, region, x, y, token, data):
        payload = json.dumps(data, sort_keys=True).encode()
        checksum = hashlib.sha256(payload).hexdigest()
        raw = json.dumps({"data": data, "sha256": checksum}, sort_keys=True).encode()
        request = hashlib.sha256(raw).hexdigest()
        asset = self.assets.publish(
            "travel-chunk", request, raw, media_type="application/json", retention="cache",
            provenance={"source": "OpenStreetMap and Open-Meteo elevation service",
                        "license": "ODbL and CC BY 4.0", "version": self.pipeline})
        now_sql = clock(self.assets.catalogue)
        with self.assets.catalogue.connection() as db:
            row = db.execute(self.assets.catalogue.sql(
                f"UPDATE travel_chunk_cache SET status='ready',asset_request=?,sha256=?,error=NULL,created=?,"
                f"expires=NULL WHERE chunk_id=? AND token=? AND status='running' "
                f"AND expires>({now_sql}) RETURNING chunk_id"),
                (request, asset.sha256, time.time(), self.chunk_id(region, x, y), token)).fetchone()
        if row is None:
            raise AssetConflict("Travel chunk lease expired or ownership changed.")
        return data

    def fail_shared_chunk(self, region, x, y, token, error):
        with self.assets.catalogue.connection() as db:
            db.execute(self.assets.catalogue.sql(
                "UPDATE travel_chunk_cache SET status='failed',error=?,expires=NULL "
                "WHERE chunk_id=? AND token=? AND status='running'"),
                (str(error)[:1000], self.chunk_id(region, x, y), token))

    def elevation_cooldown_until(self):
        retry_at = self.elevation_retry_at
        if self.assets is not None:
            with self.assets.catalogue.connection() as db:
                row = db.execute(self.assets.catalogue.sql(
                    "SELECT retry_at FROM travel_provider_cooldowns WHERE provider=?"),
                    ("elevation",)).fetchone()
            if row is not None:
                retry_at = max(retry_at, row[0])
        return retry_at

    def set_elevation_cooldown(self, retry_at):
        self.elevation_retry_at = max(self.elevation_retry_at, retry_at)
        atomic_write(self.elevation_cooldown, json.dumps(
            {"retryAt": self.elevation_retry_at}).encode())
        if self.assets is not None:
            combine = "GREATEST" if self.assets.catalogue.postgres else "MAX"
            with self.assets.catalogue.connection() as db:
                db.execute(self.assets.catalogue.sql(
                    "INSERT INTO travel_provider_cooldowns(provider,retry_at) VALUES(?,?) "
                    f"ON CONFLICT(provider) DO UPDATE SET retry_at={combine}("
                    "travel_provider_cooldowns.retry_at,excluded.retry_at)"),
                    ("elevation", self.elevation_retry_at))

    def refresh_due(self, region, x, y, data):
        return bool(data.get("elevation", {}).get("error") and
                    time.time() >= self.elevation_cooldown_until() and
                    time.time() - self.path(region, x, y).with_suffix(".json").stat().st_mtime >= 300)

    def build(self, region, x, y):
        with self.chunk_locks[hash((region, x, y)) % len(self.chunk_locks)]:
            return self.build_locked(region, x, y)

    def build_locked(self, region, x, y):
        cached = self.read(region, x, y)
        refresh = cached is not None and self.refresh_due(region, x, y, cached)
        if self.assets is None:
            if cached is not None and not refresh:
                return cached
            if cached is not None:
                return self.enrich_elevation(region, x, y, cached)
            return self.compute_chunk(region, x, y)
        deadline = time.monotonic() + 900
        token = None
        while token is None:
            claim = self.claim_shared_chunk(region, x, y, refresh)
            if claim == "ready":
                shared = self.read_shared_chunk(region, x, y)
                if shared is not None:
                    return shared
                raise AssetError("Shared travel chunk manifest disappeared during retrieval.")
            if claim:
                token = claim
                break
            if time.monotonic() >= deadline:
                raise ValueError("Shared travel chunk queue is busy; retry shortly.")
            time.sleep(.25)
        try:
            if cached is not None and not refresh:
                data = cached
            elif cached is not None:
                data = self.enrich_elevation(region, x, y, cached)
            else:
                data = self.compute_chunk(region, x, y)
            return self.publish_shared_chunk(region, x, y, token, data)
        except Exception as error:
            self.fail_shared_chunk(region, x, y, token, error)
            raise

    def compute_chunk(self, region, x, y):
        bounds, latitude, centers = chunk_geometry(self.bases[region], x, y)
        source_base = self.source_path(region, x, y)
        source = source_base.with_suffix(".osm.gz")
        if region in self.origin_sources:
            self.restore_origin_source(region, Path(self.regions[region]["snapshot"]))
        base = self.bases[region]["bounds"]
        inside_base = (base["minLongitude"] <= bounds[0] and base["minLatitude"] <= bounds[1]
                       and bounds[2] <= base["maxLongitude"] and bounds[3] <= base["maxLatitude"])
        if not source.exists():
            if inside_base:
                with gzip.open(self.root / self.regions[region]["snapshot"], "rb") as stream:
                    root = ET.parse(stream).getroot()
                b = root.find("bounds")
                b.attrib.update(dict(zip(("minlon", "minlat", "maxlon", "maxlat"), map(str, bounds))))
                atomic_write(source, gzip.compress(ET.tostring(root), mtime=0))
            else:
                download_region(bounds, self.regions[region]["name"], source)
        with gzip.open(source, "rb") as stream:
            root = ET.parse(stream).getroot()
        # Prepared starting snapshots remain usable offline.
        if not inside_base and incomplete_landcover(root):
            logging.warning("Refreshing incomplete land-cover source for %s chunk %s,%s", region, x, y)
            download_region(bounds, self.regions[region]["name"], source, refresh=True)
            with gzip.open(source, "rb") as stream:
                root = ET.parse(stream).getroot()
        if root.attrib.get("projection_latitude") != str(latitude) or "reference_bbox" in root.attrib:
            root.set("projection_latitude", str(latitude))
            root.attrib.pop("reference_bbox", None)
            atomic_write(source, gzip.compress(ET.tostring(root), mtime=0))
        data = rasterize(source, self.regions[region]["name"], CELL_METERS, shoreline=self.shoreline)
        data["rows"] = [row[:CHUNK_SIZE] for row in data["rows"][:CHUNK_SIZE]]
        if len(data["rows"]) != CHUNK_SIZE or any(len(row) != CHUNK_SIZE for row in data["rows"]):
            raise ValueError("Unexpected travel chunk dimensions.")
        data["width"] = data["height"] = CHUNK_SIZE
        data["chunk"] = {"region": region, "x": x, "y": y, "size": CHUNK_SIZE}
        return self.enrich_elevation(region, x, y, data)

    def restore_origin_source(self, region, path):
        source_request, expected_hash, expected_size = self.origin_sources[region]
        if path.is_file():
            cached = path.read_bytes()
            if len(cached) == expected_size and hashlib.sha256(cached).hexdigest() == expected_hash:
                return
        record, source = self.assets.read("custom-origin-source", source_request)
        if record.sha256 != expected_hash or record.size != expected_size:
            raise AssetError("Custom origin source does not match its shared manifest.")
        atomic_write(path, source)

    def enrich_elevation(self, region, x, y, data):
        _, _, centers = chunk_geometry(self.bases[region], x, y)
        path = self.path(region, x, y)
        source_base = self.source_path(region, x, y)
        elevation_path = source_base.with_suffix(".elevation.json")
        try:
            if elevation_path.exists():
                elevation = json.loads(elevation_path.read_text())
                values = elevation["values"]
                if (len(values) != len(centers) or any(
                        isinstance(v, bool) or not isinstance(v, (int, float))
                        or not math.isfinite(v) or not -500 <= v <= 9000 for v in values)):
                    raise ValueError("Invalid cached elevation.")
            else:
                with self.elevation_lock:
                    if time.time() < self.elevation_cooldown_until():
                        raise ValueError("Elevation unavailable: provider cooldown after HTTP 429.")
                    try:
                        elevation = fetch_elevations(centers)
                    except urllib.error.HTTPError as error:
                        if error.code == 429:
                            delay = (error.headers.get("Retry-After", "") if error.headers else "")
                            seconds = 3600
                            if delay:
                                try:
                                    seconds = (int(delay) if delay.isdigit() and len(delay) <= 7
                                               else parsedate_to_datetime(delay).timestamp() - time.time())
                                except (ValueError, TypeError, OverflowError):
                                    logging.warning("Invalid elevation Retry-After header; using one-hour cooldown.")
                            self.set_elevation_cooldown(time.time() + max(3600, seconds))
                        raise
                atomic_write(elevation_path, json.dumps(elevation).encode())
            data["elevation"] = {k: v for k, v in elevation.items() if k != "values"}
            for cell, value in zip((cell for row in data["rows"] for cell in row), elevation["values"]):
                cell["elevationMeters"] = value
        except (OSError, ValueError, KeyError, urllib.error.URLError) as error:
            logging.warning("Elevation unavailable for %s/%s/%s: %s", region, x, y, error)
            data["elevation"] = {"error": str(error)}
        atomic_write(path.with_suffix(".json"), json.dumps({
            "sha256": hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest(),
            "data": data,
        }).encode())
        return data


class ChunkJobs:
    def __init__(self, store, workers=2, capacity=10, pool=None):
        self.store = store
        self.pool = pool or ThreadPoolExecutor(max_workers=workers)
        self.capacity = capacity
        self.lock = threading.Lock()
        self.jobs = {}

    def request(self, *key):
        with self.lock:
            job = self.jobs.get(key)
            if job:
                if not job.done():
                    cached = self.store.read(*key)
                    if cached is not None:
                        return 200, cached
                    progress = getattr(self.store, "get_progress", None)
                    return 202, {"status": "loading", **({"progress": progress(*key)} if progress else {})}
                del self.jobs[key]
                try:
                    return 200, job.result()
                except (OSError, ValueError, KeyError, ET.ParseError, urllib.error.URLError) as error:
                    logging.exception("Chunk preparation failed: %s", key)
                    return 502, {"error": str(error)}
            cached = self.store.read(*key)
            if cached is not None:
                refresh_due = getattr(self.store, "refresh_due", None)
                if refresh_due and refresh_due(*key, cached) and len(self.jobs) < self.capacity:
                    self.jobs[key] = self.pool.submit(self.store.build, *key)
                return 200, cached
            if len(self.jobs) >= self.capacity:
                # Completed jobs need not occupy download slots indefinitely.
                for old_key, old_job in list(self.jobs.items()):
                    if old_job.done():
                        del self.jobs[old_key]
            if len(self.jobs) >= self.capacity:
                return 429, {"error": "Travel download queue is full. Retry shortly."}
            self.jobs[key] = self.pool.submit(self.store.build, *key)
            return 202, {"status": "loading"}


class OriginStore:
    def __init__(self, chunks):
        self.chunks = chunks
        self.lock = threading.Lock()
        self.progress = {}

    def get_progress(self, latitude, longitude):
        with self.lock:
            return dict(self.progress.get((latitude, longitude), {"phase": "queued", "requests": 0}))

    def read(self, latitude, longitude):
        latitude, longitude = coordinates(latitude, longitude)
        key = "origin-" + hashlib.sha256(f"{latitude:.6f},{longitude:.6f}".encode()).hexdigest()[:20]
        if self.chunks.assets is not None and self.chunks.load_origin(key):
            return {"region": key, "map": self.chunks.bases[key]}
        return None

    def build(self, latitude, longitude):
        key = (latitude, longitude)

        def update(event):
            with self.lock:
                previous = self.progress.get(key, {"requests": 0})
                self.progress[key] = {
                    **event,
                    "requests": previous["requests"] + (event["phase"] == "download"),
                }

        try:
            return self.chunks.prepare_origin(latitude, longitude, on_progress=update)
        finally:
            with self.lock:
                self.progress.pop(key, None)


class WeatherStore:
    def __init__(self, cache):
        self.cache = cache
        self.lock = threading.Lock()
        self.retry_at = 0

    def get(self, latitude, longitude):
        latitude, longitude = (math.floor(v * 10 + 0.5) / 10 for v in (latitude, longitude))
        end_year = datetime.now(timezone.utc).year - 1
        path = self.cache / f"v2_{latitude:.1f}_{longitude:.1f}_{end_year}.json"
        with self.lock:
            if path.exists():
                envelope = json.loads(path.read_text())
                data = envelope["data"]
                if hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest() != envelope["sha256"]:
                    raise ValueError("Corrupt weather cache; remove the affected weather cache file to rebuild.")
                return data
            if time.monotonic() < self.retry_at:
                raise ValueError("Historical weather provider is cooling down; retry in one minute.")
            try:
                data = fetch_climate(latitude, longitude, end_year)
            except (OSError, ValueError, KeyError) as error:
                self.retry_at = time.monotonic() + 60
                logging.warning("Historical weather unavailable: %s", error)
                raise
            data["retrievedAt"] = datetime.now(timezone.utc).isoformat()
            atomic_write(path, json.dumps({
                "data": data,
                "sha256": hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest(),
            }).encode())
            return data


def make_handler(store, jobs, path_pool=None):
    store.cache.mkdir(parents=True, exist_ok=True, mode=0o700)
    weather = WeatherStore(store.cache / "weather")
    trails = ChunkJobs(TownTrailStore(store, atomic_write), capacity=2, pool=jobs.pool)
    journeys = JourneyStore.configured(store, atomic_write)
    assets = getattr(journeys, "assets", None)
    if assets is not None:
        store.set_shared_assets(assets)
    origins = ChunkJobs(OriginStore(store), capacity=2, pool=jobs.pool)
    abandoned = AbandonedJournals(journeys)
    journal_art = JournalArt.configured(journeys, abandoned)
    encounter_art = EncounterArt.configured(store.cache / "encounter-art.sqlite3", journal_art,
                                            enabled=journal_art.writer is not None)
    live_narrative = LiveNarrative.configured(journeys, journal_art)
    start_art = StartArt(store.cache / "start-art.sqlite3", assets=getattr(journeys, "assets", None))
    living_world = ChunkJobs(LivingWorld(store.cache / "living-world", atomic_write), workers=1, capacity=4)
    journey_transport = JourneyTransport(store)
    quest_destinations = QuestDestinations(store, journal_art, journey_transport)
    parent_paths = ParentPaths(store, journeys, atomic_write, pool=path_pool)
    lore = LorePlaytest(journeys, abandoned, paths=parent_paths, chunk_jobs=jobs)
    main_artifacts = MainArtifacts(journeys, abandoned, paths=parent_paths, chunk_jobs=jobs)
    accommodations = ChunkJobs(Accommodations(store, atomic_write), capacity=2, pool=jobs.pool)
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(store.root), **kwargs)

        def send_json(self, status, payload):
            encoded = json.dumps(payload).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(encoded)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(encoded)

        def end_headers(self):
            if not self.path.startswith("/api/"):
                self.send_header("Cache-Control", "no-cache")
            super().end_headers()

        def do_POST(self):
            endpoint = urllib.parse.urlsplit(self.path).path
            if endpoint not in ("/api/journeys", "/api/abandoned-journals", "/api/lore-playtest", "/api/artifacts", "/api/journal-art", "/api/live-narrative", "/api/encounter-art", "/api/quest-destinations"):
                return self.send_json(404, {"error": "Unknown API endpoint."})
            origin = self.headers.get("Origin")
            try:
                source = urllib.parse.urlsplit(origin or "")
            except ValueError:
                return self.send_json(403, {"error": "Invalid journey request origin."})
            if (self.headers.get("Sec-Fetch-Site") == "cross-site"
                    or origin is not None and (
                        source.scheme not in {"http", "https"}
                        or source.netloc != self.headers.get("Host"))):
                return self.send_json(403, {"error": "Cross-origin journey creation is not allowed."})
            if self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
                return self.send_json(415, {"error": "Journey creation requires application/json."})
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                return self.send_json(400, {"error": "Invalid request body length."})
            maximum = (68 * 1024 * 1024 if endpoint == "/api/abandoned-journals"
                       else 2 * 1024 * 1024 if endpoint == "/api/artifacts"
                       else 16384 if endpoint == "/api/live-narrative" else 4096)
            if length < 1 or length > maximum or self.headers.get("Transfer-Encoding"):
                return self.send_json(413, {"error": f"Request must contain 1 to {maximum} bytes."})
            previous_timeout = self.connection.gettimeout()
            try:
                self.connection.settimeout(90 if endpoint == "/api/abandoned-journals" else 10)
                body = self.rfile.read(length)
                if len(body) != length:
                    raise JourneyRequest("Incomplete journey request.")
                try:
                    request = json.loads(body)
                except (ValueError, UnicodeError) as error:
                    raise JourneyRequest("Invalid journey JSON.") from error
                capability = self.headers.get("X-Journal-Capability")
                if endpoint == "/api/artifacts":
                    return self.send_json(200, main_artifacts.request(request, capability))
                if endpoint == "/api/quest-destinations":
                    return self.send_json(200, quest_destinations.request(request, capability))
                if endpoint == "/api/live-narrative":
                    return self.send_json(200, live_narrative.request(request, capability))
                if endpoint in ("/api/journal-art", "/api/encounter-art"):
                    result = (encounter_art if endpoint == "/api/encounter-art" else journal_art).request(request, capability)
                    if isinstance(result, bytes):
                        self.send_response(200)
                        self.send_header("Content-Type", "image/webp")
                        self.send_header("Content-Length", str(len(result)))
                        self.send_header("Cache-Control", "private, no-store")
                        self.end_headers()
                        self.wfile.write(result)
                        return
                    return self.send_json(200, result)
                if endpoint == "/api/lore-playtest":
                    return self.send_json(200, lore.request(request, capability))
                if endpoint == "/api/abandoned-journals":
                    return self.send_json(200, abandoned.request(request, capability))
                if capability is not None:
                    capability_hash(capability)
                if isinstance(request, dict) and isinstance(request.get("region"), str):
                    store.load_origin(request["region"])
                record, created = journeys.create(request)
                if capability is not None:
                    abandoned.bind(record["state"]["serverJourney"]["id"], capability)
                return self.send_json(201 if created else 200, record)
            except JournalForbidden as error:
                return self.send_json(403, {"error": str(error)})
            except JourneyRequest as error:
                logging.warning("Journey request rejected: %s", error)
                return self.send_json(400, {"error": str(error)})
            except JourneyConflict as error:
                return self.send_json(409, {"error": str(error)})
            except JourneyCapacity as error:
                return self.send_json(503, {"error": str(error)})
            except JourneyGeneration as error:
                logging.warning("Journey route generation failed: %s", error)
                return self.send_json(422, {"error": str(error)})
            except AssetError:
                logging.exception("Asset storage unavailable")
                return self.send_json(503, {"error": "Asset storage unavailable; check server logs."})
            except (OSError, ValueError, KeyError, sqlite3.Error):
                logging.exception("Server journey creation failed")
                return self.send_json(500, {"error": "Server journey creation failed; check the server logs."})
            finally:
                self.connection.settimeout(previous_timeout)

        def do_GET(self):
            url = urllib.parse.urlsplit(self.path)
            if url.path == "/public/config.json":
                try:
                    config = load_config()
                    return self.send_json(200, {key: config[key] for key in ("photos", "survival") if key in config})
                except (OSError, ValueError) as error:
                    logging.exception("Configuration request failed")
                    return self.send_json(500, {"error": str(error)})
            if url.path.startswith("/api/"):
                try:
                    if url.path == "/api/journey-transport":
                        query = urllib.parse.parse_qs(url.query, strict_parsing=True)
                        if set(query) != {"region", "col", "row", "day"} or any(len(v) != 1 for v in query.values()):
                            raise ValueError("Invalid journey transport query.")
                        store.load_origin(query["region"][0])
                        return self.send_json(200, journey_transport.lookup(
                            query["region"][0], int(query["col"][0]), int(query["row"][0]), query["day"][0]))
                    if url.path == "/api/living-world":
                        query = urllib.parse.parse_qs(url.query, strict_parsing=True)
                        if set(query) != {"lat", "lon"} or any(len(v) != 1 for v in query.values()):
                            raise ValueError("Invalid living-world query.")
                        point = query_position(float(query["lat"][0]), float(query["lon"][0]))
                        try:
                            status, data = living_world.request(*point)
                        except (OSError, ValueError, KeyError):
                            logging.exception("Public-event cache unavailable")
                            return self.send_json(500, {"error": "Public-event cache unavailable; check server logs."})
                        return self.send_json(status, data)
                    if url.path == "/api/start-art":
                        if url.query:
                            raise ValueError("Unexpected title illustration query.")
                        return self.send_json(200, start_art.snapshot())
                    if url.path == "/api/start-art/image":
                        query = urllib.parse.parse_qs(url.query, strict_parsing=True)
                        if set(query) != {"day"} or len(query["day"]) != 1:
                            raise ValueError("Invalid title illustration lookup.")
                        image = start_art.image(query["day"][0])
                        if image is None:
                            return self.send_json(404, {"error": "Daily title illustration not found."})
                        self.send_response(200)
                        self.send_header("Content-Type", "image/webp")
                        self.send_header("Content-Length", str(len(image)))
                        self.send_header("Cache-Control", "no-store")
                        self.end_headers()
                        return self.wfile.write(image)
                    if url.path == "/api/travel":
                        return self.send_json(200, {"chunkSize": CHUNK_SIZE, "cellSizeMeters": CELL_METERS})
                    if url.path == "/api/origins":
                        store.load_shared_origins()
                        return self.send_json(200, [
                            {"region": key, "name": data["name"]}
                            for key, data in list(store.bases.items()) if key.startswith("origin-")])
                    if url.path.startswith("/api/journeys/"):
                        try:
                            record = journeys.read(url.path.removeprefix("/api/journeys/"))
                        except JourneyRequest as error:
                            return self.send_json(400, {"error": str(error)})
                        except (OSError, ValueError, sqlite3.Error):
                            logging.exception("Server journey lookup failed")
                            return self.send_json(500, {"error": "Server journey lookup failed; check the server logs."})
                        if record is None:
                            return self.send_json(404, {"error": "Server journey not found."})
                        store.require_origin(record["region"])
                        return self.send_json(200, record)
                    if url.path not in {"/api/chunk", "/api/chunks-cached", "/api/journey-terrain", "/api/weather", "/api/places", "/api/parent-path",
                                        "/api/location", "/api/origin", "/api/origin-map", "/api/trail", "/api/pricing-country",
                                        "/api/accommodations"}:
                        return self.send_json(404, {"error": "Unknown API endpoint."})
                    query = urllib.parse.parse_qs(url.query, strict_parsing=True)
                    if url.path == "/api/journey-terrain":
                        if set(query) != {"region", "bounds"} or any(len(v) != 1 for v in query.values()):
                            raise ValueError("Invalid journey terrain lookup.")
                        store.load_origin(query["region"][0])
                        return self.send_json(200, cached_terrain(store, query["region"][0],
                                                                 json.loads(query["bounds"][0])))
                    if url.path == "/api/accommodations":
                        if set(query) != {"region", "latitude", "longitude"} or any(len(v) != 1 for v in query.values()):
                            raise ValueError("Invalid accommodation lookup.")
                        region = query["region"][0]
                        store.load_origin(region)
                        if region not in store.bases:
                            raise ValueError("Unknown accommodation region.")
                        latitude, longitude = float(query["latitude"][0]), float(query["longitude"][0])
                        if (not math.isfinite(latitude) or not math.isfinite(longitude)
                                or not -90 < latitude < 90 or not -180 <= longitude <= 180):
                            raise ValueError("Invalid accommodation coordinates.")
                        latitude, longitude = round(latitude, 6), round(longitude, 6)
                        status, payload = accommodations.request(region, latitude, longitude)
                        return self.send_json(status, payload)
                    if url.path == "/api/chunks-cached":
                        if set(query) != {"region", "positions"} or any(len(v) != 1 for v in query.values()):
                            raise ValueError("Invalid cached-chunk lookup.")
                        region = query["region"][0]
                        store.load_origin(region)
                        positions = json.loads(query["positions"][0])
                        if (region not in store.bases or not isinstance(positions, list)
                                or not 1 <= len(positions) <= 9 or any(
                                    not isinstance(p, list) or len(p) != 2 or any(
                                        type(v) is not int or abs(v) > 1000 for v in p)
                                    for p in positions)):
                            raise ValueError("Invalid cached-chunk positions.")
                        result = []
                        for x, y in positions:
                            cached = store.read(region, x, y)
                            if cached is not None:
                                result.append(cached)
                        return self.send_json(200, {"chunks": result})
                    if url.path == "/api/parent-path":
                        if (set(query) - {"journey", "stage", "retry", "col", "row", "recognize"}
                                or any(len(v) != 1 for v in query.values())
                                or ("col" in query) != ("row" in query)
                                or query.get("retry", ["0"])[0] not in {"0", "1"}):
                            raise ValueError("Invalid parent path request.")
                        status, payload = parent_paths.request(query["journey"][0],
                            int(query["stage"][0]), query.get("retry", ["0"])[0] == "1",
                            position=(int(query["col"][0]), int(query["row"][0])) if "col" in query else None,
                            recognize=query.get("recognize", [None])[0])
                        return self.send_json(status, payload)
                    if url.path == "/api/trail":
                        region, seed = query["region"][0], query["seed"][0]
                        store.load_origin(region)
                        if (region not in store.bases or len(seed) != 8
                                or any(c not in "0123456789abcdef" for c in seed)):
                            raise ValueError("Invalid town-trail origin or seed.")
                        status, payload = trails.request(region, seed)
                        return self.send_json(status, payload)
                    if url.path in {"/api/places", "/api/location", "/api/origin", "/api/pricing-country"}:
                        try:
                            if url.path == "/api/places":
                                return self.send_json(200, store.places.search(query["q"][0]))
                            latitude, longitude = coordinates(query["latitude"][0], query["longitude"][0])
                            if url.path == "/api/pricing-country":
                                return self.send_json(200, store.places.country(latitude, longitude))
                            if url.path == "/api/location":
                                return self.send_json(200, store.places.reverse(latitude, longitude))
                            status, payload = origins.request(latitude, longitude)
                            return self.send_json(status, payload)
                        except (OSError, ValueError, TypeError) as error:
                            logging.warning("Starting place unavailable: %s", error)
                            return self.send_json(502, {"error": str(error)})
                    if url.path == "/api/origin-map":
                        key = query["region"][0]
                        if not key.startswith("origin-") or not store.load_origin(key):
                            raise ValueError("Unknown custom starting point.")
                        return self.send_json(200, store.bases[key])
                    region = query["region"][0]
                    x, y = int(query["x"][0]), int(query["y"][0])
                    store.load_origin(region)
                    if region not in store.regions or abs(x) > 1000 or abs(y) > 1000:
                        raise ValueError("Invalid region or chunk coordinates.")
                    if url.path == "/api/weather":
                        bounds, _, _ = chunk_geometry(store.bases[region], x, y)
                        try:
                            return self.send_json(200, weather.get(
                                (bounds[1] + bounds[3]) / 2, (bounds[0] + bounds[2]) / 2))
                        except (OSError, ValueError, KeyError) as error:
                            logging.warning("Weather request failed: %s", error)
                            return self.send_json(502, {"error": str(error)})
                    status, payload = jobs.request(region, x, y)
                    return self.send_json(status, payload)
                except (ValueError, KeyError) as error:
                    logging.warning("Travel request rejected: %s", error)
                    return self.send_json(400, {"error": str(error)})
                except AssetError:
                    logging.exception("Asset storage unavailable")
                    return self.send_json(503, {"error": "Asset storage unavailable; check server logs."})
                except (OSError, ET.ParseError, sqlite3.Error) as error:
                    logging.exception("Travel cache request failed")
                    return self.send_json(500, {"error": str(error)})
            path = Path(urllib.parse.unquote(url.path))
            if any(part.startswith(".") or part == ".." for part in path.parts):
                return self.send_error(403)
            resolved = (store.root / str(path).lstrip("/")).resolve()
            if not resolved.is_relative_to(store.root.resolve()):
                return self.send_error(403)
            if resolved.is_dir() and url.path != "/":
                return self.send_error(403)
            super().do_GET()

    Handler.journal_art = journal_art
    Handler.encounter_art = encounter_art
    Handler.live_narrative = live_narrative
    Handler.living_world = living_world
    Handler.quest_destinations = quest_destinations
    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8766)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    store = ChunkStore()
    jobs = ChunkJobs(store)
    path_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="parent-path")
    server = ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(store, jobs, path_pool))
    print(f"Travel prototype: http://127.0.0.1:{args.port}/", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        server.RequestHandlerClass.journal_art.close()
        server.RequestHandlerClass.live_narrative.close()
        server.RequestHandlerClass.quest_destinations.close()
        server.RequestHandlerClass.living_world.pool.shutdown(wait=True, cancel_futures=True)
        jobs.pool.shutdown(wait=True, cancel_futures=True)
        path_pool.shutdown(wait=True, cancel_futures=True)
        if server.RequestHandlerClass.journal_art.journeys.assets is not None:
            server.RequestHandlerClass.journal_art.journeys.assets.catalogue.close()


if __name__ == "__main__":
    main()
