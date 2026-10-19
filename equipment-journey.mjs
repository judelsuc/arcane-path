import { equipmentAction, advanceEquipment, companionName } from "./equipment.mjs";
import { restSurvival } from "./survival.mjs";
import { finishAction } from "./economy.mjs";

export function equipmentShopAvailable(cell) {
  return Boolean(cell && !cell.unavailable && cell.terrain === "place");
}

export function journeyEquipmentAction(state, action, cell, info, survival, economy) {
  if (state.ended || state.performancePending || state.cafePending || state.theftPending ||
      state.miniGamePending || state.events?.pending) throw new Error("Another journey action is active.");
  if (!state.equipment) throw new Error("Equipment has not been initialized.");
  if (state.equipment.dogEncounter === "pending" && !["adoptDog", "declineDog"].includes(action.type)) {
    throw new Error("Choose whether to adopt the dog first.");
  }
  if (action.type === "adoptDog") companionName(action.name);
  const outcome = equipmentAction(state.equipment, action, {
    expectedRevision: state.equipment.revision, elapsedMinutes: state.elapsedMinutes,
    walletCents: state.walletCents, atShop: equipmentShopAvailable(cell),
    dogEncounter: state.equipment.dogEncounter === "pending",
  });
  if (!outcome.timeMinutes) return { ...state, equipment: outcome.state };
  const paid = { ...state, walletCents: state.walletCents + outcome.walletDeltaCents,
    lastExpenseCents: outcome.costCents };
  const timed = restSurvival(paid, { ...survival,
    rest_minutes: outcome.timeMinutes, rest_fatigue_recovery: 0 });
  const next = finishAction(state, timed, info, economy, { survival });
  return { ...next, equipment: advanceEquipment(outcome.state, {
    expectedRevision: outcome.state.revision, elapsedMinutes: next.elapsedMinutes,
    walkedMeters: outcome.state.walkedMeters,
  }).state };
}
