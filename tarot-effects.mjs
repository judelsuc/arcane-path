export function tarotEventFactor(state, data) {
  const birth = data.tarot.find(c => c.id === state.birthCard);
  const daily = data.tarot.find(c => c.id === state.dailyCard);
  if (!birth || !daily) throw new Error("Unknown event tarot card.");
  return 0.5 + (birth.nightRisk + daily.nightRisk) / 2;
}

export function tarotEventChance(baseChance, state, data) {
  if (!Number.isFinite(baseChance) || baseChance < 0 || baseChance > 1) {
    throw new Error("Invalid base event probability.");
  }
  return Math.min(1, baseChance * tarotEventFactor(state, data));
}
