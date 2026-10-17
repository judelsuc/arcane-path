#!/usr/bin/env python3
"""Download and cache bounded OSM snapshots with read-only source fallback."""

import argparse
import gzip
import json
import math
import re
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from build_map import classify

MAX_LANDCOVER_COMPLETIONS = 16
OVERPASS_URLS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
)
_SOURCE_LOCK = threading.Lock()
_COOLDOWNS = {}
_SOURCE_CURSORS = {}


def _rotating_sources(sources):
    """Rotate after the last selected source; caller holds _SOURCE_LOCK."""
    start = _SOURCE_CURSORS.get(sources, 0)
    for offset in range(len(sources)):
        index = (start + offset) % len(sources)
        _SOURCE_CURSORS[sources] = (index + 1) % len(sources)
        yield sources[index]


class SourceUnavailable(ValueError):
    def __init__(self, message, retry_after=60):
        super().__init__(message)
        self.retry_after = retry_after


def _http_failure(error, reason):
    delay = error.headers.get("Retry-After", "") if error.headers else ""
    match = re.search(r"try again in (\d+) seconds", reason, re.IGNORECASE)
    seconds = int(delay) if delay.isdigit() else int(match[1]) if match else 60
    return SourceUnavailable(f"OSM HTTP {error.code}: {reason}", max(1, seconds))


def _map_url(bounds):
    bbox = ",".join(format(value, ".12g") for value in bounds)
    return f"https://api.openstreetmap.org/api/0.6/map?bbox={bbox}"


def incomplete_landcover(root):
    nodes = {node.attrib["id"] for node in root.findall("node")}
    ways = {way.attrib["id"]: way for way in root.findall("way")}
    incomplete = []
    for relation in root.findall("relation"):
        tags = {tag.attrib["k"]: tag.attrib["v"] for tag in relation.findall("tag")}
        if tags.get("type") != "multipolygon" or classify(tags) not in {
            "forest", "grass", "field", "vineyard", "park", "water", "mountain",
        }:
            continue
        for member in relation.findall("member"):
            if member.attrib.get("type") != "way":
                continue
            way = ways.get(member.attrib["ref"])
            if way is None or any(nd.attrib["ref"] not in nodes for nd in way.findall("nd")):
                incomplete.append(relation.attrib["id"])
                break
    return incomplete


def _complete_landcover(root, on_progress):
    missing = incomplete_landcover(root)
    if len(missing) > MAX_LANDCOVER_COMPLETIONS:
        raise SourceUnavailable("Too many incomplete land-cover relations; use recursive source fallback.")
    urls = []
    elements = {(e.tag, e.attrib["id"]): e for e in root if e.tag in {"node", "way", "relation"}}
    for relation_id in missing:
        url = f"https://api.openstreetmap.org/api/0.6/relation/{relation_id}/full"
        if on_progress:
            on_progress({"phase": "download", "provider": "api.openstreetmap.org",
                         "relation": relation_id})
        request = urllib.request.Request(url, headers={"User-Agent": "ArcanePath/0.1 (OSM map prototype)"})
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                part = ET.fromstring(response.read())
        except urllib.error.HTTPError as error:
            raise _http_failure(error, error.read(4096).decode("utf-8", errors="replace")) from error
        if part.tag != "osm" or not any(
                r.attrib["id"] == relation_id for r in part.findall("relation")):
            raise SourceUnavailable(f"Incomplete land-cover response for relation {relation_id}.")
        for element in part:
            if element.tag in {"node", "way", "relation"}:
                elements[(element.tag, element.attrib["id"])] = element
        urls.append(url)
    if missing:
        for element in list(root):
            if element.tag in {"node", "way", "relation"}:
                root.remove(element)
        root.extend(elements.values())
        if incomplete_landcover(root):
            raise SourceUnavailable("OSM returned incomplete land-cover geometry after completion.")
    return urls


def _request_map(bounds, depth=0, on_progress=None):
    url = _map_url(bounds)
    request = urllib.request.Request(url, headers={"User-Agent": "ArcanePath/0.1 (OSM map prototype)"})
    if on_progress:
        on_progress({"phase": "download", "provider": "api.openstreetmap.org", "depth": depth})
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            root = ET.fromstring(response.read())
    except urllib.error.HTTPError as error:
        reason = error.read(4096).decode("utf-8", errors="replace")
        if error.code in {408, 429, 500, 502, 503, 504, 509}:
            raise _http_failure(error, reason) from error
        if error.code != 400 or "too many nodes" not in reason.lower() or depth >= 4:
            raise _http_failure(error, reason) from error
        print(f"OSM node limit reached; splitting bounds {bounds}.", file=sys.stderr)
        if on_progress:
            on_progress({"phase": "split", "depth": depth + 1})
        west, south, east, north = bounds
        middle = (west + east) / 2
        if (east - west) * math.cos(math.radians((south + north) / 2)) >= north - south:
            halves = ([west, south, middle, north], [middle, south, east, north])
        else:
            middle = (south + north) / 2
            halves = ([west, south, east, middle], [west, middle, east, north])
        first, first_urls = _request_map(halves[0], depth + 1, on_progress)
        second, second_urls = _request_map(halves[1], depth + 1, on_progress)
        root = ET.Element("osm", first.attrib)
        ET.SubElement(root, "bounds", {
            "minlon": str(west), "minlat": str(south),
            "maxlon": str(east), "maxlat": str(north),
        })
        elements = {}
        for part in (first, second):
            for element in part:
                if element.tag in {"node", "way", "relation"}:
                    key = (element.tag, element.attrib["id"])
                    previous = elements.get(key)
                    if previous is None or int(element.attrib.get("version", "0")) > int(previous.attrib.get("version", "0")):
                        elements[key] = element
        root.extend(elements.values())
        if depth == 0:
            first_urls += _complete_landcover(root, on_progress)
        return root, first_urls + second_urls
    if root.tag != "osm" or root.find("bounds") is None or root.find("node") is None:
        raise SourceUnavailable("The OSM API did not return a bounded map with nodes.")
    return root, [url, *(_complete_landcover(root, on_progress) if depth == 0 else [])]


