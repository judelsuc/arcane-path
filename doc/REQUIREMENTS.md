# Requirements tracked outside the design PDF

This file records additions to the design without modifying the source PDF,
[Les Arcanes du Chemin — Document de conception.pdf](./Les%20Arcanes%20du%20Chemin%20%E2%80%94%20Document%20de%20conception.pdf).

## R-001 — Show a photo for the player's current cell

- **Requirement:** When the player is on a map cell, pressing a key displays a
  photo found online that corresponds to that cell.
- **Caching:** Cache the photo file itself, not only its URL, together with its
  source, attribution/license, geographic association, and retrieval metadata
  so it can be displayed again offline. See R-004 and R-006.
- **Status:** Implemented for a selected cell: click or keyboard-focus the
  cell, then press P or use the Photo button. A modal displays the cached photo,
  credits, license and geographic association. Escape closes it.
- **Layer 2 integration:** In walking mode, descriptions and photos follow the
  player's cell rather than the hovered/clicked cell. Static-map inspection
  remains available outside walking mode.
- **Priority:** OSM-linked Commons file (`wikimedia_commons`, or `image` with
  a Commons file/page reference), then geolocated Commons images inside the
  cell, then Commons-hosted images from Wikipedia articles inside the cell.
  If none is usable, nearby Commons photos within 2 km may be used, explicitly
  labelled with distance from the cell center. Unlicensed, unreadable or
  unsupported files are rejected; source failures are shown, not concealed.
- **Gallery:** Download up to 5 distinct usable photos in source-priority order,
  filling remaining slots with nearby photos when needed. Cache every image's
  bytes and individual provenance. Previous/next buttons and Left/Right keys
  browse without network requests; the counter and disabled end buttons expose
  the available range. Fewer than 5 images is valid when sources lack coverage.
  The photo cache schema/limit distinguishes galleries from legacy one-photo
  entries, whose bytes are reused during upgrade and retained during outages.

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
  metadata. Local caching covers OSM snapshots/grids plus discovered descriptions
  and actual photo bytes in the browser's IndexedDB.
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
- **Status:** Implemented on demand for clicked or keyboard-focused cells.
  Description priority is localized OSM description tag (then the unqualified
  tag), Wikipedia summary for a place inside the cell, then clearly labelled
  nearby Wikipedia context within 2 km. Excerpts are at most 600 characters.
  English/French requests are separate; unqualified OSM language is explicitly
  unspecified. If no sourced text exists, an unavailable message is shown:
  coverage is not guaranteed and no invented text is substituted.
- **Provenance:** Retain source URLs, attribution/license, retrieval metadata,
  and the geographic area associated with each description and photo. A
  generated or invented description does not satisfy the web-source requirement.
- **Cache identity:** Associate content with stable geographic cell bounds and
  grid resolution, rather than display row/column alone; distinguish description
  language and content versions. Cache photo bytes as well as their metadata.
- **Synchronization:** Include descriptions, photo files, and their metadata in
  the future server cache synchronization required by R-004, preserving offline
  access to previously downloaded content.
- **Cache policy:** IndexedDB stores descriptions, image blobs, source/credit/
  license metadata, geographic bounds, resolution, language, content schema
  version and retrieval time. Keys include a geographic/source fingerprint,
  not region names or row/column alone. Reopening cached content requires no
  provider requests. Explicit refresh bypasses the cache; successful content is
  cached even if a higher-priority provider failed, with warnings retained.
  An outage without content is not cached as a definitive absence.
- **Storage:** Images are limited to 12 MB each. A clear-cache button is
  provided; there is no automatic eviction or refresh interval yet. Browser
  quota/storage failures are explicit. Browser-managed storage can be evicted
  and is specific to this site origin (including port); it is not server sync.

## R-007 — Compare the ASCII map with OpenStreetMap

- **Requirement:** Show the actual OSM basemap beside the ASCII grid to check
  rasterization against real geography, especially excessive water coverage.
