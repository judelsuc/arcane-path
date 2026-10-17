#!/usr/bin/env python3
"""Local travel prototype server with bounded, persistent OSM/elevation caching."""

import argparse
import gzip
import hashlib
import json
import logging
import math
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from build_map import rasterize
from fetch_osm import download_region
from weather import fetch_climate
from config import load_config

ROOT = Path(__file__).resolve().parents[1]
CHUNK_SIZE = 8
CELL_METERS = 250
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
    latitude = (base["bounds"]["minLatitude"] + base["bounds"]["maxLatitude"]) / 2
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
        self.pipeline = hashlib.sha256(
            Path(__file__).read_bytes() + (ROOT / "scripts/build_map.py").read_bytes() +
            json.dumps(load_config()["map"], sort_keys=True).encode()
        ).hexdigest()
        self.bases = {
            key: json.loads((root / region["map"]).read_text())
            for key, region in self.regions.items()
        }
        self.fingerprints = {
            key: hashlib.sha256((root / region["snapshot"]).read_bytes()).hexdigest()
            for key, region in self.regions.items()
        }

    def path(self, region, x, y):
        identity = hashlib.sha256(
            f"{self.pipeline}:{self.fingerprints[region]}:{CELL_METERS}:{CHUNK_SIZE}".encode()
        ).hexdigest()[:20]
        return self.cache / region / identity / f"{x}_{y}"

    def source_path(self, region, x, y):
        bounds, latitude, _ = chunk_geometry(self.bases[region], x, y)
        identity = hashlib.sha256(json.dumps({
            "snapshot": self.fingerprints[region], "bounds": bounds,
            "projectionLatitude": latitude, "cellSize": CELL_METERS,
        }, sort_keys=True).encode()).hexdigest()[:20]
        return self.cache / region / "sources" / identity / f"{x}_{y}"

    def read(self, region, x, y):
        path = self.path(region, x, y).with_suffix(".json")
        if not path.exists():
            return None
        envelope = json.loads(path.read_text())
        payload = envelope["data"]
        checksum = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
        if checksum != envelope["sha256"]:
            raise ValueError(f"Corrupt travel cache: {path}. Remove this chunk cache to rebuild.")
        return payload

    def build(self, region, x, y):
        cached = self.read(region, x, y)
        if cached is not None:
            return cached
        bounds, latitude, centers = chunk_geometry(self.bases[region], x, y)
        path = self.path(region, x, y)
        source_base = self.source_path(region, x, y)
        source = source_base.with_suffix(".osm.gz")
        base = self.bases[region]["bounds"]
        if not source.exists():
            if (base["minLongitude"] <= bounds[0] and base["minLatitude"] <= bounds[1]
                    and bounds[2] <= base["maxLongitude"] and bounds[3] <= base["maxLatitude"]):
                with gzip.open(self.root / self.regions[region]["snapshot"], "rb") as stream:
                    root = ET.parse(stream).getroot()
                b = root.find("bounds")
                b.attrib.update(dict(zip(("minlon", "minlat", "maxlon", "maxlat"), map(str, bounds))))
                atomic_write(source, gzip.compress(ET.tostring(root), mtime=0))
            else:
                download_region(bounds, self.regions[region]["name"], source)
        with gzip.open(source, "rb") as stream:
            root = ET.parse(stream).getroot()
        if root.attrib.get("projection_latitude") != str(latitude) or "reference_bbox" in root.attrib:
            root.set("projection_latitude", str(latitude))
            root.attrib.pop("reference_bbox", None)
            atomic_write(source, gzip.compress(ET.tostring(root), mtime=0))
        data = rasterize(source, self.regions[region]["name"], CELL_METERS)
        data["rows"] = [row[:CHUNK_SIZE] for row in data["rows"][:CHUNK_SIZE]]
        if len(data["rows"]) != CHUNK_SIZE or any(len(row) != CHUNK_SIZE for row in data["rows"]):
            raise ValueError("Unexpected travel chunk dimensions.")
        data["width"] = data["height"] = CHUNK_SIZE
        data["chunk"] = {"region": region, "x": x, "y": y, "size": CHUNK_SIZE}
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
                elevation = fetch_elevations(centers)
                atomic_write(elevation_path, json.dumps(elevation).encode())
            data["elevation"] = {k: v for k, v in elevation.items() if k != "values"}
            for cell, value in zip((cell for row in data["rows"] for cell in row), elevation["values"]):
                cell["elevationMeters"] = value
        except (OSError, ValueError, KeyError, urllib.error.URLError) as error:
            logging.warning("Elevation unavailable for %s/%s/%s: %s", region, x, y, error)
            data["elevation"] = {"error": str(error)}
            # The OSM snapshot remains cached, but retry unavailable elevation on the next request.
            return data
        atomic_write(path.with_suffix(".json"), json.dumps({
            "sha256": hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest(),
            "data": data,
        }).encode())
        return data


class ChunkJobs:
    def __init__(self, store, workers=2, capacity=10):
        self.store = store
        self.pool = ThreadPoolExecutor(max_workers=workers)
        self.capacity = capacity
        self.lock = threading.Lock()
        self.jobs = {}

    def request(self, region, x, y):
        key = (region, x, y)
        with self.lock:
            job = self.jobs.get(key)
            if job:
                if not job.done():
                    return 202, {"status": "loading"}
                del self.jobs[key]
                try:
                    return 200, job.result()
                except (OSError, ValueError, KeyError, ET.ParseError, urllib.error.URLError) as error:
                    logging.exception("Chunk preparation failed: %s", key)
                    return 502, {"error": str(error)}
            cached = self.store.read(*key)
            if cached is not None:
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


def make_handler(store, jobs):
    weather = WeatherStore(store.cache / "weather")
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
                    if url.path == "/api/travel":
                        return self.send_json(200, {"chunkSize": CHUNK_SIZE, "cellSizeMeters": CELL_METERS})
                    if url.path not in {"/api/chunk", "/api/weather"}:
                        return self.send_json(404, {"error": "Unknown API endpoint."})
                    query = urllib.parse.parse_qs(url.query, strict_parsing=True)
                    region = query["region"][0]
                    x, y = int(query["x"][0]), int(query["y"][0])
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
                except (OSError, ET.ParseError) as error:
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

    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8766)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    store = ChunkStore()
    jobs = ChunkJobs(store)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(store, jobs))
    print(f"Travel prototype: http://127.0.0.1:{args.port}/", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        jobs.pool.shutdown(wait=True, cancel_futures=True)


if __name__ == "__main__":
    main()
