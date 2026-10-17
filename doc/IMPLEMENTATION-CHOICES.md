# Playable checkpoints, choices and open questions

This document records the unattended work requested after Layer 3.
The design PDF remains the reference; additions are tracked in REQUIREMENTS.md.
All survival numbers below are gameplay approximations, not medical advice.
Sections are chronological checkpoint records: later layers supersede earlier
shortcuts, especially free meals and unrestricted outdoor sleep.

## Testing checkpoints independently

- Existing Layer 3 baseline: commit `6bbe4c4`.
- Layer 4 checkpoint: Git tag `layer-4-needs` (created after validation).
- Layer 5 checkpoint: Git tag `layer-5-towns`.
- Layer 6 checkpoint: Git tag `layer-6-economy`.
- Layer 7 checkpoint: Git tag `layer-7-music`.
- Layer 8 checkpoint: Git tag `layer-8-parent-trail`.
- Save/resume checkpoint: Git tag `local-save-resume`.
- Each completed further stage gets its own commit/tag and section here.
- Nothing is pushed remotely automatically.

To test an older checkpoint without reverting the working directory:

```sh
git worktree add --detach ../arcane-path-layer3 6bbe4c4
cd ../arcane-path-layer3
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 scripts/travel_server.py --port 8767
```

Use a different sibling directory/tag and port for each checkpoint.
Included regional snapshots work offline; external chunks/elevation/weather
need network on their first preparation. Each worktree has its own disk cache.
Browser content caches are origin-specific (a different port is a different
origin). Do not delete the shared current cache to test another version.

## Layer 4 - character and needs

### Scope and choices

- Keep Layer 3 walking, elevation, sky, weather, Look mode and photo caches.
- Three small fixed profiles, no skill tree or character-creation screen:
  balanced (3/3/3), sturdy (strength 5/endurance 3/pace 4), enduring (2/5/3).
- Strength/build increases gameplay mass and modestly improves baseline speed.
  Pace increases speed and effort. Endurance reduces exertion fatigue.
- Baseline mass is 40 kg, plus 5 kg per strength point above 3.
  Speed is `4.5 * (1 + 0.06*(pace-3) + 0.025*(strength-3))` km/h,
  before terrain, slope, fatigue and needs. Effort multiplier is
  `1 + 0.08*(pace-3)`; endurance divisor is `1 + 0.12*(endurance-3)`.
  These formulas are in survival.mjs; profile values and needs are in YAML.
  Strength is intentionally not a universal measure of walking fitness.
- Start fed and rested with an abstract 1800 kcal reserve. Hunger is its
  depletion percentage, not the lifetime calories-spent counter.
- Walking costs active energy plus passive metabolism, counted once.
  Passive metabolism is 40 kcal/hour for the baseline profile, scaled by mass.
  Rest and meals also consume passive energy. Sleep consumes 80% of that rate.
- Hunger progressively reduces speed by up to 25%. Sleep pressure starts
  slowing travel after 16 equivalent waking hours, up to another 25% at 32 h.
- Rest: 30 minutes, recovers 20 exertion-fatigue points, does not remove sleep
  pressure. Sleep: 8 hours, removes 24 equivalent waking hours and up to
  96 fatigue points. No real-time timers.
- Temporary meals: only OSM settlement-symbol cells, 20 minutes, 900 kcal,
  capped at reserve capacity. Free prototype assistance until Layer 6 economy.
  No foraging, backpack food or shopping yet. A meal need not be a real venue.
- Sleep is allowed anywhere, without shelter penalties yet. Accommodation,
  vigilance, weather exposure and safety mechanics belong to later layers.
- End a journey on reserve depletion, fatigue 100, or sleep pressure 32 h.
  Show a non-graphic exhaustion message, freeze survival/movement actions,
  leave information/Look available, and offer a fresh journey.
- Actions resolve atomically at their end; a meal refills before its time cost.
  Sleep may end the journey if reserves cannot support the sleep period.
- Look mode, provider delays, failed movement and real-world waiting cost
  nothing. Meals always use the player's actual cell, never the Look cursor.
- No save/load in the initial Layer 4 checkpoint. Reload or region change
  resets the journey, as in Layer 3; source/content caches persist.

### Manual walkthrough (normal configuration)

1. Open the local preview, choose Firmi and Balanced, then start.
   Expect empty needs gauges, a player marker and the Layer 3 sky/weather.
2. Walk a few cells: game time, distance, energy, hunger, fatigue and sleep
   pressure advance. Look with L and arrows: no needs or time change.
   Escape returns to walking; photo-dialog Escape closes the photo first.
3. Rest: clock +30 minutes, fatigue falls, hunger and sleep pressure grow.
4. Sleep: clock +8 hours; fatigue/sleep pressure recover; hunger grows.
   Sun/moon and estimated temperature follow the new game time.
5. Visit a settlement cell (circle). In Firmi, one step south from the initial
   position reaches Lestrunie with the current OSM snapshot. Meal becomes available, takes 20 minutes
   and lowers hunger. Outside settlement cells it is disabled with explanation.
6. Stop, choose Sturdy, restart and compare the same flat step with Balanced:
   faster walking and higher energy consumption. Enduring tires more slowly.
7. To test sleep exhaustion quickly without walking: start fresh, click Rest
   64 times at default settings. Warning appears at 16 hours, journey ends
   at 32 hours; movement/rest/sleep/meal are disabled. New journey resets.
8. To test reserve depletion: start fresh and sleep eight times without eating.
   Eventually the journey ends hungry despite low fatigue/sleep pressure.
9. Change language and inspect on a narrow screen. Labels remain translated,
   and the map is not horizontally cropped.

For faster manual thresholds, temporarily change YAML reserve/sleep limits in a
separate test worktree, reload, then start a fresh journey. The model tests
exercise exact hunger/fatigue/sleep thresholds without making many UI clicks.

### Automated checks

```sh
source .venv/bin/activate
python3 -m unittest discover -s tests -p 'test_*.py'
node --test tests/*.test.mjs
```

Survival tests assert numeric trade-offs, active/passive energy accounting,
terminal thresholds, meals restricted to settlements, distinct rest/sleep,
config validation and unchanged Layer 2 legacy travel calculations.

Validation at the Layer 4 checkpoint: 77 JavaScript tests and 62 Python tests
passed. Browser checks exercised movement, no-cost Look, meals in Lestrunie,
sleep recovery, sleep-exhaustion lockout, Look after exhaustion and restart.
At 375 x 800, the travel map and needs panel fit without horizontal overflow.

### Open questions for the next discussion

1. Are these three profiles enough, or should the player distribute points?
   The enduring preset currently has fewer attribute points, intentionally
   making this a first balancing draft rather than a fair competitive build.
2. Should strength affect unloaded walking at all, or mainly future bag weight?
3. How forgiving should failure be? Current exhaustion is an explicit game-over
   prototype, not a death simulation; rescue/foyer consequences remain undecided.
4. Should sleeping be selectable in hours or a fixed full night?
5. Is free town assistance the preferred bridge to the economy, or should
   characters start with rations instead? No food outside towns is preserved.
6. Settlement point cells are coarse: should later city boundaries allow town
   actions across a larger area? Never infer town access from nearby Wikipedia.
7. Should sleep pressure use circadian time as well as waking duration?
8. What persistence/autosave policy is desired before long multi-day journeys?
9. Keep weather cosmetic until Layer 11, or move exposure effects earlier?

## Layer 5 - real settlement menus

### Scope and choices

- Automatic text-only menu on entering a named OSM settlement cell. Closing
  stays at the same position; a sidebar button reopens it. Looking at a
  settlement from afar is not entering it.
- Preserve OSM settlement ids, names and explicit Wikipedia association,
  as well as POI coordinates and relevant venue/access tags in prepared maps.
- Reuse the existing description service, IndexedDB cache and Wikipedia
  provider. Settlement summaries have a separate cache identity, including
  the settlement id/name/association, so a nearby landmark description cannot
  silently substitute for a town welcome.
- Prefer explicit OSM Wikipedia association, respecting its source language
  and redirects. Otherwise require a geographically nearby article whose
  title matches the settlement name (allowing accents/disambiguation suffixes).
  Both paths require coordinates within 2 km. No generated history fallback.
- Multiple settlement nodes in one coarse cell are displayed together; the
  deterministic first OSM id supplies the summary until finer town selection.
- List named, public-facing shops, selected amenities/tourism and transport
  stations from already-loaded cells within 2 km. Five entries per broad OSM
  category, sorted by distance and id, deduplicated by OSM identity.
- Explicit private/no-access, vacant, abandoned/disused, unnamed and
  residential/irrelevant features are not offered as venues.
  Public-facing is a category heuristic, never a guarantee of actual access.
- Radius is visibly labelled a neighborhood, not membership in a city.
  Small hamlets may show venues in nearby Firmi. Streaming may add venues
  while the menu stays open; closing does not reopen it on background updates.
- A venue entry displays provenance and a link, not a fictional merchant,
  price, opening promise, accusation, quest or real person's dialogue.
