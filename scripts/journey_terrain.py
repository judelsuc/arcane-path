"""Small terrain overview built exclusively from completed chunk cache files."""

import math
from collections import Counter, defaultdict

TERRAINS = {"plain", "water", "road", "major_road", "rail", "cable", "cable_station",
            "mountain", "hill", "forest", "grass", "field", "vineyard", "park",
            "church", "station", "place", "building"}


def cached_terrain(store, region, bounds):
    if (region not in store.bases or not isinstance(bounds, list) or len(bounds) != 4
            or any(type(v) is not int or not -8000 <= v <= 8007 for v in bounds)
            or bounds[0] > bounds[2] or bounds[1] > bounds[3]):
        raise ValueError("Invalid journey terrain bounds.")
    left, top, right, bottom = bounds
    stride = max(1, math.ceil((right - left + 1) / 600), math.ceil((bottom - top + 1) / 400))
    bins = defaultdict(Counter)
    directory = store.path(region, 0, 0).parent
    positions = []
    for path in directory.glob("*.json"):
        parts = path.stem.split("_")
        if len(parts) != 2:
            continue
        try:
            x, y = map(int, parts)
        except ValueError:
            continue
        if x * 8 <= right and x * 8 + 7 >= left and y * 8 <= bottom and y * 8 + 7 >= top:
            positions.append((x, y))
    positions.sort()
    loaded = 0
    for x, y in positions[:4096]:
        chunk = store.read(region, x, y)
        if chunk is None:
            continue
        if (chunk.get("width") != 8 or chunk.get("height") != 8
                or len(chunk.get("rows", [])) != 8
                or any(len(row) != 8 for row in chunk["rows"])):
            raise ValueError("Invalid cached journey terrain.")
        loaded += 1
        for row, cells in enumerate(chunk["rows"]):
            for col, cell in enumerate(cells):
                if cell.get("unavailable"):
                    continue
                terrain = cell.get("terrain")
                if terrain not in TERRAINS:
                    raise ValueError("Invalid cached terrain type.")
                c, r = x * 8 + col, y * 8 + row
                if left <= c <= right and top <= r <= bottom:
                    bins[((c - left) // stride, (r - top) // stride)][terrain] += 1
    expected = (right // 8 - left // 8 + 1) * (bottom // 8 - top // 8 + 1)
    return {
        "cells": [{"col": left + x * stride, "row": top + y * stride,
                   "terrain": counts.most_common(1)[0][0]} for (x, y), counts in sorted(bins.items())],
        "stride": stride, "sampled": len(positions) > 4096,
        "missing": loaded < expected, "cachedChunks": loaded,
    }
