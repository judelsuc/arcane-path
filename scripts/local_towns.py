"""Spatially indexed, offline settlement lookups; no runtime provider requests."""

import gzip
import json
import math
from pathlib import Path

from starting_places import european

CATALOGUE = Path(__file__).resolve().parents[1] / "data/europe-towns.json.gz"


class LocalTowns:
    def __init__(self, path=CATALOGUE):
        envelope = json.loads(gzip.decompress(path.read_bytes()))
        if (envelope.get("version") != 1 or envelope.get("source") != "GeoNames"
                or not isinstance(envelope.get("towns"), list) or not envelope["towns"]
                or not isinstance(envelope.get("retrievedAt"), str)):
            raise ValueError("Invalid offline town catalogue; rebuild with prepare_town_catalogue.py.")
        self.retrieved_at = envelope["retrievedAt"]
        self.buckets = {}
        seen = set()
        for row in envelope["towns"]:
            if (not isinstance(row, list) or len(row) != 6 or not isinstance(row[0], int)
                    or isinstance(row[0], bool) or row[0] <= 0 or row[0] in seen
                    or not isinstance(row[1], str) or not row[1].strip()
                    or any(isinstance(v, bool) or not isinstance(v, (int, float))
                           or not math.isfinite(v) for v in row[2:4])
                    or not isinstance(row[4], str) or not isinstance(row[5], int) or row[5] < 2000):
                raise ValueError("Invalid offline town record.")
            european(row[2], row[3], row[4].lower())
            seen.add(row[0])
            self.buckets.setdefault((math.floor(row[2]), math.floor(row[3])), []).append(row)

    def catalogue(self, latitude, longitude):
        if not 34 <= latitude <= 72 or not -32 <= longitude <= 60:
            raise ValueError("Offline town journeys currently support Europe only; existing saves still resume.")
        # Conservative 60 km envelope; exact great-circle bounds are checked by the generator.
        lat_span = 0.55
        lon_span = 0.55 / math.cos(math.radians(min(73, latitude + lat_span)))
        rows = []
        for lat in range(math.floor(latitude - lat_span), math.floor(latitude + lat_span) + 1):
            for lon in range(math.floor(longitude - lon_span), math.floor(longitude + lon_span) + 1):
                rows.extend(self.buckets.get((lat, lon), []))
        return {"sourceUrl": "https://www.geonames.org/",
                "retrievedAt": self.retrieved_at, "elements": [
                    {"type": "geoname", "id": row[0], "lat": row[2], "lon": row[3],
                     "tags": {"name": row[1], "place": "town"}} for row in rows]}
