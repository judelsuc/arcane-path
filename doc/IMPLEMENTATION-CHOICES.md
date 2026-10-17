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
- FR is explicitly associated with the euro-area observation, not a fabricated
  France row. PF has no observation. Missing/ambiguous map country or missing
  index uses a reference tariff with visible explanation. Country display
  remains exclusively map-derived; food location boxes never set country.
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
   the explicit reference-tariff warning when map country is absent.
3. Purchase: purse -6.19 game EUR, clock +20 minutes, hunger reserve recovers.
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
  content/persistence need a separate design and playable checkpoint.
- Confirm whether the parent should already move, which profile/biography
  choices belong to character creation, and whether local starts should remain
  a short tutorial before a larger trip.
- Define saves/autosaves and how a daily tarot draw is persisted, before
  introducing consequences that must survive reloads.
- Night events/survival minigames remain deferred to the Events layer, as
  explicitly requested. The daily tarot/risk data are foundations only.
- First-pass budgets, 900-kcal meals, lodging multiplier, exposure penalties
  and rhythm difficulty need playtesting rather than claims of realism.
