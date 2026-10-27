import { advanceEquipment } from "./equipment.mjs";
import { restSurvival } from "./survival.mjs";
import { finishAction } from "./economy.mjs";

export const CARVE_MINUTES = 20;
export const KNIFE_WEAR = 2;
export const MAX_INSCRIPTION = 100;
const SURFACES = Object.freeze({ forest: "tree", place: "wall" });

export function inscriptionSurface(cell) {
  return cell && !cell.unavailable ? SURFACES[cell.terrain] ?? null : null;
}

export function usableKnife(state) {
  return Boolean(state?.equipment?.items?.some(item => item.id === "knife" && item.condition > 0));
}

export function carvingBlocker(state, cell) {
  if (!inscriptionSurface(cell)) return "surface";
  if (!state?.serverJourney?.id || !state.journalAccess) return "offline";
  if (state.ended || state.performancePending || state.cafePending || state.theftPending ||
      state.miniGamePending || state.events?.pending || state.equipment?.dogEncounter === "pending") return "busy";
  if (!usableKnife(state)) return "knife";
  return null;
}

export function inscriptionText(value) {
  if (typeof value !== "string") throw new Error("An inscription must be text.");
  const text = value.normalize("NFC").trim();
  if (!text || [...text].length > MAX_INSCRIPTION) {
    throw new Error(`An inscription must contain 1 to ${MAX_INSCRIPTION} characters.`);
  }
  if (/\p{C}/u.test(text)) throw new Error("An inscription must be a single line of plain text.");
  return text;
}

export function journeyCarve(state, cell, info, survival, economy) {
  const blocker = carvingBlocker(state, cell);
  if (blocker) throw new Error(`Carving unavailable: ${blocker}.`);
  const timed = restSurvival(state, { ...survival, rest_minutes: CARVE_MINUTES, rest_fatigue_recovery: 0 });
  const next = finishAction(state, timed, info, economy, { survival });
  const equipment = advanceEquipment(state.equipment, {
    expectedRevision: state.equipment.revision, elapsedMinutes: next.elapsedMinutes,
    walkedMeters: state.equipment.walkedMeters,
  }).state;
  return { ...next, equipment: { ...equipment, items: equipment.items.map(item =>
    item.id === "knife" ? { ...item, condition: Math.max(0, item.condition - KNIFE_WEAR) } : item) } };
}

export function createInscriptionsClient({ fetcher = fetch } = {}) {
  return async function request(state, action, details = {}, signal) {
    if (!state?.serverJourney?.id || !state.journalAccess) {
      throw new Error("A server journey and private capability are required for inscriptions.");
    }
    const response = await fetcher("/api/inscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Journal-Capability": state.journalAccess },
      body: JSON.stringify({ journey: state.serverJourney.id,
        location: { col: state.col, row: state.row }, action, ...details }),
      signal: AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(10000)]),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? `Inscriptions HTTP ${response.status}`);
    if (!["tree", "wall"].includes(result.surface) || !Array.isArray(result.inscriptions) ||
        result.inscriptions.length > 4 || !Number.isSafeInteger(result.remainingToday)) {
      throw new Error("Invalid inscriptions response.");
    }
    return result;
  };
}
