import { restSurvival } from "./survival.mjs";
import { finishAction } from "./economy.mjs";
import { healthValue } from "./health.mjs";
import { companionRecord, validateCompanionRecord } from "./companion-presence.mjs";
import { chunkPosition } from "./travel.mjs";
import { relocateJourneyTransit } from "./layers/transport/transport.mjs";

export const HITCHHIKING_MINUTES = 30;
export const HITCHHIKING_INJURY_CHANCE = 0.01;
export const HITCHHIKING_THEFT_CHANCE = 0.01;
export const HITCHHIKING_SHORT_CHANCE = 0.08;
export const hitchhikingActive = state => state?.hitchhiking?.status === "pending";
export const hitchhikingAvailable = cell => !cell?.unavailable && ["road", "major_road"].includes(cell?.terrain);
const point = value => value && ["col", "row"].every(key =>
  Number.isSafeInteger(value[key]) && Math.abs(Math.floor(value[key] / 8)) <= 1000);
const destination = value => point(value) && /^geoname:\d+$/.test(value.id) &&
  typeof value.name === "string" && value.name.length > 0 && value.name.length <= 300 &&
  Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90 &&
  Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180 &&
  Number.isFinite(value.distanceMeters) && value.distanceMeters >= 0;

export function hitchhikingDestinations(payload, state, gridId) {
  if (payload?.version !== 1 || payload.gridId !== gridId || payload.col !== state.col ||
      payload.row !== state.row || !Array.isArray(payload.destinations) || payload.destinations.length !== 10 ||
      !payload.destinations.every(destination) || new Set(payload.destinations.map(town => town.id)).size !== 10 ||
      payload.destinations.some(town => town.col === state.col && town.row === state.row))
    throw new Error("Invalid hitchhiking destinations.");
  return payload.destinations;
}

export function hitchhikingStopChance(state, info) {
  // Use the same longitude-based game hour everywhere, independent of the browser's timezone.
  const hour = new Date(state.startedAt + state.elapsedMinutes * 60000 +
    info.longitude / 15 * 3600000).getUTCHours();
  const daylight = hour >= 7 && hour < 20;
  const cleanliness = state.pressures?.cleanliness ?? 80;
  return Math.max(0.05, Math.min(0.9, (daylight ? 0.45 : 0.20) +
    (cleanliness - 50) * 0.004 - (companionRecord(state).companion ? 0.05 : 0)));
}

function draw(random) {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error("Invalid hitchhiking draw.");
  return value;
}

const interruptedAction = (previous, next, minutes) => Boolean(next.ended ||
  (next.faints ?? 0) !== (previous.faints ?? 0) ||
  (next.pressures?.placements.length ?? 0) !== (previous.pressures?.placements.length ?? 0) ||
  next.col !== previous.col || next.row !== previous.row ||
  Math.abs(next.elapsedMinutes - previous.elapsedMinutes - minutes) > 1e-6);

function settleMinutes(state, minutes, info, survival, economy, sheltered) {
  let next = state;
  // Match scheduled transport: stop at the first survival interruption, not after a whole ride.
  for (let elapsed = 0; elapsed < minutes && !next.ended; elapsed++) {
    const previous = next, step = Math.min(1, minutes - elapsed);
    next = finishAction(previous, restSurvival(previous, { ...survival,
      rest_minutes: step, rest_fatigue_recovery: 0 }), info, economy,
    { survival, sheltered, activity: sheltered ? "transit-ride" : "transit-wait" });
    if (interruptedAction(previous, next, step)) break;
  }
  return next;
}

export function hitchhikingRideMinutes(ride, landing = ride.destination) {
  const full = Math.hypot(ride.destination.col - ride.origin.col, ride.destination.row - ride.origin.row);
  const fraction = full ? Math.min(1, Math.hypot(landing.col - ride.origin.col,
    landing.row - ride.origin.row) / full) : 0;
  return Math.max(1, Math.min(720, Math.ceil(ride.destination.distanceMeters * fraction / 1000 / 40 * 60)));
}

