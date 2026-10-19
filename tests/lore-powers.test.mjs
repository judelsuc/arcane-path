import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createLoreState, applyLoreAction, loreView, loreBag, discoveryRequirement } from "../lore-engine.mjs";
import { startSurvival, basalEnergy } from "../survival.mjs";
import { startEconomy } from "../economy.mjs";
import { createTrail } from "../trail.mjs";
import { LORE_ITEMS } from "../lore-catalogue.mjs";
import { translate } from "../i18n.mjs";
import { discoveryNotebookEntries } from "../discovery-ui.mjs";
import { grantInterpretation } from "../discovery-interpretation.mjs";
import { firstPlacement } from "../equipment-inventory.mjs";
import { ITEMS } from "../equipment.mjs";

const json = name => JSON.parse(readFileSync(new URL(name, import.meta.url)));
const map = json("../public/map.json"), survival = json("../public/config.json").survival;
const economy = json("../public/economy.json"), journey = "a".repeat(32), other = "b".repeat(32);
function start() {
  const genesis = { ...startEconomy(startSurvival(14, 11, Date.UTC(2026, 9, 19, 12),
    "balanced", survival), economy, () => 0), trail: createTrail(map, 14, 11, () => 0) };
  return { runtime: { state: createLoreState(genesis, map, economy), survival, economy,
    revision: 1, worldMinutes: 0 },
  instances: LORE_ITEMS.map(item => ({ id: item.id, col: 14, row: 11, town: "Lestrunie",
    marker: `virtual:${item.id}`, generation: 1, owner: null, placement: null,
    cooldownUntil: 0, recallJourney: null })) };
}
const step = (result, action) => applyLoreAction(result.runtime, result.instances, journey, map, action);
async function claim(result, id) {
  result = await step(result, { type: "inquire", id });
  return step(result, { type: "claim", id });
}
const instance = (result, id) => result.instances.find(item => item.id === id);
const view = result => loreView(result.runtime, result.instances, journey, map);
async function cachedArtifact() {
  let result = await claim(start(), "fool");
  result = await claim(result, "wheel");
  instance(result, "fool").cooldownUntil = 10000;
  result = await step(result, { type: "cache", id: "fool" });
  return step(result, { type: "walk", dc: 0, dr: -1 });
}

test("Fool returns to a personally visited settlement in one minute without walking or consuming Chariot distance", async () => {
  let result = await claim(start(), "fool");
  assert.deepEqual(view(result).returnTargets, []);
  result = await step(result, { type: "walk", dc: 0, dr: -1 });
  result.runtime.state.health = 60;
  result.runtime.state.equipment.dog = { hunger: 0, careNeed: 0, name: "Pip" };
  result.runtime.state.lore.effects = { remainingMeters: 10000, expiresMinutes: 5000 };
  const before = structuredClone(result), target = view(result).returnTargets[0];
  assert.equal(target.town, "Lestrunie");
  const used = await step(result, { type: "use", id: "fool", target: target.id });
  const a = before.runtime.state, b = used.runtime.state;
  assert.deepEqual(result, before);
  assert.deepEqual([b.col, b.row], [14, 11]);
  assert.equal(b.elapsedMinutes, a.elapsedMinutes + 1);
  assert.equal(b.fatigue, a.fatigue + 10);
  assert.equal(b.health, 60);
  assert.equal(b.awakeHours, a.awakeHours + 1 / 60);
  assert.equal(b.distanceMeters, a.distanceMeters);
  assert.equal(b.reserveKcal, a.reserveKcal - basalEnergy(a, 1, survival));
  assert.deepEqual(b.lore.effects, a.lore.effects);
  assert.equal(b.equipment.walkedMeters, a.equipment.walkedMeters);
  assert.deepEqual(b.equipment.items, a.equipment.items);
  assert.equal(b.equipment.dog.name, "Pip");
  assert.deepEqual(view(used).bag.placements, view(before).bag.placements);
  assert.equal(instance(used, "fool").cooldownUntil, used.runtime.worldMinutes + 1440);
  assert.deepEqual(view(used).returnTargets, []);
  assert.ok(b.trail.arrivals.some(arrival => arrival.stage === b.trail.index));
  assert.equal(b.trail.index, a.trail.index);
});

