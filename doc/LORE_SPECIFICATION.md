# Lore completion specification

**Status: all 22 powers implemented in the isolated authoritative playtest;
main-game integration remains partial; not deployed.**

Prepared 19 October 2026. Scope: part 1 of the lore completion plan.

This document specifies the target for a finished lore feature: 22 discoverable
artifacts, explicit powers and prices, a coherent mystery, collectors, inventory
integration and persistent shared ownership. The main game is unchanged.
All 22 powers below now have executable rules in that separate world. This
does not activate them in ordinary main-game saves or finish the story ending.

**19 October power revision:** globally unique objects must give substantial,
deliberately unfair advantages: they should feel like cheating. This supersedes
the earlier modest convenience powers. Teleportation, strong restoration,
guaranteed revelations and temporary rule-breaking below are intentional.
The all-22 checkpoint below extends the original six without resetting custody.

**19 October architecture requirement:** the parent trail, magic objects and
abandoned journals must use one shared hint/clue/riddle mechanism. Later, the
content factory's LLM generates their narrative expression. Section 2.0 is the
common contract; artifact rules below are a target policy, not a separate engine.
This requirement is confirmed. The full target contract below is distinguished
from the implemented foundation in the checkpoint that follows.

For concrete evidence declarations, authored FR/EN templates, selection rules
and sleep-dream integration, see the [hint engine developer guide](./HINT_ENGINE.md).

**Implementation checkpoint, 19 October:** the first shared-discovery increment
now exists locally; it is not deployed. [Discovery ledger](../discovery.mjs)
validates versioned knowledge, deduplicates semantic evidence across channels
and retains historical/unavailable observations. [Domain adapters](../discovery-targets.mjs)
project already-earned parent clues and journal-service results into it.
Autosave persists this ledger; the photo notebook and its PDF export show a
shared FR/EN **Clues and discoveries** view. Only earned fact subsets enter the
ledger: progressive parent history does not disclose its hidden next town,
recognition suggestions remain unconfirmed, and journal future stages/private
fields are excluded from discovery entries.
Verified with 138 focused JavaScript tests covering the common ledger,
adapters, notebook/PDF, localization, parent actions, journal UI and save store;
the rendered shared view was also checked in the local browser in FR/EN.

This is a **foundation, not the completed single-mechanism migration**. Existing
parent hint arrays and journal quest records still drive their domain actions
and existing detailed pages. Their action costs, randomness and progression
are unchanged. Consolidating the remaining domain-specific clue storage,
production-wide eligibility/scheduling, main-game authoritative artifact custody
and powers, main-game dreams and reviewed LLM content packs remain pending. The ledger
alone is not proof of server-authorized discovery or ownership.

### All 22 powers checkpoint

The user requested completion of the remaining sixteen before preparing a
release. All are implemented locally in the same isolated world, with the
approved catalogue, discovery prerequisites, footprints, inscriptions, explicit
prices and durable per-instance cooldowns. The earlier checkpoints below are
historical snapshots, not the current six-object scope.

Every activation also costs one ordinary minute. Prices in this table are
additional and never discounted by another power. Protections use journey time;
cooldowns use the shared world's accepted simulated minutes.

| Power | Implemented effect | Additional price | Cooldown |
|---|---|---|---|
| Magician | Best legal available earning offer, capped at EUR 20; labelled credit, no fake score/XP | 200 kcal | 24 h |
| Priestess | Current parent truth or authorized journal next-step marker/solution; disproved reports labelled | 10 fatigue | 24 h |
| Empress | Refill reserve, then quarter ordinary food consumption for 12 h; no healing | 5 fatigue | 24 h |
| Emperor | Best normal sheltered rest/sleep at this cell for up to 8 h; any other committed activity ends it | 250 kcal | 24 h |
| Hierophant | Choose 1-3 unread reverse rubbings, then 10 exposed concentration minutes | 5 fatigue | 24 h |
| Lovers | Next traversable waypoint and warmer/colder signal for 180 actual walking minutes | 5 fatigue | 24 h |
| Justice | Last 24 journey hours' eligible debits, most recent first, at most EUR 30, never twice | 5 fatigue | 24 h |
| Strength | No ordinary fatigue gain for 3 h; direct magical fatigue still payable | 300 kcal | 24 h |
| Hanged | No ordinary needs/damage for 2 h; recovery allowed, direct prices still payable | EUR 3 | 72 h |
| Nameless | One ordinary terminal health/hunger/fatigue rescue within 24 h, before recaching; not recoverable fainting | 10 fatigue | 72 h |
| Devil | No load penalties or equipment wear for 24 h; no repairs or bag/weight-limit bypass | EUR 3 | 24 h |
| Tower | No positive ordinary vigilance for 24 h; cleanliness and reputation still evolve | 10 fatigue | 24 h |
| Star | True current destination and a real land route, with game-grid distance/time | 8 fatigue | 24 h |
| Moon | Night activation pins new available domain clues privately for the next qualifying sleep begun within 24 h | 8 fatigue | 24 h |
| Judgement | Chosen card's real daily modifiers for 24 h; natural draws continue underneath | 10 fatigue | 72 h |
| World | Instant landing at an earned, validated named settlement, with belongings and no invented walking | 500 kcal + 10 fatigue | 72 h |

**Authority and ordinary gameplay.** Costs, eligibility, work inputs, payments,
timers, teleport destinations and fragment choices are decided by the reducer,
not submitted as client state. The bookshop mini-game uses the existing legal
engine, normal activity time/reward/XP, private seeded replay and server-timed
inputs. Refresh/resume does not restart it. Invalid board inputs fail explicitly;
cancel/timeout gives no reward. The 150-input limit still permits cancellation.
Normal work remains repeatable as in the host: consuming an offer starts a new
offer generation, not an invented daily earning restriction. Magician's own
cooldown still applies. Its nine host earning offers retain actual local
availability, difficulty, prices and resonance. Harvest's maximum accounts for
the actual seeded stream, steering, rotten bunches and 30-second deadline.
Justice currently observes the ordinary debits available here: meals and paid
interpretation; artifact prices and its own linked credits are excluded.

**Route and terrain preparation.** The source genesis's real parent stages
can lie tens of kilometres beyond the initial map. Free authenticated
`route`/`terrain` preparation reuses the existing asynchronous server providers,
with current server-owned position and immutable current-stage target. Route
preparation requires Star or Lovers; World can prepare earned parent landings
without owning either. It neither spends journey time nor renews custody.
Prepared real terrain is persisted privately, capped at 256 chunks per test
world. Provider search/download/time limits and failures remain explicit.
The main route cache and genesis are unchanged; lore uses a separate land-only
cache namespace. Water stays blocked. Public map responses omit prepared chunks
and private routes; only a local viewport is shown until the corresponding
power earns route knowledge. There is no air-line fallback or fee on a failed
preflight. Preparation can need several free refreshes while a job completes.

**Evidence and mystery.** All revelations use the common ledger. A power's
plain-guidance permission applies only to its specific revealed evidence.
Fragments follow a fixed reverse-rubbing catalogue, not a fabricated source
for an arbitrary requested inscription. Earned canonical copies count towards
World's six-inscription/three-thread prerequisite across the approved four
story threads. A fictional settlement archive supplies one balanced canonical
copy per 1,440 journey minutes after the first artifact rumour, for 10 minutes;
physical possession is not required. Two distinct named-locality testimonies
use the real parent-direction action and record whether it helped.
Moon's private bundle is revalidated when published; changed evidence becomes
historical/unavailable, never a live holder tracker. Its guarantee and ordinary
probabilistic dreams have separate receipts and cannot duplicate the same
new knowledge within a sleep. Judgement preserves birth and current natural
daily draws, including midnight and expiry. World accepts genuine earned
current/past GeoNames parent-town markers as well as mapped named settlements;
unknown future places and arbitrary coordinates are ineligible.

**UI and limits.** FR/EN controls show exact prices, prerequisites, targets,
refund preview, fragment choices, active durations, chosen/natural cards,
dream and rescue receipts, and preparation failures. Movement, keyboard and
packing warn before ending a sanctuary. Real server bookshop controls reuse
the existing bilingual instructions and feedback. Main local saves remain
untouched. Live weather, the other eight manually played earning mini-games,
journal delivery, the final narrative ending, LLM rewriting and migration of
the main journey to server authority remain outside this checkpoint.

**Release gate.** This is implemented code, not a deployed release. Runtime
packaging rejects untracked source omissions and dirty/uncommitted runtime;
tracked macOS Finder metadata is excluded from the runtime archive.
Review and checkpoint the intended release files before packaging. Verify
Node.js on an existing VM and explicitly authorize deployment separately.
The static browser configuration export matches the canonical YAML already
served by the travel server, including its ten-photo per-cell limit.

**Verification of this checkpoint:** all 938 JavaScript tests and the complete
198-test Python suite passed, plus Python syntax and tracked whitespace checks.
Tests cover
all sixteen effects, exact expiry and walking-budget boundaries, Chariot/Devil
distance-weighted wear, legal seeded Harvest play attaining the magical cap,
post-arming settlement rescue, three-domain Moon bundles, journal revision and
lease races, persistent authority/retries, distant prepared terrain and package
omission rejection. Isolated browser checks completed a fresh ordinary bookshop
game with normal reward/XP, activated fourteen added powers using explicitly
prepared ownership fixtures, checked FR/EN and reload, and verified the two
unprepared routing powers remain disabled. No main local save was created or
changed. A live distant-route preparation encountered upstream OSM cooldowns
and incomplete fallback geometry: it reported failure without spending journey
time or disclosing a route. Successful distant routing is covered with the
actual path algorithm and controlled terrain/cache fixtures, not claimed as a
successful live-provider browser check. Initial release preflight correctly
rejected untracked runtime sources. A reviewed, committed checkpoint and
verified archive are required before deployment; deployment remains separately
authorized.

### Isolated authoritative playtest checkpoint

This first checkpoint introduced three objects; the later second power batch
below extends the same isolated world to six without resetting its original
instances or journeys.

**Approved scope:** a separate opt-in world and server-owned journey, rather
than prematurely claiming that the browser-simulated main game can enforce
unique ownership. The title-screen link opens [the playtest](../lore-playtest.html).
It can clone an authenticated journey's immutable **genesis**, never its local
checkpoint, or create a separate Firmi source. Neither path overwrites a main
save. The main save validator rejects playtest-only lore state.

- Exactly **three instances in this test world**: Hermit's pierced thimble,
  Chariot's red shoelace, Temperance's pierced stopper. They are not copies
  of production instances. They start in three reachable, real named settlement
  cells on the first source's starting map; all markers/contacts are fictional.
  Later sources must use the same region. Walking cannot leave that pinned map
  or cross water. This is not European streaming or full parent-quest integration.
- [The authority service](../scripts/lore_playtest.py) owns map, position,
  resources, time, inventory and unique custody in SQLite. It uses private
  journey capabilities, strict command allowlists, revision checks, atomic
  transactions and durable request receipts. Retrying an identical command
  cannot spend or award twice. Another player's identity/location is never
  returned. Checksummed world/session records fail explicitly on corruption.
- [The reducer](../lore-engine.mjs) reuses the real survival, health, pressure,
  equipment and economy rules through a bounded Node.js worker. Boots/backpack
  and artifacts share the actual 6 × 4 packing/5,500 g limit; artifact mass
  contributes to normal walking load. This slice excludes live climate,
  streamed travel, mini-games, other event actions and journal delivery quests.
- Artifact proximity, ordinary inquiry and Hermit's revelation all write the
  common discovery ledger. Parent field-search evidence joins that same
  notebook. Existing main-game parent/journal actions are not silently replaced.
  The generic [delivery policy](../discovery-policy.mjs) handles all three
  target types and semantic deduplication, with one automatic clue per 60 actual
  walking minutes. The authored-hints checkpoint below extends its initial
  artifact-only provider to current parent clues and real nearby journal rumours.
- Hermit: **1 minute + 10 fatigue**, an exact new unowned-artifact marker
  regardless of distance. An already-known exact marker is not charged again.
- Chariot: **1 minute + 200 kcal**, the next **20 km** cost **75% less walking
  time, walking fatigue and walking-effort energy**, including split steps at
  the remaining-distance or 24-journey-hour expiry boundary.