- Browsing is free and pauses map input. Future actions can have explicit
  time/energy costs; there are no placeholder enabled purchase/work buttons.
- Layer 4 meals remain a free settlement-cell action outside the dialog.
  No extra geographic API calls are introduced by the venue menu itself.

### Manual walkthrough

1. Start in Firmi. Walk one cell south: Lestrunie menu opens.
2. Expect named venues such as the library and bakery, with OSM links.
   Lestrunie has no identified article in the current snapshot: expect an
   explicit missing-summary message, not Firmi's article as its own history.
3. While the menu is open, arrows, R and P do not move, rest or open a photo.
   Selecting a venue shows its source. Escape returns to the same cell.
4. After the movement buttons are ready, walk one cell east: Firmi menu opens.
   Expect the real Firmi Wikipedia summary, attribution, language and license.
5. Close, use the settlement button to reopen, and verify no time/needs change.
   Cached summaries remain available after successful prior retrieval.
6. Leave the cell, use Look to inspect a circle: no settlement menu opens.
7. Switch language and reopen. The UI translates; a Wikipedia source may stay
   French when explicitly associated by OSM, and its language is labelled.
8. Test on a narrow screen: the dialog scrolls vertically; venue buttons wrap.

Validation: 83 JavaScript and 62 Python tests passed. Browser tests verified
automatic entry, named venues, Lestrunie's explicit absence, Firmi's real
Wikipedia welcome, venue links, free browsing, modal shortcut isolation and
rapid close/reentry. The latter caught and fixed a queued-dialog-close race.
English localization, cached summaries with Wikipedia requests blocked, and
the 375 x 800 dialog layout (no horizontal overflow) were also verified.
Layer 4 and legacy travel tests remain green.

### Open questions and intentional stopping point

1. Should the venue menu use finer types (cafe/bakery/museum) rather than the
   current broad category labels and limit? The raw OSM types are preserved.
2. Should town bounds follow administrative polygons, built-up area, or a
   radius varying with city size? The prototype never guesses membership.
3. Are hamlets intended to have the same menu flow as large towns?
4. How should multiple settlements in one 250 m cell be chosen?
5. Layer 6 requires money and sourced national food/accommodation prices.
   This work intentionally stops before inventing absolute Eurostat prices:
   a price index alone is not the cost of a meal. The country must still
   originate in map data, which is sparse in some current snapshots.
6. Next implementation: agree on currency/start budget and item definitions,
   choose a versioned price dataset with provenance and missing-country rules,
   then wire real purchases/accommodation as a separate Layer 6 checkpoint.
   Do not silently replace missing country with France or arbitrary prices.
7. At the Layer 5 checkpoint, street music, parent trail, saving and later
   geocache dungeons were unimplemented. Layers 7-8 below now add music/trail;
   saving and dungeons remain deferred.

## Layer 6 - user decisions superseding the earlier economy questions

- User approved a random starting tarot card and provisional per-card budget.
  22 major arcana, 4-10 reference meals, no paid draw or new daily cash.
  Birth card stays fixed; the daily card changes when an action crosses UTC
  midnight. Merely refreshing labels does not draw. No persistence yet:
  restarting a journey rerolls, intentionally allowed in this prototype.
- User selected Big Mac Index instead of Eurostat. Pin observations to
  2026-07-01 from The Economist's public data. Euro area: EUR 6.19,
  dollar equivalent 7.07922094259998; CH/GB/US dollar observations are included.
  Compare dollar prices, then express tariffs in reference-euro game units.
  Do not compare unrelated local currencies directly.
- The original FR=euro-area association and reference fallback below are
  superseded by R-058: import the raw national source CSV, giving Italy
  EUR 6.56 and France EUR 5.60 on 2026-07-01. The 30 available European
  national USD observations contribute equally to the fallback mean; this
  is not an EU, population-weighted or eurozone average.
  Map source ISO alpha-3 codes for every supported European country, not a
  selected list of country names. Include Moldova; report countries without
  current observations instead of relabelling historical prices as current.
- Missing/ambiguous country or missing national observation uses that mean
  with a deterministic per-cell delta in [-10%, +10%]. FNV-1a over the
  geographic cell centre rounded to six decimals yields 2,001 possible
  deltas (0.01 percentage-point steps). No Math.random on renders or actions;
  coordinates survive reloads and selected map/food regions never set country.
  National prices have no delta. All monetary actions pass the same cell
  coordinates to the shared quote function; round the final amount to cents.
- When opening meal/shelter menus, absent country tags can be resolved by a
  Nominatim country-level reverse lookup using the existing cache/throttle.
  Menu purchases wait for this optional lookup; errors are logged and shown
  before enabling estimated prices. This economics-only country overlay does
  not change map identity, country labels or terrain. Border ambiguity remains
  an estimate. Non-European legacy starts do not trigger this lookup.
- On resume, fetch and validate current pricing, replacing only the saved
  pricing object; keep saved rules, meals, tarot, wallet and all progress.
  Autosave persists the update after successful preparation. Legacy economy
  snapshots without fallback remain valid. Failed refresh uses the existing
  preparation error path without overwriting the saved journey.
- This explicit reference-tariff policy replaces the earlier proposed block
  on all purchases when country is missing. It keeps Firmi playable without
  calling it France from region selection. No supposed real-world local price.
- One meal per curated area: aligot, croque-monsieur, tartiflette, poisson cru.
  Source/publisher/check date included. Text is a short original ingredient
  summary, not a copied recipe. Geographic boxes are approximate curation
  areas. All portions provide 900 gameplay kcal for balancing, not factual
  nutritional data. Food is a fictional town service, not a claim that any
  named OSM venue sells the dish. No inventory/foraging yet.
- Meal tariff: one local index unit. Lodging: four units. Source links and
  distinction between observed index and game multipliers visible in menus.
  Integer cents prevent floating-point balance drift; insufficient funds
  rejects the transaction without spending time, energy or money.
- Lodging must be in the player's actual cell, never the Look cell or a nearby
  town-menu venue. Allow hotel/hostel/guest_house/motel/alpine_hut. Shelters or
  wilderness huts are free only with explicit fee=no. OSM access restrictions
  and disused/abandoned tags are respected. No actual reservation or guarantee.
- Outdoor sleep restores no exertion fatigue, only 25% of normal sleep
  recovery. Every outdoor nighttime hour adds 2 fatigue; nighttime rest has
  zero exertion recovery. Exposure accumulates across actions, not real time.
  Solar phase is sampled at 15-minute midpoints, including dawn/dusk crossings;
  this is a bounded gameplay approximation, not an exposure/safety calculator.
  Sheltered sleep and town meals avoid exposure during their own duration.
- Future nightly events use the daily card's stored provisional risk weight.
  They are intentionally not rolled yet: user deferred dangerous-event
  minigames to a later layer. No hidden placeholder harm or unplayable event.
- A future LLM ingestion pipeline must preserve source URL, publisher,
  retrieval date and location and validate schema. It must not generate actual
  prices or fictional claims about real venues/people.

### Layer 6 manual test

1. Start Firmi: read birth card, daily card and purse. Restart to draw afresh.
2. Walk south to Lestrunie, choose Local meals. Expect sourced aligot and
   country check, or a labelled European estimate when lookup is unavailable.
3. Purchase: purse -5.60 game EUR for confirmed France (otherwise the displayed
   estimate), clock +20 minutes, hunger reserve recovers.
   Repeat until money is insufficient: option disables, no negative purse.
4. Sleep and shelter: only outdoor sleep when the cell lacks mapped shelter.
   A hotel named in the nearby menu is not sufficient; walk to its actual cell.
5. Sleep through a night: exposed minutes and fatigue grow; sleep pressure
   only partially recovers. Sleeping outside during day has no night penalty
   but still does not recover exertion fatigue.
6. In Tahiti, local meals offer poisson cru; PF's missing index is labelled,
   never a pretend euro-area local observation.
7. Cross UTC midnight by an action: daily card changes once, purse does not.
8. Look and dialogs cannot buy/sleep from an inspected remote cell. Browsing
   does not change time or needs. Check both languages and narrow screens.

Automated tests cover all 22 budgets, price normalization, exact transactions,
source-area matching, missing-country policy, mapped shelter restrictions,
night walking/rest/sleep penalties and exhaustion.

Validation: 90 JavaScript tests and 62 Python tests passed. Browser validation
covered a real tarot purse, paid sourced aligot with exact wallet deduction,
modal input isolation, outdoor-sleep selection and the reference-price notice.
The meal dialog fits 375 x 800 without horizontal overflow. Shelter outcomes
and nighttime thresholds are asserted in deterministic model tests.

## Layer 7 - first earning minigame

- One visual rhythm variant, no audio dependency: eight beats 700 ms apart,
  1.5 second preparation, +/-180 ms hit window. Space or touch/click input.
- Upfront cost: 30 game minutes, basal metabolism and 4 fatigue; nighttime
  exposure still applies. Start may exhaust the character, in which case
  there is no performance or reward. No money required to try earning.
