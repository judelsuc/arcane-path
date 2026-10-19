# Hint declarations and dream delivery

Developer guide to the implementation as of 19 October 2026.

## 1. Scope and central principle

A hint has three separate parts:

1. **Evidence:** structured facts the player is authorized to learn.
2. **Eligibility and delivery:** which evidence is new, how precise it may be,
   and how it reaches the player.
3. **Presentation:** mysterious wording, explanation and practical guidance.

Narrative wording never decides the truth, target location, ownership or reward.
Increasing clarity is different from increasing precision: pressing **Explain**
must not reveal a town or cell that the player has not earned.

The ledger and existing parent/journal projections are used by the main game.
The combined three-domain selector, authored presentation and sleep dreams
described in section 7 remain wired into the **isolated lore playtest**, not the
main journey. That broader lore work is local and not deployed.

The main journey has a separate, bounded **parent rescue dream** (R-163):
deliberate sleep of at least 60 minutes permits a check every 720 journey
minutes. Three unsuccessful field searches (even far from the route), or 1,440
minutes without new parent progress, guarantee a broad direction toward the
current stage; otherwise the chance is 50%. Checks and misses persist in
`trail.dreams`; a stable draw prevents rerolling the same sleep on reload.
Guidance is anchored to the sleeping cell, never names hidden destinations,
and is not a promise of a walkable route. It appears after existing dialogs
and is retained in the stage's trail page, discovery notebook and PDF
projection. Rest, fainting, detention, care and interrupted/terminal sleeps do
not count; hotel, shelter, outdoor and accepted hospitality sleep do count.
There is no extra resource cost or model call. This does not enable the
three-domain lore dream selector or change its separate probability rules.

In the main journey, field searches keep the **Investigate / Enquêter** tab
selected so their success, empty-result advice and errors stay visible.
Rejected town investigations also retain the selected tab; a successfully
committed town clue can still open the current evidence page.

Fresh progressive journeys also receive an opening lead: only an eight-way
direction from the saved starting point towards the first stage. It appears
in the trail guide and first evidence page and is mirrored into the discovery
ledger as `parent-opening-lead`. No town name, distance or future stage is
revealed, and no search action, time or resource is charged. The direction
remains anchored at the starting point after movement and resume. Legacy
journeys with a previously known destination are not downgraded.

The [lore specification](./LORE_SPECIFICATION.md) documents the broader target
design and its implementation checkpoints. This guide explains the actual
declarations and code flow, not all planned features.

## 2. Where declarations live

| Responsibility | Implementation |
|---|---|
| Evidence schema, validation, identity and learning | [discovery.mjs](../discovery.mjs) |
| Artifact facts, distance bands and playtest actions | [lore-engine.mjs](../lore-engine.mjs) |
| Parent and abandoned-journal adapters | [discovery-targets.mjs](../discovery-targets.mjs) |
| Selection, deduplication and walking budget | [discovery-policy.mjs](../discovery-policy.mjs) |
| FR/EN verses, explanations, guidance and card motifs | [discovery-authored.mjs](../discovery-authored.mjs) |
| Notebook records and free explanation buttons | [discovery-ui.mjs](../discovery-ui.mjs) |
| Dream probability, timing and receipts | [discovery-dreams.mjs](../discovery-dreams.mjs) |
| Per-evidence plain-guidance permissions and social NPC quotes | [discovery-interpretation.mjs](../discovery-interpretation.mjs) |
| Server authority and journal availability revalidation | [lore_playtest.py](../scripts/lore_playtest.py) |
| Read-only nearby-journal queries | [abandoned_journals.py](../scripts/abandoned_journals.py) |
| Browser playtest and dream history | [lore-playtest.mjs](../lore-playtest.mjs) |

Declarations are currently JavaScript objects, template arrays and functions.
There is no standalone JSON/YAML hint content pack and no LLM generation yet.

## 3. Evidence: what a hint means

The ledger is stored as:

```js
state.discovery = {
  version: 1,
  entries: [/* earned evidence records */]
};
```

For example, a town-level artifact clue can have this shape. The region and
observation time below are illustrative; the engine takes them from the actual
map and journey:

```js
{
  targetType: "artifact",
  targetId: "chariot",
  targetRevision: "1",
  evidenceKey: "location",
  kind: "location",
  precision: "town",
  facts: {
    artifact: "chariot",
    region: "Example region",
    place: "La Roque"
  },
  source: "artifact-rumour",
  observedMinutes: 120,
  channels: ["npc"],
  availability: "current",
  contentVersion: "template-v1"
}
```

