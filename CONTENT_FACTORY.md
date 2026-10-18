# Content Factory - Les Arcanes du Chemin

**Proposal for review - 18 October 2026. Not an implemented service or spending authorization.**

## 1. Executive recommendation

Build a small **offline editorial factory**, not a live AI game master.
It should continuously turn verified geographic facts and engine-authored
scenarios into reusable, illustrated, multilingual content packs.

My recommended starting combination:

1. **n8n for scheduling, ingestion, review notifications and batch orchestration**,
   reusing the existing subscription if its plan and remaining quota permit.
2. **A versioned Python worker for rules, validation and pack building**.
   Keep correctness in tested code, not scattered across workflow nodes.
3. **OVHcloud AI Endpoints as a low-cost candidate for bulk drafting**;
   benchmark against GPT before selecting it, particularly for French.
4. **A stronger GPT model for selected difficult drafts and editorial checks**,
   not automatically for every paragraph.
5. **GitHub pull requests for approval**, followed by immutable pack publication.
   Nothing generated should go straight into production.

Start with **tarot interpretations, existing-event variants and witness voices**.
In parallel, run a **small real-source Living World pilot**: collecting usable,
licensed, correctly dated data is harder than generating prose.

Suggested initial spending envelope: **EUR 30 for an offline text benchmark**,
then **EUR 50-100/month incremental cash budget** for a modest text-led pilot.
These are proposed caps, not promises about an existing subscription.
Do not rent an always-on GPU to begin.

### What this changes for the player

- Fewer repeated sentences without changing the tested game rules.
- Towns feel different through sourced details, food, language and imagery.
- The parent trail has recognizable personalities and coherent recurring motifs.
- Tarot, notebook illustrations and encounters share a visual/editorial identity.
- Real events appear only where actual sources exist, with date and provenance.
- The game still works when the factory, model provider or internet is unavailable.

## 2. Existing game and design constraints

The design PDF explicitly describes pre-generated tarot interpretations,
slot-based witness dialogue, notebook prose, local-event ingestion and content
packs. It also separates the engine's factual story skeleton from its wording.
Relevant design passages are on pages 7-11, the factory on pages 15-16 and
the layer roadmap on page 23.
See the [design PDF](./doc/Les%20Arcanes%20du%20Chemin%20%E2%80%94%20Document%20de%20conception.pdf)
and [requirements](./doc/REQUIREMENTS.md), particularly R-063, R-122 and R-123
on the current development/release branches.

**Repository context:** this proposal is reviewed against `main`, which currently
lags the deployed integration branch. The twelve-game/equipment release is tagged
`deploy-2026-10-18-games-equipment`; references to its behavior describe that
release, not a claim that its implementation is already merged into `main`.

Non-negotiable boundaries:

- **No per-action LLM calls during play.** Generation happens offline/in batches.
- **The engine owns facts and consequences:** routes, elapsed time, distances,
  rewards, health, item ownership, probabilities and discoverability.
- AI may write a witness's sentence; it cannot decide where the parent went.
- AI may illustrate an artifact; it cannot place it or activate new powers.
- Existing saves/genesis remain immutable; a new prose pack does not rewrite them.
- Do not increase event frequency just to show more generated content.
- Real photos remain real photos with reuse rights. Generated illustrations
  must never masquerade as sourced photographs of a cell or an actual event.
- Living World real feeds/photos are **still pending**, not solved by this document.
- No private journey, notebook, credential, child identity or precise player
  location is sent to third-party AI. Benchmark with synthetic fixtures and
  public, appropriately licensed facts only.

## 3. Idea catalogue

Each idea is an option, not an approved new game mechanic.

**Priorities:** P0 = first pilot; P1 = next useful pack; P2 = exploratory.
**Effort:** S = about 1-3 engineering/editorial days; M = 4-8;
L = 9-20+. These are rough incremental estimates after a common factory exists,
not additive delivery commitments. New gameplay systems need separate design,
implementation and playtesting.
**Cost types:** T = mostly text generation; F = source/rights work dominates;
A = art/audio candidates and human review dominate. See section 9 for cash costs.

### 3.1 Tarot, parent trail and encounters

| # | Idea | Production method and player value | Priority / effort / cost |
|---|---|---|---|
| 1 | Daily-card interpretation bank | Variants by card, orientation and allowed situation; poetic text alongside exact engine modifiers | P0 / S / T |
| 2 | Birth-card character voice | Reusable introductions and motifs, without diagnosing or defining the player | P1 / S / T |
| 3 | Existing-event prose variants | Multiple short versions for the 29-event catalogue, retaining original meaning and actual effect receipt | P0 / S / T |
| 4 | Terrain-specific atmosphere | Vineyard, forest, rail, coast and mountain descriptions from real tags; no invented crossings or safe routes | P1 / S / T |
| 5 | Time/weather atmosphere | Dawn, rain, wind and seasonal wording selected from authoritative game conditions | P1 / S / T |
| 6 | Witness personality bank | Reserved, distracted, warm, precise or talkative voices over identical facts | P0 / M / T |
| 7 | Parent motive fragments | Biographical snippets selected from the engine's stored motive and chronology | P1 / M / T |
| 8 | Aging testimony | Recent, uncertain and old-memory wording linked to actual clue age, never silently changing the destination | P1 / M / T |
| 9 | False-lead presentation | Describe only false leads explicitly created by the engine, with a playable resolution | P2 / M / T |
| 10 | Hospitality voices | Varied acceptance/refusal without implying a real resident offered lodging; keep consequences explicit | P1 / S / T |
| 11 | Multi-encounter motifs | A red thread, distant bell or recurring silhouette tied to a seeded motif ledger, not random contradictions | P1 / M / T |
| 12 | Reunion and ending variants | Endings assembled from actual journey facts and engine-issued outcome | P1 / M / T |