- Temperance: **1 minute + 500 kcal**, up to **40 health restored and 40 fatigue
  removed**, with ordinary metabolism charged as well. No charge for a no-op;
  insufficient reserves or an interrupted activation cannot grant a power.
- Each instance has a **1,440-minute shared-world simulated cooldown** after
  activation. All test journeys' accepted elapsed time advances this clock;
  it is not wall time. Carry/cache/transfer/restart cannot reset it. Chariot's
  already-earned timed effect stays on the activating journey.
- Claim takes 10 minutes and requires the current exact clue and proximity
  within 250 m. Chariot additionally requires 1 km walked; Temperance requires
  two distinct earned inscription copies shared with a fictional settlement
  contact (5 minutes each). Carrying, rotating/repacking, reading inscriptions,
  caching at a mapped settlement (10 minutes) and resuming are playable.
  Inscriptions survive loss/transfer; stale location evidence is labelled.
- Abandonment/terminal outcomes recache held objects at the last visited
  settlement, with the starting marker as fallback. **30 real days without an
  accepted action** also recache holdings on the next world request, once per
  ownership generation. Mere polling/replay does not renew the lease.
- [The browser client](../lore-client.mjs) saves a pending command before
  transmission and retries its exact receipt after a dropped response or reload.
  The bilingual page displays learned clues, resource state, power prices,
  cooldowns and actual bag placement. It never sends simulated checkpoints.

**Deployment prerequisite:** Node.js must exist on the game server, in addition
to Python. Cloud-init declares it for new machines; updating an existing VM
still requires verifying/installing it. The HTTP POST and static page/style
are explicitly allowlisted in nginx. No paid LLM calls, production deployment,
main-game dream delivery, other 19 powers, collectors' full mystery or main-game
authoritative migration are included.

**Verification:** 192 focused JavaScript tests and 43 Python tests passed,
including actual 75% walking reductions, capped 40/40 restoration, interrupted
activation, concurrent claims, receipt replay, transfer cooldowns, inactivity,
corruption, authentication and original journey/journal API regressions.
An isolated temporary HTTP server was used for a real browser run: create →
inquire → claim Hermit → reveal Chariot → walk → claim → share both inscriptions →
activate Chariot → find/claim/use Temperance → repack/rotate → cache → reload and
resume, in EN then FR. Images loaded, inscriptions remained, and no main-game
save was created or changed. Keyboard movement was also checked after focusing
a button. The travel-server configuration test now expects the intentionally
increased limit of ten photos per cell.

### Authored hints and dreams checkpoint

**Confirmed choices:** mysterious tone, authored FR/EN variety before an LLM,
free explanation controls, permission-gated plain guidance, unchanged artifact distance ceilings,
and ordinary dreams influenced by tarot cards and proximity. This remains
**local and isolated**, not a main-game or production rollout.

[Authored presentation](../discovery-authored.mjs) contains six complete patterns
per domain (18 bilingual pairs), interpretation text, tier-specific actionable
artifact guidance and images for all 22 cards. Domain-order selection rotates
patterns without consecutive reuse within that family; existing entries remain
stable on reread, append and reload. It is a bounded authored library, not
unlimited generative prose. The birth/day images vary dreams without inventing
real-world evidence, landmarks or witnesses.

