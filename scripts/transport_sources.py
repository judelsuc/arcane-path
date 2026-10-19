"""Discover European GTFS feeds and import real, dated bus/train services offline."""

import argparse
from collections import Counter, defaultdict
import csv
from datetime import date, datetime, time, timedelta, timezone
import hashlib
import io
import json
import math
from pathlib import Path
import re
import tempfile
import urllib.parse
import urllib.request
import zipfile
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

CATALOG_URL = "https://files.mobilitydatabase.org/feeds_v2.csv"
EUROPE = tuple(sorted(
    "AL AD AT BY BE BA BG HR CY CZ DK EE FI FR DE GR HU IS IE IT XK LV LI LT LU "
    "MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SE CH TR UA GB VA".split()))
MAX_DOWNLOAD = 64 * 1024 * 1024
MAX_UNCOMPRESSED = 512 * 1024 * 1024
MAX_ROWS = 5_000_000


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent,
                                         prefix=".transport-", delete=False) as target:
            temporary = Path(target.name)
            json.dump(value, target, ensure_ascii=False, indent=2, allow_nan=False)
            target.write("\n")
        temporary.replace(path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def public_url(value):
    if not value:
        return None
    parts = urllib.parse.urlsplit(value)
    if parts.scheme not in ("http", "https") or not parts.hostname or parts.username or parts.password:
        return None
    # Catalogue URLs sometimes contain publisher tokens. Never export them.
    if parts.query or parts.fragment:
        return None
    return value


def feed_url(feed_id):
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,150}", feed_id):
        raise ValueError("Invalid Mobility Database feed ID.")
    return f"https://files.mobilitydatabase.org/{feed_id}/latest.zip"


class MirrorRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, url):
        parts = urllib.parse.urlsplit(url)
        if parts.scheme != "https" or parts.netloc != "files.mobilitydatabase.org":
            raise ValueError("Unexpected catalogue mirror redirect; review source explicitly.")
        return super().redirect_request(request, fp, code, msg, headers, url)


def download(url, maximum=MAX_DOWNLOAD):
    parts = urllib.parse.urlsplit(url)
    if parts.scheme != "https" or parts.netloc != "files.mobilitydatabase.org":
        raise ValueError("Only the public HTTPS Mobility Database mirror is supported.")
    opener = urllib.request.build_opener(MirrorRedirects())
    request = urllib.request.Request(url, headers={"User-Agent": "ArcanePath/transport-source-pilot"})
    with opener.open(request, timeout=60) as response:
        if int(response.headers.get("Content-Length", "0")) > maximum:
            raise ValueError("Feed exceeds the download limit; use a bounded regional source.")
        data = response.read(maximum + 1)
    if len(data) > maximum:
        raise ValueError("Feed exceeds the download limit; use a bounded regional source.")
    return data