- **Status:** Implemented for each selectable region using the official OSM
  embed and stable reference bounds, with a separate-map link. The comparison
  lives in a right-side drawer, closed by default, opened by a localized button
  and closed by its close button or Escape. It adapts to narrow screens and
  returns focus on close. The iframe loads only when opened for a region.
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
  appear in the tooltip and a collapsible list below the selected cell's
  description, independent of the terrain symbol. The list includes a count,
  scrolls for dense cells, and resets when the selected cell or region changes.
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

## R-015 — Non-blocking walking, effort and simulated calendar

- **Requirement:** At 250 m per cell, no terrain type blocks movement. Walking
  speed depends on ground and slope; accumulate fatigue and energy expenditure
  for future food mechanics. Show date and time advancing by travel duration.
- **Status:** Implemented as turn-based cardinal steps with a player marker,
  following camera and a short input/animation delay. A journey starts at the
  region center with the current UTC timestamp. Walking/rest update simulated
  time, including day rollover, not wall-clock waiting.
- **Model:** Tunable gameplay approximation in `../travel.mjs`: base 4.5 km/h,
  average origin/destination terrain factor, slope speed factor, fatigue
  slowdown, min/max speed 0.5/6 km/h. Track distance, ascent/descent, fatigue
  0-100, and cumulative kcal using a 40 kg gameplay mass. No safety/medical
  accuracy is claimed. Rest advances 30 minutes, recovers up to 20 fatigue,
  and consumes basal energy. No food inventory or motorized mode yet.
- **Height:** Real per-cell center elevation from Open-Meteo / Copernicus
  DEM GLO-90, credited CC BY 4.0 and cached with retrieval/source metadata.
  Missing elevation is explicit; flat-slope cost is an estimate and affected
  steps remain counted visibly. It is not silently invented.
- **Limits:** The travel model uses dominant OSM classes, not route topology.
  No terrain is blocked; unknown chunks wait for downloads with explicit
  retryable failures and no cost charged on failure. Journeys currently reset
  when returning to the fixed map, changing region or reloading the page.
  Trains/buses are deferred; walking is the only travel mode.
- **Layout:** Travel controls, clock and statistics are in a right sidebar on
  desktop and below the map on narrow screens. Model/keyboard explanations are
  collapsed by default; the map remains the primary viewing area.
  The entire 24 x 24 travel grid fits its panel using responsive square cells,
  without an internal scrolling crop. The travel header is compact, and the
  grid size accounts for viewport height as well as available width.
- **OSM comparison:** The closed drawer remains lazy-loaded. Opening it centers
  on the player's current cell with a marker and matching external-map link.

## R-016 — Background neighbor preparation and streaming

- **Requirement:** Download neighboring cells in the background to smooth travel.
- **Status:** A local standard-library Python backend prepares aligned chunks
  of 8 x 8 cells, reusing included OSM coverage or downloading genuine neighboring
  extracts. Four cardinal neighbors are prefetched, prioritizing movement
  direction, then side boundaries by proximity, then behind. Turning reorders
  queued work without interrupting active requests or discarding cached data.
  Evicted memory chunks can be loaded again from the persistent server cache.
  The camera shows a 24 x 24
  window; unloaded areas are explicitly `?`. Crossing chunk edges, including
  negative indices, preserves geographic alignment.
- **Bounds:** Two client requests and two backend workers at once, ten backend
  jobs maximum, deduplicated chunk requests, foreground priority within the
  client queue, and 25 resident client chunks. Download failure is explicit.
- **Persistence:** Local `.cache/travel/` stores compressed OSM, sampled
  elevation and checksummed grid payloads with source metadata and atomic
  replacement. Fully cached chunks require no provider calls after restart.
  Missing elevation is retried rather than permanently cached as valid data.
