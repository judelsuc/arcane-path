"""Read GSHHG closed land polygons; rasterize their ocean complement."""

from bisect import bisect_left
import hashlib
import logging
from pathlib import Path
import struct

DEFAULT_PATH = Path(__file__).resolve().parents[1] / ".cache/shorelines/gshhs_f.b"
HEADER = struct.Struct(">11i")
POINT = struct.Struct(">ii")
CREDIT = {
    "source": "GSHHG 2.3.7, full resolution (Wessel and Smith)",
    "sourceUrl": "https://www.soest.hawaii.edu/pwessel/gshhg/",
    "license": "LGPL-3.0-or-later",
    "licenseUrl": "https://www.gnu.org/licenses/lgpl-3.0.html",
}


class Shoreline:
    def __init__(self, path):
        self.path = Path(path)
        self.sha256 = hashlib.sha256(self.path.read_bytes()).hexdigest()
        self.bands = {}
        size = self.path.stat().st_size
        with self.path.open("rb") as stream:
            while stream.tell() < size:
                data = stream.read(HEADER.size)
                if len(data) != HEADER.size:
                    raise ValueError("Truncated GSHHG polygon header.")
                _, count, flag, west, east, south, north, *_ = HEADER.unpack(data)
                if (count < 3 or stream.tell() + count * POINT.size > size
                        or not -180_000_000 <= west < east <= 360_000_000
                        or not -90_000_000 <= south <= north <= 90_000_000):
                    raise ValueError("Invalid GSHHG polygon geometry.")
                level = flag & 255
                if level not in range(1, 7):
                    raise ValueError("Unsupported GSHHG polygon level.")
                if level in (1, 5):
                    polygon = (stream.tell(), count, west / 1e6, east / 1e6, level)
                    for band in range(int(south // 1_000_000), int(north // 1_000_000) + 1):
                        self.bands.setdefault(band, []).append(polygon)
                stream.seek(count * POINT.size, 1)
        if not self.bands:
            raise ValueError("GSHHG contains no closed land polygons.")

    def ocean_samples(self, longitudes, latitudes):
        """Return sampled ocean column indices for each ascending latitude."""
        land = [bytearray(len(longitudes)) for _ in latitudes]
        polygons = set()
        for band in range(int(latitudes[0] // 1), int(latitudes[-1] // 1) + 1):
            polygons.update(self.bands.get(band, ()))
        with self.path.open("rb") as stream:
            for offset, count, west, east, level in polygons:
                shifts = [shift for shift in (-360, 0, 360)
                          if west + shift <= longitudes[-1] and east + shift >= longitudes[0]]
                if not shifts:
                    continue
                stream.seek(offset)
                points = []
                for x, y in struct.iter_unpack(">ii", stream.read(count * POINT.size)):
                    x /= 1e6
                    # Greenwich-crossing records store negative longitudes as 0..360.
                    if x > east:
                        x -= 360
                    points.append((x, y / 1e6))
                # The Antarctic ice front is open at +/-180 and encloses the pole.
                if level == 5:
                    points.extend([(-180, -90), (180, -90)])
                crossings = [[] for _ in latitudes]
                a = points[-1]
                for b in points:
                    if a[1] != b[1]:
                        low, high = sorted((a[1], b[1]))
                        for row in range(bisect_left(latitudes, low), bisect_left(latitudes, high)):
                            x = a[0] + (latitudes[row] - a[1]) * (b[0] - a[0]) / (b[1] - a[1])
                            crossings[row].append(x)
                    a = b
                for row, intersections in enumerate(crossings):
                    intersections.sort()
                    if len(intersections) % 2:
                        raise ValueError("Unclosed GSHHG scanline.")
                    for left, right in zip(intersections[::2], intersections[1::2]):
                        for shift in shifts:
                            first = bisect_left(longitudes, left + shift)
                            last = bisect_left(longitudes, right + shift)
                            land[row][first:last] = b"\1" * (last - first)
        return [[col for col, value in enumerate(row) if not value] for row in land]


def load_shoreline(path=DEFAULT_PATH):
    if not path.exists():
        logging.warning("Ocean coverage unavailable: install the GSHHG dataset at %s.", path)
        return None
    return Shoreline(path)