def build_catalog(payload, retrieved_at):
    if len(payload) > 20 * 1024 * 1024:
        raise ValueError("Catalogue exceeds 20 MiB.")
    reader = csv.DictReader(io.StringIO(payload.decode("utf-8-sig")))
    required = {"id", "data_type", "location.country_code", "provider", "status",
                "urls.latest", "urls.license", "urls.authentication_type"}
    if not required <= set(reader.fieldnames or []):
        raise ValueError("Unrecognized Mobility Database CSV schema.")
    feeds, ids = [], set()
    for row in reader:
        if None in row or any(value is None for value in row.values()):
            raise ValueError("Malformed catalogue CSV row.")
        country = row["location.country_code"]
        if row["data_type"] != "gtfs" or country not in EUROPE:
            continue
        # One feed can appear in several country rows (e.g. international rail).
        identity = (row["id"], country)
        if identity in ids:
            raise ValueError("Duplicate feed/country in catalogue.")
        ids.add(identity)
        expected = feed_url(row["id"])
        coordinates = [row.get(f"location.bounding_box.{key}", "") for key in (
            "minimum_longitude", "minimum_latitude", "maximum_longitude", "maximum_latitude")]
        bounds, bounds_status = None, "missing"
        if all(coordinates):
            try:
                values = [float(v) for v in coordinates]
            except ValueError:
                bounds_status = "invalid-source-bounds"
            else:
                west, south, east, north = values
                if (all(math.isfinite(v) for v in values) and
                        -180 <= west <= east <= 180 and -90 <= south <= north <= 90):
                    bounds, bounds_status = values, "catalogued-not-verified"
                else:
                    bounds_status = "invalid-source-bounds"
        feeds.append({
            "id": row["id"], "country": country, "provider": row["provider"],
            "name": row.get("name", ""), "status": row["status"] or "unknown",
            "official": row.get("is_official", "").lower() == "true",
            "authenticationRequired": row["urls.authentication_type"] not in ("", "0"),
            "mirrorUrl": expected if row["urls.latest"] == expected else None,
            "licenseUrl": public_url(row["urls.license"]),
            "bounds": bounds, "boundsStatus": bounds_status,
            "boundsObservedAt": row.get("location.bounding_box.extracted_on") or None,
        })
    feeds.sort(key=lambda feed: (feed["country"], feed["id"]))
    coverage = {}
    for country in EUROPE:
        entries = [feed for feed in feeds if feed["country"] == country]
        coverage[country] = {
            "catalogEntries": len(entries),
            "activeEntries": sum(feed["status"] == "active" for feed in entries),
            "activePublicMirrorWithLicenseLink": sum(
                feed["status"] == "active" and not feed["authenticationRequired"] and
                bool(feed["mirrorUrl"]) and bool(feed["licenseUrl"]) for feed in entries),
            "status": "catalogued-not-verified" if entries else "no-catalogued-feed",
        }
    return {"version": 1, "source": CATALOG_URL, "retrievedAt": retrieved_at,
            "sourceSha256": hashlib.sha256(payload).hexdigest(),
            "notice": "Catalogue metadata only. A licence link is not a rights review; "
                      "a bounding box is not complete geographic coverage.",
            "coverage": coverage, "feeds": feeds}


def find_feeds(catalog, country=None, bounds=None):
    if country is not None and country not in EUROPE:
        raise ValueError("Unknown European country code.")
    if bounds is not None:
        west, south, east, north = bounds
        if not (-180 <= west <= east <= 180 and -90 <= south <= north <= 90):
            raise ValueError("Invalid west,south,east,north bounds.")
    result = []
    for feed in catalog["feeds"]:
        if country and feed["country"] != country:
            continue
        if bounds is not None:
            if feed["bounds"] is None:
                continue
            w, s, e, n = feed["bounds"]
            if e < west or w > east or n < south or s > north:
                continue
        result.append(feed)
    return result


class GTFS:
    def __init__(self, payload):
        if len(payload) > MAX_DOWNLOAD:
            raise ValueError("GTFS exceeds download size bound.")
        self.archive = zipfile.ZipFile(io.BytesIO(payload))
        self.files = {}
        total = 0
        for member in self.archive.infolist():
            if member.is_dir():
                continue
            total += member.file_size
            name = member.filename.rsplit("/", 1)[-1]
            if name in self.files:
                self.archive.close()
                raise ValueError(f"Ambiguous duplicate GTFS table: {name}")
            self.files[name] = member
        if total > MAX_UNCOMPRESSED or len(self.files) > 256:
            self.archive.close()
            raise ValueError("GTFS uncompressed size/member limit exceeded.")
        self.row_count = 0

    def rows(self, name, columns=(), required=False):
        member = self.files.get(name)
        if member is None:
            if required:
                raise ValueError(f"Missing GTFS table: {name}")
            return
        with self.archive.open(member) as stream:
            reader = csv.DictReader(io.TextIOWrapper(stream, encoding="utf-8-sig", newline=""))
            if not set(columns) <= set(reader.fieldnames or []):
                raise ValueError(f"Missing columns in {name}: {columns}")
            for row in reader:
                self.row_count += 1
                if self.row_count > MAX_ROWS:
                    raise ValueError("GTFS row limit exceeded; choose a smaller feed.")
                if None in row or any(v is None for v in row.values()):
                    raise ValueError(f"Malformed CSV row in {name}.")
                yield {k: v.strip() for k, v in row.items()}

    def close(self):
        self.archive.close()


