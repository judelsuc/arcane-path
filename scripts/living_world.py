"""Bounded, attributed public event acquisition; never invent missing coverage."""

from datetime import datetime, timezone
import gzip
import hashlib
import io
import json
import logging
import math
import re
import time
import urllib.parse
import urllib.request

ENDPOINT = "https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/evenements-publics-openagenda/records"
LICENSE = {"name": "Open Licence 1.0",
           "url": "https://www.etalab.gouv.fr/wp-content/uploads/2014/05/Licence_Ouverte.pdf"}
DAY = 86400
MAX_BYTES = 4_000_000


def query_position(latitude, longitude):
    if (not all(math.isfinite(v) for v in (latitude, longitude))
            or not -85 <= latitude <= 85 or not -180 <= longitude <= 180):
        raise ValueError("Invalid living-world coordinates.")
    return round(latitude, 2), round(longitude, 2)


def instant(value):
    date = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if date.tzinfo is None:
        raise ValueError("Event time has no timezone.")
    return round(date.timestamp() * 1000)


def distance(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6371000 * 2 * math.asin(math.sqrt(min(1, max(0, h))))


def normalize(payload, latitude, longitude, observed):
    if (not isinstance(payload, dict) or not isinstance(payload.get("results"), list)
            or type(payload.get("total_count")) is not int or payload["total_count"] < 0
            or len(payload["results"]) > 64):
        raise ValueError("Invalid OpenAgenda result envelope.")
    records, seen = [], set()
    rejected = 0
    truncated = payload["total_count"] > len(payload["results"])
    start, end = round(observed * 1000), round((observed + 7 * DAY) * 1000)
    for row in payload["results"]:
        try:
            uid = row["uid"]
            if not isinstance(uid, str) or not re.fullmatch(r"\d{1,30}", uid):
                raise ValueError("Invalid event identifier.")
            title = re.sub(r"[\x00-\x1f]", " ", row["title_fr"]).strip()
            if not title or len(title.encode("utf-16-le")) > 480 or "<" in title or ">" in title:
                raise ValueError("Invalid event title.")
            url = urllib.parse.urlsplit(row["canonicalurl"])
            if (len(row["canonicalurl"]) > 2048 or url.scheme != "https"
                    or url.hostname != "openagenda.com" or url.username or url.password):
                raise ValueError("Invalid event source URL.")
            point = row["location_coordinates"]
            if any(type(point[key]) not in (int, float) for key in ("lat", "lon")):
                raise ValueError("Invalid event coordinates.")
            lat, lon = float(point["lat"]), float(point["lon"])
            query_position(lat, lon)
            if distance((latitude, longitude), (lat, lon)) > 20000:
                raise ValueError("Event lies outside the requested area.")
            status = json.loads(row["status"])
            if type(status["id"]) is not int or status["id"] != 1:
                raise ValueError("Event is not scheduled.")
            timings = json.loads(row["timings"])
            if not isinstance(timings, list) or len(timings) > 4096:
                raise ValueError("Invalid event occurrences.")
            occurrences = {}
            for occurrence in timings:
                begins, ends = instant(occurrence["begin"]), instant(occurrence["end"])
                if ends <= begins or ends - begins > 62 * DAY * 1000:
                    raise ValueError("Invalid occurrence duration.")
                if ends <= start or begins >= end:
                    continue
                identity = f"oa:{uid}:{begins}"
                if identity in seen or identity in occurrences:
                    continue
                if len(records) + len(occurrences) == 128:
                    truncated = True
                    break
                occurrences[identity] = {
                    "id": identity, "kind": "event", "reality": "public",
                    "title": {"fr": title, "en": title},
                    "startsAt": begins, "endsAt": ends,
                    "area": {"lat": lat, "lon": lon, "radiusMeters": 1000},
                    "source": {"id": "openagenda", "name": "OpenAgenda / Opendatasoft",
                               "url": row["canonicalurl"], "observedAt": start,
                               "validUntil": start + DAY * 1000},
                }
            records.extend(occurrences.values())
            seen.update(occurrences)
        except (KeyError, TypeError, ValueError, AttributeError, OverflowError) as error:
            rejected += 1
            logging.warning("OpenAgenda record omitted: %s", error)
    records.sort(key=lambda r: (r["startsAt"], r["id"]))
    result = {
        "version": 1, "importedAt": start, "records": records,
        "coverage": {"provider": "OpenAgenda / Opendatasoft", "license": LICENSE,
                     "latitude": latitude, "longitude": longitude, "radiusMeters": 20000,
                     "sourceRows": len(payload["results"]), "matchingRows": payload["total_count"],
                     "rejectedRows": rejected, "truncated": truncated,
                     "titleLanguage": "fr", "eventImagesIncluded": False},
    }
    while len(json.dumps(result, ensure_ascii=False).encode()) > 262144:
        result["records"].pop()
        result["coverage"]["truncated"] = True
    return result


def acquire(latitude, longitude, observed):
    day = datetime.fromtimestamp(observed, timezone.utc).isoformat()
    last = datetime.fromtimestamp(observed + 7 * DAY, timezone.utc).isoformat()
    query = urllib.parse.urlencode({
        "select": "uid,title_fr,canonicalurl,timings,location_coordinates,status",
        "where": f"within_distance(location_coordinates, GEOM'POINT({longitude} {latitude})', 20km) "
                 f"AND lastdate_end >= date'{day}' AND firstdate_begin <= date'{last}'",
        "order_by": "lastdate_begin ASC", "limit": 64,
    })
    request = urllib.request.Request(ENDPOINT + "?" + query, headers={
        "User-Agent": "ArcanePath/0.3 (public event preview)", "Accept": "application/json",
        "Accept-Encoding": "identity",
    })
    with urllib.request.urlopen(request, timeout=20) as response:
        raw = response.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError("OpenAgenda response exceeds 4 MB.")
    if raw.startswith(b"\x1f\x8b"):
        with gzip.GzipFile(fileobj=io.BytesIO(raw)) as stream:
            raw = stream.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise ValueError("Decoded OpenAgenda response exceeds 4 MB.")
    return normalize(json.loads(raw), latitude, longitude, observed)


class LivingWorld:
    def __init__(self, cache, write, *, fetcher=acquire, clock=time.time):
        self.cache, self.write, self.fetcher, self.clock = cache, write, fetcher, clock

    def path(self, latitude, longitude):
        latitude, longitude = query_position(latitude, longitude)
        key = hashlib.sha256(f"{latitude:.2f},{longitude:.2f}".encode()).hexdigest()[:24]
        return self.cache / f"v1-{key}.json"

    def read(self, latitude, longitude):
        path = self.path(latitude, longitude)
        if not path.exists():
            return None
        envelope = json.loads(path.read_text())
        data = envelope["data"]
        if hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest() != envelope["sha256"]:
            raise ValueError("Corrupt public-event cache.")
        age = self.clock() * 1000 - data["importedAt"]
        return data if 0 <= age < 6 * 3600 * 1000 else None

    def build(self, latitude, longitude):
        cached = self.read(latitude, longitude)
        if cached is not None:
            return cached
        latitude, longitude = query_position(latitude, longitude)
        data = self.fetcher(latitude, longitude, self.clock())
        self.write(self.path(latitude, longitude), json.dumps({
            "data": data, "sha256": hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest(),
        }).encode())
        return data