- Each note scores at most once. Full score earns two locally priced meals,
  partial score a proportional integer-cent share, all misses zero.
- Settlement only, using actual player cell; no need for a specific real cafe.
  No implied street-performance permission or fictional real-person tipper.
- Costs are never refunded on cancellation. Escape/close/tab hiding cancels
  and gives no reward. Real-world minigame duration is not extra game time.
  Background timers stop when the game ends, closes or the journey resets.
- No difficulty tiers, audio latency settings, skill progression or assist
  mode yet. The explicit first variant can be replaced without changing the
  economic settlement model. Accessibility options are an open question.

### Layer 7 manual test and validation

1. Walk south from Firmi start. Open Street music from the town or sidebar.
2. Start: clock +30 min and fatigue +4 immediately. Tap eight lit notes.
   Perfect score yields +12.38 game EUR at the reference tariff.
3. Start again and Escape: no money awarded, time/fatigue remain spent.
4. Look or move outside a settlement: performance unavailable.
5. A meal spends earnings; use a real current-cell lodging for a protected
   night. Keep enough money/energy to reach it rather than farming until spent.

Browser verified 8/8 timing, exact 12.38 earnings, upfront costs, cancellation
without refund and 375-pixel layout without horizontal overflow.
Unit tests cover timing endpoints, spam resistance, exactly-once settlement,
zero-money earning, exhaustion and three full 24-hour survival cycles.

## Layer 8 - beginning, objective and reunion

- Generate a fictional parent name from four neutral names, and three
  distinct map cells. At each step choose randomly among the four nearest
  remaining named locations, using the previous step as origin. This keeps
  the first campaign short rather than sending a new character across Europe.
- Use named settlement nodes where available, otherwise a named public-facing
  POI using the same access/type filter as town menus. This matters in Paris
  and Chamonix, whose included extracts have only one settlement node each.
  No invented geographic location is used to force three stages.
- One fictional traveler at each clue stage, identified independently of the
  OSM place. No role or personal behavior assigned to real venue staff.
  A fact sheet records parent name, seen-at place and next destination.
  Dialogue is a hand-written template constrained to these facts.
- Reveal only the next objective, with regional row/column and relative
  cardinal cell offsets; the underlying future stages remain model data.
  Journal retains found dialogues/facts and links the current landmark's OSM
  record. Display indices are regional, not the moving camera indices.
- Interview/reunion requires the exact player's cell, costs five simulated
  minutes plus basal consumption and outdoor night exposure. Reading is free.
  Repeated clicking cannot grant another clue from the old witness.
- Parent remains at the final stage. Third encounter ends in a positive
  reunion, freezes survival/movement like other terminal outcomes, and offers
  a new journey. Exhaustion during an encounter takes precedence over victory.
- No photograph is misrepresented as the fictional parent. No LLM, OSRM,
  generated biographies, travel calendar, false leads or dynamic parent yet.
- No persistence was added silently: reload/region switch/new journey resets
  story, tarot and wallet, as stated in the README. A proper versioned save
  remains a high-priority follow-up before longer campaigns.

### Layer 8 manual test

1. Start a new journey: journal opens with parent and first objective.
2. Close it and follow the relative offsets. Negative east/south means
   west/north. Reopen to check your remaining offset.
3. At the exact target, interview unlocks. Spend five minutes; next objective
   appears and the previous fact sheet stays in the journal.
4. Follow the second clue, then the third stage. Reunion completes the game.
   Movement/food/rest/music freeze; Look and journal remain available.
5. New journey draws a new tarot/parent/route. Another region also generates
   three stages. No saved progress is implied.

Validation: 101 JavaScript tests passed, including generation across all four
maps with multiple fixed draws, distinct real landmark identities, immutable
fact progression, repeat prevention and hunger taking priority over reunion.
The browser completed a deterministic Firmi route (Lestrunie, Firmi,
Saint-Saturnin), with two clues and the terminal reunion screen. The reunion
dialog fits a 375 x 800 viewport without horizontal overflow.
The latest full Python suite remains 62 passing tests; Layer 8 changes no
Python pipeline logic.

### Remaining decisions and next checkpoint

- **Layer 9:** The loopback map server is not the full game server. Server-side
  game creation, route generation/validation, OSRM integration and versioned
  content/persistence need a separate design and playable checkpoint. The
  immutable server-created genesis milestone below supersedes the creation
  and initial-content persistence part only.
- Confirm whether the parent should already move, which profile/biography
  choices belong to character creation, and whether local starts should remain
  a short tutorial before a larger trip.
- Define saves/autosaves and how a daily tarot draw is persisted, before
  introducing consequences that must survive reloads.
- Night events/survival minigames remain deferred to the Events layer, as
  explicitly requested. The daily tarot/risk data are foundations only.
- First-pass budgets, 900-kcal meals, lodging multiplier, exposure penalties
  and rhythm difficulty need playtesting rather than claims of realism.

## Local save/resume - user-selected priority before Layer 9

This supersedes the no-persistence notes in Layers 4-8 above.

### Choices

- One browser-local slot per region, explicit Resume and confirmation before
  replacing it with a new journey. No automatic start on page load. Switching
  region or stopping merely leaves the live view; the last state stays stored.
- Synchronous localStorage write after each committed gameplay state change,
  not after render, Look, weather/content fetch, or failed movement. No
  unload-handler dependency. A visible timestamp follows successful writes;
  failures are logged and remain visibly distinct from success.
- Format v1 contains state, region, map geometry identity, revision, saved
  timestamp and pinned survival/economy snapshots. Restoring does not fetch
  current balance settings or reroll any character/tarot/story choice.
- Keep all model data, including immutable witness facts, past performance
  counts, birth card, daily card/date, global chunk position, last movement
  and terminal outcome. Stream memory, modal state and inspection cursor are
  intentionally reconstructed, not serialized.
- During music, the persisted snapshot is already a cancelled performance:
  upfront costs remain; no pending reward can be replayed. The live
  performance continues normally, and settlement replaces the snapshot with
  its actual score/reward. Repeated reloads do not add costs or rewards.
- Validate snapshot fields, character coefficients against pinned attributes,
  tarot ids/day, route/history consistency and finite resource values.
  Geometry changes reject resume rather than moving a player to a different
  place. Existing world data can still update within unchanged geometry.
- Corrupt/unknown-version data stays in its slot and is not silently reset.
  Starting a new journey confirms replacement; no migration or export UI yet.
- A store remembers the raw value it loaded and checks before each write.
  Another tab's update blocks that tab's subsequent writes with an error.
  This is a local stale-write guard, not a database lock or cloud conflict
  resolution system; use one playing tab per region.
- A save error does not undo a successful gameplay action or pretend it was
  persisted. Save now can retry after transient quota/access failures. A
  stale-tab error requires reload/resume to adopt the stored version.
- Browser origin-specific, not server-side. No account, cross-device sync,
  encryption, anti-cheat promise or audio asset storage. Clearing photo cache
  is independent from clearing browser site data. The map server is still
  needed to resume its normal travel/chunk API.
- Future incompatible model changes must increment the save format and add
  an explicit migration or rejection, not reinterpret old state silently.

### Manual test

1. Start Firmi, walk, eat, rest and discover a clue. Note money, time and tarot.
2. Reload, select Firmi, click Resume: same position, gauges, money, cards,
   profile, route and journal; no real-world time has elapsed in-game.
3. Start music and reload partway through: upfront time/fatigue persists;
   no performance resumes or pays again. Finish a performance and repeat:
   the already-earned money remains, but is not paid twice.
4. Stop or switch regions, then return to Firmi: Resume is still available.
   Start fresh and decline confirmation: the old save remains unchanged.
5. Change YAML/prices, then resume: old rules remain. Start a new journey
   after confirmation to use the new rules.
6. At exhaustion or reunion, reload/resume: still ended, never revived.
7. Use another tab to change the same slot, then Save now in the first:
   expect a visible stale-save warning, not an overwrite.
8. Simulate storage denial/quota failure: expect a visible error. Restore
   storage and Save now; previous data was not deleted on failure.

### Validation

107 JavaScript tests pass, including exact round trips after movement, meals
and clues, pinned data, interrupted music, terminal saves, independent region
slots, bad values/versions, quota/access errors and stale writes. Browser
checks verified exact reload/resume, preserved profile/tarot/money/journal,
music costs without duplicate reward, explicit quota and stale-write errors,
recovery via Save now, region switching and cancelled replacement.

## Downloaded background music

### Choices

- Explicit Enable music each page load, quiet 25% default, volume slider and
  mute available on both static map and active journey. No autoplay surprise
  or music preference written into journey saves.
- Accept prompt IDs with or without the two-digit numbering, including spaces
  around the hyphen. Try WAV, MP3 and OGG in that order. Existing downloaded
  masters are not renamed, transcoded or modified.
- Choose from actual player terrain/OSM features and computed solar phase, never
  Look inspection. Menus and terminal outcomes override travel music.
- Requested track falls back to road-day, title, then visible silence.
  Missing files/decode failures are logged and remembered for the session;
  mute/re-enable clears this memory to discover later downloads.