export function attemptHitchhiking(state, town, cell, info, survival, economy, random = Math.random) {
  if (state.ended || hitchhikingActive(state) || state.transport?.booking?.status === "active" ||
      !hitchhikingAvailable(cell) || !destination(town)) throw new Error("Hitchhiking is not available.");
  if ((state.hitchhikingHistory?.length ?? 0) >= 64) throw new Error("Hitchhiking history is full (64 rides).");
  const chance = hitchhikingStopChance(state, info);
  const accepted = draw(random) < chance;
  const risk = accepted ? draw(random) : 1;
  const outcome = !accepted ? "no-car" : risk < HITCHHIKING_INJURY_CHANCE ? "injury"
    : risk < HITCHHIKING_INJURY_CHANCE + HITCHHIKING_THEFT_CHANCE ? "theft"
    : risk < HITCHHIKING_INJURY_CHANCE + HITCHHIKING_THEFT_CHANCE + HITCHHIKING_SHORT_CHANCE ? "short" : "arrived";
  let next = settleMinutes(state, HITCHHIKING_MINUTES, info, survival, economy, false);
  const interrupted = interruptedAction(state, next, HITCHHIKING_MINUTES);
  const stolenCents = !interrupted && outcome === "theft" ? Math.ceil(next.walletCents / 2) : 0;
  const injury = !interrupted && outcome === "injury" ? Math.min(20, healthValue(next)) : 0;
  next = { ...next, walletCents: next.walletCents - stolenCents, lastExpenseCents: 0,
    health: healthValue(next) - injury,
    ended: healthValue(next) - injury <= 0 ? "health" : next.ended,
    hitchhiking: { version: 1, status: accepted && !interrupted && !injury ? "pending" : "complete",
      outcome: interrupted ? "interrupted" : outcome, origin: { col: state.col, row: state.row },
      destination: structuredClone(town), chance, stolenCents, injury,
      attemptedMinutes: state.elapsedMinutes, ...companionRecord(state) } };
  return next;
}

export function finishHitchhiking(state, landing, cell, stay = false, info, survival, economy) {
  if (!hitchhikingActive(state) || !point(landing) || cell?.unavailable)
    throw new Error("Invalid hitchhiking landing.");
  const ride = state.hitchhiking;
  const target = stay || ride.outcome !== "arrived" ? hitchhikingAvailable(cell)
    : landing.col === ride.destination.col && landing.row === ride.destination.row;
  if (!target || stay && (landing.col !== ride.origin.col || landing.row !== ride.origin.row))
    throw new Error("Hitchhiking requires a mapped road landing.");
  const plannedRideMinutes = stay ? 0 : hitchhikingRideMinutes(ride, landing);
  const settled = stay ? state : settleMinutes(state, plannedRideMinutes, info, survival, economy, true);
  const rideMinutes = settled.elapsedMinutes - state.elapsedMinutes;
  if (!stay && interruptedAction(state, settled, plannedRideMinutes))
    return { ...settled, hitchhiking: { ...ride, status: "complete", outcome: "interrupted",
      plannedRideMinutes, rideMinutes } };
  const moved = landing.col !== state.col || landing.row !== state.row;
  return { ...(moved ? relocateJourneyTransit(settled, landing) : settled),
    ...(moved ? { hitchhikingHistory: [...(state.hitchhikingHistory ?? []),
      { ...(state.journeyMap ? { walkedLeg: structuredClone(state.journeyMap) } : {}),
        points: [ride.origin, { col: landing.col, row: landing.row }], mode: "car", completed: true }] } : {}),
    hitchhiking: { ...ride, status: "complete", landing: { col: landing.col, row: landing.row },
      plannedRideMinutes, rideMinutes,
      ...(stay ? { outcome: "recovered" } : {}) } };
}

