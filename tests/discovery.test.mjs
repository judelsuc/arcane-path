import test from "node:test";
import assert from "node:assert/strict";
import { DISCOVERY_LIMIT, discoveryEntries, discoveryIdentity, learnDiscovery,
  reconcileDiscoveryAvailability, updateDiscoveryAvailability, validateDiscovery } from "../discovery.mjs";

function evidence(overrides = {}) {
  return { targetType: "parent-trail", targetId: "stage:0", targetRevision: "trail:2",
    evidenceKey: "field:prefix", kind: "prefix", precision: "vague",
    facts: { prefix: "Pa" }, source: "parent-field-evidence", observedMinutes: 10,
    channels: ["search"], availability: "current", contentVersion: "template-v1",
    ...overrides };
}
const state = () => ({ elapsedMinutes: 30, walletCents: 400, fatigue: 20 });

test("one immutable ledger accepts the three discovery domains", () => {
  const before = state(), snapshot = structuredClone(before);
  const clues = ["parent-trail", "artifact", "abandoned-journal"]
    .map(targetType => evidence({ targetType }));
  const next = learnDiscovery(before, clues);
  assert.equal(next.discovery.version, 1);
  assert.equal(next.discovery.entries.length, 3);
  assert.deepEqual(before, snapshot);
  assert.equal(next.walletCents, before.walletCents);
  assert.equal(next.elapsedMinutes, before.elapsedMinutes);
  assert.equal(next.fatigue, before.fatigue);
  clues[0].facts.prefix = "MUTATED";
  assert.equal(next.discovery.entries[0].facts.prefix, "Pa");
  validateDiscovery(JSON.parse(JSON.stringify(next)));
});

test("semantic identity ignores channel and wording version, not generation or precision", () => {
  const first = learnDiscovery(state(), [evidence()]);
  const retelling = evidence({ channels: ["npc", "notebook"], contentVersion: "reviewed-fr-en-v2",
    observedMinutes: 20 });
  const next = learnDiscovery(first, [retelling]);
  assert.equal(next.discovery.entries.length, 1);
  assert.deepEqual(next.discovery.entries[0].channels, ["search", "npc", "notebook"]);
  assert.equal(next.discovery.entries[0].observedMinutes, 10);
  assert.equal(next.discovery.entries[0].source, "parent-field-evidence");
  assert.equal(first.discovery.entries[0].channels.length, 1);
  assert.equal(learnDiscovery(next, [retelling]), next);
  const revised = learnDiscovery(next, [
    evidence({ targetRevision: "trail:3" }), evidence({ precision: "partial" }),
  ]);
  assert.equal(revised.discovery.entries.length, 3);
});

test("tuple identities cannot collide through separator characters", () => {
  assert.notEqual(discoveryIdentity(evidence({ targetId: "a:b", targetRevision: "c" })),
    discoveryIdentity(evidence({ targetId: "a", targetRevision: "b:c" })));
});

test("out-of-order evidence preserves its earliest real observation and provenance", () => {
  const first = learnDiscovery(state(), [evidence({ observedMinutes: 20, channels: ["notebook"] })]);
  const next = learnDiscovery(first, [evidence({ source: "earlier-witness", observedMinutes: 5 })]);
  assert.equal(next.discovery.entries.length, 1);
  assert.equal(next.discovery.entries[0].observedMinutes, 5);
  assert.equal(next.discovery.entries[0].source, "earlier-witness");
  assert.equal(first.discovery.entries[0].observedMinutes, 20);
});

test("a retelling cannot overwrite facts or change an assertion's kind", () => {
  const first = learnDiscovery(state(), [evidence({ facts: { prefix: "Pa", confirmed: false } })]);
  assert.equal(learnDiscovery(first, [
    evidence({ facts: { confirmed: false, prefix: "Pa" } }),
  ]), first);
  for (const changed of [
    evidence({ facts: { prefix: "London" } }), evidence({ kind: "place" }),
    evidence({ facts: { prefix: "Pa", confirmed: true } }),
  ]) assert.throws(() => learnDiscovery(first, [changed]), /Conflicting discovery/);
  assert.equal(first.discovery.entries[0].facts.prefix, "Pa");
});