def _request_overpass(bounds, url, on_progress=None):
    west, south, east, north = bounds
    bbox = ",".join(format(value, ".12g") for value in (south, west, north, east))
    # Transport and administrative relations can span entire countries.
    # Recurse only into the multipolygons used by the rasterizer.
    query = (f"[out:xml][timeout:60];"
             f"(node({bbox});way({bbox});rel({bbox})[type=multipolygon];);"
             "(._;>>;);out body;")
    request = urllib.request.Request(
        url, data=urllib.parse.urlencode({"data": query}).encode("ascii"),
        headers={"User-Agent": "ArcanePath/0.1 (OSM map prototype)"},
    )
    if on_progress:
        on_progress({"phase": "download", "provider": urllib.parse.urlparse(url).hostname,
                     "backup": True})
    try:
        with urllib.request.urlopen(request, timeout=75) as response:
            root = ET.fromstring(response.read())
    except urllib.error.HTTPError as error:
        reason = error.read(4096).decode("utf-8", errors="replace")
        raise _http_failure(error, reason) from error
    if root.tag != "osm" or root.find("remark") is not None or root.find("node") is None:
        raise SourceUnavailable("Overpass returned incomplete data or a runtime error.")
    if incomplete_landcover(root):
        raise SourceUnavailable("Overpass returned incomplete land-cover geometry.")
    for element in list(root.findall("bounds")):
        root.remove(element)
    ET.SubElement(root, "bounds", {
        "minlon": str(west), "minlat": str(south),
        "maxlon": str(east), "maxlat": str(north),
    })
    return root, [url]


def _request_sources(bounds, on_progress=None):
    failures = []
    # Serialize provider access across chunk workers, including cooldown checks.
    if on_progress:
        on_progress({"phase": "sourceQueue"})
    with _SOURCE_LOCK:
        for source in _rotating_sources(("https://api.openstreetmap.org", *OVERPASS_URLS)):
            remaining = _COOLDOWNS.get(source, 0) - time.monotonic()
            if remaining > 0:
                if on_progress:
                    on_progress({"phase": "cooldown", "provider": urllib.parse.urlparse(source).hostname,
                                 "seconds": math.ceil(remaining)})
                failures.append(f"{source}: cooldown ({math.ceil(remaining)} seconds)")
                continue
            try:
                return (_request_map(bounds, on_progress=on_progress) if source == "https://api.openstreetmap.org"
                        else _request_overpass(bounds, source, on_progress))
            except (SourceUnavailable, OSError, ET.ParseError) as error:
                _COOLDOWNS[source] = time.monotonic() + (
                    error.retry_after if isinstance(error, SourceUnavailable) else 60
                )
                message = f"{source}: {error}"
                failures.append(message)
                print(f"OSM source unavailable; trying fallback: {message}", file=sys.stderr)
                if on_progress:
                    on_progress({"phase": "fallback", "provider": urllib.parse.urlparse(source).hostname})
    raise SourceUnavailable("All OSM sources unavailable. " + " | ".join(failures))


def fetch_towns(latitude, longitude, venues=False, on_progress=None):
    """Fetch a bounded catalogue, not all regional geometry."""
    query = (f'[out:json][timeout:45];node(around:{2000 if venues else 60000},'
             f'{latitude:.6f},{longitude:.6f})' +
             ('["amenity"~"^(library|cafe|restaurant|theatre)$"]["name"];out body;'
              if venues else '["place"~"^(city|town)$"]["name"];out body;'))
    return fetch_catalogue(query, on_progress)


def fetch_accommodations(latitude, longitude):
    query = ('[out:json][timeout:20];nwr(around:5000,'
             f'{latitude:.6f},{longitude:.6f})'
             '["tourism"~"^(hotel|hostel|guest_house|motel|alpine_hut)$"];out center tags;')
    return fetch_catalogue(query)["elements"]


