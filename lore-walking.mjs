export function applyLoreWalking(state, moved) {
  const effect = state.lore?.effects;
  const base = moved.lastMove;
  if (!effect) return { moved, effect: null };
  if (![effect.expiresMinutes, effect.remainingMeters].every(Number.isFinite) ||
      effect.expiresMinutes < 0 || effect.remainingMeters < 0 ||
      effect.remainingMeters > 20000) throw new Error("Invalid seven-league stride.");
  if (effect.expiresMinutes <= state.elapsedMinutes || effect.remainingMeters === 0) {
    return { moved, effect: null };
  }
  const ratio = Math.min(1, effect.remainingMeters / base.meters,
    (effect.expiresMinutes - state.elapsedMinutes) / (base.minutes * 0.25));
  const multiplier = 1 - 0.75 * ratio;
  const minutes = base.minutes * multiplier, fatigueGain = base.fatigueGain * multiplier;
  const remainingMeters = Math.max(0, effect.remainingMeters - base.meters * ratio);
  return { moved: { ...moved, elapsedMinutes: state.elapsedMinutes + minutes,
    fatigue: Math.min(100, state.fatigue + fatigueGain),
    lastMove: { ...base, minutes, fatigueGain, energyKcal: base.energyKcal * multiplier,
      speedKmh: base.meters / 1000 / minutes * 60 } },
  effect: remainingMeters > 1e-6 && effect.expiresMinutes > state.elapsedMinutes + minutes
    ? { ...effect, remainingMeters } : null };
}
