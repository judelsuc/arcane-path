# Requirements tracked outside the design PDF

## R-170 - Game version and changelog in Options

- Display the semantic game version and a readable French/English changelog
  from tracked release notes in Options, with each entry's version visible.
- Separate the game version from the deployment metadata schema version.
  Show the packaged commit and UTC date when deployment metadata is valid;
  never imply that a local build is the production deployment.
- Report unavailable files and network, HTTP, parsing or validation errors
  explicitly; bound metadata requests to 15 seconds. Missing optional deployment
  metadata may indicate a local build, not a confirmed deployment.
- Keep release notes limited to delivered features, with no invented dates.
  Preserve keyboard navigation and a readable mobile layout.
- **Status:** Implemented in Options with versioned bilingual notes and
  generated deployment metadata; shipped with the notebook-rumour release.

## R-169 - Lore in ordinary journeys and progress-preserving migration

- Integrate and deploy the lore, shared discovery, broader dream selection,
  power-aware gameplay and lore routing in normal journeys. A separate
  artifact playtest does not satisfy this requirement.
- Approved migration policy: preserve existing progress through an explicit,
  one-time migration into server authority, rather than restarting at genesis.
  Keep immutable genesis, capabilities, inventory, companion, reached stages,
  events, notebook and current survival/economy state.
- After migration, ordinary actions and artifact custody must use the same
  authoritative timeline with revision checks and replay-safe command receipts.
  Do not merge a second simulated journey back into the player's local save.
- Preserve ordinary weather, transport, activities, journal delivery and ending
  behavior. Cover streamed terrain and arbitrary supported starting regions;
  do not silently apply the playtest's single-region/six-settlement restriction.
- Migration and the full normal-game integration are not implemented or deployed
  yet. Existing isolated playtest powers are not evidence of completion.

## R-168 - A visible companion in the main interface

- Show an adopted dog's icon and name alongside the player's persistent status.
  Change the dog's expression as its actual saved needs change; clicking the
  status opens the existing companion-care controls.
- Use the existing hunger/care model, not an invented independent health stat.
  Below 20 in both needs: well; either need at least 20: attention; either need
  at least 65: urgent care and existing companion bonuses suspended.
- Include localized condition text and accessible descriptions, not colour
  alone. Hide the control when there is no adopted dog; respect action blockers.
- Reflect adoption, time spent, feeding, care and resumed saves without changing
  needs on reload or introducing real-time decay.

## R-167 - Idle-server expansion of the OSM cache (future)

- When the server is mostly idle, progressively cache additional OSM coverage
  in the background, starting at the edges of already cached map areas and
  expanding outward into neighbouring uncached areas.
- Run server-side without requiring an open browser or player movement.
  Reuse existing cached sources and chunk identities; deduplicate work against
  foreground downloads and other background jobs. Preserve existing journeys,
  cached terrain and immutable journey genesis.
- Player requests take priority. Pause or yield speculative work when the server
  is busy or foreground map preparation needs resources.
- Respect provider usage policies, rate/concurrency limits and shared cooldowns,
  including Retry-After and backoff. Idle CPU is not permission to bypass an
  upstream limit. Do not purchase a service or incur new paid usage implicitly.
- Bound disk growth, download volume and background resource use. Persist
  progress so restarts resume from cached coverage rather than repeat downloads;
  expose progress, failures and pause reasons to operators.
- Define measurable idle thresholds, expansion order/coverage boundaries,
  storage/request budgets and enable/disable controls before implementation.
  OSM expansion must not implicitly increase elevation-provider traffic.
- Requirement recorded only; not implemented, enabled or part of the upcoming
  gameplay release.

## R-166 - Epic end-of-journey chronicle

- Approved for the upcoming release: automatically prepare one FR/EN closing
  chronicle when the character dies or reunites with their parent.
- Epic but faithful: bittersweet, gentle and non-graphic on death, warmly
  triumphant on reunion. Do not invent achievements, people, places or events,
  reveal hidden stages, change the ending or grant gameplay effects.
- Submit an allowlisted terminal outcome, bounded numeric journey counters,
  reached-stage indices/times and retained intermediate-event types/times.
  Resolve reached place names and fixed event facts on the server; weave those
  étapes and encounters into the narrative in known game-time order.
  Exclude private names, notes, photos, coordinates, unvisited destinations and hidden parent fiction.
  Client counters describe locally recorded play, not server-certified history.
  State that retained events may be partial; do not invent unknown legacy times,
  associate events with towns without evidence, or turn impressions into facts.
- Show the chronicle alongside the authoritative ending, with AI/fallback status.
  Provide immediate authored summary while pending, disabled, local-only or
  failed. Never block restart, save, notebook access or gameplay behind generation.
- One durable provider attempt per journey/keeper, no automatic failure retry;
  rereads/resume reuse the earliest saved chronicle across prompt revisions.
  Ongoing journeys, abandonment and placement do not trigger it.
- Include available generated text, otherwise authored text, in the existing
  notebook publication flow. Never wait for generation or silently republish.

## R-165 - Public agenda and paid transport in normal journeys

- Approved: main-journey agenda with public-source links and active local
  notices, no invented entry fees, rewards or attendance mechanics.
- Search explicitly around the current player cell; disclose rounded event
  coordinates sent to the provider. Preserve simulated journey dates; never
  shift current publications into a past journey. Retain provenance, freshness,
  limited coverage and explicit errors. Save encounter acknowledgements.
- Approved: coaches at real town centres and real services at their mapped
  stop cells. Reuse the canonical timetable/hybrid reducers, real dated loaded
  snapshots first and clearly labelled fictional town links where uncovered.
  This does not implement a live nationwide GTFS downloader.
- Show nearby access points, actual departure/arrival UTC dates, waiting,
  duration and estimated game fare before explicit confirmation. Charge once
  at boarding; free cancellation only before boarding. A missed real service
  must not generate a replacement fictional service.
- Advance only by player action, at most 30 simulated minutes per command
  settled minute-by-minute through existing awake survival/pressure rules.
  Hunger, fainting and care interrupt before the next-stop displacement.
  No walking-distance credit, sleep or fatigue recovery for riding.
- Persist the pinned timetable/booking and validate on resume. Load the
  destination map before landing. Keep vehicle links distinct from walking
  traces and never claim supplied stop sequences are verified road geometry.
- Include R-158 in this release with explicit new-story name opt-in, generic
  original flavour only and no regeneration of existing stories.

## R-164 - Pinned photos on the journey path (future)

- Show pinned journey photos on or alongside the player's journey path,
  associated with their recorded locations.
- Keep the existing photo journal and let the player identify/open the
  corresponding pinned photo from the path presentation.
- Decide the visual treatment later (markers, thumbnails or previews),
  including overlapping photos, mobile readability and accessibility.
- Do not reveal unvisited locations or hidden parent stages. Define how to
  handle older photos without usable location metadata before implementation.
- Requirement recorded only; not part of the rescue-dream deployment.

## R-163 - Rescue dreams for a traveller who has lost the parent's trail

- A completed deliberate sleep lasting at least 60 minutes permits one check
  at sleep start plus 60 minutes, at most once per 720 journey minutes.
- **Revised delay:** no lost-traveller dream until 2,880 journey minutes
  (48 game hours) since the latest new parent clue/progress. Every new clue,
  arrival, stage discovery or successful guidance dream restarts the delay.
  Existing recorded progress supplies the timer on resume; duplicate collected
  clues and failed searches do not reset or bypass it.
- Once the delay is reached, the next qualifying sleep gives guidance.
  Remove early random opportunities and the three-failure shortcut; preserve
  historical saved dream/miss records without replaying their popups.
- Give only an eight-way bearing from the sleeping location toward the current
  stage. Do not reveal its name, coordinates or future stages, promise a
  traversable route, or teleport the player.
- Display a bilingual popup after other active dialogs and retain successful
  dreams on their stage's trail page and in the notebook. Explain the rules in
  sleep choices. No additional time, money, fatigue or energy cost.
- Include outdoor, shelter, hotel and accepted hospitality sleeps; exclude
  ordinary rest, fainting, detention, care and interrupted/terminal sleeps.
  Existing journeys remain compatible; no historical popup replay on resume.
- Optional content-factory wording adds three cached FR/EN dream introductions
  per journey/keeper, rotating on successful dreams. Send only a fixed public
  dream brief, never names, route, location or clue history. Always retain the
  game's authored directional guidance; generation cannot change eligibility.
  Show generation/fallback status, keep an open dream's wording stable, and
  reuse durable results without automatic provider retries or regenerating
  existing event/NPC/opening text. Retain authored text when unavailable.
- This bounded guidance does not activate the unpublished lore playtest or
  artifact dreams.

## R-162 - Varied cached event introductions and truthful status

- Generate three distinct bilingual introductions per ordinary event type
  and journal owner, in one bounded provider call; rotate the cached versions.
- Preserve event facts, numerical effects, card rules and all authoritative
  outcomes. Persist only the chosen presentation index on new event records.
- Keep the open introduction fixed while reading; identify explicitly whether
  the displayed introduction is authored or AI-generated, including its version.
- Preserve historical caches, existing opening stories and hospitality wording.
  Authored fallback remains available on pending/disabled/failed generation,
  without automatic retries or a fresh model call at every encounter.

## R-161 - Celebrate reaching a parent-trail stop

- Show a congratulations popup on the first recorded arrival at a parent-trail
  stop, naming the reached place and parent, without revealing future stops.
- Offer to open the parent trail or continue travelling. Neither choice
  performs an investigation, advances time, charges money or grants rewards.
- Wait for existing dialogs and busy actions; retain survival/event priority.
  Do not repeat recorded arrivals on revisits or when resuming a saved journey.
- Localize the popup in French and English and preserve the final reunion UI.

## R-160 - More forest and field mini-games (future)

- Add a forest wildlife-photography mini-game: animals appear and the player
  tries to photograph them.
- Add a field sheep-herding mini-game: the player guides a flock of sheep.
- These are future requirements, not enabled gameplay. Detailed controls,
  availability, duration, difficulty, rewards and survival costs remain to be
  designed before implementation.

## R-159 - Current-cell hotel first

- When the player occupies a hotel's cell, show that hotel first in the nearby
  accommodation suggestions and before hospitality/outdoor sleep actions.
- Use exact grid column and row, not distance from the cell centre. Keep
  multiple current-cell hotels together and preserve the order of other offers.
- Apply this to cached/provisional and completed searches without changing
  prices, eligibility, source attribution, travel selection or sleep effects.

## R-158 - Recognizable-name flavour in opening backstories

- In the approved R-165 release, let the text model recognize a well-known
  character or public-persona name entered by the player and add subtle,
  original personality flavour to a new opening backstory.
- The user explicitly chose model recognition of the entered name, rather
  than a local curated matching list. This is an explicit exception to R-151's
  no-player-name prompt boundary for opening stories only. An unchecked setup
  checkbox discloses OVH submission; old saves and non-opted-in stories keep
  names private. The client sends permission, not arbitrary name/prose; the
  server retrieves the immutable saved name.
- Use generic traits in original prose, not copied dialogue, lyrics, signature
  passages or a claim that the traveller is the named character/person.
  If recognition is uncertain, keep the ordinary backstory; do not infer
  sensitive personal attributes from names.
- This changes narrative flavour only. Preserve the saved parent's identity,
  departure motive, child-traveller premise, clues, route, powers and statistics.
- Apply only when generating a new story. Retain already saved stories and
  the existing single-attempt, higher-temperature and authored-fallback rules.

## R-157 - Window background follows journey time

- Use distinct night, dawn, daytime and dusk background colours during travel,
  driven by simulated journey time, not wall-clock time or an idle timer.
- Reuse the existing location/season-aware solar calculation; dawn and dusk
  colours apply within 45 minutes of sunrise/sunset. Preserve polar day/night.
- Tint the window and map surfaces without changing terrain symbols, gameplay,
  weather-temperature colours or readable text contrast.
- Keep the title/setup background unchanged and clear the travel theme on exit.

## R-156 - Content-factory map tile sets (future)

- Extend the content factory to generate map tile sets for the optional map
  skins, including the square pixel-art skin in R-155.
- Generate coherent sets in the chosen palette, not unrelated images for
  individual cells. Keep terrain, roads, railways, buildings and overlays
  distinguishable without changing map data or gameplay.