| Field | Meaning |
|---|---|
| `targetType` | `artifact`, `parent-trail` or `abandoned-journal` |
| `targetId` | Artifact ID, current parent stage ID or journal ID |
| `targetRevision` | Version of the target evidence, such as an artifact placement generation |
| `evidenceKey` | Proposition learned, such as `location` or `destination` |
| `kind` | Domain-specific evidence form, such as `location`, `prefix` or `rumour` |
| `precision` | Domain-specific specificity; not necessarily the same vocabulary across domains |
| `facts` | Flat authorized payload; never the entire hidden target object |
| `source` | Origin identifier, such as `artifact-rumour` or `sleep-dream` |
| `observedMinutes` | Journey time when this evidence was observed |
| `channels` | One or more of `npc`, `search`, `news`, `collector`, `dream`, `notebook` |
| `availability` | `current`, `historical` or `unavailable` |
| `contentVersion` | Content provenance/version; not the semantic identity |

The validator accepts at most 16 fact keys, with primitive values, and rejects
invalid records explicitly. The ledger has a 20,000-entry limit.

### Identity and repeated evidence

The semantic identity is:

```js
JSON.stringify([
  entry.targetType,
  entry.targetId,
  entry.targetRevision,
  entry.evidenceKey,
  entry.precision
])
```

Channel and wording are deliberately absent. Hearing the same fact from an NPC
and a dream does not create two discoveries. `learnDiscovery` merges channels
for repeated identical evidence. Different facts under the same identity are
an error: changed truth requires an appropriate target/evidence revision.

Availability changes preserve the old evidence rather than deleting it.
For example, a previous artifact location can remain visible as historical
after the object is claimed or moved. A remembered observation is not a promise
that the object is still there.

## 4. Candidates: what may be delivered now

A candidate wraps a potential evidence record with selection metadata:

```js
{
  distanceMeters: 12000,
  priority: 0,
  dreamProximity: 0.96,
  clue: /* authorized evidence record */
}
```

This wrapper is not the saved evidence schema. `dreamProximity` affects dream
probability; it does not increase the facts or precision inside `clue`.

The playtest combines providers through:

```js
export function loreCandidates(state, instances, map, journalContext) {
  return [
    ...artifactCandidates(state, instances, map),
    ...parentDiscoveryCandidates(state),
    ...journalDiscoveryCandidates(state, journalContext)
  ];
}
```

### Artifact precision and fact projection

The ordinary artifact provider ignores owned instances and targets beyond
300 km. It uses these inclusive upper bounds:

| Distance | Precision | Authorized facts |
|---|---|---|
| More than 300 km | No candidate | None |
| More than 30 km, up to 300 km | `region` | Artifact ID and region |
| More than 3 km, up to 30 km | `town` | Above, plus town/place |
| More than 250 m, up to 3 km | `marker` | Above, plus fictional marker |
| Up to 250 m | `local` | Above, plus exact in-game column and row |

The actual rule in the engine is:

```js
if (meters > 300000) continue;
const tier = meters <= 250 ? "local"
  : meters <= 3000 ? "marker"
  : meters <= 30000 ? "town"
  : "region";
```

The corresponding fact projection is:

```js
const facts = { artifact: instance.id, region: map.name };
if (tier !== "region") facts.place = instance.town;
if (["marker", "local"].includes(tier)) facts.marker = instance.marker;
if (tier === "local") {
  Object.assign(facts, { col: instance.col, row: instance.row });
}
```

Thus coordinates are **absent** from a town-level record, not merely hidden by
the renderer. Ordinary candidates use:

```js
dreamProximity: Math.max(0, 1 - meters / 300000)
```

Distances in this bounded playtest are grid distances multiplied by cell size,
not a production Europe-wide great-circle policy.

Hermit's magical revelation is an explicit exception: it requests a `local`
artifact clue even at a greater distance. Card imagery alone does not grant
this exception.

### Parent clues

The parent provider uses the existing field-search rules and only the current
stage of an active exploration:

- Precise eligibility supplies a place fact.
- Otherwise it supplies a prefix fragment.
- Dream proximity is `1`, `0.5` or `0` for precise, partial or vague eligibility.
- It does not reveal future stages.

Automatic candidates use stable prefix/place evidence, not direction facts
that would change as the player moves. Existing earned parent clues of other
kinds can still be projected into the ledger by the synchronization adapter.