### 3.2 Real Europe, food and the Living World

| # | Idea | Production method and player value | Priority / effort / cost |
|---|---|---|---|
| 13 | Small-town fact cards | Concise original summaries from OSM/Wikidata and licensed sources; say when evidence is sparse | P0 / M / F |
| 14 | Village without Wikipedia | Tag-grounded wording such as settlement type and mapped landmarks, never invented history | P1 / S / T+F |
| 15 | Local meal atlas | Ingredient summaries, regional variants and source dates; game calories/prices remain explicitly game data | P1 / M / F |
| 16 | Regional phrasebook | Human-reviewed greetings and everyday signs, with language/place relevance and no caricatures | P1 / M / T |
| 17 | Heritage micro-stories | Public-domain or appropriately licensed historic facts with uncertainty and dates | P1 / M / F |
| 18 | Open festival calendar | Real sourced upcoming fairs, markets and cultural events, with cancellation/expiry handling | P0 / L / F |
| 19 | Festival-to-activity mapping | An announced fair can suggest an existing market/music activity; any bonus still requires engine approval | P1 / M / T+F |
| 20 | Licensed event-photo matching | Prefer exact-event assets; venue photos marked illustrative; no image is better than a false match | P0 / L / F |
| 21 | Municipal works notices | Only licensed structured notices with geometry and valid dates; never infer a passable detour from prose | P2 / L / F |
| 22 | Transport disruption digest | Official alerts where supported; distinguish feeds from actual in-game transport integration | P2 / L / F |
| 23 | Seasonal regional packs | Harvest, chestnuts, winter markets and spring traditions, separating seasonal fiction from confirmed dates | P1 / M / F |
| 24 | Europe coverage atlas | Show source coverage, freshness and missing providers; no fabricated country-completeness score | P0 / M / F |
| 25 | Historical calendar bridge | Prior-year recurring events become labelled historical patterns, not confirmed future appointments | P1 / M / F |
| 26 | Public RSS topic radar | Classify permitted headline metadata to find eligible public sources; do not copy/paywall-scrape articles | P2 / M / F |

### 3.3 Games, inventory, companions and lore

| # | Idea | Production method and player value | Priority / effort / cost |
|---|---|---|---|
| 27 | Regional minigame dressing | Local vocabulary and motifs for existing twelve games; rules, timing and score remain code-owned | P1 / M / T |
| 28 | Varied customer requests | Cafe/bookshop/workshop order phrasing mapped to existing validated action IDs | P1 / M / T |
| 29 | Short activity introductions | Contextual setup and honest costs before play, outcome prose based on actual score | P1 / S / T |
| 30 | Bookshop miniature books | Original invented titles, covers and tiny blurbs, never copyrighted passages | P1 / M / T+A |
| 31 | Market stall identities | Clearly fictional stallkeepers and stock descriptions, not claims about mapped businesses | P1 / M / T |
| 32 | Lost-object vignettes | Short stories attached to engine-defined objects; no disclosure of real people's identities | P1 / S / T |
| 33 | Gear flavour and condition | Illustrations and short condition descriptions for existing boots, coat, tent and camera | P1 / S / T+A |
| 34 | Generic future equipment briefs | Dimensions, visual proposals and design notes for human balancing; no automatic item activation | P2 / M / T+A |
| 35 | Dog encounter variations | Terrain-appropriate optional encounter wording, same adoption choice/name/cost and no forced adoption | P1 / S / T |
| 36 | Dog notebook moments | Neutral flavour selected by actual hunger/care state; no invented rescue or bonus | P1 / S / T |
| 37 | Future companion concept cards | Traveller, bird or other companions as alternatives for review, not already implemented systems | P2 / M / T+A |
| 38 | Imaginary companion | A subjective friend with recurring symbols and dialogue; avoid equating imagination with a diagnosis | P2 / L / T+A |
| 39 | The 22 artifact dossiers | Original mythology, silhouette, provenance of inspirations and collectible card language | P1 / M / T+A |
| 40 | Proximity-sensitive artifact hints | Phrase engine-issued regional/town/local hints, with strict precision ceiling and no hidden coordinates | P1 / L / T |
| 41 | Rumour lifecycles | Version wording after an artifact moves or is taken; historical rumours are labelled outdated | P2 / L / T |
| 42 | Side-quest dialogue kits | Slots for fictional resident, verified place, approved objective and reward; no generated rules | P2 / L / T |

### 3.4 Notebook, art, sound and editorial tooling

