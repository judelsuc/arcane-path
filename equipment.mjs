import { firstPlacement, restorePlacements, fits } from "./equipment-inventory.mjs";
import { activePower, powerCoverage } from "./lore-effects.mjs";

const MAX_MINUTES = 52_560_000;
const MAX_METERS = 10_000_000_000;
export const CAPACITY_GRAMS = 5500;

const catalogue = [
  { id: "boots", slot: "feet", footprint: [2, 1], grams: 800, priceCents: 4500, repairCents: 900, wearPerKm: 0.6, essential: true },
  { id: "backpack", slot: "back", footprint: [2, 3], grams: 600, priceCents: 3000, repairCents: 600, wearPerKm: 0.2, essential: true },
  { id: "raincoat", slot: "body", footprint: [2, 3], grams: 600, priceCents: 2500, repairCents: 500, wearPerKm: 0.25 },
  { id: "sleepingBag", footprint: [1, 3], grams: 1100, priceCents: 4000, repairCents: 800, wearPerKm: 0.2 },
  { id: "tent", footprint: [3, 3], grams: 2600, priceCents: 6500, repairCents: 1300, wearPerKm: 0.3 },
  { id: "camera", footprint: [2, 1], grams: 450, priceCents: 5000, repairCents: 1000, wearPerKm: 0.35 },
];
export const ITEMS = Object.freeze(catalogue.map(item => Object.freeze({ ...item, footprint: Object.freeze(item.footprint) })));
const byId = new Map(ITEMS.map(item => [item.id, item]));
const fail = message => { throw new Error(message); };
const number = (value, max) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max;
const integer = (value, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= 0 && value <= max;
const keys = (value, expected) => value !== null && typeof value === "object" &&
  !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype &&
  Object.keys(value).sort().join(",") === [...expected].sort().join(",");
const clamp = value => Math.max(0, Math.min(100, value));
const weight = state => state.items.reduce((sum, item) => sum + byId.get(item.id).grams, 0);
export function companionName(value) {
  if (typeof value !== "string" || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) fail("Invalid companion name.");
  const name = value.trim().normalize("NFC");
  if (!name || [...name].length > 40) fail("Companion name must contain 1 to 40 characters.");
  return name;
}

export function createEquipment({ elapsedMinutes = 0, starterDog = false } = {}) {
  if (!number(elapsedMinutes, MAX_MINUTES) || typeof starterDog !== "boolean") fail("Invalid equipment start.");
  return {
    version: 1, revision: 0, elapsedMinutes, walkedMeters: 0,
    items: ["boots", "backpack"].map(id => ({ id, condition: 100 })),
    placements: [],
    dogEncounter: null,
    dog: starterDog ? { hunger: 0, careNeed: 0 } : null,
  };
}

export function validateEquipment(state) {
  if (!keys(state, ["version", "revision", "elapsedMinutes", "walkedMeters", "items", "dog",
    ...(Object.hasOwn(state ?? {}, "placements") ? ["placements"] : []),
    ...(Object.hasOwn(state ?? {}, "dogEncounter") ? ["dogEncounter"] : [])]) ||
      state.version !== 1 || !integer(state.revision) ||
      !number(state.elapsedMinutes, MAX_MINUTES) || !number(state.walkedMeters, MAX_METERS) ||
      !Array.isArray(state.items) || state.items.length < 2 || state.items.length > ITEMS.length) {
    fail("Invalid equipment save.");
  }
  const seen = new Set();
  for (const item of state.items) {
    if (!keys(item, ["id", "condition"]) || !byId.has(item.id) ||
        seen.has(item.id) || !number(item.condition, 100)) fail("Invalid equipment item.");
    seen.add(item.id);
  }
  if (!seen.has("boots") || !seen.has("backpack") || weight(state) > CAPACITY_GRAMS) fail("Invalid equipment load.");
  restorePlacements(state.items, state.placements, ITEMS);
  if (state.dogEncounter !== undefined && ![null, "pending", "declined", "adopted"].includes(state.dogEncounter)) fail("Invalid companion encounter.");
  if ((state.dog && state.dogEncounter === "pending") || (!state.dog && state.dogEncounter === "adopted")) fail("Invalid companion encounter outcome.");
  if (state.dog !== null && (!keys(state.dog, ["hunger", "careNeed",
    ...(Object.hasOwn(state.dog, "name") ? ["name"] : [])]) ||
      !number(state.dog.hunger, 100) || !number(state.dog.careNeed, 100))) fail("Invalid companion save.");
  if (state.dog?.name !== undefined && companionName(state.dog.name) !== state.dog.name) fail("Invalid companion name.");
  return state;
}

// Only a missing field is legacy. Null or malformed equipment is never reset.
export function restoreEquipment(saved, { elapsedMinutes = 0 } = {}) {
  if (!number(elapsedMinutes, MAX_MINUTES)) fail("Invalid journey clock.");
  if (saved === undefined) return createEquipment({ elapsedMinutes });
  validateEquipment(saved);
  if (saved.elapsedMinutes !== elapsedMinutes) fail("Equipment and journey clocks differ.");
  return { ...structuredClone(saved), placements: restorePlacements(saved.items, saved.placements, ITEMS) };
}

export function equipmentModifiers(state, additionalGrams = 0) {
  validateEquipment(state);
  if (!integer(additionalGrams, CAPACITY_GRAMS) || weight(state) + additionalGrams > CAPACITY_GRAMS) {
    fail("Invalid additional inventory load.");
  }
  const active = id => state.items.some(item => item.id === id && item.condition > 0);
  const grams = weight(state) + additionalGrams;
  const load = grams / 1000;
  const dogReady = state.dog !== null && state.dog.hunger < 65 && state.dog.careNeed < 65;
  return {
    carriedGrams: grams,
    remainingGrams: CAPACITY_GRAMS - grams,
    speedMultiplier: Math.max(0.65, (1 - load * 0.025) * (active("boots") ? 1 : 0.85)),
    energyMultiplier: 1 + load * 0.04,
    fatigueMultiplier: (1 + load * 0.06) * (dogReady ? 0.95 : 1),
    rainExposureMultiplier: active("raincoat") ? 0.65 : 1,
    outdoorSleepFatigueMultiplier: active("sleepingBag") ? 0.8 : 1,
    hasTent: active("tent"),
    photoQualityBonus: active("camera") ? 0.1 : 0,
    clueChanceBonus: dogReady ? 0.08 : 0,
    streetMusicIncomeMultiplier: dogReady ? 1.1 : 1,
    nightVigilanceMultiplier: dogReady ? 0.9 : 1,
    dogReady,
  };
}

export function journeyEquipmentModifiers(state) {
  if (state.equipment !== undefined) {
    const modifiers = equipmentModifiers(state.equipment, state.lore?.carriedGrams ?? 0);
    if (!activePower(state, "devil")) return modifiers;
    return { ...modifiers,
      speedMultiplier: state.equipment.items.some(item => item.id === "boots" && item.condition > 0) ? 1 : 0.85,
      energyMultiplier: 1, fatigueMultiplier: modifiers.dogReady ? 0.95 : 1 };
  }
  return { carriedGrams: 0, remainingGrams: CAPACITY_GRAMS, speedMultiplier: 1,
    energyMultiplier: 1, fatigueMultiplier: 1, rainExposureMultiplier: 1,
    outdoorSleepFatigueMultiplier: 1, hasTent: false, photoQualityBonus: 0,
    clueChanceBonus: 0, streetMusicIncomeMultiplier: 1, nightVigilanceMultiplier: 1,
    dogReady: false };
}

export function beginEquipment(state) {
  return { ...state, equipment: restoreEquipment(state.equipment, { elapsedMinutes: state.elapsedMinutes }) };
}

export function syncJourneyEquipment(previous, next) {
  if (previous.equipment === undefined) return next;
  const slice = previous.equipment;
  if (slice.elapsedMinutes !== previous.elapsedMinutes) fail("Equipment and journey clocks differ.");
  const updated = advanceEquipment(slice, {
    expectedRevision: slice.revision, elapsedMinutes: next.elapsedMinutes,
    walkedMeters: slice.walkedMeters + next.distanceMeters - previous.distanceMeters,
  }).state;
  const duration = next.elapsedMinutes - previous.elapsedMinutes;
  const meters = next.distanceMeters - previous.distanceMeters;
  const protectedMeters = next.lastMove?.protectedWearMeters;
  if (protectedMeters !== undefined && (!Number.isFinite(protectedMeters) || protectedMeters < 0 ||
      protectedMeters > meters)) throw new Error("Invalid artifact equipment-wear allowance.");
  const fraction = meters > 0 && protectedMeters !== undefined ? protectedMeters / meters
    : duration > 0 ? powerCoverage(previous, "devil", duration) / duration : 0;
  return { ...next, equipment: { ...updated, items: updated.items.map(item => {
    const before = slice.items.find(old => old.id === item.id);
    return { ...item, condition: item.condition + (before.condition - item.condition) * fraction };
  }) } };
}

function checkRevision(state, expectedRevision) {
  validateEquipment(state);
  if (!integer(expectedRevision) || expectedRevision !== state.revision) fail("Stale equipment action.");
  if (state.revision === Number.MAX_SAFE_INTEGER) fail("Equipment revision exhausted.");
}

function progress(state, elapsedMinutes, walkedMeters) {
  const hours = (elapsedMinutes - state.elapsedMinutes) / 60;
  const km = (walkedMeters - state.walkedMeters) / 1000;
  const wear = state.items.map(item => {
    const condition = clamp(item.condition - byId.get(item.id).wearPerKm * km);
    return { id: item.id, condition, lostCondition: item.condition - condition };
  });
  return {
    state: {
      ...state, elapsedMinutes, walkedMeters,
      dogEncounter: state.dogEncounter ?? null,
      items: wear.map(({ id, condition }) => ({ id, condition })),
      dog: state.dog === null ? null : {
        ...state.dog,
        hunger: clamp(state.dog.hunger + hours * 4),
        careNeed: clamp(state.dog.careNeed + hours + km * 0.8),
      },
    },
    wear,
  };
}

export function advanceEquipment(state, { expectedRevision, elapsedMinutes, walkedMeters }) {
  checkRevision(state, expectedRevision);
  if (!number(elapsedMinutes, MAX_MINUTES) || elapsedMinutes < state.elapsedMinutes ||
      !number(walkedMeters, MAX_METERS) || walkedMeters < state.walkedMeters ||
      (elapsedMinutes === state.elapsedMinutes && walkedMeters !== state.walkedMeters)) fail("Invalid equipment progress.");
  if (elapsedMinutes === state.elapsedMinutes && walkedMeters === state.walkedMeters) {
    return { state: structuredClone(state), wear: [], modifiers: equipmentModifiers(state) };
  }
  const result = progress(state, elapsedMinutes, walkedMeters);
  result.state.revision++;
  return { ...result, modifiers: equipmentModifiers(result.state) };
}

export function equipmentAction(state, action, context) {
  const { expectedRevision, elapsedMinutes, walletCents, atShop = false, dogEncounter = false } = context;
  checkRevision(state, expectedRevision);
  if (elapsedMinutes !== state.elapsedMinutes || !integer(walletCents) ||
      typeof atShop !== "boolean" || typeof dogEncounter !== "boolean" ||
      !keys(action, (action?.type === "adoptDog" && Object.hasOwn(action, "name")) || action?.type === "nameDog" ? ["type", "name"]
        : action?.type === "move" ? ["type", "itemId", "x", "y", "rotated"]
        : action?.type === "buy" || action?.type === "repair" || action?.type === "discard"
        ? ["type", "itemId"] : ["type"])) fail("Invalid equipment action context.");
  const placements = restorePlacements(state.items, state.placements, ITEMS);
  if (action.type === "declineDog" || action.type === "nameDog") {
    if (action.type === "declineDog" ? state.dogEncounter !== "pending" : state.dog === null) {
      fail("No companion encounter or companion.");
    }
    const next = action.type === "declineDog"
      ? { ...state, dogEncounter: "declined", revision: state.revision + 1 }
      : { ...state, dog: { ...state.dog, name: companionName(action.name) }, revision: state.revision + 1 };
    validateEquipment(next);
    return { state: next, costCents: 0, walletDeltaCents: 0, timeMinutes: 0,
      wear: [], modifiers: equipmentModifiers(next) };
  }
  if (action.type === "move") {
    const item = byId.get(action.itemId);
    const candidate = { id: action.itemId, x: action.x, y: action.y, rotated: action.rotated };
    if (!item || item.slot || !placements.some(p => p.id === item.id) ||
        !fits(placements, item, candidate, ITEMS)) fail("Invalid inventory move.");
    const next = { ...state, placements: placements.map(p => p.id === item.id ? candidate : p),
      revision: state.revision + 1 };
    validateEquipment(next);
    return { state: next, costCents: 0, walletDeltaCents: 0, timeMinutes: 0,
      wear: [], modifiers: equipmentModifiers(next) };
  }
  let costCents = 0, timeMinutes = 0;
  let update;
  if (["buy", "repair", "discard"].includes(action.type)) {
    const item = byId.get(action.itemId);
    if (!item) fail("Unknown equipment item.");
    const owned = state.items.find(entry => entry.id === item.id);
    if (action.type === "buy") {
      if (!atShop || owned) fail("Item unavailable.");
      if (weight(state) + item.grams > CAPACITY_GRAMS) fail("Bag capacity exceeded.");
      const placement = item.slot ? null : firstPlacement(placements, item, ITEMS);
      costCents = item.priceCents; timeMinutes = 10;
      update = next => ({ ...next, items: [...next.items, { id: item.id, condition: 100 }],
        placements: placement ? [...placements, placement] : placements });
    } else if (action.type === "repair") {
      if (!atShop || !owned || owned.condition > 80) fail("Repair unavailable.");
      costCents = item.repairCents; timeMinutes = 30;
      update = next => ({ ...next, items: next.items.map(entry => entry.id === item.id ? { ...entry, condition: 100 } : entry) });
    } else {
      if (!owned || item.essential) fail("Cannot discard this item.");
      timeMinutes = 5;
      update = next => ({ ...next, items: next.items.filter(entry => entry.id !== item.id),
        placements: placements.filter(p => p.id !== item.id) });
    }
  } else if (action.type === "adoptDog") {
    if (state.dog !== null || !dogEncounter) fail("No companion encounter.");
    costCents = 500; timeMinutes = 30;
    const name = action.name === undefined ? undefined : companionName(action.name);
    update = next => ({ ...next, dogEncounter: "adopted",
      dog: { hunger: 15, careNeed: 15, ...(name ? { name } : {}) } });
  } else if (action.type === "feedDog" || action.type === "careDog") {
    if (state.dog === null || !atShop) fail("Companion supplies unavailable.");
    const feeding = action.type === "feedDog";
    const need = feeding ? "hunger" : "careNeed";
    if (state.dog[need] < 20) fail("Companion does not need this yet.");
    costCents = feeding ? 150 : 200; timeMinutes = feeding ? 10 : 20;
    update = next => ({ ...next, dog: { ...next.dog, [need]: clamp(next.dog[need] - (feeding ? 55 : 65)) } });
  } else fail("Unknown equipment action.");
  if (walletCents < costCents) fail("Insufficient funds.");
  if (state.elapsedMinutes + timeMinutes > MAX_MINUTES) fail("Equipment clock exhausted.");
  const advanced = progress(state, state.elapsedMinutes + timeMinutes, state.walkedMeters);
  const next = { ...update(advanced.state), revision: state.revision + 1 };
  validateEquipment(next);
  return {
    state: next, costCents, walletDeltaCents: -costCents, timeMinutes,
    wear: advanced.wear, modifiers: equipmentModifiers(next),
  };
}
