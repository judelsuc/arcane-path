import { ITEMS, CAPACITY_GRAMS } from "./equipment.mjs";
import { LORE_ITEMS, loreItem } from "./lore-catalogue.mjs";
import { restorePlacements } from "./equipment-inventory.mjs";

export function validateArtifactInventory(state) {
  if (state.artifactWorld === undefined) return;
  const cell = point => point && Number.isSafeInteger(point.col) && Number.isSafeInteger(point.row) &&
    Math.abs(point.col) <= 8000 && Math.abs(point.row) <= 8000;
  if (!Array.isArray(state.lore.visitedSettlements) || state.lore.visitedSettlements.length > 256 ||
      state.lore.visitedSettlements.some(visit => !cell(visit) || typeof visit.town !== "string" ||
        !Number.isFinite(visit.observedMinutes) || visit.observedMinutes < 0 ||
        visit.observedMinutes > state.elapsedMinutes)) throw new Error("Invalid artifact settlement history.");
  const compass = state.lore.compass;
  if (compass != null && (!Number.isSafeInteger(compass.stage) || compass.stage < 0 ||
      !Number.isFinite(compass.remainingMinutes) || compass.remainingMinutes <= 0 || compass.remainingMinutes > 180 ||
      ![null, "warmer", "colder", "unchanged", "unavailable"].includes(compass.signal))) {
    throw new Error("Invalid artifact compass.");
  }
  const route = state.lore.route;
  if (route != null && (!Number.isSafeInteger(route.stage) || route.stage < 0 ||
      !Number.isFinite(route.distanceMeters) || route.distanceMeters < 0 ||
      !Number.isFinite(route.walkingMinutes) || route.walkingMinutes < 0 ||
      !Array.isArray(route.points) || !route.points.length || route.points.length > 100000 ||
      route.points.some(point => !Array.isArray(point) || point.length !== 2 ||
        !cell({ col: point[0], row: point[1] })))) throw new Error("Invalid artifact route.");
  const inventory = state.lore.inventory;
  if (!Array.isArray(inventory) || inventory.length > LORE_ITEMS.length ||
      inventory.some(item => !item || !LORE_ITEMS.some(candidate => candidate.id === item.id) ||
        !Number.isFinite(item.cooldownUntil) || item.cooldownUntil < 0) ||
      new Set(inventory.map(item => item.id)).size !== inventory.length) throw new Error("Invalid artifact inventory.");
  const grams = inventory.reduce((total, item) => total + loreItem(item.id).grams, 0);
  if (grams !== state.lore.carriedGrams || grams + state.equipment.items.reduce((total, item) =>
    total + ITEMS.find(candidate => candidate.id === item.id).grams, 0) > CAPACITY_GRAMS) {
    throw new Error("Invalid artifact inventory weight.");
  }
  restorePlacements([...state.equipment.items, ...inventory],
    [...state.equipment.placements, ...inventory.map(item => ({ ...item.placement, id: item.id }))], [...ITEMS, ...LORE_ITEMS]);
}