| # | Idea | Production method and player value | Priority / effort / cost |
|---|---|---|---|
| 43 | Journey chapter templates | Offline-written sentence patterns filled locally from actual notebook history | P1 / M / T |
| 44 | Caption bank | Photo captions from verified place metadata; never claim an unseen detail exists in an image | P1 / S / T |
| 45 | Illustrated event atlas | More original ASCII drawings matching the notebook's pinned event illustrations | P0 / M / A |
| 46 | Equipment SVG family | Consistent black-ink drawings and rotated footprints; optimize/inspect SVG before release | P1 / M / A |
| 47 | Fictional postcards and stamps | Place-inspired collectible illustrations labelled fictional, not counterfeit real postal issues | P2 / M / A |
| 48 | Tarot motif fragments | Original borders, emblems and monochrome textures, compatible with notebook/PDF | P1 / M / A |
| 49 | Accessible art descriptions | Short human-reviewed alt text and screen-reader narration, without reading ASCII noise | P0 / S / T |
| 50 | Tiny regional sound palettes | Original synthesized cues and instruments; preserve global volume and reduced-distraction settings | P2 / M / A |
| 51 | Optional spoken witness packs | Pre-recorded synthetic voices with rights review; no real-person cloning and always keep text | P2 / L / A |
| 52 | Localization factory | FR/EN first; terminology glossary, placeholder parity and native review before new languages | P0 / M / T |
| 53 | Repetition heatmap | Measure reused template IDs locally/with opt-in aggregate counts, not uploaded private transcripts | P1 / M / T |
| 54 | Contradiction critic | Compare drafts to the supplied fact sheet and canonical glossary; flag rather than auto-publish | P0 / M / T |
| 55 | Regional blind review | Reviewers rate locality, warmth, clarity and factual trust without seeing model identity | P0 / S / T |
| 56 | Content coverage planner | Ask for missing terrain/card/language combinations instead of endless random generation | P0 / S / T |
| 57 | Automated retirement queue | Flag expired factual packs and invalid licences; never quietly replace them with fiction | P0 / M / F |
| 58 | Editorial specimen gallery | Browser preview of variants, drawings, receipts, mobile layouts and source credits before approval | P1 / M / T+A |
| 59 | Counterfactual regression corpus | Deliberately wrong town/date/reward/hint drafts to ensure validators actually reject them | P0 / M / T |
| 60 | Curated community suggestions | Future opt-in submissions enter moderation/review, never direct player-to-player free text | P2 / L / F |

### First pack I would actually build

- Tarot: 22 cards x 2 orientations x 4 situations x 3 variants = **528 templates**.
- Existing events: 29 event IDs x 6 variants = **174 templates**.
- Witnesses: 8 voices x 6 encounter purposes x 4 variants = **192 templates**.
- Town pilot: **100 locality cards** with evidence and coverage status.
- Total: **994 base templates/records**, or approximately **1,988 localized
  entries** for FR and EN. These are authoring targets, not evidence that all
  combinations are currently accepted by game APIs.
- Keep every template small; use slot substitution, not an explosion of every
  town x weather x tarot x personality combination.
- Reuse current drawings first; commission/review only 10-20 new illustrations.
- Living World source validation is a separate workstream, not a quota that must
  be filled with invented events to reach 100 towns.

## 4. Real sources across Europe: the difficult part

**An ingestion architecture can be Europe-wide without every town having data.**
Publish that distinction prominently. Start with a test matrix containing a
capital, medium town and rural place in at least six countries; include different
alphabets, timezones, sparse coverage, cross-border areas and cancelled events.

| Source family | Proposed role | Coverage / obligations / implementation track |
|---|---|---|
| OSM | Place identity, geometry, categories and access tags | Europe-wide but uneven; ODbL attribution and database obligations; reuse current cache, respect service limits |
| Wikidata | Stable entity IDs, multilingual names and links | CC0 structured data; not a complete local agenda or licence for linked assets |
| Wikipedia | Context and brief sourced introductions | CC BY-SA obligations where applicable; original synthesis is not automatic exemption from source terms |
| Wikimedia Commons | Real place photos and some event images | Per-file author/licence/attribution checks; Commons is not one blanket photo licence |
| OpenAgenda | Calendar connector where publishers expose usable agendas | Account/API/agenda permissions and publisher rights must be checked; not complete Europe coverage |
| DATAtourisme | French tourism/event pilot | France only; check access terms and each field/media reuse right separately |
| Municipal/tourism open-data portals | Add country/regional connectors | CKAN/DCAT/JSON/ICS where authorised; keep a per-provider adapter and explicit licence |
| Europeana | Optional heritage imagery and stories | Rights statements differ per item; filter to reusable assets rather than assuming all are open |
| Official GTFS / GTFS-RT / SIRI feeds | Future timetable/alert evidence | Fragmented providers, credentials and licences; an alert without geometry cannot close a game cell |
| RSS | Discovery/classification of permitted public notices | Publicly readable does not mean freely republishable; respect publisher conditions and PDF exclusions |

### Data pipeline

1. Register provider, terms, contact, allowed fields/media, quotas and geography.
2. Fetch structured data with pagination, conditional requests and bounded retries.
3. Keep provider IDs, source URLs, source timestamps and response hashes.
4. Normalize location, language, timezone, event interval, status and recurrence.
5. Resolve entities by IDs plus geography; never only by a town's name.
6. Deduplicate across feeds while retaining all provenance and rights.
7. Filter to collective, non-victim public activities. Follow the design exclusions:
   no crime stories, accidents, deaths, trials, politics or named-person news.
   A fictional character is not a real individual from a news report.
8. Collect exact-event photos only if rights and relationship are verified.
   Otherwise use a clearly marked venue illustration or no photo.
9. AI classifies/summarizes only the allowed factual record; it must not fill
   absent dates, attendance, ticket prices or photos.
