import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createLoreState, applyLoreAction, loreView, discoveryRequirement } from "../lore-engine.mjs";
import { startSurvival, basalEnergy, restSurvival, walkSurvival } from "../survival.mjs";
import { startEconomy, finishAction } from "../economy.mjs";
import { createTrail } from "../trail.mjs";
import { LORE_ITEMS } from "../lore-catalogue.mjs";
import { armPower, activePower, ordinaryEnergyFactor } from "../lore-effects.mjs";
import { inscriptionClue, fragmentOptions, parentPath, parentTruth, refundableDebits, thread } from "../lore-knowledge.mjs";
import { learnDiscovery, discoveryIdentity } from "../discovery.mjs";
import { firstPlacement } from "../equipment-inventory.mjs";
import { ITEMS, journeyEquipmentModifiers } from "../equipment.mjs";
import { translate } from "../i18n.mjs";
import { discoveryNotebookEntries } from "../discovery-ui.mjs";
import { earningOffers } from "../lore-work.mjs";
import * as harvest from "../minigames/harvest.mjs";
import { resonanceGain } from "../arcane-resonance.mjs";

const json = name => JSON.parse(readFileSync(new URL(name, import.meta.url)));
const map = json("../public/map.json"), survival = json("../public/config.json").survival;
const economy = json("../public/economy.json"), journey = "a".repeat(32);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
function start(id, hour = 12) {
  const genesis = { ...startEconomy(startSurvival(14, 11, Date.UTC(2026, 9, 19, hour),
    "balanced", survival), economy, () => 0), trail: createTrail(map, 14, 11, () => 0) };
  const state = createLoreState(genesis, map, economy);
  state.lore.start = { col: 14, row: 11 };
  const instances = LORE_ITEMS.map(item => ({ id: item.id, col: 14, row: 11, town: "Lestrunie",
    marker: `virtual:${item.id}`, generation: 1, owner: null, placement: null,
    cooldownUntil: 0, recallJourney: null }));
  const item = LORE_ITEMS.find(item => item.id === id);
  if (item) Object.assign(instances.find(item => item.id === id), {
    owner: journey, placement: firstPlacement(state.equipment.placements, item, [...ITEMS, ...LORE_ITEMS]),
  });
  return { runtime: { state, survival, economy, revision: 1, worldMinutes: 0 }, instances };
}
const step = (result, action, options) => applyLoreAction(result.runtime, result.instances, journey, map, action, options);
const use = (result, id, target, options) => step(result, { type: "use", id, ...(target ? { target } : {}) }, options);
const view = result => loreView(result.runtime, result.instances, journey, map, { nowMillis: 1000 });
function advanceFixture(result, minutes) {
  result.runtime.state.elapsedMinutes += minutes;
  result.runtime.state.equipment.elapsedMinutes += minutes;
  result.runtime.worldMinutes += minutes;
  return result;
}
function investigative(result) {
  const state = result.runtime.state;
  state.trail.version = 2;
  state.trail.index = 1;
  state.trail.exploration = { version: 1, firstStage: 1, knownStage: null, hints: [] };
  state.discovery = { version: 1, entries: [] };
  const target = state.trail.stages[1];
  target.col = 14;
  target.row = 9;
  target.name = "Test destination";
  return result;
}

test("Empress refills without healing and quarters basal/walking effort, not direct artifact costs", async () => {
  let result = start("empress");
  result.runtime.state.reserveKcal = 500;
  result.runtime.state.health = 40;
  result = await use(result, "empress");
  assert.equal(result.runtime.state.reserveKcal, survival.reserve_kcal);
  assert.equal(result.runtime.state.health, 40);
  assert.equal(result.runtime.state.fatigue, 5);
  const before = result.runtime.state;
  result = await step(result, { type: "rest" });
  close(before.reserveKcal - result.runtime.state.reserveKcal, basalEnergy(before, 30, survival) / 4);
  const normal = structuredClone(result);
  delete normal.runtime.state.lore.protections;
  const a = await step(result, { type: "walk", dc: 0, dr: -1 });
  const b = await step(normal, { type: "walk", dc: 0, dr: -1 });
  close(result.runtime.state.reserveKcal - a.runtime.state.reserveKcal,
    (normal.runtime.state.reserveKcal - b.runtime.state.reserveKcal) / 4);
  const sun = result.instances.find(item => item.id === "sun");
  Object.assign(sun, { owner: journey, placement: firstPlacement(view(result).bag.placements,
    LORE_ITEMS.find(item => item.id === "sun"), [...ITEMS, ...LORE_ITEMS]) });
  result.runtime.state.fatigue = 20;
  const reserve = result.runtime.state.reserveKcal;
  result = await use(result, "sun");
  close(reserve - result.runtime.state.reserveKcal, 500 + basalEnergy(result.runtime.state, 1, survival) / 4);
});

