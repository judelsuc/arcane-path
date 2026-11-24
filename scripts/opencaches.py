"""Import bounded public OpenCaching metadata for configured areas, never player traces."""

import argparse
import hashlib
from html.parser import HTMLParser
import json
import logging
import math
import re
import sqlite3
import time
import urllib.error
import urllib.parse
import urllib.request

from asset_storage import AssetError, configured_storage
from content_factory import NoRedirect
from journey_storage import geographic_position, grid_position
from terraform_ovh import private_file
from pathlib import Path

SITES = {"de": "https://www.opencaching.de", "pl": "https://opencaching.pl", "uk": "https://opencache.uk"}
SCHEMAS = (
    """CREATE TABLE IF NOT EXISTS opencaches (
        id TEXT PRIMARY KEY, site TEXT NOT NULL, scope TEXT NOT NULL, payload TEXT NOT NULL,
        latitude DOUBLE PRECISION NOT NULL, longitude DOUBLE PRECISION NOT NULL,
        updated DOUBLE PRECISION NOT NULL, available INTEGER NOT NULL)""",
)
MAX_AGE = 7 * 86400


class AttributionText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)

    def handle_starttag(self, tag, attrs):
        if tag in ("p", "br", "div", "li"):
            self.parts.append(" ")
        if tag == "a":
            href = dict(attrs).get("href", "")
            if href.startswith(("http://", "https://")):
                self.parts.append(f" ({href}) ")


def plain_attribution(value):
    if not isinstance(value, str) or not 1 <= len(value) <= 12000:
        raise AssetError("OpenCaching attribution is missing or oversized.")
    parser = AttributionText()
    parser.feed(value)
    return " ".join("".join(parser.parts).split())


def distance(lat, lon, other_lat, other_lon):
    a, b = math.radians(lat), math.radians(other_lat)
    h = math.sin((b - a) / 2) ** 2 + math.cos(a) * math.cos(b) * math.sin(math.radians(other_lon - lon) / 2) ** 2
    return 12742.0176 * math.asin(min(1, math.sqrt(h)))


def fetch(site, center, radius, key, *, opener=None):
    if (site not in SITES or len(center) != 2 or any(not math.isfinite(value) for value in center) or
            not 34 <= center[0] <= 72 or not -32 <= center[1] <= 60 or
            not math.isfinite(radius) or not 0 < radius <= 20 or
            not isinstance(key, str) or not key or not key.isascii() or any(char.isspace() for char in key)):
        raise ValueError("Choose a supported OpenCaching site, European centre, radius up to 20 km and valid consumer key.")
    params = {"consumer_key": key, "search_method": "services/caches/search/nearest",
              "search_params": json.dumps({"center": f"{center[0]}|{center[1]}", "radius": radius,
                                           "type": "Traditional", "status": "Available", "limit": 100}),
              "retr_method": "services/caches/geocaches",
              "retr_params": json.dumps({"fields": "code|name|location|type|status|url|attribution_note|oc_team_annotation",
                                        "oc_team_annotation": "separate", "langpref": "en|fr"}),
              "wrap": "true", "format": "json"}
    request = urllib.request.Request(SITES[site] + "/okapi/services/caches/shortcuts/search_and_retrieve",
                                     data=urllib.parse.urlencode(params).encode(),
                                     headers={"User-Agent": "ArcanePath-PublicCacheMetadata/1",
                                              "Content-Type": "application/x-www-form-urlencoded"})
    try:
        with (opener or urllib.request.build_opener(NoRedirect())).open(request, timeout=30) as response:
            raw = response.read(1024 * 1024 + 1)
            if response.status != 200 or len(raw) > 1024 * 1024:
                raise AssetError("OpenCaching metadata response was unsuccessful or oversized.")
            value = json.loads(raw)
    except urllib.error.HTTPError as error:
        error.close()
        raise AssetError("OpenCaching metadata request failed; previous data retained.") from None
    except (OSError, ValueError) as error:
        raise AssetError("OpenCaching metadata unavailable; previous data retained.") from error
    if (not isinstance(value, dict) or not isinstance(value.get("results"), dict) or
            type(value.get("more")) is not bool or len(value["results"]) > 100):
        raise AssetError("Invalid OpenCaching response structure.")
    # Never silently truncate a region and present it as complete.
    if value["more"]:
        raise AssetError("More than 100 caches in this area; configure smaller import areas.")
    result = []
    for code, item in value["results"].items():
        if item is None:
            continue
        if not isinstance(item, dict):
            raise AssetError("Invalid OpenCaching cache metadata.")
        if item.get("status") != "Available" or item.get("type") != "Traditional":
            continue
        if (not isinstance(code, str) or not re.fullmatch(r"[A-Z]{2}[A-Z0-9]{1,14}", code) or
                item.get("code") != code or not isinstance(item.get("name"), str) or
                not 1 <= len(item["name"]) <= 200 or not isinstance(item.get("location"), str) or
                not isinstance(item.get("url"), str) or len(item["url"]) > 1000):
            raise AssetError("Invalid OpenCaching cache identity.")
        try:
            latitude, longitude = map(float, item["location"].split("|"))
            url = urllib.parse.urlsplit(item["url"])
        except ValueError as error:
            raise AssetError("Invalid OpenCaching coordinates or URL.") from error
        if (not math.isfinite(latitude) or not math.isfinite(longitude) or not 34 <= latitude <= 72 or
                not -32 <= longitude <= 60 or distance(*center, latitude, longitude) > radius + .05 or
                url.scheme != "https" or url.hostname not in
                (urllib.parse.urlsplit(SITES[site]).hostname, urllib.parse.urlsplit(SITES[site]).hostname.removeprefix("www.")) or
                url.username or url.password or url.netloc not in
                (urllib.parse.urlsplit(SITES[site]).netloc, urllib.parse.urlsplit(SITES[site]).netloc.removeprefix("www."))):
            raise AssetError("OpenCaching cache lies outside its requested area or trusted source.")
        result.append({"id": f"{site}:{code}", "code": code, "name": item["name"], "url": item["url"],
                       "latitude": latitude, "longitude": longitude,
                       "attribution": plain_attribution(item.get("attribution_note")),
                       "annotation": plain_attribution(item["oc_team_annotation"]) if item.get("oc_team_annotation") else ""})
    return result


