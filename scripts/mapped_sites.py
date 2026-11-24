"""Visual site annotations; deliberately independent of terrain and gameplay POIs."""

import sys
import gzip
import json
from functools import lru_cache
import xml.etree.ElementTree as ET

SITE_VERSION = 1

SITE_KINDS = (
    "stadium", "mall", "cemetery", "airport", "hospital", "university",
    "industrial", "harbour", "garden", "attraction", "castle", "exhibition",
)


def site_kind(tags):
    if tags.get("disused") == "yes" or tags.get("abandoned") == "yes":
        return None
    for kind, field, values in (
        ("stadium", "leisure", ("stadium",)),
        ("mall", "shop", ("mall",)),
        ("cemetery", "landuse", ("cemetery",)),
        ("cemetery", "amenity", ("grave_yard",)),
        ("airport", "aeroway", ("aerodrome",)),
        ("hospital", "amenity", ("hospital",)),
        ("university", "amenity", ("university", "college")),
        ("industrial", "landuse", ("industrial",)),
        ("harbour", "landuse", ("port",)),
        ("harbour", "leisure", ("marina",)),
        ("harbour", "industrial", ("port",)),
        ("garden", "leisure", ("park", "garden")),
        ("attraction", "tourism", ("zoo", "theme_park")),
        ("castle", "historic", ("castle", "archaeological_site", "fort")),
        ("exhibition", "amenity", ("exhibition_centre", "conference_centre")),
    ):
        if tags.get(field) in values:
            return kind
    return None


@lru_cache(maxsize=128)
def source_sites(path, modified, geometry):
    """Derive optional annotations from already cached OSM, never fetch or rerasterize terrain."""
    from build_map import project, _point_in_polygon, _join_rings
    bounds, latitude, width, height, cell_size = json.loads(geometry)
    try:
        with (gzip.open if path.endswith(".gz") else open)(path, "rb") as stream:
            root = ET.parse(stream).getroot()
    except ET.ParseError as error:
        raise ValueError("Invalid cached OSM site source.") from error
    if root.tag != "osm":
        raise ValueError("Invalid cached OSM site source.")
    min_x, min_y = project(bounds["minLongitude"], bounds["minLatitude"], latitude)
    max_x, max_y = project(bounds["maxLongitude"], bounds["maxLatitude"], latitude)
    nodes = {node.attrib["id"]: project(float(node.attrib["lon"]), float(node.attrib["lat"]), latitude)
             for node in root.findall("node")}
    ways = {way.attrib["id"]: way for way in root.findall("way")}

    def position(point):
        import math
        return (min(width - 1, max(0, math.floor((point[0] - min_x) / cell_size))),
                min(height - 1, max(0, math.floor((max_y - point[1]) / cell_size))))

    return annotate_sites(root, nodes, ways, min_x=min_x, min_y=min_y, max_x=max_x, max_y=max_y,
                          cell_size=cell_size, grid_position=position, point_in_polygon=_point_in_polygon,
                          join_rings=_join_rings)


def enrich_sites(grid, source):
    if grid.get("sitesVersion") == SITE_VERSION:
        return grid
    bounds = grid["bounds"]
    latitude = grid.get("projectionLatitude", (bounds["minLatitude"] + bounds["maxLatitude"]) / 2)
    sites = source_sites(str(source), source.stat().st_mtime_ns,
                         json.dumps([bounds, latitude, grid["width"], grid["height"], grid["cellSizeMeters"]],
                                    sort_keys=True))
    return {**grid, "sitesVersion": SITE_VERSION, "rows": [
        [{**cell, **({"sites": sites[col, row]} if (col, row) in sites else {})}
         for col, cell in enumerate(cells)] for row, cells in enumerate(grid["rows"])]}


def annotate_sites(root, nodes, ways, *, min_x, min_y, max_x, max_y,
                   cell_size, grid_position, point_in_polygon, join_rings):
    """Mark polygon-covered cell centres (excluding holes), or an exact mapped point."""
    result = {}

    def add(position, element, kind, category):
        annotation = {"osmId": f"{kind}/{element.attrib['id']}", "kind": category}
        tags = {tag.attrib["k"]: tag.attrib["v"] for tag in element.findall("tag")}
        if tags.get("name"):
            annotation["name"] = tags["name"]
        if tags.get("access"):
            annotation["access"] = tags["access"]
        result.setdefault(position, {})[annotation["osmId"]] = annotation

    for kind in ("node", "way", "relation"):
        for element in root.findall(kind):
            tags = {tag.attrib["k"]: tag.attrib["v"] for tag in element.findall("tag")}
            category = site_kind(tags)
            if category is None:
                continue
            if kind == "node":
                point = nodes[element.attrib["id"]]
                if min_x <= point[0] <= max_x and min_y <= point[1] <= max_y:
                    add(grid_position(point), element, kind, category)
                continue
            try:
                if kind == "way":
                    refs = [node.attrib["ref"] for node in element.findall("nd")]
                    if len(refs) < 4 or refs[0] != refs[-1]:
                        raise ValueError("Site boundary is not closed")
                    outers = [[nodes[ref] for ref in refs]]
                    holes = []
                else:
                    if tags.get("type") != "multipolygon":
                        continue
                    parts = {"outer": [], "inner": []}
                    for member in element.findall("member"):
                        role = member.attrib.get("role") or "outer"
                        if member.attrib.get("type") != "way" or role not in parts:
                            raise ValueError("Unsupported site member")
                        parts[role].append([node.attrib["ref"] for node in
                                            ways[member.attrib["ref"]].findall("nd")])
                    outers = [[nodes[ref] for ref in ring] for ring in join_rings(parts["outer"])]
                    holes = [[nodes[ref] for ref in ring] for ring in join_rings(parts["inner"])]
                if not outers:
                    raise ValueError("Missing site boundary")
            except (KeyError, ValueError, IndexError) as error:
                print(f"Warning: mapped site {kind}/{element.attrib['id']} skipped: {error}.", file=sys.stderr)
                continue
            for outer in outers:
                west, east = min(p[0] for p in outer), max(p[0] for p in outer)
                south, north = min(p[1] for p in outer), max(p[1] for p in outer)
                if east < min_x or west > max_x or north < min_y or south > max_y:
                    continue
                first_col, first_row = grid_position((west, north))
                last_col, last_row = grid_position((east, south))
                marked = False
                for row in range(first_row, last_row + 1):
                    for col in range(first_col, last_col + 1):
                        x = (min_x + col * cell_size + min(max_x, min_x + (col + 1) * cell_size)) / 2
                        y = (max_y - row * cell_size + max(min_y, max_y - (row + 1) * cell_size)) / 2
                        if point_in_polygon(x, y, outer) and not any(
                                point_in_polygon(x, y, hole) for hole in holes):
                            add((col, row), element, kind, category)
                            marked = True
                # Small sites still have a real mapped boundary point, not a guessed centroid.
                if not marked:
                    point = next((p for p in outer if min_x <= p[0] <= max_x and min_y <= p[1] <= max_y), None)
                    if point:
                        add(grid_position(point), element, kind, category)
    return {position: sorted(values.values(), key=lambda item: (SITE_KINDS.index(item["kind"]), item["osmId"]))
            for position, values in result.items()}