### Abandoned-journal rumours

The server supplies context for a real nearby-journal observation. The adapter
requires that its observation cell matches the player's actual cell and that
each rumour is within 200 m.

Its saved facts are limited to:

```js
{
  parent,
  observedCol: state.col,
  observedRow: state.row
}
```

These coordinates describe **where the player received the report**, not the
journal's location. The rumour excludes private journal contents and future
parent stages. Its dream proximity is `1`.

Queries do not claim a journal or change its custody. The authority rechecks
availability before publishing results and on later views; a journal claimed
in the meantime must not remain presented as currently available.

## 5. Shared selection and delivery

`selectDiscoveryCandidate` first excludes known evidence, optionally filters
by target, then orders candidates by:

1. Higher priority.
2. Domain least recently learned about.
3. Shorter distance.
4. Stable semantic identity as the tie-breaker.

This is deterministic selection, not a random choice of target.

Known evidence includes precision dominance:

- An artifact location at a stronger tier suppresses weaker tiers for the
  same target revision.
- A precise parent place suppresses weaker clues for that stage/revision.
- A partial parent fragment suppresses its vague equivalent.

Delivery in the isolated playtest uses this selector, while retaining
domain-specific action rules:

| Route | Behavior |
|---|---|
| Walking | At most one automatic clue per delivery, with a shared 60 accumulated walking-minute budget |
| Shared manual inquiry: artifact | Two simulated minutes |
| Shared manual inquiry: parent | Actual existing randomized field search, 8–60 minutes; it may fail |
| Shared manual inquiry: journal rumour | Free read-only observation |
| Sleep | One probabilistic opportunity under the rules below |
| Hermit's power | Explicit exact-location magical revelation |

Walking without an eligible clue retains the accumulated budget. An
interrupted walk does not deliver an automatic clue. A manual inquiry with no
new eligible clue returns an explicit error rather than inventing evidence.

## 6. Authored language and the explanation ladder

`COPY.en` and `COPY.fr` in the authored module declare complete narrative frames,
precision-specific guidance, interpretation text, fictional marker display
names, discovery conditions and all 22 card motifs.

For example, these are actual English guidance templates:

```js
artifact: {
  region: "The trail of {artifact} reaches {region}. Explore that region for a town-level clue.",
  town: "Look for {artifact} in {place}. This clue identifies the town, not its marker.",
  marker: "In {place}, seek the fictional marker: {marker}. Approach it for an exact search clue.",
  local: "Search for {artifact} at cell {col}, {row}, by {marker} in {place}. {condition}"
}
```

The mysterious frames include:

```js
verses: {
  artifact: [
    "The map has a missing page. On its torn edge, one message remains: “{focus}”",
    "An ordinary thing casts a longer shadow than it should. Inside that shadow: “{focus}”",
    // Four other complete authored frames.
  ]
}
```

Each of the three domains has six frames in each language: 18 bilingual
pattern pairs. These are not arbitrary randomly combined sentence fragments.

For artifact clues, `{focus}` is constructed from the localized artifact name
and earned region/place/marker/cell facts, joined by separators. For parent
clues it uses the existing plain clue text; journal rumours also have their
own explanatory guidance.

This distinction matters: the evocative verse does **not** simply embed the
full practical instruction, and it does not receive the hidden target object.

### Stable variety

The notebook counts non-inscription entries by domain in ledger order, then
chooses:

```js
const verse = format(variants[order % variants.length], { focus });
```

Appending another clue, rereading, reloading or switching language does not
reroll the earlier variant. Frames repeat after six entries in a domain.
Inscriptions remain directly readable and do not advance the variant count.

This is a small authored frame library, not unlimited variety or individually
written geography-specific riddles.

### Three presentation levels

`authoredHint` returns:

```js
{
  evocative: /* mysterious frame with authorized focus */,
  explanation: /* interpretation of this precision/domain */,
  plain: /* actionable guidance if permitted, otherwise null */
}
```

The notebook initially shows `evocative`. **Explain** reveals `explanation`
freely, but cannot unlock practical instructions. **Plain guidance** is offered
only after an interpretation permission has been earned for that evidence.
Once unlocked, revealing/rereading it is a free DOM-only operation: no action,
time cost, resource change, new evidence or chance roll occurs.

### Plain-guidance permissions

**19 October refinement:** earned precision and an explicit interpretation
permission are both required. Permission is permanent for one evidence
identity, not an artifact, domain or entire notebook. A higher precision or a
new target revision is a different record and requires its own permission.

