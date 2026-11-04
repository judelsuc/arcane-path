import { restSurvival } from "./survival.mjs";
import { finishAction } from "./economy.mjs";
import { importTimetable, bookTransit, advanceTransit, validateTransportSave } from "./layers/transport/transport.mjs";
import { hybridTransportOffers } from "./layers/transport/hybrid.mjs";
import { restoreEncounterState } from "./layers/living-world/agenda.mjs";

export const transitActive = state => state?.transport?.booking?.status === "active";

export function validateJourneyWorld(state) {
  if (!state) return;
  validateTransportSave(state);
  if (state.worldEncounters !== undefined) restoreEncounterState(state.worldEncounters, state);
  if (state.transitFeed !== undefined) {
    if (JSON.stringify(state.transitFeed).length > 1500000) throw new Error("Transport timetable exceeds save limit.");
    const feed = importTimetable(state.transitFeed, { allowFictional: true });
    const booking = state.transport?.booking;
    if (!booking || feed.id !== booking.feedId || feed.revision !== booking.revision ||
        !feed.trips.some(trip => trip.id === booking.offer.tripId)) throw new Error("Saved transport timetable does not match booking.");
  } else if (transitActive(state)) throw new Error("Active transport requires its saved timetable.");
}

export function journeyTransportOptions(payload, state, gridId) {
  if (!payload || payload.version !== 1 || payload.gridId !== gridId ||
      payload.col !== state.col || payload.row !== state.row || !Array.isArray(payload.realFeeds) ||
      payload.realFeeds.length > 7 || !Array.isArray(payload.coverage)) throw new Error("Invalid journey transport response.");
  if (!payload.realFeeds.length && !payload.fictionalFeed) return { offers: [], staleFeedIds: [] };
  return hybridTransportOffers(payload, state, { gridId });
}

export function reserveJourneyTransit(state, feed, offerId, gridId) {
  if ((state.transport?.sequence ?? 0) >= 64) throw new Error("Journey transport history is full (64 bookings).");
  const canonical = importTimetable(feed, { allowFictional: true });
  const next = { ...bookTransit(canonical, state, offerId, { gridId }), transitFeed: canonical };
  validateJourneyWorld(next);
  return next;
}

export function stepJourneyTransit(state, gridId, info, survival, economy) {
  if (!transitActive(state)) throw new Error("No active journey transport.");
  const feed = importTimetable(state.transitFeed, { allowFictional: true });
  return advanceTransit(feed, state, state.transport.booking.id, {
    gridId,
    settle(previous, proposed, metadata) {
      // The reducer already owns clock advancement and the single boarding charge.
      const metabolized = restSurvival({ ...proposed, elapsedMinutes: previous.elapsedMinutes },
        { ...survival, rest_minutes: metadata.minutes, rest_fatigue_recovery: 0 });
      return finishAction(previous, metabolized, info, economy, {
        survival, sheltered: metadata.sheltered, activity: metadata.activity,
      });
    },
  });
}

export function cancelJourneyTransit(state) {
  const booking = state.transport?.booking;
  if (!transitActive(state) || booking.paid) throw new Error("Only an unboarded reservation can be cancelled.");
  return { ...state, transport: { ...state.transport, booking: { ...booking, status: "cancelled" } } };
}