test("Empress expiry and stasis stacking integrate exact time boundaries with no multiplicative stacking", async () => {
  let result = await use(start("empress"), "empress");
  advanceFixture(result, 710);
  const before = result.runtime.state, after = await step(result, { type: "rest" });
  close(before.reserveKcal - after.runtime.state.reserveKcal, basalEnergy(before, 10, survival) / 4 +
    basalEnergy(before, 20, survival));
  let state = armPower(start().runtime.state, "empress");
  state = armPower(state, "hanged");
  assert.equal(ordinaryEnergyFactor(state, 60), 0);
  assert.equal(ordinaryEnergyFactor(state, 240), 0.125);
});

test("Emperor shelters a real outdoor cell with best recovery and ends before other activity", async () => {
  let result = await use(start("emperor"), "emperor");
  result.runtime.state.fatigue = 80;
  result.runtime.state.awakeHours = 20;
  result.runtime.state.pressures.vigilance = 90;
  result = await step(result, { type: "sleep" });
  assert.equal(result.runtime.state.fatigue, 0);
  assert.equal(result.runtime.state.awakeHours, 0);
  assert.equal(result.runtime.state.pressures.vigilance, 74);
  assert.equal(result.runtime.state.pressures.placements.length, 0);
  assert.equal(result.runtime.state.elapsedMinutes, 481);
  result = await use(start("emperor"), "emperor");
  result = await step(result, { type: "inquire", id: "fool" });
  assert.equal(activePower(result.runtime.state, "emperor"), null);
});

test("Strength prevents ordinary exertion but charges direct magical fatigue without debt", async () => {
  let result = start("strength");
  result.runtime.state.fatigue = 90;
  result = await use(result, "strength");
  assert.equal(result.runtime.state.fatigue, 0);
  result = await step(result, { type: "walk", dc: 0, dr: -1 });
  assert.equal(result.runtime.state.fatigue, 0);
  assert.equal(result.runtime.state.faints ?? 0, 0);
  const before = structuredClone(result);
  advanceFixture(result, 180);
  result = await step(result, { type: "walk", dc: 0, dr: 1 });
  assert.ok(result.runtime.state.fatigue > 0);
  assert.ok(result.runtime.state.fatigue < 10);
  assert.ok(before.runtime.state.awakeHours > 0);
});

test("Hanged blocks ordinary needs and damage, permits recovery, and charges exactly €3", async () => {
  const initial = start("hanged", 19), wallet = initial.runtime.state.walletCents;
  let result = await use(initial, "hanged");
  assert.equal(result.runtime.state.walletCents, wallet - 300);
  result.runtime.state.reserveKcal = 0;
  result.runtime.state.health = 10;
  result.runtime.state.fatigue = 50;
  const awake = result.runtime.state.awakeHours;
  result = await step(result, { type: "walk", dc: 0, dr: -1 });
  assert.equal(result.runtime.state.health, 10);
  assert.equal(result.runtime.state.reserveKcal, 0);
  assert.equal(result.runtime.state.awakeHours, awake);
  assert.equal(result.runtime.state.fatigue, 50);
  result = await step(result, { type: "rest" });
  assert.ok(result.runtime.state.fatigue < 50);
  assert.equal(result.runtime.state.lore.debits, undefined);
  assert.equal(refundableDebits(result.runtime.state).length, 0);
});

test("Hanged ends on the exact minute, including starvation after its protected interval", async () => {
  let result = await use(start("hanged", 19), "hanged");
  advanceFixture(result, 110);
  result.runtime.state.reserveKcal = 0;
  result.runtime.state.health = 50;
  result.runtime.state.awakeHours = 0;
  result = await step(result, { type: "rest" });
  close(result.runtime.state.health, 50 - 20 / 60 * 10);
  close(result.runtime.state.awakeHours, 20 / 60);
  assert.equal(activePower(result.runtime.state, "hanged"), null);
});

test("Tower blocks positive vigilance including lingering/activity without stopping other needs", async () => {
  let result = await use(start("tower"), "tower");
  result.runtime.state.pressures.vigilance = 99;
  result.runtime.state.pressures.localMinutes = 10000;
  const before = result.runtime.state;
  const action = restSurvival(before, survival);
  const after = finishAction(before, action, { terrain: "place", police: true, latitude: 44.56, longitude: 2.31 }, economy,
    { survival, activity: "steal" });
  assert.equal(after.pressures.vigilance, 99);
  assert.equal(after.pressures.placements.length, 0);
  assert.ok(after.reserveKcal < before.reserveKcal);
  assert.ok(after.pressures.cleanliness < before.pressures.cleanliness);
  assert.ok(after.pressures.reputation.length);
});