- **Source resilience:** The official map API has two read-only Overpass
  fallbacks. Provider failures are logged, throttled sources have individual
  cooldowns, and network source requests are serialized across workers.
  Overpass responses with runtime errors are rejected, not cached as valid maps.
  Actual source URLs are retained. Public sources offer no availability guarantee.
- **Scope:** This local prototype backend does not implement the future
  multiplayer server or remote photo/description/cache synchronization.

## R-017 — Player inspection and Look mode

- **Requirement:** Information normally follows the player. L enables an
  independent keyboard inspection cursor, without mouse-hover effects.
- **Status:** L or the Look button toggles inspection within the visible grid.
  Arrow keys and direction buttons move the cursor without spending journey
  time, energy or fatigue. Descriptions, POIs and P follow the inspected cell.
  Escape or L returns to the player; Escape closes an open dialog first.
  Unknown cells are labelled and do not request invented cell content.
  Mouse hover neither highlights cells nor changes information or shows tooltips.

## R-018 — Layer 3: time and circular sky dial

- **Requirement:** Show day/night using a sun or moon moving left to right
  along a circular arc, rather than darkening the map.
- **Status:** A compact circular sky dial follows simulated walking/rest time.
  Approximate sunrise/sunset are calculated offline from the player's location
  and game date using NOAA fractional-year solar equations. UTC labels match
  the game clock. Terrain-dependent speed remains unchanged.
- **Night:** The moon is a symbolic night-progress indicator between sunset and
  next sunrise, not an astronomical lunar position or phase. Look mode and real
  waiting do not advance the dial. Polar day/night are explicit.
- **Limits:** Clear-horizon solar approximation, no mountain-horizon or weather
  correction. No map dimming, fog, survival needs or night movement penalty.

## R-019 — Cached historical seasonal weather

- **Requirement:** Fetch and cache seasonal temperature/weather averages for
  the location and simulated date, rather than a live forecast.
- **Status:** Open-Meteo/ERA5 daily reanalysis for the last five complete civil
  years is summarized by month. Display mean temperature, average daily min/max,
  average daily precipitation, and most frequent weather group with frequency.
  Label reference period, month, approximate area and source/license.
- **Cache:** Twelve months per 0.1-degree area and reference period, atomic
  checksummed disk storage, deduplicated serialized provider access, bounded
  client memory. No provider call for cached areas, even after restart.
  Missing/invalid data is rejected. Failures are visible with manual retry
  and a one-minute provider cooldown; movement never waits for weather.
- **Limits:** Recent historical means, not official 30-year climate normals
  or actual conditions on the simulated day. Informational only; no effects
  on speed, fatigue, needs or the solar calculation.

## R-020 — Configurable water coverage threshold

- **Requirement:** Water must cover at least 50% of a cell before it displays
  as water; keep the threshold easily configurable in YAML.
- **Status:** `config.yml` defines `map.water_coverage_percent`, validated in
  (0, 100]. Static and streamed grids use the same configuration and include it
  in rendered-cache identity, without invalidating source/elevation caches.
- **Geometry:** Union coverage estimated with 20 x 20 samples per cell,
  clipped to actual cell extent, excluding multipolygon holes. Water outlines
  no longer paint whole cells. Linear waterways contribute only when mapped
  with a numeric positive width in metres; unknown widths are not guessed.
  Waterway presence and estimated coverage remain available in cell info.
  Existing road/place priority remains unchanged.

## R-021 — Estimated day/night temperature

- **Requirement:** Vary temperature with game time using cached historical
  daily lows/highs, without downloading historical hourly series.
- **Status:** Smooth cosine warming from the monthly typical low at sunrise
  to the typical high three hours after local solar noon, then cooling.
  Solar times follow player coordinates; polar periods use a 06:00 solar low.
  The temperature card is labelled as an estimate; historical means remain
  in the details along with the model explanation.
- **Scope:** No extra network calls or new cache format. Walking and rest
  advance temperature, not real waiting or inspection. Weather condition icons
  still represent the month's most common condition. Map lighting is unchanged.

