#!/usr/bin/env python3
"""Rasterize a bounded OpenStreetMap XML extract into a fixed ASCII map."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import math
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

EARTH_RADIUS_METERS = 6_371_008.8
DEFAULT_CELL_SIZE_METERS = 250
CACHE_SCHEMA_VERSION = 1

TERRAINS = {
    "plain": {"glyph": " ", "label": "Terrain non cartographie", "color": "plain"},
    "water": {"glyph": "~", "label": "Eau", "color": "water"},
    "road": {"glyph": "·", "label": "Route", "color": "road"},
    "major_road": {"glyph": "+", "label": "Route principale", "color": "major_road"},
    "rail": {"glyph": "=", "label": "Voie ferree", "color": "rail"},
    "cable": {"glyph": "-", "label": "Telepherique", "color": "cable"},
    "cable_station": {"glyph": "T", "label": "Station de telepherique", "color": "cable_station"},
    "mountain": {"glyph": "^", "label": "Montagne", "color": "mountain"},
    "hill": {"glyph": "n", "label": "Colline", "color": "hill"},
    "building": {"glyph": "#", "label": "Batiment", "color": "building"},
    "forest": {"glyph": "♣", "label": "Foret", "color": "forest"},
    "grass": {"glyph": '"', "label": "Prairie", "color": "grass"},
    "field": {"glyph": ":", "label": "Champ", "color": "field"},
    "vineyard": {"glyph": "¥", "label": "Vigne", "color": "vineyard"},
    "park": {"glyph": ",", "label": "Parc", "color": "park"},
    "church": {"glyph": "†", "label": "Lieu de culte", "color": "church"},
    "station": {"glyph": "≡", "label": "Gare", "color": "station"},
    "place": {"glyph": "○", "label": "Localite", "color": "place"},
}

# Explicit priorities make the result independent of OSM element order and
# prevent broad land-cover polygons from hiding roads and mapped structures.
PRIORITY = {
    "plain": 0,
    "mountain": 5,
    "hill": 52,
    "grass": 10,
    "field": 10,
    "vineyard": 10,
    "forest": 10,
    "park": 10,
    "building": 20,
    "road": 30,
    "rail": 35,
    "cable": 54,
    "cable_station": 58,
    "place": 60,
    "church": 40,
    "station": 58,
    "water": 50,
    "major_road": 55,
}


def project(lon: float, lat: float, center_lat: float) -> tuple[float, float]:
    """Project geographic coordinates into local, meter-based coordinates."""
    x = EARTH_RADIUS_METERS * math.radians(lon) * math.cos(math.radians(center_lat))
    y = EARTH_RADIUS_METERS * math.radians(lat)
    return x, y


def classify(tags: dict[str, str], *, is_node: bool = False) -> str | None:
    if is_node:
        if tags.get("aerialway") == "station":
            return "cable_station"
        if tags.get("railway") == "station" or (
            tags.get("public_transport") == "station"
            and any(tags.get(mode) == "yes" for mode in ("train", "tram", "subway", "light_rail"))
        ):
            return "station"
        if tags.get("amenity") == "place_of_worship":
            return "church"
        if tags.get("place") in {"city", "town", "village", "hamlet"}:
            return "place"
        if tags.get("natural") == "peak":
            elevation = tags.get("ele", "")
            if elevation:
                try:
                    meters = float(elevation)
                except ValueError:
                    print(f"Attention : elevation OSM invalide : {elevation!r}.", file=sys.stderr)
                else:
                    if math.isfinite(meters) and meters < 600:
                        return "hill"
            return "mountain"
        if tags.get("natural") == "hill":
            return "hill"

    if tags.get("natural") == "water" or tags.get("waterway") in {
        "river",
        "stream",
        "canal",
        "drain",
    } or tags.get("landuse") == "reservoir":
        return "water"
    if tags.get("building") and tags.get("building") != "no":
        return "building"
    if tags.get("railway") in {"rail", "light_rail", "narrow_gauge", "tram", "subway"}:
        return "rail"
    if tags.get("aerialway") in {"cable_car", "gondola", "chair_lift", "mixed_lift"}:
        return "cable"
    if tags.get("highway") in {
        "motorway", "trunk", "primary", "secondary",
        "motorway_link", "trunk_link", "primary_link", "secondary_link",
    }:
        return "major_road"
    if tags.get("highway"):
        return "road"
    if tags.get("natural") in {"ridge", "arete", "bare_rock", "scree", "glacier"}:
        return "mountain"
    if tags.get("natural") in {"wood", "scrub"} or tags.get("landuse") == "forest":
        return "forest"
    if tags.get("landuse") == "vineyard":
        return "vineyard"
    if tags.get("landuse") == "farmland":
        return "field"
    if tags.get("leisure") == "park":
        return "park"
    if tags.get("landuse") in {"grass", "meadow", "village_green"} or tags.get(
        "natural"
    ) == "grassland":
        return "grass"
    return None


def _tags(element: ET.Element) -> dict[str, str]:
    return {tag.attrib["k"]: tag.attrib["v"] for tag in element.findall("tag")}


def poi_category(tags: dict[str, str]) -> str | None:
    if tags.get("aerialway") == "station":
        return "cable_station"
    if tags.get("railway") in {"station", "halt"}:
        return "station"
    if tags.get("natural") in {"peak", "hill"}:
        return "summit"
    for category in ("amenity", "shop", "tourism", "historic"):
        if tags.get(category) and tags[category] != "no":
            return category
    return None


def visible_at_scale(terrain: str, cell_size_meters: int) -> bool:
    return terrain not in {"building", "road"} or cell_size_meters < DEFAULT_CELL_SIZE_METERS


def _join_rings(parts: list[list[str]]) -> list[list[str]]:
    remaining = [part[:] for part in parts]
    rings = []
    while remaining:
        ring = remaining.pop()
        while ring[0] != ring[-1]:
            for index, part in enumerate(remaining):
                if ring[-1] == part[0]:
                    ring.extend(part[1:])
                elif ring[-1] == part[-1]:
                    ring.extend(reversed(part[:-1]))
                elif ring[0] == part[-1]:
                    ring = part[:-1] + ring
                elif ring[0] == part[0]:
                    ring = list(reversed(part[1:])) + ring
                else:
                    continue
                remaining.pop(index)
                break
            else:
                raise ValueError("Unclosed multipolygon ring")
        if len(ring) < 4:
            raise ValueError("Invalid multipolygon ring")
        rings.append(ring)
    return rings


def _point_in_polygon(x: float, y: float, polygon: list[tuple[float, float]]) -> bool:
    inside = False
    previous_x, previous_y = polygon[-1]
    for current_x, current_y in polygon:
        if (current_y > y) != (previous_y > y):
            crossing_x = (previous_x - current_x) * (y - current_y) / (
                previous_y - current_y
            ) + current_x
            if x < crossing_x:
                inside = not inside
        previous_x, previous_y = current_x, current_y
    return inside


def _clip_segment(start, end, min_x, min_y, max_x, max_y):
    dx, dy = end[0] - start[0], end[1] - start[1]
    lower, upper = 0.0, 1.0
    for p, q in (
        (-dx, start[0] - min_x),
        (dx, max_x - start[0]),
        (-dy, start[1] - min_y),
        (dy, max_y - start[1]),
    ):
        if p == 0:
            if q < 0:
                return None
            continue
        ratio = q / p
        if p < 0:
            lower = max(lower, ratio)
        else:
            upper = min(upper, ratio)
        if lower > upper:
            return None
    return (
        (start[0] + lower * dx, start[1] + lower * dy),
        (start[0] + upper * dx, start[1] + upper * dy),
    )


def rasterize(
    source: Path, name: str, cell_size_meters: int = DEFAULT_CELL_SIZE_METERS
) -> dict[str, Any]:
    if cell_size_meters <= 0:
        raise ValueError("La taille d'une case doit etre superieure a zero.")

    try:
        opener = gzip.open if source.suffix == ".gz" else open
        with opener(source, "rb") as stream:
            root = ET.parse(stream).getroot()
    except (ET.ParseError, OSError) as error:
        raise ValueError(f"Impossible de lire l'extrait OSM {source}: {error}") from error
    if root.tag != "osm":
        raise ValueError("Le fichier source doit etre un document OSM XML avec une racine <osm>.")

    nodes: dict[str, tuple[float, float]] = {}
    node_elements = root.findall("node")
    if not node_elements:
        raise ValueError("L'extrait OSM ne contient aucun noeud.")

    all_lons = [float(node.attrib["lon"]) for node in node_elements]
    all_lats = [float(node.attrib["lat"]) for node in node_elements]
    bounds = root.find("bounds")
    if bounds is not None:
        min_lon = float(bounds.attrib["minlon"])
        min_lat = float(bounds.attrib["minlat"])
        max_lon = float(bounds.attrib["maxlon"])
        max_lat = float(bounds.attrib["maxlat"])
    else:
        min_lon, max_lon = min(all_lons), max(all_lons)
        min_lat, max_lat = min(all_lats), max(all_lats)
    if min_lon >= max_lon or min_lat >= max_lat:
        raise ValueError("Les limites geographiques de l'extrait OSM sont invalides.")

    center_lat = float(root.attrib.get("projection_latitude", (min_lat + max_lat) / 2))
    min_x, min_y = project(min_lon, min_lat, center_lat)
    max_x, max_y = project(max_lon, max_lat, center_lat)
    width = max(1, math.ceil((max_x - min_x) / cell_size_meters))
    height = max(1, math.ceil((max_y - min_y) / cell_size_meters))
    cells = [
        [{"terrain": "plain", "priority": 0} for _ in range(width)]
        for _ in range(height)
    ]

    def grid_position(point: tuple[float, float]) -> tuple[int, int]:
        x, y = point
        col = min(width - 1, max(0, math.floor((x - min_x) / cell_size_meters)))
        row = min(
            height - 1, max(0, math.floor((max_y - y) / cell_size_meters))
        )
        return col, row

    def paint(col: int, row: int, terrain: str) -> None:
        if PRIORITY[terrain] > cells[row][col]["priority"]:
            cells[row][col] = {"terrain": terrain, "priority": PRIORITY[terrain]}

    def fill_polygon(outer, holes, terrain):
        min_col, min_row = grid_position(
            (min(point[0] for point in outer), min(point[1] for point in outer))
        )
        max_col, max_row = grid_position(
            (max(point[0] for point in outer), max(point[1] for point in outer))
        )
        for row in range(min(min_row, max_row), max(min_row, max_row) + 1):
            y = max_y - (row + 0.5) * cell_size_meters
            for col in range(min(min_col, max_col), max(min_col, max_col) + 1):
                x = min_x + (col + 0.5) * cell_size_meters
                if _point_in_polygon(x, y, outer) and not any(
                    _point_in_polygon(x, y, hole) for hole in holes
                ):
                    paint(col, row, terrain)

    for node in node_elements:
        nodes[node.attrib["id"]] = project(
            float(node.attrib["lon"]), float(node.attrib["lat"]), center_lat
        )

    ways = {way.attrib["id"]: way for way in root.findall("way")}
    for way in ways.values():
        terrain = classify(_tags(way))
        if terrain is None or not visible_at_scale(terrain, cell_size_meters):
            continue
        refs = [ref.attrib["ref"] for ref in way.findall("nd")]
        missing_refs = [ref for ref in refs if ref not in nodes]
        if missing_refs:
            print(
                f"Attention : way OSM {way.attrib.get('id', '?')} ignore, "
                f"{len(missing_refs)} noeud(s) manquant(s).",
                file=sys.stderr,
            )
            continue
        points = [nodes[ref] for ref in refs]
        if len(points) < 2:
            continue

        is_area = (
            points[0] == points[-1]
            and len(points) >= 4
            and terrain not in {"rail", "road", "major_road", "cable"}
        )
        if is_area:
            fill_polygon(points, [], terrain)

        for start, end in zip(points, points[1:]):
            clipped = _clip_segment(start, end, min_x, min_y, max_x, max_y)
            if clipped is None:
                continue
            start, end = clipped
            distance_in_cells = math.hypot(end[0] - start[0], end[1] - start[1]) / cell_size_meters
            steps = max(1, math.ceil(distance_in_cells * 2))
            for step in range(steps + 1):
                ratio = step / steps
                point = (
                    start[0] + (end[0] - start[0]) * ratio,
                    start[1] + (end[1] - start[1]) * ratio,
                )
                col, row = grid_position(point)
                paint(col, row, terrain)

    for relation in root.findall("relation"):
        tags = _tags(relation)
        terrain = classify(tags)
        if tags.get("type") != "multipolygon" or terrain not in {
            "forest", "grass", "field", "vineyard", "park", "water", "mountain"
        }:
            continue
        parts = {"outer": [], "inner": []}
        try:
            for member in relation.findall("member"):
                role = member.attrib.get("role") or "outer"
                if member.attrib["type"] != "way" or role not in parts:
                    raise ValueError("Unsupported multipolygon member")
                way = ways.get(member.attrib["ref"])
                if way is None:
                    raise ValueError("Missing multipolygon way")
                refs = [ref.attrib["ref"] for ref in way.findall("nd")]
                if len(refs) < 2 or any(ref not in nodes for ref in refs):
                    raise ValueError("Missing multipolygon nodes")
                parts[role].append(refs)
            if not parts["outer"]:
                raise ValueError("Missing multipolygon outer ring")
            outers = [[nodes[ref] for ref in ring] for ring in _join_rings(parts["outer"])]
            holes = [[nodes[ref] for ref in ring] for ring in _join_rings(parts["inner"])]
        except ValueError as error:
            print(f"Attention : relation OSM {relation.attrib['id']} ignoree : {error}.", file=sys.stderr)
            continue
        for outer in outers:
            fill_polygon(outer, holes, terrain)

    named_points = {}
    for node in node_elements:
        terrain = classify(_tags(node), is_node=True)
        if terrain is not None and visible_at_scale(terrain, cell_size_meters):
            point = nodes[node.attrib["id"]]
            if not (min_x <= point[0] <= max_x and min_y <= point[1] <= max_y):
                continue
            col, row = grid_position(point)
            paint(col, row, terrain)
            feature_name = _tags(node).get("name")
            if feature_name:
                named_points.setdefault((col, row), []).append((terrain, feature_name))

    cell_pois = {}
    cell_content = {}
    for kind, elements in (("node", node_elements), ("way", ways.values())):
        for element in elements:
            tags = _tags(element)
            category = poi_category(tags)
            content_tags = {
                key: value for key, value in tags.items()
                if key in ("wikimedia_commons", "wikipedia", "image", "description", "name")
                or key.startswith("description:")
            }
            has_content = any(key != "name" for key in content_tags)
            if category is None and not has_content:
                continue
            if kind == "node":
                point = nodes[element.attrib["id"]]
            else:
                refs = [ref.attrib["ref"] for ref in element.findall("nd")]
                if not refs or any(ref not in nodes for ref in refs):
                    print(f"Attention : POI way OSM {element.attrib['id']} ignore, geometrie incomplete.", file=sys.stderr)
                    continue
                points = [nodes[ref] for ref in refs]
                point = (
                    (min(p[0] for p in points) + max(p[0] for p in points)) / 2,
                    (min(p[1] for p in points) + max(p[1] for p in points)) / 2,
                )
            if not (min_x <= point[0] <= max_x and min_y <= point[1] <= max_y):
                continue
            position = grid_position(point)
            if has_content:
                cell_content.setdefault(position, []).append({
                    "osmId": f"{kind}/{element.attrib['id']}",
                    "tags": content_tags,
                })
            if category is None:
                continue
            poi = {"osmId": f"{kind}/{element.attrib['id']}", "category": category}
            if tags.get("name"):
                poi["name"] = tags["name"]
            cell_pois.setdefault(position, []).append(poi)

    output_cells = []
    for row_index, row in enumerate(cells):
        output_row = []
        for col_index, cell in enumerate(row):
            output_cell = {
                "glyph": TERRAINS[cell["terrain"]]["glyph"],
                "terrain": cell["terrain"],
            }
            names = sorted({
                name for terrain, name in named_points.get((col_index, row_index), [])
                if terrain == cell["terrain"]
            })
            if names:
                output_cell["names"] = names
            pois = cell_pois.get((col_index, row_index))
            if pois:
                output_cell["pois"] = sorted(pois, key=lambda poi: poi["osmId"])
            content = cell_content.get((col_index, row_index))
            if content:
                output_cell["contentSources"] = sorted(content, key=lambda item: item["osmId"])
            output_row.append(output_cell)
        output_cells.append(output_row)
    reference_bounds = {}
    if root.attrib.get("reference_bbox"):
        west, south, east, north = map(float, root.attrib["reference_bbox"].split(","))
        reference_bounds = {"referenceBounds": {
            "minLongitude": west, "minLatitude": south,
            "maxLongitude": east, "maxLatitude": north,
        }}
    return {
        "name": name,
        **({"projectionLatitude": center_lat} if "projection_latitude" in root.attrib else {}),
        **reference_bounds,
        "cellSizeMeters": cell_size_meters,
        "width": width,
        "height": height,
        "bounds": {
            "minLatitude": min_lat,
            "minLongitude": min_lon,
            "maxLatitude": max_lat,
            "maxLongitude": max_lon,
        },
        "source": source.name,
        "sourceUrl": root.attrib.get("source_url"),
        "sourceUrls": json.loads(root.attrib.get("source_urls", "[]")),
        "downloadedAt": root.attrib.get("downloaded_at"),
        "copyright": root.attrib.get("copyright"),
        "license": root.attrib.get("license"),
        "illustrative": root.attrib.get("generator") == "arcane-path-demo-fixture",
        "rows": output_cells,
        "legend": [
            {
                "terrain": terrain,
                "glyph": details["glyph"],
                "label": details["label"],
            }
            for terrain, details in TERRAINS.items()
            if terrain != "plain" and visible_at_scale(terrain, cell_size_meters)
        ],
    }


def _payload_hash(data):
    payload = {key: value for key, value in data.items() if key != "cache"}
    encoded = json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def build_cached(source, output, name, cell_size_meters=DEFAULT_CELL_SIZE_METERS, force=False):
    inputs = {
        "schemaVersion": CACHE_SCHEMA_VERSION,
        "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "pipelineSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "name": name,
        "cellSizeMeters": cell_size_meters,
    }
    key = hashlib.sha256(json.dumps(inputs, sort_keys=True).encode("utf-8")).hexdigest()
    if output.exists() and not force:
        cached = json.loads(output.read_text(encoding="utf-8"))
        if cached.get("cache", {}).get("key") == key:
            if cached["cache"].get("payloadSha256") != _payload_hash(cached):
                raise ValueError(f"Cache corrompu : {output}. Regenerer avec --force.")
            return cached, True

    data = rasterize(source, name, cell_size_meters)
    data["cache"] = {**inputs, "key": key, "payloadSha256": _payload_hash(data)}
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=output.parent, delete=False) as stream:
            temporary_path = Path(stream.name)
            stream.write(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
        temporary_path.replace(output)
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)
    return data, False


def main() -> int:
    project_root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input",
        type=Path,
        default=project_root / "data" / "regions" / "firmi.osm.gz",
        help="Chemin vers un extrait OSM XML ou .osm.gz (defaut: data/regions/firmi.osm.gz)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=project_root / "public" / "map.json",
        help="Fichier JSON de sortie (defaut: public/map.json)",
    )
    parser.add_argument(
        "--name", default="Firmi", help="Nom affiche de la region"
    )
    parser.add_argument(
        "--cell-size",
        type=int,
        default=DEFAULT_CELL_SIZE_METERS,
        help="Taille d'une case en metres (defaut: 250)",
    )
    parser.add_argument("--force", action="store_true", help="Regenerer meme si le cache est valide")
    args = parser.parse_args()

    try:
        map_data, reused = build_cached(
            args.input, args.output, args.name, args.cell_size, args.force
        )
    except (OSError, ValueError) as error:
        print(f"Erreur de generation de carte: {error}", file=sys.stderr)
        return 1

    print(
        f"{'Carte en cache' if reused else 'Carte generee'}: {args.output} "
        f"({map_data['width']} x {map_data['height']} cases, "
        f"{map_data['cellSizeMeters']} m/case)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
