"""Bounded main-journey timetables from licensed snapshots and real nearby towns."""

from datetime import date
import json
import math

from local_towns import LocalTowns
from town_trail import distance, grid_position
from transport_sources import compile_timetable
from transport_fictional import fictional_timetable


class JourneyTransport:
    def __init__(self, chunks):
        self.chunks = chunks
        self.towns = LocalTowns()

    def lookup(self, region, col, row, day):
        if region not in self.chunks.bases or any(
                isinstance(value, bool) or not isinstance(value, int) or abs(value // 8) > 1000
                for value in (col, row)):
            raise ValueError("Invalid transport location.")
        if date.fromisoformat(day).isoformat() != day:
            raise ValueError("Invalid transport date.")
        base = self.chunks.bases[region]
        projection = base.get("projectionLatitude",
                              (base["bounds"]["minLatitude"] + base["bounds"]["maxLatitude"]) / 2)
        step = base["cellSizeMeters"] / 6371008.8 * 180 / math.pi
        point = {"latitude": base["bounds"]["maxLatitude"] - (row + .5) * step,
                 "longitude": base["bounds"]["minLongitude"] + (col + .5) * step /
                 math.cos(math.radians(projection))}
        catalogue = self.towns.catalogue(point["latitude"], point["longitude"])
        towns = []
        for rows in self.towns.buckets.values():
            # Skip distant buckets before exact distance evaluation.
            if rows and (abs(rows[0][2] - point["latitude"]) > 2 or
                         abs(rows[0][3] - point["longitude"]) > 4):
                continue
            for identity, name, lat, lon, country, _ in rows:
                town = {"id": f"geoname:{identity}", "name": name, "latitude": lat,
                        "longitude": lon, "country": country, "source": catalogue["sourceUrl"]}
                if distance(point, town) <= 60000:
                    towns.append(town)
        towns.sort(key=lambda town: (distance(point, town), town["id"]))
        chunk = self.chunks.read(region, col // 8, row // 8)
        cell = chunk["rows"][row % 8][col % 8] if chunk else None
        origin = next((town for town in towns if grid_position(base, town["latitude"], town["longitude"]) ==
                       {"col": col, "row": row}), None)
        if origin is None and cell and cell.get("settlements") and towns:
            settlement = next((place for place in cell["settlements"] if place.get("name")), None)
            if settlement:
                origin = {**point, "id": f"mapped:{col}:{row}", "name": settlement["name"],
                          "country": towns[0]["country"], "source": "https://www.openstreetmap.org/copyright"}
        selected = ([origin] if origin else []) + [
            town for town in towns if not origin or town["id"] != origin["id"]][:11]
        fictional = None
        if origin and any(5000 <= distance(origin, town) <= 350000 for town in selected[1:]):
            fictional = fictional_timetable(selected, base, region, day, "UTC")
        feeds, coverage = [], []
        nearby_stops = [{**grid_position(base, town["latitude"], town["longitude"]),
                         "name": town["name"], "kind": "fictional-town",
                         "latitude": town["latitude"], "longitude": town["longitude"]}
                        for town in towns[:6]]
        root = self.chunks.root / "data/transport"
        paths = sorted((root / "samples").glob("*.json"))
        paths += [root / "examples/grenoble-lyon/source.json"]
        for path in paths:
            snapshot = json.loads(path.read_text())
            stops = {stop["id"]: stop for stop in snapshot["stops"]}
            local = {identity for identity, stop in stops.items()
                     if distance(point, stop) <= 3000}
            if not local:
                continue
            nearby_stops.extend({**grid_position(base, stops[identity]["latitude"], stops[identity]["longitude"]),
                                 "name": stops[identity]["name"], "kind": "dated-stop",
                                 "latitude": stops[identity]["latitude"], "longitude": stops[identity]["longitude"]}
                                for identity in sorted(local)[:6])
            coverage.append({"provider": snapshot["source"]["provider"], "serviceDate": snapshot["serviceDate"],
                             "source": snapshot["source"]["mirrorUrl"],
                             "license": snapshot["source"]["licenseUrl"],
                             "scope": "bounded licensed dated snapshot, not complete live network"})
            if snapshot["serviceDate"] != day:
                continue
            boarding = {identity for identity in local if grid_position(
                base, stops[identity]["latitude"], stops[identity]["longitude"]) == {"col": col, "row": row}}
            trips = [trip for trip in snapshot["trips"] if any(
                call["stopId"] in boarding and call.get("pickupType", 0) == 0
                for call in trip["calls"][:-1])][:50]
            if not trips:
                continue
            used = {call["stopId"] for trip in trips for call in trip["calls"]}
            subset = {**snapshot, "trips": trips, "stops": [stops[key] for key in sorted(used)]}
            # The compiler reports invalid/out-of-grid data explicitly, never as fictional service.
            feeds.append(compile_timetable(subset, base, region))
        return {"version": 1, "gridId": region, "col": col, "row": row, "day": day,
                "realFeeds": feeds, "fictionalFeed": fictional, "coverage": coverage,
                "nearbyStops": nearby_stops[:20],
                "boardingTown": origin["name"] if origin else None,
                "notice": "Real coverage is limited to loaded dated snapshots. Coaches are fictional game "
                          "connections between real towns, with game fares and UTC schedules; not actual services."}
