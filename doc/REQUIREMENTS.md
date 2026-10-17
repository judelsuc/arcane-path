# Requirements tracked outside the design PDF

## R-101 - More photo coverage without increasing the 2 km limit

- **User request:** No photos near 43.992579, 2.397766. Investigate additional
  sources, keep the existing 2 km limit, and use an explicitly identified
  aerial photograph when ground-level images are missing.
- Commons, Wikipedia, iNaturalist and GBIF remain the priority. Do not relax
  license or positional-accuracy checks to fill an empty cell.
- If no usable photos remain, request the exact cell bounds from IGN's open
  orthophotography service, after confirming French coverage. Label it as an
  aerial image, not a ground view, and disclose that imagery may be older.
  Preserve IGN attribution and Licence Ouverte 2.0 in cache/notebook.
- Retry cached photo absences so an old empty result cannot hide the new
  source. Source failures remain explicit and are not cached as absence.
- This fallback is mainland-France/Corsica only; it does not promise coverage
  abroad. Never use aerial imagery as an uncaptioned quest-photo clue.
- Google login does not grant Maps imagery rights or API billing. A future
  Google viewer would require its own approved API/billing setup and terms;
  do not persist Google imagery as notebook blobs.

## R-103 - Abandoned journals and independent side quests

- **User request:** On a failed game over, leave the quest journal at the
  player's location and persist it on the server. Another player or a later
  run can find it, finish finding its owner's parent and return the journal.
- Confirmed scope: publish quest clues and fictional journey history only,
  not pinned photos or player-written notes. Publish automatically after failed
  journeys, not after successful reunions.
- Finding a journal adds a delivery side quest and must not replace or alter
  the finder's own parent search.
- Claim each journal atomically on the server for one finder at a time.
  Release after seven days without playing, and immediately when that finder
  dies. Persist progress and handle reloads, retries and concurrent pickups.
- Arcane-object searches are also side quests. Their gameplay is explicitly
  deferred; do not implement it as part of abandoned-journal delivery.
- Status: requirements agreed; server persistence, claims and delivery gameplay
  are not implemented yet.

## R-102 - Frequent narrative clues and protection against unlucky streaks

- **User request:** Clue searches are too rare and give too little reassurance
  about staying on the trail. Approved more frequent signs, gentler probability
  decay, informative empty searches, anti-streak protection and clear journal
  evidence categories, without an exact warmer/colder navigation meter.
- Full-clue chance is 0.08 + 0.82 exp(-routeDistance / 6000): about 90% on the
  actual reference route, 38% at 6 km and 23% at 10 km. Destination proximity
  still controls vague/partial/precise information and randomized action costs.
- Within 6 km of that route, additional small signs can support the lead
  without naming a destination. After three empty searches in distinct cells
  near the route, a search in a new nearby cell guarantees at least a sign.
  Repeated cells do not build or trigger that guarantee; successful clues/signs
  clear it. The streak is stage-specific and survives save/resume.
- Signs never advance the quest, unlock precise knowledge, or count as name/
  photo recognition evidence. Keep at most four signs per stage in the journal.
  Preserve all existing time, fatigue, hunger and fainting consequences.
- Empty searches explicitly say they do not prove a wrong direction and
  recommend other locations/people or reviewing collected clues. Do not invent
  corrective compass directions or imply an absence proves the parent never
  passed through.
- Journal entries distinguish collected clues, small signs and unconfirmed
  opinions. Record the player's discovery cell/time, and explain that a
  direction starts there, not at their current position.
- Twenty deterministic FR/EN narrative direction discoveries replace the
  abstract compass sentence: overheard talk, newspaper, postcard, guestbook,
  witness, note and other small discoveries. Preserve broad directions and
  avoid revealing future town names or exact distances.

## R-099 - Find real nearby accommodation before walking there

- **User request:** Hotels/hostels are offered too rarely. Show real nearby
  accommodation with distance and direction, while requiring the player to
  reach its cell before sleeping there.
- Opening sleep searches within 5 km, including beyond the cells downloaded
  by that browser. The town menu also offers an accommodation entry.
- Look up OSM nodes, ways and relations worldwide. Include hotels, hostels,
  guest houses, motels and alpine huts; exclude private, closed and abandoned
  places. Keep real names, source links and licensing. Do not invent hotels.
- Supplement the lookup with lodging in the server's base/cached maps. If
  a provider is unavailable, explicitly label results incomplete, not proof
  that no accommodation exists. Retry, cancellation and a total timeout
  prevent an indefinitely loading menu.
- Optional administrator-imported DATAtourisme data supplements sparse
  mainland-France OSM coverage. No player-triggered downloads/imports or
  catalogue/cache deletion. This French source is not worldwide coverage.
- List at most 40 nearest results. A listed place only becomes a sleep action
  in its actual cell; existing prices, time costs and recovery still apply.
  Searching itself does not spend in-game time or money.

## R-097 - Search anywhere, progressive clues and fallible recognition

- **User request:** Allow searches away from scheduled town encounters. Useful
  clues are less likely farther from the parent's hidden path. Each new lead
  starts vague: an uncaptioned real photo, a town-name fragment or a broad
  direction. Clues become more precise near the place being sought.
- Search costs must be randomly drawn, higher far from the destination and
  lower nearby. Failed attempts still cost time, fatigue and energy.
- **Implemented balance:** loaded land cells outside arrival range allow
  field searches. The current persisted reference leg supplies proximity,
  never a fabricated straight-line route. On-path success is 85%, decaying
  exponentially over 3 km toward 2%. No route geometry is returned.
- Beyond 15 km, use broad directions, at most two starting letters, or
  uncaptioned photos. Within 15 km, name fragments may grow to five letters
  (never the entire name). Within 3 km a successful search identifies the
  current town. These distances are not shown in the journal.
- Search ranges interpolate from 8–14 minutes/+1–2 fatigue at the destination
  to 30–60 minutes/+4–7 fatigue at 45 km and beyond. Calories and existing
  survival/fainting rules also apply. A failed provider request costs nothing
  and displays an error; unavailable photos explicitly become name fragments.
- Visiting the town still advances the main quest. The clue obtained there
  starts a new vague lead rather than naming the next town. Existing saves
  retain their already-known current destination and obtained clues.
- **User refinement:** People may recognize collected letter fragments or
  photos, but may be mistaken. Asking costs 10 minutes/+2 fatigue and uses
  existing terrain-dependent encounter chances. Candidate towns come from
  the offline GeoNames catalogue, not invented names or unrelated trail stops.
- Letter recognition normally suggests the nearest matching real town
  (80% when alternatives exist); another match can be suggested. Photo
  recognition has 65% accuracy when the intended town and alternatives are
  available. Other plausible nearby towns can be mistaken for it. Neither
  successful recognition nor an incorrect answer advances the quest.
- Suggestions are always explicitly unconfirmed, separate from confirmed
  clues, and persist in saves and the journal. Never expose which guess was
  correct, route geometry, exact distances or future town names.

## R-096 - Finish and release lightweight Layer 9

- **User decision:** Finish the lightweight milestone autonomously. Advanced
  terrain/survival feasibility remains deferred under R-083; do not represent
  a narrative-solvability check as proof of a survivable walking itinerary.
