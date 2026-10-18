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
  const damage = (minutes - fedMinutes) / 60 * HEALTH.starvationPerHour;
  const health = Math.max(0, Math.min(HEALTH.maximum, healthBefore + healed) - damage);
  return { ...state, health, ended: health <= 0 ? "health" : state.ended,
    metabolism: { minutes, spentKcal, availableKcal, sleeping, healthBefore } };
}

export function spendExtraEnergy(state, extraKcal) {
  if (!Number.isFinite(extraKcal) || extraKcal < 0) throw new Error("Invalid extra energy expenditure.");
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