def compact_date(value):
    if not re.fullmatch(r"\d{8}", value):
        raise ValueError(f"Invalid GTFS date: {value}")
    return datetime.strptime(value, "%Y%m%d").date()


def service_seconds(value):
    if not re.fullmatch(r"\d{1,2}:[0-5]\d:[0-5]\d", value):
        raise ValueError(f"Invalid GTFS time: {value}")
    hour, minute, second = map(int, value.split(":"))
    if hour >= 72:
        raise ValueError("GTFS service time exceeds supported 72-hour bound.")
    return hour * 3600 + minute * 60 + second


def flag(value, allowed, default):
    value = value if value != "" else default
    if value not in allowed:
        raise ValueError(f"Invalid GTFS flag: {value}")
    return int(value)


def route_mode(value):
    code = int(value)
    if code in (2, 12) or 100 <= code <= 117:
        return "train"
    if code in (3, 11) or 700 <= code <= 716 or 200 <= code <= 209:
        return "bus"
    return None


def index_rows(rows, key):
    result = {}
    for row in rows:
        identity = row.get(key, "")
        if not identity or identity in result:
            raise ValueError(f"Missing or duplicate GTFS {key}.")
        result[identity] = row
    return result


def active_services(gtfs, day):
    active, known, exceptions = set(), set(), set()
    weekday = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")[day.weekday()]
    has_calendar = "calendar.txt" in gtfs.files or "calendar_dates.txt" in gtfs.files
    if not has_calendar:
        raise ValueError("GTFS has no service calendar; cannot invent service dates.")
    calendars = index_rows(gtfs.rows("calendar.txt", (
        "service_id", "start_date", "end_date", "monday", "tuesday", "wednesday",
        "thursday", "friday", "saturday", "sunday")), "service_id")
    ranges = []
    for identity, row in calendars.items():
        start, end = compact_date(row["start_date"]), compact_date(row["end_date"])
        if end < start or any(row[key] not in ("0", "1") for key in (
                "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")):
            raise ValueError("Invalid GTFS calendar interval/weekdays.")
        ranges.extend((start, end))
        known.add(identity)
        if start <= day <= end and row[weekday] == "1":
            active.add(identity)
    for row in gtfs.rows("calendar_dates.txt", ("service_id", "date", "exception_type")):
        observed = compact_date(row["date"])
        identity = row["service_id"]
        if not identity or (identity, observed) in exceptions:
            raise ValueError("Duplicate or empty GTFS calendar exception.")
        exceptions.add((identity, observed))
        known.add(identity)
        ranges.append(observed)
        if row["exception_type"] not in ("1", "2"):
            raise ValueError("Invalid GTFS calendar exception type.")
        if observed == day:
            if row["exception_type"] == "1":
                active.add(identity)
            else:
                active.discard(identity)
    if not ranges or day < min(ranges) or day > max(ranges):
        raise ValueError("Requested service date outside supplied calendar range.")
    return active, known


def gtfs_instant(day, seconds, zone):
    # GTFS time is elapsed from local noon minus 12 hours, not naive local midnight.
    origin = datetime.combine(day, time(12), zone).astimezone(timezone.utc) - timedelta(hours=12)
    instant = origin + timedelta(seconds=seconds)
    local = instant.astimezone(zone)
    normalized = int((local.replace(tzinfo=None) - datetime.combine(day, time())).total_seconds())
    if not 0 <= normalized < 72 * 3600:
        raise ValueError("DST service time cannot fit transport's civil-day contract.")
    return local.isoformat(), normalized