test("Fool rejects unknown/unvisited/current cells and malformed visit histories before payment", async () => {
  const result = await claim(start(), "fool"), before = structuredClone(result);
  for (const target of [undefined, "[14,11]", "[15,11]", "[0,0]", "arbitrary"]) {
    await assert.rejects(step(result, { type: "use", id: "fool", target }), /visited/);
  }
  assert.deepEqual(result, before);
  for (const visits of [null, [{ col: 14, row: 10, town: "invented", observedMinutes: 0 }],
    [...result.runtime.state.lore.visitedSettlements, ...result.runtime.state.lore.visitedSettlements],
    [{ col: 14, row: 11, town: "Lestrunie", observedMinutes: 100000 }]]) {
    const bad = structuredClone(result);
    bad.runtime.state.lore.visitedSettlements = visits;
    assert.throws(() => view(bad), /Invalid visited/);
  }
  const legacy = structuredClone(result);
  delete legacy.runtime.state.lore.visitedSettlements;
  assert.deepEqual(view(legacy).returnTargets, []);
  const recorded = await step(legacy, { type: "walk", dc: 0, dr: -1 });
  assert.equal(view(recorded).returnTargets.length, 1);
});

test("Wheel recalls its own public cache across distance, keeping target cooldown and real bag custody", async () => {
  const result = await cachedArtifact(), before = structuredClone(result);
  assert.deepEqual(view(result).recallTargets, ["fool"]);
  const used = await step(result, { type: "use", id: "wheel", target: "fool" });
  assert.deepEqual(result, before);
  const target = instance(used, "fool"), previous = instance(before, "fool");
  assert.equal(target.owner, journey);
  assert.equal(target.recallJourney, null);
  assert.equal(target.cooldownUntil, 10000);
  assert.equal(target.generation, previous.generation + 1);
  assert.equal(instance(used, "wheel").cooldownUntil, used.runtime.worldMinutes + 4320);
  assert.equal(used.runtime.state.elapsedMinutes, before.runtime.state.elapsedMinutes + 1);
  assert.equal(used.runtime.state.fatigue, before.runtime.state.fatigue + 10);
  assert.deepEqual([used.runtime.state.col, used.runtime.state.row], [14, 10]);
  assert.equal(used.runtime.state.distanceMeters, before.runtime.state.distanceMeters);
  assert.equal(loreBag(used.runtime.state, used.instances, journey).grams, 1455);
  assert.equal(view(used).bag.placements.length, 2);
  assert.deepEqual(view(used).recallTargets, []);
  assert.ok(used.runtime.state.discovery.entries.filter(entry => entry.targetId === "fool" &&
    entry.kind === "location").every(entry => entry.availability === "historical"));
  assert.doesNotMatch(JSON.stringify(view(used)), /recallJourney|bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/);
  await assert.rejects(step(used, { type: "use", id: "wheel", target: "fool" }), /cooling/);
});

test("Wheel cannot steal, recall another depositor's cache, recall itself or infer an entitlement from an old inscription", async () => {
  for (const alter of [
    item => { item.owner = other; },
    item => { item.recallJourney = other; },
    item => { delete item.recallJourney; },
    item => { item.marker = "virtual:fool"; },
  ]) {
    const result = await cachedArtifact();
    alter(instance(result, "fool"));
    assert.deepEqual(view(result).recallTargets, []);
    const before = structuredClone(result);
    await assert.rejects(step(result, { type: "use", id: "wheel", target: "fool" }), /still-unclaimed/);
    assert.deepEqual(result, before);
  }
  const result = await cachedArtifact();
  await assert.rejects(step(result, { type: "use", id: "wheel", target: "wheel" }), /still-unclaimed/);
});

