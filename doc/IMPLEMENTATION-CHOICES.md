# Playable checkpoints, choices and open questions

This document records the unattended work requested after Layer 3.
The design PDF remains the reference; additions are tracked in REQUIREMENTS.md.
All survival numbers below are gameplay approximations, not medical advice.

## Testing checkpoints independently

- Existing Layer 3 baseline: commit `6bbe4c4`.
- Layer 4 checkpoint: Git tag `layer-4-needs` (created after validation).
- Layer 5 checkpoint: Git tag `layer-5-towns`.
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
7. Layer 7 street music, Layer 8 parent trail, saving, and later geocache
   dungeons remain unimplemented, not hidden behind success-looking buttons.