def fetch_catalogue(query, on_progress=None):
    failures = []
    with _SOURCE_LOCK:
        for source in _rotating_sources(OVERPASS_URLS):
            remaining = _COOLDOWNS.get(source, 0) - time.monotonic()
            if remaining > 0:
                failures.append(f"{source}: cooldown ({math.ceil(remaining)} seconds)")
                continue
            if on_progress:
                on_progress({"phase": "provider", "provider": urllib.parse.urlparse(source).hostname,
                             "backup": source != OVERPASS_URLS[0]})
            request = urllib.request.Request(
                source + "?" + urllib.parse.urlencode({"data": query}),
                headers={"User-Agent": "ArcanePath/0.4 (https://github.com/judelsuc/arcane-path)"},
            )
            try:
                with urllib.request.urlopen(request, timeout=60) as response:
                    data = json.load(response)
                if (not isinstance(data, dict) or data.get("remark")
                        or not isinstance(data.get("elements"), list)):
                    raise SourceUnavailable("Overpass returned an incomplete town catalogue.")
                return {"elements": data["elements"], "sourceUrl": source,
                        "retrievedAt": datetime.now(timezone.utc).isoformat()}
            except (OSError, ValueError) as error:
                if isinstance(error, urllib.error.HTTPError):
                    error = _http_failure(error, error.read(4096).decode("utf-8", errors="replace"))
                _COOLDOWNS[source] = time.monotonic() + (
                    error.retry_after if isinstance(error, SourceUnavailable) else 60
                )
                failures.append(f"{source}: {error}")
                print(f"Town catalogue unavailable; trying fallback: {source}: {error}", file=sys.stderr)
    delay = max(1, math.ceil(min(
        (_COOLDOWNS.get(source, 0) - time.monotonic() for source in OVERPASS_URLS),
        default=60)))
    raise SourceUnavailable("Town catalogue unavailable. " + " | ".join(failures), delay)


def download_region(bounds, name, output, refresh=False, reference_bounds=None, on_progress=None):
    west, south, east, north = bounds
    if (
        not all(math.isfinite(value) for value in bounds)
        or not -180 <= west < east <= 180
        or not -90 <= south < north <= 90
        or (east - west) * (north - south) > 0.25
    ):
        raise ValueError("Invalid bounds: use west south east north, at most 0.25 square degrees.")
    if reference_bounds:
        rw, rs, re, rn = reference_bounds
        if (not all(math.isfinite(value) for value in reference_bounds)
                or not west <= rw < re <= east or not south <= rs < rn <= north):
            raise ValueError("Reference bounds must be inside the downloaded region.")
    url = _map_url(bounds)
    if output.exists() and not refresh:
        opener = gzip.open if output.suffix == ".gz" else open
        with opener(output, "rb") as stream:
            cached = ET.parse(stream).getroot()
        reference_bbox = ",".join(map(str, reference_bounds)) if reference_bounds else None
        if (cached.attrib.get("source_url") == url and cached.attrib.get("region_name") == name
                and cached.attrib.get("reference_bbox") == reference_bbox):
            if cached.find("bounds") is None or cached.find("node") is None:
                raise ValueError("Incomplete cached OSM snapshot; use --refresh to download again.")
            if on_progress:
                on_progress({"phase": "cache"})
            return url, output.stat().st_size, True
    root, source_urls = _request_sources(bounds, on_progress)
    root.set("source_url", url)
    root.set("source_urls", json.dumps(source_urls))
    root.set("region_name", name)
    if reference_bounds:
        root.set("reference_bbox", ",".join(map(str, reference_bounds)))
    root.set("downloaded_at", datetime.now(timezone.utc).isoformat())
    # Contributor-account metadata is not needed to rasterize the map. Preserve
    # all OSM IDs, coordinates, tags, references, and license information.
    for element in root:
        if element.tag in {"node", "way", "relation"}:
            for key in tuple(element.attrib):
                if key not in {"id", "lat", "lon"}:
                    del element.attrib[key]
    data = ET.tostring(root, encoding="utf-8", xml_declaration=True)
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.suffix == ".gz":
        data = gzip.compress(data, mtime=0)
    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile(dir=output.parent, delete=False) as stream:
            temporary_path = Path(stream.name)
            stream.write(data)
        temporary_path.replace(output)
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)
    return url, len(data), False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bbox", type=float, nargs=4, required=True, metavar=("WEST", "SOUTH", "EAST", "NORTH"))
    parser.add_argument("--name", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--refresh", action="store_true", help="Download again even when a matching snapshot is cached")
    parser.add_argument("--reference-bbox", type=float, nargs=4, help="Preserve a reference-map framing inside the downloaded bounds")
    args = parser.parse_args()
    try:
        url, size, reused = download_region(args.bbox, args.name, args.output, args.refresh, args.reference_bbox)
    except (OSError, ValueError, ET.ParseError, urllib.error.URLError) as error:
        print(f"OSM download failed: {error}", file=sys.stderr)
        return 1
    print(f"{'Cached' if reused else 'Downloaded'} {args.name}: {url} -> {args.output} ({size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