export async function loadHitchhikingLanding(state, stream, stay = false, signal) {
  if (!hitchhikingActive(state)) throw new Error("No hitchhiking ride to finish.");
  async function load(x, y) {
    signal?.throwIfAborted();
    const chunk = await stream.load(x, y, true);
    signal?.throwIfAborted();
    return chunk;
  }
  const ride = state.hitchhiking;
  const target = stay ? ride.origin : ride.destination;
  if (stay || ride.outcome === "arrived") {
    const p = chunkPosition(target.col, target.row);
    const chunk = await load(p.x, p.y);
    return { landing: { col: target.col, row: target.row }, cell: chunk.rows[p.row][p.col] };
  }
  const middle = { col: Math.round((ride.origin.col + target.col) / 2),
    row: Math.round((ride.origin.row + target.row) / 2) };
  const p = chunkPosition(middle.col, middle.row);
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const chunk = await load(p.x + dx, p.y + dy);
    const candidates = [];
    chunk.rows.forEach((row, r) => row.forEach((cell, c) => {
      const landing = { col: (p.x + dx) * 8 + c, row: (p.y + dy) * 8 + r };
      const progress = (landing.col - ride.origin.col) * (target.col - ride.origin.col) +
        (landing.row - ride.origin.row) * (target.row - ride.origin.row);
      const length = (target.col - ride.origin.col) ** 2 + (target.row - ride.origin.row) ** 2;
      if (hitchhikingAvailable(cell) && progress > 0 && progress < length)
        candidates.push({ landing, cell });
    }));
    candidates.sort((a, b) => Math.hypot(a.landing.col - middle.col, a.landing.row - middle.row) -
      Math.hypot(b.landing.col - middle.col, b.landing.row - middle.row));
    if (candidates.length) return candidates[0];
  }
  throw new Error("No mapped road found halfway to this town. Retry or stay on the departure road.");
}

export function validateHitchhiking(state) {
  if (state.hitchhikingHistory !== undefined && (!Array.isArray(state.hitchhikingHistory) ||
      state.hitchhikingHistory.length > 64 || state.hitchhikingHistory.some(entry =>
        !entry || entry.mode !== "car" || entry.completed !== true || !Array.isArray(entry.points) ||
        entry.points.length !== 2 || !entry.points.every(point) || entry.walkedLeg !== undefined &&
          (!Array.isArray(entry.walkedLeg.points) || !entry.walkedLeg.points.length ||
            entry.walkedLeg.points.length > 8192 || !entry.walkedLeg.points.every(point)))))
    throw new Error("Invalid saved hitchhiking history.");
  const ride = state.hitchhiking;
  if (ride === undefined) return;
  if (!ride || ride.version !== 1 || !["pending", "complete"].includes(ride.status) ||
      !["no-car", "injury", "theft", "short", "arrived", "interrupted", "recovered"].includes(ride.outcome) ||
      !point(ride.origin) || !destination(ride.destination) ||
      !Number.isFinite(ride.chance) || ride.chance < 0.05 || ride.chance > 0.9 ||
      !Number.isSafeInteger(ride.stolenCents) || ride.stolenCents < 0 ||
      !Number.isFinite(ride.injury) || ride.injury < 0 || ride.injury > 20 ||
      !Number.isFinite(ride.attemptedMinutes) || ride.attemptedMinutes < 0 ||
      state.elapsedMinutes < ride.attemptedMinutes + (ride.outcome === "interrupted" ? 0 : HITCHHIKING_MINUTES) ||
      ride.plannedRideMinutes !== undefined && (!Number.isFinite(ride.plannedRideMinutes) ||
        ride.plannedRideMinutes < 0 || ride.plannedRideMinutes > 720) ||
      ride.rideMinutes !== undefined && (!Number.isFinite(ride.rideMinutes) ||
        ride.rideMinutes < 0 || ride.rideMinutes > 2160 ||
        state.elapsedMinutes < ride.attemptedMinutes + HITCHHIKING_MINUTES + ride.rideMinutes) ||
      ride.landing !== undefined && !point(ride.landing) ||
      ride.status === "pending" && (!["theft", "short", "arrived"].includes(ride.outcome) ||
        state.ended || state.col !== ride.origin.col || state.row !== ride.origin.row))
    throw new Error("Invalid saved hitchhiking attempt.");
  validateCompanionRecord(ride);
}