test("availability updates preserve earned facts, provenance and old revisions", () => {
  const first = learnDiscovery(state(), [evidence(), evidence({ targetRevision: "trail:3" })]);
  const next = updateDiscoveryAvailability(first, "parent-trail", "stage:0", "trail:2", "historical");
  assert.equal(discoveryEntries(next, { availability: "historical" }).length, 1);
  assert.equal(discoveryEntries(next, { availability: "current" }).length, 1);
  assert.equal(discoveryEntries(first, { availability: "historical" }).length, 0);
  assert.deepEqual(next.discovery.entries[0].facts, first.discovery.entries[0].facts);
  assert.equal(updateDiscoveryAvailability(next, "parent-trail", "stage:0", "trail:2", "historical"), next);
  assert.throws(() => discoveryEntries(next, { targetType: "unknown" }), /Invalid discovery/);
  assert.throws(() => updateDiscoveryAvailability(next, "parent-trail", "stage:0", "trail:2", "maybe"),
    /Invalid discovery/);
  assert.throws(() => reconcileDiscoveryAvailability(next, [null]), /Invalid discovery/);
  assert.throws(() => reconcileDiscoveryAvailability(next, [
    { targetType: "parent-trail", targetId: "stage:0", targetRevision: "trail:2", availability: "current" },
    { targetType: "parent-trail", targetId: "stage:0", targetRevision: "trail:2", availability: "historical" },
  ]), /Conflicting discovery availability/);
});

test("discovery validation rejects malformed, duplicate, future and nested data explicitly", () => {
  for (const change of [
    e => { e.targetType = "unknown"; },
    e => { e.observedMinutes = 31; },
    e => { e.observedMinutes = -1; },
    e => { e.observedMinutes = NaN; },
    e => { e.facts = { nested: { secret: true } }; },
    e => { e.facts = { value: Infinity }; },
    e => { e.facts = { value: "x".repeat(1001) }; },
    e => { e.facts = []; },
    e => { e.channels = []; },
    e => { e.channels = ["npc", "npc"]; },
    e => { e.channels = ["unapproved"]; },
    e => { e.targetRevision = ""; },
    e => { e.targetId = "x".repeat(501); },
    e => { e.availability = "guessed"; },
    e => { e.extra = "secret"; },
    e => { delete e.source; },
  ]) {
    const clue = evidence();
    change(clue);
    assert.throws(() => learnDiscovery(state(), [clue]), /Invalid discovery/);
  }
  for (const ledger of [null, [], { version: 2, entries: [] },
    { version: 1, entries: [], extra: true }, { version: 1, entries: [evidence(), evidence()] }]) {
    assert.throws(() => validateDiscovery({ ...state(), discovery: ledger }), /Invalid discovery/);
  }
  assert.throws(() => learnDiscovery({ elapsedMinutes: NaN }, []), /Invalid discovery/);
});

test("a failed batch is atomic and a full ledger reports capacity instead of dropping history", () => {
  const first = learnDiscovery(state(), [evidence()]);
  const snapshot = structuredClone(first);
  assert.throws(() => learnDiscovery(first, [evidence({ evidenceKey: "new" }),
    evidence({ facts: { prefix: "contradiction" } })]), /Conflicting discovery/);
  assert.deepEqual(first, snapshot);
  const full = { ...state(), discovery: { version: 1,
    entries: Array.from({ length: DISCOVERY_LIMIT }, (_, index) =>
      evidence({ evidenceKey: `evidence:${index}` })) } };
  assert.throws(() => learnDiscovery(full, [evidence()]), /capacity reached/);
  assert.equal(full.discovery.entries.length, DISCOVERY_LIMIT);
});