- New server journeys include deterministic motives, travel modes, chronology,
  one-to-three optional false leads, lore and stationary or finite mobile pursuit.
  No mandatory clue requires money, an external photo, skill or unique object.
- Validate Python genesis against browser rules, save/resume every main clue
  transition and optional branch, and finish both early and slow mobile pursuit.
  Existing server records and local saves must remain unchanged and usable.
- Prepare the current reference leg automatically from setup/resume and when a
  new lead is obtained. Limit work to the current leg rather than downloading
  all ten/thirteen legs per player. Preparation runs in the background:
  provider errors must not block play or destroy a saved journey.
- Bound client waiting to five minutes; retry a cached server route failure
  once, then display the error with an explicit retry outside the parent journal.
  Cancel stale requests on stage change, reset, stop and journey ending.
- Show only discovered visits. An ongoing visit must not display a planned
  departure or future nights/purchases as completed history.

## R-095 - Parent trail recalls clues instead of providing navigation

- Parent trail is a reminder of obtained clues and the known destination, not
  a navigator. Remove cell offsets, compass arrows, player-to-town distance,
  inter-stage distance, walking estimates and current-target map links.
- Repeat the obtained clue text in history for every clue type. Do not expose
  internal witness fact sheets or a future town hidden by a pending venue clue.
- Retain inquiry/search actions when applicable, source/license attribution,
  saved progress and the separate I action for paid vague directions.
- Remove manual path-preparation controls from this window. Automatic path
  preparation remains a separate pending change, not part of this UI release.

## R-094 - Music mistakes and starting-card charisma

- Playing on a rest, outside the note's +/-150 ms window, before the phrase,
  or on an already scored note counts as one mistake. Holding Space does not
  generate extra mistakes. Missing a note still reduces the normal hit score.
- **User decision:** The starting card alone determines a failure threshold
  from 3 to 8 mistakes. More charismatic cards allow more mistakes; the daily
  card does not affect this limit. Show charisma, limit and the live count.
- Reaching the limit immediately ends the performance, stops audio and awards
  nothing, even after successful notes. Time, energy and fatigue already spent
  remain spent. Fewer mistakes preserve the existing hit-proportional reward.
- Keep the drawn rhythm and tolerance fixed throughout the performance.
  Old saves need no migration: derive charisma from their existing birthCard.

## R-093 - Daily meal price and hunger-recovery variation

- **User decision:** Moderate variation, 70-150% of the local price, stable
  per location, meal and UTC game day. More expensive meals in the same menu
  restore more hunger. Reopening, purchasing or reloading does not reroll.
- Deterministically draw each offer using journey identity, cell, day and meal
  ID; include specialty meals, generic meals and mapped restaurant offers.
  Preserve existing national pricing and unknown-country fallback as the base.
- Calculate reserve recovery proportionally to quoted cents relative to one
  local meal unit (900 kcal at the base unit price). Keep normal capacity cap,
  meal duration and metabolism. Prices/portions are fictional, not nutrition
  facts or actual restaurant tariffs.
- UI quote and purchase must use the same helper for exact price and effect.
  Show daily-offer explanation and calories before purchase, including FR/EN.
  No changes to lodging, music rewards, clue costs or saved wallet balances.

## R-092 - Random rhythm for each street performance

- Draw a fresh 12-slot phrase at the start of each performance by uniformly
  shuffling eight notes and four rests. Repeat the drawn phrase three times,
  retaining 24 scored notes, the existing tempo, tolerance, costs and rewards.
- Use that same immutable phrase for visual tiles, tap scoring, end time and
  generated native melody/bass. Regenerate backing audio for each performance;
  never reuse an earlier performance's fixed soundtrack.
- Random draws are independent: a previous phrase may occur again by chance.
  Preserve hit/miss sounds, mute, volume and cancellation behavior.

## R-091 - Reliable street-music playback

- **User report:** Background music plays, but the street-music minigame is silent.
- Use native HTML audio playback, like the working background tracks, rather
  than a separate Web Audio context. Generate original PCM WAV melody/bass and
  distinct hit/miss cues locally; no external music or added dependency.
- Keep the three-loop rhythm, scoring, shared mute/volume and visible errors.
  Start from a player gesture, synchronize to the visual performance clock
  after loading, and cancel/release audio on finish, close, reset or hidden tab.

## R-090 - Nighttime sleep pressure and forced sleep

- **User decision:** Use the displayed game clock (UTC), but do not force
  sleep simply because 02:00 passes. Collapse is linked to a full sleep bar.
- While awake, equivalent waking hours accrue at 2x from 22:00 to 02:00,
  4x from 02:00 to 06:00, and 1x otherwise. Split actions at time boundaries.
  Applies indoors too; sleeping retains its normal recovery, not these rates.
- At 100% sleep pressure, apply the existing fainting penalty: eight hours
  unconscious in the same cell, fatigue reset to 40 before weather exposure,
  normal unconscious metabolism/recovery and possible money theft.
- Interrupt the action's clue/reward/music outcome, autosave normally and
  explain sleep collapse separately from exertion collapse. Preserve hunger
  precedence, legacy ended journeys and saves without a collapse reason.

## R-089 - One random clue search with real photo discoveries

- **User decision:** Replace choosing a photo/notebook/letter ahead of time
  with one Search for a clue action. Reveal what was found afterwards.
- Randomly select among that stage's existing available clue types. Preserve
  each selected type's existing minutes, fatigue, extra calories and any price.
  Show possible costs before searching; charge only the obtained result.
  Exclude unaffordable purchases so a clue never requires money the player lacks.
- A photo result requires a real geographical image from the existing cache
  or web providers, checked for successful image decoding before commitment.
  Show the image, credit, source and license; fictional annotations remain
  explicitly separate from the real photograph.
- **User decision:** If no usable photo can be retrieved, select a non-photo
  result and explicitly explain the substitution. Charge only its normal cost.
- Disable duplicate searches during preparation. Cancelling before a result
  is committed costs nothing and grants no clue; reset invalidates late results.
- Preserve pending venue-directions and optional lead actions. Old discoveries
  remain valid and are not rewritten; unavailable old photos retain explicit
  error text without blocking their already obtained clue.

## R-088 - Rain and storms affect outdoor effort

- **User decision:** Rain adds two fatigue/hour outdoors; storms add four.
  Walking speed is reduced by 15% in rain and 25% in storms, subject to
  existing movement speed limits. Longer walking consumes normal extra time
  and metabolism. These effects stack with temperature and night exposure.
- Sheltered actions are exempt. No new wet-clothes or live-weather simulation.
  Use the existing estimated monthly historical weather condition, not actual
  observations at the player's real location.

## R-087 - Temperature affects outdoor survival

- **User decision:** Below 10 C, add 25% calorie consumption per ten degrees
  below the threshold, continuously, capped at +100%. Above 30 C, add two
  fatigue/hour per five degrees above threshold, capped at +10/hour.
  No temperature surcharge at exactly 10 C or 30 C.
- Apply to walking and other outdoor actions using the existing altitude-
  adjusted, time-of-day temperature estimate. Sample exposure over long actions,
  including month changes, rather than applying the departure temperature
  unchanged to a full night's sleep.
- **Outdoor sleep decision:** No fatigue recovery, but retain the usual
  reduced sleep-pressure recovery. This matches the existing outdoor-sleep
  rule; temperature/rain penalties still apply during the night.