- Generate a fresh coherent map tile set daily. The scheduling time and
  publication/review policy remain to be decided.
- This is a future requirement: recording it does not enable generation,
  select a provider, authorize spending or replace the existing ASCII map.

## R-155 - Optional pixel-art map skin

- After the pending factory/living-world releases and map fixes, add an
  optional square-icon skin alongside ASCII, not a replacement.
- Use simple pixel-art tiles in the game's palette; existing web tilesets
  are an approved alternative to drawing or generating every tile. Prefer
  clearly reusable assets (such as CC0), verify each pack's licence and retain
  required notices/attribution. Check terrain coverage and readability before
  selecting a pack; fill gaps without implying unsupported map detail.
- Candidate sources: Kenney's Tiny Town and 1-Bit Pack, whose official pages
  list Creative Commons CC0. No pack has been selected or installed yet.
- Persist the choice locally. Both skins share exactly the same grid, terrain, movement,
  player, clues, selection, accessibility and geographic scale.

## R-154 - Sea coverage and aggregated urban blocks

- Recognize open sea rather than blank unmapped land, including chunks without
  a locally closed coastline. Preserve the existing water movement rules;
  the user explicitly chose a display fix, not new swimming restrictions.
- Show substantial mapped-building coverage as urban blocks at 250 m scale.
  Preserve major roads, railways, water and landmarks rather than allowing
  a single small house to paint a whole cell.
- Initial implementation uses a 15% union-of-footprints threshold, excluding
  courtyards and overlaps; expose the sampled coverage in cell inspection.

## R-152 - Daily shared start-page illustration

- Generate one image per real-world day at 05:00 Europe/Paris, independent of
  player journeys, using a server-side scheduled job.
- Rotate imaginary European landscapes and a daily tarot motif in the
  notebook's ink-and-watercolour style. Do not use player data or hidden clues.
- Show the same published illustration to all visitors, with AI/model/date
  attribution. Keep the previous image on generation failure and the authored
  title illustration before the first successful generation.
- Use only the existing verified-free OVH SDXL image endpoint; stop if free
  pricing cannot be confirmed. No paid fallback or automatic same-day retry.
- Persist attempts and completed images; survive reloads/restarts without
  duplicate calls. Retain archived images and log explicit failures.

## R-151 - Varied starting backstory around saved canonical facts

- Generate fresh FR/EN prose explaining the parent
  being sought and their departure, preserving the saved parent name, motive,
  investigation and hidden route.
- User approved starting place name, broad landscape, birth tarot card and
  season as prompt context, not player identity, private notes or future stops.
- Use a higher story-specific model temperature for variety, without promising
  unique output. Persist one story per journey/keeper; no reload regeneration.
- Keep authored text usable while pending or on explicit failure.
- Show the backstory after the starting place/character and birth-card reveal,
  before the first gameplay action, not on the title page. Provide a reread
  action; preserve the cached bilingual story on reload.

## R-153 - Stack player meters directly beneath agenda and weather

- Health, hunger, fatigue, sleep, vigilance and cleanliness meters follow the
  agenda/weather panel immediately, without character, wallet, equipment,
  food, tarot or outdoor-status paragraphs in between.
- Keep those secondary details below the meters, preserving all values and
  actions on desktop and small screens.

## R-150 - Serve the notebook journey map through the preview proxy

- Preserve cache-only terrain lookup and explicit errors; do not hide HTTP 404
  behind a blank or invented map.
- Allow `GET /api/journey-terrain` through nginx to the existing terrain handler.
  Explicitly allow the shared mini-game stylesheet as well; keep private files,
  unknown routes and disallowed methods blocked.
- Installing game files alone is insufficient: the deployed nginx allowlist
  must also be updated, checked and reloaded.

## R-149 - Larger Lost and Found item illustrations

- Enlarge item choice cards and original vector illustrations, including
  close-up inspection. Use two columns on small screens rather than tiny
  compact inline buttons; preserve image proportions and visible details.
- Keep the existing 15-second clock, scoring, keyboard controls and gameplay.

## R-148 - Always-visible vigilance level

- Move the existing live vigilance meter and numeric percentage into the
  player-status overview below the calendar, outside collapsed pressure details.
- Keep a single meter/value pair and preserve the existing thresholds, updates,
  translations and secondary pressure information.

## R-147 - Readable sketch model and final comparison

- Keep the observation model and both final drawings large and equally sized.
  Symbols use 36-52 px rather than shrinking the result into miniature text.
- Stack the two final drawings below 640 px; preserve every coloured cell,
  keyboard controls, observation time, scoring and hidden-model rules.
- Share the styling between the journey host and standalone preview.

## R-146 - Resume in a nearby town after a stay in care

- User selected the nearest named settlement cell in already loaded/prepared
  terrain, not a new online lookup or an assurance of the nearest real town.
- Relocate after the first two placements only; retain the third-placement
  game-over rule, 24-hour care duration, money loss and interrupted-action rules.
- Persist the recovery town separately from the triggering cell. Update the
  pressure sector, map and save; do not add walking distance for the transfer.
- If no named town is prepared, fail the triggering action explicitly without
  applying it, so terrain can be loaded and the action retried.
- Preserve historical placement records without inventing recovery locations.

## R-145 - Fatigue and sleep warning dialogs

- Add warnings analogous to hunger at the existing configured fatigue and
  awake-hours warning thresholds, with localized recovery advice and actions.
- Show once per episode; rearm below each independent threshold. Defer while
  another dialog is open and preserve death, placement, collapse and health
  priority. These are warnings, not terminal fatigue/sleep outcomes.

## R-144 - Expand large mapped sites and their gameplay relevance

- Add cemeteries, airports, stadiums and malls, plus the user-selected hospitals,
  universities, industrial sites, ports/marinas, large parks/botanical gardens,
  zoos/theme parks, castles/major historic sites and exhibition/convention centres.
- The user wants these sites to affect movement or available actions, not just
  decoration. Reuse mapped OSM geometry and provenance.
- **Status:** pending design confirmation and implementation. Walking/access
  rules and which existing/new actions to expose remain undecided; do not
  silently block entire 250 m cells or imply unrestricted real-world access.

## R-143 - Visible cleanliness and washing during sheltered stays

- Reuse the saved 0-100 cleanliness value; show its meter and the existing
  washing button outside the collapsed vigilance panel, below the calendar
  with the other main player-status meters.
- A completed stay in paid non-camping lodging or successful hospitality,
  including worship-place hospitality, restores cleanliness to 100 without
  extra time or payment. Basic shelters and tents keep partial recovery.
- Refused requests and interrupted stays do not provide a full wash.
  Standalone washing retains its existing availability, price and duration.

## R-142 - Start with a vague parent-trail direction

- A fresh progressive journey begins with one uncertain, eight-way directional
  lead towards the first stage, anchored at the saved starting point.
- Show it immediately in the trail guide and first evidence page; retain it
  through movement and save/resume and synchronize it to the discovery ledger.
- Do not reveal a town name, distance, exact destination, route or later stage.
  No search, time, money or resource is charged for this opening lead.
- Preserve known destinations on legacy journeys. Existing search evidence and
  progression rules are unchanged; further precision must still be earned.

## R-141 - Optional live travel introductions and NPC dialogue

- **19 October 2026:** generate brief FR/EN wording through the previously
  tested OVH `Mistral-Small-3.2-24B-Instruct-2506`, using an explicitly enabled
  private server key. No other provider, freeform chat, payment or donation
  feature. Paid calls are authorized without a lifetime/aggregate call cap;
  the separate workshop's 20-attempt trial remains unchanged.
- Cover ordinary non-story travel introductions and hospitality NPC
  greeting/accepted/refused speech in the actual travel and shelter UI.
  Exclude lore, riddles, puzzles, witnesses, hints, hidden discoveries, story
  encounters and the dog's adoption choice. No change to eligibility,
  rewards, choices, checks, costs, outcomes or earned evidence permissions.
- Send only bounded public briefs from `public/narrative-briefs.json`,
  selected by server registry identifier. Never send a save, player name,
  notes, coordinates, source code, private facts or client-supplied prompt.
- Authored introductions, dialogue, numerical effects and action labels stay
  immediately usable. Prefetch asynchronously; snapshot available wording
  when opening an encounter. Late results do not replace active text or
  choices. Hospitality outcome speech changes only after the authored action
  has settled. Cache one bilingual wording per owner/brief/version.
- Authenticate using the existing journey/journal capability and keeper
  ownership checks. Durable owner-isolated SQLite deduplication, call/token
  accounting and queued work survive restart. Failed or interrupted attempts
  never automatically retry; unknown billing remains explicitly unknown.
  Bound concurrency (one), pending queue (32), input/output and timeouts,
  rather than imposing an aggregate call allowance.
