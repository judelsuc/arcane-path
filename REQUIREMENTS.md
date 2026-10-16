# Requirements tracked outside the design PDF

This file records additions to the design without modifying the source PDF,
[Les Arcanes du Chemin — Document de conception.pdf](./Les%20Arcanes%20du%20Chemin%20%E2%80%94%20Document%20de%20conception.pdf).

## R-001 — Show a photo for the player's current cell

- **Requirement:** When the player is on a map cell, pressing a key displays a
  photo found online that corresponds to that cell.
- **Caching:** Cache the photo file itself, not only its URL, together with its
  source, attribution/license, geographic association, and retrieval metadata
  so it can be displayed again offline. See R-004 and R-006.
- **Status:** Recorded; not implemented in layer 1.
- **Dependency:** Requires a player position and movement, which are introduced
  in layer 2.
- **To decide during implementation:** Which key to use, which photo source to
  query, how to verify a photo matches the cell, and what to show when the game
  is offline or no photo is available.

## R-002 — Railways, mountains, and fields

- **Requirement:** Include railway tracks, mountain features, and agricultural
  fields on the map, with distinct glyphs and legend entries.
- **Status:** Implemented in layer 1 for explicit OSM features. Full elevation
  coverage is not yet implemented; the map does not infer relief from altitude.

## R-003 — Interface localization

- **Requirement:** Support translation of displayed words.
- **Status:** Implemented with French and English catalogs and a language
  selector covering interface text, terrain names, accessibility labels, and
  loading errors. Geographic names remain as supplied by the map data.

## R-004 — Cache generated regions and synchronize them with the future server

- **Requirement:** Reuse regions that have already been generated. When a
  server is introduced, synchronize the local region cache with that server.
- **Content scope:** The cache and future synchronization must also cover each
  cell's web-sourced description and photo assets, including source and license
  metadata. Current cache implementation covers only OSM snapshots and grids.
- **Status:** Local snapshot and grid caching implemented. Matching OSM
  snapshots are reused without network access. Generated grids are reused
  without rasterization when source, pipeline, name, and resolution match.
- **Integrity:** Each grid carries a cache schema version, source and pipeline
  SHA-256 hashes, cache key, and payload SHA-256 hash. Corruption is reported
  explicitly; refresh and rebuild operations are available.
- **Server dependency:** Synchronization remains required for the server layer
  (layer 9), not implemented by a local static server. It must compare cache
  versions/content hashes, transfer missing or changed regions, validate
  downloaded content before replacement, and preserve cached offline play.
  Server authority, upload permissions, and conflict handling must be defined
  when implementing that layer.

## R-005 — Test with real OSM regions

- **Requirement:** Retrieve and test real OSM data for Paris, the Alps, and Firmi
  in Aveyron, rather than using synthetic regional geometry.
- **Status:** Implemented using bounded snapshots from the official OSM map
  API. Download URLs, timestamps, OSM IDs, and license information are retained.
  Regression tests run offline against those snapshots at 250 m and 50 m per
  cell. Synthetic geometry is reserved for focused unit tests.

## R-006 — Web-sourced cell descriptions and cached cell content

- **Requirement:** Every map cell must have a short description sourced from
  the web. Cache descriptions and the photos required by R-001 for reuse and
  offline access.
- **Status:** Recorded; web-description acquisition, photo acquisition, and
  their caches are not implemented yet.
- **Provenance:** Retain source URLs, attribution/license, retrieval metadata,
  and the geographic area associated with each description and photo. A
  generated or invented description does not satisfy the web-source requirement.
- **Cache identity:** Associate content with stable geographic cell bounds and
  grid resolution, rather than display row/column alone; distinguish description
  language and content versions. Cache photo bytes as well as their metadata.
- **Synchronization:** Include descriptions, photo files, and their metadata in
  the future server cache synchronization required by R-004, preserving offline
  access to previously downloaded content.
- **To decide during implementation:** Sources and permissible reuse, how to
  obtain accurate descriptions for cells with no direct web coverage, description
  length, refresh policy, and cache storage limits. Missing content or failed
  retrieval must be explicit, not disguised as successfully sourced content.

## R-007 — Compare the ASCII map with OpenStreetMap

- **Requirement:** Show the actual OSM basemap beside the ASCII grid to check
  rasterization against real geography, especially excessive water coverage.
- **Status:** Implemented for each selectable region using the official OSM
  embed, initially fitted to the snapshot bounds, with a separate-map link.
  Panels stack on small screens.
- **Limitations:** The comparison requires Internet access and displays current
  OSM tiles rather than the cached snapshot. A narrow waterway can still mark
  an entire intersected cell as water unless a higher-priority symbol from
  R-008 is displayed.