test("Wheel recalls into the actual shared bag alongside a tent and sleeping bag", async () => {
  const result = await cachedArtifact();
  const state = result.runtime.state, packing = [...ITEMS, ...LORE_ITEMS];
  for (const id of ["sleepingBag", "tent"]) {
    const placement = firstPlacement([...state.equipment.placements,
      ...result.instances.filter(item => item.owner === journey).map(item => item.placement)],
    ITEMS.find(item => item.id === id), packing);
    state.equipment.items.push({ id, condition: 100 });
    state.equipment.placements.push(placement);
  }
  assert.equal(loreBag(state, result.instances, journey).grams, 5135);
  const used = await step(result, { type: "use", id: "wheel", target: "fool" });
  assert.equal(loreBag(used.runtime.state, used.instances, journey).grams, 5155);
});

test("Sun fully restores health and fatigue, charges 500 kcal plus metabolism and preserves sleep debt", async () => {
  let result = await claim(start(), "fool");
  result = await claim(result, "sun");
  result.runtime.state.health = 4;
  result.runtime.state.fatigue = 82;
  result.runtime.state.awakeHours = 10;
  const before = structuredClone(result);
  const used = await step(result, { type: "use", id: "sun" }), state = used.runtime.state;
  assert.deepEqual(result, before);
  assert.equal(state.health, 100);
  assert.equal(state.fatigue, 0);
  assert.equal(state.awakeHours, 10 + 1 / 60);
  assert.equal(state.reserveKcal, before.runtime.state.reserveKcal - 500 - basalEnergy(before.runtime.state, 1, survival));
  assert.equal(state.elapsedMinutes, before.runtime.state.elapsedMinutes + 1);
  assert.equal(state.walletCents, before.runtime.state.walletCents);
  assert.equal(instance(used, "sun").cooldownUntil, used.runtime.worldMinutes + 4320);
  const ready = structuredClone(used);
  ready.runtime.worldMinutes = instance(ready, "sun").cooldownUntil;
  await assert.rejects(step(ready, { type: "use", id: "sun" }), /no health or fatigue/);
  ready.runtime.state.health = 90;
  ready.runtime.state.reserveKcal = 500 + basalEnergy(ready.runtime.state, 1, survival) / 2;
  await assert.rejects(step(ready, { type: "use", id: "sun" }), /resources/);
  ready.runtime.state.ended = "health";
  ready.runtime.state.health = 0;
  await assert.rejects(step(ready, { type: "use", id: "sun" }), /ended/);
});

test("new discovery gates use current historical evidence, inscriptions and exact UTC day boundaries", async () => {
  const initial = start().runtime.state;
  assert.equal(discoveryRequirement(initial, "fool"), null);
  assert.equal(discoveryRequirement(initial, "wheel"), "historical");
  assert.equal(discoveryRequirement(initial, "sun"), "inscription");
  let result = await claim(start(), "fool");
  assert.equal(discoveryRequirement(result.runtime.state, "wheel"), null);
  assert.equal(discoveryRequirement(result.runtime.state, "sun"), null);
  for (const [hour, minute, blocked] of [[5, 59, "daylight"], [6, 0, null], [19, 59, null], [20, 0, "daylight"]]) {
    const state = structuredClone(result.runtime.state);
    state.startedAt = Date.UTC(2026, 9, 19, hour, minute) - state.elapsedMinutes * 60000;
    assert.equal(discoveryRequirement(state, "sun"), blocked);
  }
  result = await step(result, { type: "inquire", id: "sun" });
  result.runtime.state.startedAt = Date.UTC(2026, 9, 19, 19, 59) - result.runtime.state.elapsedMinutes * 60000;
  result = await step(result, { type: "claim", id: "sun" });
  assert.equal(instance(result, "sun").owner, journey);
  const unavailable = start();
  const heard = await step(unavailable, { type: "inquire", id: "wheel" });
  await assert.rejects(step(heard, { type: "claim", id: "wheel" }), /historical/);
});