- No synthesized substitute or dependence of gameplay on successful loading.
  Autoplay denial asks for another user gesture rather than marking all
  files missing. A stalled load times out instead of blocking indefinitely.
- One looping HTML audio element at a time; cancel stale loads on transitions.
  No crossfade/custom loop points. Switching context or resuming from pause
  starts the chosen track from its beginning.
- Pause on hidden tabs and throughout the rhythm dialog. The generated
  practice track is not tempo-aligned, so it must not accompany scored notes.
  Future dungeon/event tracks and sound effects are still not connected.
- Audio downloads remain local user assets; this code change does not stage
  large generated masters or unrelated filesystem metadata into Git.

### Validation and testing

116 JavaScript tests pass, including context precedence, filename aliases,
missing/corrupt files, fallback chain, mute, volume, hidden/rhythm pauses,
late downloads, autoplay rejection, stale load cancellation and playback
failure recovery. Browser playback decoded the actual numbered title and
road WAVs, advanced their playheads and kept only one active sound. Verified
missing-town fallback, volume/mute, hidden/rhythm pause and resume, and an
all-files-404 simulation reaching silence without changing the journey save.

Manual test: reload, Enable music; resume a journey and close/open its menus.
Download additional prompt-named tracks, mute/re-enable, then visit the matching
terrain/menu. Try muting or hiding the tab while loading; no old sound should
start afterward. Use the status to distinguish real playback from fallback.

### Open questions

- Listen and tune relative loudness/loop points of the generated masters.
- WAV masters are large; choose web delivery encodings once tracks are final.
  No automatic conversion, offline audio cache or audio downloads UI yet.

### Europe-wide correction

The user clarified that music must work across Europe, not only the sample
maps. Removed all region-name checks. Mountains/forest follow terrain;
generic city/coast follow explicit OSM tags on the current cell. Absence of
tags uses ordinary travel/town music, not an inferred country or coastline.
Renamed prompt concepts to music-city/music-coast while retaining numbered
music-paris/music-tahiti download aliases. Their prompts no longer specify
Paris/Papeete. More detailed cultural palettes can be discussed later; they
are not inferred from a starting map.

## English vocal title song

The user selected title-screen-only vocals. Added original English lyrics
and a separate Suno Custom-mode prompt for "One More Little Light", a gentle
8-bit song about the parent search, kindness and resting along the way.
Instrumental must be OFF for this prompt, unlike the background catalog.

Optional asset `music-title-song` uses number 16 so reserved future numbers
14/15 do not move. The title/static map requests it first, then instrumental
title, then silence. Travel context and fallback chains never request vocals.
Existing explicit enable/mute/volume and hidden-tab rules apply; the complete
song loops like other tracks. No recording is bundled or claimed generated.

15 focused audio/localization tests pass, including title-only selection,
transition to instrumental travel, vocal filename aliases and missing-vocal
fallback to the existing title track. Generate/download the recording to
audition singing, pronunciation, mix and song repeats before considering
the audio production complete.

## Directly synthesized first-version sound effects

The user reported that Suno kept adding music to one-shots and asked for
direct generation. Added a standard-library Python synth and 27 mono PCM16
44.1 kHz WAV assets, about 724 KB including the gallery/docs. Seeded filtered
noise, rounded pulse/triangle tones and pitch bends follow the existing
briefs. All cues have short attack/release envelopes and fixed headroom;
quiet footsteps/misses are not normalized up to fanfare volume.

The generator refuses to replace existing cues without explicit --overwrite.
No downloaded music or unrelated files were changed. Two future cues remain
assets only. No gameplay triggers were introduced in this sound-production
step; the gallery allows individual audition before integration.

Two focused Python tests verify all 27 briefs, deterministic rendering,
exact sample counts, mono WAV format, nonzero output, onset within 5 ms,
zero endpoints, peaks below 70% full scale and overwrite protection. All 27
WAVs decoded successfully in the browser, including the 140 ms water cue.
These checks validate files, not subjective listening quality; the user
should audition at low volume and request adjustments to the palette.

## Story-led opening screen

Added a deliberately calm first screen rather than starting on map controls:
original ASCII road/forest/mountain landscape, typographic game title and
three short localized paragraphs about the parent search and practical
journey. No invented explanation for the parent's absence or new quest
mechanics. Open the map reveals existing setup/resume controls; it does not
start a game, reroll tarot, spend time or write a save.

Title returns on each reload, without a new browser preference. Music and
language remain accessible; the existing optional vocal title song continues
to work. Map loading may finish behind the opening screen. Decorative ASCII
is aria-hidden, with real-text title/story. Keyboard focus transfers to the
region selector; mobile keeps the artwork inside the viewport.

Validated 15 focused localization/audio tests, JS syntax and whitespace.
Browser checks at 375 px confirmed no horizontal title overflow, translated
entry button, hidden map before entry, revealed map afterward, region focus,
unchanged saved data and no active journey created by entry.

## Starting tarot reveal and default music

The user requested a visible creation draw and chose one final card per new
journey. Existing profile selection still sets attributes; no new tarot stat
bonuses were invented. Once the initial chunk loads, autosave the full new
journey, then open a modal card back. Reveal exposes the already-drawn birth
card, an original localized symbolic reading and exact initial budget.
Continue opens the existing trail journal. All 22 meanings are suggestions
for the journey, explicitly not predictions or additional gameplay effects.
The dialog also shows actual save success/error rather than promising storage.
Initial chunk retry preserves the draw and opens the same reveal; normal
resume retains the card and skips creation. No save schema change is needed.

Browser validation revealed Judgement with its 37.14 game EUR purse and
six reference meals; repeated reveal did not change the save, and Continue
opened the journal. The existing user save was restored after the test.
Translation coverage verifies readings for every economy card in FR/EN.

The user also changed the music policy: default-enabled at 25%, superseding
earlier opt-in notes. The browser played the real English title song at load.
If autoplay is denied, a subsequent click/key retries; mute remains explicit.

## Tarot artwork and characteristic correction

Replaced the misleading generic revealed road drawing with 22 distinct
original ASCII symbols. Concealed cards use a patterned back. Automated
coverage checks uniqueness, ASCII and equal-width borders for every card.

The user then chose tarot-derived attributes instead of manual profiles and
starting + daily cards for future event chances. Each card now defines nine
total attribute points, distributed within 1-5. Existing mass/speed/effort/
endurance formulas remain unchanged. New characters use profileId "tarot";
save validation checks their coefficients against the pinned birth-card
attributes. Older saves retain original profiles and need no migration.

Night-event tendency is `0.5 + mean(birth.nightRisk, daily.nightRisk)`.
The shared helper accepts a base probability and caps the result at one.
Current curated cards give multipliers 0.7-1.1. This is provisional gameplay
balance, not event execution: the future Events layer must call the helper.
Birth attributes never change with daily draws. The reveal explicitly shows
the attributes, budget and future tendency without claiming events are live.

## Button tooltips and shortcuts

Centralized metadata for all buttons, including dynamically generated options.
Use Alt+Shift chords rather than consuming ordinary typing keys or changing
existing arrow/L/R/P/Space controls. Interpret physical event.code so Option
characters on macOS do not break letter shortcuts. Every button gets native
title, aria-keyshortcuts and a localized hover/focus tooltip. Tooltips move
inside open dialogs so the browser top layer does not obscure them.

Bindings are scoped to the open dialog or the main screen, and skip hidden,
disabled and inert controls. Dynamic options use digits then unused letters,
with no collisions with fixed dialog actions. Key repeat and form fields are
ignored; activating a shortcut invokes the existing button click path, so
confirmation, costs, validation and save behavior remain centralized.

Focused tests check physical-key handling, chord guards, mnemonic bindings,
dynamic uniqueness and overflow errors. Browser checks covered all 41 static
buttons, title entry, modal opening/closing, selector guards, modal isolation,
localized titles and focus tooltips both inside/outside a dialog.

## Ten-stage parent trail

The user chose ten stages. New trails now choose ten distinct named cells
using the existing nearest-four randomized algorithm. All four bundled maps
have enough candidates (100 Firmi, 130 Paris, 55 Alps, 187 Tahiti).
The journal denominator, intro and final encounter label follow actual route
length. Old three-stage saves retain their routes and can still reach reunion.
Save validation accepts existing three-stage and new ten-stage routes, with
sequential witness ids through ten. No route is silently extended on resume.

20 focused trail/save/localization tests pass, covering ten-stage generation
across all regions and fixed draws, ordered five-minute encounters, reunion
only on stage ten, and old three-stage saves through completion.

## Daily tarot reveal

Added a daily popup with patterned back, matching ASCII artwork, original
meaning and future event tendency. The existing model still draws once when
an action crosses a UTC date. A saved dailyTarotSeenDay records acknowledgment,
not a second random draw. Equal cards on consecutive dates still get a popup.
Legacy saves without the field treat the current day as seen on resume.
The popup waits for busy actions and other dialogs, and is suppressed for
terminal outcomes. Acknowledgment is saved; revealing adds no gameplay cost.

