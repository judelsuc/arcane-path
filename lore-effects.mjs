const DURATIONS = Object.freeze({
  empress: 720, emperor: 480, strength: 180, hanged: 120,
  nameless: 1440, devil: 1440, tower: 1440, judgement: 1440,
});

export function validateLoreEffects(state) {
  if (!state.lore) return;
  const effects = state.lore.protections;
  if (effects === undefined) return;
  if (!effects || typeof effects !== "object" || Array.isArray(effects)) throw new Error("Invalid artifact effects.");
  for (const [id, effect] of Object.entries(effects)) {
    if (!Object.hasOwn(DURATIONS, id) || !effect || !Number.isFinite(effect.startedMinutes) ||
        effect.startedMinutes < 0 || effect.startedMinutes > state.elapsedMinutes ||
        effect.expiresMinutes !== effect.startedMinutes + DURATIONS[id] ||
        id === "emperor" && (!Number.isSafeInteger(effect.col) || !Number.isSafeInteger(effect.row)) ||
        id === "judgement" && (!TAROT_CARDS.includes(effect.card) || !TAROT_CARDS.includes(effect.naturalCard)) ||
        id === "nameless" && (!Number.isSafeInteger(effect.marker?.col) || !Number.isSafeInteger(effect.marker?.row))) {
      throw new Error("Invalid artifact effect.");
    }
  }
}

export function activePower(state, id, minute = state.elapsedMinutes) {
  validateLoreEffects(state);
  const effect = state.lore?.protections?.[id];
  return effect && effect.startedMinutes <= minute && minute < effect.expiresMinutes ? effect : null;
}

export function powerCoverage(state, id, minutes) {
  if (!Number.isFinite(minutes) || minutes < 0) throw new Error("Invalid artifact effect duration.");
  const effect = activePower(state, id);
  return effect ? Math.min(minutes, Math.max(0, effect.expiresMinutes - state.elapsedMinutes)) : 0;
}

export function armPower(state, id, extra = {}) {
  if (!Object.hasOwn(DURATIONS, id)) throw new Error("Unknown timed artifact.");
  const next = { ...state, lore: { ...state.lore, protections: {
    ...(state.lore.protections ?? {}),
    [id]: { startedMinutes: state.elapsedMinutes,
      expiresMinutes: state.elapsedMinutes + DURATIONS[id], ...extra },
  } } };
  validateLoreEffects(next);
  return next;
}

export function cancelPower(state, id) {
  const protections = { ...state.lore.protections };
  delete protections[id];
  return { ...state, lore: { ...state.lore, protections } };
}

export function ordinaryEnergyFactor(state, minutes) {
  if (!minutes) return 1;
  const stasis = powerCoverage(state, "hanged", minutes);
  const feast = powerCoverage(state, "empress", minutes);
  return (minutes - stasis - Math.max(0, feast - stasis) * 0.75) / minutes;
}

export function protectedFatigue(state, minutes, gain) {
  const protectedMinutes = Math.max(powerCoverage(state, "hanged", minutes), powerCoverage(state, "strength", minutes));
  return gain * (minutes ? 1 - protectedMinutes / minutes : 1);
}
import { TAROT_CARDS } from "./tarot-cards.mjs";
