# Town legends: implementation plan

Reference: [R-190](./REQUIREMENTS.md#r-190---town-legends-and-treasure-adventures).

## Current increment: carried cosmetic treasures

The inspected entrance now offers treasure-bearing eight-room platform,
investigation and dungeon sessions (`treasure-platform-v1`,
`treasure-investigation-v1`, `treasure-dungeon-v1`). They replay the paced engines
and settle only at the end. Existing trials retain their no-reward behavior.
Final replay must complete without survival interruption. Only one original
exists per town, regardless of selected format or simultaneous explorers.

First recovery and all later custody changes live in the artifact world's
existing transaction, including receipt replay and the authoritative journey
inventory. Treasure records keep the first claimant independently of their
current holder or deposited location. No new cache or secondary database write
can split completion from the award. Existing worlds default to no treasures.

Rewards compose four physical natures with sixteen original visual themes:
Last light, Moonlit paths, Wild garden, Copper embers, Tidekeeper, Roseglass theatre,
Amber caravan, Porcelain morning, Autumn letters, Northern ribbons, Clockmaker's
road, Lavender dusk, Ink and rain, Coral harbour, Mosaic courtyard and Stargazer's
vigil. Each supplies a complete terrain/site tileset with structural edging
differences, an interface skin for panels/controls/colours, adventure sprite colours
and coordinated masonry/props/edging. Mapped water and transport
remain distinguishable; collisions, difficulty and selection markers do not change.
These initial bilingual names are procedural, not LLM item-name output.
New IDs use the `:v2` catalogue suffix; unsuffixed originals retain the pinned
four-theme assignment, physical nature and composed name. Claim uniqueness still
uses the town, so catalogue expansion cannot produce a second original.

All rewards—including cosmetics—occupy ordinary inventory cells and weight.
Inventory shows their real map/adventure previews and equip, pack and deposit
controls. Interface skins and map/adventure looks have separate equip/remove
controls and may use different carried items. UI skins also work with ASCII maps.
Eight collectible player icons add a third independent equip/remove control:
lantern wanderer, star watcher, woodland ranger, copper smith, tide sailor,
travelling bard, letter courier and wandering alchemist. Explicit theme-to-icon
assignments supply every icon through an existing treasure, including older
originals, without changing reward IDs or physical properties. Shared pixel data
drives inventory previews, live SVG overlays and captured notebook icons. Icons
work on ASCII and pixel maps; default/forced-colour rendering keeps `@`, death
keeps its cross and location accessibility/selection outlines remain intact.
Only a carried item enables its look. Deposit immediately removes its selected
skin/look without affecting a different carried source;
another journey may collect and equip the same original. Mapped settlements,
buildings, churches, stations and named mapped sites accept deposits. Refreshing
Artifacts at that location exposes pickup. The existing browser ASCII/Path Pixel
preference is restored on unequip, deposit or journey change. Frozen notebook maps
retain their captured appearance rather than taking the current journey's look.

Insufficient space/weight leaves the recovered original at the entrance, with an
explicit outcome and pickup action. A finished/abandoned journey releases carried
treasures at its last settlement, reusing the existing 30-day custody cleanup.
The approximately 100-object catalogue, gameplay attributes, LLM names, adventure
offerings and moderated carvings remain future increments.

Validation: the player-icon increment passes **282 focused JavaScript tests and
41 Python tests**, following the earlier skin increment's 253 JavaScript and
98 Python tests. Coverage
includes all three treasure completions, no-reward trial compatibility, forged
inventories, interrupted/invalid transcripts, simultaneous first claims, shared
catalogue receipt replay across API instances, deposit/transfer/reload, death and
treasure-only abandonment, spatial/weight limits, cosmetic ownership and captured
notebook appearances, independent UI/map selections and diagnostic snapshots.
Browser checks cover all sixteen UI palettes, separate equip/remove controls,
ASCII compatibility and FR/EN 320/390 px layouts with 48 px buttons and no
horizontal overflow. Icon checks additionally exercise SVG decoding, independent
three-source selection, drop reset, the death cross and forced-colour text fallback.
Earlier browser verification uses the real local reward API for
completion, inventory preview, equip, deposit and pickup; FR/EN at 320/390 px has
48 px action targets and no horizontal overflow. No provider request is needed
for these initial cosmetic assets or rewards.

## Previous increment: retained town stories and NPC retellings

Prepared eligible towns offer an explicit Quests story button and a local-legend
conversation topic. Neither arrival nor Look starts a provider call. The existing
optional live-text queue generates one bilingual story and exactly three bilingual
witness accounts: practical, sentimental and sceptical. Character identity/role
selects a stable perspective; every account appends all canonical entrance clues
verbatim. Quests also keeps those clues independently of generated prose.

Only a bounded public memory premise enters the provider. Player identity,
private capability, journey/town identifiers and hidden entrance coordinates do
not. SQL-backed queue input pins the premise before dispatch; the town owns the
retained attempt, shared across authorized discovering players and server restarts.
Wording revisions cannot silently regenerate an existing story. Structural
validation rejects malformed, duplicate, truncated or out-of-bounds output; it
does not prove semantic compliance with every prompt constraint.

Disabled, queued and failed states are visible. Failure or interruption never
automatically spends another call, and cannot block the entrance search or change
its facts. The current story deliberately leaves its memento unspecified.
The initial procedural treasure catalogue and atomic claims are described above;
larger natures/attributes and generated item names remain pending.
Cell descriptions remain procedural, not individual model calls.

Legend panels, NPC accounts and Look observations stay in-world: no repeated
fiction disclaimers, AI labels, grid-distance instructions or rule explanations.
Clues use nearby directions, natural terrain descriptions and remembered details.
They are rendered from retained structural facts, including for older searches;
entrances, scene descriptions and private discoveries never reroll. Any general
disclaimer belongs at the start, if needed, rather than inside the story.
Technical failures remain explicit; trial availability, costs and no-reward terms
remain separate from the narrative.

Narrative regression validation: **328 JavaScript tests and 132 Python tests pass**.
The immersive-copy follow-up passes **143 JavaScript tests and 26 Python tests**,
including all eight bilingual directions, exact clue facts and old retained-copy
replacement without changing discoveries. Browser checks at 320/390 px in French
and English retain three NPC voices, 48 px buttons and no horizontal overflow.

## Previous increment: terrain-grounded entrance discovery

Eligible town discovery now prepares a retained search plan, not an instant
trial button. Quests supplies three bilingual clues; Look reveals fictional
landmarks on nearby prepared terrain, keeps observations, and offers inspection
only while standing on the matching cell. After inspection, the existing
confirmed eight-room/no-treasure trials become available at that entrance.
New paced starts enforce this through the API. Earlier session versions keep
their start/recovery behavior; adventure replay/entry/final costs are unchanged.

Preparation uses up to 48 dry cells connected to town by orthogonal movement
inside a three-cell radius, excluding water, rail, major roads and unavailable
terrain. Fewer than four candidates leaves an explicit pending/retry state.
The first successful plan fixes the cells, entrance, clues and descriptions in
the durable shared catalogue. Observations/inspection are private per journey.
Retained map geometry translates geographic cells across regional grid origins.
Content-cache refreshes cannot reroll the search.

Variety is structural: 48 landmark types in six compatible terrain groups,
16 marks, eight materials, six carriers, six counted-detail patterns and
shuffled condition/trace bags. Compatible landmarks are exhausted before reuse
and cannot repeat adjacently, including bag boundaries. Every local signature
is unique. These descriptions are generated procedurally without model calls,
not presented as LLM output or real mapped structures. Shared town prose and NPC
retellings are now implemented separately above; treasure custody remains pending.
The isolated adventure preview explicitly starts inside; it does not simulate
this journey entrance search.

Validation: **198 combined JavaScript tests and 73 focused Python tests pass**.
The variety fixture checks 9,216 scenes across 192 town/terrain combinations:
all 192 entrance descriptions and structural entrance combinations are distinct,
all local signatures are unique, and compatible landmark bags exhaust before
reuse without adjacent repeats. Coverage includes dry-route connectivity,
private evidence, shared/restarted/concurrent preparation, pending retries,
cross-origin geographic conversion, forged/remote inspection rejection and
actual paced API entry gates, plus stale UI replies and cost confirmation.
Browser fixtures use the real temporary SQLite-backed search API and journey UI
modules: remote Look, physical-position inspection, confirmed trial selection
and fresh-UI recovery pass in FR/EN at 320px and 390px, without overflow and with
48px button targets. They do not simulate actual overworld walking or physical
multitouch. Remote PostgreSQL/S3 and deployment are not exercised.

## Previous increment: paced mechanical difficulty

Length remains **8/16/32 mandatory rooms**; difficulty now follows a shared
bounded curve rather than increasing reaction speed with treasure value.
The first four rooms introduce all families once; subsequent rooms develop and
combine familiar mechanics. Rooms 7/15/23/31 provide safe required-route breathing
spaces and the final room combines known mechanics. Complexity is capped.

- Platforms require multiple distinct objects, with varied lever/key positions.
  Combined rooms add an elevated jump-bell and telegraphed spikes with at least
  140 safe ticks in a 240-tick cycle. Breathing rooms have no required-route
  hazards; individual activations survive retries and revisits.
- Dungeons combine independent key/switch/block latches, avoidable spikes and
  three patrol geometries. Introductory and breathing rooms have no creatures;
  breathing rooms have no spikes. Combat remains optional and food unchanged.
- Investigations link later seals to earlier solved sites' retained marks, using
  explicit matching or next-symbol cycle rules. Sequences expand to four/five
  steps. Wrong seals retain all evidence and base-puzzle progress; archives and
  hints remove forced backtracking and guessing.

New trials use `seeded-platform-v2`, `seeded-investigation-v3` and
`seeded-dungeon-v4`. All earlier protocols retain their original generation and
replay behavior, including the first local versions below. Local/end-only
settlement and reload-to-entrance accounting are unchanged.

Validation: 192 combined JavaScript tests and 65 focused Python tests pass.
Coverage includes deterministic template combinations across 32 seeds and all
tiers, actual zero-damage platform routes across eight seeds/all tiers, unarmed
zero-damage dungeon routes across four seeds/all tiers, linked investigation
completion/wrong answers/revisits across 16 seeds/all tiers, partial latches
surviving retry/revisit, matching local/final settlement and persistent receipts.
These are representative route checks, not exhaustive state-space proofs.
Browser checks cover 36 format/tier/language combinations at 320px and 390px,
without overflow and with spatial 48px direction targets. Actual controls
complete an eight-room paced platform route, a 32-site French investigation
(including wrong seals and hints), and a 32-room unarmed dungeon; the platform
and dungeon routes take no damage. Synthetic platform frames exercise the
normal keyboard controls; overridden frame globals and fixture nodes are
restored/removed afterwards. No deployed API or physical multitouch is tested.
Subjective long-adventure balance and real touch timing still need playtesting.
No live treasure, generated town narrative or cross-adventure signature history
is added. Not deployed.

## Previous increment: local play and longer adventures

The latest user decision supersedes the earlier per-action trial architecture:
all three formats play locally and settle a bounded deterministic input replay
only when completing, leaving or being interrupted. Initial entry is paid on
the server. No position/puzzle updates are sent while playing; platform physics
remains continuous at 60 Hz. Ordinary survival and capped food are simulated
locally with the same settlement helpers used for final authority.

Reload discards unfinished progress and effects, including damage and food, but
not the entry charge. Recovery offers a fresh paid entrance or leaving without
another charge. Only a submitted final receipt is persisted/retried; unsent
gameplay is memory-only. Closing the panel on the same page does not abandon it.
Existing four-room protocols remain compatible for already-started runs.

Modest/notable/exceptional profiles now require **8/16/32 mandatory rooms** in
every format; optional platform branches do not count. New live trials use the
modest eight-room profile, permanent town seed and pinned usable inventory knife
for dungeons. Its versions are `seeded-platform-v1`,
`seeded-investigation-v2` and `seeded-dungeon-v3`. Treasure assignment/claims and
the richer production variety contract remain pending. Earlier checkpoints
below record historical four/eight/twelve-room profiles and per-action syncing.

Validation: 182 combined JavaScript tests and 65 focused Python tests pass.
Coverage includes complete eight-room transcripts for all formats, matching
local/server survival, paid restart, discarded unfinished food, bounded and
malformed inputs, terminal locks and persistent duplicate receipts/server restart.
Existing four-room generator/transcript fixtures remain pinned. Preview traversal
tests also complete the expanded 16/32-room profiles.

Browser fixtures check all three profiles/formats in FR/EN at 320px and 390px
(36 render combinations), without overflow and with spatial 48px direction
controls. A local eight-site investigation completes with one final request;
dungeon food/reload/restart/leave follows the approved accounting; synthetic
platform frames move continuously and stop when their panel is hidden.
Browser fixtures use the canonical JS transaction code, not a deployed API;
Python tests separately exercise actual persistent API transactions. Physical
touch timing and subjective long-adventure balance still need playtesting.
Not deployed.

## 1. Prove both adventure loops

Build an isolated FR/EN preview with one authored legend, several witness
accounts and a composed film-reel treasure. Offer two alternative adaptations:
three compact platform rooms, and a three-location investigation with inventory,
dialogue and a small dependency graph. Neither touches journey saves or awards
real items. Show clues, checkpoints, hints, reset and explicit preview results.

Use dependency-free Canvas movement for the initial feel test; this is not a
production-engine commitment. The first architecture generator uses these
existing rules; reevaluate Phaser Arcade Physics before expanding movement
mechanics. Keep simulation and puzzle rules separate from rendering.

Acceptance: both sites can be completed through their actual controls; blocked
actions explain prerequisites; retries cannot duplicate rewards; switching
formats stops the old simulation. Check English/French, keyboard/touch controls
and narrow screens. Automated tests cover complete routes and failure paths.

Local checkpoint: both handcrafted formats are playable at
`/legend-preview.html?lang=en` (or `?lang=fr&format=investigation`). Twenty-two
targeted tests pass, including the existing journey mini-game integration tests.
The investigation state-space test checks that every reachable state can still
reach completion. Browser checks completed both routes, including the platform
route with actual keyboard controls and no checkpoint retries; French completion,
390-pixel layout, pointer controls, pause/retry and format switching were checked.
Real-device multitouch and subjective difficulty still need playtesting.

## 2. Integrate discovery and journey state

Confirmed: the town and legend are shared and the original treasure can be
claimed globally only once. Subsequent visitors can carve a moderated sentence
and optionally leave an actual inventory item for the next traveller. Original
treasures and subsequent offerings need separate custody/revision records.
Inventory removal and deposit, or claim and acquisition, must commit atomically.
Do not silently remove essential equipment that the existing save schema requires;
resolve the game's essential-item policy before enabling "any inventory item".

On first town discovery, roll eligibility once and atomically store yes or no, not a cache.
Persist the selected content identity/seed and retry generation without rerolls.
Connect met-character accounts, journal evidence, entrance discovery and
versioned saves. Settle rewards exactly once. Time, fatigue, health and dirt come
from rooms entered and actual trap collisions, not a fixed fee. Keep existing
journey activities mutually exclusive.

### Implemented foundation

The main journey now records named-town arrival through `/api/town-legends`.
The shared catalogue stores yes/no decisions by stable OSM identity, with seed
and format for positive decisions, plus private per-journey discovery history.
Both local catalogue and configured PostgreSQL paths use the same schema; no
disposable cache, world preselection, save migration or model call is involved.
Concurrent arrivals agree on one committed decision. Quests / Town legends shows
the current result and paginated discovered history, including negative decisions.
Network/storage errors remain visible; retry reads the retained decision.
Prepared map content alone does not roll towns the player has not entered.
This also applies to towns cached before legends existed: without an eligibility
row, their next player visit performs the first roll; existing caches neither
exclude them nor count as a previous negative decision.

Both standalone engines now record room entries (including revisits), distinct
rooms and trap hits. Manual checkpoint retries are not trap hits. A provisional
playtest receipt shows 3 minutes, 1 fatigue and 1 dirt per room entry; each trap
adds 2 minutes, 3 fatigue, 5 health damage and 4 dirt. These rates are now approved
for initial live trials. The standalone preview still affects no journey.

Validation: 62 targeted JavaScript tests and 39 focused Python tests pass,
including real HTTP capability/origin checks, concurrent discovery, reopen,
negative decisions and private pagination. Browser checks cover investigation
completion accounting and the real quest pane with fixture API replies at 390px.
Remote PostgreSQL/S3 integration tests were not exercised. The broader travel
server suite still reports three chunk-cache compatibility failures; the
unchanged HEAD has the same incompatible fingerprint, so these are unrelated
to the legend API changes.

### Implemented authoritative investigation slice

Eligible investigation towns now offer an explicitly confirmed **authored
investigation trial, real costs, no reward**. The unchanged town status remains
unprepared for generated content: the trial is the fixed cinema puzzle, not a
fabricated local legend. Platform towns do not offer this investigation entry.

The existing `/api/artifacts` authority accepts `legend-start`, `legend-input`
and `legend-leave` commands under its existing private capability, transaction,
revision and durable receipt protocol. Reusing the same authority avoids two
independent writers overwriting the journey or future item custody. The run ID
is the start receipt ID. `cinema-investigation-v1` pins the puzzle and initial
cost rules; the server retains accepted inputs, status and cumulative charges
in the checksummed main session, not a disposable cache.

The browser saves only a validated active-run recovery marker. Each accepted
input is replayed by the actual puzzle engine; no completion flags or cost
summaries are accepted from the client. Room entries settle immediately through
normal survival, equipment and pressure rules. Zero health uses ordinary
journey-end rules (including existing artifact protections), not checkpoint
resurrection. Fainting, placement or death interrupts the adventure. Retries
reuse receipts, resume costs nothing extra, and leaving retains all costs.
Ordinary actions are blocked while active, including after reload. A map recovery
button reopens the legend pane; closing that pane does not abandon progress.
Successful trial completion grants no inventory item, money or shared claim.

Input history is bounded to 1024 actions per trial. At the limit the player can
still leave without losing prior charges. This discrete-input slice deliberately
precedes live platform sessions, which require a separate bounded physics-input
replay/synchronization protocol; never accept browser-reported trap totals.

### Next integration slice

The generated investigation and dungeon integrations below extend this authority
without changing authored sessions. Next, connect platform sessions with interruption/recovery and actual
movement/trap replay. Then implement atomic globally unique treasure claims and
inventory-backed offerings with capacity checks, plus durable moderated passage
sentences. No generated legend entrance or treasure claim should claim readiness
before its content/custody pieces work. Legend prose and NPC retellings follow
from canonical, persisted facts.

## 3. Add structured variety

The approved platform sequence is architecture first:

1. Draw a seeded, non-overlapping main path of adjacent directional rooms.
2. Attach optional, reversible dead ends with health recovery or no reward.
3. Assign paired entrances/exits with matching offsets and safe arrival space.
4. Construct platforms and ladders linking the ports, then add readable hazards.
5. Test actual movement through every connection, including branch return.

The first local preview used eight main rooms plus two one/two-room branches.
The first geometry pass deliberately uses conservative shelves and a central
ladder, not arbitrary geometry or fully varied room puzzles. Each doorway is a
checkpoint; supplies recover one of three preview-only health points once.
Down drops through one-way shelves. At zero health the preview restores health
at the checkpoint; this does not establish production journey failure costs.
The minimap exposes the whole architecture for playtesting. New architecture
updates the URL seed; restart and format switching keep it reproducible.

### Implemented platform variety and reward tiers

The platform preview now selects modest/notable/exceptional profiles with
4/8/12 mandatory rooms and relative budgets 1/2/3, using the existing tier selector
(the weapon selector remains dungeon-only). Architecture is still selected first:
main path, reversible branches, paired ports, base geometry, then challenge
templates and hazards. A version-2 layout retains its tier/budget. Custom main
path lengths remain available for tests, but cannot override a selected tier.
Original treasure custody and actual attribute values remain disabled.

Every mandatory room gets one of four seeded challenge families without adjacent
repeats and with all four represented per four-room group:

- Jump toward a bell over a low ledge and press E during the rising jump.
- Climb a separate left-hand ladder and operate a high lever.
- Find/collect a brass key on the right.
- Cross or jump a spike patch that retracts on a deterministic 180-tick cycle,
  then operate the far lever. Ninety ticks active, ninety retracted.

Forward doors require the local challenge; the final treasure requires its
room's challenge too. Solved gates survive retries and re-entry. Backward doors
never require resolving a new challenge. Branches retain supplies/empty rewards
and cannot bypass the main path, inflate the budget or become necessary. The
challenge below the scene and open/locked door sprites explain progress. No
forced damage, new runtime dependency or change to approved journey rates.

This is the first actual platform variety slice, not a fully varied geometry
catalogue: conservative port shelves and the central ladder remain for reliable
bidirectional traversal. Moving platforms, alternate layouts within families,
and cross-adventure template history remain pending. Generated investigation
templates are implemented in the separate increment below.
The live cinema investigation's version and costs have not changed.

Validation checkpoint: 31 targeted JavaScript tests and eight focused Python
tests pass, including the existing free-price/paid-fallback guard. Layout
structure is checked across 100 seeds; actual traversal covers every doorway
both ways across 40 seeds, path lengths 4-16 and branch counts 0-4. Browser
checks cover generated-route completion, health/checkpoint retries, French
investigation completion, seed changes and a 390-pixel layout.

Add richer platform geometry and authoritative dungeon/platform support next.
Validate movement reachability as well as puzzle state reachability. Start with
a small item/attribute set and explicit compatibility/power budgets, then expand
toward about 100 object natures. Cosmetic effects remain optional and reversible.

Validation of the platform variety increment: 138 focused JavaScript tests pass,
including existing authority, saves and controls. Actual physics traverses all
generated doors in both directions across 40 seeds/custom path/branch combinations
and completes all three tiers across eight seeds each without damage. Tests enforce
reward/main route monotonicity, no branch shortcuts, family distribution, locked
forward doors, mandatory rising jumps, retained progress and deterministic trap
phases. Browser checks at 320px and 390px cover all tier labels, actual selector
changes, platform-only weapon hiding and no horizontal overflow. Physical-device
touch timing and subjective challenge balance still need playtesting.

### Third format: top-down dungeon prototype

The isolated preview now offers `?format=dungeon&seed=1&tier=modest&weapon=none`
in FR/EN. This is a discrete-turn, early-Zelda-inspired dungeon, not a change to
live town selection or the authoritative investigation protocol. Bats and rats
advance on accepted player turns, so mobile users need not win a reaction race.
Every site is completable without a weapon, fighting or taking damage.
Optional combat requires a simulated knife (one tile reach) or sword (two),
aimed in the facing direction. Creature defeats grant nothing. Production must
replace simulation with equipped-inventory validation, not trust this selector.

Four mechanical families use a seeded shuffle bag: operate a switch, push a
block along a recoverable rail onto a latching plate, collect a key to unlock a
gate, and time or bypass flashing spikes. Each four-room group uses all four;
neighbouring rooms never repeat a family. Gates block progress but not retreat.
Position/block retry retains health and damage; zero health requires restarting
the isolated preview. There is no free healing loop. Creature contacts and trap
collisions have separate counters; the preview applies no real costs. The later
authoritative dungeon slice uses the approved creature-hit rates.

| Planned treasure budget | Mandatory dungeon rooms | Prototype reward |
|---|---:|---|
| Modest (1/3) | 4 | None; fictional reel |
| Notable (2/3) | 8 | None; fictional reel |
| Exceptional (3/3) | 12 | None; fictional reel |

These are relative budgets, not economy prices or approved attribute strengths.
The eventual composed treasure must determine the versioned profile before
layout generation. Tests must compare minimum valid routes, never measured
player slowness. Optional rooms and retries do not increase reward; a replacement
offering does not regenerate the site or promise equivalent value.

### Production variety acceptance and remaining work

For all three formats, require at least three challenge families per short site,
four per medium/long site, no adjacent identical signatures and no family making
up half or more of mandatory encounters. Maintain separate dimensions for family,
geometry, timing and clue solution; cosmetic reskins do not count as variety.
Use bounded combinations of tested templates, not arbitrary generated code.
Include safe observation/arrival spaces and telegraphed hazards. Track recent
template signatures privately to favour fresh newly prepared sites, while keeping
already retained town content immutable.

Candidate platform families: jump timing, ladder routing, moving platforms,
switch/door circuits, pushable obstacles and timed darts/crumbling floors.
Investigation families: evidence deduction, dialogue cross-checking, object
assembly, environmental sequencing and alternate-access puzzles. Dungeon
extensions: multi-switch circuits, alternate routes and distraction tools.
These richer catalogues and cross-site history remain planned. Investigation
now has the four-family/tier increment below. Platform has the four-family increment
above but keeps conservative base shelves; the live cinema puzzle is unchanged.
Do not advertise those existing loops as satisfying the full production contract.

All current game commands now show scoped keyboard shortcuts. Platform and
dungeon directions use a fixed cross-shaped D-pad (up/top, down/bottom) with
48px minimum targets and separate action buttons, including on narrow screens.
Investigation commands show numeric location and letter action shortcuts.

### Implemented seeded investigation puzzles

The isolated preview now generates a versioned chain of 4/8/12 required sites
for modest/notable/exceptional budgets 1/2/3. The tier and seed controls apply to
all three formats. A separate generated investigation engine leaves
`cinema-investigation-v1`, its server replay, approved costs and existing saves
untouched. The preview-only opt-in flag is rejected in authoritative mode;
live generated replay requires its own pinned content version as described below.

Four families each have two authored variants:

- Evidence: photograph/cabinet or first-stamped-ticket/box; inspect before
  choosing the seeded symbol.
- Witnesses: opening screening or parcel delivery; hear both the caretaker and
  repairer before choosing their shared symbol.
- Assembly: repair a projector with a handle and oil, or restore a torn map with
  fragments and paste; collect both supplies before applying them.
- Sequence: coloured control switches or three signal bells; read the plate,
  then reproduce the seeded permutation. A wrong press resets only the sequence.

Each four-site bag contains all families; adjacent families differ. Every site
must be solved to unlock its successor, so a larger budget genuinely requires
more distinct completed dependencies and visited sites, not waiting or revisits.
There is no circular dependency or consumable essential item. Backtracking
retains clues/supplies/solutions; only actual changes of site count as entries.
The DOM displays all earned clues and local supplies, with prerequisite-aware
hints, labelled A–E commands and [ / ] previous/next navigation. Shared pixel
art renders the appropriate witnesses, workbench or controls. Completion still
grants no reward; this is not generated local-town narrative.

Richer non-linear dependency graphs, variant geometry, cross-adventure history,
and atomic treasure custody remain future slices.
The original authored investigation engine stays available to live trials and
compatibility tests; it is no longer the default isolated preview.

Validation: 147 combined JavaScript regression tests pass. Generated puzzle
tests cover 100 seeds per tier, legal-command completion, reachable local states,
retry recovery, immutable state and unchanged cinema replay. Browser checks cover
a complete 12-site route with prerequisite errors and sequence recovery, FR/EN
tiers at 320/390px without horizontal overflow, dispatched keyboard shortcuts,
format switching, new seeds and restart. Physical touch/keyboard and subjective
difficulty still need playtesting.

### Implemented authoritative generated investigation trial

Eligible investigation towns now offer a second, explicitly confirmed live
trial. `seeded-investigation-v1` replays the generated engine using the retained
server-owned town seed and a fixed modest/four-site profile. One site from each
family is mandatory. The client sends only inputs; seed/tier overrides and
invented completion/cost fields are rejected. There is no real reward profile
to select yet. Generated trials are not generated local legends, and the town's
content status remains unprepared.

The existing `/api/artifacts` transaction, revision, receipt and private recovery
mechanisms handle both versions. Already-started authored cinema runs retain
their original engine and content version. Browser saves still contain only
the run marker. Generated runs retain partial evidence and supplies across
restart, closing/reopening Quests and leaving/revisiting sites. Rendering uses
accepted server input logs only; pending commands cannot advance locally.
Room entries apply approved costs immediately through existing survival rules;
blocked travel and puzzle attempts create no entry charges. Duplicate receipts
cannot double-charge, resume is free, and leave/interrupt retain charges.
Completion does not claim an original treasure, create money or modify inventory.

The UI shows the generated trial's real-cost/no-reward terms in FR/EN, retained
evidence, hints, command shortcuts, and pending/terminal input locks. Focus
returns to the same command after replies, or the next available command when
that action has become unavailable. Four-site authority is separate from the
4/8/12-site isolated tier selector. The separate dungeon trial is implemented
below; platform replay, actual
treasure assignment and atomic reward custody remain pending.

Validation: 157 combined JavaScript tests and 56 focused Python tests pass.
Coverage includes complete live generated routes across eight seeds, partial
replay/recovery, both legacy and generated protocols, normal survival
interruptions, mixed/forged input rejection, history limits with leaving still
available, repeated/dropped receipts, server restart and concurrent start
requests across shared-catalogue authority instances. A fixed generator/transcript
fixture protects the v1 replay contract; future incompatible mechanics must retain
this version's behavior and use a new content version. Browser fixture checks
exercise the actual live quest renderer: a full four-site French route at 320px,
English pending-input/recovery/focus checks at 390px, terminal locks, no overflow,
and correctly sized 32px sprite-key icons. Browser callbacks use fixture replies;
real persistence and cost settlement are covered by API/worker integration tests.
Remote PostgreSQL/S3 and physical-device input are not exercised.

### Implemented authoritative dungeon trial

The approved next slice adds `seeded-dungeon-v1`: a saved four-room modest trial
available by explicit confirmation in any eligible town. It does not change the
town's retained format, roll new eligibility, declare local content ready or
assign a treasure. Permanent seed, room profile and usable inventory knife
access are selected by the authority. Missing/broken knives mean unarmed;
the live equipment catalogue has no sword, while the isolated preview retains
its simulated sword option. Completion is always possible without combat.

The same main-world transaction/revision/receipt path retains bounded discrete
inputs, replays the dungeon engine and settles actual room entries and hits.
Entry costs remain 3 minutes / 1 fatigue / 1 dirt; trap hits add 2 minutes /
3 fatigue / 5 health damage / 4 dirt. The user approved lighter creature hits:
1 minute / 1 fatigue / 2 health damage / 1 dirt. Normal survival also applies.
Live simulation has no independent hearts or three-hit cutoff; ordinary journey
health and protection/interruption rules decide survival. The preview keeps its
original three-heart rules. Retry changes position/unsolved block only: no healing,
refund, creature resurrection or reset of solved gates. V1 kills award nothing;
the later food increment below changes new attempts only.

The saved session pins canonical weapon access and the content version; clients
submit only one-field movement/interact/attack/wait/retry inputs, never state,
health, collision totals or equipment selection. Pending inputs do not advance
the UI optimistically; recovery replays accepted inputs and duplicate receipts
cannot duplicate costs. Leaving keeps all charges, including at the 1024-action
history limit. Authored and generated investigation sessions retain their versions.
The live UI shows journey health, no-reward terms, real accounting and spatial
48px direction controls, with visible shortcuts and focus recovery after replies.
The map recovery command is now format-neutral: Resume adventure.

Next integration remains bounded authoritative platform input replay, followed
by atomic unique treasure claims and inventory-backed offerings. Real reward
tiers, generated town narratives and production three-format selection are
still separate work.

Validation: 170 combined JavaScript tests and 61 focused Python tests pass.
Coverage includes unarmed damage-free completion, canonical knife/broken-knife
gating, pinned v1 layout/transcript compatibility, replay beyond three hits,
additive trap/creature rates, no-healing retry, collision death/fainting,
restart/recovery, forged inputs/views, dropped/duplicate receipts, input limits
and atomic concurrent starts across shared-catalogue authority instances.
Browser fixture checks complete all four rooms through the live French quest UI
at 320px, and verify English pause/resume, dispatched keyboard input, focus
recovery and interruption locks at 390px. D-pad geometry and 48px targets,
32px sprite-key icons and absence of horizontal overflow were measured.
Browser callbacks use fixture replies; persistence and actual settlement are
covered by Python/worker integration tests. Physical-device input and remote
PostgreSQL/S3 remain untested. No deployment was performed.

### Dungeon food and per-attempt respawn

The user approved immediate food energy rather than carried rations: a newly
defeated creature yields up to 150 kcal, capped at normal reserves, never health.
The clarified respawn rule deliberately allows food again on a new attempt.
Defeated animals stay gone during an active attempt, including room revisits,
position retry and resume. There is no permanent animal/food-claim ledger;
the existing accepted-input log supplies within-attempt defeat state.

New entries use `seeded-dungeon-v2`; active v1 sessions retain their original
no-food behavior. The authority detects newly defeated rooms by comparing actual
replay before/after an input, settles costs first, then grants energy only if
survival did not interrupt the action. No meal counter, item, money or health is
awarded. The accepted response carries the actual calorie gain for localized
feedback, including zero gain at full reserves. Duplicate receipts and ordinary
resume return committed state without applying food again.

Validation: 173 combined JavaScript tests and 62 focused Python tests pass.
Tests cover caps (including fractional reserve space), no healing/meal count,
legacy no-food compatibility, repeated attacks/retry, resume/server restart,
duplicate receipts, and renewed rewards after leaving and starting another
attempt. Browser fixture checks verify FR/EN calorie feedback and respawn wording
at 320px without horizontal overflow. Not deployed.

### Readable 8-bit artwork

All three renderers now share an original 16x16 sprite catalogue, drawn with
integer-sized pixels rather than circles or generic rectangles. Door frames,
open passages, shutters/locks, keys, levers, medical supplies, film reels and
NPC outfits have recognizable silhouettes. Bats have wings/ears/eyes; rats have
snouts, feet and long tails, with two distinct silhouettes of each creature.
Each game exposes a localized collapsible sprite key.

Eight seed-selected environment sets change construction as well as colours:
iron-barred crypt doors and brickwork; mossy stone arches and cracked floors;
timber frames/planks and cobwebs; velvet curtains and cinema wall panels.
Four further settings add sewer drain grates and dripping pipes, ice fractures
and crystals, riveted forge plates and anvils, and library bookshelves with
carved doors and book stacks. Each has its own floor pattern. Seeds 0-7 expose
all eight sets, in that order. Expanding the selection from modulo 4 to modulo 8
can change the decorative style of earlier seeds; this is a rendering-only
prototype change, not a content/physics or save migration.
Torches, pottery and themed props decorate non-colliding scenery. The retained
adventure seed selects the same set after restart, including the live authored
investigation. Pixel artwork changes rendering only, not reachability, puzzle
dependencies, physics, costs or treasure custody. No external artwork package,
provider request or generated-image dependency is introduced.

Artwork validation: 133 focused JavaScript tests pass, including all retained
adventure/authority/save tests. Sprite tests enforce 16x16 grids, palette and
integer scaling, distinct creature silhouettes, four structurally different
door/wall sets and all-format FR/EN rendering. Browser checks cover every format
at 320px/390px with the sprite key expanded, without overflow, and 32px key icons
inside a narrow live-session-style dialog. Screenshots were inspected for door,
bat, prop and character readability.

Validation checkpoint: 129 focused JavaScript tests pass, including retained
authority/save behaviour. Dungeon tests cover seeded family/species distribution,
strictly increasing room/reward budgets, damage-free unarmed completion and
return doors across all three tiers and eight seeds each, weapon reach, damage
accounting, terminal failure and invalid inputs. Browser checks in FR/EN at
320px and 390px confirm spatial direction pads, 48px targets, visible shortcuts
and no horizontal overflow. A 12-room French run completed through DOM command
clicks and dispatched keyboard events with no damage. The shared browser is
hidden, so this is not physical keyboard, touchscreen or real-device validation.

## 4. Add generated narrative

Generate canonical legends and item names from validated mechanical definitions;
generate witness voices from those same facts. Schema-check and retain content,
localize it and expose real generation errors/retry. Never generate executable
code, arbitrary effects or unchecked puzzle prerequisites.

### Atmosphere artwork increment

Use one or two retained background images per adventure, separately from
geometry, clues and collectibles. The isolated preview now loads a fixed public
manifest and switches between passage/interior scenery, reusing one image if
only one is available. Artwork can arrive without resetting the current game.

`scripts/legend_art.py` prepares the two fixed fictional cinema briefs using
the existing zero-price-checked OVH image adapter. It reserves each slot durably
before dispatch, normalizes to WebP, reexports retained images without generation,
and does not automatically retry failed/interrupted calls. Browser refresh only
reloads published art; it cannot start provider work. Live per-town lazy image
generation/authorization is still part of journey integration, not this CLI.
See [preparation instructions](../README.md#town-legend-playtest).

Ready-art rendering and late arrival were verified with synthetic browser
fixtures, including retained puzzle progress and explicit manifest-failure
fallback. Actual provider generation remains unrun here because
`ARCANE_START_IMAGES_TOKEN_FILE` is not configured in this session.

## 5. Tune and expand

Playtest discovery frequency around the initial 10%, clue clarity, difficulty,
reward value and repetition. Add themes and effects only after all three formats
work well independently. Hybrid sites are a later extension.

## Follow-up after legends: journey-event QTEs (R-191)

After completing the legends work, add short, situation-appropriate quick-time
challenges to journey events. Success should either avoid an event disadvantage
or earn its reward. This is a separate deferred requirement, not an expansion of
the current legend implementation. Define event coverage, failure/timeout rules,
accessible alternatives and keyboard/touch interaction before implementing it;
see [R-191](REQUIREMENTS.md#r-191---quick-time-challenges-for-journey-events-after-legends).