test("Devil preserves real weight, non-load equipment benefits and wear without repairs", async () => {
  let result = start("devil"), before = view(result);
  const wallet = result.runtime.state.walletCents;
  result = await use(result, "devil");
  assert.equal(result.runtime.state.walletCents, wallet - 300);
  assert.equal(view(result).bag.grams, before.bag.grams);
  const gear = journeyEquipmentModifiers(result.runtime.state);
  assert.equal(gear.speedMultiplier, 1);
  assert.equal(gear.energyMultiplier, 1);
  assert.equal(gear.fatigueMultiplier, 1);
  const conditions = result.runtime.state.equipment.items;
  result = await step(result, { type: "walk", dc: 0, dr: -1 });
  assert.deepEqual(result.runtime.state.equipment.items, conditions);
  assert.equal(result.runtime.state.equipment.walkedMeters, 250);
});

test("Devil expiry within a step restores only the remaining distance's load/wear penalties", async () => {
  let result = await use(start("devil"), "devil");
  advanceFixture(result, 1439);
  const before = result.runtime.state;
  const normal = structuredClone(before);
  delete normal.lore.protections;
  const plain = walkSurvival(normal, 0, -1, map.rows[11][14], map.rows[10][14], survival);
  const magical = walkSurvival(before, 0, -1, map.rows[11][14], map.rows[10][14], survival);
  assert.ok(magical.lastMove.minutes > 1);
  assert.ok(magical.lastMove.minutes < plain.lastMove.minutes);
  assert.ok(magical.lastMove.energyKcal > plain.lastMove.energyKcal /
    journeyEquipmentModifiers(normal).energyMultiplier);
  assert.ok(magical.lastMove.energyKcal < plain.lastMove.energyKcal);
});

test("Devil and Chariot split equipment wear by protected distance, not a time fraction", async () => {
  let result = await use(start("devil"), "devil");
  advanceFixture(result, 1439);
  result.runtime.state.lore.effects = { remainingMeters: 50, expiresMinutes: result.runtime.state.elapsedMinutes + 60 };
  const baseline = structuredClone(result), before = result.runtime.state;
  delete baseline.runtime.state.lore.protections;
  const ordinary = await step(baseline, { type: "walk", dc: 0, dr: -1 });
  result = await step(result, { type: "walk", dc: 0, dr: -1 });
  const move = result.runtime.state.lastMove, fraction = move.protectedWearMeters / 250;
  assert.ok(fraction > 0 && fraction < 1);
  assert.ok(Math.abs(fraction - 1 / move.minutes) > 0.01);
  for (const item of before.equipment.items) {
    const worn = ordinary.runtime.state.equipment.items.find(entry => entry.id === item.id);
    const protectedItem = result.runtime.state.equipment.items.find(entry => entry.id === item.id);
    close(protectedItem.condition, item.condition - (item.condition - worn.condition) * (1 - fraction));
  }
});

test("Nameless rescues before custody release, exactly once, retaining time and belongings", async () => {
  let result = await use(start("nameless"), "nameless");
  result.runtime.state.health = 1;
  result.runtime.state.reserveKcal = 0;
  const before = result.runtime.state;
  result = await step(result, { type: "rest" });
  assert.equal(result.runtime.state.ended, null);
  assert.equal(result.runtime.state.health, 50);
  assert.equal(result.runtime.state.pressures.vigilance, 0);
  assert.equal(result.runtime.state.reserveKcal, survival.reserve_kcal / 2);
  assert.equal(result.runtime.state.elapsedMinutes, before.elapsedMinutes + 30);
  assert.equal(result.instances.find(item => item.id === "nameless").owner, journey);
  assert.equal(activePower(result.runtime.state, "nameless"), null);
  assert.equal(result.runtime.state.lore.rescueReceipts.length, 1);
  result.runtime.state.health = 1;
  result.runtime.state.reserveKcal = 0;
  result = await step(result, { type: "rest" });
  assert.equal(result.runtime.state.ended, "health");
  assert.equal(result.instances.find(item => item.id === "nameless").owner, null);
});

test("Nameless neither resurrects an ended journey nor prevents explicit abandonment or expiry", async () => {
  let result = await use(start("nameless"), "nameless");
  result = await step(result, { type: "abandon" });
  assert.equal(result.runtime.state.ended, "abandoned");
  await assert.rejects(use(result, "nameless"), /ended/);
  result = await use(start("nameless"), "nameless");
  advanceFixture(result, 1440);
  result.runtime.state.health = 1;
  result.runtime.state.reserveKcal = 0;
  result = await step(result, { type: "rest" });
  assert.equal(result.runtime.state.ended, "health");
});

test("Nameless recovery follows the latest validated settlement visited after arming", async () => {
  let result = await use(start("nameless"), "nameless");
  result = await step(result, { type: "walk", dc: 1, dr: 0 });
  const marker = { col: result.runtime.state.col, row: result.runtime.state.row };
  assert.equal(map.rows[marker.row][marker.col].terrain, "place");
  assert.deepEqual(activePower(result.runtime.state, "nameless").marker, marker);
  const [dc, dr] = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dc, dr]) => {
    const cell = map.rows[marker.row + dr]?.[marker.col + dc];
    return cell && !cell.unavailable && !["place", "water"].includes(cell.terrain);
  });
  result = await step(result, { type: "walk", dc, dr });
  result.runtime.state.reserveKcal = 0;
  result.runtime.state.health = 1;
  result = await step(result, { type: "rest" });
  assert.equal(result.runtime.state.ended, null);
  assert.deepEqual({ col: result.runtime.state.col, row: result.runtime.state.row }, marker);
  assert.equal(result.runtime.state.health, 50);
  assert.equal(result.runtime.state.lore.rescueReceipts.length, 1);
});

