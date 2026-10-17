"""Prepare the attributed, offline European town catalogue from GeoNames."""

import gzip
import io
import json
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from starting_places import european

SOURCE = "https://download.geonames.org/export/dump/cities500.zip"
OUTPUT = Path(__file__).resolve().parents[1] / "data/europe-towns.json.gz"
FEATURES = {"PPL", "PPLA", "PPLA2", "PPLA3", "PPLA4", "PPLC"}


def extract_towns(text):
    towns = []
    for line in text:
        fields = line.rstrip("\n").split("\t")
        if len(fields) != 19:
            raise ValueError("Invalid GeoNames catalogue row.")
        latitude, longitude = float(fields[4]), float(fields[5])
        if fields[6] != "P" or fields[7] not in FEATURES or int(fields[14]) < 2000:
            continue
        try:
            european(latitude, longitude, fields[8].lower())
        except ValueError:
            continue
        towns.append([int(fields[0]), fields[1], latitude, longitude, fields[8], int(fields[14])])
    return sorted(towns)


def main():
    request = urllib.request.Request(SOURCE, headers={"User-Agent": "ArcanePath/0.4"})
    with urllib.request.urlopen(request, timeout=120) as response:
        archive = response.read()
    with zipfile.ZipFile(io.BytesIO(archive)) as zipped:
        with zipped.open("cities500.txt") as data:
            towns = extract_towns(io.TextIOWrapper(data, encoding="utf-8"))
    if len(towns) < 1000:
        raise ValueError("Incomplete European town catalogue.")
    envelope = {"version": 1, "source": "GeoNames", "sourceUrl": SOURCE,
                "license": "CC BY 4.0", "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
                "retrievedAt": datetime.now(timezone.utc).isoformat(), "towns": towns}
    payload = json.dumps(envelope, ensure_ascii=False, separators=(",", ":")).encode()
    OUTPUT.write_bytes(gzip.compress(payload, mtime=0))
    print(f"Prepared {len(towns)} European settlements: {OUTPUT.name} ({OUTPUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
