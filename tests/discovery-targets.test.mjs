import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { discoveryEntries, learnDiscovery } from "../discovery.mjs";
import { synchronizeParentDiscovery, applyJournalDiscovery } from "../discovery-targets.mjs";
import { fieldClueFacts, fieldClueText, beginExploration, prepareFieldSearch,
  applyFieldSearch } from "../trail-search.mjs";
import { createSave, createJourneyStore, validateSave } from "../journey-save.mjs";
import { startSurvival } from "../survival.mjs";
import { startEconomy } from "../economy.mjs";
import { createTrail } from "../trail.mjs";
import { translate } from "../i18n.mjs";
import { discoveryNotebookEntries } from "../discovery-ui.mjs";

const json = name => JSON.parse(readFileSync(new URL(name, import.meta.url)));
const map = json("../public/map.json"), survival = json("../public/config.json").survival;
const economy = json("../public/economy.json");
const t = language => (key, args) => translate(language, key, args);
function parent() {
  return { elapsedMinutes: 60, walletCents: 500, fatigue: 15, journalAccess: "PRIVATE_CAPABILITY",
    trail: { version: 2, index: 0, completed: false, parentName: "Camille", history: [],
      stages: [{ name: "Secret Paris", col: 180, row: 0 },
        { name: "Future Hidden Town", col: 360, row: 0 }],
      exploration: { firstStage: 0, knownStage: null, hints: [
        { stage: 0, kind: "prefix", precision: "vague", col: 0, row: 0, elapsedMinutes: 20 },
      ] } } };
}

test("parent rescue dreams project only their earned bearing into the notebook and PDF entries", () => {
  const state = parent();
  state.trail.dreams = { version: 1, checks: [
    { stage: 0, direction: "west", outcome: "guidance", elapsedMinutes: 60, checkMinutes: 60 },
    { stage: 0, direction: null, outcome: "miss", elapsedMinutes: 60, checkMinutes: 0 },
  ] };
  const result = synchronizeParentDiscovery(state);
  const entry = result.discovery.entries.find(entry => entry.source === "parent-sleep-dream");
  assert.deepEqual(entry.facts, { direction: "west" });
  assert.deepEqual(entry.channels, ["dream"]);
  assert.equal(JSON.stringify(entry).includes("Secret Paris"), false);
  for (const language of ["fr", "en"]) {
    assert.ok(discoveryNotebookEntries(result, t(language)).some(record =>
      record.text === translate(language, "trailDreamText", { direction: translate(language, "hintCompass.west") })));
  }
  assert.equal(synchronizeParentDiscovery(result), result);
});
const journal = (overrides = {}) => ({ id: "a".repeat(32), parent: "Other parent",
  history: ["Earlier town"], stages: [{ name: "Journal town", latitude: 44, longitude: 2 },
    { name: "Next journal town", latitude: 45, longitude: 3 }], step: 0, delivered: false,
  ...overrides });

test("parent adapter records only earned facts, not full hidden destinations or credentials", () => {
  const state = parent(), before = structuredClone(state);
  state.trail.history = [{ next: { name: "Future Hidden Town" }, elapsedMinutes: 10 }];
  const next = synchronizeParentDiscovery(state);
  const text = JSON.stringify(next.discovery);
  assert.equal(next.discovery.entries.length, 1);
  assert.deepEqual(next.discovery.entries[0].facts, { prefix: "Se" });
  for (const secret of ["Secret Paris", "Future Hidden Town", "PRIVATE_CAPABILITY", "col", "row"]) {
    assert.equal(text.includes(secret), false, secret);
  }
  assert.equal(next.walletCents, before.walletCents);
  assert.equal(next.fatigue, before.fatigue);
  assert.deepEqual(next.trail, state.trail);
  assert.equal(synchronizeParentDiscovery(next), next);
});

test("each parent clue has exactly the facts used by unchanged FR/EN templates", () => {
  const state = parent();
  for (const kind of ["place", "prefix", "photo", "direction"]) {
    const hint = { stage: 0, kind, precision: kind === "place" ? "precise" : "partial",
      col: 0, row: 0, elapsedMinutes: 20 };
    state.trail.exploration.hints = [hint];
    const entry = synchronizeParentDiscovery(state).discovery.entries[0];
    assert.deepEqual(entry.facts, fieldClueFacts(state, hint));
    for (const lang of ["fr", "en"]) {
      const text = fieldClueText(state, hint, t(lang));
      assert.ok(text.length > 0);
      if (kind !== "place") assert.equal(text.includes("Secret Paris"), false);
    }
  }
});