test("Justice refunds actual eligible cents once, stable most-recent first and excluding magical fees", async () => {
  let result = start("justice");
  result.runtime.state.lore.debits = [
    { id: "b", observedMinutes: 0, cents: 2000, reclaimedCents: 0, kind: "meal" },
    { id: "a", observedMinutes: 0, cents: 2000, reclaimedCents: 0, kind: "meal" },
  ];
  const wallet = result.runtime.state.walletCents;
  assert.equal(view(result).refundCents, 3000);
  result = await use(result, "justice");
  assert.equal(result.runtime.state.walletCents, wallet + 3000);
  assert.equal(result.runtime.state.lore.debits.find(debit => debit.id === "a").reclaimedCents, 2000);
  assert.equal(result.runtime.state.lore.debits.find(debit => debit.id === "b").reclaimedCents, 1000);
  assert.equal(result.runtime.state.lore.credits.length, 1);
  result.instances.find(item => item.id === "justice").cooldownUntil = 0;
  result = await use(result, "justice");
  assert.equal(result.runtime.state.walletCents, wallet + 4000);
  result.instances.find(item => item.id === "justice").cooldownUntil = 0;
  await assert.rejects(use(result, "justice"), /no-refund/);
});

test("Justice ledger is written by real ordinary payment, with a completed-action discovery proof", async () => {
  let result = start("justice");
  result.runtime.state.reserveKcal = 200;
  result = await step(result, { type: "meal" });
  const debit = result.runtime.state.lore.debits[0];
  assert.ok(debit.cents > 0);
  assert.equal(result.runtime.state.lore.paidActions, 1);
  assert.equal(result.runtime.state.lore.paidMeals, 1);
  const wallet = result.runtime.state.walletCents;
  result = await use(result, "justice");
  assert.equal(result.runtime.state.walletCents, wallet + debit.cents);
});

test("Priestess reveals current server truth only, contradicts proved false reports and unlocks that clue", async () => {
  let result = investigative(start("priestess"));
  const state = result.runtime.state;
  state.discovery.entries = [{ ...parentTruth(state), evidenceKey: "guess", kind: "suggestion",
    precision: "partial", facts: { place: "Wrong town", confirmed: false } }];
  const offered = view(result).truthTargets;
  assert.equal(offered.length, 1);
  result = await use(result, "priestess", offered[0].id);
  const entry = result.runtime.state.discovery.entries.find(entry => entry.evidenceKey === "destination");
  assert.equal(entry.facts.place, "Test destination");
  assert.equal(result.runtime.state.lore.contradictedReports.length, 1);
  assert.ok(result.runtime.state.lore.interpretations.some(permission => permission.evidence === discoveryIdentity(entry)));
  assert.equal(result.runtime.state.col, 14);
  assert.equal(result.runtime.state.trail.index, 1);
});

test("Priestess journal vision requires authorized current-step fiction and leaks no private contents", async () => {
  let result = start("priestess");
  const clue = { targetType: "abandoned-journal", targetId: "b".repeat(32), targetRevision: "step:1",
    evidenceKey: "solution", kind: "place", precision: "local",
    facts: { parent: "Camille", place: "Public town", marker: "virtual:journal:step:1", solution: "Public town",
      latitude: 44, longitude: 2 }, source: "journal-service", channels: ["collector"], observedMinutes: 0,
    availability: "current", contentVersion: "template-v1" };
  await assert.rejects(use(result, "priestess", discoveryIdentity(clue)), /no-truth|eligible/);
  result = await use(result, "priestess", discoveryIdentity(clue), { journalContext: { truths: [clue] } });
  assert.equal(result.runtime.state.discovery.entries.at(-1).facts.marker, "virtual:journal:step:1");
  for (const language of ["fr", "en"]) assert.doesNotThrow(() =>
    discoveryNotebookEntries(result.runtime.state, (key, args) => translate(language, key, args), { authored: true }));
});

