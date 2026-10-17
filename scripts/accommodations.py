"""Bounded OSM lodging lookup and an administrator-imported DATAtourisme catalogue."""

import argparse
import csv
import hashlib
import io
import json
import logging
import math
import sqlite3
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from contextlib import closing
from pathlib import Path

from fetch_osm import fetch_accommodations
from town_trail import distance, grid_position

DATASET = "https://www.data.gouv.fr/api/1/datasets/datatourisme-la-plateforme-nationale-des-donnees-touristiques/"
LICENSE = "https://www.etalab.gouv.fr/licence-ouverte-open-licence/"
KINDS = {"hotel", "hostel", "guest_house", "motel", "alpine_hut"}
DATATOURISME_KINDS = {"Hotel": "hotel", "YouthHostelAndInternationalCenter": "hostel",
                     "Guesthouse": "guest_house", "BedAndBreakfast": "guest_house"}
HEADERS = {"User-Agent": "ArcanePath/0.4 (https://github.com/judelsuc/arcane-path)"}


def import_datatourisme(database, stream):
    """Admin operation only; atomically replace the catalogue after a valid import."""
    csv.field_size_limit(2_000_000)
    reader = csv.DictReader(stream)
    required = {"Nom_du_POI", "Categories_de_POI", "Latitude", "Longitude",
                "Createur_de_la_donnee", "Date_de_mise_a_jour", "URI_ID_du_POI"}
    if not required.issubset(reader.fieldnames or []):
        raise ValueError("Unsupported DATAtourisme CSV columns.")
    database.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(database)) as db, db:
        db.execute("CREATE TABLE IF NOT EXISTS lodging (id TEXT PRIMARY KEY, name TEXT, "
                   "latitude REAL, longitude REAL, kind TEXT, producer TEXT, updated TEXT)")
        db.execute("DELETE FROM lodging")
        count = 0
        for row in reader:
            categories = {value.strip().rsplit("#", 1)[-1] for value in row["Categories_de_POI"].split("|")}
            kind = next((kind for category, kind in DATATOURISME_KINDS.items()
                         if category in categories), None)
            if not kind:
                continue
            latitude, longitude = float(row["Latitude"]), float(row["Longitude"])
            identity = row["URI_ID_du_POI"]
            if (not math.isfinite(latitude) or not math.isfinite(longitude)
                    or not -90 <= latitude <= 90 or not -180 <= longitude <= 180
                    or not identity.startswith("https://data.datatourisme.fr/")
                    or not all(row[key].strip() for key in
                               ("Nom_du_POI", "Createur_de_la_donnee", "Date_de_mise_a_jour"))):
                raise ValueError("Invalid DATAtourisme accommodation record.")
            db.execute("INSERT OR REPLACE INTO lodging VALUES (?,?,?,?,?,?,?)",
                       (identity, row["Nom_du_POI"], latitude, longitude, kind,
                        row["Createur_de_la_donnee"], row["Date_de_mise_a_jour"]))
            count += 1
        if not count:
            raise ValueError("DATAtourisme export contains no accommodations.")
        db.execute("CREATE INDEX IF NOT EXISTS lodging_coordinates ON lodging(latitude,longitude)")
    return count