The authoritative playtest stores:

```js
state.lore.interpretations = [{
  evidence: discoveryIdentity(entry),
  source: "npc", // Or "hermit".
  observedMinutes: state.elapsedMinutes
}];
```

Permission validation rejects duplicates, unknown evidence, invalid sources and
impossible timestamps. Old playtest states without this array start locked;
there is no inferred permission from previously opened UI controls.

There are two implemented grant paths:

1. **Knowledgeable NPC:** a fictional in-game local in a mapped, named
   settlement can interpret one selected earned clue.
2. **Hermit:** using its revelation power automatically interprets the exact
   clue it creates, without granting access to other clues or changing its
   existing activation price.

The NPC quote is calculated on the server using the existing social helpers:

```js
chance = 1 - socialFailureChance(
  tarotEventChance(0.35, state, economy),
  state
);
standing = sympathy(state);
```

`sympathy` already incorporates local reputation, cleanliness, fatigue and the
birth/day tarot factor. These values can improve or worsen availability and
price. Initial balancing is:

- A deterministic encounter draw is keyed by journey seed (or starting time),
  settlement ID and UTC journey day. It is shared across clues. Refreshing or
  choosing another clue does not roll another encounter.
- If `draw >= chance`, help is unavailable under the current conditions.
- Otherwise the interpretation has no money fee if `standing >= 65` or
  `draw < chance * 0.25`.
- Paid help uses `marketPrice` for
  `0.25 * (1 + (50 - standing) / 100)` meal units, with the existing national
  market or coordinate-based fallback.
- Both free and paid help take 10 journey minutes. Ordinary metabolism and
  pressures still apply. Free means no money fee, not no time cost.
- An unaffordable quote cannot be accepted. Outside settlements and after a
  terminal ending, new NPC interpretations are unavailable.

The draw is stable, but improving fatigue, cleanliness or reputation can change
the offer legitimately. A new journey day can change the encounter and cards.
The UI displays the offer or refusal and its time/price before confirmation.

The browser sends only:

```js
{ type: "interpret-clue", evidence: discoveryIdentity(entry) }
```

The authority rechecks the known evidence, permission, current offer and wallet,
then commits time, money and permission atomically with its normal receipt.
The browser cannot provide a price or grant source. Exact retries cannot charge
twice; repeating an already completed interpretation is rejected explicitly.
If the action is interrupted, the time/needs and quoted fee are spent, but no
permission is granted.

Locked authored records return `plain: null`; there is no plain-guidance button
or hidden plain-guidance paragraph. A stale UI-open state cannot bypass the
permission check. The player still owns the original evidence facts and any
already-earned map marker: this permission controls interpretation, not whether
the original observation occurred or how precise it was.

Open explanation levels survive rerenders and language changes for the same
notebook container through a `WeakMap`. This UI state is not persisted as
journey knowledge across a page reload.

Text is rendered with `textContent`. Unsupported templates, translations or
required facts raise explicit errors rather than silently inventing text.

The authored ladder is opt-in:

```js
renderDiscoveryNotebook(container, state, t, { authored: true });
```

The main notebook and PDF retain the existing plain-text presentation.

## 7. Dreams: another delivery channel

Dreams do not create a separate truth system. A successful dream learns one
eligible clue through the same ledger.

### Eligibility and probability

- Only deliberate sleep enters this channel, not ordinary rest, fainting or
  detention.
- A sleep action must reach 60 settled minutes. Separate short sleeps are not
  combined into a fresh draw.
- The check occurs at sleep start plus 60 journey minutes.
- Checks must be at least 1,440 journey minutes apart.
- A miss, empty opportunity or eligible interrupted sleep consumes the quota.
- Reloading or retrying the same accepted command does not reroll.
- Birth card and the day card effective at the check are pinned, including
  when sleep crosses UTC midnight.

The probability formula is:

```js
Math.min(
  0.75,
  0.15 + 0.35 * proximity + birthBonus + dayBonus
)
```

Each card contributes its own bonus:

| Bonus | Canonical card IDs |
|---|---|
| `0.10` | `priestess`, `hermit`, `star`, `moon`, `judgement` |
| `0.05` | `fool`, `magician`, `lovers`, `chariot`, `wheel`, `hanged`, `world` |
| `0` | `empress`, `emperor`, `hierophant`, `justice`, `strength`, `nameless`, `temperance`, `devil`, `tower`, `sun` |

