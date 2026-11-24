import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dreamChance, settleDream, validateDreams, publicDreams } from "../discovery-dreams.mjs";
import { discoveryIdentity, learnDiscovery } from "../discovery.mjs";
import { selectDiscoveryCandidate } from "../discovery-policy.mjs";
import { parentDiscoveryCandidates, journalDiscoveryCandidates } from "../discovery-targets.mjs";
import { createLoreState, applyLoreAction, artifactCandidates, loreView } from "../lore-engine.mjs";
import { startSurvival } from "../survival.mjs";
import { startEconomy, sleepEconomy } from "../economy.mjs";
import { createTrail } from "../trail.mjs";

const json = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const economy = json("../public/economy.json"), survival = json("../public/config.json").survival;
const map = json("../public/map.json"), journey = "a".repeat(32);
const source = () => ({
  elapsedMinutes: 0, startedAt: Date.UTC(2026, 9, 19, 12), tarotDay: "2026-10-19",
  birthCard: "moon", dailyCard: "chariot", lore: { dreams: { version: 1, episodes: [] } },
});
const candidate = (state, values = {}) => ({
  priority: 0, distanceMeters: 0, dreamProximity: 1,
  clue: { targetType: "artifact", targetId: "hermit", targetRevision: "1", evidenceKey: "location",
    kind: "location", precision: "region", facts: { region: "Occitanie" }, channels: ["npc"],
    source: "test", observedMinutes: state.elapsedMinutes, availability: "current", contentVersion: "template-v1",
    ...values },
});
const sleeping = (state, minutes = 480) => ({ ...structuredClone(state), elapsedMinutes: state.elapsedMinutes + minutes });

test("all 22 card roles follow the exact approved chance table, independently, without extra multipliers", () => {
  const strong = ["priestess", "hermit", "star", "moon", "judgement"];
  const guiding = ["fool", "magician", "lovers", "chariot", "wheel", "hanged", "world"];
  for (const { id } of economy.tarot) {
    const bonus = strong.includes(id) ? 0.1 : guiding.includes(id) ? 0.05 : 0;
    for (const proximity of [0, 0.5, 1]) {
      assert.ok(Math.abs(dreamChance(proximity, id, id) - (0.15 + 0.35 * proximity + 2 * bonus)) < 1e-12);
    }
  }
  assert.equal(dreamChance(0, "sun", "emperor"), 0.15);
  assert.ok(Math.abs(dreamChance(1, "moon", "chariot") - 0.65) < 1e-12);
  for (const value of [-1, 1.1, NaN, Infinity]) assert.throws(() => dreamChance(value, "moon", "sun"));
  assert.throws(() => dreamChance(1, "unknown", "sun"), /tarot/);
});

test("the roll is pinned once, succeeds strictly below chance, and only authorized facts enter knowledge", () => {
  const previous = source(), candidates = [candidate(previous)], chance = dreamChance(1, "moon", "chariot");
  for (const [roll, outcome] of [[chance - 1e-10, "clue"], [chance, "miss"]]) {
    let draws = 0;
    const result = settleDream(previous, sleeping(previous), candidates, { random: () => { draws++; return roll; } });
    const episode = result.lore.dreams.episodes[0];
    assert.equal(draws, 1);
    assert.equal(episode.roll, roll);
    assert.equal(episode.chance, chance);
    assert.equal(episode.outcome, outcome);
    assert.equal(episode.checkMinutes, 60);
    assert.equal(episode.wokeMinutes, 480);
    assert.equal(episode.clue, discoveryIdentity(candidates[0].clue));
    if (outcome === "clue") {
      assert.deepEqual(result.discovery.entries[0].facts, { region: "Occitanie" });
      assert.deepEqual(result.discovery.entries[0].channels, ["dream"]);
      assert.equal(selectDiscoveryCandidate(result, candidates), null);
    } else assert.equal(result.discovery, undefined);
    const visible = publicDreams(result).episodes[0];
    assert.equal(visible.clue, outcome === "clue" ? episode.clue : null);
    for (const field of ["roll", "chance", "checkMinutes", "distanceMeters", "dreamProximity"]) {
      assert.equal(visible[field], undefined);
    }
    validateDreams(JSON.parse(JSON.stringify(result)));
  }
  assert.equal(previous.lore.dreams.episodes.length, 0);
});

