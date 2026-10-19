import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ITEMS, CAPACITY_GRAMS, createEquipment, restoreEquipment, validateEquipment,
  equipmentModifiers, advanceEquipment, equipmentAction } from "../equipment.mjs";

const context = (state, extra = {}) => ({ expectedRevision: state.revision,
  elapsedMinutes: state.elapsedMinutes, walletCents: 100000, atShop: true, dogEncounter: true, ...extra });
const act = (state, type, itemId, extra) => equipmentAction(state,
  itemId === undefined ? { type } : { type, itemId }, context(state, extra));
const advance = (state, minutes, meters = 0) => advanceEquipment(state, {
  expectedRevision: state.revision, elapsedMinutes: state.elapsedMinutes + minutes,
  walkedMeters: state.walkedMeters + meters,
});
const freeze = value => {
  if (value && typeof value === "object") {
    for (const entry of Object.values(value)) freeze(entry);
    Object.freeze(value);
  }
  return value;
};

test("catalogue is finite, immutable, integer cents and a bounded starter load", () => {
  assert.equal(ITEMS.length, 6);
  assert.ok(Object.isFrozen(ITEMS) && ITEMS.every(Object.isFrozen));
  assert.equal(new Set(ITEMS.map(item => item.id)).size, 6);
  for (const item of ITEMS) {
    assert.ok(Number.isSafeInteger(item.priceCents) && item.priceCents > 0);
    assert.ok(Number.isSafeInteger(item.repairCents) && item.repairCents > 0);
  }
  const state = createEquipment();
  assert.equal(validateEquipment(state), state);
  assert.equal(equipmentModifiers(state).carriedGrams, 1400);
  assert.equal(state.dog, null);
});

test("authoritative artifact mass contributes to the normal load formulas and capacity", () => {
  const gear = createEquipment();
  const plain = equipmentModifiers(gear), loaded = equipmentModifiers(gear, 55);
  assert.equal(loaded.carriedGrams, plain.carriedGrams + 55);
  assert.ok(loaded.speedMultiplier < plain.speedMultiplier);
  assert.ok(loaded.energyMultiplier > plain.energyMultiplier);
  for (const extra of [-1, Infinity, NaN, "55", 0.5, CAPACITY_GRAMS - 1399]) {
    assert.throws(() => equipmentModifiers(gear, extra), /additional inventory load/);
  }
});
test("legacy migration starts at current game minute, no retroactive needs or wear", () => {
  const state = restoreEquipment(undefined, { elapsedMinutes: 1440 });
  assert.equal(state.elapsedMinutes, 1440);
  assert.equal(state.walkedMeters, 0);
  assert.equal(state.dog, null);
  assert.ok(state.items.every(item => item.condition === 100));
  const loaded = restoreEquipment(JSON.parse(JSON.stringify(state)), { elapsedMinutes: 1440 });
  assert.deepEqual(loaded, state);
  loaded.items[0].condition = 1;
  assert.equal(state.items[0].condition, 100);
  assert.throws(() => restoreEquipment(state, { elapsedMinutes: 1441 }), /clocks/);
  for (const value of [null, {}, [], "bad", 1]) assert.throws(() => restoreEquipment(value));
});

test("strict saves reject invalid types, unknown fields, versions, duplicate and overweight items", () => {
  const mutations = [
    state => { state.version = 2; },
    state => { state.revision = 0.5; },
    state => { state.revision = Infinity; },
    state => { state.elapsedMinutes = NaN; },
    state => { state.elapsedMinutes = "0"; },
    state => { state.walkedMeters = -1; },
    state => { state.items[0].condition = 101; },
    state => { state.items[0].condition = null; },
    state => { state.items[0].id = "unknown"; },
    state => { state.items.push({ ...state.items[0] }); },
    state => { state.items.pop(); },
    state => { state.items[0].grams = 0; },
    state => { state.cheat = true; },
    state => { state.dog = {}; },
    state => { state.dog = { hunger: 0, careNeed: -1 }; },
    state => { state.dog = { hunger: 0, careNeed: 0, health: 100 }; },
    state => { state.items = ITEMS.map(item => ({ id: item.id, condition: 100 })); },
  ];
  for (const mutate of mutations) {
    const state = createEquipment();
    mutate(state);
    assert.throws(() => validateEquipment(state));
  }
  for (const elapsedMinutes of [null, -1, Infinity, NaN, "0", 1e20]) {
    assert.throws(() => createEquipment({ elapsedMinutes }));
    assert.throws(() => restoreEquipment(undefined, { elapsedMinutes }));
  }
});