test("Hierophant previews no text, reconstructs selected genuinely unread inscriptions with provenance", async () => {
  let result = start("hierophant");
  result.runtime.state = learnDiscovery(result.runtime.state,
    ["fool", "magician", "hermit"].map(id => inscriptionClue(result.runtime.state, id)));
  const fragments = fragmentOptions(result.runtime.state).slice(0, 3);
  assert.equal(fragments.length, 3);
  assert.ok(view(result).fragments.every(fragment => fragment.fr === undefined && fragment.en === undefined));
  result = await step(result, { type: "use", id: "hierophant", targets: fragments.map(fragment => fragment.id) });
  assert.equal(result.runtime.state.elapsedMinutes, 11);
  assert.equal(result.runtime.state.lore.fragments.length, 3);
  assert.equal(result.runtime.state.discovery.entries.filter(entry => entry.kind === "inscription").length, 6);
  assert.ok(result.runtime.state.lore.fragments.every(fragment => fragment.source && fragment.observedMinutes === 11));
  assert.equal(result.instances.find(item => item.id === "hierophant").cooldownUntil, 1441);
});

test("Hierophant interruption spends committed activation and no partial bundle is revealed", async () => {
  let result = start("hierophant");
  result.runtime.state = learnDiscovery(result.runtime.state, [inscriptionClue(result.runtime.state, "fool")]);
  result.runtime.state.health = 1;
  result.runtime.state.reserveKcal = 1;
  const id = fragmentOptions(result.runtime.state)[0].id;
  result = await step(result, { type: "use", id: "hierophant", targets: [id] });
  assert.equal(result.runtime.state.ended, "health");
  assert.equal(result.runtime.state.fatigue, 5);
  assert.equal(result.runtime.state.lore.fragments, undefined);
  assert.equal(result.instances.find(item => item.id === "hierophant").cooldownUntil, 1441);
});

test("Star earns a real loaded-map route and refuses an out-of-map target before charge", async () => {
  let result = investigative(start("star"));
  const path = parentPath(result.runtime.state, map);
  assert.deepEqual(path.points[0], [14, 11]);
  assert.deepEqual(path.points.at(-1), [14, 9]);
  for (let i = 1; i < path.points.length; i++) {
    assert.equal(Math.abs(path.points[i][0] - path.points[i - 1][0]) +
      Math.abs(path.points[i][1] - path.points[i - 1][1]), 1);
  }
  result = await use(result, "star");
  assert.equal(view(result).route.distanceMeters, 500);
  assert.ok(view(result).route.walkingMinutes > 0);
  assert.equal(result.runtime.state.trail.exploration.knownStage, 1);
  const bad = investigative(start("star"));
  bad.runtime.state.trail.stages[1].col = 5000;
  assert.equal(view(bad).owned[0].blocked, "no-path");
  await assert.rejects(use(bad, "star"), /no-path/);
});

test("Lovers uses traversable distance, walking time only, committed signals and pinned stage", async () => {
  let result = await use(investigative(start("lovers")), "lovers");
  assert.equal(view(result).compass.direction, "north");
  result = await step(result, { type: "rest" });
  assert.equal(result.runtime.state.lore.compass.remainingMinutes, 180);
  const before = result.runtime.state;
  result = await step(result, { type: "walk", dc: 0, dr: -1 });
  assert.equal(view(result).compass.signal, "warmer");
  close(result.runtime.state.lore.compass.remainingMinutes,
    180 - result.runtime.state.elapsedMinutes + before.elapsedMinutes);
  assert.equal(result.runtime.state.lore.compassReceipts.length, 1);
  result.runtime.state.trail.index = 2;
  result = await step(result, { type: "rest" });
  assert.equal(result.runtime.state.lore.compass, null);
});

test("Lovers includes the exact walking-budget boundary and never counts unconscious recovery as walking", async () => {
  const armed = await use(investigative(start("lovers")), "lovers");
  const walked = await step(armed, { type: "walk", dc: 0, dr: -1 });
  const minutes = walked.runtime.state.lastMove.minutes;
  const exact = structuredClone(armed);
  exact.runtime.state.lore.compass.remainingMinutes = minutes;
  const completed = await step(exact, { type: "walk", dc: 0, dr: -1 });
  assert.equal(completed.runtime.state.lore.compass, null);
  assert.equal(completed.runtime.state.lore.compassReceipts.at(-1).signal, "warmer");
  const late = structuredClone(armed);
  late.runtime.state.lore.compass.remainingMinutes = minutes - 1e-8;
  const expired = await step(late, { type: "walk", dc: 0, dr: -1 });
  assert.equal(expired.runtime.state.lore.compassReceipts.at(-1).signal, null);
  const exhausted = structuredClone(armed);
  exhausted.runtime.state.fatigue = 99.99;
  const fainted = await step(exhausted, { type: "walk", dc: 0, dr: -1 });
  assert.equal(fainted.runtime.state.faints, 1);
  const receipt = fainted.runtime.state.lore.compassReceipts.at(-1);
  assert.ok(fainted.runtime.state.elapsedMinutes - exhausted.runtime.state.elapsedMinutes > receipt.minutes + 400);
  close(fainted.runtime.state.lore.compass.remainingMinutes, 180 - receipt.minutes);
});