test("recognition reports stay explicitly unconfirmed and separate from truthful places", () => {
  const state = parent();
  state.trail.exploration.reports = [{ stage: 0, kind: "prefix", precision: "vague",
    outcome: "suggestion", elapsedMinutes: 40,
    town: { name: "Mistaken town", latitude: 44, longitude: 2 } }];
  const next = synchronizeParentDiscovery(state);
  const report = next.discovery.entries.find(entry => entry.kind === "suggestion");
  assert.equal(report.facts.confirmed, false);
  assert.equal(report.facts.place, "Mistaken town");
  assert.equal(report.source, "parent-recognition");
  assert.equal(next.discovery.entries.length, 2);
});

test("parent progress marks old knowledge historical without exposing the new stage", () => {
  let state = synchronizeParentDiscovery(parent());
  state = synchronizeParentDiscovery({ ...state, trail: { ...state.trail, index: 1 } });
  assert.equal(discoveryEntries(state, { availability: "historical" }).length, 1);
  assert.equal(discoveryEntries(state, { availability: "current" }).length, 0);
  assert.equal(JSON.stringify(state.discovery).includes("Future Hidden Town"), false);
});

test("known destinations and precise clues are the same proposition across notebook and search", () => {
  const state = parent();
  state.trail.exploration.knownStage = 0;
  state.trail.exploration.hints = [{ stage: 0, kind: "place", precision: "precise",
    col: 180, row: 0, elapsedMinutes: 20, channel: "search" }];
  const next = synchronizeParentDiscovery(state);
  assert.equal(next.discovery.entries.length, 1);
  assert.deepEqual(next.discovery.entries[0].channels, ["notebook", "search"]);
  assert.equal(synchronizeParentDiscovery(next), next);
});

test("pending venue discovery does not disclose the unearned next town", () => {
  const state = parent();
  delete state.trail.exploration;
  state.trail.discovery = { pending: true, venue: "Virtual cafe", elapsedMinutes: 30 };
  const entries = synchronizeParentDiscovery(state).discovery.entries;
  assert.equal(entries.find(entry => entry.kind === "venue").facts.venue, "Virtual cafe");
  assert.equal(JSON.stringify(entries).includes("Future Hidden Town"), false);
});

test("journal sync records rumours and current steps, never future stages or private fields", () => {
  const state = parent();
  const quest = journal({ privateNotes: "PRIVATE_NOTES", capability: "PRIVATE_TOKEN" });
  const nearby = journal({ id: "b".repeat(32) });
  const before = structuredClone(state);
  const next = applyJournalDiscovery(state, [quest], [nearby], 55);
  const entries = discoveryEntries(next, { targetType: "abandoned-journal" });
  assert.equal(entries.length, 2);
  assert.equal(entries[0].kind, "rumour");
  assert.deepEqual(entries[0].facts, { parent: nearby.parent });
  assert.equal(entries[1].facts.place, "Journal town");
  assert.equal(entries[1].observedMinutes, 55);
  for (const secret of ["Next journal town", "PRIVATE_NOTES", "PRIVATE_TOKEN", "PRIVATE_CAPABILITY"]) {
    assert.equal(JSON.stringify(entries).includes(secret), false, secret);
  }
  assert.deepEqual(state, before);
  assert.deepEqual(next.trail, before.trail);
  assert.equal(JSON.stringify(next.sidequests).includes("PRIVATE_NOTES"), false);
  assert.equal(JSON.stringify(next.sidequests).includes("PRIVATE_TOKEN"), false);
  assert.equal(next.elapsedMinutes, before.elapsedMinutes);
  assert.equal(applyJournalDiscovery(next, [quest], [nearby]).discovery.entries.length, 2);
});

test("journal advance, delivery and disappearance retain honest historical knowledge", () => {
  let state = applyJournalDiscovery(parent(), [], [journal()]);
  state = applyJournalDiscovery(state, [journal()], []);
  assert.equal(state.discovery.entries.find(entry => entry.kind === "rumour").availability, "historical");
  state = applyJournalDiscovery(state, [journal({ step: 1 })], []);
  assert.equal(state.discovery.entries.find(entry => entry.targetRevision === "step:0").availability, "historical");
  assert.equal(state.discovery.entries.find(entry => entry.targetRevision === "step:1").availability, "current");
  state = applyJournalDiscovery(state, [journal({ step: 1, delivered: true })], []);
  assert.ok(state.discovery.entries.every(entry => entry.availability === "historical"));
  state = applyJournalDiscovery(state, [], []);
  assert.ok(state.discovery.entries.every(entry => entry.availability === "unavailable"));
  assert.equal(state.discovery.entries.length, 3);
});

test("nearby rumours can become unavailable and reappear without duplicate discovery", () => {
  let state = applyJournalDiscovery(parent(), [], [journal()]);
  state = applyJournalDiscovery(state, [], []);
  assert.equal(state.discovery.entries[0].availability, "unavailable");
  state = applyJournalDiscovery(state, [], [journal()]);
  assert.equal(state.discovery.entries[0].availability, "current");
  assert.equal(state.discovery.entries.length, 1);
  assert.equal(state.discovery.entries[0].observedMinutes, 60);
});