test("purchases consume cents and game time exactly once; ownership cannot stack or farm", () => {
  const state = freeze(createEquipment());
  const before = structuredClone(state);
  const outcome = act(state, "buy", "raincoat");
  assert.equal(outcome.costCents, 2500);
  assert.equal(outcome.walletDeltaCents, -2500);
  assert.equal(outcome.timeMinutes, 10);
  assert.equal(outcome.state.elapsedMinutes, 10);
  assert.equal(outcome.state.revision, 1);
  assert.deepEqual(state, before);
  assert.throws(() => act(outcome.state, "buy", "raincoat"), /unavailable/);
  assert.throws(() => equipmentAction(outcome.state, { type: "buy", itemId: "camera" }, context(state)), /Stale/);
  assert.throws(() => act(state, "buy", "camera", { walletCents: 4999 }), /funds/);
  for (const walletCents of [1.5, -1, Infinity, NaN, "5000"]) {
    assert.throws(() => act(state, "buy", "camera", { walletCents }));
  }
  assert.throws(() => act(state, "buy", "camera", { atShop: false }), /unavailable/);
  assert.throws(() => act(state, "buy", "camera", { elapsedMinutes: 1 }), /context/);
});

test("bag imposes real loadout tradeoffs, discarding is paid in time with no refund", () => {
  let state = createEquipment();
  for (const id of ["tent", "sleepingBag"]) state = act(state, "buy", id).state;
  assert.equal(equipmentModifiers(state).carriedGrams, 5100);
  assert.throws(() => act(state, "buy", "raincoat"), /capacity/);
  assert.throws(() => act(state, "buy", "camera"), /capacity/);
  assert.throws(() => act(state, "discard", "boots"), /Cannot discard/);
  const discarded = act(state, "discard", "tent");
  assert.equal(discarded.costCents, 0);
  assert.equal(discarded.timeMinutes, 5);
  assert.ok(discarded.state.items.every(item => item.id !== "tent"));
  state = act(discarded.state, "buy", "camera").state;
  assert.throws(() => act(state, "buy", "tent"), /capacity/);
  state = act(state, "discard", "camera").state;
  assert.equal(act(state, "buy", "tent").costCents, 6500);
  assert.ok(equipmentModifiers(state).carriedGrams <= CAPACITY_GRAMS);
});

test("weight slows movement and increases energy and fatigue without changing player health", () => {
  const state = createEquipment();
  const light = equipmentModifiers(state);
  const heavy = equipmentModifiers(act(state, "buy", "tent").state);
  assert.ok(heavy.speedMultiplier < light.speedMultiplier);
  assert.ok(heavy.energyMultiplier > light.energyMultiplier);
  assert.ok(heavy.fatigueMultiplier > light.fatigueMultiplier);
  assert.ok(!("health" in heavy) && !("health" in state));
  assert.ok(!("reserveKcal" in heavy));
});

test("wear uses cumulative walking distance, is immutable, clamps and disables broken benefits", () => {
  let state = act(createEquipment(), "buy", "raincoat").state;
  const snapshot = structuredClone(state);
  freeze(state);
  const walked = advance(state, 60, 5000);
  assert.equal(walked.state.items[0].condition, 97);
  assert.equal(walked.wear.find(item => item.id === "boots").lostCondition, 3);
  assert.deepEqual(state, snapshot);
  state = advance(walked.state, 6000, 500000).state;
  assert.ok(state.items.every(item => item.condition === 0));
  const modifiers = equipmentModifiers(state);
  assert.equal(modifiers.carriedGrams, 2000);
  assert.equal(modifiers.rainExposureMultiplier, 1);
  assert.ok(modifiers.speedMultiplier < equipmentModifiers(createEquipment()).speedMultiplier);
  const waited = advance(state, 1440);
  assert.deepEqual(waited.state.items, state.items);
  const repaired = act(state, "repair", "raincoat");
  assert.equal(repaired.costCents, 500);
  assert.equal(repaired.timeMinutes, 30);
  assert.equal(equipmentModifiers(repaired.state).rainExposureMultiplier, 0.65);
  assert.throws(() => act(repaired.state, "repair", "raincoat"), /unavailable/);
});