- Show localized disabled/pending/cached/failure status and log provider
  failures. Missing key makes no provider call. Structured JSON and size
  checks enforce format, **not semantic correctness**; generated wording
  must never be treated as game authority. Setup, prices and limits:
  [CONTENT_FACTORY.md](CONTENT_FACTORY.md#live-game-wording-r-141).

## R-140 - Wikipedia-informed text-to-image fallback

- **19 October backup idea:** use the local Wikipedia description as context
  for the cover or daily illustration prompt when genuine photo-conditioned
  generation is unavailable. This is text-to-image, not photo transformation,
  and does not replace the postponed R-139 requirement.
- Extract a short, bounded set of visible setting facts from the local article,
  such as landscape, architecture and landmarks; write an original visual
  brief rather than copying article prose or sending the full article.
  Treat retrieved content as untrusted data, never prompt instructions.
- Combine the setting with the birth card for a permanent cover, or that day's
  card plus recorded events and earned discoveries for a daily page. Wikipedia
  context is decorative atmosphere, not earned game evidence or new clues.
- Preserve the source article link and attribution, and review applicable
  licence obligations. If no usable local description exists, retain the
  tarot/events-only option with an explicit unavailable-context status.
- Before enabling, review the external-data boundary: place descriptions can
  identify the in-game location even without coordinates. Do not silently
  relax R-137's coarse-location-only policy or send private player data.
- **Status:** one user-requested live feasibility sample tested successfully
  with public Annecy setting facts plus Temperance; location cues and tarot
  details were only partially followed. Automatic extraction and game
  integration are not implemented or enabled. Retain the existing per-request
  zero-price check and no paid fallback. See the trial observations in
  [the content factory notes](./CONTENT_FACTORY.md#backup-idea-local-wikipedia-context-r-140-not-implemented).

## R-139 - Choose a local photograph as the illustration reference

- **19 October confirmed refinement:** before generating a permanent journal
  cover or daily memory image, ask the player to choose their favourite photo
  of the current location from the game's local-photo results. This means
  game-offered location photographs, not device uploads or arbitrary files.
- For the permanent cover, use the selected photograph as a visual reference
  plus the **birth card**. Keep the finished cover for that journey.
- For each completed in-game UTC day, offer photographs of the player's
  location when that day ends and use **that day's card**. Preserve the
  selection opportunity while generation runs asynchronously; do not block play.
- If the player skips selection, generate from tarot, recorded daily events
  and already-earned discoveries instead. Do not invent events or expose
  locked interpretations, future targets, private notes or journal contents.
- Photo-based generation requires an image-conditioned provider; a description
  of a photograph is not equivalent to using the photograph as the image base.
  The currently verified free OVH SDXL API documents text-to-image only.
  Provider capability and price must be established before implementation;
  never silently substitute a paid model or pretend text-only generation is
  image-to-image.
- Preserve source/author/licence and comply with derivative-use conditions.
  Explain external processing and obtain confirmation before sending any
  chosen photo to a provider. Never send capability secrets or photo-location
  metadata with the image. No uploaded private photographs are authorized.
- **Status:** explicitly postponed by the user after feasibility/cost review;
  photo selection and image-conditioned generation are not implemented.
  No new provider or paid trial is authorized. Supersedes automatic generation
  before the selection/skip decision in R-137; existing image prototype is not
  this flow.

## R-138 - Explore synthesized NPC dialogue voices

- **19 October idea:** use AI-generated voices for people the player talks to.
- Whisper is transcription, not synthesis. A future text-to-speech slice
  should cache audio from already-approved, permitted dialogue and use
  fictional voices. Check French support, provider prices and licences first.
- **Status:** recorded for a later increment; no voice generation enabled.

## R-137 - Personalized cover and illustrated daily journal memories

- **20 October clarification:** enable the existing free symbolic tarot/scenery
  cover now, independently of the postponed photo-based R-139 flow. Keep its
  dedicated image separate from the shared start-page illustration. Generate
  one durable bilingual subtitle from the saved departure setting, birth tarot
  and canonical parent motive; no future stages, private notes or invented
  blisters. Display generation status and reuse the subtitle in PDF exports.
- **19 October confirmed choices:** personalize illustrations with birth/day
  tarot motifs and broad surroundings, never player identity or exact location.
- Generate one permanent cover per journey. Add a separate dated illustrated
  memory for each completed in-game UTC calendar day; do not replace the cover.
- Generate asynchronously without delaying gameplay. Store results durably;
  insert finished art into the scoped journal when it is available. Include
  generated cover and daily pages in PDF exports and published snapshots.
- Derive daily activity tags from recorded observations, not invented events.
  Mark partial observation on existing journeys; do not fabricate old days.
  Main-game browser observations remain decorative, not authoritative evidence.
- Use the currently free OVH SDXL offer only, recheck pricing before generation,
  stop explicitly on unavailable/paid offers, and never use a paid fallback.
  Preserve provenance, licence and AI attribution. Bound queue, output and
  storage; prevent duplicate cover/day generation across sync and restart.
- No real-player data, private notes or hidden clues go to OVH.
- See [implementation and operational limits](./CONTENT_FACTORY.md#personalized-journal-illustrations).

## R-136 - Start small with live OVH content generation

- **19 October request:** start the content factory before pushing the release;
  use OVH AI services to generate riddles, rumours and related expression live.
- **Confirmed first slice:** a separate local writing workshop, not an in-game
  integration; manually trigger up to 20 provider attempts for the trial.
- Generate FR/EN rumour and riddle drafts from fixed fictional, permitted
  fact bundles. Preserve uncertainty, precision ceilings and locked plain
  guidance. No player saves, private journal content or source code is sent.
- Keep the OVH access key server-side, outside Git and Terraform state. Use
  AI Endpoints, not a newly provisioned GPU VM. Confirm model pricing before
  enabling paid calls.
- Persist request reservations, successes/failures, actual reported token
  usage and explicit editorial acceptance. Never automatically retry paid
  generation. Export accepted sample drafts without publishing into the game.
- This supersedes the earlier offline-only restriction for this local workshop.
  Main-game generation, factual validation, puzzle answer contracts and
  production deployment remain separate. See the
  [workshop setup and boundaries](./CONTENT_FACTORY.md).

## R-135 - Complete the remaining sixteen artifact powers before release

- **19 October confirmed request:** do not stop after another small batch;
  implement all sixteen remaining approved powers, then prepare for deployment.
- Preserve the existing six powers, unique instances/custody, main saves and
  evidence-specific plain-guidance permissions. All 22 powers must share the
  real survival, health, pressure, equipment, economy and discovery rules.
- Implement Magician, Priestess, Empress, Emperor, Hierophant, Lovers, Justice,
  Strength, Hanged, Nameless, Devil, Tower, Star, Moon, Judgement and World,
  with the approved prices, prerequisites, durations, packing and cooldowns.
- Include actual ordinary earning proof via server-replayed bookshop play,
  exact linked refunds, fixed canonical fragment provenance, collector copies
  and four-thread progression; no fabricated cash/work/inscription evidence.
  Normal work is repeatable under host rules, not a new daily local limit.
- Support real distant parent targets through free, private asynchronous
  terrain/route preparation using server position and immutable genesis.
  Bound providers explicitly, block water and reject unavailable routes before
  charging. World can prepare genuinely earned landings without Star/Lovers.
- Persist timers, private Moon bundles, natural daily draws, rescue and work
  receipts across retry/restart. Do not disclose future towns, private journal
  pages, work answers, hidden routes or current holders.
- FR/EN UI must show usable selectors, 1-3 fragment choices, exact refund
  previews, unmet requirements, durations, preparation status and sanctuary
  cancellation warnings, including keyboard and packing.
- **Status:** implemented locally in the separate authoritative playtest;
  verification and release gates are documented in the
  [all-22 checkpoint](./LORE_SPECIFICATION.md#all-22-powers-checkpoint).
  Main-game authority, journal delivery, full narrative ending and LLM text
  generation remain separate. No production deployment is implied.

## R-134 - Second isolated artifact power batch

- **19 October continuation:** after the initial playtest and interpretation
  refinement, continue implementing the approved strong powers in small batches.
- Add Fool (endless hem), Wheel (empty spool) and Sun (yellow handkerchief) to
  the existing isolated world. Retain all prior custody and journey progression;
  a new journey must not reset globally unique test objects.
- Fool: one-minute return to a different personally visited, validated settlement,
  10 fatigue, 24-world-hour cooldown; retain real belongings and companion,
  without simulated walking or skipping parent stages. Bounded to the pinned map.
- Wheel: one-minute recall of one's own still-unclaimed cached artifact into the
  real bag, 10 fatigue, 72-world-hour cooldown. Private deposit entitlement is
  invalidated by any claim; preserve the target's cooldown and enforce atomic
  competition with public claims, weight and spatial placement.
- Sun: one-minute full health and zero fatigue for 500 kcal plus metabolism,
  positive reserve after payment, 72-world-hour cooldown. No food refill,
  sleep-debt reset or resurrection. Discovery needs daylight [06:00, 20:00) UTC
  and one recorded inscription; using an already-owned Sun does not need daylight.
- Wire FR/EN names/inscriptions, shared hints and interpretation permissions,
  discovery prerequisites, inventory, sharing, caching, confirmation and retries.
  Display object/card names together, unmet claim conditions and the UTC clock.
- **Status:** implemented locally, not deployed. 230 JavaScript and 64 Python
  tests pass; real isolated browser flow verified all three powers and resume.
  Six powers were playable at this checkpoint; R-135 completes the other 16.
  Main-game integration remains pending. See [checkpoint details](./LORE_SPECIFICATION.md#second-power-batch-fool-wheel-and-sun).

## R-133 - Plain guidance requires an earned interpretation

- **19 October confirmed refinement:** earned precision is necessary but not
  sufficient for plain guidance. A knowledgeable NPC or an explicitly permitted
  artifact power must interpret the specific evidence record.
- Permission persists for that semantic identity, including reload/resume.
  More precise evidence or a new target revision needs its own interpretation.
  **Explain** remains free but cannot unlock plain instructions.
- NPC help depends on local reputation, birth/day cards, cleanliness and fatigue:
  it may be free, paid, unaffordable or unavailable. Use existing social and
  local-price rules, not a fixed universal fee. Display conditions before acting.
- Initial local balancing: named-settlement encounter, stable per settlement/day,
  10 minutes for successful interpretation, variable local-market fee or no fee.
  No new permission on an interrupted interaction; ordinary time/needs and any
  quoted fee are spent. Refused/unaffordable requests are explicitly rejected.
- Hermit's power automatically interprets only the exact clue its revelation
  creates. No blanket notebook unlock and no added power price.
- Implemented in the isolated authoritative playtest only. Old playtest records
  without permissions start locked; no retroactive bulk grant. Main notebook/PDF
  behavior is unchanged. See [implementation guide](./HINT_ENGINE.md#plain-guidance-permissions).
- **Verification:** 122 focused JavaScript tests and 19 authority Python tests
  pass. Fresh isolated browser checks covered locked Explain, quoted NPC charge,
  reload/FR translation and Hermit's automatic grant.

## R-132 - Authored mysterious hints, free explanations and sleep dreams

- **19 October confirmed choices:** implement hint variety and dreams together
  in the isolated authoritative playtest; keep the 300/30/3 km/250 m ordinary
  artifact ceilings; evocative wording first, free **Explain** and **Plain
  guidance** controls; mysterious tone; card/proximity-based dream chance rather
  than guaranteed clues.
- R-133 supersedes unconditional plain guidance: rereading an unlocked
  interpretation is free, but acquiring permission is a gameplay interaction.
- Six complete handwritten FR/EN patterns for each of artifacts, parent clues
  and journal clues. Stable domain-order selection avoids consecutive pattern
  reuse and does not change on reread, append, reload or language switch.
  Templates consume only earned facts; scenery/markers remain explicitly
  fictional. Stronger artifact precision suppresses skipped weaker tiers.
- The shared selector accepts artifact, current parent-stage and real available
  nearby journal candidates, preferring least-recently surfaced equal-priority
  domains. One automatic clue budget remains shared across them. A shared manual
  inquiry preserves domain costs: artifact 2 minutes; parent uses the actual
  existing field-search duration/chance; journal rumour refresh is free.
- Deliberate sleep offers one check after 60 settled minutes, at most once per
  24 journey hours. An empty, missed or interrupted opportunity consumes that
  quota too; repeated/split sleep, refresh and receipt replay cannot reroll.
  Fainting, detention and ordinary rest do not trigger dreams.
- Chance follows the specification's formula and all-22-card affinity table,
  using the birth card and the day card at the check instant. Precision remains
  domain-owned. Neither sleep recovery nor resource costs change.
- Persist private chance/draw, chosen evidence, pinned cards and sleep times
  atomically with the action. Expose earned clues and dream outcomes, not
  failed targets, private locations, chance inputs or random draws.
- Journal candidates use the actual service's 200 m availability rules without
  claiming, refreshing leases or reading private notebooks/future quest stages.
  Only the player's own observation cell is recorded, not the journal's position.
  Revalidate availability before publication. Pickup/delivery remain outside
  this isolated test.
- **Status:** implemented locally; validation and browser results are recorded
  in the [lore checkpoint](./LORE_SPECIFICATION.md#authored-hints-and-dreams-checkpoint).
  No LLM calls, production activation or main-journey dream integration.

## R-131 - A playable, isolated server-authoritative artifact checkpoint

- **19 October approved choice:** build an opt-in authoritative playtest rather
  than migrate the entire browser-owned main-game action pipeline first.
- Separate world/journey, immutable authenticated source genesis, real pinned
  starting map and existing walking/survival/economy/packing reducers.
  Do not accept browser position, clock, resources or inventory checkpoints.
- Three unique test-world artifacts: Hermit, Chariot and Temperance. Playable
  clue → claim → inscription → use → cache → resume, with prerequisites,
  real power benefits/costs, persistent per-instance cooldowns and recovery.
- Atomic SQLite ownership/resources/receipt transactions; private capabilities;
  idempotent retries, revision checks and no hidden holder/location disclosures.
  Thirty real days without accepted actions recache holdings; polling does not
  keep an object indefinitely.
- **Status:** implemented and tested locally, not deployed. Ordinary artifact
  inquiry and Hermit share the common notebook. Generic shared scheduling exists,
  and R-132 now supplies all three domains to the shared selector and sleep dreams.
  R-134 extended the test to six powers; R-135 completes all 22.
  Main parent/journal storage consolidation remains pending.
- See [checkpoint scope](./LORE_SPECIFICATION.md#isolated-authoritative-playtest-checkpoint).

## R-130 - Start lore implementation without an extensive legacy-save framework

- **19 October user clarification:** there is currently only one player.
  Prioritize the new game mechanisms over exhaustive save-game compatibility.
  A reset/new journey may be needed for an explicitly incompatible schema;
  do not silently discard an existing save.
- **First local implementation:** versioned shared discovery ledger, semantic
  cross-channel deduplication, parent/journal earned-evidence adapters, save
  validation, FR/EN common notebook view and inclusion in notebook PDF exports.
  Existing parent/journal mechanics remain authoritative in this increment.
- No paid API calls or production deployment are activated by this checkpoint.
  Artifact authority, six powers and R-132 dreams exist only in the
  separate playtest, not in main-game saves. Production-wide scheduling
  and final consolidation of the existing feature-specific clue storage remain
  work to do; the ledger is not server-verified progression.
- See [implementation status and scope](./LORE_SPECIFICATION.md) and the
  [shared discovery engine](../discovery.mjs).

## R-129 - Unique artifacts grant genuinely powerful, rule-breaking advantages

- **19 October user requirement:** Review all 22 powers. These globally unique
  items must really help the player, give a substantial advantage over the
  ordinary game and "feel like cheating". Interface conveniences, rereading
  existing information, cosmetic highlights and tiny bonuses are insufficient.
- Revised proposals include teleportation, guaranteed truthful revelations,
  full reserve/health recovery, large travel reductions, expense reimbursement,
  temporary survival-rule protection and choosing the effective daily tarot.
  Each has a signature ability, visible price and persistent instance cooldown.
- Remove the shared journey activation cooldown and single-active-power limit.
  Different objects may combine; same-instance effects cannot stack, duplicate
  rewards or reset through transfer/reload. The intended benefit must actually
  apply: ordinary clue ceilings or survival rules must not silently nullify an
  explicitly authorized magical exception.
- Preserve unique custody, private-player/journal access boundaries, factual
  parent genesis and historical records. No resurrection of committed terminal
  journeys, theft of held artifacts or unvalidated teleport landing. Strong
  benefits are intentional; duplicate receipts and invalid state are not.
- Ordinary hints/dreams keep R-127/R-128 policies. Magical revelations and
  guaranteed dreams use explicit permissions in the same discovery mechanism,
  never an independent LLM-controlled truth/reward system.
- Non-holders retain a complete playable normal game and copy-based lore
  resolution. Do not raise baseline difficulty to offset rare-item benefits.
- **Status:** All 22 powers and shared constraints revised in the
  [lore specification](./LORE_SPECIFICATION.md#3-the-22-artifacts).
  Hermit, Chariot and Temperance are implemented in R-131's isolated local
  playtest. Other powers remain specifications, not runtime implementations.

## R-128 - Card- and proximity-influenced dream clues during sleep

- **19 October user requirement:** Players can receive hints while sleeping,
  influenced by their tarot cards and distance to the target.
- Dreams are a channel of R-127's shared parent/artifact/abandoned-journal clue
  mechanism, not a separate knowledge or random-discovery system.
- Use actual settled sleep, authoritative birth/day cards and adapter-owned
  target proximity. Cards/distance influence opportunity and expression;
  existing information ceilings, prerequisites, availability and truth remain
  engine-owned. No guaranteed revelation or hidden-location disclosure.
- Pin and persist the opportunity, target/evidence revisions and random result.
  Split sleep, reload, retries or language changes must not farm extra clues.
  Revalidate dynamic availability on waking; retain historical dreams honestly.
- Preserve existing sleep duration/recovery and needs; dreams do not grant
  extra healing or impose a hidden activation charge. Show earned dreams in
  the common notebook with optional plain-language explanation.
- Later LLM content supplies reviewed dream wording/riddles from permitted facts
  and card motifs. It does not choose targets, alter probabilities or award
  progress. Deterministic templates remain available.
- **Status:** R-132 implements the approved deliberate-sleep policy locally in
  the isolated playtest. Main-game integration and other sleep providers remain
  pending. Detailed sleep eligibility, quotas, all-22-card affinity and chance formulas in
  [lore specification section 2.0](./LORE_SPECIFICATION.md#20-one-discovery-mechanism-for-parent-artifacts-and-abandoned-journals)
  distinguish the target contract from the implemented checkpoint.

## R-127 - One hint mechanism for parent trails, artifacts and abandoned journals

- **19 October user requirement:** Parent-path investigation, magic objects and
  abandoned/lost journals must use one unified hint, clue and riddle mechanism,
  not separate feature-specific systems. Later, the LLM/content factory will
  generate their riddles, clues and hints.
- Share the evidence/clue contract, knowledge ledger, channel handling (including
  dreams during sleep under R-128),
  deduplication, freshness, action receipts and presentation pipeline. Domain
  adapters retain authoritative parent stages, artifact placement/custody and
  journal access/quest state. Shared mechanism does not mean identical
  proximity metrics, prices, probabilities or progression conditions.
- Preserve current parent and journal gameplay and earned knowledge;
  exhaustive historical-save migrations are not required in this sole-player
  phase (R-130).
  Integrate lore through the shared foundation. Locale/channel changes and
  narrative variants must not re-award knowledge or bypass disclosure limits.
- The engine owns truth, permitted precision, target availability, answer
  contracts and state changes. The future LLM writes reviewed narrative variants,
  riddle prompts, hint ladders and explanations from authorized facts; it never
  invents hidden locations, decides correctness or awards progress.
- Use versioned, validated content packs with deterministic FR/EN templates
  when generated content is unavailable. Provide plain-language actionable
  guidance within the earned information ceiling; no mandatory live LLM call,
  private-player-data export or literary guessing requirement.
- **Status:** Shared ledger, earned-evidence adapters and notebook view
  implemented locally, plus a generic shared scheduler and R-131 artifact
  integration. Domain storage consolidation, production-wide candidate delivery
  remain pending; R-132 adds isolated sleep dreams and providers for all three
  domains. See [lore specification, section 2.0](./LORE_SPECIFICATION.md#20-one-discovery-mechanism-for-parent-artifacts-and-abandoned-journals)
  for the proposed contract, rollout and acceptance criteria.

## R-124 - Integrated game help and explicit placement reasons

- **19 October playtest feedback:** Game tooltips must work in the online
  integrated activities. Native game controls must retain hover/focus labels
  without receiving automatically allocated shortcuts that interfere with play.
  Contextual Help must include each game's own commands and difficulty text.
- A foyer/stay-in-care popup must explain that vigilance reached 100, rather
  than appearing to be a random event. New episodes retain the actual preceding
  vigilance, action duration, tarot factor and individual pressure contributions.
  Display this explanation in FR/EN alongside the existing consequences.
- Preserve existing pressure rules, recoverable first/second placements,
  terminal third placement and save compatibility. Older episodes without
  a trigger snapshot get an honest threshold explanation, not invented details.
- Resuming must not replay historical placement/fainting notifications; new
  episodes, current hunger/health warnings and terminal outcomes remain visible.

## R-123 - Spatial inventory and companions

- **Deployed 18 October:** Runtime `e4bbde7`, tag
  `deploy-2026-10-18-games-equipment`, with all twelve approved journey games.
- **18 October user approval:** Integrate the tested inventory and dog into the
  main journey and deploy with the approved games and events. Other companion
  types and artifact powers remain future work, not implicitly activated.
- User chose a Resident-Evil-inspired, Tetris-style bag with original equipment
  drawings, move/rotate controls, a spatial grid and a weight limit. Boots,
  backpack and clothing use separate worn slots. Catalogue-defined footprints
  must allow future equipment and arcane artifacts without item-specific
  packing logic. Preserve placement on save/resume; reject overlap/bounds.
- Find the dog through an optional walking encounter, not an always-available
  adoption button. Let the player name it; preserve the name, needs and
  encounter choice across saves. Declining must not force adoption.
- The isolated equipment test guarantees a dog encounter after 5 km so it is
  easy to test. This is not an approved main-journey encounter frequency.
- **Future companions:** Add further companion types after design/playtest,
  including at least one imaginary companion. Their identities, encounter
  conditions, costs and benefits remain to be decided; do not silently assign
  them the dog's needs or bonuses.
- Main journey: equipment and dog share the journey clock, wallet and local
  save. Missing legacy slices migrate without historic wear or dog needs;
  malformed slices fail. Walking applies load, wear and ready-dog bonuses;
  all simulated actions advance needs, with no real-time decay on reload.
- Supplies and repairs use settlement cells (fixed game prices, not asserted
  real shops). The normal dog encounter is part of the positive event pool,
  under the existing 90-minute walking opportunity and tarot probabilities,
  never the test's guaranteed 5 km. Adoption costs EUR 5 / 30 game minutes,
  requires a name; declining persists and prevents repeated offers.
- Tent protection requires a usable tent and a mapped accessible campsite,
  not permission for arbitrary wild camping. Campsites give partial sleep
  recovery with no hotel board. Camera quality remains explicitly future:
  licensed notebook photos do not yet have a quality-scoring mechanic.

## R-122 - Real European living-world sources and photos

- The connected preview uses bounded OpenAgenda searches (20 km/seven days),
  explicit coverage/freshness/provenance, optional attributed openly licensed
  Commons photographs labelled illustrative, and the existing European
  transport source explorer/hybrid. It is reachable from Options and does not
  activate public events or transit in normal journey saves.
- Replace the fictional-only living-world preview with connected real public
  sources usable across Europe. Show actual geographic/provider coverage,
  freshness, source attribution and failures; never imply universal local-event
  or transport coverage where a provider has gaps.
- Include photos when reuse rights permit, retaining source, author and licence.
  Clearly distinguish actual event images from illustrative venue/place images;
  never imply an illustrative location photo documents the event itself.
- Do not download or republish copyrighted event publicity without permission.
  Missing licensed photos must not block otherwise valid sourced records.

## R-121 - Health, expanded events and enigmatic encounters

- **Confirmed user choices:** 20 gameplay events plus additional story-only
  encounters. Maximum health 100. Empty food reserve causes 10 health damage
  per simulated hour after depletion, not instant death. Zero health is death.
- Preserve progressive hunger slowdown, including while walking at zero food.
  It stacks with sleep pressure, weather and temporary event speed modifiers
  without changing starting character attributes.
- Fed sleep restores 5 health/hour; only the fed portion heals if reserves run
  out during sleep. Clamp recovery before applying later starvation damage.
  Meals replenish food and stop starvation, but never instantly restore health.
  All action metabolism and extra weather/search expenditure participate.
- A visible health meter, low-health warning, notebook/PDF statistics, death
  presentation and abandoned-notebook publication use the new health outcome.
  Recoverable fainting/placement and reunion remain distinct.
- Old active saves migrate to 100 health. Previously dead saves stay dead;
  immutable server genesis records are not rewritten.
- Catalogue: shared snack, donated coins, encouragement, water break, short nap,
  clear head, tailwind, bandage, picnic, friendly advice; delay, lost coins,
  strain, torn food bag, restless thoughts, headwind, blisters, forest boar,
  forest dogs and chills. Animal attacks only occur on actual forest terrain.
- Eight additional enigmatic, mechanically neutral encounters: white deer,
  silent bell, impossible shadow, repeating spiral stone, stranger, remembered
  stars, red ribbon and unusual reflection. Narrative-only encounters consume
  25% of event occurrences, with no needs, money, time, health or speed changes.
  Terrain-specific story eligibility is respected.
- **Additional user request:** Each event popup combines its localized text
  with a distinct original ASCII illustration, including narrative-only events.
  Preserve monospace spacing on narrow screens and keep decorative character
  art out of screen-reader speech; the full event description remains accessible.
- Both tarot cards still influence occurrence and favourable/adverse mix.
  Gameplay variants are equally likely within the eligible polarity pool.
  Store actual health/sleep deltas and speed terms alongside existing effects;
  legacy six-event records remain readable.
- Speed changes last 60–120 simulated minutes, expire during movement as well
  as other actions, and replace rather than multiply a previous speed effect.
- **Status:** Event mechanism visually playtest-approved on 2026-10-18,
  including expanded events, health effects and notebook pins. User authorizes
  publication with the normal 90-minute walking opportunity interval restored.

## R-120 - Layer 13 tarot-linked journey events

- **User decision:** Implement the journey-event layer locally, explicitly
  linking event occurrence to both the starting and daily tarot cards.
- Initial six-event catalogue (expanded under R-121): a shared snack (+300 kcal capped by reserve),
  donated coins (+EUR 1.50), encouragement (-5 fatigue, +1 local reputation),
  a 15-minute non-restorative delay, lost coins (up to EUR 1.50) and a tiring
  misstep (+5 fatigue). Effects are fictional gameplay encounters.
- One opportunity per 90 accumulated minutes of completed walking, with at
  most one event per movement action; unusually long moves consume skipped
  opportunities rather than queueing a burst. Menus, waiting, sleep, jobs and
  other stationary actions do not generate events or advance this counter.
- Reuse the existing combined tarot factor:
  `F = 0.5 + (birth.nightRisk + daily.nightRisk) / 2`.
  Occurrence probability is `0.35 * F`; conditional favourable probability is
  `1 - F / 2`. With current cards this means 24.5–38.5% occurrence per
  opportunity and 45–65% favourable gameplay outcomes. Variants are equally
  likely among the eligible events in each polarity (R-121 adds a separate
  story-only share). Both cards affect frequency and outcome mix.
- Deterministic journey-seeded draws, saved opportunity counters (including
  no-event checks), frozen triggering cards, applied deltas and acknowledgement
  prevent duplicate effects and ordinary save/resume rerolls.
- Show a localized notice with actual effects, triggering cards, probabilities
  and save status. Needs/death and daily-card reveals take priority.
  Colour helpful effect numbers green and harmful numbers red; keep zeros
  neutral. Reduced fatigue/sleep pressure is helpful, extra delay is harmful;
  temporary speed changes follow their actual direction.
  Automatically pin each encountered event once in the player's notebook,
  alongside photos and tarot cards, with the same ASCII drawing, encounter
  date and recorded effects. Preserve notebook notes, retries, journey ownership
  and PDF export through the existing notebook storage.
  Require acknowledgement before continuing gameplay; acknowledgement is not another
  roll. Show totals and the latest 32 records in notebook statistics/PDF.
- Never rescue a walk that already ended, fainted or caused placement with a
  positive event. Extra time/fatigue still uses the existing metabolism,
  weather, night, fainting, vigilance, placement and terminal-needs rules.
- Existing saves start counting from their next walk, with no retroactive
  events. Real geocache providers (R-025) remain a separate optional extension.
- **Status:** Validated by the user on 2026-10-18 and authorized for publication
  at the normal rate, including red/green effect numbers and illustrated
  notebook entries. Accelerated localhost testing is not the production rate.
- **Local accelerated playtest:** At the user's request, provide a localhost-only
  `?eventPlaytest=1` mode with an opportunity every 5 walking minutes instead of
  90, unchanged tarot probabilities, a visible test banner and a separate save
  namespace. Normal journeys and remote production rates remain unchanged.

## R-119 - Consequential mini-games and food-theft timing

- **User request:** Mini-game results must affect the journey, not just display
  a score; bad street music makes the local population dislike the player.
- Music and cafe outcomes change the existing local reputation: below 40%
  or a music mistake-limit failure costs 3 points; 40–59% is neutral; at least
  60% earns 2 points. Reputation remains capped between -25 and +25 locally.
  This changes sympathy, subsequent social chances and sympathy-scaled pay.
  Cancellation grants no reward or reputation bonus; upfront costs remain paid.
- Use the shared outcome policy when integrating the other prepared games.
  They remain isolated previews until individual approval, not active jobs.
- Replace instant food theft in the earning menu with a simple timing game:
  one click/Space grab inside a green window, 9-second deadline.
  Randomize both position and width each attempt (12–28% of the track, with
  8% edge margins), then freeze the target throughout that attempt.
  The local playtest also offers Hard: 1.2-second cursor cycle instead of
  1.8 seconds, and 7–16% target width. Keep the 9-second deadline, one grab
  and existing consequences. Normal remains the journey default.
  Failure or timeout means the existing six-hour detention; success eats up to
  900 kcal without money. No additional random success roll.
- Charge the existing 10 minutes, 3 fatigue, vigilance and 15-point local
  reputation loss on starting; getting caught costs another 5 reputation.
  Abandoning, hiding the tab or reloading gives no food and refunds nothing.
  Interruptions from hunger, fainting or placement suppress the attempt.
- Preserve mapped-food-shop availability, keyboard/touch access, same-cell
  release without a fine, strict save validation and exactly-once settlement.
- **Status:** Implemented locally for music, cafe and theft; not published.

## R-118 - Notebook title page

- Open the personal notebook on a title page reading "Journey of [name]"
  / "Voyage de [nom]", with a funny localized subtitle.
- Show the actual starting point and original starting date, not the current
  position or date. Explicitly label missing legacy data rather than invent it.
- Include the title page first in PDF exports. Do not use the reader's identity
  or journey details for an abandoned notebook belonging to somebody else.

## R-117 - Rumours help players discover abandoned notebooks

- **User approval:** Make abandoned notebooks discoverable without relying
  on another player accidentally walking onto the death location.
- Conversations in nearby towns can occasionally mention an abandoned
  notebook, giving an approximate location and direction for a possible detour.
  Current balance: up to 20 km, a deterministic 50% chance per notebook,
  mapped settlement cell and game day, with at most 100 candidates per scan.
  Repeated clicks do not reroll the same conversation.
- Within 1 km, show a nearby-notebook indication to help narrow the search.
  Actual pickup still requires being within the existing 200 m radius.
- Generate rumours only for unclaimed, undelivered notebooks. Recheck
  availability when following a rumour or attempting pickup; explain when
  another player has already collected it rather than promising availability.
- Keep the notebook at its actual abandonment location; no teleporting it
  to a town or moving it toward the player.
- Preserve exclusive claims, expiry/release rules and the independent
  delivery side quest under R-103. Rumours must not reveal private access
  capabilities or replace the player's main parent investigation.
- **Status:** Implemented for ordinary journeys: explicit conversation in the
  town dialog, an exterior nearby indication, saved shared-discovery evidence,
  and availability revalidation. Pickup remains exclusive and within 200 m.

## R-116 - Adventure-style journey overview in the notebook

- **User request:** Add a high-level travel view, in the spirit of adventure
  film journey maps. Implement and publish it before resuming mini-game work.
- Separate Journey map page: parchment styling, red dashed actual route,
  departure, physically reached destinations and current position, north/scale,
  with an optional replay animation respecting reduced-motion preferences.
- Record the player's movements persistently; never reveal the parent's
  hidden path or destinations. Legacy saves show known stops and start recording
  from resume, clearly marking missing earlier route history.
- Initial view is an explicitly labelled schematic, without an external
  geographic basemap. Bound saved route size and label any simplification.
- Include the map and legend in PDF exports. Do not substitute the reader's
  personal map when displaying or exporting somebody else's abandoned notebook.
- **Additional user request:** Draw lines between known stops. When the actual
  earlier path is missing, use distinct brown dotted straight-line connections
  in visit order, explicitly labelled as schematic, not the route walked.
- **Additional user decision:** Draw scaled terrain cells behind the route
  using cached data only. Never prepare/download new geographic data for this
  view. Leave cache misses blank, explain incomplete or sampled coverage and
  retain the same background in PDF exports.

## R-115 - One earning-activities popup, including rural work

- **User request:** Replace the separate begging, theft and street-music
  entry buttons with one localized "Earn money" / "Gagner de l'argent" button.
- Open a popup listing the available ways to earn a living at the player's
  current location. Keep all three existing actions inside it; removing their
  separate buttons must not remove their gameplay.
- Route earning activities and implemented paid mini-games through this
  common entry point across the main, town and cell-action interfaces.
  Preserve keyboard and clickable access.
- Availability follows each activity's real conditions, not a blanket
  in-town requirement. Show the actual costs, risks and rewards; existing
  food theft must not be relabeled as a cash reward without a separate
  economy change.
- **Confirmed rural example:** Add a grape-harvest ("vendanges") mini-game
  for earning money at mapped vineyards outside towns. Include it in the
  harvest mini-game planned under R-111; a settlement is not required.
- Do not invent nearby workplaces or offer a remote job from another cell.
  Further rural jobs, harvest scheduling and payment balance remain to design.
- **Status:** Required for the mini-game interface. Preserve the R-111 rule:
  implement and locally test one mini-game at a time, waiting for explicit
  user approval before starting the next.

## R-114 - Download the complete notebook as PDF

- **User request:** Implement the missing notebook PDF generation now.
- Provide a localized Export PDF action in the notebook. Download all stored
  pages, including photos, tarot, notes and source/license credits, not only
  the currently visible spread. Include live journey statistics when available.
- Save current note drafts first. Generate locally without an external service;
  show preparation and failures explicitly. Preserve journey ownership.
- For an abandoned notebook, include its clues and pages, never the reader's
  personal journey statistics. Export must not alter cards or game progress.
- Initial export uses rasterized A4 pages with wrapped text and image fitting;
  text is not selectable. Long notes and credits continue onto further pages.

## R-111 - Layer 12 mini-games, one at a time and tested locally

- **Release authorization (2026-10-18):** The user validated Postcard Sketch
  (game 7), including its Star concordance, and requested publication of all
  twelve games. This supersedes earlier local-only publication restrictions
  for these games; unrelated layers are not included in this authorization.
- **Local playtest approvals (2026-10-18):** Cafe rush and street music
  approved by the user. Street music approval includes easy mode and the
  revised faster levels with 2-, 3- and 4-beat holds, progressive lighting
  and the wider release window. These approvals do not authorize publication.
- Stealing is also playtest-approved, including Normal and Hard. Add short
  outcome sound effects, respecting mute/volume and cancellation/hidden tabs.
  Village deliveries is the fourth local playtest; its fictional board remains
  isolated from journey costs, rewards and saves pending integration approval.
  Explain the goal and memory/delivery phases clearly: match each parcel to
  its house, with a route-length score bonus. Illustrate
  parcels, destination houses and the depot; show the selected parcel and
  delivered count without revealing hidden destinations during delivery.
- **Delivery playtest revision:** Center the parcel row, remove visible house
  coordinates and add sound feedback. Use an original top-down bicycle, freely
  steered by held arrow keys (user-selected control scheme), with held touch
  controls as an alternative. Highlight the nearby house zone; Space or Deliver
  sends the selected parcel only within range. Actual ridden distance, including
  detours and the final direct return to the depot, determines route efficiency.
  Keep the memory phase and parcel letters, not remote click-to-teleport delivery.
  Difficulty changes parcels 4/4/5/6/7, village 3×3–5×5, memory 15–9 seconds and
  route allowance 60–100 seconds; explain these before starting.
- **Delivery approval:** The user validates the riding/deliveries game, with a
  time limit requested. Retain the existing 60–100 second route deadline and make
  its countdown prominent above the village, warning for the last ten seconds.
  Expiry must end the run without completion/reward. Approval is local only,
  not publication or permission to integrate journey settlement.
- **Parallel local playtest:** At the user's request, offer game 5 (grape
  harvesting) while game 4 is being revised. Harvest is now playtest-approved
  with the easy-mode adjustment below; neither is enabled for journey rewards.
  No publication is authorized.
- **Harvest redesign requested after playtest:** Replace instant basket-button
  sorting with an illustrated coloured grape bunch falling automatically.
  Held Left/Right arrows steer the bunch horizontally into the same-coloured
  basket; support held pointer/touch arrows too. Show grapes and baskets with
  colours and redundant identifying symbols/names. Add success/mismatch sounds
  and mute. Difficulty scales colours/baskets (3–6) and falling speed
  (2.5–1.4 seconds after the user's faster-fall requests), not extra controls;
  keep 16 bunches per round. Keep the furthest basket reachable at every level.
- **Harvest approval:** The user validates the grape game after increasing easy
  mode to at least three baskets and slightly faster falling: level 0 now has
  three baskets and a 2.5-second fall instead of two and 2.8 seconds. Preserve
  levels 1–4, particularly the approved hard level (six baskets, 1.4 seconds).
  This approval remains local only; do not publish automatically.
- **Riding follow-up:** Select parcels using number keys 1–6 (retain 7 for the
  seventh parcel at level 4), including physical top-row and numpad keys.
  Delivered parcels must remain visible at their destination houses; do not
  reveal undelivered destinations.
- **Sixth local playtest:** The user also requests the prepared bicycle workshop
  logic prototype, independently of pending harvest validation. Expose a
  standalone sandbox with levels 0–4; do not enable journey costs/rewards or
  infer approval/publication from this playtest request.
- **Workshop redesign (replaces rejected ledger/token puzzle):** Show a
  graphically assembled bicycle model, and let the player reconstitute it with
  selectable frames, seats, pedals, wheels and handlebars of varying colours and
  sizes, within limited time. User explicitly chooses to keep the reference
  visible alongside the construction, not a memorization phase. Render the
  selected parts on the assembled bike and allow replacement before checking.
  Each part's shelf must include the exact match plus colour and size
  distractors. Local levels offer 3–7 choices per part and 60–36 seconds; start
  timing only on explicit Start, and fail at expiry. This is still a standalone
  local playtest, not journey integration or publication.
- **Workshop visual clarity:** A user round had matching parts except blue
  medium handlebars instead of blue small; their appearance was too similar.
  Distinguish handlebar sizes clearly, show labelled model/fitted part close-ups,
  and explain expected versus fitted colour/size on rejection. Keep exact
  matching and permit correction before the deadline.
- **Workshop approval:** The user validates game 6, requesting sound effects.
  Sound should accompany an actual part change, successful completion, incorrect
  checking and timeout, with local mute. Do not sound on unchanged re-selection
  or category navigation. Cancel, destroy, new round and hidden page stop audio.
  This approval does not authorize publication or journey settlement.
- **Seventh local playtest:** Offer the prepared postcard-sketching prototype
  in a separate sandbox: observe an original motif, hide it, reproduce it
  on the grid, then submit for scoring. Keep levels, keyboard/touch controls
  and no save or journey rewards. This is a playtest request, not validation.
- **Sketch difficulty revision:** Easy was too hard with a fixed 7×7 grid.
  Scale grid size with levels 0–4: 3×3, 4×4, 5×5, 6×6, 7×7. Introduce
  multiple colours progressively (1, 1, 2, 2, 4 after rebalancing), with a selectable palette,
  eraser, and redundant symbols for colour identification. Observation remains
  level-dependent; explain grid, colours and observation time before Start.
  Score exact colour matches, penalize incorrect painted cells, and preserve
  actual grid dimensions and coloured symbols in the standalone sketch output.
- **Sketch balance follow-up:** The user finds level 2 too easy and level 3 too
  hard. Keep their 5×5 and 6×6 grids; reduce level 2 observation from 9 to 7
  seconds. Keep two colours at level 3 rather than introducing a third alongside
  a larger grid, and increase its observation from 10 to 12 seconds. Preserve
  levels 0, 1 and 4, untimed drawing, scoring and hidden-model behavior.
- **Sketch approval and reveal:** The user approves postcard sketching (game 7).
  On submission, reveal the original coloured model alongside the player's
  actual drawing, with distinct labels and matching grid scale. Keep the model
  removed from the DOM during drawing. Approval remains local only.
- **Eighth local playtest:** At the user's request, offer the prepared village
  petanque prototype in a separate sandbox while sketch revision is completed.
  Three boules, direction/power controls, levels 0–4 and no real save/rewards.
  This does not validate either game or authorize publication.
- **Petanque relief and sound:** Add visible bumps and hollows whose local
  slopes actually change boule direction and speed, not decorative markings.
  Difficulty increases their count (2–6) and height. The later heightmap request
  supersedes the initial raised (+) and sunken (−) patch badges. Allow aiming
  ±30° to compensate terrain drift.
  Add original throw, gravel-roll and stopping sounds,
  mute, explicit audio errors and cleanup on cancel, destroy, new round and
  hidden pages. Keep the sandbox isolated; this request is not publication.
- **Petanque opponent and scoring:** Add a computer opponent, three boules per
  side with alternating throws. Both sides use the same terrain simulation;
  higher levels reduce computer aiming error. Count an end by actual petanque
  rules: only the winning side scores, one point per boule strictly closer to
  the jack than the opponent's nearest in-bounds boule. Equal best distances
  draw; out-of-bounds boules cannot score. Maximum three points per side.
  After all six throws, highlight scoring boules nearest first and increment
  the winning score once per highlight. Wait until this animation ends before
  reporting completion. Cancel/hidden/destroy must stop counting without reward.
  A three-minute throw deadline ends incomplete rounds without awarding points;
  a fully played end may finish its counting animation after that deadline.
- **Petanque height colours:** Replace relief badges and decorative gradient
  patches with pixel colours computed from the same local height field as the
  physics: light for bumps, dark for hollows. The arrow separately indicates the
  overall sloped plane. Show clear player/computer colours and turn status.
- **Petanque boule collisions:** The user requests physical contact between
  boules, permitting a JavaScript physics engine if needed. Simulate both sides'
  boules together using equal-mass inelastic impacts, terrain friction and local
  slopes. Support direct hits, glancing deflections, chain reactions and pushing
  a previously played boule out of bounds. Animate every displaced boule while
  preserving owner/number; recompute all distances and final scoring after motion
  settles. Match drawn boule sizes to collision radii (enlarged for legibility),
  and layer metallic impact sounds over rolling without cutting the gravel loop.
  Keep the jack fixed for this boule-to-boule revision, as stated in the UI.
  The bounded fixed-step solver is sufficient; no additional library is required.
- **Ninth local playtest:** At the user's request, expose the prepared
  lost-and-found detective game in its own sandbox. Read fictional reports and
  choose matching objects; levels 0–4 offer 4–8 objects and increasingly indirect
  clues. Three mistakes end the investigation; no timer. Optional thank-you gifts
  are fictional only. No save access, journey earnings, approval or publication.
- **Detective drawings and timing:** The user likes the idea but requests
  illustrated objects and timed play. Replace text-only choices with original
  drawings of all eight variants; moon/star handles, leaf/flower covers,
  fish/bird keyrings and square/round pouch patches must be visibly distinct.
  Use neutral numbered captions rather than giving the answer in visible text;
  keep full object descriptions for screen readers. Superseding the initial
  untimed prototype, give every investigation 90 seconds from explicit Start,
  with a visible countdown and last-ten-second warning. Enforce the exact
  deadline in the engine, including on late clicks. Timeout is incomplete,
  preserves the found count for feedback, and awards no fictional gift.
  Completion, failure, cancellation, hidden pages, destroy and reset stop the
  timer; countdown ticks must not rebuild choices or move keyboard focus.
- **Detective balance follow-up:** The user finds the game too easy and requests
  less time. Reduce the investigation from 90 to 60 seconds at every level;
  preserve the illustrations, clues, three-mistake limit and exact deadline.
- **Detective second balance follow-up:** Still too easy at 60 seconds; shorten
  the investigation to 30 seconds at every level, preserving the other rules.
- **Detective third balance follow-up:** The user explicitly requests 15 seconds.
  Set the investigation limit to 15 seconds at every level; update both languages
  and verify the exact deadline without changing clues or the three-mistake rule.
- **Mini-game help pop-ups:** While playtesting, the user requests removal of
  explanatory prose from all mini-game windows, moving it into help instead.
  Apply across all nine local previews, including cafe/music/theft modal windows.
  Hide rules, keyboard guides, difficulty explanations and sandbox notes from
  the play area; preserve scores, timers, clues, reference drawings, colour
  legends and actionable controls. Provide English/French Help and Close buttons,
  native modal keyboard/focus containment, Escape-to-close without abandoning the
  underlying game, and focus restoration. Keep help current after resets, level
  changes and phase changes. Do not change game timing: timers continue while
  help is open, explicitly stated in the pop-up. No journey integration or release.
 - **Help throughout the main game:** The user approves the Help presentation and
  requests it in every game window. Apply contextual English/French Help to all
  three main screens and eighteen dialogs, including windows without long rules.
  Move general instructions into Help, preserve live information, narratives,
  revealed cards, clues, prices, risks, privacy warnings and attribution links.
  Each window shows only its own help; keep translations and dynamically
  rendered instructions current. Escape or Close dismisses Help alone and
  restores focus without abandoning the underlying window. No publication.
- **User decision:** Implement the ten proposed mini-games sequentially.
  The user now requests the game 10 local playtest: lantern sequence memory,
  five levels, bilingual standalone preview and contextual Help, without journey
  save or reward integration. The initial full-sequence version is superseded
  by the Simon revision below.
- **Petanque high-power contact follow-up:** The user reports a hard throw
  passing through settled boules. Sweep the approach up to its first boule
  contact before starting the shared collision solver; do not skip contacts
  before the nominal landing point. Keep clear throws, computer physics,
  animation and final-position scoring consistent.
- **Petanque approval:** The user explicitly validates petanque after local
  testing, including the contact correction. Approval remains local, not release.
- **Lantern presentation revision:** Replace word-labelled controls with
  original lantern graphics, distinct colours and motifs, and small numbered
  keyboard cues. Preserve accessible names. Add distinct tones during playback
  and each answer; the chosen lantern lights up for 260 ms, including the final
  answer before completion. Provide mute and explicit audio errors; clean up
  sounds and feedback timers on cancellation, hiding, reset and teardown.
- **Game 11 local playtest:** The user requests Bookshop Sorting now. Expose the
  prepared sorting/customer-request game in a bilingual, five-level standalone
  preview with contextual Help, countdown and visible mistake limit, without
  reading or changing journey saves or applying rewards.
- **Bookshop thematic/alphabetical revision:** Do not print the destination
  genre or a position number on each book. Players infer the shelf from the
  theme, then sort its displayed titles alphabetically from left to right,
  using the selected French/English language. The user chooses to include
  initial articles; case, accents and punctuation do not change ordering.
  Replace invented titles with sixteen real public-domain classics, real
  authors and original short summaries/customer clues. The user chooses
  original illustrated covers, not downloaded commercial publisher covers;
  local artwork must work with both languages. Correct the flex-growth bug
  that stretched the last book: all cards have equal widths at every level,
  including incomplete rows. Add selection, placement, service, mistake and
  outcome sounds, a mute control, explicit audio errors and cleanup.
- **Lantern Simon revision:** Start by showing one item, accept the player's
  repeat, then replay the same sequence extended to two, three and so on.
  Required final lengths are exactly 7, 8, 9, 10 and 11 for levels 0–4.
  The user chooses immediate failure on the first wrong answer. Lock input
  during playback and between rounds, retain per-lantern light and sound
  feedback (including the final answer), and count one point per completed
  round. A failed/cancelled or unfinished run never awards a reward.
- **Lantern approval (2026-10-18):** The user explicitly validates the lantern
  game with original graphics, sound and growing Simon rounds. Approval is
  local only, not permission to publish or integrate journey rewards.
- **Arcane Resonance design approval (2026-10-18; implemented for local testing):**
  The user approves one slight gameplay variation per mini-game, active when
  its patron matches either the journey/start card or the daily card. Either
  match activates the same variation; matching both does not stack effects.
  Keep the normal game when neither matches. Announce resonance before Start
  and explain the changed rule in contextual Help, preserving existing levels
  and controls except where the approved variation explicitly changes them.
  The twelve patrons are a subset of the existing 22-card major arcana deck,
  not a replacement deck.
  - Cafe / Temperance: replace the recovery pause with occasional customers
    changing their mind while the player prepares their tray. At half the original
    recipe size, add or remove one item once per eligible customer; the tray and
    deadline stay unchanged. Highlight the revised order and announce the change.
    Eligibility is random per customer: 20/30/40/50/60% across levels 0–4.
    Orders never become empty; clear/rebuild an unsuitable tray as usual.
  - Local playtest approval: the user validated Cafe Rush (game 1) with
    the revised mid-preparation order changes. No publication or deployment
    is authorized by this approval.
  - Local playtest approval: the user validated game 3 (Stealing) during
    the concordance playtest. This does not authorize publication or deployment.
  - Local playtest approval: the user validated Street Music (game 2) with
    the revised resonance demonstration, hidden reproduction hints, green/red
    press feedback and keyboard-focus fix. This does not authorize publication
    or deployment.
  - Local playtest approval: the user validated game 8 (petanque), including
    the revised targeted carreau and randomized difficulty-scaled relief.
    This is not approval to publish or deploy.
  - Music / Judgement: show and play a normal phrase demonstration, then
    reproduce without visual note, timing, hold-progress or release hints.
    Successfully played notes still appear (held notes after successful release).
    Each player press highlights its timeline position green when correct or
    red when incorrect for 350 ms, including presses on rests; upcoming notes
    stay hidden. Hold starts and releases also receive correctness feedback.
    Keep keyboard focus inside the music dialog during the demonstration
    (the note button is disabled), so Space reaches reproduction reliably.
    Show an explicit demonstration/reproduction phase label.
    Remove the ending/opening phrase link; play every note normally.
  - Theft / The Devil: keep the ordinary green success target and add a
    narrower gold target offering a modest additional reward; one press only.
  - Deliveries / The Chariot: let players mark their own destination order
    during memorisation; retain that faint route while riding, without
    revealing the hidden parcel-to-house assignments.
    During concordance deliveries, holding Space for 3 seconds toggles the
    optional route home once, without delivering. A shorter press delivers on
    release. Normal mode still delivers on press. Show the control on the
    route button and in bilingual Help; ignore key repeat and cancel pending
    holds on focus loss, cancellation or teardown. Tab retains focus navigation.
    Display live Space-hold progress and explicit shown/hidden route status
    outside Help; toggling the route must not rebuild the focused controls.
    Local playtest approval: the user validated game 4 with Easy increased
    from 3 to 4 parcels; other levels remain unchanged. This does not authorize
    publication or deployment.
  - Harvest / The Empress: replace the next-bunch preview and continuous
    horizontal position with randomly placed rotten bunches at frequencies
    2/16, 3/16, 4/16, 5/16 and 6/16 across levels 0–4. Mark rot visibly and in
    accessible labels. Hold Space or the drop button for 0.5 seconds on any
    bunch to squash it (+1 if rotten, no point if good). A short release
    triggers a fast fall instead. It keeps falling during the hold.
    Rotten grapes landing in any basket subtract one earned point,
    clamped to zero. Require a fresh press for each bunch; no repeat farming.
  - Harvest timed-shift follow-up (supersedes the earlier fixed 16-bunch round):
    every level and both modes last exactly 30 seconds (revised from 60), with an ongoing stream
    of bunches. Tap and release Space or Drop for a visibly accelerated fall
    lasting at most 160 ms (never slower than natural landing), score normally,
    and start the next bunch at landing. Squashing
    rotten grapes also starts the next bunch immediately. More correct sorting
    earns more paid points; remove the proposed +25% speed multiplier entirely.
    Keep the non-stacking concordance ×1.1 gain multiplier. Show remaining
    seconds, paid points, bunch count and hold progress; support keyboard,
    mouse and touch, and cancel holds on focus loss and teardown. The standalone
    preview reports potential earnings only and never pays a journey save.
    Use a distinct generated squish sound for both good and rotten grapes.
    - Local playtest approval: the user validated Grape Harvest (game 5),
      including the 30-second shift, visible fast fall, 0.5-second squash,
      squish sound and concordance rotten grapes. This does not authorize
      publication or journey settlement.
  - Workshop / The Magician: one correctly sized part must be repainted to
    match the visible model. Any fitted part in any category can be repainted,
    including wrong-sized parts; painting changes colour only, never size.
    Show the palette for every category in concordance; disable until fitted.
    Remove the lower per-part model/installed comparison and written target
    colour/size answers. The assembled drawings at the top are the visual
    reference. Wrong-check feedback may name mismatched parts, not reveal
    their required colour or size; retain accessible descriptions of drawings.
    - Local playtest approval: the user validated Bicycle Workshop (game 6)
      with concordance, repainting any fitted part and the drawing-only visual
      reference. This does not authorize publication or journey settlement.
  - Postcard / The Star: highlight three landmark cells during observation;
    retain their positions, not colours, as faint stars during drawing.
    Correctly painted landmarks reveal a connecting constellation.
  - Petanque / Strength: superseding the rejected low-power preview, use
    Main sure / Steady hand then select a settled in-bounds boule to attempt
    a carreau once per match. No power restriction. Success replaces the
    target exactly and ejects it out of bounds; failure sends the thrown
    boule out and leaves the target untouched. Consumes a remaining player
    boule and the single attempt. User-selected probabilities for levels
    0–4: 75%, 65%, 55%, 45%, 35%. Cancelling target selection costs nothing.
    Freeze the random draw per match, animate both outcomes, retain ordinary
    collision physics for normal throws and score final positions.
  - Lost and Found / The Moon: one similar-looking pair requires inspection
    of a visible distinguishing detail before confirming a choice. Inspection
    is not an answer; the existing 15-second timer continues.
  - Lanterns / The Hermit: hide lantern drawings and numbers during playback;
    show only a small spark at each played position with its tone, without
    a connecting line or travelling positional trail. The user supersedes
    the cosmetic glowing-trail version and rejects sound-only as too hard.
    Restore lanterns and numbers for answers; dim the background and let the
    selected lantern illuminate the scene. Preserve Simon lengths and sounds.
  - Bookshop / The High Priestess: retain thematic/alphabetical shelving;
    one customer's personal wish accepts a deliberately authored set of
    appropriate books, with explanatory feedback, rather than one plot clue.
  - Market / Justice: replace one count-based produce line with a weighing
    interaction using standard weights; update its price automatically, then
    return change normally.
- **Resonance presentation and gains (2026-10-18; implemented for local testing):**
  Show the matching patron card faintly behind the mini-game as a huge, blurry
  background watermark, using the existing historical artwork. The user
  explicitly requests an enlarged, cropped, blurred background rather than
  a small readable card. Keep all controls,
  objects, clues and text legible; the decorative card must not intercept
  input or be announced redundantly by screen readers.
  Multiply eligible mini-game gains by exactly 1.1 (+10%) when resonance is
  active, once even if both cards match. Apply this to gains, not raw scores,
  costs, penalties or failure/cancellation outcomes, preserving existing
  reward eligibility. Use the existing currency precision/rounding rules.
  Keep the Devil's gold-target reward distinct from this shared multiplier.
- **Game 12 local playtest (2026-10-18):** Prepare Market Stall before testing
  with original product, basket, coin and note graphics, action/outcome sounds
  and mute. Expose five levels, English/French contextual Help and explicit
  Start, without reading journey saves, making real purchases or applying
  journey rewards. Include Normal/Journey/Daily/Both resonance test modes;
  Justice weighs one product for the first customer with add/remove standard
  weights, a visibly tilting balance and a live packed price. The other
  products and subsequent customers retain normal quantity/change rules.
  Validate perfect flows at all five levels, wrong quantities/change/weight,
  three mistakes, exact timeout, cancellation, focus, sounds and cleanup.
  This is preparation for user testing, not user approval or publication.
- **Market decimal formatting (2026-10-18):** Display all French monetary
  amounts with a decimal comma and exactly two cent digits (for example,
  `3,10 €`), including live totals, unit prices, cash and denomination labels.
  English retains the decimal point; engine amounts remain integer cents.
  The change-entry field displays euros with two decimal places, not raw
  cents (505 cents appears as `5,05` in French). Accept comma or point with at
  most two decimal digits, explicitly reject invalid amounts, and keep coin
  additions and Clear synchronized with the localized euro field.
- **Market finite drawer and customer extra coins (2026-10-18):** The user
  requests a limited cash drawer so denomination choice matters. They choose
  one drawer across the entire shift, replenished by actual customer payments,
  not reset between customers. Show available/selected counts for every
  denomination; selecting reserves cash, removing or clearing returns it,
  and a successful service deducts the exact chosen denominations once.
  An entered euro amount may be composed only from the finite available stock.
  Generate a solvable initial float for every level and order rotation.
  The user chooses requesting a specific extra amount from the customer,
  rather than revealing their purse. Customers have finite authored purses
  and can refuse without consuming a mistake. Accepting transfers real coins
  into the drawer, consumes that purse inventory and increases both received
  cash and change owed by the same amount. Repeated requests cannot invent
  cash or increase earnings. Limit each request to 5 euros; keep the running
  timer and normal wrong-change/mistake rules, weighing and resonance.
- **Market Easy balance and extra-amount controls (2026-10-18):** Increase only
  level 0's initial change reserve by four additional coins each of 5, 10, 20
  and 50 cents (+3.40 euros versus the previous Easy float). Other levels
  remain unchanged. Add minus/plus five-cent buttons beside the extra-amount
  field, localized in French/English, bounded to 0–5 euros. These buttons
  edit the requested amount only; the player still explicitly asks the customer.
- **Market approval (2026-10-18):** The user explicitly validates both the
  normal and Justice-resonance versions of game 12, including the finite
  drawer, customer extra-coin requests, increased Easy float and five-cent
  adjustment controls. Approval is local only, not permission to publish.
- **Bookshop approval (2026-10-18):** After reviewing the Papesse concordance
  rule, the user explicitly validates game 11. Approval remains local only,
  not permission to publish.
- **Lost and Found approval (2026-10-18):** The user explicitly validates
  game 9. Approval remains local only, not permission to publish.
- **Lantern concordance approval (2026-10-18):** The user explicitly validates
  game 10 after the Hermit revision: lanterns and numbers hidden during
  demonstration, small positional sparks with tones, and lanterns restored
  for answers. Approval remains local only, not permission to publish.
- **Petanque randomized relief (2026-10-18):** Randomize both the count and
  positions of bumps and hollows for each new match, increasing the count
  ranges strictly with difficulty: 2–3, 4–5, 6–7, 8–9, 10–11. Sample distinct
  ground areas with positional jitter so opposite features cannot cancel at
  the same centre. Keep terrain fixed during a match and shared by player
  and computer. Render the actual height field and show the drawn count in
  Help; both normal and resonance modes use the same generation.
- **Sequential playtesting:**
  Finish one, let the user test it on the local server, and do not start
  the next until the user explicitly approves. No automatic publication.
- **Updated workflow:** After publishing the journey map and R-113, develop
  the remaining mini-games in parallel isolated worktrees, one agent per game.
  Keep individual local playtest approval before enabling or publishing each;
  parallel preparation does not waive the approval gate.
- Proposed order: Cafe rush, village deliveries, market stall, harvest
  baskets, bicycle workshop, postcard sketching, village petanque,
  lost-and-found detective, festival lanterns, bookshop sorting.
- The harvest mini-game includes paid vineyard grape harvesting, including
  rural cells, as requested in R-115.
- Start with Cafe rush, available only at mapped cafes/restaurants in the
  player's current cell. Support both keyboard and clickable controls.
- Cafe rush orders contain at least three items, even at the easiest level,
  with different order sizes during each shift. Show repeated ingredients as
  `Coffee x2` or `Coffee x3`, rather than repeating their names. Use square
  ingredient buttons with gaps between rows, and an illustrated serving tray
  that reflects the assembled items, retaining an accessible text equivalent.
  Give each ingredient a fixed tray position, with a large drawing and an
  overlaid quantity badge rather than many small repeated drawings.
  The serving tray has a 4:2 (2:1) width-to-height ratio.
- Slightly shorten customer patience for more challenge (14 seconds at level 0,
  falling to 8 seconds at level 4). Play a pickup sound only when an item is
  actually added, and a noisy cafe background during the shift. Respect shared
  mute/volume controls; stop sound on completion, cancellation or hidden tab.
- Practice improves skills: higher skill makes the mini-game harder but
  increases potential pay. Save progression with the journey.
- Apply the same progression to existing street music: more notes with
  higher skill and higher potential earnings. Preserve tarot effects.
- Music difficulty must also increase tempo and retain rests, rather than
  making every slot a predictable tap. Add 2-, 3- and 4-beat held notes at higher levels:
  hold Space (or the pointer/touch button) and release at the indicated time.
  Light must progressively fill the held-note bars with elapsed time, even
  before input. Accept releases up to 300 ms before or after the expected end;
  releases outside that margin fail the note and count as mistakes. Keep the audio,
  visual cues, scoring, cancellation and starting-card mistake limit consistent.

## R-112 - More uses for money, including paid information

- **User request:** Give money uses beyond food and hotels; sometimes let
  the player pay or bribe people for clues.
- **Status:** Gameplay direction to design and implement later, not an
  already implemented interaction or an approved price/balance scheme.
- Candidate paid-information encounters: buy someone a coffee, pay for an
  introduction, or encounter a fictional witness demanding a bribe.
  Clearly distinguish paying for information from a guaranteed truthful clue.
- Other proposed uses, still to evaluate: laundry/showers, luggage storage,
  notebook/photo copies, shoes, rain protection, blankets and instrument repairs.
- Design principle proposed for these options: money buys time, comfort or
  better chances; retain a free way to advance the main investigation.
- **Explicitly later:** Add buses and trains as paid transport, trading money
  for time and reduced walking fatigue. Do not add transport as part of the
  current mini-game implementation.

## R-113 - Obvious death popup with the Death tarot arcane

- **User request:** Death is not obvious enough. Display a dedicated popup
  with the Death tarot arcane when the character dies.
- Show the existing historical Death card (arcane XIII), an unambiguous
  localized death heading and the actual recorded cause.
- **Additional user request:** Replace the character's map marker with a cross
  at the final position when they die, then slowly fade the game scene to black.
  Keep the Death-card popup and its controls readable and usable above the fade.
- Treat the card as death-event artwork, not a new birth/daily tarot draw:
  do not reroll cards, change their effects or invent a notebook draw.
- Preserve the terminal journey state and existing abandoned-notebook
  behavior. Do not label recoverable fainting, foyer placement or successful
  reunion as death.
- Closing the popup restores access to the notebook and new-journey controls,
  without reviving the character. Respect reduced motion; image failures remain
  visible with a retry action. Reopening an ended save shows the death notice.

## R-103 - Abandoned journals and independent side quests

- **User request:** On a failed game over, leave the quest journal at the
  player's location and persist it on the server. Another player or a later
  run can find it, finish finding its owner's parent and return the journal.
- Updated user decision: leave the entire notebook, including pinned photos,
  handwritten notes, tarot and clues, at the player's last position on death
  or starting over. A new journey gets an empty separate notebook. Warn that
  the full abandoned content becomes readable by other players.
- Finding a journal adds a delivery side quest and must not replace or alter
  the finder's own parent search.
- Claim each journal atomically on the server for one finder at a time.
  Release after seven days without playing, and immediately when that finder
  dies. Persist progress and handle reloads, retries and concurrent pickups.
- Arcane-object searches are also side quests. Their gameplay is explicitly
  deferred; do not implement it as part of abandoned-journal delivery.
- A separate capability-protected SQLite store retains immutable deposited
  notebook snapshots; journey genesis is unchanged. Nearby journals (200 m)
  can be claimed then read without editing in the SIDEQUEST panel. Visit each
  remaining town (350 m) to return the journal, without changing the finder's quest.
- Capabilities are generated and durably saved before creation requests; they
  never appear in public journey lookups. Legacy saves receive a separate
  random notebook-keeper identity and secret, not ownership of their public
  genesis ID. Complete deposits use a durable IndexedDB outbox across reloads.
  Starting over waits for successful publication; offline death release takes
  effect on reconnection. Seven-day expiry is enforced by the next request.
- Delivery uses the abandoned quest's fixed itinerary up to the parent's
  position at abandonment, including mobile parents; it does not simulate a separate moving NPC
  or generate another routed parent path. Coordinates and town names provide
  manual navigation. Gameplay positions/outcomes remain client-reported, like
  the rest of this unauthenticated prototype; capabilities prevent another
  player using a public journey ID to mutate its journal or claims.

## R-106 - Weather beside the agenda and clock

- Display weather and temperature beside the agenda and clock in one panel.
- Color its background with the estimated temperature at the player's position:
  freezing blue, cold blue-green, mild green, warm amber and hot red.
- Show decorative water drops during rain or storms, remove them when dry
  or weather is unavailable; keep temperature and condition readable as text.
- Put temperature/rain effects in a hover/keyboard-focus tooltip. Move the
  sun/moon position into the panel background and remove the separate sky panel.
- Compact two-column layout: smaller unbroken date on the left; analog clock,
  weather and condition stacked on the right. Remove digital time and permanent
  fine print; keep estimates, ranges and sources in the weather tooltip.

## R-105 - Dated clue pages and top investigation button

- Date clues in game UTC and order all clue types newest first.
- Keep a page per stage; mark a physically reached destination, immediately
  open a fresh page for the next lead without advancing the quest before
  investigation, and retain navigable archives. Final reunion needs no further lead page.
- Keep the investigation button and concise costs at the top. Long rules
  stay collapsed. Unknown dates in older saves must be labeled, not invented.
- Updated layout decision: separate Current clues, Investigate and Past
  destinations pages. Open on current clues and keep paid actions separate.
- File clues by the destination they concern, not the town where obtained;
  merge pending discoveries with dated evidence and label the latest dated clue.
  Show dates first, undated entries last and parent visit details only in the
  corresponding past destination, without revealing unconfirmed future names.

## R-109 - Layer 10 pressures and direct tarot effects

- Confirmed: two recoverable foyer episodes, with lost time and some money;
  the third placement ends the journey.
- At 100 vigilance: one indoor day, food and rest, loss of 25% of remaining
  money rounded down, no reward/clue/progression from the interrupted action.
  Preserve the notebook and quest after recovery; keep the last position.
- Vigilance responds to sector dwell time, urban/police context, fatigue,
  cleanliness, begging and theft. Moving, shelter and paid washing offer
  explicit counterplay. Sympathy uses condition and bounded local reputation,
  affecting assistance and music. No layer-17 language skills.
- Both birth and daily cards directly modify vigilance growth, cleanliness
  decay, sympathy and witness forgetting. Show numerical combined effects;
  daily draws update future actions, never historical evidence.
- Confirmed: collected clues stay intact. Newly obtained information loses
  precision as witnesses forget, using recorded chronology when available.
  Preserve collection-time metadata; local searches within 3 km always
  identify the destination when completed, preventing an aging dead end.
- Pressure state persists with strict validation and legacy-save support.
  Terminal placement uses the existing abandoned-notebook lifecycle.

## R-110 - A dedicated notebook statistics page

- Keep live journey statistics on their own notebook page, separate from
  photos and tarot pins, with navigation at the top.
- Show distance/time/elevation, needs, current money, reached destinations,
  action counters, pressures and both cards' current effects.
- Read existing saved state; never expose future destinations or invent
  totals not tracked by the game.
- Keep photos, drafts, credits and journey ownership intact. Personal live
  statistics are not included in another player's abandoned notebook.

## R-108 - Search even before the reference path is known

- Do not block field clue searches on a pending, failed or busy route worker.
- Use the known destination's straight-line distance for this search mode,
  explicitly label it, preserve normal action costs and never fabricate a path.
- Keep malformed responses, unknown journeys and network errors explicit
  and free of action costs.

## R-107 - Ask directions to previously cited towns

- In I, let the player choose towns named in earlier witness suggestions,
  precise clues and reached destinations, including previous quest stages.
- Label town choices by stage and known/visited/unconfirmed status. Never
  expose unrevealed town names from the hidden itinerary or vague clues.
- Use the existing paid directions encounter (10 minutes, 2 fatigue,
  terrain-dependent chance) and show bearing, distance and coordinates from
  the current position. This is not a guaranteed walkable route.
- Keep uncertainty explicit: asking a town's location does not confirm it
  as the parent's destination, advance the quest or replace the active target.

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

## Clue dialog responsibilities

- **User clarification:** J opens the parent trail to search for new clues.
  I opens conversations about clues already collected, such as a town-name
  fragment or a photo. Recognition actions belong in I, not in J's history.
- Keep collected evidence readable in J and allow selecting each current
  fragment/photo in I. Preserve recognition uncertainty, action costs,
  cancellation, save compatibility and the existing known-place directions.
  Shortcut labels and help must describe this distinction in FR and EN.

## R-100 - Green success and red failure feedback

- **User request:** Sentences indicating success should be green; failures red.
- Classify from actual result state, never by matching translated text.
  Apply to hospitality/worship, survival choices, music rewards/failures,
  field searches/directions, saves, lodging lookup and photo-notebook actions.
- Keep loading, instructions and unconfirmed clue suggestions neutral.
  Errors and failed actions remain readable explicit messages/alerts: color
  supplements the wording and is not the only indication of outcome.
- Use accessible light green/red on the dark UI and darker green/red on the
  notebook's light paper. Clear old outcome colors when messages reset.

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
- While searching, keep the search control usable as "Cancel search" rather
  than greying out an unchanged label. Explain the four-minute maximum wait,
  confirm cancellation and permit an immediate retry. Ignore late replies
  from cancelled searches without interrupting a newer lookup.
- Show the server's actual search stage (queue, available maps, OSM source,
  supplementary catalogue, distance filtering or cache write), the queried
  provider when available, and elapsed search seconds. Update while polling,
  discard progress from cancelled/previous searches, and do not invent a
  completion percentage or imply that an unimported catalogue was queried.
- Immediately scan the browser's loaded base map and surrounding chunks
  without a network request, then show additional server-cached lodging as
  soon as polling returns it. Label these lists provisional while the online
  search continues; preserve them on cancellation or source errors. Apply
  the same 5 km limit, real-place filters, credits and exact-cell sleep rule.
  Final server results replace the provisional list; no cache deletion or
  fresh chunk download is required for this first pass.
- **Agreed follow-up, not active:** Only after the user confirms that nearby
  accommodation discovery works, reduce fictional hospitality acceptance.
  Use base refusal probabilities of 0.8 for locals and 0.7 for places of
  worship with the existing birth-card/day-card event modifier. With the
  current deck, acceptance ranges are respectively 12-44% and 23-51%.
  Preserve stable place/day draws, saved outcomes, request costs and daily
  limits. Paid lodging is unaffected. Do not activate before confirmation.
- Optional administrator-imported DATAtourisme data supplements sparse
  mainland-France OSM coverage. No player-triggered downloads/imports or
  catalogue/cache deletion. This French source is not worldwide coverage.
- List at most 40 nearest results. A listed place only becomes a sleep action
  in its actual cell; existing prices, time costs and recovery still apply.
  Searching itself does not spend in-game time or money.

## R-098 - Pin any photo into an open spiral notebook

- **User request:** Any browsed photo, including map photos and clue photos,
  can be pinned into a journal. Opening the journal should look like an open
  notebook with a central spiral. Photos have a white frame with a handwritten
  note underneath.
- Add a persistent browser-local photo notebook, available from the header
  with A. Two paper pages flank the central metal binding. Pinned photographs
  appear as white prints; each has an editable handwritten-style caption.
- Pin the actual displayed image, source, author and license. Keep vague clue
  photos uncaptioned; do not reveal their geographic title in the notebook.
  User-written notes do not count as confirmed quest evidence.
- Store independent copies of pinned blobs/notes in a dedicated IndexedDB
  database, not the disposable content cache or the journey's localStorage
  save. Clearing the content cache must not erase the notebook. This notebook
  is now scoped per journey (R-103); its full snapshot is shared only when
  abandoned, while a new journey starts without the old photos or notes.
- Deduplicate by source URL without overwriting existing notes. Save notes
  when leaving their input or pressing the save button. Retain unsaved drafts
  when turning pages and changing language. Removal requires confirmation.
- Show only two photos at a time, release object URLs on page change/close,
  and report storage, quota and image failures explicitly. Preserve keyboard
  controls, credits and responsive layout in FR/EN.
- Fix related field-photo visibility: the photo viewer must not live inside
  the hidden town-discovery section when there is no town encounter yet.
- A whole-tab freeze while loading photos was reported. Normal five-photo
  browsing and clue-photo rendering did not reproduce it; do not claim that
  the visibility fix proves the reported browser freeze is resolved.

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
  and PDF-export design. The later explicit R-103 decision permits free-text
  notes to be shared as part of an abandoned notebook.

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
- Initial frequency, effects and combined-card balance are defined in R-120;
  terminal survival rules remain unchanged.
- **Status:** Local Layer 13 implementation under R-120; no production release.

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

## R-104 - Historical tarot illustrations and automatic notebook pins

- User chose historical public-domain Tarot de Marseille illustrations.
- Replace birth/daily ASCII reveals with the complete Jean Dodal major
  arcana deck and historical back; ship the images locally with provenance.
- Automatically retain the birth draw and each revealed daily draw in the
  notebook, recording role, name and game date with an editable interpretation.
- Distinguish draws by journey, role and date, even when the same card returns;
  retries and resume must not overwrite notes or duplicate a draw.
- On resume, recover the birth card and currently acknowledged daily card.
  Do not invent earlier daily draws missing from old saves.
- Preserve tarot probabilities and character rules. Storage/image errors
  must be visible, offer retry and not block gameplay.

## R-077 — Visible food-search and manual-save results

- **User reports:** Food-search results are hidden at the bottom of the
  window; pressing Save gives no visible confirmation.
- Put cell-action outcomes/errors above actions, focus and scroll the feedback
  into view after a search. Preserve status/alert semantics and all costs.
- Manual Save (button or S) shows a fixed visible confirmation with actual
  saved time, explicitly local to this browser, only after successful storage.
  Write errors show an alert, never success. Repeat saves reannounce feedback;
  next gameplay autosave or leaving clears the manual confirmation.