## R-022 — Temperature adjusted for elevation

- **Requirement:** Player altitude influences estimated temperature.
- **Status:** Apply -0.65 degrees Celsius per 100 m above the historical
  weather reference elevation (warmer below). The card's estimated temperature
  and low/high range receive the same correction; source averages remain raw.
  Display reference/player elevations and correction in details.
- **Reliability:** Reference elevation is validated and stored in weather
  cache v2. Missing player/reference elevation is explicitly labelled and
  skips adjustment, never assumed sea level. This is a lapse-rate estimate,
  not a model of inversions, microclimates or actual weather.

## R-023 — Additional key-free reusable photo sources

- **Requirement:** Add photo providers without keys, accepting openly licensed
  photos compatible with local image caching.
- **Status:** iNaturalist and GBIF supply fallback nature-observation photos,
  explicitly labelled as species observations, not general landscape views.
  Existing OSM/Commons/Wikipedia priority is preserved.
- **Validation:** Explicit CC0/CC BY/CC BY-SA media licenses, author, known
  HTTPS image hosts, coordinates within 2 km and declared uncertainty <= 250 m.
  Obscured/generalized positions are excluded. GBIF occurrence licenses do not
  substitute for image licenses. Duplicate iNaturalist images are merged.
- **Cache:** Same five-photo/12 MB limits, offline IndexedDB image bytes and
  attribution. Photo cache v3 preserves prior v2/v1 images on source failures.
  Provider errors remain visible; no API keys are required.

## R-024 — Future user-contributed photos and descriptions

- **Requirement:** Allow users to upload photos and contribute descriptions
  associated with map cells/locations.
- **Status:** Deferred; recorded for a later layer, not implemented.
- **Design considerations:** Preserve contributor attribution and declared
  usage rights, description language and geographic association. Define upload
  validation, moderation, privacy controls, editing/removal and cache
  invalidation before enabling shared contributions.

## R-025 — Real geocaches with virtual game items

- **Requirement:** Integrate real geocache listings read-only and associate
  fictional in-game items with those real caches.
- **Status:** Deferred; recorded for a later layer, not implemented.
- **Target layer:** Layer 13 — Events: a real cache supplies a geographic
  anchor for a search/discovery event and its virtual reward. Layer 9 — Server
  provides the foundation for authorized provider access and permitted caching.
  Optional extensions can connect discoveries to Layer 8's parent trail,
  Layer 20's tarot lore, and Layer 21's shared-player traces; these are not
  prerequisites for an initial read-only, per-journey implementation.
- **Separation:** Provider listings, contents and logs remain untouched.
  Game items are stored separately, keyed by provider and cache identifier,
  and clearly labelled as fictional rather than promised physical contents.
  A virtual visit/discovery must never submit a real-world "Found it" log.
- **Gameplay direction:** Searching near a cache can consume game time and
  reveal supplies, keepsakes or story clues. Ordinary discoveries should
  persist per journey, without repeat-search farming or another player
  emptying the adventure.
- **Provider constraints:** Use authorized APIs or permitted user imports;
  verify access, licensing, attribution, display and caching rules before
  implementation. Respect disabled/archived listings and do not expose
  unpublished puzzle solutions, final coordinates or hidden stages.
- **Resilience and safety:** Do not make mandatory progression depend solely
  on a third-party cache. Virtual access does not imply permission to visit
  or search a physical site. Physically placing game objects in containers
  is outside this requirement and would require a separate opt-in arrangement
  with cache owners.

## R-026 — Configurable progressive photo galleries

- **Requirement:** Configure photo count in YAML and display photos before the
  whole gallery finishes downloading.
- **Status:** `photos.max_per_cell` in `config.yml`, default 5, validated 1-20.
  The server serves current photo configuration; static preparation exports it.
  Gallery cache keys include the count. Photos appear after each successful
  download and can be browsed while further sources/downloads continue.
  Preserve current gallery position at completion and ignore stale progress
  after selection/language changes. Loading photos are not labelled as cached.

