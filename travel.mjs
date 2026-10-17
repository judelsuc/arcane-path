export const TRAVEL_MODEL = {
  baseSpeedKmh: 4.5,
  bodyMassKg: 40,
  restMinutes: 30,
  restFatigueRecovery: 20,
  waterFatiguePerCell: 40,
};

const GROUND_COST = {
  plain: 1.1, water: 1.5, road: 1, major_road: 1, rail: 1.15,
  cable: 1.3, cable_station: 1.1, mountain: 1.7, hill: 1.35,
  building: 1.1, forest: 1.35, grass: 1.15, field: 1.25,
  vineyard: 1.3, park: 1.05, church: 1.1, station: 1.1, place: 1.05,
};

export function initialJourney(col, row, startedAt = Date.now()) {
  if (!Number.isInteger(col) || !Number.isInteger(row)) throw new Error("Invalid player position.");
  if (!Number.isFinite(startedAt)) throw new Error("Invalid journey start time.");
  return { col, row, startedAt, mode: "walk", distanceMeters: 0, elapsedMinutes: 0, fatigue: 0,
    energyKcal: 0, ascentMeters: 0, descentMeters: 0, lastMove: null };
}

export function journeyDate(state) {
  return new Date(state.startedAt + state.elapsedMinutes * 60_000);
}

export function travelCost(from, to, meters, fatigue, character = TRAVEL_MODEL) {
  if (!(meters > 0) || !Number.isFinite(meters) || !Number.isFinite(fatigue) ||
      fatigue < 0 || fatigue > 100 || !(from.terrain in GROUND_COST) || !(to.terrain in GROUND_COST)) {
    throw new Error("Invalid travel cost input.");
  }
  const elevationKnown = Number.isFinite(from.elevationMeters) && Number.isFinite(to.elevationMeters);
  const height = elevationKnown ? to.elevationMeters - from.elevationMeters : 0;
  const slope = Math.max(-0.5, Math.min(0.5, height / meters));
  const terrainCost = (GROUND_COST[from.terrain] + GROUND_COST[to.terrain]) / 2;
  const slopeSpeed = Math.exp(-3.5 * (Math.abs(slope + 0.05) - 0.05));
  const speedKmh = Math.max(0.5, Math.min(6, character.baseSpeedKmh * slopeSpeed /
    terrainCost / (1 + fatigue / 100)));
  const minutes = meters / 1000 / speedKmh * 60;
  const ascentMeters = Math.max(0, height), descentMeters = Math.max(0, -height);
  const energyKcal = character.bodyMassKg * (
    0.75 * meters / 1000 * terrainCost + ascentMeters * 0.009 + descentMeters * 0.002
  ) * (1 + fatigue / 200) * (character.effortFactor ?? 1);
  const fatigueGain = (minutes * 0.08 * terrainCost + ascentMeters / 80 + descentMeters / 400) /
    (character.enduranceFactor ?? 1) +
    (to.terrain === "water" ? TRAVEL_MODEL.waterFatiguePerCell * meters / 250 : 0);
  return { meters, minutes, speedKmh, energyKcal, fatigueGain, ascentMeters, descentMeters,
    elevationKnown, terrainCost };
}

export function moveJourney(state, dc, dr, from, to, meters = 250) {
  if (!Number.isInteger(dc) || !Number.isInteger(dr) || Math.abs(dc) + Math.abs(dr) !== 1) {
    throw new Error("Travel requires one orthogonal cell step.");
  }
  const cost = travelCost(from, to, meters, state.fatigue, state.character);
  return {
    ...state, col: state.col + dc, row: state.row + dr,
    distanceMeters: state.distanceMeters + meters, elapsedMinutes: state.elapsedMinutes + cost.minutes,
    fatigue: Math.min(100, state.fatigue + cost.fatigueGain),
    energyKcal: state.energyKcal + cost.energyKcal, ascentMeters: state.ascentMeters + cost.ascentMeters,
    descentMeters: state.descentMeters + cost.descentMeters, lastMove: cost,
  };
}

export function restJourney(state) {
  return {
    ...state, elapsedMinutes: state.elapsedMinutes + TRAVEL_MODEL.restMinutes,
    fatigue: Math.max(0, state.fatigue - TRAVEL_MODEL.restFatigueRecovery),
    energyKcal: state.energyKcal + TRAVEL_MODEL.bodyMassKg * TRAVEL_MODEL.restMinutes / 60,
    lastMove: null,
  };
}

export function chunkPosition(col, row, size = 8) {
  const x = Math.floor(col / size), y = Math.floor(row / size);
  return { x, y, col: col - x * size, row: row - y * size };
}