## R-008 — Travel-scale hierarchy

- **Requirement:** Keep main roads such as Firmi's D 840 visible and do not
  display individual buildings at the same scale as settlement markers.
- **Status:** Implemented. Major OSM highways use a distinct `+` symbol and
  outrank water and railways for display; stations and settlements take priority.
  Building footprints and their legend entry are hidden at 250 m per cell and
  coarser, and remain available at finer resolutions.
- **Limitations:** A cell still has one display symbol; showing a road over
  water does not establish that the road is a bridge or traversable.

## R-009 — Green countryside and fewer roads at travel scale

- **Requirement:** Remove small roads from the travel view so countryside reads
  as fields, grassland, and forest rather than a dense road network.
- **Status:** Implemented at 250 m per cell and coarser. Minor roads and their
  legend entry are hidden, while major routes remain. Forest, meadow, and field
  glyphs use green colors. Complete land-cover multipolygons, including inner
  holes, are rasterized from the actual OSM data.
- **Verification:** Firmi's expanded cached snapshot must show at least 35% green cells
  (the earlier, smaller extract used a 45% threshold),
  more green cells than major-road cells, no minor-road or building cells, and
  retain the D 840. Minor roads remain available at finer scales.
- **Data limitations:** Incomplete multipolygons are reported and skipped.
  Missing farmland is not fabricated; existing grassland remains grassland.

## R-010 — Cell inspection and place names

- **Requirement:** Hovering a cell displays information, including its town
  name when available.
- **Status:** Implemented with terrain, OSM point names, grid position, cell
  center coordinates, and nominal cell size in a tooltip and persistent detail
  panel. Keyboard focus and tap/click are also supported. Labels are localized,
  names are not invented or translated, and region changes reset inspection.
- **Scope:** These are local map facts, not the web descriptions from R-006.

## R-011 — Puy de Wolf as a hill

- **Requirement:** Puy de Wolf must appear as a hill.
- **Status:** Implemented using the real OSM summit (node 858156918, elevation
  479 m). Firmi's snapshot was expanded north to include it. The `n` symbol
  represents explicit OSM hills and peaks below 600 m with a recorded elevation,
  a rendering convention rather than a geomorphological classification.
  Hovering its cell shows the name Puy de Wolf.

## R-012 — Expand Firmi to the visible comparison area

- **Requirement:** Expand the downloaded region to the area visible in the
  reference map, rather than completing missing polygon members only.
- **Status:** Implemented, now automated through R-014. Current bounds are
  2.2605397 west, 44.522976 south, 2.3494603 east, and 44.5670196 north.
  The travel grid is 29 x 20 cells.
- **Reference framing:** Preserve the original embed framing while expanding
  the downloaded data to cover its visible area. Subsequent zoom, pan, or
  viewport resizing does not automatically expand the snapshot.
- **Acquisition:** Subdivide on the OSM API's explicit node-limit refusal and
  merge real elements by OSM type/ID. Cache the merged snapshot and source URLs.
  Completing all missing multipolygon members remains a separate limitation.

## R-013 — POIs in cell hover information

- **Requirement:** Include points of interest in the cell's displayed hover
  text whenever OSM supplies them.
- **Status:** Implemented for node and way POIs: amenities, shops, tourism,
  heritage, rail/cable stations, and summits. POI names and localized categories
  appear in both the tooltip and detail panel, independent of the terrain symbol.
  POI IDs and metadata are cached with each generated cell.
- **Positioning:** Nodes use their coordinates. Ways use the center of their
  bounding box as a representative position, not an inferred entrance.
  Relation POIs and externally sourced web descriptions are not yet included.

## R-014 — Automatic preparation for every comparison region

- **Requirement:** Apply the expanded comparison-area coverage to Paris and
  Chamonix too, and automate the mechanism.
- **Status:** Implemented by `python3 scripts/prepare_regions.py` using shared
  `data/regions.json` configuration. All three real OSM snapshots and grids are
  prepared and cached. Paris is 14 x 10 cells; Chamonix is 28 x 20.
- **Coverage:** Conservative Web Mercator fit for the configured 518 x 360
  viewport, including smaller embed initialization dimensions, downward
  whole-zoom rounding, and outward-rounded geographic bounds. Original
  reference framing remains separate from downloaded bounds.
- **Controls:** Select regions with repeatable `--region`; override viewport
  size with `--width`/`--height`; refresh source data with `--refresh` or
  rebuild grids with `--force`. Unchanged runs reuse both caches.
- **Limits:** No live pan/zoom/resize-triggered download, no guarantee of
  pixel-exact framing across future OSM embed changes, and no completion of
  missing multipolygon members.