10. Validate, review and publish with expiry, cancellation and source status.

### Real time versus game time

The game date can outrun the real world. Use three distinct labels:

- **Confirmed announced event:** valid sourced future date, last checked stated.
- **Historical/recurring pattern:** e.g. a market reported last year; not confirmed
  this year. Never silently shift its date.
- **Fictional seasonal encounter:** game flavour, explicitly not a real listing.

Store both provider-check time and event time. Date-only events stay date-only;
do not invent opening hours. Use IANA timezone identifiers and handle DST,
all-day events, multi-day events, recurrence exceptions and cancellations.
Expired or unavailable data stays unavailable; gameplay continues with existing
fictional events, clearly separate from real listings.

Suggested refresh policy for a pilot: static geography weekly/monthly, agendas
daily and again near event dates, transport only at provider-authorised cadence.
Show retrieval failures instead of treating an empty failed fetch as "no events".

## 5. Architecture options

### A. Python batch worker + OVH AI Endpoints

```text
manual trigger / systemd timer
  -> source adapters -> normalized facts -> generation jobs
  -> OVH API -> strict validators -> review branch / PR
  -> human approval -> immutable content pack -> game cache
```

**Pros:** few components, cheap idle operation, testable, close to current Python
backend. **Cons:** less visual workflow management; editorial UI must be built.
Best minimum viable factory if n8n adds no real value.

### B. Existing n8n + model APIs + Python worker (recommended)

```text
n8n Schedule / manual approved trigger
  -> fetch/register source batch
  -> Python worker: normalize, choose missing content and reserve budget
  -> model API / asynchronous batch
  -> worker: validate, deduplicate, package
  -> n8n: send review summary + GitHub PR
  -> human review
  -> release job: publish approved manifest and assets
```

Use native model nodes when they expose the necessary structured-output and
usage controls; otherwise HTTP Request nodes call documented APIs.
OVH's OpenAI-compatible endpoints can be called via HTTP or a compatible client,
but verify supported features rather than assuming full API parity.

Keep schemas, prompt templates, glossary, validators and workflow exports in Git.
Keep API keys, workflow credentials, execution dumps and raw restricted sources
out of Git. n8n exports must be inspected for embedded authentication headers.

**Pros:** convenient source adapters and notifications; easy manual approval.
**Cons:** execution quotas, credential protection and workflow version drift.
Use coarse batches, not one scheduled execution per map cell. Check plan-specific
subworkflow/retry counting; do not assume batching makes executions free.

### C. Self-hosted n8n on a separate small OVH CPU instance

Only if the existing subscription is unsuitable or we need deployment control.
Community Edition has no software subscription fee for eligible use, but is
fair-code/source-available, not an unrestricted hosting/resale licence.
Review current terms before exposing it as a customer-facing automation product.

Budget **EUR 10-25/month** as a hosting allowance, plus backup/operations.
This is a planning estimate, not an OVH instance quote. Keep it isolated from
the game VM; memory-heavy workflows and updates must not disrupt travel.
For an initial internal prototype, a resource-limited local instance is possible.

### D. OVH AI Deploy / temporary GPU jobs

Useful later for a specific licensed image model, LoRA experiment or substantial
offline batch whose measured throughput beats token APIs.
AI Deploy is deployed compute; AI Endpoints is managed inference. They are not
the same billing model.

Benchmark startup, model download, minimum billing, storage and idle time.
For illustration only, **EUR 1-3/GPU-hour** would mean **EUR 10-30 for 10 hours**
but **EUR 720-2,160 for 720 hours**. These are hypothetical rates, not a verified
SKU quotation; get region/GPU availability and a real price before ordering.
Automatic shutdown and a maximum job duration are mandatory.

**Recommendation: do not start here and do not fine-tune before a benchmark
shows a concrete problem that prompting/curation cannot solve.**

## 6. Model routing and the subscription question

An n8n subscription pays for n8n capabilities/executions; it does not by itself
pay for arbitrary GPT, image or other external-model API calls.
Likewise, a ChatGPT subscription and OpenAI API billing are separate.
If the existing subscription includes actual provider credits, verify their
scope, expiry, approved automation method and remaining balance first.
No browser automation of a consumer chat account as an API substitute.

Suggested benchmark candidates, not permanent dependencies:

| Job | Candidate | What to measure |
|---|---|---|
| Bulk short French/English variants | OVH Mistral Small; optionally another OVH catalogue model | Tone, JSON validity, placeholder retention, repetition, actual token usage |
| Bulk structured drafting/translation | GPT-5 mini or a comparably priced available model | Accepted cost per localized entry, not just headline token price |
| Hard witness/lore work | GPT-5.4 or another stronger model passing the benchmark | Coherence across fragments, factual restraint, editorial preference |
| Semantic deduplication | Local hashing first; OVH embeddings if necessary | Does semantic matching catch useful duplicates without erasing regional variety? |
| Factual validation | Deterministic rules first, model critic second | Can it reject deliberately wrong names/dates/rewards and unsupported claims? |
| Imagery | Original SVG/ASCII first; licensed image-generation service later | Consistency, commercial rights, candidate rejection rate, accessibility |