test("new powers cannot bypass interrupted activation or charge their direct price on failure", async () => {
  for (const id of ["fool", "wheel", "sun"]) {
    let result = id === "wheel" ? await cachedArtifact() : await claim(start(), "fool");
    if (id === "fool") result = await step(result, { type: "walk", dc: 0, dr: -1 });
    if (id === "sun") result = await claim(result, "sun");
    if (id === "sun") result.runtime.state.fatigue = 5;
    result.runtime.state.awakeHours = survival.sleep_limit_hours - 0.001;
    const before = structuredClone(result);
    const action = { type: "use", id, ...(id === "fool" ? { target: "[14,11]" } :
      id === "wheel" ? { target: "fool" } : {}) };
    const interrupted = await step(result, action);
    assert.equal(interrupted.runtime.state.lore.outcome, "interrupted");
    assert.equal(instance(interrupted, id).cooldownUntil, instance(before, id).cooldownUntil);
    assert.deepEqual([interrupted.runtime.state.col, interrupted.runtime.state.row],
      [before.runtime.state.col, before.runtime.state.row]);
    if (id === "wheel") assert.equal(instance(interrupted, "fool").owner, null);
  }
});

test("72-hour instance cooldowns reopen exactly at equality, and Sun can activate at night", async () => {
  let result = await cachedArtifact();
  result = await step(result, { type: "use", id: "wheel", target: "fool" });
  result = await step(result, { type: "walk", dc: 0, dr: 1 });
  result = await step(result, { type: "cache", id: "fool" });
  const cooldown = instance(result, "wheel").cooldownUntil;
  result.runtime.worldMinutes = cooldown - 0.001;
  await assert.rejects(step(result, { type: "use", id: "wheel", target: "fool" }), /cooling/);
  result.runtime.worldMinutes = cooldown;
  result = await step(result, { type: "use", id: "wheel", target: "fool" });
  assert.equal(instance(result, "fool").owner, journey);

  let healing = await claim(start(), "fool");
  healing = await claim(healing, "sun");
  healing.runtime.state.health = 90;
  healing.runtime.state.startedAt = Date.UTC(2026, 9, 19, 22);
  healing = await step(healing, { type: "use", id: "sun" });
  assert.equal(healing.runtime.state.health, 100);
  const availableAt = instance(healing, "sun").cooldownUntil;
  healing.runtime.state.health = 80;
  healing.runtime.state.reserveKcal = 1800;
  healing.runtime.worldMinutes = availableAt - 0.001;
  await assert.rejects(step(healing, { type: "use", id: "sun" }), /cooling/);
  healing.runtime.worldMinutes = availableAt;
  const restored = await step(healing, { type: "use", id: "sun" });
  assert.equal(restored.runtime.state.health, 100);
  assert.equal(restored.runtime.state.fatigue, 0);
});

test("all 22 artifacts have bilingual guidance, markers, names and inscription presentation", async () => {
  let result = start();
  for (const item of LORE_ITEMS) result = await step(result, { type: "inquire", id: item.id });
  let state = result.runtime.state;
  for (const entry of state.discovery.entries) state = grantInterpretation(state, entry, "npc");
  for (const locale of ["en", "fr"]) {
    const records = discoveryNotebookEntries(state, (key, args) => translate(locale, key, args), { authored: true })
      .filter(record => JSON.parse(record.id)[0] === "artifact");
    assert.equal(records.length, 22);
    for (const record of records) {
      assert.doesNotMatch(JSON.stringify(record.ladder), /undefined|virtual:|\{condition\}/);
      assert.match(record.ladder.plain, /14, 11/);
    }
  }
});
