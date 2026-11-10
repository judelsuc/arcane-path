import { validateReward } from "./legend-rewards.mjs";

const townIdentity = /^(?:node|way|relation)\/[1-9]\d{0,19}$/;

export function townLegendIdentity(cell) {
  if (!cell || cell.unavailable || cell.terrain !== "place") return null;
  return (cell.settlements ?? []).filter(place => typeof place?.osmId === "string" &&
    townIdentity.test(place.osmId) && typeof place.name === "string" && place.name.trim() &&
    place.name.length <= 200).sort((a, b) => a.osmId.localeCompare(b.osmId))[0]?.osmId ?? null;
}
function validateEntry(entry) {
  if (!entry || !townIdentity.test(entry.townId) || typeof entry.town !== "string" ||
      !entry.town.trim() || entry.town.length > 200 || typeof entry.eligible !== "boolean" ||
      (entry.eligible ? !Number.isSafeInteger(entry.seed) || entry.seed < 0 || entry.seed > 0xffffffff ||
        !["platform", "investigation"].includes(entry.format) || entry.contentStatus !== "unprepared"
        : entry.seed !== null || entry.format !== null || entry.contentStatus !== "none")) {
    throw new Error("Invalid retained town legend entry.");
  }
  if (entry.reward !== undefined) {
    if (!entry.eligible) throw new Error("An ineligible town cannot retain a treasure.");
    validateReward(entry.reward, entry.seed);
  }
  if (entry.exploration !== undefined) {
    const search = entry.exploration;
    if (!entry.eligible || !["pending", "searching", "found"].includes(search?.status) ||
        (search.status === "pending" ? search.clues !== null : !bilingual(search.clues, true)) ||
        !Array.isArray(search.observations) || search.observations.length > 48 ||
        search.status === "pending" && search.observations.length !== 0 ||
        search.observations.some(observation => !location(observation) ||
          !bilingual(observation.description) || typeof observation.found !== "boolean") ||
        new Set(search.observations.map(item => `${item.col},${item.row}`)).size !== search.observations.length ||
        search.observations.filter(item => item.found).length !== (search.status === "found" ? 1 : 0)) {
      throw new Error("Invalid retained adventure search.");
    }
  }
}

const location = value => value && ["col", "row"].every(key =>
  Number.isSafeInteger(value[key]) && value[key] >= -8000 && value[key] <= 8007);
function bilingual(value, clues = false) {
  const text = item => typeof item === "string" && item.trim() && item.length <= 2000;
  return value && ["en", "fr"].every(language => clues
    ? Array.isArray(value[language]) && value[language].length === 3 && value[language].every(text)
    : text(value[language]));
}

export function createTownLegendsClient({ fetcher = fetch } = {}) {
  async function send(state, action, details, signal) {
    if (!state?.serverJourney?.id || !state.journalAccess) throw new Error("A private server journey is required for town legends.");
    const response = await fetcher("/api/town-legends", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Journal-Capability": state.journalAccess },
      body: JSON.stringify({ journey: state.serverJourney.id, action, ...details }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? `Town legends HTTP ${response.status}`);
    if (result?.version !== 1) throw new Error("Invalid town legend response version.");
    if (action === "discover" || action === "inspect") validateEntry(result.entry);
    else if (action === "look") {
      if (!Array.isArray(result.observations) || result.observations.length > 100 ||
          result.observations.some(item => !townIdentity.test(item?.townId) ||
            typeof item.town !== "string" || !item.town.trim() || item.town.length > 200 ||
            !location(item.location) || item.location.col !== details.target.col || item.location.row !== details.target.row ||
            !bilingual(item.description) || typeof item.matches !== "boolean" ||
            typeof item.found !== "boolean" || item.found && !item.matches ||
            item.contextual !== undefined && (typeof item.contextual !== "boolean" ||
              item.contextual && (item.matches || item.found))) ||
          new Set(result.observations.map(item => item.townId)).size !== result.observations.length) {
        throw new Error("Invalid adventure look response.");
      }
      for (const item of result.observations) if (item.matches) {
        validateEntry(item.entry);
        if (item.entry.townId !== item.townId || !item.entry.exploration?.clues ||
            (item.entry.exploration.status === "found") !== item.found) {
          throw new Error("Invalid matching entrance response.");
        }
      }
    } else {
      if (!Array.isArray(result.entries) || result.entries.length > 30 ||
          new Set(result.entries.map(entry => entry?.townId)).size !== result.entries.length ||
          result.cursor !== null && (!townIdentity.test(result.cursor) ||
            result.cursor !== result.entries.at(-1)?.townId)) throw new Error("Invalid town legend history.");
      result.entries.forEach(validateEntry);
    }
    return result;
  }
  return {
    discover: (state, signal) => send(state, "discover", { location: { col: state.col, row: state.row } }, signal),
    list: (state, cursor = null, signal) => send(state, "list", { cursor }, signal),
    look: (state, target, signal) => send(state, "look", { location: { col: state.col, row: state.row }, target }, signal),
    inspect: (state, townId, signal) => send(state, "inspect", {
      location: { col: state.col, row: state.row }, townId,
    }, signal),
  };
}