- Sheltered meals/sleep/detention are exempt. Requests for hospitality remain
  outdoors until accepted. Cold/heat also apply during outdoor unconsciousness.
- Display active effects. If weather is unavailable, clearly state that
  weather effects are not applied yet; never invent a temperature.
- These are fictional balance rules, not medical or real-world safety advice.

## R-086 - High fatigue when crossing water

- **User decision:** Add forty fatigue per 250 m step into a water cell, in
  addition to ordinary terrain/slope/endurance movement fatigue.
- This fixed surcharge is not reduced by endurance. Leaving water for land
  does not charge a second water-cell entry. Multiple water entries each cost.
- Mapped bridges rendered as road cells retain road costs. No automatic
  bridge detection or safety claim is inferred for cells still mapped as water.
- Fatigue caps at 100 and uses normal fainting finalization; hunger and
  sleep remain fatal where appropriate. Existing saves are not rewritten.

## R-085 - Terrain-based directions encounters and paid rerolls

- **User decision:** Directions usually work in towns (90%), less often
  elsewhere. Every attempt rerolls, costing ten game minutes and +2 fatigue,
  plus normal metabolism and nighttime exposure. No money charge.
- Rates: settlements 90%; rail/cable stations 75%; roads, major roads,
  buildings and places of worship 50%; plains, grass, fields, parks and
  vineyards 25%; forests and hills 15%; mountains, rails and cable lines 5%;
  water 0%. These are game probabilities, not real population estimates.
- I opens a request dialog showing chance and cost before an explicit attempt.
  Opening/closing is free and never reveals guidance. Each retry pays again,
  whether or not someone can help. A failed search says so clearly.
- A successful attempt gives R-084's vague directions. Fainting or fatal needs
  interrupt the attempt without granting directions. No changes to trail clues.
- Reopening clears the displayed answer, not the already paid time/fatigue.
  Autosave preserves costs through reload; no new save schema is needed.

## R-084 - Ask people for vague directions using I

- Keep shortcut I, replacing automatic exact travel guidance with an answer
  from a fictional passerby about the currently known destination.
- Use a general eight-sector compass heading and qualitative distance, never
  exact cell counts or numeric kilometres in this answer.
- Superseded by R-085 for costs/chances: opening is free; actual attempts cost
  time/fatigue and can fail. No real person or mapped NPC is required.
- Preserve useful arrival/investigation guidance and pending venue-only clues
  without disclosing the unknown next town. No future stops are revealed.
- These indications are approximate, not verified walkable routes. The
  separate trail journal's existing numeric navigation is unchanged.

## R-083 - Prioritize lightweight parent-story improvements

- **User decision (17 October 2026):** Do the easy narrative improvements now;
  advanced simulation is premature and should be kept for later.
- Vary fictional witness dialogue deterministically without rerolling facts.
- Make memories sound less precise as sightings age: recent (under seven
  days), fading (seven to twenty-nine days), distant (thirty days or more).
  Essential destination/venue clues always remain exact and usable.
- Do not invent sighting dates for legacy journeys without a parent story.
  Written/photo clues keep their existing wording and information gates.
- Explain the parent's motive and distinguish discovered historical stays
  from their current location. Show only discovered visits.
- **Deferred, not removed:** whole-journey terrain/30-60 km validation,
  survival-budget simulation, route-positioned nights/provisions and
  motive-guided destination generation. These are later enhancements, not
  prerequisites for finishing the current lightweight narrative milestone.
- Existing basic correctness, save compatibility and clue-access tests remain
  required. The full story engine still needs release verification before
  deploying it; narrative consistency is not proof of terrain feasibility.

## R-082 - Fictional shelter requests at places of worship

- Churches and other mapped places of worship, across religions, can provide
  fictional shelter in the game. No named settlement is required.
- **User decision:** Ask for free shelter, with a chance of refusal and one
  request per mapped place per game day (UTC), not automatic accommodation.
- Use the existing hospitality rules: 30 minutes to ask, tarot-adjusted chance,
  then an immediate free eight-hour sheltered night if accepted; no meal.
- Only active current-cell `amenity=place_of_worship` POIs with stable OSM IDs
  are eligible. Exclude mapped private, inaccessible, disused or abandoned
  places. Do not infer access or accommodation from a religious building alone.
- Show acceptance/refusal immediately beside the action. Persist its place,
  time and outcome across save/resume, independently of town hospitality.
- State explicitly that this is fictional gameplay, not a real accommodation
  offer or a statement about a religious community's actual hospitality.
- Include these requests in Layer 15's future chronological journal.

## R-081 - More frequent European specialty meals

- Expand documented dishes across Europe, not just French sources or areas.
- Current catalogue: 19 dishes, including 15 additions covering 15 European
  countries. Each has a documentary URL and original short FR/EN description.
- Distinguish regional specialties from national traditional dishes in the
  menu. New entries require an unambiguous mapped/resolved country plus their
  geographic bounds; never offer a neighbouring country's dish as local.
- Regional rectangles are approximate associations, not administrative
  boundaries. National dishes are not claims about a particular town's menu.
- Refresh additions when resuming old saves while preserving their existing
  meals, rules, tarot and progress. Basic meals and mapped restaurants remain.
- This is a curated catalogue, not live web discovery or verified restaurant
  availability. Portions, energy and prices remain fictional game rules.

## R-080 - Layer 15 personal journey journal

- **Priority:** Keep for Layer 15, after the lightweight Layer 9 milestone,
  without waiting for deferred advanced simulation. Requirements only;
  journal implementation has not started.
- **Pinned photos:** The player can pin a discovered photo in the journal and
  attach a personal note. Preserve its image, source, attribution/license,
  associated location and game timestamp across save/resume and journal export.
- **Journey history:** Maintain a chronological record using game dates/times
  and locations, including:
  - Where the player slept, including outdoor sleep and accommodation or
    fictional hospitality when applicable.
  - Hospitality requests and outcomes, explicitly including refusals by
    townspeople.
  - Meals: when and where the player ate, and what they ate.
  - Other meaningful journey events as the journal scope is finalized.
- **Historical accuracy:** Capture event details when actions happen, rather
  than reconstructing them from current counters or only the latest result.
  Do not invent missing events for older saves.
- **Map vignette (proposed):** A small patch of the ASCII grid could accompany
  entries to show their local setting. Keep as a candidate feature; patch
  dimensions and exact presentation remain to be decided during Layer 15.
- **Integration:** Include these requirements in Layer 15's photo/travel-journal
  and PDF-export design. Personal notes do not introduce player-to-player
  free-text sharing.

## R-078 - Music with rests and repeated phrases

- The rhythm must have empty squares (rests), not equally spaced notes only,
  and repeat at least three times.
- Implemented and deployed: twelve-slot phrase, eight notes and four rests,
  repeated three times. Twenty-four scoring notes, unchanged maximum reward.
  Visual and audio clocks agree; blank rests never award points.

## R-079 - Mobile parents may go beyond the original ten towns

- Finish the lightweight Layer 9 milestone before Layer 15; advanced route
  and survival simulation is deferred by R-083.
- The user explicitly allows extra towns when the parent keeps moving.
- Current implementation under validation: up to three pre-generated, sourced
  continuation towns, still 30-60 km apart. The parent advances after seven,
  fourteen and twenty-one game days, then waits at the final town. The child
  can catch the parent at town ten, eleven or twelve before that point.