class Accommodations:
    def __init__(self, chunks, write):
        self.chunks, self.write = chunks, write
        self.cache = chunks.cache / "accommodations"
        self.lock = threading.Lock()
        self.progress = {}

    def get_progress(self, region, latitude, longitude):
        with self.lock:
            return dict(self.progress.get((region, latitude, longitude), {"phase": "queued"}))

    def path(self, region, latitude, longitude):
        identity = hashlib.sha256(json.dumps([region, latitude, longitude]).encode()).hexdigest()
        return self.cache / f"{identity}.json"

    def read(self, region, latitude, longitude):
        path = self.path(region, latitude, longitude)
        if not path.exists() or time.time() - path.stat().st_mtime > 7 * 86400:
            return None
        return json.loads(path.read_text())

    def osm(self, latitude, longitude, on_progress=None):
        return fetch_accommodations(latitude, longitude, on_progress)

    def mapped(self, region, latitude, longitude):
        base = self.chunks.bases[region]
        position = grid_position(base, latitude, longitude)
        radius = math.ceil(5000 / base["cellSizeMeters"])
        maps = [base]
        for x in range((position["col"] - radius) // 8, (position["col"] + radius) // 8 + 1):
            for y in range((position["row"] - radius) // 8, (position["row"] + radius) // 8 + 1):
                chunk = self.chunks.read(region, x, y)
                if chunk:
                    maps.append(chunk)
        elements = {}
        for data in maps:
            for row in data["rows"]:
                for cell in row:
                    for poi in cell.get("pois", []):
                        if poi.get("tags", {}).get("tourism") not in KINDS:
                            continue
                        kind, identity = poi["osmId"].split("/")
                        point = {"lat": poi["latitude"], "lon": poi["longitude"]}
                        elements[poi["osmId"]] = {
                            "type": kind, "id": int(identity),
                            "tags": {**poi["tags"], "name": poi.get("name", "")},
                            **(point if kind == "node" else {"center": point}),
                        }
        return list(elements.values())

    def datatourisme(self, latitude, longitude):
        database = self.cache / "datatourisme.sqlite"
        if not database.exists():
            return [], "DATAtourisme catalogue has not been imported by the administrator."
        latitude_span = math.degrees(5000 / 6371008.8)
        longitude_span = min(180, latitude_span / max(.000001, math.cos(math.radians(latitude))))
        with closing(sqlite3.connect(f"file:{database}?mode=ro", uri=True)) as db:
            rows = db.execute("SELECT id,name,latitude,longitude,kind,producer,updated FROM lodging "
                "WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?",
                (latitude - latitude_span, latitude + latitude_span,
                 longitude - longitude_span, longitude + longitude_span)).fetchall()
        return [{"id": row[0], "name": row[1], "latitude": row[2], "longitude": row[3],
                 "tags": {"tourism": row[4]}, "source": "DATAtourisme", "sourceUrl": row[0],
                 "credit": row[5], "updated": row[6], "license": "Licence Ouverte 2.0",
                 "licenseUrl": LICENSE} for row in rows], None

    def build(self, region, latitude, longitude):
        key = (region, latitude, longitude)

        def update(event):
            with self.lock:
                self.progress[key] = event

        try:
            return self.build_with_progress(region, latitude, longitude, update)
        finally:
            with self.lock:
                self.progress.pop(key, None)

    def build_with_progress(self, region, latitude, longitude, update):
        origin = {"latitude": latitude, "longitude": longitude}
        places, warnings = [], []
        update({"phase": "maps"})
        elements = self.mapped(region, latitude, longitude)
        try:
            update({"phase": "osm"})
            elements += self.osm(latitude, longitude, update)
        except ValueError as error:
            logging.warning("Accommodation source unavailable: %s", error)
            warnings.append("OpenStreetMap live lookup unavailable; only cached maps and imported catalogues could be checked.")
        unique = {}
        for item in elements:
            if (not isinstance(item, dict) or item.get("type") not in {"node", "way", "relation"}
                    or type(item.get("id")) is not int):
                raise ValueError("Invalid accommodation record.")
            unique[item["type"], item["id"]] = item
        for item in unique.values():
            if not isinstance(item, dict) or not isinstance(item.get("tags", {}), dict):
                raise ValueError("Invalid accommodation record.")
            tags = item.get("tags", {})
            point = item if item.get("type") == "node" else item.get("center", {})
            if not isinstance(point, dict):
                raise ValueError("Invalid accommodation coordinates.")
            if (item.get("type") not in {"node", "way", "relation"}
                    or type(item.get("id")) is not int or item["id"] <= 0
                    or tags.get("tourism") not in KINDS or tags.get("access") in {"private", "no"}
                    or tags.get("disused", "no") != "no" or tags.get("abandoned", "no") != "no"):
                continue
            lat, lon = point.get("lat"), point.get("lon")
            if (any(type(v) not in (float, int) or not math.isfinite(v) for v in (lat, lon))
                    or not -90 <= lat <= 90 or not -180 <= lon <= 180
                    or not isinstance(tags.get("name", ""), str)):
                raise ValueError("Invalid accommodation coordinates.")
            osm_id = f'{item["type"]}/{item["id"]}'
            places.append({"id": osm_id, "osmId": osm_id, "name": tags.get("name", ""),
                           "latitude": lat, "longitude": lon, "tags": tags, "source": "OpenStreetMap",
                           "sourceUrl": f"https://www.openstreetmap.org/{osm_id}",
                           "credit": "OpenStreetMap contributors", "license": "ODbL",
                           "licenseUrl": "https://www.openstreetmap.org/copyright"})
        # Supplement sparse OSM coverage, not just a completely empty result.
        if len(places) < 5 and 41 <= latitude <= 52 and -6 <= longitude <= 10:
            update({"phase": "catalogue"})
            extra, warning = self.datatourisme(latitude, longitude)
            if warning:
                warnings.append(warning)
            for place in extra:
                if not any(distance(place, found) < 100 and
                           place["name"].casefold() == found["name"].casefold() for found in places):
                    places.append(place)
        update({"phase": "filtering"})
        found = []
        for place in places:
            meters = distance(origin, place)
            if meters <= 5000:
                found.append({**place, "distance": round(meters),
                              **grid_position(self.chunks.bases[region], place["latitude"], place["longitude"])})
        found.sort(key=lambda place: (place["distance"], place["id"]))
        result = {"places": found[:40], "warnings": warnings, "radiusMeters": 5000}
        if not warnings:
            update({"phase": "saving"})
            self.write(self.path(region, latitude, longitude), json.dumps(result).encode())
        return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, required=True)
    args = parser.parse_args()
    request = urllib.request.Request(DATASET, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=30) as response:
        dataset = json.load(response)
    resource = next(r for r in dataset["resources"] if r["title"] == "datatourisme-place.csv")
    if not resource["url"].startswith("https://static.data.gouv.fr/"):
        raise ValueError("Unexpected official export URL.")
    request = urllib.request.Request(resource["url"], headers=HEADERS)
    with urllib.request.urlopen(request, timeout=120) as response:
        count = import_datatourisme(args.database, io.TextIOWrapper(response, encoding="utf-8-sig"))
    print(f"Imported {count} DATAtourisme accommodation records.")
