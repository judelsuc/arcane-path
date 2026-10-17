import { publicPlace } from "./towns.mjs";
import { restSurvival } from "./survival.mjs";
import { finishAction, didFaint } from "./economy.mjs";
import { distanceMeters } from "./cell-content.mjs";
import { chunkPosition } from "./travel.mjs";
import { validateParentStory, parentReunion } from "./parent-story.mjs";

const PARENTS = ["Camille", "Alex", "Sacha", "Noa"];
export const TRAIL_STAGES = 10;

export function validateTownTrail(trail) {
  const fail = () => { throw new Error("Invalid town-to-town trail."); };
  const point = p => p && Number.isFinite(p.latitude) && Math.abs(p.latitude) <= 85 &&
    Number.isFinite(p.longitude) && Math.abs(p.longitude) <= 180 &&
    Number.isSafeInteger(p.col) && Number.isSafeInteger(p.row) &&
    Math.abs(chunkPosition(p.col, p.row).x) <= 1000 &&
    Math.abs(chunkPosition(p.col, p.row).y) <= 1000;
  if (!trail || trail.version !== 2 || !point(trail.origin) ||
      !Array.isArray(trail.stages) ||
      !(trail.stages.length === TRAIL_STAGES || trail.story?.finalState === "mobile" && trail.stages.length === 13) ||
      new Set(trail.stages.map(p => p?.geonameId === undefined ? p?.osmId : `geoname/${p.geonameId}`)).size !== trail.stages.length) fail();
  validateParentStory(trail);
  let previous = trail.origin;
  for (const stage of trail.stages) {
    if (!point(stage) || !["city", "town"].includes(stage.placeType) ||
        !(stage.geonameId === undefined ? /^node\/\d+$/.test(stage.osmId)
          : Number.isSafeInteger(stage.geonameId) && stage.geonameId > 0 && stage.osmId === undefined &&
            stage.sourceUrl === "https://www.geonames.org/") ||
        typeof stage.name !== "string" || !stage.name.trim() ||
        !Number.isFinite(stage.legMeters) || stage.legMeters < 30000 || stage.legMeters > 60000 ||
        Math.abs(distanceMeters(previous, stage.latitude, stage.longitude) - stage.legMeters) > 1 ||
        typeof stage.sourceUrl !== "string" || !stage.sourceUrl.startsWith("https://") ||
        typeof stage.retrievedAt !== "string" || !Number.isFinite(Date.parse(stage.retrievedAt))) fail();
    if (stage.venue !== undefined && (!stage.venue || typeof stage.venue.name !== "string" ||
        !stage.venue.name.trim() || !/^node\/\d+$/.test(stage.venue.osmId) ||
        typeof stage.venue.sourceUrl !== "string" || !stage.venue.sourceUrl.startsWith("https://"))) fail();
    previous = stage;
  }
  return trail;
}

export async function loadTownTrail(region, signal, fetcher = fetch, onProgress = () => {}) {
  const seed = crypto.getRandomValues(new Uint32Array(1))[0].toString(16).padStart(8, "0");
  const url = `/api/trail?${new URLSearchParams({ region, seed })}`;
  const deadline = Date.now() + 15 * 60_000;
  while (Date.now() < deadline) {
    const response = await fetcher(url, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
    });
    if (!(response.headers.get("content-type") ?? "").includes("application/json")) {
      throw new Error("The local travel server is required to prepare a town-to-town trail.");
    }
    const trail = await response.json();
    if (!response.ok && response.status !== 429) throw new Error(trail.error ?? `Town trail: HTTP ${response.status}`);
    if (response.status !== 202 && response.status !== 429) {
      validateTownTrail(trail);
      if (trail.index !== 0 || trail.completed !== false ||
          !Array.isArray(trail.history) || trail.history.length !== 0 ||
          typeof trail.parentName !== "string" || !trail.parentName.trim() ||
          trail.stages.some((p, i) => p.witnessId !== `fictional-traveler-${i + 1}`)) {
        throw new Error("Invalid new town-to-town trail.");
      }
      signal.throwIfAborted();
      return trail;
    }
    onProgress(response.status === 429 ? { phase: "queued" } : trail.progress ?? { phase: "queued" });
    await new Promise((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(signal.reason); };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", abort);
        resolve();
      }, 1000);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
  }
  throw new Error("Town-to-town route preparation timed out. Please retry.");
}

export function createTrail(map, col, row, random = Math.random) {
  const pick = values => {
    const n = random();
    if (!Number.isFinite(n) || n < 0 || n >= 1) throw new Error("Invalid trail generation draw.");
    return values[Math.floor(n * values.length)];
  };
  const candidates = [];
  for (let r = 0; r < map.height; r++) {
    for (let c = 0; c < map.width; c++) {
      const cell = map.rows[r][c];
      if (cell.unavailable) continue;
      const settlement = cell.settlements?.find(item => item.name?.trim());
      const poi = (cell.pois ?? []).filter(publicPlace)
        .sort((a, b) => a.osmId.localeCompare(b.osmId))[0];
      const place = settlement ?? poi;
      if (place) candidates.push({ col: c, row: r, name: place.name, osmId: place.osmId });
    }
  }
  if (candidates.length < TRAIL_STAGES) throw new Error(`The local map needs ${TRAIL_STAGES} distinct named public locations for a parent trail.`);
  const stages = [];
  let origin = { col, row };
  for (let i = 0; i < TRAIL_STAGES; i++) {
    const nearby = candidates.filter(candidate =>
      !stages.some(s => s.col === candidate.col && s.row === candidate.row))
      .sort((a, b) => Math.hypot(a.col - origin.col, a.row - origin.row) -
        Math.hypot(b.col - origin.col, b.row - origin.row) || a.osmId.localeCompare(b.osmId))
      .slice(0, 4);
    const stage = pick(nearby);
    stages.push({ ...stage, witnessId: `fictional-traveler-${i + 1}` });
    origin = stage;
  }
  return { version: 1, parentName: pick(PARENTS), stages, index: 0, history: [], completed: false };
}

export function trailTarget(state) {
  if (state.trail?.completed) return null;
  return state.trail?.stages[state.trail.index] ?? null;
}

export function atTrailTarget(state) {
  const target = trailTarget(state);
  const radius = state.trail?.version === 2 ? 1 : 0;
  return Boolean(target && Math.abs(state.col - target.col) <= radius &&
    Math.abs(state.row - target.row) <= radius);
}

export function witnessFacts(state) {
  const target = trailTarget(state);
  if (!target) return null;
  return { witnessId: target.witnessId, parentName: state.trail.parentName,
    place: target.name, next: parentReunion(state) ? null : state.trail.stages[state.trail.index + 1] ?? null,
    fictional: true };
}

export function interviewTrail(state, info, survival, economy) {
  if (state.trail?.version === 2) throw new Error("Choose a clue action at this stop.");
  if (!state.trail || state.trail.completed || !atTrailTarget(state)) {
    throw new Error("No new parent-trail encounter at the player's position.");
  }
  const next = finishAction(state, restSurvival(state, { ...survival,
    rest_minutes: 5, rest_fatigue_recovery: 0 }), info, economy, { survival });
  if (next.ended || didFaint(state, next)) return next;
  const facts = witnessFacts(state);
  const index = state.trail.index + 1;
  const completed = index === state.trail.stages.length;
  return { ...next, ended: completed ? "reunion" : null, trail: { ...state.trail,
    index, completed, history: [...state.trail.history, facts] } };
}
