import { initialJourney, moveJourney } from "./travel.mjs";

export function validateSurvivalConfig(config) {
  const limits = {
    reserve_kcal: [100, 10000], basal_kcal_per_hour: [1, 500],
    meal_kcal: [1, 10000], meal_minutes: [1, 120], sleep_hours: [1, 12],
    sleep_recovery_per_hour: [1, 8], sleep_fatigue_recovery_per_hour: [1, 100],
    sleep_metabolism_factor: [0.1, 1], rest_minutes: [1, 120],
    rest_fatigue_recovery: [1, 100], warning_percent: [1, 99],
    sleep_warning_hours: [1, 48], sleep_limit_hours: [2, 96],
    hunger_speed_penalty: [0, 0.5], sleep_speed_penalty: [0, 0.5],
  };
  if (!config || Object.keys(config).sort().join() !== [...Object.keys(limits), "profiles"].sort().join() ||
    Object.entries(limits).some(([key, [low, high]]) =>
    !Number.isFinite(config[key]) || config[key] < low || config[key] > high) ||
    config.sleep_warning_hours >= config.sleep_limit_hours ||
    !config.profiles || Object.keys(config.profiles).sort().join() !== "balanced,enduring,sturdy") {
    throw new Error("Invalid survival configuration.");
  }
  for (const profile of Object.values(config.profiles)) {
    if (!profile || Object.keys(profile).sort().join() !== "endurance,pace,strength" ||
        Object.values(profile).some(value => !Number.isInteger(value) || value < 1 || value > 5)) {
      throw new Error("Invalid character profile.");
    }
  }
  return config;
}

export function characterProfile(attributes) {
  const { strength, endurance, pace } = attributes;
  if ([strength, endurance, pace].some(value => !Number.isInteger(value) || value < 1 || value > 5)) {
    throw new Error("Character attributes must be integers from 1 to 5.");
  }
  return {
    strength, endurance, pace,
    bodyMassKg: 40 + (strength - 3) * 5,
    baseSpeedKmh: 4.5 * (1 + (pace - 3) * 0.06 + (strength - 3) * 0.025),
    effortFactor: 1 + (pace - 3) * 0.08,
    enduranceFactor: 1 + (endurance - 3) * 0.12,
  };
}

export function normalizeCharacterName(value) {
  if (typeof value !== "string" || /[\u0000-\u001f\u007f-\u009f]/.test(value)) {
    throw new Error("Invalid character name.");
  }
  const name = value.normalize("NFC").trim().replace(/\s+/g, " ");
  if (!name || name.length > 40) throw new Error("Character name must contain 1 to 40 characters.");
  return name;
}

export function startSurvival(col, row, startedAt, profileId, config) {
  validateSurvivalConfig(config);
  if (!Object.hasOwn(config.profiles, profileId)) throw new Error("Unknown character profile.");
  return { ...initialJourney(col, row, startedAt), profileId,
    character: characterProfile(config.profiles[profileId]),
    reserveKcal: config.reserve_kcal, awakeHours: 0, ended: null, meals: 0, sleeps: 0 };
}

export function hungerPercent(state, config) {
  return Math.max(0, Math.min(100, 100 * (1 - state.reserveKcal / config.reserve_kcal)));
}

export function canEat(cell) {
  return cell?.terrain === "place";
}

function ensureActive(state) {
  if (state.ended) throw new Error("This journey has ended. Start a new journey.");
}

function outcome(state) {
  return state.reserveKcal <= 0 ? "hunger" : null;
}

function consume(state, minutes, extraEnergy, config, sleeping = false) {
  const basal = config.basal_kcal_per_hour * state.character.bodyMassKg / 40 *
    minutes / 60 * (sleeping ? config.sleep_metabolism_factor : 1);
  const next = {
    ...state, elapsedMinutes: state.elapsedMinutes + minutes,
    energyKcal: state.energyKcal + basal + extraEnergy,
    reserveKcal: Math.max(0, state.reserveKcal - basal - extraEnergy),
    awakeHours: sleeping
      ? Math.max(0, state.awakeHours - minutes / 60 * config.sleep_recovery_per_hour)
      : state.awakeHours + minutes / 60,
  };
  return { ...next, ended: outcome(next) ??
    (next.awakeHours >= config.sleep_limit_hours ? "sleep" : null) };
}

export function walkSurvival(state, dc, dr, from, to, config) {
  ensureActive(state);
  const hungerPenalty = hungerPercent(state, config) / 100 * config.hunger_speed_penalty;
  const sleepPenalty = Math.max(0, Math.min(1,
    (state.awakeHours - config.sleep_warning_hours) /
    (config.sleep_limit_hours - config.sleep_warning_hours))) * config.sleep_speed_penalty;
  const moving = { ...state, character: { ...state.character,
    baseSpeedKmh: state.character.baseSpeedKmh * (1 - hungerPenalty) * (1 - sleepPenalty) } };
  const moved = moveJourney(moving, dc, dr, from, to);
  const next = consume(state, moved.lastMove.minutes, moved.lastMove.energyKcal, config);
  return { ...next, col: moved.col, row: moved.row, distanceMeters: moved.distanceMeters,
    ascentMeters: moved.ascentMeters, descentMeters: moved.descentMeters,
    fatigue: moved.fatigue, lastMove: moved.lastMove };
}

export function faintSurvival(state, config) {
  validateSurvivalConfig(config);
  if (state.ended === "hunger" || state.fatigue < 100) throw new Error("No fatigue collapse to resolve.");
  return consume({ ...state, ended: null, fatigue: 40, lastMove: null },
    8 * 60, 0, config, true);
}

export function restSurvival(state, config) {
  ensureActive(state);
  return consume({ ...state, fatigue: Math.max(0, state.fatigue - config.rest_fatigue_recovery),
    lastMove: null }, config.rest_minutes, 0, config);
}

export function sleepSurvival(state, config) {
  ensureActive(state);
  return consume({ ...state, fatigue: Math.max(0,
    state.fatigue - config.sleep_hours * config.sleep_fatigue_recovery_per_hour),
  lastMove: null, sleeps: state.sleeps + 1 }, config.sleep_hours * 60, 0, config, true);
}

export function eatSurvival(state, cell, config) {
  ensureActive(state);
  if (!canEat(cell)) throw new Error("Meals are only available in settlement cells.");
  const fed = { ...state, reserveKcal: Math.min(config.reserve_kcal, state.reserveKcal + config.meal_kcal),
    meals: state.meals + 1, lastMove: null };
  return consume(fed, config.meal_minutes, 0, config);
}
