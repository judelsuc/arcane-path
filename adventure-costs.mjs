export const ADVENTURE_COSTS = Object.freeze({
  room: Object.freeze({ minutes: 3, fatigue: 1, health: 0, dirt: 1 }),
  trap: Object.freeze({ minutes: 2, fatigue: 3, health: 5, dirt: 4 }),
  creature: Object.freeze({ minutes: 1, fatigue: 1, health: 2, dirt: 1 }),
  mistake: Object.freeze({ minutes: 2, fatigue: 1, health: 0, dirt: 0 }),
});

export function adventureCosts(metrics) {
  if (!metrics || !Number.isSafeInteger(metrics.roomEntries) || metrics.roomEntries < 1 ||
      metrics.roomEntries > 10000 || !Number.isSafeInteger(metrics.trapHits) ||
      metrics.trapHits < 0 || metrics.trapHits > 10000 ||
      !Array.isArray(metrics.roomsVisited) || !metrics.roomsVisited.length ||
      metrics.roomsVisited.length > metrics.roomEntries ||
      new Set(metrics.roomsVisited).size !== metrics.roomsVisited.length ||
      metrics.roomsVisited.some(room => !["string", "number"].includes(typeof room) ||
        typeof room === "number" && (!Number.isSafeInteger(room) || room < 0) ||
        typeof room === "string" && !room.length)) {
    throw new Error("Invalid adventure room/trap accounting.");
  }

  const mistakes = metrics.wrongAttempts ?? 0;
  if (!Number.isSafeInteger(mistakes) || mistakes < 0 || mistakes > 10000) {
    throw new Error("Invalid adventure encounter accounting.");
  }
  return Object.fromEntries(Object.keys(ADVENTURE_COSTS.room).map(resource => [
    resource, metrics.roomEntries * ADVENTURE_COSTS.room[resource] +
      metrics.trapHits * ADVENTURE_COSTS.trap[resource] +
      mistakes * ADVENTURE_COSTS.mistake[resource],
  ]));
}

export function dungeonCosts(metrics) {
  const costs = adventureCosts(metrics);
  if (!Number.isSafeInteger(metrics.creatureHits) || metrics.creatureHits < 0 || metrics.creatureHits > 10000) {
    throw new Error("Invalid dungeon creature accounting.");
  }
  return Object.fromEntries(Object.keys(costs).map(resource => [
    resource, costs[resource] + metrics.creatureHits * ADVENTURE_COSTS.creature[resource],
  ]));
}

export const encounterCosts = metrics => metrics.creatureHits === undefined ? adventureCosts(metrics) : dungeonCosts(metrics);