def import_routes(payload, source, service_date, route_ids=None, max_trips=20000):
    day = date.fromisoformat(service_date)
    if not isinstance(max_trips, int) or isinstance(max_trips, bool) or not 1 <= max_trips <= 100000:
        raise ValueError("max_trips must be between 1 and 100000.")
    if not source.get("licenseUrl") or source.get("licenseReviewed") is not True:
        raise ValueError("Source licence review required before importing route data.")
    if source.get("status") != "active" or source.get("authenticationRequired"):
        raise ValueError("Inactive or authenticated feed not enabled for public import.")
    if source.get("mirrorUrl") != feed_url(source["id"]):
        raise ValueError("Unrecognized mirror URL.")
    gtfs = GTFS(payload)
    try:
        active, known = active_services(gtfs, day)
        feed_info = []
        for row in gtfs.rows("feed_info.txt", ("feed_publisher_name", "feed_publisher_url", "feed_lang")):
            for key, outside in (("feed_start_date", lambda value: day < value),
                                 ("feed_end_date", lambda value: day > value)):
                if row.get(key) and outside(compact_date(row[key])):
                    raise ValueError("Requested service date outside publisher's feed validity.")
            feed_info.append({key: row.get(key, "") for key in (
                "feed_publisher_name", "feed_lang", "feed_start_date", "feed_end_date", "feed_version")})
            feed_info[-1]["feed_publisher_url"] = public_url(row["feed_publisher_url"])
        agencies = list(gtfs.rows("agency.txt", ("agency_name", "agency_timezone"), required=True))
        agency_index = {}
        for row in agencies:
            key = row.get("agency_id", "")
            if key in agency_index or not row["agency_name"]:
                raise ValueError("Ambiguous or unnamed agency.")
            try:
                zone = ZoneInfo(row["agency_timezone"])
            except ZoneInfoNotFoundError as error:
                raise ValueError("Invalid agency timezone.") from error
            agency_index[key] = {**row, "zone": zone}
        routes = index_rows(gtfs.rows("routes.txt", ("route_id", "route_type"), required=True), "route_id")
        if route_ids and not set(route_ids) <= routes.keys():
            raise ValueError("Requested route ID not present in feed.")
        modes = {key: route_mode(row["route_type"]) for key, row in routes.items()}
        trips, omitted = {}, Counter()
        for row in gtfs.rows("trips.txt", ("route_id", "trip_id", "service_id"), required=True):
            if row["route_id"] not in routes or row["service_id"] not in known:
                raise ValueError("Trip refers to unknown route or service.")
            if row["service_id"] not in active or (route_ids and row["route_id"] not in route_ids):
                continue
            if not modes[row["route_id"]]:
                omitted["unsupportedModeTrips"] += 1
                continue
            if not row["trip_id"] or row["trip_id"] in trips:
                raise ValueError("Duplicate or empty selected trip ID.")
            if len(trips) >= max_trips:
                raise ValueError("Selected trip limit exceeded; select route IDs explicitly.")
            trips[row["trip_id"]] = row
        frequency_trips = {row["trip_id"] for row in gtfs.rows("frequencies.txt", ("trip_id",))}
        for identity in frequency_trips & trips.keys():
            del trips[identity]
            omitted["frequencyBasedTrips"] += 1
        stops = index_rows(gtfs.rows("stops.txt", ("stop_id", "stop_name"), required=True), "stop_id")
        calls = defaultdict(list)
        unsupported = {}
        for row in gtfs.rows("stop_times.txt", ("trip_id", "stop_id", "stop_sequence",
                                                "arrival_time", "departure_time"), required=True):
            identity = row["trip_id"]
            if identity not in trips:
                continue
            if row["stop_id"] not in stops:
                raise ValueError("Trip refers to unknown stop.")
            if not row["arrival_time"] or not row["departure_time"]:
                unsupported[identity] = "tripsWithUntimedStops"
                continue
            if any(row.get(key) not in (None, "", "1") for key in
                   ("continuous_pickup", "continuous_drop_off")) or any(row.get(key) for key in
                   ("start_pickup_drop_off_window", "end_pickup_drop_off_window",
                    "pickup_booking_rule_id", "drop_off_booking_rule_id", "booking_rule_id")):
                unsupported[identity] = "flexibleServiceTrips"
            if not re.fullmatch(r"\d+", row["stop_sequence"]):
                raise ValueError("Invalid stop sequence.")
            calls[identity].append({
                "stopId": row["stop_id"], "sequence": int(row["stop_sequence"]),
                "arrivalSeconds": service_seconds(row["arrival_time"]),
                "departureSeconds": service_seconds(row["departure_time"]),
                "pickupType": flag(row.get("pickup_type", ""), {"0", "1", "2", "3"}, "0"),
                "dropOffType": flag(row.get("drop_off_type", ""), {"0", "1", "2", "3"}, "0"),
                "timepoint": flag(row.get("timepoint", ""), {"0", "1"}, "1"),
            })
        result, used_stops, used_routes, zones = [], {}, {}, set()
        for identity, trip in sorted(trips.items()):
            route = routes[trip["route_id"]]
            if identity in unsupported:
                omitted[unsupported[identity]] += 1
                continue
            ordered = sorted(calls[identity], key=lambda call: call["sequence"])
            if len(ordered) < 2:
                raise ValueError("Selected trip has fewer than two timed stops.")
            if len({call["sequence"] for call in ordered}) != len(ordered):
                raise ValueError("Duplicate stop sequence.")
            agency_id = route.get("agency_id", "")
            agency = agency_index.get(agency_id)
            if agency is None and not agency_id and len(agency_index) == 1:
                agency = next(iter(agency_index.values()))
            if agency is None:
                raise ValueError("Route agency cannot be resolved.")
            zone = agency["zone"]
            if any(route.get(key) not in (None, "", "1") for key in
                   ("continuous_pickup", "continuous_drop_off")):
                omitted["flexibleServiceTrips"] += 1
                continue
            previous = -1
            for call in ordered:
                if call["arrivalSeconds"] < previous or call["departureSeconds"] < call["arrivalSeconds"]:
                    raise ValueError("Non-monotonic GTFS trip.")
                previous = call["departureSeconds"]
                for field in ("arrival", "departure"):
                    instant, normalized = gtfs_instant(day, call[f"{field}Seconds"], zone)
                    call[field] = instant
                    call[f"{field}ServiceSeconds"] = normalized
                stop = stops[call["stopId"]]
                latitude, longitude = float(stop.get("stop_lat", "")), float(stop.get("stop_lon", ""))
                if not math.isfinite(latitude) or not math.isfinite(longitude) or not (
                        -90 <= latitude <= 90 and -180 <= longitude <= 180) or not stop["stop_name"]:
                    raise ValueError("Invalid stop coordinates/name.")
                if stop.get("location_type", "") not in ("", "0"):
                    raise ValueError("Trip references a non-platform stop.")
                used_stops[call["stopId"]] = {"id": call["stopId"], "name": stop["stop_name"],
                                             "latitude": latitude, "longitude": longitude}
            if ordered[-1]["arrivalSeconds"] <= ordered[0]["departureSeconds"]:
                raise ValueError("Nonpositive trip duration.")
            mode = modes[trip["route_id"]]
            result.append({"id": identity, "routeId": trip["route_id"], "mode": mode,
                           "headsign": trip.get("trip_headsign", ""), "serviceDate": day.isoformat(),
                           "timeZone": str(zone), "calls": ordered,
                           "timingQuality": "source-approximate" if any(
                               call["timepoint"] == 0 for call in ordered) else "source-timepoints",
                           "fare": {"kind": "estimated-game", "policy": "fixed-boarding-v1",
                                    "currency": "EUR", "cents": 250 if mode == "bus" else 800}})
            used_routes[trip["route_id"]] = {
                "id": trip["route_id"], "shortName": route.get("route_short_name", ""),
                "longName": route.get("route_long_name", ""), "mode": mode,
                "agency": agency["agency_name"], "timeZone": str(zone)}
            zones.add(str(zone))
        return {"version": 1, "kind": "real-gtfs-routes", "source": {
                    key: source.get(key) for key in ("id", "country", "provider", "mirrorUrl",
                                                     "licenseUrl", "licenseReviewed", "official")},
                "retrievedAt": source["retrievedAt"], "sha256": hashlib.sha256(payload).hexdigest(),
                "serviceDate": day.isoformat(), "timeZones": sorted(zones), "feedInfo": feed_info,
                "routes": list(used_routes.values()), "stops": list(used_stops.values()),
                "trips": result, "omitted": dict(omitted),
                "notice": "Real scheduled services, not live operating guarantees. Fares are "
                          "fictional EUR game prices, not operator tickets. Stop sequences are "
                          "not track/road geometry. Source-supplied approximate times are marked; "
                          "no missing times are interpolated. Unsupported services are reported, not invented."}
    finally:
        gtfs.close()


