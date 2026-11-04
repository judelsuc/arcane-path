"""Build finite, explicitly fictional coach schedules between real mapped towns."""

import argparse
from datetime import date, datetime, time, timedelta, timezone
import hashlib
import json
import math
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from town_trail import distance, grid_position
from transport_sources import EUROPE, write_json

POLICY = "abstract-coach-v1"
NOTICE = ("Fictional game coach, not an actual operator or service. Real mapped places; "
          "abstract town-to-town connection, not a verified road itinerary. Distance, "
          "duration, timetable and EUR fare are game estimates. No railway link is implied.")


def fictional_timetable(towns, base, grid_id, service_date, time_zone):
    day = date.fromisoformat(service_date)
    zone = ZoneInfo(time_zone)
    if not isinstance(grid_id, str) or not grid_id.strip():
        raise ValueError("Explicit host grid identity is required.")
    if not isinstance(towns, list) or not 2 <= len(towns) <= 20:
        raise ValueError("Supply 2 to 20 real mapped towns per regional batch.")
    bounds = base.get("bounds") if isinstance(base, dict) else None
    if (not isinstance(bounds, dict) or
            any(not isinstance(base.get(key), (int, float)) or isinstance(base.get(key), bool) or
                not math.isfinite(base[key]) for key in ("cellSizeMeters",)) or
            base["cellSizeMeters"] <= 0 or
            any(not isinstance(bounds.get(key), (int, float)) or isinstance(bounds.get(key), bool) or
                not math.isfinite(bounds[key]) for key in ("minLongitude", "minLatitude", "maxLatitude")) or
            not -180 <= bounds["minLongitude"] <= 180 or
            not -90 <= bounds["minLatitude"] < bounds["maxLatitude"] <= 90):
        raise ValueError("Valid host map bounds and positive cell size are required.")
    if "projectionLatitude" in base and (
            isinstance(base["projectionLatitude"], bool) or
            not isinstance(base["projectionLatitude"], (int, float)) or
            not math.isfinite(base["projectionLatitude"]) or not -90 < base["projectionLatitude"] < 90):
        raise ValueError("Valid host projection latitude is required.")
    stops, ids = [], set()
    for town in towns:
        if (not isinstance(town, dict) or
                not isinstance(town.get("id"), str) or not town["id"].strip() or town["id"] in ids or
                not isinstance(town.get("name"), str) or not town["name"].strip() or
                town.get("country") not in EUROPE or not isinstance(town.get("source"), str) or
                not town["source"].strip()):
            raise ValueError("Unique real town IDs, names, European countries and provenance are required.")
        lat, lon = town.get("latitude"), town.get("longitude")
        if any(isinstance(value, bool) or not isinstance(value, (int, float)) or
               not math.isfinite(value) for value in (lat, lon)) or not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise ValueError("Invalid real town coordinates.")
        stop = {**town, **grid_position(base, lat, lon)}
        if not all(-8000 <= stop[key] <= 8007 for key in ("col", "row")):
            raise ValueError("Town falls outside supported host grid coordinates.")
        ids.add(town["id"])
        stops.append(stop)
    stops.sort(key=lambda stop: stop["id"])
    trips, omitted = [], []
    for origin in stops:
        nearby = sorted(((distance(origin, destination), destination) for destination in stops
                         if destination["id"] != origin["id"]), key=lambda item: (item[0], item[1]["id"]))
        candidates = [(meters, stop) for meters, stop in nearby if 5000 <= meters <= 350000 and
                      (origin["col"], origin["row"]) != (stop["col"], stop["row"])]
        if not candidates:
            omitted.append(origin["id"])
        for meters, destination in candidates[:3]:
            route_id = f'{POLICY}:{origin["id"]}:{destination["id"]}'
            offset = int(hashlib.sha256(route_id.encode()).hexdigest()[:8], 16) % 30
            estimated_meters = math.ceil(meters * 1.35)
            duration = max(20, math.ceil(estimated_meters / 1000 / 50 * 60) + 15)
            cents = max(250, math.ceil((200 + estimated_meters / 1000 * 15) / 50) * 50)
            for hour in (6, 10, 14, 18):
                departure = datetime.combine(day, time(hour, offset), zone)
                arrival = (departure.astimezone(timezone.utc) + timedelta(minutes=duration)).astimezone(zone)
                calls = []
                for stop, instant in ((origin, departure), (destination, arrival)):
                    seconds = int((instant.replace(tzinfo=None) - datetime.combine(day, time())).total_seconds())
                    calls.append({"stopId": stop["id"], "arrival": instant.isoformat(),
                                  "departure": instant.isoformat(), "arrivalServiceSeconds": seconds,
                                  "departureServiceSeconds": seconds, "pickupType": 0, "dropOffType": 0})
                trips.append({"id": f"{route_id}:{day}:{hour}", "routeId": route_id, "mode": "bus",
                              "serviceDate": day.isoformat(), "currency": "EUR", "fareCents": cents,
                              "fare": {"kind": "estimated-game", "policy": POLICY, "currency": "EUR", "cents": cents},
                              "timingQuality": "fictional-estimate", "estimatedDistanceMeters": estimated_meters,
                              "calls": calls})
    if not trips:
        raise ValueError("No distinct town pairs within the 5-350 km regional generation bound.")
    content = {"version": 1, "id": f"fictional:{grid_id}:{day}", "kind": "fictional-service",
               "gridId": grid_id, "timeZone": time_zone, "validFrom": day.isoformat(),
               "validThrough": day.isoformat(), "source": {"name": "Arcane Path fictional coaches",
               "reference": POLICY}, "geographyKind": "abstract-town-link", "fictionalNotice": NOTICE,
               "fareNotice": NOTICE, "stops": stops, "trips": trips,
               "generation": {"policy": POLICY, "unconnectedTownIds": omitted,
                              "notice": "At most three nearest eligible destinations per origin; "
                                        "finite supplied towns/day, not guaranteed all-pairs coverage."}}
    content["revision"] = hashlib.sha256(json.dumps(content, sort_keys=True).encode()).hexdigest()
    return content


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--towns", type=Path, required=True)
    parser.add_argument("--map", type=Path, required=True)
    parser.add_argument("--grid-id", required=True)
    parser.add_argument("--date", required=True)
    parser.add_argument("--time-zone", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        result = fictional_timetable(json.loads(args.towns.read_text()), json.loads(args.map.read_text()),
                                     args.grid_id, args.date, args.time_zone)
        write_json(args.output, result)
        print(json.dumps({"output": str(args.output), "kind": result["kind"], "trips": len(result["trips"]),
                          "unconnectedTownIds": result["generation"]["unconnectedTownIds"]}))
    except (ValueError, OSError, ZoneInfoNotFoundError) as error:
        parser.exit(1, f"Fictional transport error: {error}\n")


if __name__ == "__main__":
    main()