- Existing immutable beginnings and local saves are not rewritten. New story
  facts apply only to new journeys after the story milestone is deployed.
- Narrative solvability is not proof of terrain or survival-budget feasibility.

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
  Missing mapped country or index uses a visibly labelled European-average
  estimate with stable per-cell variation (R-058), not an invented country
  or local observation.
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
- **Status:** Default-enabled background loops with mute and volume controls, accepting
  canonical/numbered prompt filenames in WAV, MP3 or OGG.
- **Context:** Title, actual player terrain/OSM features/solar night, town/shelter/
  journal menus, reunion and exhaustion. Inspection does not move the player.
- **Fallback:** Requested track, daytime road, title, then explicit silence.
  Missing/undecodable files and autoplay blocks are visible/logged. Re-enabling
  retries newly added files. No gameplay dependence on audio availability.
- **Timing:** Pause while hidden and during the rhythm-game dialog. Do not
  use unaligned generated practice music as the rhythm clock. SFX and future
  event/dungeon tracks remain separate unimplemented audio surfaces.
- **Europe-wide scope:** No soundtrack selection based on starting-region
  names. City/coast are reusable moods selected only from explicit map tags;
  previous Paris/Tahiti filenames remain compatible aliases.

## R-036 — Original English vocal title song

- **User request/choice:** Add a song with English lyrics, title screen only.
- **Delivery:** Original lyrics and vocal-generation prompt, optional
  `music-title-song` asset (number 16; 14/15 remain future tracks).
- **Playback:** Same music/volume/mute controls; static title screen only.
  Missing song falls back to instrumental title then silence. Starting or
  resuming travel stops the vocal; travel fallbacks never select vocals.
- Audio must be generated/downloaded separately; no claim that a prompt is
  a playable recording.

## R-037 — Locally synthesized sound effects

- **User request:** Generate SFX directly because Suno adds unwanted music.
- **Status:** 27 original deterministic synthesized mono WAV cues following
  the sound briefs, including two explicitly future-only assets. No music
  backing, external service, samples or new Python dependencies.
- **Delivery:** Reproducible generator, overwrite protection, tests for cue
  coverage/format/duration/headroom/envelopes, and a manual listening gallery.
  Gameplay triggers remain a separate integration step.

## R-038 — Gentle story-led title screen

- **User request:** Replace the abrupt map-first opening with a title screen,
  storyline and attractive ASCII art.
- **Status:** Initial screen with original ASCII landscape, game title and
  localized introduction to the parent search, clues, tarot and daily needs.
- **Flow:** Explicit Open the map button reveals existing region/profile/
  resume controls without starting or overwriting a journey. Language and
  music controls remain accessible; reload shows the title again.
- **Play layout:** Title, branding and story stay on the title screen only.
  After entry, keep just a compact language/audio toolbar above the map.
- **Accessibility:** Decorative art is hidden from assistive technology,
  story is ordinary text, map controls are hidden until entry, and keyboard
  focus moves to region selection on entry. Layout fits narrow screens.

## R-039 — Visible starting tarot and interpretation

- **User request/decision:** Character creation must visibly draw tarot and
  offer meaning hints; one final draw per new journey, no redraw button.
- **Status:** After profile selection and successful initial map load, show
  a card-reveal step before the journal. Reveal the existing birth card,
  localized symbolic interpretation and exact starting purse/reference meals.
- **Persistence:** Autosave the already-generated journey before the reveal.
  Resume never rerolls; storage failures remain visible inside the dialog.
- **Scope:** All 22 cards have original FR/EN hints, not predictions. Budget
  effects are explicit; profiles still set attributes independently.

## R-040 — Music enabled by default

- **User request:** Music should be activated by default.
- Attempt playback at the existing 25% default. Browser autoplay policy is
  respected; if blocked, retry on the first click/key or Retry music.
  Mute, volume and hidden-tab pauses remain available.

## R-041 — Tarot-derived character and future event tendency

- **User decision:** Replace manual profiles with starting-card attributes;
  starting and daily tarot jointly affect future event occurrence.
- New journeys use card-specific Strength/Endurance/Pace (1-5, nine total
  points). Daily changes do not reroll attributes. Old saves retain profiles.
- Store attributes in the pinned economy snapshot; validate character against
  the saved birth card. Each revealed card has its own original ASCII symbol,
  with a distinct concealed back before reveal.
- Future night-event helper multiplies base probability by
  `0.5 + (birth.nightRisk + daily.nightRisk) / 2`, capped at 1.
  Values are provisional balance choices, not predictions. No events or
  minigames are triggered before their later layer.

## R-042 — Button tooltips and keyboard shortcuts

- **User request:** Tooltips and keyboard shortcuts for every button.
- Localized hover/focus tooltips show the action and Alt+Shift chord
  (Option+Shift on Mac); native title and aria-keyshortcuts also expose it.
- Static buttons have mnemonic bindings; dynamic meal/shelter/venue buttons
  receive distinct number/letter bindings within their dialog.
- Only visible, enabled buttons in the current modal/screen can activate.
  Ignore repeats, Ctrl/Meta chords and input/select/editable targets.
  Existing movement, Look/rest/photo and rhythm keys remain unchanged.

## R-043 — Ten-stage parent trail

- **User choice:** Increase new parent trails from three stages to ten.
- Generate ten distinct named OSM destination cells on all included maps;
  preserve ordered clues and reunion only at the final stage.
- Journal counts and final-action labels use the actual stored route length.
  Existing three-stage saves retain their route/progress and remain playable.

## R-044 — Daily tarot popup

- **User request:** Reveal daily tarot in a popup like the initial card,
  rather than silently changing it in the background.
- At a UTC game-day transition, show a concealed card followed by its
  matching artwork, localized meaning and combined event tendency.
- Wait for existing dialogs/actions to finish. Save the draw before display
  and persist acknowledgment, so reload cannot reroll or lose an unread card.
  Legacy saves start with their current daily card treated as already seen.
- No extra time, money or attribute changes for revealing; terminal journeys
  keep their outcome without an intervening daily popup.

## R-045 — Foraging, donations and fictional food theft

- **User request:** Find food in woods, ask passers-by for money, and steal
  food in stores with an arrest risk. Implement now.
- **User jail choice:** Temporary detention with time loss, basic food/rest,
  then return to the same cell; no fine or automatic game over.
- **First-version rules:** Forage forest cells (30 min, 5 fatigue, 450 kcal);
  ask in settlement cells (30 min, 2 fatigue, half a local meal in money);
  steal at mapped food shops in the current cell (10 min, 3 fatigue, 900 kcal).
  Base failure/arrest chances are 35%, 40%, 35%, modified by both tarot cards.
  Six-hour sheltered detention supplies basic food and sleep.
- Costs/metabolism/night exposure apply to attempts whether successful or not.
  Exhaustion takes priority over rewards. No money needed to attempt.
  Save outcomes/counters immediately; showing results never rolls again.
- Show conditions, actual risks, results, save status and keyboard/tooltips.
  Exclude inaccessible/disused/abandoned/non-food stores. No nearby-store
  guessing, plant advice, theft instructions, inventory or real legal claims.

## R-046 — Named and current-location starting points