test("Moon pins new domain evidence privately, guarantees it once and deduplicates ordinary dreams", async () => {
  let result = investigative(start("moon", 22));
  result = await use(result, "moon");
  assert.equal(result.runtime.state.lore.moon.clues.length, 2);
  assert.equal(view(result).state.lore.moon.clues, undefined);
  const pinned = result.runtime.state.lore.moon.clues.map(discoveryIdentity);
  result = await step(result, { type: "sleep" }, { random: () => 0 });
  assert.equal(result.runtime.state.lore.moon, null);
  assert.equal(result.runtime.state.lore.moonReceipts.length, 1);
  for (const id of pinned) assert.ok(result.runtime.state.discovery.entries.some(entry => discoveryIdentity(entry) === id));
  assert.ok(!pinned.includes(result.runtime.state.lore.dreams.episodes[0].clue));
  assert.equal(result.runtime.state.lore.dreams.episodes.length, 1);
});

test("Moon retains changed artifact evidence as historical without tracking or replacing its holder", async () => {
  let result = await use(investigative(start("moon", 22)), "moon");
  const pinned = result.runtime.state.lore.moon.clues.find(clue => clue.targetType === "artifact");
  const item = result.instances.find(item => item.id === pinned.targetId);
  item.owner = "b".repeat(32);
  item.generation += 1;
  result = await step(result, { type: "sleep" });
  assert.equal(result.runtime.state.discovery.entries.find(entry =>
    discoveryIdentity(entry) === discoveryIdentity(pinned)).availability, "historical");
  assert.equal(result.runtime.state.lore.moonReceipts[0].clues.filter(clue => clue.availability === "historical").length, 1);
});

test("Moon pins all three domains and qualifies by sleep start strictly before the 24-hour boundary", async () => {
  const journal = { targetType: "abandoned-journal", targetId: "b".repeat(32), targetRevision: "step:1",
    evidenceKey: "solution", kind: "place", precision: "local", facts: { parent: "Camille", place: "Public town",
      marker: "virtual:journal:step:1", solution: "Public town", latitude: 44, longitude: 2 },
    observedMinutes: 0, source: "journal-service", channels: ["collector"], availability: "current",
    contentVersion: "template-v1" };
  const options = { journalContext: { truths: [journal] }, random: () => 0 };
  let armed = await use(investigative(start("moon", 22)), "moon", undefined, options);
  assert.equal(armed.runtime.state.lore.moon.clues.length, 3);
  assert.doesNotMatch(JSON.stringify(view(armed).state.lore.moon), /Public town|Camille|step:1/);
  const expired = advanceFixture(structuredClone(armed), 1440);
  const missed = await step(expired, { type: "sleep" }, options);
  assert.equal(missed.runtime.state.lore.moonReceipts, undefined);
  armed = advanceFixture(armed, 1439);
  const dreamed = await step(armed, { type: "sleep" }, options);
  const receipt = dreamed.runtime.state.lore.moonReceipts.at(-1);
  assert.equal(receipt.clues.length, 3);
  assert.deepEqual(receipt.clues.map(clue => JSON.parse(clue.evidence)[0]).sort(),
    ["abandoned-journal", "artifact", "parent-trail"]);
});

test("Judgement chooses real daily modifiers, keeps birth and resumes the current natural draw at exact expiry", async () => {
  let result = start("judgement", 23);
  const birth = result.runtime.state.birthCard, natural = result.runtime.state.dailyCard;
  result = await use(result, "judgement", "tower");
  assert.equal(result.runtime.state.dailyCard, "tower");
  assert.equal(result.runtime.state.birthCard, birth);
  assert.equal(activePower(result.runtime.state, "judgement").naturalCard, natural);
  result = await step(result, { type: "sleep" }, { random: () => 0 });
  assert.equal(result.runtime.state.dailyCard, "tower");
  const underlying = activePower(result.runtime.state, "judgement").naturalCard;
  assert.equal(result.runtime.state.lore.dreams.episodes[0].dailyCard, "tower");
  advanceFixture(result, 960);
  result = await step(result, { type: "pack", id: "judgement", x: 0, y: 0, rotated: false });
  result = await step(result, { type: "rest" });
  assert.equal(result.runtime.state.dailyCard, underlying);
  assert.equal(activePower(result.runtime.state, "judgement"), null);
  assert.equal(result.runtime.state.birthCard, birth);
});

test("World teleports only to genuinely named map settlements, never hidden future towns or arbitrary coordinates", async () => {
  let result = start("world");
  result = await step(result, { type: "inquire", id: "fool" });
  const hidden = view(result).worldTargets;
  assert.ok(!hidden.some(target => target.id === "[15,11]"));
  const cell = map.rows[9][15], place = cell.settlements[0];
  result.runtime.state = learnDiscovery(result.runtime.state, [{
    ...result.runtime.state.discovery.entries[0], targetId: "fool", targetRevision: "different",
    precision: "town", facts: { artifact: "fool", region: map.name, place: place.name },
  }]);
  const target = view(result).worldTargets.find(target => target.id === "[15,9]");
  assert.ok(target);
  const distance = result.runtime.state.distanceMeters;
  result = await use(result, "world", target.id);
  assert.deepEqual([result.runtime.state.col, result.runtime.state.row], [15, 9]);
  assert.equal(result.runtime.state.distanceMeters, distance);
  assert.equal(result.runtime.state.fatigue, 10);
  assert.ok(result.runtime.state.reserveKcal < survival.reserve_kcal - 500);
});

