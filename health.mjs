import { powerCoverage, ordinaryEnergyFactor } from "./lore-effects.mjs";

export const HEALTH = Object.freeze({ maximum: 100, starvationPerHour: 10, sleepRecoveryPerHour: 5 });

export function healthValue(state) {
  return state.health ?? (["hunger", "health", "fatigue", "sleep"].includes(state.ended) ? 0 : HEALTH.maximum);
}

export function migrateHealth(state) {
  return state.health === undefined ? { ...state, health: healthValue(state) } : state;
}

export function applyMetabolism(state, minutes, spentKcal, availableKcal, sleeping = false) {
  if (![minutes, spentKcal, availableKcal].every(n => Number.isFinite(n) && n >= 0)) {
    throw new Error("Invalid health metabolism.");
  }
  const healthBefore = healthValue(state);
  // Energy is spread over the action, including weather and search effort.
  const fedMinutes = spentKcal > 0 ? minutes * Math.min(1, availableKcal / spentKcal)
    : availableKcal > 0 ? minutes : 0;
  const healed = sleeping ? fedMinutes / 60 * HEALTH.sleepRecoveryPerHour : 0;
  const protectedMinutes = powerCoverage({ ...state,
    elapsedMinutes: state.elapsedMinutes - minutes }, "hanged", minutes);
  const damage = Math.max(0, minutes - Math.max(fedMinutes, protectedMinutes)) / 60 * HEALTH.starvationPerHour;
  const health = Math.max(0, Math.min(HEALTH.maximum, healthBefore + healed) - damage);
  return { ...state, health, ended: health <= 0 ? "health" : state.ended,
    metabolism: { minutes, spentKcal, availableKcal, sleeping, healthBefore } };
}

export function spendExtraEnergy(state, extraKcal) {
  if (!Number.isFinite(extraKcal) || extraKcal < 0) throw new Error("Invalid extra energy expenditure.");
  if (state.metabolism?.segments) {
    const metabolism = state.metabolism;
    let next = { ...state, health: metabolism.healthBefore,
      reserveKcal: metabolism.availableKcal, energyKcal: state.energyKcal - metabolism.spentKcal,
      ended: state.ended === "health" ? null : state.ended };
    const segments = [];
    for (const part of metabolism.segments) {
      const spent = extraKcal * part.minutes / metabolism.minutes *
        ordinaryEnergyFactor({ ...state, elapsedMinutes: part.elapsedStart }, part.minutes);
      next = applyMetabolism({ ...next, elapsedMinutes: part.elapsedStart + part.minutes,
        reserveKcal: Math.max(0, next.reserveKcal - part.spentKcal - spent),
        energyKcal: next.energyKcal + part.spentKcal + spent },
      part.minutes, part.spentKcal + spent, next.reserveKcal, part.sleeping);
      segments.push({ ...next.metabolism, elapsedStart: part.elapsedStart });
    }
    return { ...next, metabolism: { ...metabolism, segments,
      spentKcal: segments.reduce((sum, part) => sum + part.spentKcal, 0) } };
  }
  if (state.metabolism) extraKcal *= ordinaryEnergyFactor({ ...state,
    elapsedMinutes: state.elapsedMinutes - state.metabolism.minutes }, state.metabolism.minutes);
  const next = { ...state, energyKcal: state.energyKcal + extraKcal,
    reserveKcal: Math.max(0, state.reserveKcal - extraKcal) };
  if (!state.metabolism) {
    if (extraKcal === 0) return next;
    throw new Error("Energy expenditure requires action metabolism.");
  }
  const m = state.metabolism;
  return applyMetabolism({ ...next, health: m.healthBefore,
    ended: state.ended === "health" ? null : state.ended },
  m.minutes, m.spentKcal + extraKcal, m.availableKcal, m.sleeping);
}

export function validateHealth(state) {
  if (state.health !== undefined && (!Number.isFinite(state.health) || state.health < 0 ||
      state.health > HEALTH.maximum || state.ended === null && state.health <= 0 ||
      state.ended === "health" && state.health !== 0)) throw new Error("Invalid saved health.");
  if (state.ended === "health" && state.health === undefined) throw new Error("Missing saved health.");
  const effect = state.speedEffect;
  if (effect !== undefined && effect !== null && (!Number.isFinite(effect.factor) ||
      effect.factor < 0.5 || effect.factor > 1.5 ||
      !Number.isFinite(effect.expiresMinutes) || effect.expiresMinutes < 0)) {
    throw new Error("Invalid saved speed effect.");
  }
}