- **User request:** Type a place name as starting point or use the player's
  real current location.
- **Confirmed scope:** Europe only for new searches/locations; online lookup
  permitted. Existing demonstration regions/saves remain unchanged.
- Explicit search, disambiguated results, and one-shot browser geolocation
  after permission. Show permission/timeouts/provider failures; no tracking.
- Prepare real map data centred on the requested coordinate, then let the
  player start/resume explicitly. Keep independent, persistent origin saves.
  No synthetic place data or silent nearby fallback when a map/story cannot load.
- First version uses Nominatim with attribution, caching and a global request
  interval; European country/coordinate filter and preparation limits are
  documented in README. Coordinate disclosure to mapping services is visible.

## R-047 — Separate setup and options; uncluttered typography

- **User requests:** The start feels cramped: insert an intermediate screen,
  move language/music into an Options screen, and reduce competing font sizes.
- Flow is title -> journey preparation -> gameplay. Preparation groups
  existing/new origins, tarot explanation, Start and Resume; no map/needs
  controls competing for space here. Returning preserves saved progress.
- Options is available from all three screens, with language, music toggle
  and volume; closing restores the same screen and journey.
- Setup uses one font, a 24 px heading and 16 px content/controls, generous
  gaps, short selected place labels, and responsive columns without horizontal
  overflow. Narrow screens scroll vertically; desktop preview must not remain
  accidentally constrained to a mobile-test viewport.

## R-048 — Name the character

- **User request:** The character should have a name.
- Require a 1–40 character name in preparation for new journeys, before the
  single tarot draw. Trim/collapse whitespace, normalize Unicode, reject
  control characters and display as text, never markup.
- Show the name on the initial tarot screen and in the player panel; save
  and resume it exactly. Names remain local to the browser's journey save.
- Legacy nameless saves remain valid and resumable without a forced name
  or a new tarot draw. The new-journey name field does not rename an old save.

## R-049 — Evaluate production map-data capacity

- **User suggestion:** Consider a paid API key for higher limits, and
  browser-side requests so each player's traffic originates from their own IP.
- **Status:** Architecture options to evaluate, not an approved migration or
  provider purchase. No paid service or client-side download change implemented.
- Distinguish raw OSM geometry/tags from map tiles, geocoding and browser
  geolocation: buying one service does not necessarily address the others.
  The main OSM editing API's node cap is not an API-key subscription tier.
- Evaluate a commercial raw-data provider or a dedicated/self-hosted Overpass
  service with European coverage, appropriate licensing, budget, cache rights,
  operational limits and reliable availability.
- Direct client access requires provider permission/CORS, privacy disclosure
  and suitable browser-safe credentials. It does not remove per-request size
  limits or aggregate application usage obligations; do not distribute traffic
  across player IPs to evade a public service's restrictions.
- Prefer shared cached geographic chunks for repeated areas. Keep secret
  credentials server-side. Public OSM/Overpass services are not a production SLA.
