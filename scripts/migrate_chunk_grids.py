"""Copy verified compatible grids to a new cache identity without map requests."""

import argparse
import copy
import re

from travel_server import ChunkStore, atomic_write, chunk_geometry


def migrate(chunks, previous_pipeline):
    if not isinstance(previous_pipeline, str) or not re.fullmatch(r"[a-f0-9]{64}", previous_pipeline):
        raise ValueError("An exact previous pipeline SHA-256 is required.")
    previous = copy.copy(chunks)
    previous.pipeline = previous_pipeline
    copied = 0
    for region in chunks.bases:
        for path in previous.path(region, 0, 0).parent.glob("*.json"):
            if not re.fullmatch(r"-?\d+_-?\d+", path.stem):
                raise ValueError(f"Unexpected grid cache filename: {path.name}")
            x, y = map(int, path.stem.split("_"))
            if abs(x) > 1000 or abs(y) > 1000:
                raise ValueError("Grid cache coordinates outside supported bounds.")
            destination = chunks.path(region, x, y).with_suffix(".json")
            if destination.exists():
                chunks.read(region, x, y)
                continue
            data = previous.read(region, x, y)
            bounds, _, _ = chunk_geometry(chunks.bases[region], x, y)
            expected = dict(zip(("minLongitude", "minLatitude", "maxLongitude", "maxLatitude"), bounds))
            if (data["bounds"] != expected or data["width"] != 8 or data["height"] != 8
                    or data["chunk"] != {"region": region, "x": x, "y": y, "size": 8}
                    or len(data["rows"]) != 8 or any(len(row) != 8 for row in data["rows"])):
                raise ValueError(f"Incompatible grid geometry: {region}/{x}/{y}")
            atomic_write(destination, path.read_bytes())
            copied += 1
    return copied


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--from-pipeline", required=True,
                        help="Operator-approved semantically compatible previous pipeline hash")
    args = parser.parse_args()
    print(f"Compatible cached grids copied: {migrate(ChunkStore(), args.from_pipeline)}")
