#!/usr/bin/env python3
"""Prepare cached OSM snapshots and grids covering a comparison viewport."""

import argparse
import json
import math
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

from build_map import build_cached
from fetch_osm import download_region

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "data" / "regions.json"


def viewport_bounds(reference, width, height):
    west, south, east, north = reference
    if (
        not all(math.isfinite(value) for value in (*reference, width, height))
        or width <= 0 or height <= 0
        or not -180 <= west < east <= 180
        or not -85 <= south < north <= 85
    ):
        raise ValueError("Invalid reference bounds or viewport dimensions.")

    def mercator_y(latitude):
        return (1 - math.asinh(math.tan(math.radians(latitude))) / math.pi) / 2

    def latitude(y):
        return math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y))))

    left, right = (west + 180) / 360, (east + 180) / 360
    top, bottom = mercator_y(north), mercator_y(south)
    # The embed may initialize its map at 400x300 before its container is laid
    # out. Fit at the smaller size, then cover the requested visible viewport.
    fit_width, fit_height = min(width, 400), min(height, 300)
    zoom = max(0, min(19, math.floor(math.log2(min(
        fit_width / (256 * (right - left)), fit_height / (256 * (bottom - top)),
    )))))
    scale = 256 * 2 ** zoom
    center_x, center_y = (left + right) / 2, (top + bottom) / 2
    bounds = [
        (center_x - width / scale / 2) * 360 - 180,
        latitude(center_y + height / scale / 2),
        (center_x + width / scale / 2) * 360 - 180,
        latitude(center_y - height / scale / 2),
    ]
    return [
        math.floor(bounds[0] * 1e7) / 1e7,
        math.floor(bounds[1] * 1e7) / 1e7,
        math.ceil(bounds[2] * 1e7) / 1e7,
        math.ceil(bounds[3] * 1e7) / 1e7,
    ]


def prepare_region(region, viewport, refresh=False, force=False, root=ROOT):
    bounds = viewport_bounds(region["referenceBounds"], viewport["width"], viewport["height"])
    source = root / region["snapshot"]
    _, _, cached_source = download_region(
        bounds, region["name"], source, refresh=refresh,
        reference_bounds=region["referenceBounds"],
    )
    data, cached_grid = build_cached(source, root / region["map"], region["name"], force=force)
    print(
        f"{region['name']}: {data['width']} x {data['height']} cells; "
        f"OSM {'cached' if cached_source else 'downloaded'}, "
        f"grid {'cached' if cached_grid else 'generated'}; bounds={bounds}",
        flush=True,
    )
    return data


def main():
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--region", choices=config["regions"], action="append",
                        help="Region to prepare; repeat to select several (default: all)")
    parser.add_argument("--width", type=int, default=config["viewport"]["width"])
    parser.add_argument("--height", type=int, default=config["viewport"]["height"])
    parser.add_argument("--refresh", action="store_true", help="Refresh cached OSM snapshots")
    parser.add_argument("--force", action="store_true", help="Rebuild cached grids")
    args = parser.parse_args()
    for region_id in args.region or config["regions"]:
        try:
            prepare_region(
                config["regions"][region_id], {"width": args.width, "height": args.height},
                refresh=args.refresh, force=args.force,
            )
        except (OSError, ValueError, ET.ParseError) as error:
            print(f"Region preparation failed ({region_id}): {error}", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