test("short sleep, split attempts and a second sleep cannot reroll; eligibility returns exactly at 24 hours", () => {
  const previous = source(), candidates = [candidate(previous)];
  let draws = 0;
  const random = () => { draws++; return 0.99; };
  let short = settleDream(previous, sleeping(previous, 30), candidates, { random });
  short = settleDream(short, sleeping(short, 29), candidates, { random });
  assert.equal(draws, 0);
  const first = settleDream(previous, sleeping(previous, 60), candidates, { random });
  const again = settleDream(first, sleeping(first), candidates, { random });
  assert.equal(draws, 1);
  assert.deepEqual(again.lore.dreams, first.lore.dreams);
  const early = { ...first, elapsedMinutes: 1439.999 };
  assert.equal(settleDream(early, sleeping(early), candidates, { random }).lore.dreams.episodes.length, 1);
  const eligible = { ...first, elapsedMinutes: 1440 };
  const second = settleDream(eligible, sleeping(eligible), candidates, { random });
  assert.equal(second.lore.dreams.episodes.length, 2);
  assert.equal(draws, 2);
});

test("empty and interrupted dreams spend the quota but never add knowledge or a replacement target", () => {
  const previous = source(), next = sleeping(previous);
  const empty = settleDream(previous, next, [], { random: () => { throw new Error("No draw expected."); } });
  assert.equal(empty.lore.dreams.episodes[0].outcome, "empty");
  assert.equal(empty.lore.dreams.episodes[0].roll, null);
  for (const options of [{ interrupted: true }, {}]) {
    const result = settleDream(previous, { ...next, ...(options.interrupted ? {} : { ended: "health" }) },
      [candidate(previous)], { ...options, random: () => 0 });
    assert.equal(result.discovery, undefined);
    assert.equal(result.lore.dreams.episodes[0].outcome, "interrupted");
  }
});

test("cards are pinned at the 60-minute opportunity, not blindly at waking across midnight", () => {
  for (const [hour, minute, expected] of [[22, 0, "chariot"], [23, 30, "star"]]) {
    const previous = { ...source(), startedAt: Date.UTC(2026, 9, 19, hour, minute) };
    const next = { ...sleeping(previous), tarotDay: "2026-10-20", dailyCard: "star" };
    const result = settleDream(previous, next, [candidate(previous)], { random: () => 0 });
    assert.equal(result.lore.dreams.episodes[0].dailyCard, expected);
    assert.equal(result.lore.dreams.episodes[0].birthCard, "moon");
  }
});

test("artifact distance thresholds are inclusive, omit forbidden facts and never award skipped weaker tiers later", () => {
  const tiers = [[300001, null], [300000, "region"], [30001, "region"], [30000, "town"],
    [3001, "town"], [3000, "marker"], [251, "marker"], [250, "local"], [0, "local"]];
  const state = { ...source(), col: 0, row: 0 };
  for (const [meters, tier] of tiers) {
    const result = artifactCandidates(state, [{ id: "hermit", owner: null, col: meters, row: 0,
      town: "Hidden town", marker: "virtual:hermit", generation: 1 }], { name: "Region", cellSizeMeters: 1 });
    assert.equal(result[0]?.clue.precision ?? null, tier);
    if (!tier) continue;
    const facts = result[0].clue.facts;
    assert.equal(Object.hasOwn(facts, "place"), tier !== "region");
    assert.equal(Object.hasOwn(facts, "marker"), ["marker", "local"].includes(tier));
    assert.equal(Object.hasOwn(facts, "col"), tier === "local");
    assert.equal(Object.hasOwn(facts, "row"), tier === "local");
  }
  const exact = candidate(state, { precision: "local", facts: { col: 1, row: 2 } });
  const learned = learnDiscovery(state, [exact.clue]);
  for (const precision of ["region", "town", "marker", "local"]) {
    assert.equal(selectDiscoveryCandidate(learned, [candidate(state, { precision })]), null);
  }
  assert.notEqual(selectDiscoveryCandidate(learned, [candidate(state, { targetRevision: "2" })]), null);
});

test("parent candidates use only the current stage, its earned precision ceiling and stable prefix facts", () => {
  const state = { ...source(), col: 0, row: 0, trail: { version: 2, index: 0, completed: false,
    stages: [{ name: "Current secret", col: 200, row: 0 }, { name: "Future secret", col: 0, row: 0 }],
    exploration: { firstStage: 0, knownStage: null, hints: [] } } };
  const far = parentDiscoveryCandidates(state)[0];
  assert.equal(far.clue.precision, "vague");
  assert.deepEqual(far.clue.facts, { prefix: "Cu" });
  assert.doesNotMatch(JSON.stringify(far), /Current secret|Future secret/);
  const close = { ...state, col: 199 };
  const exact = parentDiscoveryCandidates(close)[0];
  assert.deepEqual(exact.clue.facts, { place: "Current secret" });
  const learned = learnDiscovery(close, [exact.clue]);
  assert.equal(selectDiscoveryCandidate(learned, parentDiscoveryCandidates({ ...learned, col: 0 })), null);
});