## R-028 — Layer 4 character-dependent survival

- **Requirement:** Add strength/build, endurance and pace trade-offs before
  hunger/fatigue/sleep survival. Stronger/faster profiles require more energy.
- **Status:** Implemented with three selectable YAML profiles, energy reserve,
  passive metabolism and active exertion; hunger/sleep speed penalties,
  distinct rest and sleep, temporary free meals only on settlement cells,
  explicit exhaustion outcomes and restart.
- **Bounds:** No player-state time advancement from real waiting, Look,
  content downloads or failed movement. No weather penalty, inventory,
  economy or skill tree yet. Constants are gameplay estimates.
- **Review:** Decisions, provisional balancing, manual checkpoint tests and
  open questions are recorded in IMPLEMENTATION-CHOICES.md.

## R-029 — Layer 5 real settlement menus

- **Design milestone:** Entering a named settlement opens a text-only welcome
  and menu of real named OSM venues. Reopening, browsing and leaving cost no
  time or energy; Look inspection does not trigger entry.
- **Implemented:** Preserve settlement OSM identities/Wikipedia associations,
  POI positions, venue types and access restrictions in rendered maps.
  Show a sourced cached Wikipedia welcome only for an associated or matching
  settlement article. Show explicit absence/failure otherwise.
- **Bounds:** Nearby loaded cells within 2 km, at most five public-facing
  venues per broad category, with source links; no administrative-boundary
  claims, invented venues, guaranteed opening, real-person story roles,
  fictional reputational claims, shop prices or economy actions.
- **Review:** A larger town area, richer venue categories and actual game
  interactions await subsequent layers and balancing feedback.

## R-030 — Tarot budget, localized meals and index-based economy

- **User decision:** Starting money depends on a randomly drawn tarot card.
  Initial 22-card budget table is provisional; daily draws do not award money.
- **Meals:** Manually curate internet-sourced local specialties now, with
  source/publisher/check date, coordinates and original short summaries.
  Later a source-grounded LLM will populate this database. Meals replenish
  hunger reserves; nutritional values are explicit gameplay approximations.
- **Pricing:** Use the Big Mac Index rather than Eurostat for this prototype.
  Prices remain fictional index-scaled game tariffs, never real venue offers.
  Missing mapped country or index uses a visibly labelled reference tariff,
  not an invented country or local observation.
- **Status:** Layer 6 implemented for the four initial geographic areas;
  paid meals, integer-cent wallet and current-cell mapped lodging/free shelters.

## R-031 — Unsheltered night danger and future tarot events

- **User decision:** Find shelter at night or suffer increased fatigue.
  Outdoor sleep has reduced recovery. Random dangerous events will later
  depend on the daily tarot card and may require survival minigames.
- **Status:** Solar-night fatigue, poor outdoor sleep and daily tarot draw
  implemented in Layer 6. Each card retains a provisional event-risk weight.
  **No random night event or survival minigame is active yet.**
- **Target:** Layer 13 Events, with Layer 6 exposure/daily-card foundations.
  Street-music earnings come first in Layer 7. No real-time idle penalties.

## R-032 — Layer 7 street-music earning loop

- **Status:** Implemented one visual rhythm variant, eight timed notes,
  keyboard/touch input, score-proportional earnings, upfront game time,
  energy/fatigue and exposure costs.
- **Bounds:** Only actual settlement cells, no remote Look earnings, no
  double reward or note spam. Cancellation/tab hiding awards nothing and
  does not refund survival costs. No audio or real permit/venue claim.
- **Milestone:** Walk, earn, buy a meal and sleep in mapped shelter. A model
  test verifies three full simulated days of paid meals/lodging and earnings.

## R-033 — Layer 8 minimal generated parent trail

- **Design milestone:** A generated parent, three stages, fictional witnesses
  with fact sheets and hand-written dialogue, then a reunion screen. One
  journey has a beginning, objective and end.