The current reachable range is 15–70%; 75% is the formula's cap, not a
currently reachable maximum. A dream succeeds when `roll < chance`.

Cards and proximity affect the chance of receiving evidence, not the maximum
precision of that evidence.

### Learning and presentation

On success, the engine records:

```js
state = learnDiscovery(next, [{
  ...clue,
  channels: ["dream"],
  source: "sleep-dream",
  observedMinutes: next.elapsedMinutes,
  contentVersion: "authored-v1"
}]);
```

The narrative wrapper is declared as:

```js
dream: "In your sleep, {birth} meets {day}. {verse}"
```

`{birth}` and `{day}` come from the localized motifs for the pinned cards.
They add atmosphere, not extra facts.

### Receipts, privacy and history

Private dream history is stored at `state.lore.dreams` with version `1` and
episodes containing:

```js
{
  id,
  startedMinutes,
  checkMinutes,
  wokeMinutes,
  birthCard,
  dailyCard,
  clue,   // Semantic evidence identity, or null.
  chance,
  roll,
  outcome
}
```

Outcomes are `clue`, `miss`, `empty`, `interrupted` and `unavailable`.
History is validated and limited to 1,000 episodes.

The public view omits `checkMinutes`, `chance` and `roll`. It also removes the
selected clue identity for unsuccessful outcomes: a failed dream must not leak
the target selected privately by the engine.

Dream history checks the current ledger availability when displayed. If an
artifact is later claimed, its remembered dream is shown as historical rather
than as a fresh, actionable location promise. Journal availability changes
are also reflected without exposing private contents.

## 8. End-to-end flow

```text
Authoritative target / authorized journal observation
                        |
              Domain eligibility rules
                        |
         Candidate with permitted facts and precision
                        |
       Shared selection and known-evidence filtering
                        |
       Walking / inquiry / magic / successful sleep
                        |
                Shared evidence ledger
                        |
          Localized mysterious authored presentation
                        |
              Explain -> Plain guidance
```

## 9. How to add or change content safely

### Change wording only

1. Edit the corresponding FR and EN templates in the authored module.
2. Preserve placeholders and use only already-earned facts.
3. Check all affected precision tiers and both languages.
4. Keep interpretation and practical guidance consistent with the verse.

No target movement or gameplay reward should be caused by editing a verse.

### Add a new evidence form or artifact

1. Define the authoritative eligibility and smallest allowed fact payload.
2. Choose stable target/revision/evidence identities.
3. Add the domain provider or extend an existing one.
4. Update precision dominance if introducing a new precision relationship.
5. Add presentation support, both translations and any marker/condition text.
6. Wire the relevant authoritative action and availability reconciliation.
7. Test privacy, repeated evidence, costs, save/retry behavior and the exact
   distance/timing boundaries.