test("sleeping and photography capabilities are explicit, broken items confer none", () => {
  let state = createEquipment();
  for (const id of ["sleepingBag", "camera"]) state = act(state, "buy", id).state;
  let modifiers = equipmentModifiers(state);
  assert.equal(modifiers.outdoorSleepFatigueMultiplier, 0.8);
  assert.equal(modifiers.photoQualityBonus, 0.1);
  assert.equal(modifiers.hasTent, false);
  state = advance(state, 10000, 1000000).state;
  modifiers = equipmentModifiers(state);
  assert.equal(modifiers.outdoorSleepFatigueMultiplier, 1);
  assert.equal(modifiers.photoQualityBonus, 0);
});

test("progress rejects backwards, nonfinite, stale or walking-without-time updates; idle refresh does nothing", () => {
  const state = advance(createEquipment(), 60, 5000).state;
  for (const patch of [{ elapsedMinutes: 59 }, { walkedMeters: 4999 },
    { elapsedMinutes: NaN }, { walkedMeters: Infinity }, { expectedRevision: 0 },
    { walkedMeters: 6000 }, { elapsedMinutes: 1e20 }]) {
    assert.throws(() => advanceEquipment(state, {
      expectedRevision: state.revision, elapsedMinutes: state.elapsedMinutes, walkedMeters: state.walkedMeters, ...patch,
    }));
  }
  const noOp = advance(state, 0);
  assert.deepEqual(noOp.state, state);
  assert.notEqual(noOp.state, state);
  assert.deepEqual(noOp.wear, []);
});

test("dog encounter is paid once, cannot reset needs through re-adoption", () => {
  const state = createEquipment();
  assert.throws(() => act(state, "adoptDog", undefined, { dogEncounter: false }), /encounter/);
  assert.throws(() => act(state, "adoptDog", undefined, { walletCents: 499 }), /funds/);
  const adopted = act(state, "adoptDog");
  assert.equal(adopted.costCents, 500);
  assert.equal(adopted.timeMinutes, 30);
  assert.equal(equipmentModifiers(adopted.state).dogReady, true);
  assert.throws(() => act(adopted.state, "adoptDog"), /encounter/);
  assert.throws(() => act(adopted.state, "feedDog"), /need/);
});

test("all game time increases dog needs; neglected dog bonuses suspend without injury or healing", () => {
  const initial = freeze(createEquipment({ starterDog: true }));
  const ready = equipmentModifiers(initial);
  assert.equal(ready.clueChanceBonus, 0.08);
  assert.equal(ready.streetMusicIncomeMultiplier, 1.1);
  assert.equal(ready.nightVigilanceMultiplier, 0.9);
  const rested = advance(initial, 360).state;
  assert.deepEqual(rested.dog, { hunger: 24, careNeed: 6 });
  const walked = advance(initial, 360, 10000).state;
  assert.deepEqual(walked.dog, { hunger: 24, careNeed: 14 });
  const hungry = advance(initial, 60 * 17).state;
  const inactive = equipmentModifiers(hungry);
  assert.equal(inactive.dogReady, false);
  assert.equal(inactive.clueChanceBonus, 0);
  assert.equal(inactive.streetMusicIncomeMultiplier, 1);
  assert.equal(inactive.nightVigilanceMultiplier, 1);
  assert.ok(inactive.fatigueMultiplier > ready.fatigueMultiplier);
  const neglected = advance(initial, 60 * 1000, 1000000).state;
  assert.deepEqual(neglected.dog, { hunger: 100, careNeed: 100 });
  assert.ok(!("health" in neglected));
});

test("dog feed/care pay cents and advance decay before bounded relief; no free healing or repeats", () => {
  const state = advance(createEquipment({ starterDog: true }), 1440, 30000).state;
  const fed = act(freeze(state), "feedDog");
  assert.equal(fed.costCents, 150);
  assert.equal(fed.timeMinutes, 10);
  assert.ok(Math.abs(fed.state.dog.hunger - (96 + 4 / 6 - 55)) < 1e-9);
  assert.ok(fed.state.dog.careNeed > state.dog.careNeed);
  const cared = act(fed.state, "careDog");
  assert.equal(cared.costCents, 200);
  assert.equal(cared.timeMinutes, 20);
  assert.equal(cared.state.dog.careNeed, 0);
  assert.throws(() => act(cared.state, "careDog"), /need/);
  assert.throws(() => act(state, "feedDog", undefined, { atShop: false }), /supplies/);
  assert.throws(() => act(state, "careDog", undefined, { walletCents: 199 }), /funds/);
  assert.throws(() => act(createEquipment(), "careDog"), /supplies/);
  assert.equal(equipmentModifiers(cared.state).dogReady, true);
});