- Reference: [OSMF API usage policy](https://operations.osmfoundation.org/policies/api/).

## R-050 — Long town-to-town parent journeys

- **Confirmed choice:** Ten stages, each 30–60 km from the preceding town
  (including departure to first town), for a weeks-long journey.
- Apply only to new journeys. Preserve all existing saved routes/progress.
- Use real named OSM cities/towns, not nearby shops or successive local
  landmarks. Stream the global grid while walking, including negative cells.
- Distances are great-circle, not routed walking distances: explicitly
  disclose that road connectivity and water crossings are not checked.
- Server generation uses sourced, cached town catalogues and provider
  fallback. Display preparation/failure; never invent a short substitute
  or overwrite the previous save when generation fails.

## R-051 — Per-cell actions and varied discoveries

- **User requests:** Pirates!-style choices per cell, not per town; every
  planned stop has several ways to investigate, with time/energy costs.
  Planned stops reveal the next destination. Other cells provide contextual
  ways to obtain food, earn money or rest, not parent directions.
- Offer four rotating clue forms at each new-route stop: discussion,
  annotated photo, letter, search, purchased note, guestbook or travel ticket.
  Keep their presentations distinct and show time, fatigue, energy and any
  price before choosing. Existing hunger/exhaustion/night rules still apply.
- A photo uses licensed online geographical imagery with attribution and a
  clearly separate fictional hint. Image failure is explicit but does not
  erase the written clue or make progression depend on an image provider.
- Some clues initially name only a real public POI in another town.
  Asking directions is a separate paid-in-time/energy action before the
  town, distance and map location are revealed. Persist the unresolved lead.
- Parent clues require the exact planned cell. Everywhere else, reuse
  existing terrain/POI-gated buying, foraging, begging, food theft, street
  music, resting and sleeping; do not silently turn every cell into a shop.
- Artifacts and encounters are fictional, not statements about real people,
  venues or objects. The earlier ten additional brainstorm ideas are not all
  implemented; do not describe them as completed gameplay.

## R-052 — Visible, simple and stable action shortcuts

- **User request:** Put each action shortcut in parentheses in the button
  caption; keep shortcuts as a single key combination wherever possible.
- Prefer single keys without modifiers. Preserve the same key for the same
  service across toolbar/cell/town menus and for each investigation form.
- Keep captions, translated special-key names, tooltips and accessibility
  metadata consistent. Do not duplicate suffixes after state/language updates.
- Scope shortcuts to the active dialog/screen. Ignore hidden/disabled actions,
  repeated keydown, typing/select controls, IME input and Ctrl/Cmd shortcuts.
  Keep the previous Alt+Shift combinations as compatibility aliases.

## R-053 — Free guidance when lost

- **Updated by R-084:** I now asks a fictional passerby for vague directions,
  not exact cell counts or numeric distances.
- **User request and confirmed choice:** Add a hint button explaining the
  next action and direction/distance to the current known objective, for free.
- Show the shortcut in its caption. No time, energy or money cost, state
  mutation, random draw or undiscovered destination/clue disclosure.
- Guide travel toward the current stop, investigation on arrival, or asking
  directions for an unresolved venue-only lead. Support legacy saved trails.

## R-054 — Resilient preparation with truthful activity updates

- **User request:** Automatic retries and backup servers; explain what the
  algorithm is doing so preparation feels less opaque.
- For town/venue catalogues, try the existing Germany/Kumi providers and
  retry up to three rounds, respecting cooldowns outside the shared source
  lock. Retain successful catalogue caches; surface final failure.
- Expose real job progress: queued, stage number out of ten, finding towns,
  public-venue lookup, cache reuse, primary/backup provider and retry countdown.
  Do not fabricate a completion percentage or disclose future town names.
- Keep the spinner active while waiting and retain client cancellation.
  Cancellation stops client waiting; already-running server work may finish
  into its shared cache rather than being forcibly terminated.

## R-055 — Offline town catalogue and random-coordinate journeys

- **Confirmed user choice:** Generate new European journeys from a local
  settlement catalogue. Sample random candidate coordinates, snap to a real
  admissible town locally and retain exact 30–60 km leg checks.
- No live Overpass dependency for route generation. Optional online public
  POI enrichment is deferred, not required or silently fabricated.
- Bundle an attributed GeoNames European subset with source/date/license
  and a reproducible refresh script. Use populated settlements with recorded
  population >=2,000; disclose that this differs from OSM city/town tags.
- Preserve existing local and OSM long-route saves, identities and clues.
  Store genuine GeoNames IDs separately; never fabricate OSM identifiers.
- Show actual external request/cache counts for the retained online path;
  new local routes show ten local town searches and zero Overpass calls.
- Distinguish route generation from live map/elevation/weather/photo services.
  No connectivity guarantee or invented result for sparse areas. Existing
  Tahiti saves remain playable, but new offline town trails support Europe.

## R-056 — Public scenic webcam snapshots alongside place photos

- **User request:** Query publicly available online cameras and display a
  camera screenshot alongside the cell's photos.
- **Status:** Recorded for future implementation; no camera integration yet.
- Prefer intentionally published scenic/tourism webcams with a documented
  snapshot API or explicitly permitted image reuse. Public accessibility alone
  does not grant permission to capture, redistribute or cache an image.
  Do not discover exposed/private cameras, scan devices, bypass authentication
  or paywalls, or access surveillance feeds not intended for public tourism.
- Present an optional nearby-camera card within place photos, clearly
  distinguished from ordinary photographs and historical game conditions.
  Display camera location/distance, source link, attribution/license,
  capture timestamp when supplied, and freshness/unknown-time status.
- Avoid person-focused or sensitive-location feeds. No identification,
  face recognition, tracking, audio collection or recording of people.
  Never describe a current webcam image as matching the game's simulated
  time, historical weather, or the exact player cell unless actually verified.
- Respect provider terms, quotas, privacy and permitted cache lifetime.
  Keep any secret API keys server-side. A provider/source link is the fallback
  when embedding or snapshot reuse is not permitted.
- Camera lookup is optional and on demand, not a journey-start requirement.
  Missing, stale, disabled or unavailable feeds must be labelled explicitly
  without blocking existing photos, clues or travel. Do not synthesize a
  supposedly live snapshot. Begin with one documented provider before expansion.

## R-057 — Visible money/food and hunger notifications

- **User confirmation:** Money and food must be displayed; a warning popup
  appears at 75% hunger; 100% hunger remains game over.
- Make the existing wallet and food-energy reserve prominent in the character
  panel, with current/max kcal. Do not imply a portable provisions inventory.
- Trigger at exactly 75% or higher, including resumed hungry saves; avoid
  repeat popups until hunger drops below 75% and rises again. Wait for other
  modal actions to finish; keep the persistent hunger warning visible.
- Explain ways to obtain food/money and that resting still consumes reserves.
  Do not promise success, free food or universal shop access.
- Explain terminal hunger/fatigue/sleep outcomes in a popup instead of leaving
  disabled navigation unexplained. Existing terminal rules are unchanged;
  recoverable fatigue and portable provisions are not approved by this change.

## R-058 — National pricing and stable European fallback

- **User confirmation:** Include known Italian prices and update pricing in
  both existing and new journeys, preserving balances and progress.
- Use same-date national Big Mac source observations where available,
  including Italy and France rather than treating France as the euro area.
  Cover all supported European country codes, including Moldova; import
  every available national row and report missing current observations.
- If no national price is available, use the unweighted arithmetic mean of
  available European national observations in comparable USD, converted to
  game euros, with a random-looking **-10% to +10% variation stable per cell**.
  Reloading, reopening menus or changing language must not reroll the delta.
  The variation applies only to estimates, not published national prices.
- Quotes, charges and index-scaled rewards share the same calculation.
  Distinguish the estimate from an observed local price; show source/date.
- Missing map country may be checked explicitly through the existing
  cached/rate-limited Nominatim service when opening meal/shelter menus.
  Never guess country from a selected region or food box. An unavailable
  lookup must visibly fall back to the estimate, not block gameplay.
- Resume refreshes pricing only; saved rules, meals, tarot, wallet and route
  remain unchanged. Loading errors leave the original save intact.
- National pricing does not imply new meal availability in uncurated areas.

## R-059 — Explain real-map preparation activity

- During preparation of a searched starting point, display actual backend
  activity alongside the spinner, not just a generic multi-minute wait.
- Show location lookup, queue/provider access, current download server,
  backup/cooldown, dense-area subdivision, cached reuse, geometry processing,
  24 x 24 cell rasterization and saving when those stages occur.
- Report elapsed wait and actual map HTTP requests, including failed requests,
  backup providers and subdivision requests. The total varies; do not invent
  percentages or count polling/location lookup as map download requests.
- Progress polling must not block worker progress; reset stale activity and
  stop timers on completion, error or cancellation. Keep errors explicit.

## R-060 — Random positive and negative journey events

- **User requirement:** Random positive or negative events can happen during
  the journey, not only during unsheltered nights.
- **Target layer:** Layer 13 — Events, building on the survival/economy
  foundations and the starting/daily tarot tendencies (R-031, R-041).
- Possible positive events include unexpected help, a useful encounter or
  finding supplies; possible negative events include a delay, losing supplies
  or additional fatigue. These are examples, not a fixed event catalogue.
- Clearly explain each event and its effects to the player. Any choices and
  resulting changes to time, needs, money or resources must remain consistent
  with the game's rules.
- Resolve events through gameplay actions or simulated journey time, not
  real-world idle time, menu browsing or page reloads. Save resolved outcomes
  so resuming neither applies effects twice nor rerolls an existing event.
- Event frequency, effect ranges and exact tarot influence remain balance
  decisions for Layer 13; this requirement does not change current terminal
  survival rules.
- **Status:** Recorded for later implementation; no random journey-event
  system is introduced by this documentation update.

## R-061 — French hosting and controlled infrastructure automation

- **User decision:** Use the existing OVHcloud account; prefer a French
  datacentre. Aim near EUR 50/month and never exceed EUR 100/month.
  Confirm VAT, recurring extras, renewal charges and any AI usage before
  ordering; billing alerts alone do not enforce a hard budget ceiling.
- **Initial authorization:** Prepare Terraform, inspect existing services
  read-only after local authentication is configured, and guide subscription
  to missing services. No purchases, infrastructure changes, deletions or
  replacements are authorized by this initial inventory step.
- **Subsequent authorization:** The user explicitly approved creating the
  necessary services within the agreed budget, then continuing subsequent
  gameplay layers after server verification, with frequent tested checkpoints.
  Provide a final report of actual infrastructure and estimated costs.
  Do not treat this as permission for unbounded usage or unrelated changes.
- Keep credentials outside Git and conversation history, use limited-scope
  access, and protect Terraform state and plans as potentially sensitive.
- Start with CPU hosting for the game; GPU subscription and autonomous
  development execution require a separately approved purpose and budget.
- **Preferred domain selected by the user:** arcane-path.eu.
  Availability, trademark checks, .eu registration eligibility and purchase
  price were initially unconfirmed. The user subsequently configured the
  domain; its A record resolves to 57.130.85.251 locally and on Cloudflare
  as of 17 October 2026. Registration billing was not inspected. DNS does
  not imply a public game service or working HTTPS.
- **Scope:** Deployment/operations across layers, not a new gameplay layer.
  OpenStack authentication and Paris inventory succeeded. Terraform is
  validated; the user approved the default OVH group with guest firewall
  instead of a custom group after the quota failure. One Paris CPU VM and
  its public SSH key were created; guest firewall and SSH were verified.
  Actual state and costs are recorded in
  [INFRASTRUCTURE.md](./INFRASTRUCTURE.md).
- **Progress reporting:** Maintain a checked/unchecked progress list in README
  and push frequent tested checkpoints to GitHub. Email updates are requested
  if possible, but no sending service or recipient is configured.
- **Browser preview:** The user approved password-protected HTTPS on
  arcane-path.eu, then required a certificate-generation script on the VM.
  Nginx protects the known game assets/APIs; the Python backend stays on
  loopback. The tracked `scripts/configure_https.sh` issues a free Let's
  Encrypt certificate with explicit agreement/contact, configures the preview
  and enables Certbot's renewal timer plus a checked Nginx reload hook.
  Preview credentials remain outside Git; this shared test account is not
  multiplayer identity or authorization. Renewal dry-run passed on the VM.

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

## R-062 — Roguelite continuity through persistent player caches

- **Requirement:** Develop the game's roguelite identity. A player can hide
  in-game belongings at a geographic place so that other players, or the same
  player on a later run, can discover and retrieve them. These caches connect
  otherwise separate journeys rather than disappearing with the current run.
- **Status:** Recorded for future implementation; no item inventory, shared
  player cache or cross-run item persistence is implemented by this update.
- **Target:** Persistent shared-world gameplay, building on Layer 9's server
  foundations. Relates to the PDF's asynchronous signs/caches, R-025's
  geocache-associated virtual items and R-027's optional discoveries. A virtual
  player cache must not depend on a real third-party geocache listing.
- **Continuity:** Associate caches with stable geographic locations, not a
  camera coordinate or a transient region index. Deposits must survive the
  end of a run and server restarts. Returning players need a persistent player
  identity distinct from a journey ID. Ordinary local-save deletion or a new
  run must not silently erase shared-world deposits.
- **Integrity:** Deposit transfers the item out of the current inventory;
  successful retrieval transfers it to the recipient. Server-side atomic
  updates and idempotent retries must prevent duplication, double claims and
  resurrection by reloading an old save.
- **Decisions before implementation:** Define eligible items, deposit/search
  action costs, discovery cues, sharing/ownership, reservations for one's next
  run, expiry and what happens after another player claims a shared cache.
  Supporting future runs does not yet define an unlimited safe bank, guaranteed
  recovery of shared loot or automatic inheritance of the whole inventory.
- **Scope and safety:** These are fictional in-game deposits, not instructions
  to hide real objects, trespass or physically search dangerous places.
  This requirement does not introduce combat or change current survival/end
  rules. No free-form player-to-player text is implied.

## R-063 — Proximity-sensitive arcane-item hints and future narrative wording

- **Requirement:** The arcane items scattered across Europe must be discoverable
  through hints. As a player gets closer to an item, hints become more available
  and more precise, progressing from broad regional rumours towards town,
  landmark and local hiding-place clues.
- **Status:** Recorded for future implementation; scattered arcane items and
  their proximity-hint system are not implemented by this update.
- **Target layer:** Layer 20 — Lore / legendary objects, integrated with
  exploration, NPCs, news and other discoverable narrative surfaces; related
  to R-062's persistent places and the PDF's unique legendary-item lifecycle.
- **Factual authority:** The game engine owns each item's identity, current
  location, availability, discovery conditions and allowed hint precision.
  Distance/proximity comes from the real geographic position, not screen
  distance. Increasing proximity should provide additional opportunities and
  actionable detail, not merely repeat the same vague sentence.
- **Progression decisions:** Set distance bands, hint frequency, search costs
  and the point at which an exact location can be revealed before implementation.
  Do not silently assume every cell exposes every nearby item's coordinates.
  Hints must remain coherent across reloads, regions and narrative channels.
- **Shared-world consistency:** When an item is taken or rehidden, update its
  authoritative location/version and the hints derived from it. Old rumours
  may remain only if clearly identified as historical or uncertain, not as a
  guaranteed present hiding place. Discovery must not create duplicate copies
  of a globally unique arcane item.
- **Future LLM role:** Later, use the LLM/content factory to express engine-issued
  hint facts in characters' sentences, news, rumours and other suitable places.
  It writes the wording, not item locations or discovery rules, and must not
  contradict facts, exceed the permitted precision or reveal hidden coordinates.
  Follow the PDF's pre-generated content approach; this requirement does not
  authorize live per-action LLM calls or new AI spending.
- **Independent of the LLM:** Structured factual hints and deterministic
  templates must make discovery playable before generated prose is available.
  This does not turn LLM text into a required dependency for finding an item.

## R-064 — Ask locals for hospitality

- **User decision:** Implement a first playable version now: a free sheltered
  night on success, one request per town per game day.
- **Implemented:** Sleep menu on a mapped named settlement cell, 30-minute
  exposed request, chance influenced by birth/daily tarot via the existing
  risk helper (base failure 50%). Success immediately gives normal protected
  sleep without food or charge; refusal costs the request time. Costs and
  fatal needs apply before rewards. Outfit and reputation are deferred.
- **Persistence:** Attempts keyed by stable OSM settlement ID and starting UTC
  day, validated in local saves. Deterministic seed/town/day draws avoid
  reload rerolls; this is not server anti-cheat. Legacy saves remain readable.
- **Clarity:** Disclose immediate sleep, chance and time before acting; show
  the result. Explain that missing current-cell mapped lodging does not prove
  a town has no accommodation. Hospitality is explicitly fictional.

## R-065 — Useful outdoor nighttime rest

- **Approved balance change:** Thirty-minute nighttime rest recovers 10 fatigue
  before normal exposure, generally 9 net. Daytime remains 20. Rest still
  consumes food reserves, increases awake time and cannot revive an ended run.
- **Implemented:** Set nightRestRecoveryFactor to 0.5; one-time restRuleVersion
  migration on resume changes only that coefficient, preserving state and all
  other pinned rules. Show before/after fatigue, using the action's calculation.

## R-066 — Play footsteps on movement

- **Implemented:** Destination terrain chooses an existing original road,
  grass, forest, water or stone WAV. Play once after a successful move, never
  in Look mode or during failed/loading moves. Use existing music mute/volume,
  stop on hidden tab; surface playback failures in Options and console.
- Other sound cues and untracked downloaded music are not implied implemented.

## R-067 — Stationary map preparation

- **Implemented:** Download all eight visible neighbors, including corners,
  without advancing game time. Reuse existing bounded two-request stream.
  Temporary server/network failures retry with 30-second exponential cooldown
  capped at five minutes. Permanent data errors wait for manual retry.
- **Clarification:** User's dotted-cell screenshot refers to unclassified
  loaded land, not missing chunks. Do not impose a full-camera blocking gate
  or fabricate grass/fields. Actual cached Engins geometry has seven incomplete
  land-cover multipolygons; completing them changes all five plain cells in
  its chunk to forest. Complete missing primary-source relation members before
  rasterization, bounded at 16 relations; otherwise use recursive fallback.
  Repair old external streamed sources before rebuilding their grids, without
  discarding unrelated caches. Preserve offline prepared starting snapshots.
  No guarantee that every OSM coverage gap is now filled.

## R-068 — Agenda, clock and copyable coordinates

- **Implemented:** Localized agenda page plus analog/digital 24-hour UTC
  game clock, accessible full timestamp, no real-time advancement.
  Copy selected cell center at six decimals (player or Look cursor), with
  explicit clipboard failures and success confirmation.

## R-069 — Checkpoint every deployment

- **User decision:** Announce when a release is actually deployed, and checkpoint
  every server deployment.
- **Implementation:** Commit runtime before packaging; embed exact commit and
  preparation time in public/release.json, protected by preview authentication.
  Use a deploy-* Git tag, push checkpoint, verify live manifest and service
  before reporting success. Never include credentials in release metadata.

## R-070 — Audible street performance

- **User report:** Street-music minigame has neither sound nor music.
- **Implemented:** Original synthesized melody and bass, synchronized to
  the visual beat timestamps. R-091 replaces Web Audio with native PCM playback.
  Distinct successful/failed tap notes. No downloaded backing track dependency
  or change to score, tolerance, upfront cost or rewards.
- **Controls:** Start resumes audio from the player's gesture; shared Options
  mute/volume. Cancellation, finish, reset and hidden tab cancel scheduled notes.
  Delayed unlocks cannot revive a cancelled session. Surface audio errors in
  the dialog and console; retain fully usable visual play without audio.

## R-071 — Food in every settlement, with real mapped venues for immersion

- **Approved user decision:** Always propose food; offer known restaurants
  when present for immersion.
- **Implemented:** A fictional basic paid meal on every available settlement
  cell, independent of the four curated specialty areas. Same national-price
  helper, 900 kcal reserve and normal meal time/costs; no free food or revival.
  Existing specialty entries remain geographically sourced and unchanged.
- **Immersion:** Additional basic-meal choices use current-cell public active
  OSM restaurant/cafe/fast-food/food-court names and source links. Deduplicate
  OSM IDs; exclude private, forbidden, disused and abandoned venues. Engine
  rejects stale/nonlocal venue IDs. No fabricated venue, menu, opening hours,
  actual portion, price or guarantee of service.
- Legacy saved economies immediately gain the generic option without replacing
  their pinned specialty catalogue or rules. No remote restaurant interaction.

## R-072 — Simple keyboard-shortcut onboarding

- **User decision:** Prefer a simple popup listing shortcuts and their usage,
  rather than implementing a guided tutorial.
- **Implemented:** Show Controls at first journey preparation in each page
  visit; a Controls (?) button and the question-mark key reopen it. List
  movement, Look, cell actions, food, rest versus sleep, music, trail, towns,
  photos, hints, coordinates, saving, map retries, OSM, leaving/resuming and
  Options. Derive keys from the actual bindings; localize descriptions FR/EN.
- Use a focusable native modal, close button and Escape, scrollable on mobile.
  Do not stack over another modal or advance game time. Keep existing
  input-field exclusion and per-dialog printed shortcuts. No persisted
  onboarding setting or multi-step tutorial is added.

## R-073 — Terrain-weighted parent paths

- **Approved direction:** Keep existing town waypoints. Compute four-direction
  A* paths on the 250 m game grid, using the same terrain/elevation movement
  costs as the player, not a separate real-road routing service.
- Bound search corridors, widen when needed, reuse terrain and completed
  paths, and impose explicit work/download limits. Missing data or a limit
  must not produce a straight-line path labelled as validated.
- Persist completed paths with the server journey for later intermediate
  parent clues. Keep paths hidden; free exploration remains unchanged.
- **Implementation:** Upcoming leg prepared asynchronously on explicit journal
  request for server journeys (no automatic distant downloads during testing);
  completed paths and terrain source identity persist separately from immutable
  genesis, with shared route/terrain reuse. Journal progress/error/retry and
  summary only; geometry remains server-side. Local legacy saves unchanged.
- **Bounds:** One worker, two jobs, widening 8/16/32-cell corridors, 50,000
  expansions, 256 loaded chunks and 96 chunk preparations per attempt.
  A 180-second budget is checked between terrain accesses; an in-flight
  provider request may exceed it. Keep prepared terrain after failure.
- **Accuracy:** Reference 4.5 km/h walker with zero fatigue, same terrain/slope
  formula and four directions as gameplay. Missing elevations are explicitly
  reported, with the game's no-slope rule. Water remains traversable; no
  real-world pedestrian access or globally shortest path is claimed.
- This does not yet complete Layer 9's parent story/solvability algorithm or
  implement additional hints. Do not prepare all ten distant legs eagerly.

## R-074 — Fatigue collapse instead of game over

- **User decision:** At 100 fatigue, faint rather than end the game. Advance
  eight game hours in the same cell and recover to exactly 40 fatigue.
  Apply normal unconscious/sleep metabolism and sleep-pressure recovery.
  No meal, shelter or ordinary sleep count is granted.
- Continue hunger and count unsheltered nighttime exposure. Recovery to 40
  includes exposure fatigue; the current model has no separate cold-death
  mechanic. Hunger can still end the journey during unconsciousness.
- Fictional robbery risk depends on location and starting/daily tarot:
  base 30% in settlements, 15% elsewhere, 5% during sheltered actions,
  multiplied by the existing tarot risk helper. If robbed, lose 25–50%
  of carried money, rounded to cents without exceeding 50%.
- Deterministic collapse draws prevent rerolls from reloading the same
  pre-action save. Save the collapse count and latest outcome, time,
  location, risk and stolen amount. No item theft is introduced.
- Interrupt clue/reward/music/hospitality actions when collapsing; do not
  finish them after waking. Explain the event in a localized popup.
- Preserve terminal hunger/sleep rules and already-ended legacy saves;
  do not revive a previously ended fatigue journey.

## R-075 — Layer 15 immediately after Layer 9

- **User priority:** After completing Layer 9, proceed directly to Layer 15
  (photos and travel journal: camera, ASCII conversion, town welcome image
  and PDF export). Layers 10–14 are not the next sequential work.
- Check actual dependencies before implementation; do not mark intervening
  layers implemented or expand scope silently.

## R-076 — Reuse completed map cells on resume and deployment

- **User reports:** Replaying/resuming around Paris / Louis Blanc showed
  missing cells and slow downloads despite previous exploration.
- Distinguish unfinished downloads (provider quota/502/500 failures) from
  existing server grids. Narrow Overpass recursion to multipolygons rather
  than nationwide transport/administrative relations.
- Cache grid identity must follow raster geometry, source and actual chunk
  processing, not unrelated API, UI or download-transport changes.
- For this compatible identity transition, explicitly migrate checksum- and
  geometry-verified completed grids from the exact previous pipeline.
  No redownload, rerasterization, deletion, player-state rewrite or blind
  reuse of arbitrarily old/incompatible grids.
- A genuinely changed rasterizer still invalidates grids. Existing source and
  elevation caches remain reusable. Missing cells are not invented terrain.

## R-077 — Visible food-search and manual-save results

- **User reports:** Food-search results are hidden at the bottom of the
  window; pressing Save gives no visible confirmation.
- Put cell-action outcomes/errors above actions, focus and scroll the feedback
  into view after a search. Preserve status/alert semantics and all costs.
- Manual Save (button or S) shows a fixed visible confirmation with actual
  saved time, explicitly local to this browser, only after successful storage.
  Write errors show an alert, never success. Repeat saves reannounce feedback;
  next gameplay autosave or leaving clears the manual confirmation.