def compile_timetable(snapshot, base, grid_id):
    from town_trail import grid_position
    if snapshot.get("kind") != "real-gtfs-routes" or not isinstance(grid_id, str) or not grid_id.strip():
        raise ValueError("Real route snapshot and explicit grid identity required.")
    if len(snapshot["timeZones"]) != 1:
        raise ValueError("Compile nonempty services in one agency timezone per timetable.")
    stops = {stop["id"]: {**stop, **grid_position(base, stop["latitude"], stop["longitude"])}
             for stop in snapshot["stops"]}
    trips, omitted = [], 0
    for trip in snapshot["trips"]:
        if any(not (-8000 <= stops[call["stopId"]]["col"] <= 8007 and
                    -8000 <= stops[call["stopId"]]["row"] <= 8007) for call in trip["calls"]):
            omitted += 1
            continue
        trips.append({**trip, "currency": trip["fare"]["currency"], "fareCents": trip["fare"]["cents"]})
    if not trips:
        raise ValueError(f"No complete trips fit this grid ({omitted} outside supported coordinates).")
    used = {call["stopId"] for trip in trips for call in trip["calls"]}
    return {"version": 1, "id": snapshot["source"]["id"],
            "revision": hashlib.sha256(json.dumps([snapshot, base, grid_id], sort_keys=True).encode()).hexdigest(),
            "kind": "supplied", "gridId": grid_id, "timeZone": snapshot["timeZones"][0],
            "validFrom": snapshot["serviceDate"], "validThrough": snapshot["serviceDate"],
            "source": {"name": snapshot["source"]["provider"], "reference": snapshot["source"]["mirrorUrl"],
                       **snapshot["source"]}, "fareNotice": snapshot["notice"],
            "stops": [stop for key, stop in stops.items() if key in used], "trips": trips,
            "omittedOutOfGridTrips": omitted}