test("journal candidates require the server-observed cell and expose no future destination or private content", () => {
  const state = { ...source(), col: 1, row: 2 };
  const context = { col: 1, row: 2, rumours: [{ id: "a".repeat(32), parent: "Another parent",
    distanceMeters: 100, stages: ["Private future"], notebook: "Private notebook" }] };
  assert.deepEqual(journalDiscoveryCandidates(state, context)[0].clue.facts,
    { parent: "Another parent", observedCol: 1, observedRow: 2 });
  assert.doesNotMatch(JSON.stringify(journalDiscoveryCandidates(state, context)), /Private/);
  assert.deepEqual(journalDiscoveryCandidates({ ...state, row: 3 }, context), []);
});

test("real authoritative sleep has exactly the host sleep's needs and recovery, with only knowledge/history added", async () => {
  const genesis = { ...startEconomy(startSurvival(14, 10, Date.UTC(2026, 9, 19, 12),
    "balanced", survival), economy, () => 0), trail: createTrail(map, 14, 10, () => 0) };
  genesis.trail.version = 2;
  const state = createLoreState(genesis, map, economy), runtime = { state, survival, economy,
    revision: 1, worldMinutes: 0 };
  const baseline = sleepEconomy(state, map.rows[10][14],
    { latitude: 44.54, longitude: 2.3, terrain: map.rows[10][14].terrain, police: false },
    null, survival, economy);
  const result = await applyLoreAction(runtime, [], journey, map, { type: "sleep" }, { random: () => 0 });
  for (const key of ["elapsedMinutes", "fatigue", "health", "reserveKcal", "walletCents", "awakeHours",
    "energyKcal", "sleeps", "ended", "distanceMeters"]) assert.equal(result.runtime.state[key], baseline[key], key);
  assert.equal(result.runtime.state.lore.dreams.episodes.length, 1);
  assert.ok(result.runtime.state.discovery.entries.some(entry => entry.channels.includes("dream")));
  const view = loreView(result.runtime, [], journey, map);
  assert.equal(view.state.lore.dreams.episodes[0].roll, undefined);
  assert.equal(state.lore.dreams.episodes.length, 0);
});

test("shared parent inquiry keeps the actual field search cost and outcome instead of granting a two-minute shortcut", async context => {
  const originalRandom = Math.random;
  context.after(() => { Math.random = originalRandom; });
  Math.random = () => 0.1;
  const genesis = { ...startEconomy(startSurvival(14, 10, Date.UTC(2026, 9, 19, 12),
    "balanced", survival), economy, () => 0), trail: createTrail(map, 14, 10, () => 0) };
  genesis.trail.version = 2;
  const runtime = { state: createLoreState(genesis, map, economy), survival, economy, revision: 1, worldMinutes: 0 };
  const shared = await applyLoreAction(runtime, [], journey, map, { type: "inquire-clue" });
  const existing = await applyLoreAction(runtime, [], journey, map, { type: "parent-search" });
  assert.ok(shared.runtime.state.elapsedMinutes >= 8);
  const withoutOutcome = result => {
    const state = structuredClone(result.runtime.state);
    delete state.lore.outcome;
    return state;
  };
  assert.deepEqual(withoutOutcome(shared), withoutOutcome(existing));
  assert.deepEqual(loreView(shared.runtime, [], journey, map).parentSearch,
    { outcome: "found", minutes: shared.runtime.state.trail.exploration.lastSearch.minutes, repeated: false });
});

test("malformed or duplicate dream receipts fail explicitly rather than resetting the opportunity", () => {
  const previous = source();
  const valid = settleDream(previous, sleeping(previous), [candidate(previous)], { random: () => 0 });
  for (const mutate of [
    state => { state.lore.dreams.version = 99; },
    state => { state.lore.dreams.episodes.push(structuredClone(state.lore.dreams.episodes[0])); },
    state => { state.lore.dreams.episodes[0].roll = 1; },
    state => { state.lore.dreams.episodes[0].chance = NaN; },
    state => { state.lore.dreams.episodes[0].dailyCard = "unknown"; },
    state => { state.lore.dreams.episodes[0].checkMinutes = 0; },
    state => { state.lore.dreams.episodes[0].wokeMinutes = 481; },
  ]) {
    const malformed = structuredClone(valid);
    mutate(malformed);
    assert.throws(() => validateDreams(malformed));
  }
});