Merely adding an entry to a wording array does not implement a new collectible
or power. All 22 artifact powers now exist in the isolated authoritative world;
see the [all-22 checkpoint](./LORE_SPECIFICATION.md#all-22-powers-checkpoint).
The final sixteen additionally share the ledger for true parent/journal
revelations, qualified canonical fragments and guaranteed Moon dreams.
Private route preparation and Moon bundles must never enter public evidence
before their power actually reveals them.

### Future LLM integration

The separate [local content workshop](./CONTENT_FACTORY.md) now supports
manually triggered live OVH drafts for fixed fictional sample briefs only.
It does not read or replace this engine's evidence, renderings or permissions.

An LLM could later replace the narrative expression using an authorized fact
bundle. It must not choose the target, invent coordinates, increase precision,
grant custody or decide rewards. Reviewed content packs, generation and their
validation pipeline are not implemented in this checkpoint.

## 10. Verification references

The all-22 checkpoint passed the full 938-test JavaScript suite and the complete
198-test Python suite. [Final power tests](../tests/lore-final-powers.test.mjs) exercise
all sixteen added powers, exact timing/budget boundaries, prepared distant
terrain, and private/guaranteed evidence. The
[rendered UI regression](../tests/lore-playtest-ui.test.mjs) drives real public
views through work controls, target selectors, sanctuary warnings and rescue
receipts. Journal authority tests additionally verify canonical current-step
truth, exact lease expiry and historical Moon receipts.

The most directly relevant tests are:

- [Authored presentation tests](../tests/discovery-authored.test.mjs):
  bilingual wording, all precision levels, stable variants, free/safe controls
  and historical dream presentation.
- [Dream tests](../tests/discovery-dreams.test.mjs):
  card bonuses, probability boundaries, timing, retries within the quota,
  midnight selection, disclosure ceilings and public redaction.
- [Authority tests](../tests/test_lore_playtest.py):
  durable sleep receipts, restart/retry behavior, read-only journal rumours
  and publication-time availability races; authoritative interpretation charges,
  permission persistence and exact retries.
- [Interpretation tests](../tests/discovery-interpretation.test.mjs):
  exact-evidence permissions, validation, deterministic free/paid/refused offers,
  affordability, and reputation/card/cleanliness/fatigue influences.

The original hints/dreams checkpoint passed 212 focused JavaScript tests and 57 Python tests.
Real isolated browser checks covered successful and missed dreams, FR/EN
switching, free explanations, reload, a failed 37-minute parent inquiry,
artifact claim and historical dream status without changing main saves.

The later permission-gating change passed 122 focused JavaScript tests and all
19 authoritative playtest Python tests. A fresh temporary browser world verified
that Explain cannot reveal locked guidance, a settlement NPC quotes and charges
10 minutes plus the displayed fee, the permission survives reload and EN/FR
switching, and Hermit's revelation automatically unlocks its own new clue.
The temporary world was independent of the player's running test server.

## 11. Testing the second power batch

Fool, Wheel and Sun extend the same isolated world. Restart the existing Python
server, then reload `/lore-playtest.html` and resume. Existing artifacts, owners,
clues and resources are not reset; only the three missing instances are added.
Creating a different journey does not reset shared custody.

Use actual current clues and the map rather than a fixed coordinate route.
An object may already have moved or be carried by another journey. The ordinary
artifact inquiry selects new eligible evidence; Hermit can explicitly reveal
an unowned object if its current location is not already known.

### Fool: return without walking

1. Obtain an exact current clue for **The endless hem / L'ourlet sans fin**,
   approach within 250 m, then search/claim. It has no extra prerequisite.
2. Enter a mapped, named settlement and walk away from it.
3. Under the owned object's **Fool / Le Mat** heading, select a previously
   visited settlement and confirm **Use power**.
4. Expect one minute and 10 fatigue spent, the selected destination reached,
   and unchanged walked distance and bag contents. The activation minute still
   consumes normal food. Chariot's remaining walking distance is not consumed.

Only actual server-recorded visits count; simply reading a town name or clue
does not unlock a destination. Older sessions do not reconstruct their entire
past travel history. The current pinned map is the supported return area.

### Wheel: recall your public cache

1. Retain a historical location clue, for example by claiming another artifact:
   its old ground-location clue becomes historical.
2. Find and claim **The empty spool / La bobine vide**.
3. In a named settlement, use **Leave a public cache** on another carried
   artifact. Keep Wheel with you.
4. Walk away, select that cached artifact under **Wheel / La Roue**, then
   confirm **Use power**.
5. Expect one minute and 10 fatigue spent. The target appears in the real bag
   without moving you; its existing cooldown stays unchanged. Wheel enters
   its own 72-shared-world-hour cooldown.

If another journey claims the cache before you recall it, your entitlement
ends. Their later deposit is not your cache. The empty spool cannot recall
itself. A refused/stale request must not charge or duplicate an item.

### Sun: full recovery, not food or sleep

1. Record at least one artifact inscription.
2. Find **The yellow handkerchief / Le mouchoir jaune** and start its search
   during [06:00, 20:00) UTC. The page shows the UTC journey clock and unmet
   requirements before confirmation.
3. Once owned, use it when health is below maximum or fatigue is above zero,
   retaining enough reserve to pay 500 kcal plus the activation minute.
4. Expect full health, zero fatigue and 500 kcal plus metabolism spent.
   Sleep debt and equipment damage are not cleared. Its cooldown is 72 shared
   world hours. Activation can occur at night even though discovery cannot.

The host has no separately persisted cold/heat ailment to clear; it models
exposure through ordinary resource effects, which may accumulate again.

### What should stay unchanged

- **Explain** does not bypass the plain-guidance permission gate.
- Each object still has one physical instance, normal mass/footprint, copied
  inscription knowledge and shared-world cooldown.
- Reload/resume preserves custody and effects; exact retries do not charge twice.
- The main journey and its saves are not modified.

This batch passed 230 focused JavaScript tests and 64 Python tests, including
claim/recall concurrency, persisted retries, discovery and cooldown boundaries.
Actual browser buttons exercised all three powers, bilingual names and resume
in a separate temporary world.