Claude, Gemini and direct Mistral APIs are reasonable optional benchmark
comparators if the existing n8n credentials actually grant API access. Do not
integrate four providers up front: add one only if it measurably improves a
specific task. Their usage is not priced in the worked scenarios below; use
their official current tariffs and account terms before switching:
[Anthropic](https://platform.claude.com/docs/en/about-claude/pricing),
[Gemini](https://ai.google.dev/gemini-api/docs/pricing) and
[Mistral](https://mistral.ai/pricing).

OVH advertises multiple modalities, but a catalogue listing is not a guarantee
that every endpoint is production-ready, supports the desired language or has
an applicable paid price. Confirm model licence, commercial usage, region,
retention, limits and terms for each selected service.
Do not equate "hosted in Europe" with a complete GDPR assessment.

## 7. Content contracts and reliable publication

### Grow from text variants toward a bounded event language

The PDF's factory also proposes structured events and minigame variants,
not only prose. Deliver these in increasing-risk tiers:

1. **Text-only packs:** no rule changes; bind to existing event/game IDs.
2. **Approved parameter variants:** choose from engine-exposed ranges and
   allowlisted mechanics. An editor approves the parameter space first.
3. **Bounded quest/event graphs:** later, a declarative DSL with known
   conditions/actions, finite branches and explicit completion/failure.

The model proposes data; a compiler and the game engine decide whether it is
legal. Reject unknown actions, recursive/unbounded graphs, negative prices,
unreachable objectives and references to unavailable locations or items.
Never evaluate arbitrary expressions emitted by a model.

For tiers 2-3, publication additionally requires seeded simulations over
relevant character states: no money/item duplication, impossible costs,
unbounded profit loops, softlocks, orphan objectives or secret-coordinate leaks.
Compare distributions of reward/time/fatigue to editor-approved baselines.
Specify measurable bounds per mechanic before permitting generation; "the
critic thinks this is balanced" is not a test.

The initial pilot stays entirely in tier 1. Later DSL/compiler/simulation work
is a separate gameplay project, not hidden inside the text-factory estimate.

### Separate the fact contract from the prose contract

Example **proposed** template record, not a current runtime API:

```json
{
  "id": "witness.reserved.departure.004",
  "schemaVersion": 1,
  "locale": "en",
  "kind": "witness_template",
  "fictional": true,
  "engineContract": "witness-facts-v1",
  "text": "I remember {parent_name}. They left for {destination_label} on {departure_day}.",
  "requiredSlots": ["parent_name", "destination_label", "departure_day"],
  "allowedFactKeys": ["parent_name", "destination_label", "departure_day"],
  "sourceIds": [],
  "editorialStatus": "draft"
}
```

The engine chooses the permitted facts and inserts localized, escaped values.
Only a restricted token-substitution format is allowed: no executable templates,
HTML, model-authored JavaScript, SQL or workflow commands.
An artifact-hint template receives only its permitted precision band, never the
secret exact coordinates. A validator cannot reliably "unreveal" a leaked secret.

### Metadata to retain

- Stable content ID, locale, pack/schema version and compatibility range.
- Geographic scope and required terrain/POI tags, where relevant.
- Real/fictitious/illustrative/historical status as separate concepts.
- Source IDs, author/publisher, URL, licence and allowed transformations.
- Event valid-from/to, cancellation state and fetched-at timestamp.
- Prompt/glossary/model versions, input hashes and generated-at time.
- Review status, reviewer, accepted/rejected reason and validation results.
- Actual billed input/output/reasoning tokens where reported, currency and cost.
- Media asset hashes, dimensions, attribution text and original-source reference.

Keep research provenance distinct from the licence for the output illustration.
Keep restricted raw sources private; a public PR receives only permitted
summaries, attribution and publishable assets.

### Publication lifecycle

`queued -> drafting -> validated -> review -> approved -> packaged -> published`

Failures go to an explicit rejected/quarantined state with an actionable reason.
Use idempotency keys from source hash + template contract + locale + model/prompt
version. Reserve budget before dispatch and reconcile actual usage afterwards.
After an ambiguous timeout, reconcile provider job state before retrying.

Publish immutable JSON packs/assets with a manifest and checksums; atomically
switch a small active manifest. Existing journeys pin their narrative pack;
live factual calendars use separately versioned snapshots/expiry overlays.
Never rewrite a genesis to upgrade prose. Rollback selects an earlier compatible
pack; it never rolls back player databases.

At runtime use seeded selection, recent-ID repetition avoidance and an explicit
reviewed fallback template when a slot is unsupported. Record fallback usage for
editors. A failed live-data fetch must not look like a successful empty response.
Loading a new pack must not retroactively alter the notebook's stored event text.

## 8. Quality, rights and safety gates

Before publication:

1. Strict schema, known content kinds, unique IDs and valid locale tags.
2. Exact slot parity in FR/EN; unknown/missing placeholders rejected.
3. Engine values untouched: compare dates, names and amounts to allowed facts.
4. Geographic matching uses source IDs/coordinates; separate similarly named towns.
5. No unsupported factual claims, fabricated citations or invented prices.
6. Rights gate for every photo; unknown licence means no publication.
7. Text treated as untrusted data; fetched pages cannot instruct the worker
   to execute commands, reveal credentials or expand a job's permissions.
8. SVG sanitization: no scripts, external resources or active links; rasterize
   untrusted assets or reject them. ASCII width/spacing checked on mobile and PDF.
9. Tone: warm, mysterious, economical; no stereotypes, real-person accusations,
   exploitative child scenarios or instructions to trespass/search dangerous places.
10. Human review of all initial entries; a model critic is not a factual oracle.
11. Test FR/EN at 320/390 px, keyboard/screen reader, reduced motion and PDF export.
12. Service-down, missing-language, corrupt-pack, stale-feed and rollback tests.

Initial pilot acceptance targets:

- 100% schema/placeholder tests passing; zero unresolved factual contradictions.
- 100% real records have provenance; 100% published media have verified rights.
- At least 80% of benchmark drafts editorially acceptable after at most one edit.
- Review 100% of the first 200 localized entries and all real-source pilot records.
- No changes to rewards, event probabilities, saves or gameplay engine outputs.
- Runtime makes zero model calls and remains playable with all AI access disabled.
- Regional coverage gaps and cancellation/source failures are visible.
- Record cost per accepted entry, rejection rate, duplicate rate and review minutes.

Use a fixed 100-case gold corpus including diacritics, long place names, minority
languages, rural missing data, DST changes, misleading image matches, stale events,
unsafe source instructions and deliberately inconsistent artifact precision.

## 9. Costs: assumptions, sample arithmetic and budget choices

### 9.1 Published reference rates

Rates checked against public sources on **18 October 2026**; not a quote or a
guarantee of account/model availability. Provider tariffs can change.
Do not apply an advertised free trial or a zero catalogue field as a permanent
production entitlement.

| Service | Reference price used | Confidence / caveat |
|---|---|---|
| OVH `Mistral-Small-3.2-24B-Instruct-2506` | USD 0.10 input / 0.31 output per million tokens | Official machine-readable model catalogue reports USD per-token values; converted by x1,000,000, not represented as an EUR invoice quote [S1] |
| OVH `gpt-oss-20b` | USD 0.05 input / 0.18 output per million tokens | Same catalogue; benchmark quality/licence before using [S1] |
| OVH `Qwen3-Embedding-8B` | USD 0.12 per million input tokens | Optional, not required for initial lexical deduplication [S1] |
| OpenAI GPT-5 mini | USD 0.25 input / 2.00 output per million tokens | Standard uncached short-context tariff in official table [S3] |
| OpenAI GPT-5.4 | USD 2.50 input / 15.00 output per million tokens | Standard short-context tariff; not a recommendation to use large contexts [S3] |
| OpenAI Batch | 50% lower eligible input/output prices | Asynchronous, documented 24-hour completion window; verify selected model/endpoint support [S4] |
| n8n Cloud Starter | Indicative EUR 20/month, billed annually, 2,500 executions | Public plan reference; verify checkout, current plan and execution counting [S5] |
| n8n Cloud Pro | Indicative EUR 50/month, billed annually, 10,000 executions | Annual billing is not month-to-month commitment; external API usage separate [S5] |
| n8n Community | No software subscription fee for eligible self-hosted use | Hosting, backups, security and licence conditions still apply [S6] |

The OVH catalogue has some zero-valued image/speech prices. **No image or voice
budget below assumes those services are free.** Confirm the actual product
tariff and entitlement before relying on them.

### 9.2 Text cost model

Define one **accepted localized entry** as a short finished record in one
language. For planning, allocate **3,500 input + 1,000 output tokens per entry
across drafting/translation/checking**, then multiply by **1.5** for rejected
drafts, retries and overrun. This is an assumption to replace with measurements.
FR and EN are two localized entries, not one free translation.

```text
text_cost =
  accepted_localized_entries
  * ((3500 * input_price_per_million + 1000 * output_price_per_million) / 1000000)
  * 1.5
```

| Text route | 1,000 localized entries | 10,000 | 100,000 |
|---|---:|---:|---:|
| OVH Mistral Small at reference rates | USD 0.99 | USD 9.90 | USD 99.00 |
| GPT-5 mini standard | USD 4.31 | USD 43.13 | USD 431.25 |
| 90% GPT-5 mini + 10% GPT-5.4, same token envelope | USD 7.44 | USD 74.44 | USD 744.38 |

The mixed route **replaces** 10% of entry jobs with the stronger route; it does
not include a second stronger-model pass on every entry.
An extra review using 1,000 input + 200 output tokens at GPT-5.4 prices costs
about **USD 5.50 per 1,000 reviews**, before retry allowance.
Do not double-count review tokens already inside the assumed entry envelope.

Batch can halve eligible OpenAI token charges, but not human review, n8n,
sources, storage or separately priced tools. Long reasoning, larger prompts,
paid search and image input may break the assumed envelope. Log actual usage.

For the 1,988-entry first pack, this formula gives roughly **USD 1.97 OVH**,
**USD 8.57 GPT-5 mini** or **USD 14.80 mixed**, for text alone.
These low numbers are plausible only for short, reusable outputs; they do not
mean a trustworthy Europe-wide content service costs a few euros to build.

### 9.3 Non-text allowances (estimates, not verified vendor tariffs)

| Item | Planning allowance | What can make it cost more |
|---|---|---|
| Generated illustration candidate | USD 0.03-0.15 each | Resolution, edits, premium model and rejected attempts |
| 100 accepted images, 3 candidates each | USD 9-45 in generation | Manual art direction/cleanup and rights review not included |
| Licensed open photos | Often no per-download fee | Attribution, curation, API quotas, storage; not every image is reusable |
| Small speech experiment | EUR 5-20 test cap | Voice provider, language, output duration and usage rights; quote before production |
| Separate CPU worker/n8n host | EUR 10-25/month allowance | Selected instance, region, RAM, backup, patching |
| Small-pack storage/backup/egress | EUR 1-5/month allowance | Requests, minimum billing, CDN and photo traffic |
| Source acquisition | EUR 0-50/month pilot reserve | Paid agendas, geocoding, rights contracts; exclude expensive providers initially |
| Human review | Budget 30-90 seconds per short localized entry | Research, art and factual entries often take much longer |

At 10,000 entries, 30-90 seconds means **83-250 review hours**.
At an illustrative EUR 30/hour, that is **EUR 2,500-7,500** of labour, not a
vendor API bill. For the 1,988-entry pack, about **17-50 hours** before factual
research and image work. Editorial throughput, not tokens, is likely the limit.

### 9.4 Monthly cash scenarios

For these coarse EUR envelopes only, reserve **EUR 1 per USD 1 of API spend**
as a conservative planning convention, not a claimed live exchange rate.
Add taxes and actual currency conversion at invoicing. Existing game hosting,
existing n8n subscription fees and human labour are excluded unless listed.

| Scenario | Explicit approximate monthly components | Incremental envelope |
|---|---|---:|
| Tiny text pilot, existing n8n | 2,000 mixed entries ~15; 60 image candidates 2-9; storage 1-5; contingency 10 | EUR 30-40 |
| Text-led release, existing n8n | 10,000 GPT-mini entries ~43; 300 image candidates 9-45; storage 1-5; contingency 15 | EUR 70-110 |
| Same release with new n8n Cloud | Previous row + indicative Starter/Pro 20-50, subject to quotas | EUR 90-160 |
| Same release, separate self-hosted n8n | Text/art 52-88; CPU 10-25; storage 1-5; contingency 15 | EUR 80-135 |
| Source-led six-country pilot, existing n8n | 2,000 mixed entries ~15; media 2-9; sources 0-50; storage 1-5; contingency 20 | EUR 40-100 |
| Large 100,000-entry mixed text run | Mixed tokens ~744; 3,000 image candidates 90-450; infra/storage allowance 20-60; contingency ~20% | EUR 1,030-1,510 |

These scenarios are alternatives, not all additive. A newly dedicated CPU
worker, paid feed or subscription overage must be added if needed.
The cheapest OVH text route could reduce the 10,000-entry text component from
about USD 43 to about USD 10, **if acceptance rate and editing time hold up**.

### 9.5 Hard cost controls

- Pilot default: manual dispatch; no recurring paid job until approved.
- Maximum entries per run, max input/output tokens, bounded concurrency and retries.
- Reserve estimated job cost before API submission; reject work exceeding balance.
- Per-provider and per-content-type ledger, including failed/timeout requests.
- Alerts at 50/80/100% of the cap; stop at the internal cap.
  Provider budget alerts alone may not be hard enforcement.
- No unlimited agent loops, paid web-search loops or automatic provider escalation.
- Batch by missing coverage; never regenerate an unchanged source/template.
- No full-Europe/full-cell materialization; prioritize likely routes and reusable
  regional templates. Do not upload actual player routes to choose priorities.
- Backoff on provider throttling; resume from a durable checkpoint.
- GPU shutdown watchdog if the optional compute experiment is ever authorized.

## 10. Proposed implementation tracks and milestones

Times are rough **person-days** for an experienced developer, excluding waiting
for accounts/rights, editorial production and unrelated gameplay changes.
Tracks can share infrastructure; do not simply sum them as a guaranteed schedule.

| Track | Deliverables | Estimate | Exit condition |
|---|---|---:|---|
| A: contracts and benchmark | Schemas, glossary, 100 gold cases, usage ledger, provider comparison | 3-5 days | Select by quality/cost per accepted entry; zero paid autonomous schedules |
| B: offline text factory | Versioned prompts, worker, durable jobs, validators, review PR | 4-7 days | First 200 FR/EN entries reviewed and reproducible |
| C: n8n orchestration | Manual/scheduled workflows, credentials, callbacks, approval notifications | 2-4 days | Retry/idempotency and cap tests pass; no credentials in exports |
| D: game pack adapter | Runtime template binding, seeded selection, pack pinning, fallback, notebook tests | 4-8 days | Existing behavior/saves preserved with factory offline |
| E: real-source pilot | Provider registry, 2-3 connectors, six-country coverage matrix, expiry/rights | 8-15+ days | Real usable records or explicit absence per test location; no invented coverage |
| F: visual identity | ASCII/SVG style sheet, sanitization, gallery and mobile/PDF tests | 3-6 days | 10-20 approved assets, readable/accessible in notebook |
| G: broader European rollout | Additional connectors, monitoring, native-language review | Ongoing; budget per connector | Evidence-based coverage growth, no universal-coverage claim |

### Milestone 1 - a small playable editorial improvement

Scope: 200 localized variants covering existing events, a few tarot cards and
witness voices. No new effects. Spend cap EUR 30. Compare OVH and GPT on the same
synthetic/public input. Review the first PR manually before game integration.

### Milestone 2 - the first coherent pack

Expand toward the 994 base records/1,988 localized entries, add 10-20 drawings,
runtime pack pinning and the review gallery. Batch only what can be reviewed.
Retain the existing templates as explicit, tested fallbacks.

### Milestone 3 - genuinely sourced Living World

Demonstrate actual named providers, six-country tests and at least one verified
photo pathway. Some towns may honestly have zero records. A connector that returns
only invented examples does not meet this milestone. Keep the effort separate
from bulk prose production and prioritize rights/date correctness over volume.

### Milestone 4 - lore and richer companions

Only after approving the gameplay contracts: artifact precision bands,
unique-item lifecycle, additional companion behaviors and imaginary companion
design. The factory can prepare concepts earlier, but cannot activate them.

## 11. Example n8n workflows to review

**Workflow A - editorial batch**

`Manual trigger -> approved brief -> reserve budget -> worker creates jobs ->
submit model batch -> persist job ID -> scheduled status check ->
download results -> validators -> GitHub branch/PR -> review notification`

Do not hold an HTTP connection open for a 24-hour model batch. Reconcile stable
job IDs and signed callbacks/polling; retries must not pay for duplicate batches.

**Workflow B - sourced agenda**

`Schedule -> provider registry -> conditional fetch -> normalize/deduplicate ->
rights/date/geography gates -> optional short summary -> draft pack ->
coverage/failure report -> human approval -> publish`

Source ingestion can refresh without LLM calls when nothing relevant changed.
Cancelling an event updates availability promptly; it must not wait for an
editor to approve a creative rewrite.

**Workflow C - illustration**

`Approved art brief -> approved provider -> capped candidates -> image safety/
rights checks -> human selection -> deterministic ASCII conversion or SVG cleanup
-> mobile/PDF gallery -> asset PR with attribution`

Do not ask an image model to recreate a living artist's distinctive work, a
copyrighted tarot deck or an existing commercial game's inventory drawings.

**Workflow D - nightly health report**

`Schedule -> usage ledger + queue + source freshness -> aggregate summary ->
alert on stale data/cost/rejections -> pause affected jobs when required`

Operational reports contain IDs/counts and public source references, not secrets
or player notebooks.

## 12. Decisions for the review

1. **First priority:** narrative variety, real local sources, or visual identity?
   Recommendation: narrative pilot plus a separately bounded source investigation.
2. **Existing n8n account:** hosted or self-hosted, remaining executions and actual
   model/API credits? Inspect account settings privately before implementation.
3. **Initial cap:** approve EUR 30 benchmark only, then review measured results.
4. **Provider policy:** OVH-only for bulk work, or permit synthetic/public briefs
   to an external GPT API after terms/retention approval?
5. **Languages:** FR/EN first; which additional languages have a real reviewer?
6. **Pilot countries:** choose six reflecting likely play areas and data diversity.
7. **Art direction:** keep hand-authored ASCII/SVG as canonical, or trial generated
   source illustrations before deterministic conversion?
8. **Editorial owner:** who accepts content and how many minutes per week are
   available? Scale generation to that capacity.
9. **Live sources:** which feed accounts/rights can actually be secured?
10. **Not in the initial scope:** live chat NPCs, automatic new rules, universal
    European event coverage, live player-data summarization or an always-on GPU.

## 13. Sources and pricing verification notes

Public references consulted on 18 October 2026. Billing/account entitlements,
regional availability and licences still need confirmation before paid work.
Public web summaries were used for discovery; model arithmetic above uses the
official machine-readable catalogue and official OpenAI pricing table.

- **[S1] OVH model catalogue/API metadata:** https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/models
  - Values are per token with explicit `currency_unit`; examples above report USD.
  - A zero price on an image/speech entry is not used as a guaranteed free offer.
- **[S2] OVH AI Endpoints and model catalogue:**
  https://www.ovhcloud.com/en/public-cloud/ai-endpoints/ and
  https://www.ovhcloud.com/en/public-cloud/ai-endpoints/catalog/
- **[S3] OpenAI API price table:** https://developers.openai.com/api/docs/pricing
- **[S4] OpenAI Batch:** https://developers.openai.com/api/docs/guides/batch
- **[S5] n8n pricing:** https://n8n.io/pricing/
  - Dynamic pricing/checkout and the user's existing plan are authoritative.
  - Annual-billing headline rates are not monthly-cancellable rates.
- **[S6] n8n deployment/edition guidance:**
  https://docs.n8n.io/choose-how-to-use-n8n.md
  and [repository licence](https://github.com/n8n-io/n8n/blob/master/LICENSE.md).
- **[S7] Separate ChatGPT/API billing:**
  https://help.openai.com/en/articles/9039756-managing-billing-for-chatgpt-and-the-api-platform
- **[S8] Optional OVH dedicated inference and infrastructure:**
  https://www.ovhcloud.com/en/public-cloud/ai-deploy/ and
  https://www.ovhcloud.com/en/public-cloud/prices/
  - The hypothetical GPU/CPU/storage allowances here are not quotations from
    these dynamically priced pages.
- **Source/licence starting points:**
  [OSM copyright](https://www.openstreetmap.org/copyright),
  [Wikidata licensing](https://www.wikidata.org/wiki/Wikidata:Licensing),
  [Commons reuse](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia),
  [OpenAgenda developer portal](https://developers.openagenda.com/),
  [DATAtourisme](https://www.datatourisme.fr/),
  [Europeana rights statements](https://pro.europeana.eu/page/available-rights-statements).

**Bottom line:** spend first on trustworthy contracts, real sources and editorial
review. Cheap token generation is useful, but coherent, geographically honest,
licensed content is the actual product.