test("progress partitions consistently and reload never runs offline decay", () => {
  const state = createEquipment({ starterDog: true });
  const once = advance(state, 120, 10000).state;
  const split = advance(advance(state, 60, 5000).state, 60, 5000).state;
  assert.deepEqual(once.items, split.items);
  assert.deepEqual(once.dog, split.dog);
  assert.deepEqual(restoreEquipment(JSON.parse(JSON.stringify(once)), { elapsedMinutes: once.elapsedMinutes }), once);
});

test("companion benefit threshold is strict and item actions consume dog-care game time", () => {
  const state = createEquipment({ starterDog: true });
  for (const need of ["hunger", "careNeed"]) {
    const near = { ...state, dog: { ...state.dog, [need]: 64.999 } };
    assert.equal(equipmentModifiers(near).dogReady, true);
    const limit = { ...state, dog: { ...state.dog, [need]: 65 } };
    assert.equal(equipmentModifiers(limit).dogReady, false);
  }
  const purchased = act(state, "buy", "camera").state;
  assert.ok(Math.abs(purchased.dog.hunger - 4 / 6) < 1e-9);
  assert.ok(Math.abs(purchased.dog.careNeed - 1 / 6) < 1e-9);
});

test("host transaction composes time and wallet exactly once without touching health rules", () => {
  const initial = {
    elapsedMinutes: 240, walletCents: 10000, health: 100, reserveKcal: 700,
    equipment: createEquipment({ elapsedMinutes: 240, starterDog: true }),
  };
  const before = structuredClone(initial);
  const result = equipmentAction(initial.equipment, { type: "buy", itemId: "raincoat" }, {
    expectedRevision: 0, elapsedMinutes: initial.elapsedMinutes, walletCents: initial.walletCents, atShop: true,
  });
  const next = {
    ...initial, elapsedMinutes: initial.elapsedMinutes + result.timeMinutes,
    walletCents: initial.walletCents + result.walletDeltaCents, equipment: result.state,
  };
  assert.equal(next.elapsedMinutes, next.equipment.elapsedMinutes);
  assert.equal(next.walletCents, 7500);
  assert.equal(next.health, 100);
  assert.equal(next.reserveKcal, 700);
  assert.deepEqual(initial, before);
  assert.throws(() => equipmentAction(next.equipment, { type: "buy", itemId: "raincoat" }, {
    expectedRevision: 0, elapsedMinutes: next.elapsedMinutes, walletCents: next.walletCents, atShop: true,
  }), /Stale/);
  assert.deepEqual(restoreEquipment(next.equipment, { elapsedMinutes: next.elapsedMinutes }), next.equipment);
});

test("unknown actions, payloads and exhausted revisions fail without input mutation", () => {
  const state = freeze(createEquipment());
  for (const action of [null, {}, { type: "heal" }, { type: "buy", itemId: "free" },
    { type: "buy", itemId: "camera", priceCents: 0 }, { type: "adoptDog", dog: {} }]) {
    assert.throws(() => equipmentAction(state, action, context(state)));
  }
  const exhausted = { ...state, revision: Number.MAX_SAFE_INTEGER };
  assert.throws(() => act(exhausted, "adoptDog"), /exhausted/);
  assert.throws(() => advanceEquipment(exhausted, { ...context(exhausted), walkedMeters: 1 }), /exhausted/);
});

test("journey equipment UI uses host actions and safe DOM instead of isolated demo storage", () => {
  const source = readFileSync(new URL("../equipment-ui.mjs", import.meta.url), "utf8");
  assert.match(source, /from "\.\/equipment\.mjs"/);
  assert.doesNotMatch(source, /localStorage|arcane-layer19/);
  assert.doesNotMatch(source, /innerHTML|Date\.now|setInterval|fetch\(/);
  assert.match(source, /fr: \{/);
  assert.match(source, /en: \{/);
  assert.match(source, /setAttribute\("role", "status"\)/);
  assert.match(source, /act\(action\)/);
});