- **Status:** Implemented three distinct nearby named OSM cells on all four
  initial maps, provisional parent name generation, sequential clues, a
  free-to-read journal, five-minute actual-position encounters and a terminal
  reunion outcome. Survival failure takes precedence over progress.
- **Bounds:** No OSRM itinerary, parent movement, real-person witness roles,
  false leads, photos-as-parent identity, save/load, server-created campaign,
  or long-distance route generation. Geographic landmarks do not imply
  real staff participation or guaranteed physical access.

## R-034 — Local save/resume before Layer 9

- **User decision:** Add save/resume before expanding the game server.
- **Status:** One versioned browser-local slot per region, autosaved after
  successful state changes, explicit resume/new-journey controls and manual
  save retry. Starting fresh confirms replacement.
- **Preserve:** Global position, simulated clock, character, needs, money,
  birth/daily tarot, economic history/counters, parent route, found witness
  facts and terminal outcomes. Pin the original survival/economy rules.
- **Interruption:** No offline time cost, reroll or repeated reward. Pending
  music resumes cancelled, with upfront costs retained and zero reward.
- **Reliability:** Validate before loading/writing, reject changed map geometry,
  surface quota/access/corruption/version errors, retain unreadable originals
  until explicitly replaced, detect stale-tab writes. No cloud sync,
  import/export, cross-device transfer, migration or anti-cheat claims.

## R-035 — Downloaded background music with missing-file fallback

- **User request:** Play the music being downloaded without requiring all
  tracks to be present.
- **Status:** Opt-in background loops with mute and volume controls, accepting
  canonical/numbered prompt filenames in WAV, MP3 or OGG.
- **Context:** Title, actual player terrain/region/solar night, town/shelter/
  journal menus, reunion and exhaustion. Inspection does not move the player.
- **Fallback:** Requested track, daytime road, title, then explicit silence.
  Missing/undecodable files and autoplay blocks are visible/logged. Re-enabling
  retries newly added files. No gameplay dependence on audio availability.
- **Timing:** Pause while hidden and during the rhythm-game dialog. Do not
  use unaligned generated practice music as the rhythm clock. SFX and future
  event/dungeon tracks remain separate unimplemented audio surfaces.

## R-027 — Geocache-linked fictional dungeons

- **Requirement:** Real geocaches can anchor entrances to fictional,
  explorable dungeons, with an overworld-to-interior transition inspired by
  Ultima's separate exploration scales.
- **Status:** Deferred; recorded for a later layer, not implemented.
- **Target layer:** Extension to Layer 13 — Events, building on R-025's
  read-only geocache integration. Layer 20 — Lore can later add tarot-related
  locations and discoveries. Dungeon exploration is additional scope, not
  required to complete the original Layer 13 milestone.
- **Exploration:** Leave the real-world 250 m grid for a separate room-scale
  interior map, then return to the same geographic entrance. Start with one
  small handcrafted dungeon to validate entering, exploring and returning
  before considering procedural generation.
- **Discovery direction:** A fictional item discovered through a cache may
  reveal or unlock an entrance, potentially under a game-time condition.
  Interiors can contain environmental puzzles, hidden passages, parent-trail
  clues, supplies, keepsakes and rare tarot clues. Conventional combat or
  monster encounters are not assumed requirements.
- **Continuity:** Preserve journey state across transitions and record
  interior discoveries per journey to prevent repeat-loot farming. Define
  interior action time and interactions with fatigue, light and supplies
  before implementation.
- **Separation and safety:** Entrances, interiors and associated items are
  explicitly fictional, not claims about real tunnels or accessible sites.
  Never encourage physical entry, trespassing or unsafe searches. Real cache
  listings, contents and logs remain untouched; no automatic real find logs.
- **Resilience:** Dungeons are optional discoveries. Disabled, archived or
  unavailable third-party caches must not block the main story; any mandatory
  clue needs an alternative route or suitable landmark anchor.