test("journal input failures are explicit and leave parent and existing knowledge untouched", () => {
  const state = synchronizeParentDiscovery(parent()), before = structuredClone(state);
  for (const bad of [
    journal({ id: "../bad" }), journal({ step: 2 }), journal({ delivered: "yes" }),
    journal({ stages: [] }), journal({ stages: [{ name: "Bad", latitude: Infinity, longitude: 2 }] }),
  ]) assert.throws(() => applyJournalDiscovery(state, [bad], []), /Invalid journal/);
  assert.throws(() => applyJournalDiscovery(state, [journal()], [journal()]), /Duplicate journal/);
  assert.throws(() => applyJournalDiscovery(state, [], [], 61), /Invalid journal/);
  assert.deepEqual(state, before);
});

test("a real parent field search settles identically and shared knowledge persists in exact saves", async () => {
  const info = { latitude: 44.54, longitude: 2.3 }, cell = { terrain: "place", countryCodes: ["FR"] };
  let state = startEconomy(startSurvival(14, 10, Date.UTC(2026, 9, 17, 12),
    "balanced", survival), economy, () => 0);
  state = beginExploration({ ...state, trail: { version: 2, origin: { ...info, col: 14, row: 10 },
    parentName: "Camille", stages: Array.from({ length: 10 }, (_, index) => ({
      ...info, col: 194 + index * 180, row: 10,
      longitude: info.longitude + (index + 1) * 45000 / 6371008.8 * 180 / Math.PI /
        Math.cos(info.latitude * Math.PI / 180),
      name: `Town ${index}`, osmId: `node/${index + 1}`, placeType: "town", legMeters: 45000,
      sourceUrl: "https://overpass-api.de/api/interpreter", retrievedAt: "2026-10-17T12:00:00Z",
      witnessId: `fictional-traveler-${index + 1}`,
    })), index: 0, completed: false, history: [] } });
  const initial = synchronizeParentDiscovery(state);
  assert.equal(initial.discovery.entries.length, 1);
  assert.equal(initial.discovery.entries[0].source, "parent-opening-lead");
  assert.equal(initial.discovery.entries[0].precision, "vague");
  assert.deepEqual(initial.discovery.entries[0].facts, { direction: "east" });
  assert.equal(initial.discovery.entries[0].observedMinutes, 0);
  assert.equal(JSON.stringify(initial.discovery).includes("Town"), false);
  assert.equal(synchronizeParentDiscovery(initial), initial);
  const result = await prepareFieldSearch(state, cell, async () => null, new AbortController().signal,
    { random: () => 0, proximity: async () => 0 });
  const settled = applyFieldSearch(state, result, cell, info, survival, economy);
  const synchronized = synchronizeParentDiscovery(settled);
  const { discovery, ...unchanged } = synchronized;
  assert.deepEqual(unchanged, settled);
  assert.equal(discovery.entries.length, 2);
  const save = createSave({ region: "firmi", map, state: synchronized, survival, economy }, 1);
  assert.deepEqual(validateSave(JSON.parse(JSON.stringify(save))).state, synchronized);
  const bad = structuredClone(save);
  bad.state.discovery.entries[0].observedMinutes = settled.elapsedMinutes + 1;
  assert.throws(() => validateSave(bad), /Invalid discovery/);
});

test("optional ledger adds no legacy migration and is validated by the actual save store", () => {
  const state = { ...startEconomy(startSurvival(14, 10, Date.UTC(2026, 9, 17, 12),
    "balanced", survival), economy, () => 0), trail: createTrail(map, 14, 10, () => 0) };
  const details = { region: "firmi", map, state, survival, economy };
  assert.equal(createSave(details, 1).state.discovery, undefined);
  const data = new Map(), storage = { getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value) };
  const store = createJourneyStore(storage);
  store.read("firmi");
  const next = synchronizeParentDiscovery(state);
  store.write({ ...details, state: next });
  assert.deepEqual(createJourneyStore(storage).read("firmi").state, next);
  const corrupt = structuredClone(next);
  corrupt.discovery.version = 99;
  assert.throws(() => store.write({ ...details, state: corrupt }), /Invalid discovery/);
});

test("channel retellings of parent clues do not create another knowledge reward", () => {
  const state = synchronizeParentDiscovery(parent()), clue = state.discovery.entries[0];
  const next = learnDiscovery(state, [{ ...clue, channels: ["dream"], contentVersion: "future-pack-v1" }]);
  assert.equal(next.discovery.entries.length, 1);
  assert.deepEqual(next.discovery.entries[0].channels, ["notebook", "dream"]);
  assert.equal(synchronizeParentDiscovery(next), next);
});