def synchronize(assets, site, center, radius, records, *, now=None):
    now = time.time() if now is None else now
    scope = hashlib.sha256(json.dumps([site, center, radius]).encode()).hexdigest()
    with assets.catalogue.connection() as db:
        if not assets.catalogue.postgres:
            db.execute("BEGIN IMMEDIATE")
        db.execute(assets.catalogue.sql("UPDATE opencaches SET available=0 WHERE site=? AND scope=?"), (site, scope))
        for item in records:
            db.execute(assets.catalogue.sql(
                "INSERT INTO opencaches(id,site,scope,payload,latitude,longitude,updated,available) VALUES(?,?,?,?,?,?,?,1) "
                "ON CONFLICT(id) DO UPDATE SET scope=excluded.scope,payload=excluded.payload,"
                "latitude=excluded.latitude,longitude=excluded.longitude,updated=excluded.updated,available=1"),
                (item["id"], site, scope, json.dumps(item), item["latitude"], item["longitude"], now))


def offers(db, sql, base, position, opened, now):
    latitude, longitude = geographic_position(base, position["col"], position["row"])
    step = base["cellSizeMeters"] / 6371008.8 * 180 / math.pi
    projection = base.get("projectionLatitude", (base["bounds"]["minLatitude"] + base["bounds"]["maxLatitude"]) / 2)
    half_width = step / (2 * math.cos(math.radians(projection)))
    rows = db.execute(sql("SELECT payload,latitude,longitude FROM opencaches WHERE available=1 AND updated>? "
                          "AND latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?"),
                      (now - MAX_AGE, latitude - step / 2, latitude + step / 2,
                       longitude - half_width, longitude + half_width)).fetchall()
    result = []
    for row in rows:
        payload, latitude, longitude = row[0], row[1], row[2]
        item = json.loads(payload)
        if item["id"] not in opened and grid_position(base, latitude, longitude) == (position["col"], position["row"]):
            result.append(item)
    return sorted(result, key=lambda item: item["id"])[:20]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site", choices=SITES, required=True)
    parser.add_argument("--center", type=float, nargs=2, required=True, metavar=("LAT", "LON"))
    parser.add_argument("--radius", type=float, default=5)
    parser.add_argument("--key-file", type=Path, required=True)
    args = parser.parse_args()
    assets = configured_storage()
    if assets is None:
        parser.error("Shared asset storage must be configured.")
    try:
        records = fetch(args.site, args.center, args.radius, private_file(args.key_file).strip())
        synchronize(assets, args.site, args.center, args.radius, records)
        print(json.dumps({"site": args.site, "retained": len(records)}))
    except (AssetError, OSError, ValueError, sqlite3.Error) as error:
        logging.error("OpenCaching sync stopped: %s", error)
        raise SystemExit(1)
    finally:
        assets.catalogue.close()


if __name__ == "__main__":
    main()