test("Normal bookshop work is server replayed, persists mid-game and earns real rewards without client scores", async () => {
  let result = start("magician"), offer = view(result).workOffer;
  assert.ok(offer);
  result = await step(result, { type: "work-start", language: "en" }, { nowMillis: 1000 });
  assert.equal(result.runtime.state.elapsedMinutes, 45);
  assert.equal(view(result).state.lore.work, undefined);
  await assert.rejects(use(result, "magician", "bookshop"), /Complete or cancel/);
  let board = view(result).work;
  for (let shelf = 0; shelf < board.shelves.length; shelf++) {
    const books = board.books.filter(book => book.genre === board.shelves[shelf])
      .sort((a, b) => a.title.en.localeCompare(b.title.en, "en", { sensitivity: "base", ignorePunctuation: true }));
    for (const [slot, book] of books.entries()) {
      result = await step(result, { type: "work-move", move: { type: "select", bookId: book.id } }, { nowMillis: 1100 });
      result = await step(result, { type: "work-move", move: { type: "place", shelf, slot } }, { nowMillis: 1100 });
    }
  }
  board = view(result).work;
  assert.equal(board.status, "requests");
  const requests = ["world", "pirates", "Mowgli", "Buck"];
  const ids = ["book-1", "book-2", "book-5", "book-6"];
  while (board?.status === "requests") {
    const index = requests.findIndex(word => board.request.en.includes(word));
    assert.ok(index >= 0, board.request.en);
    result = await step(result, { type: "work-move", move: { type: "select", bookId: ids[index] } }, { nowMillis: 1200 });
    result = await step(result, { type: "work-move", move: { type: "serve" } }, { nowMillis: 1200 });
    board = view(result).work;
  }
  assert.equal(result.runtime.state.lore.earnedActivities, 1);
  assert.equal(result.runtime.state.lastJourneyMiniGame.completed, true);
  assert.equal(result.runtime.state.lastJourneyMiniGame.rewardCents, offer.maxRewardCents);
  assert.ok(view(result).workOffer);
  assert.notEqual(view(result).workOffer.key, offer.key);
  assert.equal(view(result).workResult.rewardCents, offer.maxRewardCents);
});

test("Magician resolves the selected real offer in one minute without practice XP, and cannot reuse it", async () => {
  let result = start("magician");
  const offer = view(result).earningOffers.find(offer => offer.id === "bookshop");
  const before = structuredClone(result);
  result = await use(result, "magician", offer.id);
  assert.equal(result.runtime.state.elapsedMinutes, 1);
  assert.equal(result.runtime.state.walletCents, before.runtime.state.walletCents + offer.maxRewardCents);
  assert.equal(result.runtime.state.journeyMiniGameSkills, undefined);
  assert.equal(result.runtime.state.lore.workCredits[0].magical, true);
  const nextOffer = view(result).earningOffers.find(item => item.id === offer.id);
  assert.ok(nextOffer);
  assert.notEqual(nextOffer.key, offer.key);
  assert.ok(result.runtime.state.lore.usedWork.includes(offer.key));
  await assert.rejects(use(result, "magician", offer.id), /cooling down/i);
});

test("Harvest magical ceiling is attainable by legal timed play of its actual seeded offer, including rotten bunches", () => {
  for (const birthCard of ["fool", "empress"]) {
    const state = start().runtime.state;
    state.birthCard = birthCard;
    state.journeyMiniGameSkills = { harvest: 240 };
    const offer = earningOffers(state, { terrain: "vineyard" }, { latitude: 44.56, longitude: 2.31 }, economy)
      .find(offer => offer.id === "harvest");
    let seed = 2166136261;
    for (const char of `${state.serverJourney?.seed ?? state.startedAt}:${offer.key}`) {
      seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
    }
    let game = harvest.createGame({ level: offer.level, now: 0, birthCard, dailyCard: state.dailyCard,
      random: () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; } });
    const rules = harvest.difficulty(offer.level);
    assert.equal(game.resonance, offer.resonance);
    while (game.now < rules.durationMs) {
      const bunch = harvest.bunchAt(game), start = game.now;
      if (bunch.rotten) {
        game = harvest.input(game, "press", start);
        game = harvest.advance(game, Math.min(rules.durationMs, start + rules.squashMs));
      } else {
        const target = Math.max((bunch.colour + 0.001) / rules.baskets,
          Math.min((bunch.colour + 0.999) / rules.baskets, bunch.x));
        const duration = Math.max(rules.fastFallMs,
          Math.ceil(Math.abs(target - bunch.x) / rules.steerPerSecond * 1000) + 1);
        if (start + duration > rules.durationMs) {
          game = harvest.advance(game, rules.durationMs);
          break;
        }
        game = harvest.input(game, target > game.x ? "right" : target < game.x ? "left" : "stop", start);
        game = harvest.input(game, "press", start + duration - rules.fastFallMs);
        game = harvest.input(game, "release", game.now);
        game = harvest.advance(game, start + duration);
      }
      game = harvest.input(game, "abort-press", game.now);
      game = harvest.input(game, "stop", game.now);
    }
    assert.equal(harvest.result(game).completed, true);
    assert.ok(resonanceGain(game.score * offer.pointRewardCents, offer.resonance) >= 2000);
    assert.equal(offer.maxRewardCents, 2000);
  }
});

