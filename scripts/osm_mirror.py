#!/usr/bin/env python3
"""Self-hosted regional OpenStreetMap mirror.

Geofabrik sub-region extracts are downloaded once, verified against their
published MD5, stored in a dedicated S3 bucket and served from local disk:

* bounding-box map data (the OSM XML the rasterizer already reads) is cut from
  the extract with ``osmium extract --strategy smart``;
* tagged points of interest are answered from a per-extract SQLite R*Tree
  index, in the same element shape Overpass returns.

The request path only reads local files. Downloads, processing, S3 transfers
and monthly refreshes run in the queue worker (``drain``), never inside a
player's request. An area whose extract is not installed answers ``None`` and
queues its sub-region; callers decide whether to wait or use another source.
"""

import argparse
import fcntl
import hashlib
import json
import logging
import math
import os
import re
import shutil
import sqlite3
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

INDEX_URL = "https://download.geofabrik.de/index-v1.json"
DOWNLOAD_PREFIX = "https://download.geofabrik.de/"
USER_AGENT = "ArcanePath/0.4 (regional map mirror)"
EARTH_RADIUS = 6371008.8
NEIGHBOUR_METERS = 60000
MAX_AGE_DAYS = 30
MIN_FREE_BYTES = 8 * 1024 ** 3
SCHEMA = 1
EXTRACT_ID = re.compile(r"[a-z0-9][a-z0-9-]{0,80}")
VERSION = re.compile(r"20\d{6}")
# Every tag family the game asks for: quest destinations, towns, venues,
# lodging, campsites and mapped sites. Points are indexed by their bbox centre,
# exactly like Overpass ``out center``.
POI_FILTERS = (
    "nwr/amenity", "nwr/shop", "nwr/tourism", "nwr/historic", "nwr/leisure", "nwr/office",
    "nwr/craft", "nwr/railway", "nwr/public_transport", "nwr/place", "nwr/aerialway",
    "nwr/landuse=cemetery", "nwr/natural=peak,hill",
)
EXTRACT_SLOTS = threading.BoundedSemaphore(2)
# A sub-region file has no spatial index, so each cut scans it whole (about 15 s
# on the 2-CPU server). The first map request in a ~25-km area cuts a buffered
# area tile once; later requests there scan only that small file (well under a second).
AREA_TILE_DEGREES = 0.25
AREA_TILE_BUFFER = 0.05
_TILE_LOCKS = {}
_TILE_LOCKS_GUARD = threading.Lock()


class MapDataPending(Exception):
    """The area's regional map data is queued or being prepared; ask again later.

    Deliberately not an OSError/ValueError so provider fallbacks never swallow it.
    """


def _inside_ring(lon, lat, ring):
    inside = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > lat) != (y2 > lat) and lon < (x2 - x1) * (lat - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def _ring_area(ring):
    return abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]))) / 2


class ExtractIndex:
    """Geofabrik extracts with their outlines; picks the smallest leaf covering a point."""

    def __init__(self, data):
        features = data.get("features") if isinstance(data, dict) else None
        if not isinstance(features, list):
            raise ValueError("Invalid Geofabrik index.")
        parents = {feature.get("properties", {}).get("parent") for feature in features}
        self.extracts = {}
        for feature in features:
            properties, geometry = feature.get("properties") or {}, feature.get("geometry") or {}
            identity, url = properties.get("id"), (properties.get("urls") or {}).get("pbf")
            if (not isinstance(identity, str) or not EXTRACT_ID.fullmatch(identity) or
                    not isinstance(url, str) or not url.startswith(DOWNLOAD_PREFIX) or
                    geometry.get("type") not in {"Polygon", "MultiPolygon"}):
                continue
            polygons = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
            polygons = [[[tuple(point[:2]) for point in ring] for ring in polygon] for polygon in polygons]
            points = [point for polygon in polygons for point in polygon[0]]
            if not points:
                continue
            self.extracts[identity] = {
                "id": identity, "parent": properties.get("parent"), "name": properties.get("name", identity),
                "pbf": url, "leaf": identity not in parents, "polygons": polygons,
                "bbox": (min(p[0] for p in points), min(p[1] for p in points),
                         max(p[0] for p in points), max(p[1] for p in points)),
                "area": sum(_ring_area(polygon[0]) - sum(_ring_area(hole) for hole in polygon[1:])
                            for polygon in polygons),
            }

    def contains(self, identity, lat, lon):
        extract = self.extracts.get(identity)
        if extract is None:
            return False
        west, south, east, north = extract["bbox"]
        if not (west <= lon <= east and south <= lat <= north):
            return False
        return any(_inside_ring(lon, lat, polygon[0]) and
                   not any(_inside_ring(lon, lat, hole) for hole in polygon[1:])
                   for polygon in extract["polygons"])

    def leaf_for(self, lat, lon):
        """The smallest sub-region without children that contains the point."""
        candidates = [e for e in self.extracts.values() if e["leaf"] and self.contains(e["id"], lat, lon)]
        return min(candidates, key=lambda e: e["area"])["id"] if candidates else None