128 JavaScript tests pass. Browser validation crossed midnight with rest,
revealed the Tower, confirmed matching art/meaning, then persisted the seen
date without rerolling, spending extra time or changing money. The original
save was restored after validation.

## Alternative survival actions

The user requested foraging, street donations and fictional food theft,
approved immediate implementation, and selected temporary jail with basic
needs recovery rather than game over/a fine. Added Other ways to get by from
both the travel toolbar and town menu. Display availability, time, fatigue,
tarot-adjusted failure risk, outcome and actual save status.

First-pass constants in survival-choices.mjs:

| Action | Location | Time | Fatigue | Base failure | Success |
|---|---|---|---|---|---|
| Forage | Forest cell | 30 min | 5 | 35% | Up to 450 reserve kcal |
| Ask for money | Settlement cell | 30 min | 2 | 40% | Half a local meal price |
| Steal food | Explicit food-shop POI in current cell | 10 min | 3 | 35% arrest | Up to 900 reserve kcal |

The existing combined birth/daily modifier now affects these action risks;
the random nighttime encounter/minigame layer remains deferred. No real
foraging/theft advice or claims about mapped shopkeepers. Food is consumed,
not stored. Food shops require explicit shop tags and exclude private/no,
disused and abandoned entries; restaurants alone do not imply a shop.

All attempts consume metabolism, fatigue and outdoor night exposure. If needs
end the journey during the attempt, no reward or jail recovery can revive it.
Arrest advances six additional hours under shelter using the existing sleep
recovery model with basic food; it counts as one sleep, costs no fine and
does not move the character. Daily tarot rolls normally across midnight and
its popup waits for the action dialog to close. Results/counters round-trip
in local saves; earlier saves omit these optional fields and remain valid.
Action constants are first-version code rules, not new YAML settings.

134 JavaScript tests pass, including map gating, costs/failure branches,
food caps, zero-money donations, local pricing, both-card risk, detention
recovery, night exposure, terminal precedence and exact saved results.
Browser checks verified a 3.10 game EUR donation, a 370-minute arrest action
with release in the same cell, and forest-only 450 kcal foraging. At 375 px,
the dialog fits and unavailable town/shop actions stay disabled. Original
saved progress was restored after each check.

## Custom European origins and a separate setup/options flow

The user requested place-name/current-location starts, confirmed Europe-only
lookup and online service use, then requested a less cramped intermediate
screen, separate language/music options and simpler typography.

Nominatim lookup is server-side, explicit-submit only, identified and globally
serialized with >=1.1 s between requests. A bounded in-memory cache reuses
recent lookups; persisted prepared origins need no new geocoding. Country
allowlist plus documented geographic bounds filters overseas and unsupported
matches. It approximates coverage, not a claim of exact continental borders.
Geolocation is a single permission-based browser call, never an automatic
read or watch; invalid/foreign positions fail visibly.

An origin job prepares a bounded 24x24 OSM map and original source under the
existing private travel cache. Six-decimal coordinate hashes provide stable
origin IDs without names/path input. Cell (12,12) is centred on the requested
point; chunk geometry now respects explicit projection latitude. Restarting
loads the same geometry/source identity for save compatibility. The original
four maps and alphabetic save IDs remain supported, while custom save IDs
have a strict origin-plus-20-hex grammar. No save schema/version bump.

Initial map jobs reuse the bounded worker pool, deduplicate coordinate
requests and expose pending/failure states. Start/Resume are disabled during
selection; switching regions aborts client waiting, not already running server
work. A sparse map without the ten real named public story cells is rejected
before starting, including when selected after reload. No invented clues,
silent origin relocation, or partial saved journey.

Title now leads to an intermediate preparation screen, not the gameplay map.
Presets/custom origins, name search, location, tarot explanation and Start/
Resume live here. Gameplay retains the save status but no setup controls;
returning reloads the selected origin and keeps saved progress. Options is an
accessible native dialog available from all screens, containing the original
language/audio controls. It does not redraw tarot or advance game time.
Existing music defaults and in-session settings are preserved.

Setup typography is one monospace family with exactly two sizes: 24 px for
the main heading and 16 px for other content/controls, including save status.
Location result disambiguation remains full-length, while selected labels are
short. Desktop uses two well-spaced columns; mobile stacks naturally and
privacy/source detail can be expanded. The shared preview viewport was restored
to desktop size after mobile validation rather than left at 375 px.

Tests cover European filters, provider identification/caching/throttling,
reverse lookup preserving the requested coordinates, exact origin/chunk
centres, persistent restart/offline snapshot reuse, strict custom save IDs,
lookup errors/pending responses and insufficient story locations. Browser
validation used real Firmi geocoding/OSM, mocked location success/permission
denial, a ten-stage new journey and exact resume. Original browser saves were
restored after testing. Options language/music/volume, setup/game transitions,
desktop/mobile overflow and computed typography sizes were checked directly.
Final validation: all 141 JavaScript tests and 12 focused Python tests pass.
The region label/control gap is 12 px and selected-origin status starts 20 px
below the dropdown; these distances were measured in the browser.