test("all remaining discovery gates use earned proofs and exact UTC intervals, and World uses the four approved threads", () => {
  const result = start(), state = result.runtime.state;
  const blocked = ["magician", "priestess", "empress", "emperor", "hierophant", "lovers", "justice",
    "strength", "hanged", "nameless", "devil", "star", "moon", "judgement", "world"];
  for (const id of blocked) assert.ok(discoveryRequirement(state, id), id);
  assert.equal(discoveryRequirement(state, "tower"), null);
  state.startedAt = Date.UTC(2026, 9, 19, 18);
  assert.equal(discoveryRequirement(state, "hanged"), null);
  state.startedAt = Date.UTC(2026, 9, 19, 20);
  assert.equal(discoveryRequirement(state, "hanged"), "evening");
  assert.equal(discoveryRequirement(state, "moon"), null);
  state.startedAt = Date.UTC(2026, 9, 19, 6);
  assert.equal(discoveryRequirement(state, "star"), null);
  state.startedAt = Date.UTC(2026, 9, 19, 8);
  assert.equal(discoveryRequirement(state, "star"), "dawn");
  const ids = ["fool", "empress", "chariot", "magician", "hierophant", "priestess"];
  result.runtime.state = learnDiscovery(state, ids.map(id => inscriptionClue(state, id)));
  assert.equal(new Set(ids.map(thread)).size, 3);
  assert.equal(discoveryRequirement(result.runtime.state, "world"), null);
});

test("prepared negative-coordinate terrain supports real Star routes and World landings without leaking the route before payment", async () => {
  const world = { ...map, width: 2, height: 2,
    rows: [[{ terrain: "place", settlements: [{ name: "Haven", osmId: "node/1" }] }, { terrain: "road" }],
      [{ terrain: "road" }, { terrain: "road" }]],
    loreChunks: Object.fromEntries([-1, -2, -3].map(x => [`${x},0`,
      { rows: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => ({ terrain: "road" }))) }])) };
  let result = investigative(start("star")), state = result.runtime.state;
  state.col = state.row = 0;
  state.lore.visitedSettlements = [];
  state.lore.lastSettlement = { col: 0, row: 0, town: "Haven" };
  Object.assign(state.trail.stages[1], { col: -20, row: 1, name: "Distant town", geonameId: 1234 });
  delete state.trail.stages[1].osmId;
  const act = (action, r = result) => applyLoreAction(r.runtime, r.instances, journey, world, action);
  const before = loreView(result.runtime, result.instances, journey, world);
  assert.doesNotMatch(JSON.stringify(before), /Distant town/);
  assert.equal(before.owned[0].blocked, null);
  result = await act({ type: "use", id: "star" });
  assert.equal(result.runtime.state.lore.route.distanceMeters, 21 * 250);
  assert.deepEqual(result.runtime.state.lore.route.points.at(-1), [-20, 1]);
  assert.deepEqual(loreView(result.runtime, result.instances, journey, world).worldTargets, []);
  result.instances.find(item => item.id === "star").owner = null;
  Object.assign(result.instances.find(item => item.id === "world"),
    { owner: journey, placement: { id: "world", x: 0, y: 0, rotated: false } });
  const destination = loreView(result.runtime, result.instances, journey, world).worldTargets.find(target =>
    target.id === "[-20,1]");
  assert.ok(destination);
  for (const geonameId of [0, -1, 1.5]) {
    const invalid = structuredClone(result);
    invalid.runtime.state.trail.stages[1].geonameId = geonameId;
    assert.equal(loreView(invalid.runtime, invalid.instances, journey, world).worldTargets
      .some(target => target.id === destination.id), false);
  }
  result = await act({ type: "use", id: "world", target: destination.id });
  assert.deepEqual([result.runtime.state.col, result.runtime.state.row], [-20, 1]);
  assert.equal(result.runtime.state.lore.lastSettlement.town, "Distant town");
  assert.equal(result.runtime.state.lore.visitedSettlements.at(-1).town, "Distant town");
});