def offset(lat, lon, meters, bearing):
    """A point ``meters`` away on a sphere; adequate for 60-km coverage sampling."""
    angle, heading = meters / EARTH_RADIUS, math.radians(bearing)
    lat1, lon1 = math.radians(lat), math.radians(lon)
    lat2 = math.asin(math.sin(lat1) * math.cos(angle) + math.cos(lat1) * math.sin(angle) * math.cos(heading))
    lon2 = lon1 + math.atan2(math.sin(heading) * math.sin(angle) * math.cos(lat1),
                             math.cos(angle) - math.sin(lat1) * math.sin(lat2))
    return math.degrees(lat2), (math.degrees(lon2) + 540) % 360 - 180


def haversine(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = (math.sin((p2 - p1) / 2) ** 2 +
         math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2)
    return 2 * EARTH_RADIUS * math.asin(min(1, math.sqrt(a)))


def dated_candidates(location, days=7):
    """URLs to try for an extract: the dated file ``-latest`` points to, then earlier days.

    Geofabrik briefly redirects ``-latest`` to a new dated file before publishing it.
    """
    match = re.fullmatch(r"(https://download\.geofabrik\.de/[a-z0-9/_-]+-)(\d{6})(\.osm\.pbf)", location or "")
    if not match:
        return [location] if location else []
    prefix, stamp, suffix = match.groups()
    day = datetime.strptime(stamp, "%y%m%d").date()
    return [f"{prefix}{(day - timedelta(days=back)).strftime('%y%m%d')}{suffix}" for back in range(days + 1)]


def version_of(url):
    match = re.search(r"-(\d{6})\.osm\.pbf$", url)
    if not match:
        return datetime.now(timezone.utc).strftime("%Y%m%d")
    return datetime.strptime(match[1], "%y%m%d").strftime("%Y%m%d")


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def resolve_latest(url):
    """Where Geofabrik's ``-latest`` link currently redirects (the dated file), without following it."""
    opener = urllib.request.build_opener(_NoRedirect)
    try:
        opener.open(urllib.request.Request(url, method="HEAD", headers={"User-Agent": USER_AGENT}), timeout=60)
    except urllib.error.HTTPError as error:
        if error.code in {301, 302, 303, 307, 308} and error.headers.get("Location"):
            location = urllib.parse.urljoin(url, error.headers["Location"])
            if not location.startswith(DOWNLOAD_PREFIX):
                raise ValueError("Unexpected extract redirect.") from error
            return location
        raise
    return url


def _sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for block in iter(lambda: stream.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def _center(geometry):
    stack, west, south, east, north = [geometry.get("coordinates")], math.inf, math.inf, -math.inf, -math.inf
    while stack:
        item = stack.pop()
        if (isinstance(item, list) and len(item) >= 2 and
                all(isinstance(value, (int, float)) for value in item[:2])):
            west, east = min(west, item[0]), max(east, item[0])
            south, north = min(south, item[1]), max(north, item[1])
        elif isinstance(item, list):
            stack.extend(item)
    if not math.isfinite(west):
        return None
    return (south + north) / 2, (west + east) / 2


def build_poi_index(source, output, osmium="osmium"):
    """Filtered, de-duplicated points of interest with an R*Tree, from an extract."""
    work = Path(output).parent
    filtered, exported = work / "pois.osm.pbf", work / "pois.geojsonseq"
    subprocess.run([osmium, "tags-filter", str(source), *POI_FILTERS, "-o", str(filtered), "-O"],
                   check=True, capture_output=True)
    subprocess.run([osmium, "export", str(filtered), "-f", "geojsonseq", "-a", "type,id",
                    "-o", str(exported), "-O"], check=True, capture_output=True)
    database = sqlite3.connect(output)
    try:
        database.executescript("""
            PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;
            CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE pois(id INTEGER PRIMARY KEY, osm_type TEXT NOT NULL, osm_id INTEGER NOT NULL,
                              lat REAL NOT NULL, lon REAL NOT NULL, tags TEXT NOT NULL,
                              UNIQUE(osm_type, osm_id));
            CREATE VIRTUAL TABLE pois_rtree USING rtree(id, min_lat, max_lat, min_lon, max_lon);
        """)
        seen, rows = set(), []
        with open(exported, encoding="utf-8") as stream:
            for line in stream:
                line = line.strip("\x1e\n\r ")
                if not line:
                    continue
                feature = json.loads(line)
                properties = feature.get("properties") or {}
                kind, identity = properties.get("@type"), properties.get("@id")
                if kind not in {"node", "way", "relation"} or not isinstance(identity, int):
                    continue
                if (kind, identity) in seen:
                    continue
                center = _center(feature.get("geometry") or {})
                if center is None:
                    continue
                seen.add((kind, identity))
                tags = {key: value for key, value in properties.items() if not key.startswith("@")}
                rows.append((len(seen), kind, identity, center[0], center[1],
                             json.dumps(tags, ensure_ascii=False, separators=(",", ":"))))
                if len(rows) >= 20000:
                    _insert(database, rows)
                    rows = []
        _insert(database, rows)
        database.execute("INSERT INTO meta VALUES('schema', ?), ('count', ?)", (str(SCHEMA), str(len(seen))))
        database.commit()
    finally:
        database.close()
    filtered.unlink(missing_ok=True)
    exported.unlink(missing_ok=True)
    return len(seen)


def _insert(database, rows):
    database.executemany("INSERT INTO pois VALUES (?,?,?,?,?,?)", rows)
    database.executemany("INSERT INTO pois_rtree VALUES (?,?,?,?,?)",
                         [(row[0], row[3], row[3], row[4], row[4]) for row in rows])


def _matches(tags, filters, named):
    if named and not str(tags.get("name", "")).strip():
        return False
    for key, values in filters:
        value = tags.get(key)
        if value is not None and (values is None or value in values):
            return True
    return False


class OsmMirror:
    def __init__(self, root, *, bucket=None, s3_factory=None, osmium="osmium", opener=None,
                 resolver=resolve_latest, clock=time.time):
        self.root = Path(root)
        self.resolver = resolver
        self.bucket, self.s3_factory, self.osmium = bucket, s3_factory, osmium
        self.opener = opener or urllib.request.urlopen
        self.clock = clock
        self._index, self._index_mtime = None, None
        self._installed, self._installed_at = {}, 0.0
        self._requested = {}
        self._lock = threading.Lock()

    # ----- local state -------------------------------------------------
    def _extract_dir(self, identity):
        if not EXTRACT_ID.fullmatch(identity):
            raise ValueError("Invalid extract id.")
        return self.root / "extracts" / identity

    def index(self):
        path = self.root / "index" / "geofabrik-index.json"
        try:
            mtime = path.stat().st_mtime_ns
        except FileNotFoundError:
            return None
        with self._lock:
            if self._index is None or self._index_mtime != mtime:
                self._index, self._index_mtime = ExtractIndex(json.loads(path.read_text())), mtime
            return self._index

    def installed(self):
        """Installed extracts: id -> {version, dir, source, pois}; rescanned every 30 seconds."""
        now = self.clock()
        with self._lock:
            if now - self._installed_at < 30:
                return self._installed
        found = {}
        for pointer in (self.root / "extracts").glob("*/current.json"):
            try:
                current = json.loads(pointer.read_text())
                version = current["version"]
                directory = pointer.parent / version
                if (VERSION.fullmatch(version) and (directory / "source.osm.pbf").is_file() and
                        (directory / "pois.sqlite").is_file()):
                    found[pointer.parent.name] = {"version": version, "dir": directory,
                                                  "source": directory / "source.osm.pbf",
                                                  "pois": directory / "pois.sqlite",
                                                  "url": current.get("sourceUrl", "")}
            except (OSError, ValueError, KeyError):
                logging.warning("Ignoring unreadable map mirror pointer %s", pointer)
        with self._lock:
            self._installed, self._installed_at = found, now
        return found

    def covering(self, lat, lon):
        """The smallest installed extract whose outline contains the point."""
        index = self.index()
        if index is None:
            return None
        ready = [(index.extracts[i]["area"], i) for i in self.installed() if i in index.extracts]
        for _, identity in sorted(ready):
            if index.contains(identity, lat, lon):
                return identity
        return None

    # ----- queue -------------------------------------------------------
    def request(self, identity, reason=""):
        """Queue an extract for download/refresh. Idempotent and cheap."""
        queue = self.root / "queue"
        queue.mkdir(parents=True, exist_ok=True)
        path = queue / f"{self._extract_dir(identity).name}.json"
        try:
            descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
        except FileExistsError:
            return False
        with os.fdopen(descriptor, "w") as stream:
            json.dump({"requested": self.clock(), "reason": reason, "attempts": 0}, stream)
        logging.info("Queued map extract %s (%s)", identity, reason)
        return True

    def request_point(self, lat, lon, reason="uncovered"):
        index = self.index()
        if index is None:
            self._queue_index()
            return None
        leaf = index.leaf_for(lat, lon)
        if leaf and leaf not in self.installed():
            self.request(leaf, reason)
        return leaf

    def request_around(self, lat, lon, meters=NEIGHBOUR_METERS, reason="neighbour"):
        """Queue every sub-region within ``meters``; throttled per ~5-km cell."""
        key = (round(lat * 20), round(lon * 20), meters)
        now = self.clock()
        with self._lock:
            if now - self._requested.get(key, -math.inf) < 600:
                return
            self._requested[key] = now
        for point in [(lat, lon)] + [offset(lat, lon, distance, bearing)
                                     for distance in (meters / 2, meters) for bearing in range(0, 360, 30)]:
            self.request_point(*point, reason=reason)

    def _queue_index(self):
        (self.root / "queue").mkdir(parents=True, exist_ok=True)
        (self.root / "queue" / "_index.flag").touch()

    # ----- request-path reads (local files only) ------------------------
    def bbox_map(self, bounds):
        """(root, label) for an OSM XML bbox cut from an installed extract, else None (queued)."""
        west, south, east, north = bounds
        corners = [(south, west), (south, east), (north, west), (north, east)]
        identity = self.covering((south + north) / 2, (west + east) / 2)
        if identity is None or any(not self.index().contains(identity, lat, lon) for lat, lon in corners):
            for lat, lon in corners:
                self.request_point(lat, lon)
            return None
        extract = self.installed()[identity]
        source = self._area_tile(extract, bounds) or extract["source"]
        with EXTRACT_SLOTS:
            result = subprocess.run(
                [self.osmium, "extract", "-b", ",".join(format(v, ".12g") for v in bounds), "-s", "smart",
                 str(source), "-f", "osm", "-o", "-"],
                check=True, capture_output=True, timeout=180)
        root = ET.fromstring(result.stdout)
        for element in list(root.findall("bounds")):
            root.remove(element)
        bounding = ET.Element("bounds", {"minlon": str(west), "minlat": str(south),
                                         "maxlon": str(east), "maxlat": str(north)})
        root.insert(0, bounding)
        return root, f"{extract['url'] or DOWNLOAD_PREFIX}#{identity}@{extract['version']}"

    def _area_tile(self, extract, bounds):
        """The cached buffered area tile containing ``bounds``, cut on first use; None if it does not fit."""
        west, south, east, north = bounds
        tx = math.floor((west + east) / 2 / AREA_TILE_DEGREES)
        ty = math.floor((south + north) / 2 / AREA_TILE_DEGREES)
        box = (tx * AREA_TILE_DEGREES - AREA_TILE_BUFFER, ty * AREA_TILE_DEGREES - AREA_TILE_BUFFER,
               (tx + 1) * AREA_TILE_DEGREES + AREA_TILE_BUFFER, (ty + 1) * AREA_TILE_DEGREES + AREA_TILE_BUFFER)
        if not (box[0] <= west and box[1] <= south and east <= box[2] and north <= box[3]):
            return None
        path = extract["dir"] / "tiles" / f"{tx}_{ty}.osm.pbf"
        if path.is_file():
            return path
        with _TILE_LOCKS_GUARD:
            lock = _TILE_LOCKS.setdefault(str(path), threading.Lock())
        with lock:
            if path.is_file():
                return path
            path.parent.mkdir(parents=True, exist_ok=True)
            temporary = path.with_suffix(f".{os.getpid()}.{threading.get_ident()}.tmp.pbf")
            try:
                with EXTRACT_SLOTS:
                    subprocess.run(
                        [self.osmium, "extract", "-b", ",".join(format(v, ".12g") for v in box), "-s", "smart",
                         str(extract["source"]), "-o", str(temporary), "-O"],
                        check=True, capture_output=True, timeout=600)
                temporary.replace(path)
            finally:
                temporary.unlink(missing_ok=True)
        return path

    def around(self, lat, lon, meters, filters, *, limit=None, named=False, types=None):
        """Overpass-shaped elements within ``meters`` of a point, nearest first.

        Returns None (and queues the missing sub-regions) unless the whole circle
        is covered by installed extracts, so callers never see a partial area.
        """
        samples = [(lat, lon)] + [offset(lat, lon, meters, bearing) for bearing in range(0, 360, 45)]
        covering = {self.covering(*point) for point in samples}
        if None in covering:
            for point in samples:
                self.request_point(*point)
            return None
        dlat = math.degrees(meters / EARTH_RADIUS)
        dlon = dlat / max(0.01, math.cos(math.radians(lat)))
        found = {}
        installed = self.installed()
        for identity in covering:
            uri = f"file:{installed[identity]['pois']}?mode=ro&immutable=1"
            database = sqlite3.connect(uri, uri=True)
            try:
                rows = database.execute(
                    "SELECT p.osm_type, p.osm_id, p.lat, p.lon, p.tags FROM pois_rtree r JOIN pois p ON p.id = r.id "
                    "WHERE r.min_lat >= ? AND r.max_lat <= ? AND r.min_lon >= ? AND r.max_lon <= ?",
                    (lat - dlat, lat + dlat, lon - dlon, lon + dlon)).fetchall()
            finally:
                database.close()
            for kind, identity_osm, plat, plon, raw in rows:
                if types and kind not in types:
                    continue
                distance = haversine(lat, lon, plat, plon)
                if distance > meters:
                    continue
                tags = json.loads(raw)
                if not _matches(tags, filters, named):
                    continue
                element = ({"type": kind, "id": identity_osm, "lat": plat, "lon": plon, "tags": tags}
                           if kind == "node" else
                           {"type": kind, "id": identity_osm, "center": {"lat": plat, "lon": plon}, "tags": tags})
                found.setdefault((kind, identity_osm), (distance, element))
        ordered = [element for _, element in sorted(found.values(), key=lambda item: (item[0], item[1]["type"],
                                                                                        item[1]["id"]))]
        return ordered[:limit] if limit is not None else ordered

    def source_url(self, lat, lon):
        identity = self.covering(lat, lon)
        return self.installed()[identity]["url"] if identity else None

    # ----- worker ------------------------------------------------------
    def s3(self):
        if self.s3_factory is None or not self.bucket:
            return None
        return self.s3_factory()

    def refresh_index(self, max_age_days=MAX_AGE_DAYS):
        path = self.root / "index" / "geofabrik-index.json"
        if path.is_file() and self.clock() - path.stat().st_mtime < max_age_days * 86400:
            return False
        request = urllib.request.Request(INDEX_URL, headers={"User-Agent": USER_AGENT})
        with self.opener(request, timeout=120) as response:
            data = response.read(64 << 20)
        ExtractIndex(json.loads(data))
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(".tmp")
        temporary.write_bytes(data)
        temporary.replace(path)
        return True

    def _download(self, url, target):
        """Downloads ``-latest`` (or the newest published dated file) and verifies its MD5."""
        location = self.resolver(url)
        failures = []
        for candidate in dated_candidates(location) or [url]:
            try:
                request = urllib.request.Request(candidate + ".md5", headers={"User-Agent": USER_AGENT})
                with self.opener(request, timeout=60) as response:
                    expected = response.read(256).decode("ascii", "replace").split()[0].lower()
                digest = hashlib.md5()
                request = urllib.request.Request(candidate, headers={"User-Agent": USER_AGENT})
                with self.opener(request, timeout=120) as response, open(target, "wb") as stream:
                    for block in iter(lambda: response.read(1 << 20), b""):
                        digest.update(block)
                        stream.write(block)
                if digest.hexdigest() != expected:
                    raise ValueError(f"MD5 mismatch for {candidate}.")
                return candidate
            except urllib.error.HTTPError as error:
                if error.code != 404:
                    raise
                failures.append(f"{candidate}: 404")
        raise FileNotFoundError("No published extract file: " + "; ".join(failures))

    def ingest(self, identity, *, max_age_days=MAX_AGE_DAYS):
        """Installs the extract from S3 when a fresh copy exists, else builds it from Geofabrik."""
        index = self.index()
        if index is None or identity not in index.extracts:
            raise ValueError(f"Unknown extract {identity}.")
        directory = self._extract_dir(identity)
        (self.root / "tmp").mkdir(parents=True, exist_ok=True)
        free = shutil.disk_usage(self.root).free
        if free < MIN_FREE_BYTES:
            raise OSError(f"Only {free // 1024 ** 2} MB free for map extracts; keeping {MIN_FREE_BYTES // 1024 ** 3} GB.")
        if self._install_from_s3(identity, max_age_days):
            return "s3"
        with tempfile.TemporaryDirectory(dir=self.root / "tmp") as temporary:
            work = Path(temporary)
            source = work / "source.osm.pbf"
            url = self._download(index.extracts[identity]["pbf"], source)
            version = version_of(url)
            count = build_poi_index(source, work / "pois.sqlite", self.osmium)
            manifest = {"schema": SCHEMA, "extract": identity, "name": index.extracts[identity]["name"],
                        "version": version, "sourceUrl": url, "builtAt": datetime.now(timezone.utc).isoformat(),
                        "license": "ODbL 1.0", "attribution": "© OpenStreetMap contributors, Geofabrik extract",
                        "pois": count,
                        "files": {name: {"sha256": _sha256(work / name), "bytes": (work / name).stat().st_size}
                                  for name in ("source.osm.pbf", "pois.sqlite")}}
            (work / "manifest.json").write_text(json.dumps(manifest, indent=2))
            self._publish(identity, version, work, manifest)
            self._install(identity, version, work, manifest)
        return "geofabrik"

    def _publish(self, identity, version, work, manifest):
        s3 = self.s3()
        if s3 is None:
            return
        prefix = f"osm/{identity}/{version}/"
        for name in ("source.osm.pbf", "pois.sqlite", "manifest.json"):
            s3.upload_file(str(work / name), self.bucket, prefix + name)
        s3.put_object(Bucket=self.bucket, Key=f"osm/{identity}/current.json",
                      Body=json.dumps({"version": version, "sourceUrl": manifest["sourceUrl"]}).encode(),
                      ContentType="application/json")
        self._prune_s3(identity, keep={version})

    def _prune_s3(self, identity, keep):
        """Keeps the current version and the one before it; older versions are deleted."""
        s3 = self.s3()
        listing = s3.list_objects_v2(Bucket=self.bucket, Prefix=f"osm/{identity}/", Delimiter="/")
        versions = sorted(prefix["Prefix"].rstrip("/").rsplit("/", 1)[1]
                          for prefix in listing.get("CommonPrefixes", []))
        versions = [v for v in versions if VERSION.fullmatch(v)]
        older = [v for v in versions if v not in keep]
        retained = set(keep) | set(older[-1:])
        for version in versions:
            if version in retained:
                continue
            objects = s3.list_objects_v2(Bucket=self.bucket, Prefix=f"osm/{identity}/{version}/").get("Contents", [])
            for item in objects:
                s3.delete_object(Bucket=self.bucket, Key=item["Key"])

    def _install_from_s3(self, identity, max_age_days):
        s3 = self.s3()
        if s3 is None:
            return False
        try:
            pointer = json.loads(s3.get_object(Bucket=self.bucket, Key=f"osm/{identity}/current.json")["Body"].read())
        except Exception as error:  # botocore ClientError (missing key) or transport failure
            logging.info("No published map extract %s in S3: %s", identity, error)
            return False
        version = pointer.get("version", "")
        if not VERSION.fullmatch(version):
            return False
        age = (date.today() - datetime.strptime(version, "%Y%m%d").date()).days
        if age > max_age_days:
            return False
        if self.installed().get(identity, {}).get("version") == version:
            return True
        (self.root / "tmp").mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=self.root / "tmp") as temporary:
            work = Path(temporary)
            prefix = f"osm/{identity}/{version}/"
            s3.download_file(self.bucket, prefix + "manifest.json", str(work / "manifest.json"))
            manifest = json.loads((work / "manifest.json").read_text())
            for name, expected in manifest["files"].items():
                if name not in {"source.osm.pbf", "pois.sqlite"}:
                    raise ValueError("Unexpected file in map manifest.")
                s3.download_file(self.bucket, prefix + name, str(work / name))
                if _sha256(work / name) != expected["sha256"]:
                    raise ValueError(f"Checksum mismatch for {prefix}{name}.")
            self._install(identity, version, work, manifest)
        return True

    def _install(self, identity, version, work, manifest):
        directory = self._extract_dir(identity)
        target = directory / version
        staging = directory / f".{version}.partial"
        shutil.rmtree(staging, ignore_errors=True)
        staging.mkdir(parents=True)
        for name in ("source.osm.pbf", "pois.sqlite", "manifest.json"):
            shutil.move(str(work / name), staging / name)
        shutil.rmtree(target, ignore_errors=True)
        staging.rename(target)
        pointer = directory / "current.json.tmp"
        pointer.write_text(json.dumps({"version": version, "sourceUrl": manifest["sourceUrl"]}))
        pointer.replace(directory / "current.json")
        with self._lock:
            self._installed_at = 0.0
        # Only the current version stays on disk (S3 keeps the previous one). Readers that
        # already opened an older file keep reading it: unlinking never interrupts them.
        for old in directory.iterdir():
            if old.is_dir() and VERSION.fullmatch(old.name) and old.name != version:
                shutil.rmtree(old, ignore_errors=True)

    def refresh(self, max_age_days=MAX_AGE_DAYS):
        """Queues installed extracts older than the refresh period."""
        queued = []
        for identity, extract in self.installed().items():
            age = (date.today() - datetime.strptime(extract["version"], "%Y%m%d").date()).days
            if age > max_age_days and self.request(identity, "refresh"):
                queued.append(identity)
        return queued

    def drain(self, *, max_jobs=None, max_age_days=MAX_AGE_DAYS):
        """Processes queued extracts one at a time; a second worker exits immediately."""
        self.root.mkdir(parents=True, exist_ok=True)
        with open(self.root / "worker.lock", "w") as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                return []
            self.refresh_index(max_age_days)
            (self.root / "queue" / "_index.flag").unlink(missing_ok=True)
            self.refresh(max_age_days)
            done = []
            while max_jobs is None or len(done) < max_jobs:
                jobs = sorted((path for path in (self.root / "queue").glob("*.json")),
                              key=lambda path: path.stat().st_mtime)
                job = next((path for path in jobs
                            if json.loads(path.read_text()).get("retryAfter", 0) <= self.clock()), None)
                if job is None:
                    break
                identity, record = job.stem, json.loads(job.read_text())
                started = time.monotonic()
                try:
                    origin = self.ingest(identity, max_age_days=max_age_days)
                    job.unlink()
                    logging.info("Map extract %s ready from %s in %.0f s", identity, origin, time.monotonic() - started)
                    done.append(identity)
                except Exception as error:
                    attempts = record.get("attempts", 0) + 1
                    record.update(attempts=attempts, error=str(error)[:500],
                                  retryAfter=self.clock() + min(6 * 3600, 600 * 2 ** attempts))
                    job.write_text(json.dumps(record))
                    logging.exception("Map extract %s failed (attempt %s)", identity, attempts)
            return done

    def status(self):
        queue = {}
        for path in (self.root / "queue").glob("*.json"):
            queue[path.stem] = json.loads(path.read_text())
        return {"installed": {identity: extract["version"] for identity, extract in self.installed().items()},
                "queue": queue}


_DEFAULT = None


def default_mirror():
    """The configured server mirror, or None when ARCANE_OSM_MIRROR_DIR is unset (tests, development)."""
    global _DEFAULT
    root = os.environ.get("ARCANE_OSM_MIRROR_DIR")
    if not root:
        return None
    if _DEFAULT is None or _DEFAULT.root != Path(root):
        bucket = os.environ.get("ARCANE_OSM_MIRROR_BUCKET")

        def s3_factory():
            import boto3
            from botocore.config import Config
            config = json.loads(Path(os.environ["ARCANE_ASSET_STORAGE_CONFIG_FILE"]).read_text())
            return boto3.client("s3", endpoint_url=config["endpoint"], region_name=config["region"],
                                config=Config(connect_timeout=10, read_timeout=120,
                                              retries={"mode": "standard", "total_max_attempts": 5}))
        _DEFAULT = OsmMirror(root, bucket=bucket, s3_factory=s3_factory if bucket else None)
    return _DEFAULT


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    drain = commands.add_parser("drain", help="Process queued extracts (run by the systemd timer).")
    drain.add_argument("--max-jobs", type=int)
    cover = commands.add_parser("cover", help="Queue the sub-regions around a point.")
    cover.add_argument("--lat", type=float, required=True)
    cover.add_argument("--lon", type=float, required=True)
    cover.add_argument("--radius", type=float, default=NEIGHBOUR_METERS)
    commands.add_parser("status", help="Installed versions and queue.")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    mirror = default_mirror()
    if mirror is None:
        parser.error("Set ARCANE_OSM_MIRROR_DIR.")
    if args.command == "drain":
        print(json.dumps({"done": mirror.drain(max_jobs=args.max_jobs)}))
    elif args.command == "cover":
        mirror.refresh_index()
        mirror._requested.clear()
        mirror.request_around(args.lat, args.lon, args.radius, reason="manual")
        print(json.dumps(mirror.status(), indent=2))
    else:
        print(json.dumps(mirror.status(), indent=2, default=str))


if __name__ == "__main__":
    main()
