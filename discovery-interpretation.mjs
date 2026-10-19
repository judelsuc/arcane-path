import { discoveryEntries, discoveryIdentity } from "./discovery.mjs";
import { hospitalityTown } from "./hospitality.mjs";
import { journeyDate } from "./travel.mjs";
import { socialFailureChance, sympathy } from "./pressures.mjs";
import { marketPrice, tarotEventChance } from "./economy.mjs";

export function validateInterpretations(state) {
  const permissions = state.lore?.interpretations;
  if (permissions === undefined) return;
  if (!Array.isArray(permissions)) throw new Error("Invalid clue interpretation permissions.");
  const identities = new Set(discoveryEntries(state).map(discoveryIdentity)), seen = new Set();
  for (const permission of permissions) {
    if (!permission || Object.keys(permission).sort().join() !== "evidence,observedMinutes,source" ||
        !identities.has(permission.evidence) || seen.has(permission.evidence) ||
        !["npc", "hermit", "power"].includes(permission.source) ||
        !Number.isFinite(permission.observedMinutes) || permission.observedMinutes < 0 ||
        permission.observedMinutes > state.elapsedMinutes) {
      throw new Error("Invalid clue interpretation permission.");
    }
    seen.add(permission.evidence);
  }
}

export function plainGuidancePermitted(state, entry) {
  return (state.lore?.interpretations ?? []).some(permission =>
    permission.evidence === discoveryIdentity(entry));
}

export function grantInterpretation(state, entry, source) {
  validateInterpretations(state);
  if (!state.lore || !["npc", "hermit", "power"].includes(source) ||
      !discoveryEntries(state).some(known => discoveryIdentity(known) === discoveryIdentity(entry)) ||
      entry.kind === "inscription") throw new Error("Cannot interpret unknown or unsupported evidence.");
  if (plainGuidancePermitted(state, entry)) return state;
  const next = { ...state, lore: { ...state.lore, interpretations: [
    ...(state.lore.interpretations ?? []),
    { evidence: discoveryIdentity(entry), source, observedMinutes: state.elapsedMinutes },
  ] } };
  validateInterpretations(next);
  return next;
}

// One stable encounter per settlement/day, shared by all clues: no refresh or clue-selection rerolls.
function encounterDraw(state, town, day) {
  const identity = JSON.stringify(["clue-interpreter-v1", state.serverJourney?.seed ?? state.startedAt,
    town.osmId, day]);
  let hash = 2166136261;
  for (const char of identity) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return hash / 2 ** 32;
}

export function interpretationOffer(state, cell, info, economy) {
  const town = hospitalityTown(cell);
  if (state.ended || !town) return {
    status: state.ended ? "ended" : "outside", available: false, minutes: 0, cents: 0,
  };
  const day = journeyDate(state).toISOString().slice(0, 10);
  const chance = 1 - socialFailureChance(tarotEventChance(0.35, state, economy), state);
  const draw = encounterDraw(state, town, day);
  if (draw >= chance) return { status: "refused", available: false, minutes: 0, cents: 0 };
  const standing = sympathy(state);
  const free = standing >= 65 || draw < chance * 0.25;
  const cents = free ? 0 : marketPrice(cell, 0.25 * (1 + (50 - standing) / 100), economy, info).cents;
  return { status: state.walletCents < cents ? "unaffordable" : free ? "free" : "paid",
    available: state.walletCents >= cents, minutes: 10, cents };
}