def sample_routes(snapshot, trip_limit=3):
    if snapshot.get("kind") != "real-gtfs-routes":
        raise ValueError("Only real route snapshots can be sampled.")
    if type(trip_limit) is not int or trip_limit < 1:
        raise ValueError("Sample trip limit must be a positive integer.")
    # Prefer different routes, retaining complete source stop sequences.
    chosen, routes = [], set()
    for trip in snapshot["trips"]:
        if trip["routeId"] not in routes:
            chosen.append(trip)
            routes.add(trip["routeId"])
        if len(chosen) == trip_limit:
            break
    selected = {trip["id"] for trip in chosen}
    for trip in snapshot["trips"]:
        if len(chosen) >= trip_limit:
            break
        if trip["id"] not in selected:
            chosen.append(trip)
    used = {call["stopId"] for trip in chosen for call in trip["calls"]}
    return {**snapshot, "trips": chosen,
            "stops": [stop for stop in snapshot["stops"] if stop["id"] in used],
            "sampling": {"notice": "Complete sample trips only, not the full imported timetable. "
                                    "Route metadata lists all imported active routes.",
                         "totalTrips": len(snapshot["trips"]), "totalStops": len(snapshot["stops"]),
                         "sampleTrips": len(chosen)}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    refresh = commands.add_parser("refresh-catalog")
    refresh.add_argument("--output", type=Path, required=True)
    search = commands.add_parser("search")
    search.add_argument("--catalog", type=Path, required=True)
    search.add_argument("--country")
    search.add_argument("--bounds", type=float, nargs=4, metavar=("WEST", "SOUTH", "EAST", "NORTH"))
    fetch = commands.add_parser("import")
    fetch.add_argument("--catalog", type=Path, required=True)
    fetch.add_argument("--feed", required=True)
    fetch.add_argument("--date", required=True, help="Actual supplied service date, YYYY-MM-DD")
    fetch.add_argument("--license-reviewed", action="store_true",
                       help="Confirm source reuse terms were reviewed; a catalogue link alone is not permission.")
    fetch.add_argument("--zip", type=Path, help="Previously downloaded archive; otherwise fetch the mirror.")
    fetch.add_argument("--route", action="append")
    fetch.add_argument("--output", type=Path, required=True)
    compile_command = commands.add_parser("compile")
    compile_command.add_argument("--snapshot", type=Path, required=True)
    compile_command.add_argument("--map", type=Path, required=True)
    compile_command.add_argument("--grid-id", required=True)
    compile_command.add_argument("--output", type=Path, required=True)
    sample = commands.add_parser("sample")
    sample.add_argument("--snapshot", type=Path, required=True)
    sample.add_argument("--trips", type=int, default=3)
    sample.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        if args.command == "refresh-catalog":
            result = build_catalog(download(CATALOG_URL, 20 * 1024 * 1024), utc_now())
        elif args.command == "search":
            result = find_feeds(json.loads(args.catalog.read_text()), args.country, args.bounds)
        elif args.command == "import":
            entries = [feed for feed in json.loads(args.catalog.read_text())["feeds"] if feed["id"] == args.feed]
            if not entries:
                raise ValueError("Feed not found in catalogue.")
            source = {**entries[0], "licenseReviewed": args.license_reviewed, "retrievedAt": utc_now()}
            if not args.license_reviewed:
                raise ValueError("Review source terms, then explicitly pass --license-reviewed.")
            if not source["licenseUrl"]:
                raise ValueError("Feed has no supported public licence link; review source metadata first.")
            if source["status"] != "active" or source["authenticationRequired"] or not source["mirrorUrl"]:
                raise ValueError("Feed inactive, requires credentials, or has no supported public mirror.")
            if args.zip:
                if args.zip.stat().st_size > MAX_DOWNLOAD:
                    raise ValueError("GTFS archive exceeds size limit.")
                payload = args.zip.read_bytes()
                source["retrievedAt"] = datetime.fromtimestamp(args.zip.stat().st_mtime, timezone.utc).isoformat()
            else:
                payload = download(source["mirrorUrl"])
            result = import_routes(payload, source, args.date, args.route)
        elif args.command == "sample":
            result = sample_routes(json.loads(args.snapshot.read_text()), args.trips)
        else:
            result = compile_timetable(json.loads(args.snapshot.read_text()),
                                       json.loads(args.map.read_text()), args.grid_id)
        if args.command == "search":
            print(json.dumps(result, ensure_ascii=False, indent=2))
        else:
            write_json(args.output, result)
            print(json.dumps({"output": str(args.output),
                              "feeds": len(result.get("feeds", [])),
                              "routes": len(result.get("routes", [])),
                              "trips": len(result.get("trips", [])),
                              "omitted": result.get("omitted", {})}))
    except (ValueError, OSError, zipfile.BadZipFile, UnicodeError, csv.Error) as error:
        parser.exit(1, f"Transport source error: {error}\n")


if __name__ == "__main__":
    main()
