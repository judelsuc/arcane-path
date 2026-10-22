import { validateSave, mapIdentity, SAVE_VERSION } from "./journey-save.mjs";
import { normalizeCharacterName, startSurvival } from "./survival.mjs";
import { startEconomy, applyBirthTarot } from "./economy.mjs";

export async function serverJourneyExists(state, fetcher = fetch) {
  if (!state.serverJourney?.id) return false;
  const response = await fetcher(`/api/journeys/${state.serverJourney.id}`, {
    cache: "no-store", signal: AbortSignal.timeout(10000),
  });
  const record = await response.json();
  if (response.status === 404 && record.error === "Server journey not found.") return false;
  if (!response.ok) throw new Error(record.error ?? `Journey lookup HTTP ${response.status}`);
  if (record.state?.serverJourney?.id !== state.serverJourney.id) throw new Error("Invalid server journey lookup.");
  return true;
}

export function validateServerJourney(record, region, map, name) {
  const fail = () => { throw new Error("Invalid server-created journey."); };
  if (!record || record.region !== region || record.version !== 1 ||
      typeof record.mapIdentity !== "string") fail();
  let identity;
  try {
    identity = JSON.stringify(JSON.parse(record.mapIdentity));
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    fail();
  }
  if (identity !== mapIdentity(map)) fail();
  const metadata = record.state?.serverJourney;
  if (!metadata) fail();
  validateSave({ ...record, version: SAVE_VERSION, revision: 1, savedAt: metadata?.createdAt });
  const state = record.state;
  if (state.name !== normalizeCharacterName(name) ||
      Date.parse(metadata.createdAt) !== state.startedAt ||
      state.trail.version !== 2 || state.trail.index !== 0 ||
      state.trail.history.length !== 0 || state.trail.completed) fail();
  const card = record.economy.tarot.findIndex(c => c.id === state.birthCard);
  const expected = applyBirthTarot(startEconomy(startSurvival(
    Math.floor(map.width / 2), Math.floor(map.height / 2), state.startedAt, "balanced",
    record.survival), record.economy, () => (card + 0.5) / 22), record.economy);
  for (const [key, value] of Object.entries(expected)) {
    if (value && typeof value === "object") {
      if (Object.entries(value).some(([k, v]) => state[key]?.[k] !== v)) fail();
    } else if (state[key] !== value) fail();
  }
  return record;
}

export async function createServerJourney(region, map, name, requestId, signal, fetcher = fetch, capability) {
  signal.throwIfAborted();
  const response = await fetcher("/api/journeys", {
    method: "POST",
    headers: { "Content-Type": "application/json",
      ...(capability ? { "X-Journal-Capability": capability } : {}) },
    body: JSON.stringify({ region, name, requestId }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
  });
  if (!(response.headers.get("content-type") ?? "").includes("application/json")) {
    throw new Error("The updated game server is required to create a journey.");
  }
  const record = await response.json();
  if (![200, 201].includes(response.status)) {
    throw new Error(record.error ?? `Journey creation: HTTP ${response.status}`);
  }
  signal.throwIfAborted();
  return validateServerJourney(record, region, map, name);
}