The user's real geolocation attempt timed out despite granted permission.
Browser diagnostics confirmed a secure context, available geolocation API,
granted permission and an Electron host. Permission and provider availability
are separate: [Electron documents a host-level geolocation service requirement](https://www.electronjs.org/docs/latest/api/environment-variables#google_api_key).
The game cannot configure VS Code's host or guarantee a position from it.
No IP-location service or guessed coordinate was added.

Acquisition now permits a browser position up to one minute old, retries a
provider timeout/unavailability once with higher accuracy for up to 60 s, and
never retries denied permission. Progress and a Cancel lookup action remain
visible. Cancellation rejects promptly, prevents retry and ignores late
callbacks; the underlying one-shot browser request cannot be forcibly stopped.
Final provider errors explicitly suggest system Location Services, a standalone
browser, or name search rather than reporting the permission as denied.
Both retry/cancel model tests and browser UI checks passed. Real position
acquisition in the embedded host remains unverified; simulated success is not
claimed as a fix for that host's provider.

## Character names

The user requested a named character. Preparation now requires a name for a
new journey before confirmation/creation. The shared survival helper trims
and collapses whitespace, normalizes NFC and accepts 1–40 UTF-16 code units
(matching the HTML input limit), excluding control characters. The initial
tarot dialog and player panel use textContent to show the name. It is stored
in state.name and preserved by existing immutable reducers/autosave.

The field is optional only in saved data for compatibility: nameless older
journeys resume without prompting or redrawing and show an explicit unnamed
traveller label. Named saves must contain an already canonical valid value;
loading does not silently rewrite names. No server/network name transmission,
renaming flow or name-based gameplay modifiers were introduced. Tests cover
normalization, accented/non-Latin names, invalid limits/control characters,
action/save round-trip and unchanged nameless compatibility.

## Unconfirmed place searches must not start the previous map

The user reported the same first trail destination after searching different
starts. Prepared Firmi and Marseille maps were checked directly: they contain
different local destinations. The selection UI nevertheless allowed Start or
Resume after search results arrived, before a result had actually been selected,
which could launch the previously selected region.

Search/location requests now keep a pending-selection gate after the network
request finishes, including lookup/preparation errors. Only a successfully
selected map, explicit Cancel, or region change releases the gate. Result text
explains this step and Cancel stays visible while awaiting selection. Existing
saved trails are never rerolled. Browser regression verified Start/Resume remain
disabled while Marseille results are shown over selected Firmi, then become
available only after the Marseille origin is selected.

## Dense OSM areas must reach the fallback providers

The user encountered the primary OSM API's HTTP 400 / 50,000-node limit.
Requests already split recursively, but at the depth-four cap the error became
a plain ValueError and escaped the provider fallback loop. HTTP failures at
that cap now use SourceUnavailable, retaining status/body and cooldown, so
the complete original bounds are retried through both existing Overpass
providers. Other primary HTTP rejections and incomplete map payloads use the
same provider-failure path; invalid user bounds still fail before networking.
No additional providers or unlimited recursion were introduced.

Regression tests exercise five consecutive node-limit responses, failure of
the first Overpass and success of the second, exact original fallback bounds,
provider cooldowns, primary HTTP rejection and incomplete primary payloads.

## Long town trails and per-cell investigations

The user chose ten 30–60 km town-to-town legs for new journeys only.
Route v2 is generated server-side from named OSM city/town nodes within
60 km, with exact great-circle distance checks, no repeated town and a
20 km separation from previous stops. A deterministic seed ranks directional
continuity and distance near 45 km, choosing among the first three candidates.
No backtracking or road routing is performed: sparse islands, borders and
dead ends can fail explicitly. This is not a promise of a walkable land route.
The streamed global grid, not separate destination maps, locates all stops.

Town and optional public-venue catalogues are cached by coordinate/query kind.
Overpass Germany and Kumi share the existing source lock/cooldowns; the bounded
trail-job queue shares the map executor. New journeys poll the same seeded job,
support cancellation and create state/tarot/save only after successful validation.
Old v1 routes retain their original coordinates, facts and five-minute encounter.
New starting maps no longer need ten local named POIs.

These small bounded catalogue queries use supported HTTP GET requests.
Live verification found POST catalogue requests failing with HTTP 500/502,
while the same query succeeded via GET; bulk map geometry keeps its existing
request path. Provider fallback and explicit failures still apply.

The cell menu forwards to existing food, music, survival and rest commands,
preserving availability/cost rules. Only exact v2 target cells offer parent
investigations. Four choices rotate across three sets; seven artifact/dialogue
forms currently exist, not all brainstorm suggestions. Each uses a distinct
presentation and explicit time/fatigue/extra-calorie cost; buying a note adds
0.25 local meal units. Basal metabolism and night exposure still apply.
Exhaustion wins over discovery/reunion, and invalid/unaffordable actions throw
before payment. No random clue failures or clue theft were added.

On alternating destination towns, an accessible named library/cafe/restaurant/
theatre node within 2 km can provide a venue-only lead. Missing venues do not
invent one; provider failure remains an explicit generation failure. The saved
pending discovery keeps the current stage active until a separate directions
action is paid. The UI hides the next city, distance and map link meanwhile.
Resolving advances once and records the original clue form plus directions.

Photo discoveries use the existing content service/cache for one geographical
image near the destination, excluding species illustrations. License, author
and source accompany the image; the fictional annotation is separate from
the original. Provider/image failure is shown without blocking the text clue.
Fictional objects and speakers are not claims about the sourced real venue.

Browser checks used an isolated temporary v2 save, restored the original save,
and verified four choices, a photo-provider failure, venue-only redaction,
30-minute photo cost, additional 15-minute directions cost, single advancement
and non-target cell rest without clue advancement. Network fixtures are not
evidence that the public town/photo services are currently available.

## Startup must not expose an empty playable map

The new long-route request could fail before state/stream creation while
the UI already considered the journey active. That left a map without a
player and disabled movement. Startup now stays in preparation until the
first player chunk is loaded. It shows progress and cancellation, disables
duplicate starts, and reports failure in preparation with Start/Resume usable.
Returning to title cancels startup. Failed/cancelled generation preserves the
existing save. Browser checks used page-local in-memory storage to verify
provider failure, cancellation, legacy resume, a visible @ and a 250 m move.

## Visible single-key button shortcuts

Shortcut captions are appended as a separate parenthesized span. Refresh
ignores its own text mutations, so localization/state changes replace labels
without accumulating suffixes or triggering an observer loop. Tooltips use
the unadorned action; aria-keyshortcuts describes the primary single key.
Alt+Shift physical-code aliases remain accepted for compatibility.

Unmodified letters follow the typed keyboard layout, with existing physical
codes retained for non-letter/special keys and legacy aliases. Ctrl/Cmd,
IME composition, edit controls, hidden/disabled actions and key repeats remain
excluded. The active dialog captures its own shortcuts before gameplay.
Shared cell/town/toolbar services and dynamically rebuilt investigation buttons
have stable explicit bindings; other dynamic choices keep numbered keys.
Begging uses A to avoid conflicting with street music B in the cell menu.
Browser checks verified Enter, C, Escape, F and R end to end, including
one suffix per button and the same R action in the toolbar and cell dialog.

## Real-map origin preparation activity (R-059)

Origin jobs expose thread-safe progress snapshots through the existing 202
polling responses. A separate progress lock avoids blocking snapshots on the
origin/download locks. The downloader emits real provider attempts, cooldowns,
fallbacks and subdivision events; only actual map HTTP attempts increment the
counter. Cached reads do not. Origin preparation reports location lookup,
geometry parsing, rasterization and cache writing. Snapshots are cleared when
the worker succeeds or fails.

The starting-point UI translates snapshots in FR/EN, keeps the existing spinner,
and updates elapsed waiting seconds while polling. Request totals are variable,
not a percentage. Cancellation aborts polling, clears its clock and prevents
late progress from replacing a new selection. Server work can finish and cache
its result after the browser stops waiting, as before.

## Retry and activity feedback for long-route preparation

TownTrailStore retries each uncached catalogue up to three provider rounds.
Each round uses the existing Germany/Kumi fallback and shared cooldowns;
sleep occurs outside the source lock so other workers are not blocked by
the retry delay. Final SourceUnavailable is propagated, not converted into
empty town data. Successful catalogues survive a failed later stage.

The route store exposes a thread-safe progress snapshot while its bounded job
is active. ChunkJobs includes it in 202 responses only for stores supporting
progress; other job payloads remain unchanged. The snapshot contains stage,
phase, provider or retry deadline, not destination names. The client polls
as before, translating actual activity and computing a retry countdown from
the server deadline. Progress is cleared on job completion/failure and reset
on client cancellation. No guessed percentages or synthetic activity rotation.

A real Firmi route was validated against the frontend geographic validator:
ten towns, 479 km total, every leg 30–60 km, with sourced public venues.
Both public providers failed on earlier attempts; cached catalogues allowed
a later attempt to complete. This is not an availability guarantee.

## Offline catalogue replaces online route preparation

The user selected a bundled European town catalogue after repeated public
Overpass failures. The old cold-cache path needed ten town queries plus five
optional venue queries, potentially up to six HTTP attempts per catalogue
with two providers and three retry rounds. More public providers would not
remove this architectural dependency or provide an availability guarantee.

The current default TownTrailStore uses LocalTowns: a 1-degree spatial index
over an attributed GeoNames subset (38,081 populated places, population >=2,000).
The 768 KB gzip is bundled; prepare_town_catalogue.py refreshes it from the
licensed cities500 daily extract and applies the existing European filter.
Exact spherical leg validation happens after a conservative bounding lookup.
For each leg the seeded RNG generates a coordinate 30–60 km away, within
60 degrees of the current heading, then selects the nearest eligible town.
Revisits, separation, global-grid bounds and source metadata remain enforced.
No backtracking or pedestrian/land connectivity verification is added.

New routes make zero external requests and no optional venue calls. They
record generation statistics and show the ten local searches/zero requests
in the journal, with GeoNames/CC BY attribution. Optional POI enrichment is
deferred rather than assigned fabricated data or made a startup dependency.
Map streaming and other online services remain unchanged and can still fail.
The online catalogue path remains tested, with actual request/cache counters
in progress snapshots, but is not used by default for new journeys.

Version 2 accepts either the existing OSM ID or a separate positive geonameId;
GeoNames stages must cite GeoNames and cannot also claim an OSM ID. Map links
use coordinates for GeoNames, original OSM object URLs for existing saves.
Saved OSM/v1 routes are never regenerated. New Tahiti routes fail explicitly
outside Europe; existing Tahiti saves still bypass generation and resume.

## Layer 9 - immutable server-created journey beginnings

First milestone only: POST /api/journeys takes region, normalized name and a
client UUID used solely for idempotency. The server chooses the random seed,
starting tarot and timestamp, generates the existing offline ten-town trail,
and atomically saves the complete initial state and pinned survival/economy.
The versioned SQLite store is in .cache/travel/journeys.sqlite3. The same
request returns the same record across retries and process restarts; changing
its name or region returns 409. Failed generation rolls back and reports the
cause, without creating a substitute trail. No ongoing gameplay is uploaded.

An opaque server UUID identifies the immutable beginning. GET by UUID returns
it; no listing endpoint is provided. Keep UUIDs private: the private-preview
API has no user accounts, and possession allows reading the name and route.
Both ID and server-owned seed/content digest are carried in local saves.
Legacy states without that metadata remain valid and never call creation on
resume. The deliberate pricing-only refresh on resume is unchanged.

Each record pins a SHA256 content version over rules, map identity/source,
generator sources and bundled town catalogue. SQLite schema and record
versions are checked; checksums detect payload corruption. This is detection,
not authentication or a backup. The database survives service restarts on the
VM's persistent writable directory, but is not protected from disk/VM loss.
Capacity is bounded to 1,000 beginnings, including cancelled creations, and
exhaustion is reported rather than deleting player records. Request bodies
are bounded, JSON-only, and cross-origin browser creation is rejected.
These safeguards do not replace authentication/rate limiting before public use.

Python owns initial-state creation because the game server runs Python; the
browser independently verifies it with the existing JavaScript constructors.
A cross-language test covers every one of the 22 starting tarot cards, so
character formulas, wallet, UTC day and initial resources cannot silently
drift. Browser validation also checks the full local-save schema and the
selected map/name before activation.

The browser reuses its request UUID after transient failure or cancellation
within the same page, and ignores late/cancelled responses. A page reload
before local autosave loses that pending request; abandoned beginnings remain
on the server. The first chunk must still load before replacing a local save.
Full cloud resume, user accounts, parent motives/timetable/mobility, actual
walking routes, three accessible clues per leg and the solvability simulator
remain pending. Existing 30-60 km legs are straight-line distances only.

## Protected-preview gameplay recovery

- Locals' fictional hospitality uses existing need/time/sleep actions, not
  mapped lodging. One deterministic attempt per OSM settlement and UTC day,
  saved locally; birth/daily tarot affect risk, outfit/reputation deferred.
- Night rest now recovers half the normal fatigue before outdoor exposure.
  Resume migrates only this approved coefficient via restRuleVersion, not
  the rest of a journey's pinned economy. Forecast and action share a helper.
- Existing original terrain footsteps play once on successful movement through
  the shared audio controls. Calendar and clock follow simulated UTC only.
- Copy coordinates uses the selected cell center, like inspected cell content;
  clipboard failures are visible rather than a success-shaped fallback.
- Idle prefetch now covers all eight neighbors with the existing bounded
  stream and transient-error cooldown. This does not fill unmapped land.
- Engins investigation used the live cached OSM snapshot, not the map's
  background color. Seven incomplete multipolygons were skipped. Fetching
  their full public relation geometry changed its five plain cells to forest.
  Primary downloads now complete missing land-cover members (bounded at 16;
  otherwise recursive fallback). Reject incomplete fallback geometry and repair
  old external sources. Fingerprint fetch logic as well as rasterizer code.
  Prepared starting snapshots retain offline behavior; unmatched coverage may
  still exist. No grass/field inference or unlimited area prefetch is added.
- Packaging now requires committed runtime and embeds its commit in
  public/release.json. Tag and verify every deployment before announcing it.
- Validation: 193 JavaScript and 109 Python tests. Browser check: hosted night
  took 510 minutes, advanced the UTC agenda, and disabled another town/day
  request. The 375px layout fits; clipboard denial is visibly reported in the
  automated browser (which cannot grant focus/clipboard permissions).

## Settlement meals and audible street music

Meal catalogue coverage is not food availability. A paid fictional 900-kcal
basic meal is now available on every loaded settlement cell, including Engins,
using the existing price/time/need rules. Specialty selection remains sourced.
Mapped public active food venues add named options with OSM links, without
claiming real menu or service availability. UI and purchase validation share
mealOptions, so stale venue IDs cannot buy a remote meal. Legacy economies
need no catalogue migration and still offer basic food.

The rhythm minigame previously deliberately silenced background music but
had no audio implementation. It now owns an original synthesized melody,
bass and offbeat accompaniment through Web Audio, timed on beatTime rather
than an unsynchronized downloaded music track or render interval. Tap
feedback distinguishes hits/misses. Shared mute/volume do not affect scoring.
Session tokens prevent cancelled asynchronous unlocks from restarting sound;
all scheduled oscillators stop on exit/finish/hidden tab. Explicit audio errors
leave visual play possible. Browser validation observed a running real audio
context and all 24 scheduled melody/accompaniment voices; basic meal purchase
updated wallet, reserves and game time. Automated checks cover exact beat
times, latency, cancellation, silence controls and food/venue validation.

## Simple controls popup

User chose a shortcut/usage popup instead of guided onboarding. Controls
opens at the first preparation in each page visit; the header button or ?
reopens it. Native modal semantics provide focus and Escape/close behavior;
20 rows remain scrollable at mobile width. Keys come from buttonBindings,
not a second hardcoded key map. Explanations distinguish rest from sleep,
Look from walking, and contextual actions. Dialogs keep their own printed
shortcuts; typing does not trigger controls. No game time, save migration,
persisted preference or larger tutorial system is added.

## Fatigue collapse and next-layer priority

Reaching 100 fatigue is no longer a terminal outcome for active journeys.
All gameplay action finalizers resolve the collapse before saving: eight
game hours in the same cell, exactly 40 fatigue afterwards, ordinary sleeping
metabolism and sleep-pressure recovery, no meal or ordinary sleep count.
Night exposure minutes remain counted; recovery to 40 includes that exposure
fatigue. The game has no separate cold-death model. Hunger remains fatal,
including during unconsciousness. Existing ended fatigue saves stay ended.

Location and the existing birth/daily tarot risk multiplier determine
fictional money theft (base 30% in settlements, 15% elsewhere, 5% sheltered).
A deterministic draw keyed by journey, action time, position and collapse
count prevents replaying a pre-action save to reroll theft. Loss is 25--50%
of carried money, rounded to cents and capped at half. Save the latest event
and count; validate duration, coordinates, probabilities and monetary bounds.
No inventory theft or free resources. Collapse interrupts rewards, clue
progression, performances and hospitality rather than finishing them after
waking. FR/EN needs notices explain collapse and the resolved loss.

The agreed Layer 9 routing direction is bounded A* on the existing game
grid, preserving town selection and free exploration, with persistent hidden
paths for later hints. This remains queued, not deployed or marked complete.
After Layer 9 the user explicitly prioritizes Layer 15 (photos and journal),
not sequential implementation of Layers 10--14.

Validation: 212 JavaScript tests, including deterministic replay, monetary
bounds, hunger during unconsciousness, night exposure, interrupted actions,
legacy ended saves, strict saved-event validation and notices. Browser
movement triggered a real collapse: 491 total minutes (11 walking + 480
unconscious), fatigue 40, one persisted event and a displayed 10.32 EUR loss
at 30% risk; no terminal state or movement-finalizer error. The notice waits
for existing modals to close. The browser test's prior local save was restored.

## Keep food-search feedback visible

The user reported that food-search outcomes were hidden at the bottom of the
cell-actions modal. Result and error messages now sit below its heading and
close button, above the action list. After an action, focus and scroll the
new result (or explicit error) into view without closing the modal. Keep
status/alert semantics, hide empty messages and preserve action costs/rewards.

Four regression tests cover FR/EN results, error priority and actual markup
order. Browser validation in a 320px-high scrolling modal started at the
bottom, performed a real food search, and confirmed the result was visible
and focused. No saved journey was changed by this UI-only test.

## Stable grid caches, save confirmation and bounded parent paths

Live investigation confirmed both unfinished Paris downloads (OSM quota and
Overpass failures) and excessive invalidation: the old grid identity hashed
the entire travel server and downloader. A fetch/API-only release could make
every completed grid look missing. The new identity hashes geometry, elevation
processing, source naming, chunk building, rasterizer and map rules, not
unrelated handlers or transport code. Rasterizer changes still invalidate.
The explicit migrate_chunk_grids script accepts an exact operator-approved
compatible old hash, verifies checksums/bounds/chunk dimensions and copies
completed grids into the new identity with no provider calls or rasterization.
Do not use it across real geometry/raster-rule changes.

Manual Save now shows an accessible fixed confirmation with actual saved
time, explicitly browser-local. Errors use an alert instead. The same button
handler covers S; repeated saves reannounce, gameplay autosave/reset clears
the old manual message. Three unit tests and browser success/error/viewport
checks verify the behavior without replacing an actual journey save.

Parent paths use bounded four-neighbor A* and the same reference-walker
terrain/slope costs as travel.mjs (1,944 cross-language cost cases). Search
stays in 8/16/32-cell widening corridors, at most 50,000 expansions, 256
loaded chunks and 96 preparations, with a 180-second inter-request budget.
One independent worker, at most two jobs; immutable genesis and SQLite write
transactions remain untouched. Completed point sequences and source identity
are checksummed on disk by journey/stage, with shared reuse for equal
source/endpoints. Retries keep prepared terrain; errors never become invented
straight lines. Missing elevation is explicit, using normal no-slope rules.

To avoid competing with map downloads during the user's Paris tests, path
preparation is opt-in from the journal. It reports real counters, a reference
distance/time and errors/retry; no geometry is sent to the browser. Browser
UI validation used a mocked completed response; Python tests exercise actual
A*, corridor widening, Dijkstra optimality within a corridor, real prepared
Firmi terrain, persistence/restarts, limits, HTTP and cache reuse. No distant
30--60 km live path is claimed validated yet. Full Layer 9 parent narrative,
chronology, false branches and solvability remain unfinished.

Combined validation: 224 JavaScript and 126 Python tests pass. Repeated live
Louis Blanc API checks served all nine cached chunks in 0.44 seconds total,
without new terrain requests. The deployment must migrate the exact current
pipeline before restarting, then recheck those cells; preserving the cache
directory alone is not sufficient when changing its lookup identity.

### Cached neighbors must bypass slow preparations

The next screenshot exposed a separate client queue issue. Live requests were
for Paris chunks x=4..6, y=-3..-1, not the Louis Blanc x=0..2 area checked earlier.
Several had no historical grid/source at all; OSM HTTP 509 delays were real.
However, cached neighbors also waited behind two uncached chunk polls in the
browser's two-slot queue. Direct cache API latency alone did not verify the
player's complete loading experience.

A bounded, cache-only batch endpoint now reads at most nine specified chunks
without scheduling jobs or contacting providers. The browser restores available
neighbors before queuing missing chunks, and can repeat this lookup while both
download slots are occupied. Existing checksums, 25-chunk browser limit,
two-preparation concurrency, errors and retry behavior remain in place.
Responses are validated before any partial restoration; restored elevation
warnings use the existing notification path. Missing cells still need providers:
this is not a guarantee of instant first-time terrain.

Regression tests hold both downloads unresolved and assert that cached
neighbors render, including a new neighbor after a viewport update. HTTP tests
assert cache misses neither build terrain nor enqueue jobs, and reject oversized
or invalid coordinate batches. This handler-only change does not change grid
identity or require cache migration.

### Rotating live OSM sources while respecting provider limits

Map requests now start after the last selected provider, rotating through the
OSM map API and the two existing Overpass instances. Town/venue catalogues rotate
through their two Overpass providers too. Rotation is serialized under the
existing shared provider lock, attempts each source at most once per request,
and skips cooling providers without HTTP calls. Map and catalogue requests
share the same per-provider cooldowns. Catalogue HTTP failures now honor the
existing Retry-After parser instead of always applying 60 seconds.

Tests cover repeated healthy rotations and wraparound, fallback cursor
advancement, skipping until cooldown expiry, catalogue/map shared cooldowns
and zero network requests when every provider is cooling down. Existing
snapshot provenance, completeness checks and terrain identities are unchanged.
This distributes requests; it does not make public APIs reliable or permit
quota evasion. Geofabrik regional extracts and BBBike custom extracts are
better candidates for a future local-data importer, not live API replacements.
No regional download, import dependency or new service is added here.

### Hospitality outcome beside the action

Safari save inspection found an actual refused request in the current Paris
journey, not shared history from another journey. Its recorded UTC day was
19 October, while the later saved time was 20 October: those exact values do
not block another request. The user then confirmed the warning appeared after
pressing 1 or clicking hospitality once in a new town. That immediately performs
the 30-minute request; the UI replaced the explanatory note with the daily lock,
while its separate outcome could be out of view.

The current town/day outcome now appears directly beneath the hospitality
button, before the daily-limit explanation, with status semantics. After a
request it receives focus and scrolls into view. The separate historical result
remains for other towns/days without duplicating the current outcome. No history
is deleted, no new confirmation or gameplay rule is introduced. Tests cover
visible refusal, read-only menu opening, another town and the user's exact
previous-day timestamps in both languages.

The user's subsequent new-town test confirmed the request worked but the
daily-lock wording remained ambiguous. Refusal now explicitly says the attempt
failed and no sleep occurred. The lock explains that even a refusal consumes
the single town/day attempt, and offers the next UTC game day or another town.
French and English assertions cover these explanations; probabilities and
hospitality history are unchanged.

### Parent-story milestone under validation (not deployed)

The user chose to finish Layer 9 before Layer 15, and explicitly allowed
extra towns for a moving parent. New genesis records can now carry deterministic
fictional facts: an arcane-weighted motive, orientation, travel mode, coherent
backward chronology, September harvest season, town nights/provisions, four
alternative clue methods per stop, one to three optional resemblance leads
yielding a contact, and one or two optional lore crossovers.

Moving stories preserve the original ten waypoints and append three sourced
30--60 km towns. Continuations are generated at genesis, not during play.
The parent leaves town ten after seven game days, then advances again at
fourteen and twenty-one days, and waits at town thirteen. The child may finish
at any of those four towns if it catches up. Zero-cost alternative clue methods
avoid skill, photo-provider and unique-object dependencies; false leads do not
consume the main clue. Fictional visit facts are revealed with discoveries,
not as a full GPS trace. The journal explicitly labels narrative purchases
and nights as fiction rather than real venue transactions.

Generation retries use up to three derived seeds, preserving the immutable,
idempotent SQLite transaction and checksums. Story data and generator code enter
the content fingerprint. Existing records without stories are neither upgraded
nor rerolled. Save validation covers chronology, ownership, mobile timing,
optional-lead progress and early reunions with unused continuation towns.

This is not full Layer 9 completion: narrative validation deliberately reports
`terrainValidated: false`. Long-leg terrain validation, a true survival-budget
simulation, route-positioned parent nights/purchases, motive-guided destination
selection, aging witness precision and richer witness/biography templates remain
open. Existing manual path preparation remains opt-in to avoid competing with
the player's live map downloads.

Validation of the narrative checkpoint: 236 JavaScript tests passed, including
Python-to-JavaScript genesis for all birth cards and exact save roundtrips.
Python ran 134 tests: 132 passed, two existing photo-configuration assertions
failed after the concurrent user commit changing max_per_cell to 10 while the
exported browser config and assertions still expect 5. That configuration is
not changed here. Browser validation created a real local mobile genesis
with thirteen sourced towns and displayed the first three discovered visits
in French and English, without downloading terrain. The narrative checkpoint
remains undeployed and is not a full Layer 9 completion.

### One-cell town arrival tolerance

The Cuise-la-Motte screenshot showed one cell south remaining and 0.2 km to
the geographic point, while the player was already in town. This was a strict
cell-equality gate, not demonstrated numeric rounding corruption. Modern
town trails now accept the target's 3 x 3 neighborhood (up to 250 m per axis).
All clue access, free guidance and journal arrival messages use that same
helper. Two-cell offsets remain outside; legacy local trails remain exact.
No target or save coordinate is rewritten. Regression tests exercise every
offset in a 5 x 5 square, successful clue save/resume at each accepted offset,
both hint languages and the old exact-cell rule.

### European dishes and fictional shelter at places of worship

The curated meal catalogue grows from four to nineteen entries, with additions
in fifteen European countries. New regional and national entries require one
confirmed country plus geographic bounds. National dishes are labelled as
country traditions, not a particular town's specialty. Source links include
national tourism sites and Wikipedia; descriptions are short original summaries.
There is no live web discovery or claim that a real restaurant serves the dish.
On resume, an explicit catalogue refresh adds missing IDs without replacing
pinned meals or changing survival rules, tarot, balances or progress.

Mapped active current-cell places of worship now offer fictional hospitality,
across religions and outside named settlement cells too. The user chose the
existing 30-minute request and tarot-adjusted chance, immediate free sheltered
sleep if welcomed, no food, and one request per place per UTC game day.
Private/inaccessible, abandoned and disused POIs are excluded. An OSM building
tag alone is not evidence of a place of worship or accommodation. Relations
are accepted by the action/save validator if supplied as POIs, but the existing
map extractor currently supplies nodes and ways only. No cache regeneration
or new provider request is needed for already mapped eligible POIs.

Worship outcomes are stored in existing hospitality history with an optional
place-kind marker; legacy town records remain valid. They appear immediately
under the disabled action with focused, visible FR/EN feedback. Text clearly
separates fictional shelter from actual religious communities or real lodging.
Layer 15's future journal requirements include these events.

Validation: 42 focused tests pass; the isolated release based on live town-arrival
code passes all 242 JavaScript tests using the existing Python environment.
Browser checks at 320 px verify focused, fully visible refusal feedback with
no sleep/time ambiguity, plus regional and national meal scope/source labels.
The development worktree's wider tests remain blocked by the user's unrelated
uncommitted configuration lacking its map section; it is left untouched.
No unfinished Layer 9 narrative code is included in this isolated release.
The twelve existing map-pipeline Python tests also pass with the clean release
configuration. Static-only runtime `5f9e70a` is deployed and verified by exact
HTTPS asset comparison; no server restart or map-cache invalidation was needed.

### Lightweight Layer 9 narrative polish; advanced simulation deferred

R-083 supersedes the earlier requirement to finish all advanced Layer 9
simulation before moving on. Whole-route terrain validation, survival-budget
simulation, route-positioned provisions/nights and motive-guided destinations
are retained for later, not claimed complete or made current release gates.

Discussion clues now use three deterministic witness voices based on journey
start and witness identity. With existing story dates, memories become less
precise at seven and thirty elapsed days since departure. This affects wording
only: the known destination or pending venue is always explicit. Pending clues
still hide the next town. Written/photo clues, costs, route facts and saves
are unchanged. Legacy journeys receive voice variety but no invented dates,
motives or visit history. Memory wording reflects the current game time when
reading the trail; it is not presented as a verbatim timestamped transcript.

Discussion results and their journal history share the same formatter. Story
summaries explain why the parent left, and discovered visits clearly separate
historical arrival/departure and provisions from a current parent location.
Exact fictional story dates are not attributed to uncertain witness memories.
Only discovered visits are shown; no future itinerary is exposed.

Validation: all 26 focused story/trail/action tests pass, including exact aging
thresholds, stable voices after reload, all three voices, FR/EN clues, legacy
compatibility, document clues and pending-venue information gates. Browser
checks exercised FR/EN testimony, discovered-only records, legacy section
hiding and no premature next-town disclosure. The isolated release passes
all 243 JavaScript tests with the clean live configuration.
The development full run before the final portable regression test passes
244 tests but its genesis file fails because
the unrelated user configuration does not load; it is not modified here.

The small release updates presentation only. It does not activate the pending
server story generator or rewrite old beginnings: existing live journeys show
varied discussion dialogue; dated memories and motive/visit presentation are
available when a journey already carries story facts.
Presentation runtime `7832ea9` is deployed, with exact HTTPS comparisons of
all four changed assets and the manifest. The travel API and both services
remain healthy without restart. The server generator remains unchanged.