The [shared notebook](../discovery-ui.mjs) enables this presentation only for
the playtest. **Explain** interprets the imagery freely; **Plain guidance**
requires an interpretation earned from a knowledgeable NPC or an explicitly
authorized power. Rereading unlocked guidance is a free browser-only operation.
Both use safe text rather than HTML and cannot increase precision.
The [interpretation policy](../discovery-interpretation.mjs) persists permission
for one semantic evidence identity, not the whole target or notebook.
Named-settlement NPC help depends on existing local reputation, birth/day
tarot, cleanliness and fatigue; it can be free, paid or unavailable. Quotes use
local market pricing and a 10-minute interaction, with no grant on interruption.
Offers use a stable settlement/day draw, not a new roll on refresh or selection.
Hermit's revelation automatically interprets only the clue it creates.
See [the concrete policy and initial balancing](./HINT_ENGINE.md#plain-guidance-permissions).
Inscriptions remain directly readable. Exact earned artifact cells appear on
the map; older observations stay in the notebook with their availability.
Main-game notebook/PDF presentation is preserved.

[Candidate adapters](../discovery-targets.mjs) supply stable current-stage
parent prefixes or known-town facts within the existing search precision ceiling.
They never reveal a future stage or claim a prepared route distance. The
read-only journal projection uses the existing service's actual unclaimed,
undelivered 200 m eligibility (including expired finder leases), excludes one's
own source journal, and exposes only a parent name and the **player's** observation
cell. It does not expose the journal's coordinates, future steps, holder or
private notebook, or mutate its lease/custody. Journal pickup/delivery and
full parent progression still belong to their main-game features.

All three providers feed one semantic selector. Stronger artifact tiers
suppress weaker same-generation retellings; an exact parent destination
suppresses weaker current-stage candidates. Equal-priority domains are ordered
by least recent learned evidence before distance, preventing endless optional
artifact clues from starving another eligible domain. Automatic delivery still
uses one 60-actual-walking-minute budget. The new shared inquiry retains domain
costs: artifact 2 minutes, parent the real 8–60-minute randomized field search,
journal rumour refresh free. Sharing a selector does not turn parent searches
into guaranteed two-minute revelations.

[Sleep dreams](../discovery-dreams.mjs) run only after the existing deliberate
outdoor-sleep reducer. One check occurs at 60 minutes of that sleep; the next
check must be at least 1,440 journey minutes later. No extra opportunity for
immediate repeated sleep, short split attempts, refresh, replay, fainting,
detention or ordinary rest. Empty, missed and interrupted opportunities consume
the quota; their images are explicitly not evidence. The UI shows the next
eligible-sleep delay and separates dream history from the shared clue list.

The pinned check uses the effective birth/day card IDs at its simulated
instant, even when sleep crosses UTC midnight. Chance is
`min(0.75, 0.15 + 0.35*p + birthAdjustment + dayAdjustment)`;
the current table produces **15–70%**, with 75% as the formula's safety cap.
Artifact `p` follows proximity within 300 km, parent `p` uses its existing
vague/partial/precise bands, and eligible local journal rumours use `p=1`.
Ordinary dreams never exceed the adapter's precision or claim an object.
Within this bounded map, artifact distance remains the existing grid metric;
the production great-circle metric and European-scale traversal are not claimed
as implemented by this checkpoint.

Private receipts persist check/sleep times, selected evidence identity, cards,
chance, draw and outcome atomically with needs/time/knowledge. Public results
omit chance/draw and do not even disclose the selected evidence identity after
a miss/empty/interruption. SQLite serializes artifact movement; real journal
availability is rechecked before returning a result, and stale reports are
labelled unavailable rather than replaced by another target. Dream history
reflects historical/unavailable clues after later custody changes.
The existing sleep's food, fatigue, health, money and recovery remain unchanged.
Old isolated sessions can begin with no dream history; no main save migration
or reset is required.

**Verification:** 212 focused JavaScript tests and 57 Python tests pass,
including all card affinities, exact chance boundaries, 60-minute and 24-hour
eligibility, split/repeated sleep, midnight card selection, unchanged sleep
needs, skipped-precision suppression, free explanations, stable FR/EN variants,
real journal privacy/availability and persisted sleep receipt replay after restart.
On a temporary isolated server, real browser play exercised both a missed dream
and a successful one, free interpretation/plain guidance, EN→FR switching,
reload/resume, a 37-minute unsuccessful parent search through the shared inquiry,
and claiming the dreamed-about artifact. Its old dream then correctly became
historical. No main-game save was created or changed. Native syntax and
in-scope whitespace checks pass; nothing has been deployed.

**Save scope clarification:** the user is currently the only player and does
not require extensive compatibility work. Do not build a legacy migration
framework for this release. Missing discovery knowledge can start empty;
incompatible new schemas must produce an explicit load error and explain that
a new journey is needed, never silently reset a run. Existing domain evidence
can be synchronized as it is encountered; exact recovery of every historical
save format is not a prerequisite to implementation.

### Second power batch: Fool, Wheel and Sun

**Status:** implemented and verified locally in the same isolated playtest,
not deployed or integrated into the main journey. At this historical checkpoint,
six unique instances existed: Hermit, Chariot, Temperance, Fool, Wheel and Sun.
The all-22 checkpoint above now adds the remaining powers and copy progression;
the full narrative ending remains pending.

| Artifact | Implemented advantage | Additional activation price | Instance cooldown |
|---|---|---|---|
| Fool / endless hem | Instant return to a personally visited named settlement on the pinned map, carrying the real bag and companion | 10 fatigue | 1,440 world minutes |
| Wheel / empty spool | Recall one of this journey's own still-unclaimed publicly cached artifacts directly into the actual bag | 10 fatigue | 4,320 world minutes |
| Sun / yellow handkerchief | Full normal health and zero fatigue, without a bed, clinic or recovery duration | 500 kcal, retaining positive reserve | 4,320 world minutes |

Each activation also takes one minute of normal metabolism. Direct prices and
cooldowns commit only after uninterrupted activation. Failed preflight requests
do not charge or mutate custody. Successful effects have durable command
receipts: network retries and server restart do not duplicate a payment or item.

**Fool:** named settlement visits are recorded by the server from actual
journey positions, never a browser-supplied visit list. The selected destination
must differ from the current cell and still validate against the pinned map.
Return does not increase walking distance, wear equipment through imaginary
walking, consume Chariot distance, reset sleep debt or heal injury. Ordinary
current-stage arrival is recorded without advancing intermediate stages.
No cross-map/Europe-scale teleportation is claimed here.

**Wheel:** deposits and automatic recaching retain a private depositor
entitlement on the instance. Every claim or recall clears it; a subsequent
deposit belongs to its new depositor. The UI lists only the requesting
journey's eligible caches, never another holder or private position. Self,
owned targets and caches claimed since deposit are ineligible. Weight and
spatial placement are checked before activation; recall changes custody and
placement generation atomically, makes old location evidence historical and
preserves the recalled object's existing cooldown. Concurrent public claim and
recall have exactly one winner under the existing SQLite transaction.

**Sun:** discovery requires an already recorded artifact inscription and a
search starting in [06:00, 20:00) UTC. Activation itself works at any hour.
It does not refill food, clear sleep debt, repair equipment or resurrect a
terminated journey. The current host stores no persistent cold/heat ailment
record to remove; no fictional condition cure is claimed.

**Other discovery/UI details:** Fool has no extra discovery prerequisite;
Wheel needs a retained historical artifact-location clue. Requirement checks
are shared by the authority and public offer preview. Disabled claim buttons
show their unmet condition, headings identify both object and tarot card,
Fool/Wheel offer explicit target selectors, and the journey line shows UTC.
All three get FR/EN names, inscriptions, marker descriptions, authored clues,
packing, sharing and caching through the existing shared surfaces. Plain
guidance remains permission-gated; these powers grant no new blanket unlock.

**Existing local tests:** opening an old three-object world adds only its
missing instances once; original owners, clocks, generations and journeys are
preserved. Old sessions begin tracking visited settlements from their current
validated position and subsequent actions, not inferred past history. An old
cache with no recorded depositor is not silently assigned a recall entitlement.
Creating another journey still does not reset this shared world.

**Verification:** 230 focused JavaScript tests and 64 Python tests pass,
including exact costs, UTC/cooldown boundaries, interrupted actions, invalid
destinations, real bag/companion behavior, legacy-world extension, claim/recall
races and restart/retry. On a fresh temporary browser server, legitimate
journey commands earned and cached the objects; actual UI controls recalled
the hem, returned to a visited settlement without increasing walked distance,
and used Sun to clear 24.8 fatigue for 500 kcal plus metabolism. FR labels,
reload/resume, cooldown displays and the plain-guidance lock were verified.
No main save was created or changed, and the player's existing test server
and database were not used for browser verification.

## 1. Authority, existing work and approval boundary

Design authority:

- [Design PDF](./Les%20Arcanes%20du%20Chemin%20%E2%80%94%20Document%20de%20conception.pdf),
  pages 2-3: the old tarot game, destinies staked, ordinary objects and the
  children's inherited connection; page 20: youth-adventure tone and safety;
  page 23: layer 20 lore and eventual layer 21 shared objects.
- [Requirements](./REQUIREMENTS.md), R-062: persistent virtual caches;
  R-063: engine-owned proximity hints and consistent unique-object locations.
- The standalone layer-20 prototype: 22 original FR/EN names and legendary
  laws; three playable objects (`hermit`, `chariot`, `moon`), four distance
  bands, search, inscriptions and a collector asking for a rubbing.
- Current main-game constraints: a 6 x 4 bag, rotation, 5,500 g total equipment
  capacity including worn equipment; shared simulated time, needs and pressures.

**Retained canon:** 22 major arcana became ordinary objects after an old game
whose stakes were destinies. Parents were involved, and children inherit the
connection. Each object grants something and exacts a price.

**Existing prototype continuity, retained here:** the thimble's inscription says
gold was not staked; the shoelace mentions children's paths; the mirror mentions
an empty seat. Thread/sewing imagery links their fragments. A grey-notebook
collector requests copies without taking possession.

**New proposals requiring review:** the other 19 inscriptions; the concrete
power interpretations; all numeric effects; discovery conditions beyond the
prototype; the mystery explanation and ending in section 7; collector variants;
ownership/recovery policy in section 8. Existing poetic laws are legends, not
literal permission to delete player progress.

The prototype's per-journey copies are not globally unique objects. The target
below intentionally extends into the PDF's shared-world layer. Nothing should
be advertised as shared/unique until server enforcement exists.

## 2. Shared gameplay contract

### 2.0 One discovery mechanism for parent, artifacts and abandoned journals

#### Shared engine, different targets

There must be **one discovery service and one knowledge ledger**, not an
independent hint generator inside each feature. It handles rumours, clues,
riddles, witness reports, search results and notebook recall through a common
pipeline:

**Target adapter -> authorized evidence -> eligible clue -> action quote ->
settlement/revalidation -> committed knowledge -> localized presentation.**

The common engine owns clue identity, information ceilings, channel eligibility,
deduplication, action receipts, knowledge progression, freshness and presentation
selection. Domain adapters own the target's actual state and legal transitions:

| Target type | Domain authority | Facts the adapter may authorize |
|---|---|---|
| `parent-trail` | Existing parent genesis, current stage, prepared path and witness history | Earnable direction, town-name fragment, sighting, photo reference or already known destination; never later stages prematurely |
| `artifact` | Server-owned instance, placement generation, custody and discovery conditions | Current allowed region/town/virtual marker clue, special condition, historical placement or current unavailability |
| `abandoned-journal` | Existing journal service, publication/access policy and side-quest step | Eligible rumour, allowed search area, next discovery step and explicitly shareable notebook evidence; never access credentials or private unpublished content |

An adapter supplies structured facts, not its own prose generator or duplicate
hint history. The common mechanism does not replace atomic artifact claims,
parent-stage transitions or journal access checks. It calls the appropriate
domain action only after eligibility and settlement have been revalidated.
Existing source systems remain authoritative; the ledger stores references and
earned knowledge, not a competing copy of their truth.

#### Common evidence and clue contract

Proposed internal schema, versioned independently of narrative text:

| Field | Purpose |
|---|---|
| `targetType`, `targetRef`, `targetRevision` | Private domain reference and the stage/location/quest generation being described |
| `evidenceId`, `evidenceRevision` | Stable proposition or witness assertion and its approved version |
| `clueId`, `semanticKey` | Clue identity and cross-channel/language deduplication identity |
| `knowledgeRequirements` | Evidence already earned before this clue is eligible |
| `facts`, `allowedAssertions` | Explicit permitted factual content, including which parts are witnessed, uncertain or intentionally mistaken |
| `precisionCeiling`, `allowedDisclosures` | Domain-specific maximum specificity and permitted place names, directions and conditions |
| `observedAt`, `validity`, `availability` | Simulated observation/expiry and current versus historical/unavailable status |
| `channel`, `sourceClass` | NPC, news, sign, search, collector, dream or notebook; source reliability belongs to the assertion, not its fluent wording |
| `actionPolicy`, `receiptId` | Cost, attempt/progression policy and idempotent action result |
| `contentKey`, `contentVersion`, `locale` | Reference to approved wording, riddle and solution content; not gameplay authority |

These fields describe internal authority, not a payload sent wholesale to the
browser or LLM. Presentation exposes opaque clue handles and only earned facts.
Private target references, exact hidden coordinates, future parent stages,
artifact custody identities, journal capabilities and answer-validation secrets
stay on the trusted side. Riddle solutions are separate from the player-facing
prompt. A hidden location must not leak through debugging metadata, filenames,
content keys, images, source labels or generated text.

One piece of knowledge is one semantic proposition at an authorized precision
and target generation. FR/EN translation, an NPC retelling and a notebook
quotation do not make three discoveries. An existing parent report or journal
rumour imports into that same ledger, not a parallel feature-specific history.
If two domains intentionally share evidence, their explicit evidence reference
allows deduplication; similar wording alone never merges unrelated clues.

#### Shared logic does not mean identical rules everywhere

Use policies, not three implementations or one forced distance table:

- Artifacts retain the proposed 300/30/3 km and 250 m ceilings in section 2.1.
- Parent clues retain existing prepared-path proximity, witness ageing,
  uncertainty, guaranteed-progress safeguards and current time/fatigue costs
  until an explicit gameplay change is approved.
- Abandoned journals retain the existing service's rumour eligibility,
  search/discovery steps, access boundaries and costs.
- The adapter names its metric: route distance, great-circle distance or domain
  eligibility. The common service never treats an unprepared path as a known
  path distance or exposes artifact coordinates to imitate parent directions.
- Re-reading earned knowledge is free. A deliberate new witness/search attempt
  may still cost resources and fail or repeat under its existing policy:
  semantic deduplication prevents duplicate rewards/progression, not legitimate
  attempt costs. Show this distinction before confirmation.
- Automatic notifications share one scheduler. **Proposed:** at most one
  unsolicited new clue per 60 walking minutes across all three target types;
  prioritize mandatory parent-progress recovery, then newly actionable tracked
  clues, then least-recently surfaced eligible targets, with stable ID tie-breaks.
  Round-robin equal-priority domains so optional content cannot starve forever.
  This rate limit does not block manual requests, essential quest results,
  safety warnings, availability corrections or notebook recall.
- Artifact revelations use explicit adapter-owned magical permissions, distinct
  from ordinary clue ceilings. A power may bypass distance bands, grant new
  evidence, disclose a target marker or prepare the current route when section
  3 explicitly says so. Apply its declared ceiling, not the ordinary ceiling
  that would nullify the advantage. Record the permission and earned evidence
  through this same ledger; never invent facts or reveal private player data.
  Powers do not reveal later parent stages, change genesis or complete the
  mystery by assertion. Normal hints and ordinary dreams retain normal rules.

Every action uses the existing journey clock, needs/pressure settlement,
interruption checks and revision control. A cancelled dialog costs nothing;
a settled attempt retains the policy's spent time. Replaying a receipt cannot
advance a stage, claim an object, reveal a journal or charge a second time.
Before committing a dynamic clue, revalidate its target generation: stale
artifact/journal availability becomes an explicit historical/unavailable result,
never a newly issued promise about an obsolete hiding place.

#### Riddles and the future LLM/content factory

The LLM generates **riddle prompts, clue wording, NPC delivery, hint ladders and
solution explanations** from approved evidence bundles. It does not create
authoritative target facts, coordinates, service state, ownership, difficulty
rewards or success checks. The engine supplies an answer contract: canonical
answer IDs, approved aliases/choice IDs, prerequisites, allowed deductions and
which solved outcome may unlock which clue/action. No live model judges a
player's answer or decides whether to award discovery.

The original plan was offline/batched generation in versioned content packs.
The later R-136 request permits manually triggered live OVH generation in a
separate [local workshop](./CONTENT_FACTORY.md), initially with fictional
sample briefs and a persistent 20-attempt trial. It does not enable live game
generation or consume player state. Reviewed gameplay packs remain future work.
No paid gameplay-action LLM calls, private player
notebooks, identities, credentials or unpublished journal content are required.
Prompts receive only the allowed evidence and sanitized geographic descriptors,
not hidden coordinates or access to the full world/quest database.

Each generated bundle contains:

1. FR/EN prompt and clue variants keyed to the same semantic evidence.
2. An explicit, ordered hint ladder from evocative wording to plain-language
   actionable guidance, never above the current information ceiling.
3. Author-only answer mapping, explanation and provenance to supplied evidence.
4. Declared locale, precision tier, target-policy compatibility, content version
   and review status.

Validate schema, forbidden disclosures, factual consistency, FR/EN equivalence,
answer reachability and actual in-game solvability. Human review is mandatory
for lore/canon and youth-adventure safety; fluent prose is not evidence that
constraints were satisfied. Publish only reviewed bundles.

Changing target state does not require sending fresh secrets to a model:
the engine selects an eligible approved variant for the current allowed facts.
If a bundle is absent, rejected, withdrawn, incompatible or stale, show a
deterministic FR/EN template **with the same authorized facts**. Missing model
content never blocks a parent quest, artifact search or journal discovery.
Log the missing/invalid content reference for repair rather than hiding the
failure behind fabricated narrative.

Riddles are optional presentation, not a mandatory literary guessing gate.
"Explain plainly" reveals the next allowed rung; the last rung is actionable
without cultural trivia, inaccessible photos or external research. This does
not grant a more precise target than has been earned. Requesting/re-reading an
explanation of already paid evidence costs nothing and grants no extra XP,
money or knowledge tier. A future extra investigative action may earn a higher
tier only under its normal quoted domain policy.
If free-text answers are later offered, normalize against reviewed bounded
aliases; always provide an accessible choice/plain route. The LLM never reads
arbitrary player input as instructions for changing game state.

#### Migration and acceptance

Adapt current parent hints/direction reports and journal results into the
common contract without changing their ordinary probability, prices or quest
state. Do not add historical-save reconstruction or multi-version migration
scaffolding for this sole-player phase. Current evidence keeps its provenance,
including an explicit undated source where a timestamp was never recorded.
Add artifacts as a third adapter, not a third engine. Feature-specific notebook
pages may remain views over the common ledger. No duplicated rewards or charges
for rereading earned knowledge.

Acceptance includes equivalent parent/journal behavior before and after
migration; cross-channel/language no-double-reward checks; current versus
historical location updates; no future-stage/coordinate/capability leakage;
all-three-domain scheduler fairness; deterministic answer/alias checks; and
playable end-to-end journeys with the LLM/content pack entirely unavailable.
Implementation of this common foundation is a prerequisite to lore integration,
not a separate cleanup deferred until after three discovery systems ship.

#### Dreams: a shared discovery channel during sleep

**19 October user addition:** clues may arrive while the player sleeps, influenced
by their cards and distance to the target. This is another channel of the common
engine for parent trails, artifacts and abandoned journals, not a fourth hint
system. The requirement is confirmed; the following balancing policy is proposed.
This describes **ordinary dreams**. The Moon explicitly grants a separate
guaranteed magical dream; Judgement can change the effective daily card without
rerolling an already settled dream. Neither changes birth-card identity.

**Eligibility and timing**

- Use minutes actually settled as ordinary sleep by the host, including an
  ordinary forced-sleep episode. Awake rest, fainting, detention, placement and
  time advanced only by transport or a dialog do not qualify as dreaming sleep.
  If an episode mixes awake rest and sleep, only its sleep portion counts.
- One dream opportunity after 60 qualifying sleep minutes in a continuous
  episode. An episode ends on an awake action or host interruption; splitting
  one continuous sleep into UI segments does not create more opportunities.
- At most one opportunity per rolling 1,440 simulated minutes per journey,
  successful or not. Short naps, repeated saves, language changes and repeatedly
  opening the sleep dialog cannot reroll it. A check with no eligible target is
  still recorded as that episode's opportunity, with outcome `no-eligible-clue`.
  This sleep-specific quota is independent of the 60-walking-minute unsolicited
  clue budget: a dream neither consumes nor resets that budget. Both channels
  still use the same evidence deduplication and target-selection mechanism.
- Capture birth/day cards, authoritative position and target revisions at the
  opportunity instant, not from whatever card happens to be displayed on waking.
  If sleep crosses midnight, use the host's settled daily card at that instant;
  do not perform another tarot draw or another dream check.
- Dream generation occurs during settled sleep; show the memory on waking
  without interrupting real time or requiring a click during sleep. If the
  journey ends before waking, keep the receipt but award no actionable clue.
  A recoverable interruption may display an explicitly fragmented dream.
- Sleeping still has its existing duration, food, health, fatigue recovery and
  exposure rules. A dream adds **no extra minutes, fatigue, food charge, reward
  or healing**. This explicitly overrides the manual artifact hint's 2-minute
  price for the dream channel only; the later search/use retains its own cost.

**Eligible target and distance**

The target adapter supplies a dream-eligible evidence proposition and normalized
proximity `p` in [0, 1]; the presentation layer never computes or invents it.
Only an actionable next permitted clue or a meaningful unlearned interpretation
qualifies. A dream cannot skip prerequisites, reveal the next unearned parent
stage, grant journal access or give a collected artifact's old location as current.

For artifact candidates within 300 km, use great-circle distance to the current
anchor and `p = max(0, 1 - distanceMeters / 300000)`. Precision still uses the
300/30/3 km and 250 m bands; probability and precision are distinct.
For parent and journal candidates, normalize their **existing domain-specific
distance/eligibility bands** from outermost eligible band (`p = 0`) to local
actionable band (`p = 1`), preserving the adapter's named metric. A missing
required route/proximity result makes the candidate ineligible with an explicit
internal reason; do not substitute zero distance or invent a nearby target.
Evidence-only interpretations with no geographic target use `p = 0`, explicitly
classified as recollection rather than a location revelation.

Choose candidates using the common scheduler's quest-recovery priority, then
explicit player-tracked eligible target, highest `p`, least recently surfaced
target and stable evidence ID. Do not roll for every object and take a winner:
select one candidate, then make one probability check, so a world with more
objects does not produce arbitrarily more dreams. If nothing new is eligible,
an atmospheric dream may be shown, labelled as atmosphere, without new knowledge.

**Proposed card influence**

All 22 cards are supported; none is a required card or a promise of success.
Use birth-card and current day-card IDs from actual host state:

| Dream affinity | Card IDs | Per-card chance adjustment | Narrative emphasis |
|---|---|---|---|
| Strong | `priestess`, `hermit`, `star`, `moon`, `judgement` | +0.10 | Hidden writing, solitary signs, light, reflections, remembered voices |
| Guiding | `fool`, `magician`, `lovers`, `chariot`, `wheel`, `hanged`, `world` | +0.05 | Departures, possibilities, paired messages, routes, threads, reversal, connections |
| Grounded | `empress`, `emperor`, `hierophant`, `justice`, `strength`, `nameless`, `temperance`, `devil`, `tower`, `sun` | +0.00 | Food, promises, rules, balance, fear, endings, measures, attachment, circles, warmth |

`chance = min(0.75, 0.15 + 0.35 * p + birthAdjustment + dayAdjustment)`.
Count birth and day roles independently even when their card IDs match.
No other tarot multiplier is applied to this chance. A check succeeds when
the pinned random draw is strictly less than `chance`.
Example: `p = 1`, Moon birth and Chariot day gives 65%, not guaranteed discovery.
At outermost eligibility with two grounded cards it is 15%.
These values are balancing proposals, not claims about existing card effects.

Card imagery can make the dream more symbolic or direct, but never changes the
truth, permitted place names or answer contract. Do not implement reversed-card
behavior by guessing orientation from a name or ID: use it only if the host
actually stores an authoritative orientation, under a separately approved rule.
Until then the same ID follows the table above in either visual orientation.

**Receipt, notebook and freshness**

Persist the opportunity/episode ID, elapsed-minute instant, pinned card roles,
selected evidence and target revisions, policy version, single random draw,
probability and result. These are internal authoritative fields, not a way to
expose hidden distances/anchors. Save/resume or request retries reuse the receipt.
Transfer of an artifact cannot reset a journey's dream quota.

On waking, revalidate dynamic availability before publishing knowledge.
If the target changed while the player slept, show the dream as an explicitly
historical or uncertain memory and offer a normal refresh path, not a current
location promise. No second draw or silent choice of a different target.
Parent/journal adapters decide which old evidence remains valid.

Add a **Dreams / Reves** notebook view over the same evidence ledger, with
sleep/waking observation times, card imagery and the distinction between
symbolic impression, earned clue and historical information. An already earned
clue retold in a dream grants no additional precision, progression or reward.
The same "Explain plainly" ladder is available for dream clues at no extra cost.

The future LLM may generate reviewed dream scenes and their explanations from
the sanitized evidence, card motifs, permitted precision and riddle contract.
It cannot choose a target, roll chance, diagnose the child, threaten real people,
invent a prophecy about actual harm or turn an ambiguous image into authoritative
proof. Deterministic dream templates keep this channel playable without a model.

**Acceptance:** exercise all 22 card IDs, same-card birth/day combinations,
distance-band edges, zero/maximum `p`, exact probability boundaries, midnight
card changes, segmented sleep, ordinary forced sleep versus fainting/detention,
quota equality, interrupted/terminal sleep, target movement while asleep,
cross-channel deduplication, and save/retry without rerolls. Sleep recovery
must be identical with dreams enabled or disabled apart from earned knowledge.

### 2.1 Discovery and proximity

This section is the **artifact policy of section 2.0**, not a separate hint
mechanism. Its discovery costs and bands do not override parent/journal rules.

Use great-circle distance between the authoritative player position and the
artifact's current virtual anchor, not viewport or map-pixel distance:

| Distance, inclusive | What a new rumour may reveal |
|---|---|
| More than 300 km | No current-location rumour |
| Up to 300 km | Artifact identity and broad region; no town |
| Up to 30 km | Validated town name |
| Up to 3 km | Named **virtual** town marker |
| Up to 250 m | Exact in-game interaction and special search condition |

These are **ordinary-channel** information ceilings. No ordinary hint payload contains hidden coordinates,
exact distance, bearing or private placement IDs. NPC, news and notebook use
the same permitted facts. A retained notebook clue can be more precise than
the current distant rumour, but must carry its observation time and availability.
Explicit magical revelations in section 3 may exceed these ceilings, including
an exact in-game marker. Such a marker is earned player-visible information,
not a leak: expose only the authorized target and location generation, never
the raw placement database or another player's position. An unavailable target
cannot be located through its holder.

Earning a new tier costs 2 simulated minutes per artifact/location generation;
rereading, changing language/channel, or retreating costs zero. Reaching a higher
tier directly costs 2 minutes, not 2 minutes for every skipped tier. No random
roll is required. Skipped tiers are considered learned. Automatic artifact
rumours share the cross-domain 60-walking-minute budget in section 2.0; manual "Ask about
arcane objects" can request an eligible rumour without that automatic timer.
Multiple candidates are ordered by nearest distance, then least recently heard,
then artifact ID. Players may select a previously known artifact explicitly.

A deliberate search costs 10 minutes and uses normal awake metabolism.
It requires a local clue for the current placement generation and distance
within 250 m at search start. A search with an unmet condition still costs
10 minutes, but the unmet condition must be shown **before confirmation**.
No random discovery failure is added when all requirements hold.
Unknown IDs, missing placements and already-owned items are not paid searches:
show an explicit unavailable/already-owned explanation.

Time windows use **UTC**, matching the existing journey clock, and are labelled
UTC in both languages; this is a deliberate, reviewable simplification rather
than unimplemented local-time/DST inference. Night is [20:00, 06:00), dawn
[06:00, 08:00), day [06:00, 20:00), evening [18:00, 20:00).
Conditions are evaluated at action start, after any preceding clue action.
Normal interruption rules can stop a search before discovery.

Every location marker is an authored virtual object at a validated real town
anchor, not a real cache, private building, named resident or physical hiding
place. Marker types in the catalogue below are fictional scenery in the game.
Placement does not depend on a real shop, opening hours or provider event.
No real-world visit, property access or physical search is requested.

### 2.2 Inventory and inspection

- Artifacts are carried, never worn in the boots/backpack/clothing slots.
  Dimensions below are width x height in bag cells; rotation is allowed.
- They count toward the existing 5,500 g limit. No special weightless quest bag,
  automatic deletion of equipment or silent expansion of capacity.
  The black elastic explicitly cancels movement load penalties temporarily;
  it does not change physical bag dimensions or the hard carrying limit.
- Inspecting an owned object, reading a retained inscription, and reorganizing
  the bag cost zero minutes. Copying a newly found inscription is included in
  the discovery action; it does not require a camera or consumable.
- Before discovery, preview the footprint and weight. If it cannot fit, offer
  rearrangement or explicit cancellation before starting the search. No claim
  is made while rearranging. Capacity is checked again at commit.
- An artifact is not sold, discarded, repaired or destroyed through ordinary
  equipment controls. "Leave a virtual cache" is the explicit transfer action.
  Objects do not wear out; their costs come from the power rules.
- A notebook inscription is knowledge, not another copy of the artifact.
  It survives depositing or losing ownership.

### 2.3 Powers, stacking and payment

Activation is an explicit **Use artifact** choice while carried and owned.
Nothing activates on pickup, hover, inspection or language change.
The confirmation names the target, exact benefit, costs, expiry and limits.

**Power budget:** finding and keeping one of only 22 world objects is the main
price. A power must save substantial travel, survival resources or investigative
effort. Costs create a decision, not cancel its benefit. No notification muting,
cosmetic bookkeeping or access to already-readable text counts as a power.
Legendary prices are thematic inspiration; never secretly delete progress.

Shared rules, unless an entry explicitly overrides them:

1. Activation takes **1 simulated minute** of normal awake metabolism. The price
   is additional to that minute. A power that reduces another action's time
   never reduces its own activation time.
2. Each artifact has a **1,440-minute instance cooldown**, unless its entry
   specifies 4,320 minutes (72 hours). There is **no shared journey cooldown**:
   owning two artifacts really grants two powers. Cooldowns start at successful
   activation commit and follow the globally unique instance. Giving away,
   recovering, transferring or calling it with another journey cannot reset it.
3. No activation during another activity, walking step, sleep, transport,
   fainting, placement, a pending terminal outcome or another lore transaction.
4. Target and affordability are checked before acceptance. Clamped-away benefits,
   unknown targets, unprepared routes or absent required history make the action
   unavailable with a reason, not a paid no-op.
5. Advance the activation minute through the host's existing metabolism/pressure/event
   settlement. If the journey is interrupted or ends, apply no magical effect,
   extra price or cooldown. Time and ordinary needs already spent remain spent.
   Otherwise apply benefit, price and cooldown atomically against current state.
6. Extra fatigue, vigilance and food costs are visible in the quote. Block use
   if a direct cost would reach 100 fatigue/vigilance, consume all remaining food,
   or be unaffordable after activation metabolism. Prices never become negative,
   create credit, or clamp to a smaller payment. No direct health price.
7. Timed effects start at successful commit. Intervals are [start, end); expire
   through simulated time even after deposit or loss. Costs are never refunded.
   Cooldowns, delayed consequences and expiry persist across reloads.
8. Different artifact effects **may coexist**. Reusing the same instance never
   stacks or refreshes its active benefit: wait for both expiry/consumption and
   cooldown. For overlapping percentage protections of the same component,
   take the strongest reduction, not their sum/product. Resource restoration
   respects the host's caps; protection never turns damage into healing.
   Pay each price once; no effect cancels another artifact's explicit price.
9. Effects are keyed to their activation transaction. One-use modifiers are
   consumed only by their named completed action, not by opening/cancelling UI.
   If that action has a normal failure outcome, it still consumes the modifier.
   The target and outcome are pinned; retries cannot reroll or pay twice.
10. Specific entries may override travel, survival, inquiry success or the
    daily tarot. These exceptions are real gameplay permissions, not prose-only
    promises. Never change the birth card, raw skills, earned XP, prior facts,
    wallet/ownership history or the parent's truth; never resurrect a terminal
    journey, steal another player's object or enter real private property.
    Unrelated rules remain active. Ledger credits, protection and relocation
    are new events, not deletion or rewind of past events.
11. A timed protection applies only during its covered interval. Split host
    settlement at effect boundaries, including mid-action expiry; never make
    the whole long action free because it started under protection.
    Distance/walking-time allowances similarly split committed movement at
    the allowance boundary; effects never infer an uncommitted intermediate
    location from a UI preview.
12. Relocation requires validated loaded source/destination cells, a safe
    public virtual landing marker, capacity and authoritative arrival handling.
    It does not require a walkable connecting route; that is the magic.
    Transfer position and carried inventory atomically, then apply ordinary
    arrival rules for the current stage only. Never count teleport distance as
    walking, exploration XP or transport tickets; never auto-complete unseen
    intermediate stages. Failure to validate either end is a pre-charge error.
13. Emergency protection checks run before terminal/deposit/placement side
    effects, consume a persisted charge atomically, and are never usable after
    those side effects have committed. Evaluate the effective protected outcome
    once; ordinary clocks/events continue without retrying for a better result.

**Common terms used below:**

- "Reserve" means food energy in kcal, not health. Use the existing reserve cap.
- "Prepared next stage" means a real, successfully prepared parent walking path,
  with distance/time already computed by the existing host; never an air-line
  guess. The Star explicitly grants preparation for the current stage; other
  entries do not pretend missing route data exists.
- "Ordinary inquiry" means a manually selected parent-direction conversation,
  normally without guaranteed truth, excluding paid rerolls, rumors and searches.
- A "direction card" is an optional notebook summary of an already known stage's
  origin/destination town and existing supplied facts. It adds no exact hidden
  parent position, new testimony, navigation arrow or unearned stage completion.
- One-use modifiers expire after 120 minutes unless another duration is stated.
- Percent reductions apply only to the named base component, never the complete
  stacked outcome. Round minutes/kcal **up** after modification, minimum one
  minute for a nonzero action. Money is integer cents.
- Multiple non-lore modifiers keep their existing order. Compute their normal
  outcome, then apply the artifact's declared reduction/protection to its named
  components. Basal needs, health, weather and sleep pressure remain normal
  unless an entry explicitly protects them. Quote what is and is not covered.

## 3. The 22 artifacts

All inscriptions below have a proposed English counterpart for FR/EN review.
Legendary laws retain the existing catalogue's themes; the following strong
mechanics supersede the earlier convenience interpretations. Each object has
one signature power and inherits section 2, including its **1-minute activation
and 1,440-minute instance cooldown** unless explicitly stated otherwise.

### 01. `fool` - L'ourlet sans fin / The endless hem

- **Legend:** shows a forgotten step, but erases the latest one.
- **Discovery:** virtual unfinished hem on a paper departure board; no extra
  condition beyond the local clue. Introductory object, not a tutorial guarantee.
- **Inscription:** FR: "La premiere mise etait un depart." EN: "The first stake was a departure."
- **Power - The impossible return:** instantly return to any settlement
  personally visited in this journey, anywhere in the supported world. Carry
  the bag, artifacts and companion with you. No ticket, walking or travel time
  beyond activation: hundreds of kilometres reduced to one minute.
- **Price:** 10 fatigue at activation.
- **Limits/failure:** destination must differ from the current cell and have
  a validated public landing marker. No unvisited destination, escape from
  already committed detention or restoration of previously lost equipment.
  Ordinary current-stage arrival can occur; walking statistics do not increase.
- **Bag:** 1 x 1; 20 g. **Mystery:** the stakes concerned departures, not money.

### 02. `magician` - Le de a sept points / The seven-dot die

- **Legend:** returns a forgotten possibility and removes a certainty.
- **Discovery:** virtual game-counter at the town marker; successfully complete
  one existing earning mini-game in this journey, at any score, first.
- **Inscription:** FR: "Une regle pouvait etre refusee." EN: "One rule could be refused."
- **Power - Load the dice:** choose an available earning mini-game in the
  current locality. Resolve it immediately as its best legal success and
  receive its maximum ordinary reward, up to EUR 20, without playing or
  spending the activity's normal duration. Only the activation minute passes.
- **Price:** 200 reserve kcal. Any ordinary entry fee is still quoted and paid.
- **Limits/failure:** the activity must be currently available and have a
  positive quoted reward after the cap; preserve its normal earning cooldown
  and consume its offer atomically. This creates a labelled magical success,
  not a fabricated leaderboard score or practice XP. No repetition of a used
  offer, competitive multiplayer result, casino wager or real-money payout.
- **Bag:** 1 x 1; 30 g. **Mystery:** consent, rather than winning, can change a rule.

### 03. `priestess` - Le buvard bleu / The blue blotter

- **Legend:** reads an erased letter, then absorbs a cherished word.
- **Discovery:** virtual paper letter; share one already earned inscription
  rubbing with a collector before searching. No ownership transfer is required.
- **Inscription:** FR: "L'encre gardait le nom du premier consentement." EN: "The ink kept the first consent's name."
- **Power - Read behind the ink:** select one active parent or accessible
  journal clue and reveal the authoritative answer behind its uncertainty.
  For the current parent stage, reveal the true destination town and mark
  conflicting existing reports as contradicted where the adapter can prove
  it. For a journal step, reveal its exact next virtual search marker and
  solution. Distance and ordinary witness reliability do not limit this vision.
- **Price:** 10 fatigue.
- **Limits/failure:** one selected target per activation; truth comes from
  authored/server facts, never an LLM reliability guess. No future parent
  stage, unpublished/private journal, secret capability or other player's
  private text. The resulting knowledge persists but does not move the player
  or automatically complete the physical search.
- **Bag:** 1 x 1; 25 g. **Mystery:** a consent had an identifiable author.

### 04. `empress` - La cuillere de bois / The wooden spoon

- **Legend:** multiplies a mouthful but takes its flavour away.
- **Discovery:** virtual table drawing; finish one normally paid settlement meal
  in this journey first. The meal is not refunded or awarded by discovery.
- **Inscription:** FR: "On ne peut miser la faim d'un autre." EN: "Another person's hunger cannot be staked."
- **Power - A feast from nothing:** immediately fill reserve to the host's
  normal maximum, without food, money, a shop or meal duration. For the next
  12 simulated hours, reduce all ordinary reserve consumption by 75%, including
  basal and walking consumption.
- **Price:** 5 fatigue; the meal is magically tasteless in narrative only.
- **Limits/failure:** no food inventory or saleable ration is created. Explicit
  artifact reserve prices are still paid in full. This prevents hunger by
  feeding the player; it does not heal existing starvation injury or directly
  restore health. Available if either refill or future consumption protection
  can help, with both components shown separately.
- **Bag:** 1 x 2; 70 g. **Mystery:** the original rules protected dependants.

### 05. `emperor` - Le bouton de cuivre / The copper button

- **Legend:** holds a promise closed even when one should leave.
- **Discovery:** virtual button on a drawn gate; remain in one host locality
  for 30 consecutive simulated minutes first, including normal exposure costs.
- **Inscription:** FR: "Le gardien a promis de tenir la table." EN: "The keeper promised to hold the table."
- **Power - The unassailable camp:** create a virtual sanctuary at the current
  land cell for up to 8 simulated hours. Set vigilance to zero and prevent
  vigilance increases, ordinary theft, weather-exposure damage and
  shelter-related interruption while resting or sleeping there. Sleep receives
  the host's best normal shelter recovery even without a tent or lodging.
- **Price:** 250 reserve kcal.
- **Limits/failure:** moving from the cell or starting an activity other than
  rest/sleep ends the sanctuary. Hunger and existing illness still apply.
  Cannot start in committed detention/placement, cancel a terminal state or
  grant access to real private property. This creates in-game shelter; it
  does not claim a real building is open or safe.
- **Bag:** 1 x 1; 40 g. **Mystery:** someone stayed voluntarily to keep a promise.

### 06. `hierophant` - Le cahier quadrille / The squared notebook

- **Legend:** translates an oath but obliges its bearer to hear it.
- **Discovery:** virtual ruled ledger; have two distinct inscriptions recorded.
- **Inscription:** FR: "Une promesse ne se transmet pas par le sang." EN: "A promise is not inherited through blood."
- **Power - Read the missing words:** reconstruct up to **three unread
  evidence fragments** behind earned inscriptions or accessible journal clues.
  Reveal erased sentences, omitted conditions and missing connections, not
  comparisons of already-readable text. Preview the eligible sources, then
  choose the fragments. Store them permanently with provenance; qualifying
  inscription copies count toward ordinary mystery gates.
- **Price:** 5 fatigue and 10 additional exposed concentration minutes after
  activation. Reveal the pinned bundle at completed concentration, not in
  partial, retryable increments. Interruption spends actual time/needs and
  the committed activation price/cooldown; the bundle remains unread.
- **Limits/failure:** an approved fragment catalog supplies the missing
  evidence, qualification for story gates and prerequisites. May bypass the
  collector's daily archive limit, not journal privacy or future parent stages.
  One or two eligible fragments can be used with explicit preview; zero makes
  activation unavailable. Revalidate the pinned bundle atomically; never
  invent substitute evidence or count non-inscription notes as artifacts.
- **Bag:** 2 x 2; 160 g. **Mystery:** inheritance was an alteration, not a valid rule.

### 07. `lovers` - La pince a linge fendue / The split clothes peg

- **Legend:** joins two messages and separates their signatures.
- **Discovery:** virtual paired slips; earn parent testimony in two distinct
  localities, regardless of whether either testimony is useful.
- **Inscription:** FR: "Deux mains ont signe une seule mise." EN: "Two hands signed one stake."
- **Power - Follow the bond:** attune to the current parent-investigation target
  for **180 minutes of actual walking**. Show a supernatural compass toward
  the next traversable waypoint of the authoritative current-target path,
  even before ordinary clues reveal the town. After each committed walking
  step, also show **warmer**, **colder** or **unchanged** using the same
  reliable proximity metric. This really guides the player, not their notebook.
  No extra inquiry or clue charge.
- **Price:** 5 fatigue at successful activation.
- **Limits/failure:** requires a reliable parent-adapter proximity metric at
  activation and each comparison. No air-line substitute for missing route
  data; transient inability to compare produces explicit feedback-unavailable,
  not a guessed signal. Preflight includes endpoint support for committed-step
  comparisons and an authorized next-waypoint bearing. Expose the earned compass
  indication, not the entire hidden path database.
  Equal values at the adapter's declared resolution mean unchanged.
  This power explicitly authorizes qualitative feedback about the current
  target, but reveals no exact target coordinates, full route overlay, witness-truth
  verdict or future stage. It does not complete a stage automatically.
  Pin the stage/target revision; reaching, replacing or invalidating it ends
  attunement without transfer to the next target.
  The duration is an explicit walking-time exception to section 2.3's normal
  simulated-time windows: rest, sleep and vehicle travel neither consume it
  nor produce signals. Interrupted walking consumes only committed walking
  minutes; the final step gets a signal only if it ends within the 180-minute
  allowance, including exact equality. No uncommitted-position signal.
  Save remaining walking minutes and step receipts; replay, cancelled movement
  or UI previews cannot probe direction, refresh duration or repeat rewards.
  Target termination or voluntary dismissal ends the effect without refund
  or cooldown reset. Other artifacts can be used during attunement.
- **Bag:** 1 x 1; 30 g. **Mystery:** two players collaborated on the disputed stake.

### 08. `chariot` - Le lacet rouge / The red shoelace

- **Legend:** retraces a travelled path but unravels a shortcut.
- **Discovery:** virtual red-thread marker; record at least 1 km of actual
  walking in this journey before searching.
- **Inscription:** FR: "Nous avons mise les chemins de nos enfants." EN: "We staked our children's paths."
- **Power - Seven-league stride:** for the next **20 km of walking**, reduce
  walking duration, walking-added fatigue and walking-effort reserve use by
  **75%**, on new as well as visited terrain. A four-hour walk takes one hour.
  Basal needs run for the shortened elapsed time, not the old duration.
- **Price:** 200 reserve kcal at activation.
- **Limits/failure:** allowance expires unused after 24 simulated hours; no
  vehicle effect or terrain-access bypass. Keep real geographic distance in
  walked-distance statistics, but use actual shortened minutes for practice,
  automatic rumour timers and other time-based rewards. Normal weather/health
  losses apply over actual elapsed time. Walking events settle once per host
  policy, not four times because the player moved faster.
- **Bag:** 1 x 2; 20 g. **Mystery:** confirms the inherited paths explicitly.

### 09. `justice` - La regle ebrechee / The chipped ruler

- **Legend:** measures a debt and reveals the bearer's own.
- **Discovery:** virtual measurement strip; finish one normally paid action and
  one completed earning activity in this journey, without minimum gain.
- **Inscription:** FR: "Le prix n'etait pas inscrit du meme cote." EN: "The price was not written on the same side."
- **Power - Make the world pay you back:** refund up to **EUR 30** of actual
  ordinary spending during the preceding 24 simulated hours. Meals, lodging,
  tickets and equipment purchases still provided their benefits; the money
  returns to the wallet anyway. Show the exact refund before confirmation.
- **Price:** 5 fatigue.
- **Limits/failure:** choose most recent eligible debits first, with stable
  transaction-ID tie-breaking. Record a new magical credit and the amount
  reclaimed against each original debit; never erase history or reclaim the
  same cent twice. Exclude artifact prices, deposits, peer transfers and
  previously reversed transactions. Return/cancellation systems subtract
  magical reimbursement from later refunds to prevent double repayment.
  No eligible amount means unavailable; no real-world money is involved.
- **Bag:** 1 x 2; 45 g. **Mystery:** the original price was concealed in the rules.

### 10. `hermit` - Le de a coudre ajoure / The pierced thimble

- **Legend:** lights one hidden seam while dimming the others.
- **Discovery:** virtual paper seam; no extra condition.
- **Inscription:** FR: "Nous n'avons pas mise de l'or." EN: "We did not stake gold."
- **Power - See the hidden seam:** choose one currently unowned artifact from
  the available catalogue. Reveal its **exact current virtual map marker,
  town and discovery condition anywhere in the supported world**, regardless
  of distance or whether the player had heard of it. Earn its local clue
  immediately; only travel and the physical search remain.
- **Price:** 10 fatigue.
- **Limits/failure:** this explicitly bypasses ordinary distance bands, not
  custody. The server offers only hidden/publicly cached candidates, never
  the identity or location of a holder. No exclusive reservation: another
  player may arrive first. Revalidate at commit; later movement makes the pin
  historical and visibly unavailable, not a live tracker of another player.
  Self, unplaced and already-carried objects are ineligible.
- **Bag:** 1 x 1; 15 g. **Mystery:** excludes a merely financial wager.

### 11. `wheel` - La bobine vide / The empty spool

- **Legend:** returns a lost thread and tangles the one being followed.
- **Discovery:** virtual empty bobbin; keep a clue from a previous placement
  generation that the server has marked historical.
- **Inscription:** FR: "Le fil change de main, pas de dette." EN: "The thread changes hands, not its debt."
- **Power - Pull the thread home:** recall one artifact previously carried
  by this journey and currently lying in a public virtual cache. It appears
  directly in the bag, across any distance, without travel or searching.
- **Price:** 10 fatigue. **Cooldown:** 4,320 simulated minutes (72 hours).
- **Limits/failure:** the recalled instance must have remained publicly cached
  since this journey's own deposit or automatic recaching; once another journey
  claims it, that recall entitlement ends. No stealing, duplicate instance,
  cooling reset or recalling this spool itself. Atomically check custody,
  generation, footprint and weight before charging. Concurrent local claim
  and recall compete on the same instance revision; exactly one succeeds.
  Its old clues become historical and its existing cooldown follows it.
- **Bag:** 1 x 1; 35 g. **Mystery:** responsibility follows choices, not possession.

### 12. `strength` - La brosse douce / The soft brush

- **Legend:** soothes a fear but keeps it until morning.
- **Discovery:** virtual brush drawing; at least one recorded faint or
  recoverable placement, without requiring a new dangerous action.
- **Inscription:** FR: "La peur pouvait etre partagee, jamais donnee." EN: "Fear could be shared, never handed away."
- **Power - Borrow a giant's strength:** set fatigue to zero, then prevent
  ordinary fatigue gain for **3 simulated hours**, including walking and
  activity fatigue. Fatigue-threshold fainting cannot occur during protection.
- **Price:** 300 reserve kcal. No surprise fatigue debt at dawn.
- **Limits/failure:** direct prices of other artifacts still apply and are not
  protected. Sleep deprivation governed independently of fatigue, hunger,
  weather injury, vigilance and terminal health still work normally. When
  protection expires, fatigue resumes from its actual current value; no
  catch-up bill for prevented fatigue. Cannot undo an already committed faint.
- **Bag:** 1 x 2; 90 g. **Mystery:** the pact originally allowed mutual support.

### 13. `hanged` - La chaussette retournee / The inside-out sock

- **Legend:** shows the other side of a choice and suspends the decision.
- **Discovery:** virtual reversed fabric; inspect at evening [18:00, 20:00).
- **Inscription:** FR: "Attendre etait encore un choix." EN: "Waiting was still a choice."
- **Power - Step outside the hour:** for **120 simulated minutes**, ordinary
  reserve loss, fatigue gain, vigilance gain, health damage and sleep-pressure
  accumulation are suspended. Walk, search, work or wait while the world
  advances but your survival meters cannot worsen from ordinary causes.
  Positive recovery still works.
- **Price:** EUR 3 at activation. **Cooldown:** 4,320 minutes (72 hours).
- **Limits/failure:** activation and direct artifact prices are not protected.
  Calendars, shops, routes, other effect durations and world custody keep
  advancing normally; this is personal stasis, not a server/world pause.
  No escape from committed detention or terminal outcomes, no undo of a
  prior wound. On expiry normal deterioration resumes without catch-up.
- **Bag:** 1 x 2; 45 g. **Mystery:** refusing to play was an available move.

### 14. `nameless` - Le taille-crayon emousse / The blunt sharpener

- **Legend:** ends a story by shortening its title.
- **Discovery:** virtual pencil shaving; record one definitively closed optional
  lore lead (artifact taken elsewhere or an obsolete placement).
- **Inscription:** FR: "Finir la partie ne voulait pas dire perdre quelqu'un." EN: "Ending the game did not mean losing someone."
- **Power - Cut off the bad ending:** arm a one-use life-saving charge for
  24 simulated hours. Before the next ordinary terminal health/exhaustion
  outcome commits, prevent it, set health to at least 50% of its normal cap,
  reserve to at least 50%, fatigue to at most 30 and vigilance to zero,
  and relocate to the last validated visited settlement, keeping belongings
  and companion. If none exists, use the journey's validated starting marker.
- **Price:** 10 fatigue when armed. **Cooldown:** 4,320 minutes (72 hours).
- **Limits/failure:** automatic trigger consumes the charge atomically before
  death, abandonment publication or artifact recaching. Preserve the action's
  elapsed time, spent money and earned facts; no replay of its reward.
  Terminal placement count and explicit player abandonment are not health
  deaths and are not prevented. Preflight must ensure a safe recovery marker.
  No activation after termination, resurrection or rollback of committed death.
- **Bag:** 1 x 1; 25 g. **Mystery:** breaking the pact need not sacrifice a person.

### 15. `temperance` - Le bouchon perce / The pierced stopper

- **Legend:** measures a confidence but cannot retain a whole secret.
- **Discovery:** virtual bottle outline; share two distinct inscription rubbings.
- **Inscription:** FR: "Chacun ne devait porter qu'une part." EN: "Each was meant to carry only a share."
- **Power - Pour strength into life:** spend reserve to immediately restore
  **up to 40 health points on a 0-100 scale** and remove **up to 40 fatigue**.
  Scale health proportionally if the host uses another cap. This is genuine
  healing without a clinic, bed, meal or recovery duration.
- **Price:** 500 reserve kcal, quoted in full. The player must retain a positive
  reserve after payment; choose when this exchange is worthwhile.
- **Limits/failure:** both restorations are capped at normal bounds, never
  reduce an already better value and require at least one positive benefit.
  No terminal rescue, item creation or automatic endless conversion. The
  daily instance cooldown applies even if paired with the Empress's refill.
- **Bag:** 1 x 1; 20 g. **Mystery:** the objects originally distributed a burden.

### 16. `devil` - L'elastique noir / The black elastic

- **Legend:** holds what is coveted and tightens around what is owned.
- **Discovery:** virtual elastic around a paper inventory; voluntarily deposit
  any previously held artifact once. No purchase, theft or dangerous encounter.
- **Inscription:** FR: "Garder n'etait pas posseder le choix d'un autre." EN: "Keeping did not mean owning another's choice."
- **Power - Make the burden weightless:** for **24 simulated hours**, cancel
  all load-derived walking time, fatigue and energy penalties and prevent
  ordinary condition wear on all carried/worn equipment. A full legal bag
  travels like an empty one, and boots/tent/camera do not wear out.
- **Price:** EUR 3 at activation.
- **Limits/failure:** actual weight, bag layout and 5,500 g hard capacity remain
  unchanged: no unsafe temporary over-capacity inventory to resolve later.
  No repair of pre-existing damage, protection from explicit surrender/theft,
  extra item copy or protection after an ordinary item leaves the inventory.
  Newly acquired legal equipment joins the effect until its original expiry.
- **Bag:** 1 x 1; 15 g. **Mystery:** possession does not grant authority over people.

### 17. `tower` - La craie cassee / The broken chalk

- **Legend:** opens a closed circle, then erases its shelter.
- **Discovery:** virtual chalk circle; search during day [06:00, 20:00).
- **Inscription:** FR: "Le cercle tenait par une phrase ajoutee." EN: "The circle held through an added sentence."
- **Power - Break the circle:** set vigilance to zero and prevent every
  ordinary vigilance increase and vigilance-triggered placement for
  **24 simulated hours**, including lingering and failed social actions.
  Search a locality repeatedly or spend a whole day there without that meter
  forcing departure.
- **Price:** 10 fatigue.
- **Limits/failure:** this deliberately overrides the vigilance pressure rule,
  not hunger, exposure, fatigue or health. No reset of prior placement counts,
  escape from already committed care/detention or physical trespass permission.
  Ordinary event choices remain available; suppress their vigilance component,
  not unrelated consequences. Explicit artifact vigilance prices still apply.
- **Bag:** 1 x 1; 30 g. **Mystery:** a later rule, not the original pact, held the trap.

### 18. `star` - Le tamis de poche / The pocket sieve

- **Legend:** keeps a glimmer and lets reassurance slip through.
- **Discovery:** virtual pinprick star; search at dawn [06:00, 08:00).
- **Inscription:** FR: "Un chemin restait hors des cartes." EN: "One path remained outside the cards."
- **Power - The road that was hidden:** reveal the current parent-stage
  destination and prepare a real traversable route from the current cell,
  without prior clues, a witness, money or ordinary route-preparation delay.
  Keep the route and its distance/time guidance in the notebook until stage
  completion. The player still walks or uses another travel power.
- **Price:** 8 fatigue.
- **Limits/failure:** routing must actually succeed before activation is
  offered; no straight line passed off as a traversable road. The route is
  earned magical knowledge, not the parent's private exact live position.
  No future stages or automatic journey completion. Refresh invalidated map
  segments explicitly; do not charge another use to repair a provider error.
- **Bag:** 2 x 1; 80 g. **Mystery:** the children can choose outside the inherited route.

### 19. `moon` - Le miroir de poche mat / The clouded pocket mirror

- **Legend:** reflects an absence at night and dims a memory by morning.
- **Discovery:** virtual mirror sleeve; search at night [20:00, 06:00).
- **Inscription:** FR: "Une place a la table est restee vide." EN: "One seat at the table stayed empty."
- **Power - Dream with open eyes:** the next ordinary sleep of at least
  60 minutes delivers **up to three guaranteed new clues**, at most one each
  for the current parent stage, an unowned artifact and an accessible journal
  step. Reveal the parent destination, the artifact's exact virtual marker,
  and the journal step's search marker/solution for eligible selected targets.
  These are magical revelations, independent of distance, cards and dream RNG.
- **Price:** 8 fatigue at activation. The sleep itself still restores normally.
- **Limits/failure:** activate at night; select and pin eligible evidence
  before charging, with at least one target. Starts one sleep-bound effect,
  expiring unused after 24 simulated hours. On waking revalidate each target;
  dynamic evidence may be historical, never silently rerolled or replaced.
  This explicitly bypasses the ordinary dream quota/chance/precision, records
  a separate artifact receipt and does not reset that ordinary quota. A dream
  opportunity in the same sleep deduplicates against these clues before its
  ordinary candidate selection. No private journals, carried-artifact tracking
  or later parent stage. Plain explanations and templates remain available.
- **Bag:** 1 x 2; 100 g. **Mystery:** the empty seat is the disputed participant.

### 20. `sun` - Le mouchoir jaune / The yellow handkerchief

- **Legend:** warms a memory while fading its edges.
- **Discovery:** virtual yellow cloth; search during day [06:00, 20:00) and have
  at least one inscription recorded.
- **Inscription:** FR: "Le nom d'un enfant n'est pas une monnaie." EN: "A child's name is not a currency."
- **Power - A second morning:** immediately restore health to its normal
  maximum and fatigue to zero. Remove recoverable cold/heat exposure conditions
  the host actually models. No rest, clinic, shelter or daylight is required.
- **Price:** 500 reserve kcal. **Cooldown:** 4,320 minutes (72 hours).
- **Limits/failure:** usable only on an active journey with a positive quoted
  restoration. Does not fill reserve, refund sleep debt, repair equipment or
  cure a condition absent from the host model. Cannot resurrect or cancel a
  terminal result already committed. Exposure can accumulate again afterward.
- **Bag:** 1 x 1; 35 g. **Mystery:** rejects the substituted stake explicitly.

### 21. `judgement` - Le reveil sans aiguilles / The handless alarm clock

- **Legend:** recalls a voice but interrupts a dream.
- **Discovery:** virtual clock sketch; finish one normally settled 60-minute
  sleep segment earlier in this journey. No forced sleep deprivation.
- **Inscription:** FR: "Le temoin avait dit non." EN: "The witness had said no."
- **Power - Call a different destiny:** choose **any of the 22 daily tarot
  cards** and use its real gameplay modifiers for the next 24 simulated hours.
  Replace an unfavourable draw with the card that best supports the next leg;
  dream checks also use this actual effective daily card.
- **Price:** 10 fatigue. **Cooldown:** 4,320 minutes (72 hours).
- **Limits/failure:** birth card and prior tarot history never change. Maintain
  ordinary daily draws in a separate underlying slot as days pass; the chosen
  override remains effective until expiry, then the current natural day card
  resumes. This is not 22 simultaneous buffs or a retroactive recomputation of
  settled actions. Affected actions pin the effective card by the host's normal
  settlement rules. Show override, natural card and exact expiry distinctly.
  No second tarot journal reward or dream reroll for applying/removing it.
- **Bag:** 2 x 2; 220 g. **Mystery:** the empty-seat witness never consented.

### 22. `world` - L'enveloppe ronde / The round envelope

- **Legend:** joins the fragments but detaches its bearer's signature.
- **Discovery:** virtual circular envelope; record six distinct inscriptions
  spanning at least three threads defined in section 7.
- **Inscription:** FR: "La derniere signature doit etre libre." EN: "The last signature must be free."
- **Power - Fold the world:** instantly travel to **any already-named,
  validated settlement in the supported world**, even one never visited.
  Carry all belongings and companion; no ticket, route or intervening travel
  time is needed. A town learned through a genuine clue is enough.
- **Price:** 500 reserve kcal and 10 fatigue.
  **Cooldown:** 4,320 minutes (72 hours).
- **Limits/failure:** source and safe destination marker must be loaded and
  validated before charging. No arbitrary coordinate input, private property,
  unknown future parent destination, automatic completion of intermediate
  stages or teleport back after committed death/detention. Current-stage
  arrival settles normally. Unlike the Fool, no prior visit is required;
  the longer cooldown is the price of crossing the world on a new lead.
- **Bag:** 2 x 1; 40 g. **Mystery:** frames the final voluntary choice.

## 4. Discovery accessibility and balancing review

### Power overview: why ownership changes the journey

| Entry | Object | Real advantage |
|---|---|---|
| 01 | Endless hem | Teleport to a previously visited settlement |
| 02 | Seven-dot die | Instant best earning-game reward, up to EUR 20 |
| 03 | Blue blotter | Reveal the truth behind a current parent/journal clue |
| 04 | Wooden spoon | Full reserve refill and 75% less consumption for 12 hours |
| 05 | Copper button | Eight hours of safe, best-shelter sleep anywhere on valid land |
| 06 | Squared notebook | Recover up to three genuinely new evidence fragments |
| 07 | Split clothes peg | Hidden-target compass for 180 walking minutes |
| 08 | Red shoelace | Walk 20 km with 75% less travel time and walking effort |
| 09 | Chipped ruler | Recover up to EUR 30 of real game expenses |
| 10 | Pierced thimble | Locate an unowned artifact exactly, anywhere |
| 11 | Empty spool | Recall your still-unclaimed cached artifact into the bag |
| 12 | Soft brush | Zero fatigue and three hours without ordinary fatigue gain |
| 13 | Inside-out sock | Two hours without ordinary survival-meter deterioration |
| 14 | Blunt sharpener | Prevent one terminal health/exhaustion outcome and escape |
| 15 | Pierced stopper | Convert 500 kcal into up to 40 health and 40 fatigue recovery |
| 16 | Black elastic | No load penalties or ordinary equipment wear for 24 hours |
| 17 | Broken chalk | Zero vigilance and no ordinary vigilance gain for 24 hours |
| 18 | Pocket sieve | Reveal and prepare the current parent's route without investigation |
| 19 | Clouded mirror | Up to three guaranteed, high-precision dream revelations |
| 20 | Yellow handkerchief | Full health and zero fatigue immediately |
| 21 | Handless alarm clock | Choose your effective daily tarot for 24 hours |
| 22 | Round envelope | Teleport to a named settlement never visited before |

### Access and non-holder balance

No object requires a particular birth/day tarot, nationality, paid API, photo,
real-world travel, high mini-game score or the use of another unique artifact.
Sharing copies and keeping notebook knowledge are intentionally sufficient for
multi-inscription requirements. Interruption-sensitive checks use persisted
completed actions, not UI clicks or untrusted client counters.

Any deliberate prerequisites that appear circular are disallowed:

- Objects without inscription prerequisites can seed the mystery.
- Rubbed fragments learned from collectors count as recorded inscriptions for
  gates, but never grant the physical object or its power.
- `wheel` and `nameless` require a historical lead; public collector archives
  also supply such a lead, so no player must wait for another player to move one.
- `strength`'s difficult personal-history gate is optional; its inscription is
  independently available through collectors. No encouragement to faint.
- Ordinary earning, meal and sleep prerequisites use existing legal game
  actions and never claim that a real establishment provides them.

These are **deliberately unfair powers**, not conveniences: free travel,
large resource restoration, guaranteed information, money recovery and temporary
survival-rule exemptions. Global rarity, instance cooldowns and explicit modest
costs bound their frequency, not their impact. A player who owns one should
notice a materially different journey; ownership of several permits powerful
combinations. Non-holders must still have a complete normal route through
the game and mystery. Do not compensate with harder global baseline rules.
Any riddle attached to these conditions uses section 2.0's common answer
contract and plain-language hint ladder; no object-specific LLM solver.

## 5. UI, localization and player information

Target main-game surfaces:

- NPC action: **Arcanes et rumeurs / Arcana and rumours**.
- Cell action when appropriate: **Chercher l'objet / Search for the artifact**.
- Bag: **Examiner / Inspect**, **Utiliser / Use**, **Deposer / Leave a cache**.
- Notebook: **Objets et inscriptions / Objects and inscriptions**; show owned
  physical artifacts separately from copied inscriptions.
- Action confirmation: effect, price, duration, remaining cooldown, special
  conditions, footprint/weight and a clear **Cancel**.

The original catalogue supplies accented FR/EN display names and legendary
laws; preserve them in runtime localization. ASCII spellings here are document
identifiers/transcriptions, not a request to strip accents from the game.
New inscriptions here are bilingual drafts; all new dialogue, failure reasons,
collector variants and mystery scenes need authored FR/EN strings and review.
No untranslated internal enum is player text.
Narrative clue/riddle wording is a replaceable presentation layer over section
2.0's shared evidence. Parent, artifact and journal views must use that same
contract, including future generated content.

Discovery pages show original artifact art, its arcana, inscription, observation
time, a plain-language power/cost card and whether the physical object is still
owned. Art must be original or licensed; no new image service is required.
Retain existing sound/mute, help, keyboard and dialog conventions.

Historical clues are marked **historical**, with current availability checked
separately. "Another traveller has taken it" does not disclose player identity,
inventory, present location or exact online status.

## 6. Collectors

All collectors are fictional, age-appropriate characters; no real named person,
free-form multiplayer message or real business affiliation.

| Collector | Function | Explicit choices and costs |
|---|---|---|
| Grey Notebook / Carnet gris | Connects inscription fragments; reliable about the words, cautious about conclusions | Ask/decline: free; share a new owned inscription rubbing: 5 minutes, once per inscription/journey |
| Copper Case / Etui de cuivre | Mistakenly believes keeping objects together can control the pact | Hear claim: free; challenge with two learned fragments: 5 minutes; decline/leave: free |
| Map Mender / Raccommodeuse de cartes | Maintains a public archive of copies and old leads | Obtain next eligible unread archived fragment: 10 minutes; reread: free; no money or artifact transfer |

Conversation is a menu with authored outcomes. No threats, coercive trade,
adult-child dependency, physical harm or loss hidden in a friendly option.
Collectors do not buy unique artifacts or award repeatable money/food.
Sharing a rubbing never transfers possession and never removes notebook text.

Archive progression: one new fragment per 1,440 simulated minutes, ordered by
the player's fewest-represented thread, then catalogue order, excluding already
known inscriptions. Access at any settlement through a virtual notebook contact
after the first rumour; no mandatory encounter RNG. This ensures a path to the
mystery even when every physical artifact is carried by someone else.
The delay advances only through normal play, not real-time waiting.

Collector credibility is explicit: copied inscriptions are quoted evidence;
interpretations are labelled hypotheses until the relevant story gate.
The Copper Case's mistaken theory cannot overwrite notebook facts or the actual
power rules. Refusal never blocks later rumours, the archive or the parent quest.

## 7. Mystery bible - proposed continuation and resolution

**Spoilers and new proposals below.** This extends, rather than silently claims
to quote, the PDF and prototype. No real historical person or event is alleged.

### 7.1 Proposed author-only truth

Several years before the journeys, a fictional circle of adult travellers
called the Table of Departures used an old tarot to exchange paths they
regretted. One participant acted as keeper; another was a witness who refused
to join the stakes and left an empty chair.

Two participants altered the ledger: "my future path" became "the paths of
those who follow me." They believed the change would preserve their own freedom.
The children never consented. The alteration made an invalid promise appear
inheritable. At the broken close of the game, the 22 arcana became ordinary
objects and the parents' journeys became entangled with the table.

The empty chair belongs to the **nonconsenting witness**, not a dead child or
a predetermined missing parent. The keeper stayed to prevent the flawed game
from closing. The witness hid copies of the original refusal in the objects'
inscriptions. The grey-notebook collector preserves those copies; the
copper-case collector mistakes possession of objects for authority to repair
the pact. Neither collector controls the player's missing parent.

The children can contest the altered rule by recording the refusal and choosing
not to inherit the wager. The answer is a voluntary ending, not a new stake,
all-22 collection, sacrifice, destruction or another compulsory game.

Who exactly the adults were, their biographies, the table's original location
and the date remain unnamed in this release. Those details are not needed for
the causal answer and must not be improvised as facts by generated text.
Each parent story may establish involvement only through approved adapters
consistent with its existing genesis; no retrofit that contradicts saved facts.

### 7.2 Threads and evidence gates

| Thread | Artifacts contributing inscriptions | Question answered |
|---|---|---|
| Stakes and inheritance | fool, empress, chariot, justice, sun | What was wagered, and who bore the price? |
| Rules and refusal | magician, hierophant, hanged, tower, judgement | Was the children's obligation valid? |
| Custody and witnesses | priestess, emperor, lovers, wheel, moon | Who kept the record and why was a seat empty? |
| Repair and release | hermit, strength, nameless, temperance, devil, star, world | Can the pattern end without another loss? |

Knowledge comes from discoveries **or** attributed collector copies. Repeated
copies of one inscription count once. Collection of the physical objects is
never a required gate:

1. **Two distinct inscriptions:** recognize a shared game and threaded language.
   Retain the prototype's early mystery reveal without claiming the answer.
2. **Four inscriptions spanning two threads:** reveal that the disputed stakes
   concerned inherited paths; add an authored comparative note.
3. **Six spanning three threads:** unlock the concordance and first collector
   disagreement; the empty seat is still a hypothesis.
4. **Eight spanning all four threads:** unlock the witness dossier. It includes
   an authenticated-in-fiction quotation of the refusal and the altered line;
   no requirement for a particular globally scarce artifact.
5. **Read the dossier, then explicitly compare it with the learned evidence:**
   15-minute notebook action, normal settlement; unlock the final decision.

The dossier is a fixed story reward at the gate, not procedurally inferred
proof. Arbitrary eight-fragment combinations reach it because the collector
provides the missing connecting document, not because every combination
logically says the same thing. No hidden ninth-object requirement.

### 7.3 Resolution and parent-quest boundary

The player can:

- **Refuse the inherited wager:** write a counter-signature after a 10-minute
  confirmation action. The lore arc is marked resolved; keep the notebook and
  ability to discover/use artifacts under their ordinary laws.
- **Preserve the evidence and decide later:** no cost or penalty; all normal
  gameplay remains possible. A later explicit return to the decision is allowed.

There is no "bad child" ending, forced sacrifice or secretly superior choice.
The refusal ends that child's claimed obligation, not everyone's lives or the
existence of all artifacts. Otherwise the first player to finish would remove
the feature for everyone else.

Completing lore does **not** locate or rescue a parent automatically, change
their motive, resurrect anyone or rewrite established genesis. If the main
parent investigation is incomplete, it continues normally. If completed, the
lore supplies an additional epilogue without reopening or invalidating it.
Existing journeys must remain completable without ever interacting with lore.

## 8. Proposed shared ownership and recovery policy

This section is a design decision list, not a claim that the current browser
prototype or existing server can enforce it.

### 8.1 Identity and ownership

- One physical instance per catalogue ID **per production world**, not one per
  player/journey/region. Test worlds have separate explicit namespaces.
- A stable anonymous player identity authorizes journeys; no real name required.
  Browser-local IDs alone are not authentication. Design authenticated recovery/
  device transfer before promising cross-device ownership or inheritance.
- Ownership belongs to one active journey. Other journeys of the same player
  cannot summon the object. No direct player-to-player text, auction or trade.
- Server-owned states: **hidden**, **carried**, **cached**. A short internal
  pending transaction is not a player-reservable fourth state.
  Every transition has an instance revision and location generation.

### 8.2 Actions and competing claims

Search uses server-known position, simulated time and current instance revision.
The server settles its 10-minute action and atomically attempts the claim.
There is **no exclusive reservation** while a dialog or search is open.

If two valid searches overlap, only one claim commits. The other search keeps
its actually spent time/needs and receives an explicit "already taken" outcome.
Network retries of the same action return its original committed result.
No second charge, lost response duplication or client snapshot resurrection.

Bag/weight, lifecycle and journey revision must commit with ownership in one
transactional boundary. A client-only post-claim bag insertion is insufficient.
No insufficient-space claim may leave an artifact unowned or duplicated.

This requires server-owned relevant journey progression, or a narrowly validated
authoritative action ledger. The present locally simulated journey and ordinary
client saves are **not** proof of legitimate position, time, inventory or costs.
Offline viewing/rehearsal may remain available; authoritative claim/use/deposit
must require server acknowledgement. Never display an offline pending claim as
successful ownership. The implementation phase must resolve this prerequisite,
not merely add a unique database row beside trusted client coordinates.

### 8.3 Deposit, death and inactivity

- **Voluntary cache:** 10 simulated minutes at a validated current settlement
  marker; explicit confirmation transfers the object out of the bag atomically.
  The cache is public; the depositor has no private reservation or guaranteed
  future-run retrieval. Relocation changes the clue generation.
- **Death or explicit abandonment:** atomically move carried artifacts into
  public virtual caches at the last valid settlement anchor recorded by the
  server, or the instance's original validated anchor if none exists.
  No recovery of unrelated equipment or new general cache system is implied.
- **Fainting/recoverable placement:** keep ownership; normal effects proceed.
  Existing random ordinary-item theft must not silently consume a unique artifact.
  Collector theft is not part of this proposal.
- **Inactivity:** after **30 real UTC days** without a committed, player-initiated
  state-changing action on the carrying journey, publicly recache its artifacts
  at the last valid settlement anchor. Merely opening/polling/reloading is not
  activity. A warning is shown on the ownership page before the deadline;
  no email/push service is assumed.
- A returning stale save refreshes authoritative ownership, keeps inscriptions,
  explains recaching and removes obsolete physical inventory references.
  Never create a replacement copy or silently reset the entire journey.
- Automatic recovery is idempotent and auditable. Source-map changes never
  silently move an actively carried item. Unusable hidden/cache anchors require
  an explicit versioned repair with historical clues marked accordingly.

The **30-day real-time policy** is separate from simulated cooldowns and story
time, and is a proposal needing approval. It prevents abandoned ownership from
locking content forever but does not guarantee fair access against many active
holders. Such fairness must come from copy-based story access, not misleading
promises that everyone can own all 22.

## 9. Persistence, errors and migrations

The eventual implementation must persist:

- World artifact instances, custody revision, hidden anchor, location generation,
  per-instance cooldown and append-only transition/action IDs.
- Journey knowledge: learned inscriptions, their provenance, earned hint tiers
  per placement generation, historical clues, collector choices and story gates.
- The common parent/artifact/journal evidence ledger and action receipts from
  section 2.0; domain-specific records are authoritative target state or views,
  never independent second copies of clue progression.
- Journey effects, action receipts, clock reconciliation and active claim
  state; all within the authoritative transaction policy.
- Per-effect remaining walking distance/minutes, distinct concurrent effects,
  protected-settlement boundaries, and target/path revisions. Effects already
  granted remain attached to the activating journey until expiry even if the
  object is deposited; custody transfer grants no duplicate activation.
- Magical wallet credits and per-debit reclaimed amounts, mini-game offer
  consumption, prepared magical routes and exact-marker disclosure permissions.
- Emergency charge/trigger and safe recovery marker, current natural daily card
  versus chosen override/expiry, and Moon dream bundle/delivery receipts.
- Spool recall entitlement tied to the depositor journey and cache generation,
  invalidated by any intervening claim.
- Sleep-episode dream opportunities, pinned card/distance-policy inputs and
  result receipts; presentation/waking must not create another random draw.
- Bag instances/layout with artifact IDs and actual weight, plus notebook views
  that distinguish knowledge from ownership.

Missing lore fields on an old valid journey migrate to empty knowledge/effects,
not a fresh set of globally unique objects. A standalone prototype save is
rehearsal data, never importable proof of production ownership.
Malformed saved lore is an explicit recoverable load error, not a silent reset.
For this sole-player phase, a schema incompatibility may require an explicitly
explained new journey. Do not reconstruct incompatible state, silently overwrite
it or introduce a broad migration framework. A valid current journey retains
its genesis and equipment.

Expected public errors include: unavailable/taken, historical location,
condition unmet, insufficient space/weight, insufficient resources,
instance cooldown, same-instance effect still active, interrupted action,
offline/server unavailable, stale revision and invalid saved data.
Each has FR/EN explanation and a non-destructive next step.
Do not catch an ownership/database error and return a success-shaped discovery.

## 10. Acceptance criteria for later implementation

This is the definition of the completed feature, not the status of this document.

1. All 22 entries have reviewed FR/EN names, laws, inscriptions, marginal/collector
   text, discovery conditions, power quotes, costs, cooldowns and original art.
2. Each can be found through normal movement and clues; no production test
   positioning, unauthorized hidden-coordinate payload or mandatory real-world
   action. An explicit magical marker is authorized earned information.
3. Exact boundaries are tested: 300/30/3 km and 250 m; night at 20:00/06:00;
   cooldown/expiry equality; one-time costs; skipped clue tiers; insufficient
   resources after metabolism; interruption, protection expiry mid-action and
   distance/walking-minute allowances crossing a step boundary.
4. Concurrent claims, replayed requests, connection loss and stale saves never
   create two physical copies or charge the same action twice.
5. Inventory weight/rotation/full-bag handling, artifact use/deposit and the
   notebook agree with authoritative custody after every transition/reload.
6. Every effect persists across save/resume and transfer. Intended monetary
   credits, free food/healing and validated teleportation work exactly as
   quoted. No duplicate reward, same-debit double refund, unauthorized landing,
   ownership theft, XP farm or cooldown reset through a new browser tab.
7. All mandatory lore gates and the resolution are reachable through copies
   when every physical object is owned by other players.
8. Collector disagreement and historical clues never contradict established
   parent facts or present guesses as verified current locations.
9. Death, abandonment, inactivity and anchor repair each preserve uniqueness
   and leave inspectable receipts without exposing other players' private data.
10. Current equipment/dog, mini-games, needs, parent investigation and notebook
    exports preserve their ordinary behavior. Deployment includes backups,
    explicit handling of incompatible saves and an actual FR/EN production
    smoke test; exhaustive historical-save migration is not required.
11. Parent paths, artifacts and abandoned journals run through the common
    discovery mechanism and knowledge ledger, preserving existing policies.
    Switching channel/locale or generated wording cannot duplicate knowledge
    rewards, reset progression or reveal facts above the applicable ordinary
    or explicitly earned magical permission.
12. Reviewed LLM content packs can replace templates without gameplay changes.
    Riddles have deterministic answer contracts and a plain-language path;
    all three discovery loops remain playable without an LLM or content pack.
13. Sleeping can yield a card/proximity-influenced dream through the same clue
    mechanism, with persistent opportunity limits, no rerolls or unearned
    precision, and no change to ordinary sleep/needs recovery.
    Test the Moon's guaranteed dream separately, including same-sleep
    deduplication, and Judgement's effective daily-card override.
14. Verify each signature advantage numerically, not merely that a button
    works: a 240-minute eligible Chariot walk becomes 60 minutes; a 1,000-kcal
    ordinary Empress-period debit becomes 250 kcal; a 12-EUR eligible Justice
    debit returns 12 EUR once, and returns/cancellations cannot pay it twice.
    Exercise full/partial caps, unavailable targets and interrupted actions.
15. Teleportation retains inventory/companion and settles current-stage arrival
    without counting walked kilometres or completing intermediate stages.
    Concurrent recall/claim has exactly one winner. Nameless prevention commits
    before terminal publication/recaching, once, including after network retry.
16. Test compatible artifact combinations without a global cooldown: Empress
    with Temperance, Chariot with Lovers, Emperor with Moon, and Hanged with
    other protections. Explicit prices remain payable, overlapping reductions
    take the strongest value and ordinary damage never becomes a resource gain.
17. Test Judgement across midnight and save/resume: natural daily draws persist
    separately, exactly one override is effective, and expiry restores the
    current natural card without awarding another draw or rerolling past actions.

## 11. Review checklist before parts 2-6

- [ ] Approve the 22 names/laws as retained from the existing original catalogue.
- [ ] Approve or revise the discovery prerequisites, UTC windows and search costs.
- [ ] Review numeric prices/durations of the revised deliberately powerful
      abilities. Strong, rule-breaking advantages are the user's requirement,
      not an open question about whether powers should remain conveniences.
- [ ] Approve footprints/weights and common activation/cooldown/stacking rules.
- [ ] Approve the proposed truth, witness/empty-seat explanation and voluntary
      ending without changing saved parent stories.
- [ ] Approve collector copy access so no unique object gates the story.
- [ ] Approve one-per-world physical ownership, public deposits and death policy.
- [ ] Approve or change 30-real-day inactivity recaching and online-only authority.
- [ ] Approve FR/EN editorial/art completion before activation and release.
- [ ] Approve dream sleep eligibility, frequency, card-affinity table and
      distance-dependent probability; the channel itself is a user requirement.

**Next checkpoint:** review and checkpoint the intended runtime release, verify
the existing server's Node.js prerequisite, then explicitly authorize deployment
of the all-22 isolated playtest. Main-journey authority, final narrative ending
and LLM-authored expression remain separate work; all sixteen remaining powers
are no longer pending.
