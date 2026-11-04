// A finite, supplied timetable, never a route generator or a live-data fallback.
export class TransportError extends Error {
  constructor(code) { super(code); this.name = "TransportError"; this.code = code; }
}
const fail = code => { throw new TransportError(code); };
const integer = n => Number.isSafeInteger(n) && n >= 0;
const text = s => typeof s === "string" && s.trim().length > 0;
const point = p => p && Number.isSafeInteger(p.col) && Number.isSafeInteger(p.row) &&
  p.col >= -8000 && p.col <= 8007 && p.row >= -8000 && p.row <= 8007;
const same = (a, b) => a.col === b.col && a.row === b.row;
const copy = value => JSON.parse(JSON.stringify(value));
const now = s => s.startedAt + s.elapsedMinutes * 60000;
const stamp = value => {
  if (!text(value) || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:Z|[+-]\d\d:\d\d)$/.test(value) ||
      !Number.isFinite(Date.parse(value))) fail("INVALID_TIMESTAMP");
  return Date.parse(value);
};
function date(value) {
  if (!text(value) || !/^\d{4}-\d\d-\d\d$/.test(value) ||
      !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) ||
      new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) fail("INVALID_DATE");
  return value;
}
function localParts(ms, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(ms));
  return Object.fromEntries(parts.map(p => [p.type, p.value]));
}
function localDate(ms, zone) {
  const p = localParts(ms, zone);
  return `${p.year}-${p.month}-${p.day}`;
}
function serviceTime(call, field, serviceDate, zone) {
  const ms = stamp(call[field]), seconds = call[`${field}ServiceSeconds`];
  if (!integer(seconds) || seconds >= 72 * 3600) fail("INVALID_SERVICE_TIME");
  const wall = new Date(Date.parse(`${serviceDate}T00:00:00Z`) + seconds * 1000).toISOString();
  const p = localParts(ms, zone);
  if (`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}` !== wall.slice(0, 19)) {
    fail("TIMEZONE_SERVICE_DATE_MISMATCH");
  }
  return ms;
}
export function importTimetable(input, { allowDemo = false, allowFictional = false } = {}) {
  const feed = copy(input);
  if (!feed || feed.version !== 1 || !text(feed.id) || !text(feed.revision) ||
      !text(feed.gridId) || !text(feed.timeZone) || !["supplied", "synthetic-demo", "fictional-service"].includes(feed.kind) ||
      !text(feed.source?.name) || !text(feed.source?.reference)) fail("INVALID_TIMETABLE");
  if (feed.kind === "synthetic-demo" && !allowDemo) fail("DEMO_NOT_LIVE_SERVICE");
  if (feed.kind === "fictional-service") {
    if (!allowFictional) fail("FICTIONAL_SERVICE_NOT_ENABLED");
    if (!text(feed.fictionalNotice) || feed.geographyKind !== "abstract-town-link") fail("INVALID_FICTIONAL_SERVICE");
  }
  try { localParts(0, feed.timeZone); } catch { fail("INVALID_TIMEZONE"); }
  date(feed.validFrom); date(feed.validThrough);
  if (feed.validFrom > feed.validThrough || !Array.isArray(feed.stops) ||
      !feed.stops.length || !Array.isArray(feed.trips)) fail("INVALID_TIMETABLE");
  const stops = new Map();
  for (const stop of feed.stops) {
    if (!text(stop.id) || !text(stop.name) || !point(stop) || stops.has(stop.id)) fail("INVALID_STOP");
    stops.set(stop.id, stop);
  }
  const ids = new Set();
  for (const trip of feed.trips) {
    if (!text(trip.id) || ids.has(trip.id) || !text(trip.routeId) ||
        !["bus", "train"].includes(trip.mode) || trip.currency !== "EUR" ||
        !integer(trip.fareCents) || !Array.isArray(trip.calls) || trip.calls.length < 2) fail("INVALID_TRIP");
    if (trip.fare !== undefined && (trip.fare?.kind !== "estimated-game" ||
        !text(trip.fare.policy) || trip.fare.currency !== trip.currency ||
        trip.fare.cents !== trip.fareCents || !text(feed.fareNotice))) fail("INVALID_FARE_METADATA");
    if (trip.timingQuality !== undefined &&
        !["source-timepoints", "source-approximate", "fictional-estimate"].includes(trip.timingQuality)) fail("INVALID_TIME_QUALITY");
    if ((feed.kind === "fictional-service" && (trip.mode !== "bus" ||
        trip.fare?.kind !== "estimated-game" || trip.timingQuality !== "fictional-estimate")) ||
        (feed.kind !== "fictional-service" && trip.timingQuality === "fictional-estimate")) fail("INVALID_FICTIONAL_SERVICE");
    ids.add(trip.id); date(trip.serviceDate);
    if (trip.serviceDate < feed.validFrom || trip.serviceDate > feed.validThrough) fail("SERVICE_OUTSIDE_COVERAGE");
    let last = -Infinity;
    for (const call of trip.calls) {
      if (!stops.has(call.stopId)) fail("UNKNOWN_STOP");
      if ([call.pickupType, call.dropOffType].some(value =>
        value !== undefined && ![0, 1, 2, 3].includes(value))) fail("INVALID_STOP_ACCESS");
      const arrival = serviceTime(call, "arrival", trip.serviceDate, feed.timeZone);
      const departure = serviceTime(call, "departure", trip.serviceDate, feed.timeZone);
      if (arrival < last || departure < arrival) fail("NON_MONOTONIC_TRIP");
      last = departure;
    }
    if (stamp(trip.calls.at(-1).arrival) <= stamp(trip.calls[0].departure)) fail("INVALID_TRIP_DURATION");
  }
  return deepFreeze(feed);
}
function deepFreeze(object) {
  for (const value of Object.values(object)) if (value && typeof value === "object") deepFreeze(value);
  return Object.freeze(object);
}
export function validateDisruptions(notices = []) {
  if (!Array.isArray(notices)) fail("INVALID_DISRUPTION");
  const ids = new Set();
  for (const n of notices) {
    if (!n || !text(n.id) || ids.has(n.id) || !Number.isSafeInteger(n.startsAt) ||
        !Number.isSafeInteger(n.endsAt) || n.endsAt <= n.startsAt ||
        !((typeof n.cancelled === "boolean" && n.delayMinutes === undefined) ||
          (n.cancelled === undefined && integer(n.delayMinutes))) ||
        ["tripId", "routeId", "stopId"].some(k => n[k] !== undefined && !text(n[k]))) fail("INVALID_DISRUPTION");
    ids.add(n.id);
  }
  return notices;
}
function disruption(trip, call, notices) {
  const at = stamp(call.departure);
  const matched = notices.filter(n => at >= n.startsAt && at < n.endsAt &&
    (!n.tripId || n.tripId === trip.id) && (!n.routeId || n.routeId === trip.routeId) &&
    (!n.stopId || n.stopId === call.stopId));
  // Overlapping reports describe total delay, not additive penalties.
  return { cancelled: matched.some(n => n.cancelled),
    delayMinutes: Math.max(0, ...matched.map(n => n.delayMinutes ?? 0)) };
}
function checkJourney(s) {
  if (!s || !point(s) || !Number.isFinite(s.startedAt) || !Number.isFinite(s.elapsedMinutes) ||
      s.elapsedMinutes < 0 || !Number.isFinite(now(s)) || !integer(s.walletCents)) fail("INVALID_JOURNEY");
  if (s.ended) fail("JOURNEY_ENDED");
  validateTransportSave(s);
}
function available(feed, state, gridId) {
  checkJourney(state);
  if (gridId !== feed.gridId) fail("GRID_MISMATCH");
  const day = localDate(now(state), feed.timeZone);
  const continuation = state.transport?.booking;
  const knownOvernightDeparture = day > feed.validThrough && feed.trips.some(trip =>
    trip.calls.slice(0, -1).some(call => stamp(call.departure) >= now(state)));
  if ((day < feed.validFrom || day > feed.validThrough) &&
      !knownOvernightDeparture &&
      !(continuation?.status === "active" && now(state) <= continuation.offer.arrivalAt)) fail("UNKNOWN_SERVICE_DATE");
}
function key(feed, trip, fromIndex, toIndex, departureAt, arrivalAt) {
  return JSON.stringify([feed.id, feed.revision, trip.id, fromIndex, toIndex, departureAt,
    arrivalAt, trip.fareCents, trip.currency]);
}
export function transportOffers(feed, state, { gridId, disruptions = [] } = {}) {
  available(feed, state, gridId); validateDisruptions(disruptions);
  if (state.transport?.booking?.status === "active") fail("BOOKING_ACTIVE");
  const offers = [];
  for (const trip of feed.trips) {
    for (let fromIndex = 0; fromIndex < trip.calls.length - 1; fromIndex++) {
      const call = trip.calls[fromIndex], stop = feed.stops.find(s => s.id === call.stopId);
      if (!same(state, stop) || (call.pickupType ?? 0) !== 0) continue;
      const change = disruption(trip, call, disruptions);
      const departureAt = stamp(call.departure) + change.delayMinutes * 60000;
      if (change.cancelled || departureAt < now(state)) continue;
      for (let toIndex = fromIndex + 1; toIndex < trip.calls.length; toIndex++) {
        if ((trip.calls[toIndex].dropOffType ?? 0) !== 0) continue;
        const arrivalAt = stamp(trip.calls[toIndex].arrival) + change.delayMinutes * 60000;
        if (arrivalAt <= departureAt) continue;
        offers.push({ id: key(feed, trip, fromIndex, toIndex, departureAt, arrivalAt), feedId: feed.id,
          tripId: trip.id, routeId: trip.routeId, mode: trip.mode, fromIndex, toIndex,
          from: copy(stop), to: copy(feed.stops.find(s => s.id === trip.calls[toIndex].stopId)),
          departureAt, arrivalAt, waitMinutes: (departureAt - now(state)) / 60000,
          rideMinutes: (arrivalAt - departureAt) / 60000, fareCents: trip.fareCents, currency: "EUR",
          delayMinutes: change.delayMinutes,
          serviceKind: feed.kind === "supplied" ? "real-schedule" : feed.kind,
          ...(feed.kind === "fictional-service" ? { serviceNotice: feed.fictionalNotice,
            geographyKind: feed.geographyKind } : {}),
          ...(trip.fare ? { fareKind: trip.fare.kind, fareNotice: feed.fareNotice } : {}),
          ...(trip.timingQuality ? { timingQuality: trip.timingQuality } : {}) });
      }
    }
  }
  return offers.sort((a, b) => a.departureAt - b.departureAt || a.arrivalAt - b.arrivalAt);
}
export function bookTransit(feed, state, offerId, options) {
  const offer = transportOffers(feed, state, options).find(o => o.id === offerId);
  if (!offer) fail("SERVICE_UNAVAILABLE_OR_STALE");
  if (state.walletCents < offer.fareCents) fail("INSUFFICIENT_FUNDS");
  const old = state.transport ?? { version: 1, sequence: 0, rides: [], walkedLegs: [] };
  const sequence = old.sequence + 1;
  const trip = feed.trips.find(t => t.id === offer.tripId);
  const calls = trip.calls.slice(offer.fromIndex + 1, offer.toIndex + 1).map(call => ({
    stop: copy(feed.stops.find(s => s.id === call.stopId)),
    arrivalAt: stamp(call.arrival) + offer.delayMinutes * 60000,
  }));
  return { ...state, transport: { ...old, sequence,
    booking: { id: `${feed.id}:${sequence}`, status: "active", feedId: feed.id,
      revision: feed.revision, offer, calls, nextCall: 0, paid: false, progressAt: now(state) } } };
}
function interrupted(a, b) {
  return Boolean(b.ended || (b.faints ?? 0) > (a.faints ?? 0) ||
    !same(a, b) || (b.pressures?.placements?.length ?? 0) > (a.pressures?.placements?.length ?? 0));
}
// Pure settlement: persist the returned journey atomically. No async or external side effects.
export function advanceTransit(feed, state, bookingId, {
  gridId, disruptions = [], settle, isInterrupted = interrupted,
} = {}) {
  available(feed, state, gridId); validateDisruptions(disruptions);
  if (typeof settle !== "function") fail("SETTLEMENT_REQUIRED");
  const b = state.transport?.booking;
  if (!b || b.id !== bookingId || b.status !== "active") fail("STALE_BOOKING");
  if (b.feedId !== feed.id || b.revision !== feed.revision) fail("STALE_TIMETABLE");
  if (now(state) !== b.progressAt) fail("STALE_JOURNEY_CLOCK");
  let next = copy(state), booking = next.transport.booking;
  const trip = feed.trips.find(t => t.id === b.offer.tripId);
  if (!trip) fail("UNKNOWN_SERVICE");
  const origin = trip.calls[b.offer.fromIndex], destination = trip.calls[b.offer.toIndex];
  if (!origin || !destination) fail("INVALID_TRANSPORT_SAVE");
  const departureAt = stamp(origin.departure) + b.offer.delayMinutes * 60000;
  const arrivalAt = stamp(destination.arrival) + b.offer.delayMinutes * 60000;
  const expectedCalls = trip.calls.slice(b.offer.fromIndex + 1, b.offer.toIndex + 1).map(call => ({
    stop: copy(feed.stops.find(s => s.id === call.stopId)),
    arrivalAt: stamp(call.arrival) + b.offer.delayMinutes * 60000,
  }));
  if (b.offer.id !== key(feed, trip, b.offer.fromIndex, b.offer.toIndex, departureAt, arrivalAt) ||
      b.offer.departureAt !== departureAt || b.offer.arrivalAt !== arrivalAt ||
      b.offer.fareCents !== trip.fareCents || b.offer.mode !== trip.mode ||
      JSON.stringify(b.calls) !== JSON.stringify(expectedCalls) ||
      !same(state, b.nextCall ? b.calls[b.nextCall - 1].stop : feed.stops.find(s => s.id === origin.stopId))) {
    fail("INVALID_TRANSPORT_SAVE");
  }
  if (feed.kind === "fictional-service" &&
      (b.offer.serviceKind !== feed.kind || b.offer.serviceNotice !== feed.fictionalNotice ||
       b.offer.geographyKind !== feed.geographyKind || b.offer.fareKind !== trip.fare.kind ||
       b.offer.fareNotice !== feed.fareNotice || b.offer.timingQuality !== trip.timingQuality)) {
    fail("INVALID_TRANSPORT_SAVE");
  }
  const current = disruption(trip, trip.calls[b.offer.fromIndex], disruptions);
  if (!b.paid && (current.cancelled || current.delayMinutes !== b.offer.delayMinutes)) {
    booking.status = "cancelled"; return next;
  }
  const riding = now(state) >= b.offer.departureAt;
  if (riding && !b.paid) {
    if (state.walletCents < b.offer.fareCents) fail("INSUFFICIENT_FUNDS");
    next.walletCents -= b.offer.fareCents;
    next.lastExpenseCents = b.offer.fareCents;
    booking.paid = true;
    if (state.journeyMap) next.transport.walkedLegs.push(copy(state.journeyMap));
    next.journeyMap = { version: 1, partial: true, simplified: false, points: [{ col: state.col, row: state.row }] };
    next.transport.rides.push({ bookingId, mode: b.offer.mode, tripId: trip.id,
      ...(b.offer.serviceKind ? { serviceKind: b.offer.serviceKind } : {}),
      ...(b.offer.geographyKind ? { geographyKind: b.offer.geographyKind,
        serviceNotice: b.offer.serviceNotice } : {}),
      points: [{ col: state.col, row: state.row }], completed: false });
  }
  const targetAt = riding ? b.calls[b.nextCall].arrivalAt : b.offer.departureAt;
  const minutes = Math.min(1, Math.max(0, (targetAt - now(state)) / 60000));
  next.elapsedMinutes += minutes;
  next.lastMove = null;
  const metadata = { activity: riding ? "transit-ride" : "transit-wait", minutes,
    sheltered: riding, mode: b.offer.mode, fatigueGain: 0, bookingId };
  const settled = settle(state, next, metadata);
  if (!settled || typeof settled.then === "function" || !point(settled) ||
      !Number.isFinite(settled.elapsedMinutes) ||
      settled.elapsedMinutes < state.elapsedMinutes) fail("INVALID_SETTLEMENT");
  // Keep the booking authoritative even when a settlement helper spreads its own state.
  const result = { ...settled, transport: next.transport };
  booking = result.transport.booking;
  booking.progressAt = now(result);
  if (isInterrupted(state, result)) { booking.status = "interrupted"; return result; }
  if (Math.abs(now(result) - (now(state) + minutes * 60000)) > 0.01) fail("INVALID_SETTLEMENT_CLOCK");
  if (riding && now(result) >= targetAt) {
    const stop = b.calls[b.nextCall].stop;
    result.col = stop.col; result.row = stop.row;
    result.journeyMap = { version: 1, partial: true, simplified: false,
      points: [{ col: stop.col, row: stop.row }] };
    result.transport.rides.at(-1).points.push({ col: stop.col, row: stop.row });
    booking.nextCall++;
    if (booking.nextCall === booking.calls.length) {
      booking.status = "arrived"; result.transport.rides.at(-1).completed = true;
    }
  }
  return result;
}
export function validateTransportSave(state) {
  const t = state.transport;
  if (t === undefined) return;
  if (!t || t.version !== 1 || !integer(t.sequence) || !Array.isArray(t.rides) ||
      !Array.isArray(t.walkedLegs) || t.rides.length > t.sequence ||
      t.walkedLegs.length > t.sequence) fail("INVALID_TRANSPORT_SAVE");
  for (const ride of t.rides) {
    if (!text(ride.bookingId) || !["bus", "train"].includes(ride.mode) || !text(ride.tripId) ||
        typeof ride.completed !== "boolean" || !Array.isArray(ride.points) ||
        !ride.points.length || !ride.points.every(point)) fail("INVALID_TRANSPORT_SAVE");
    if (ride.serviceKind !== undefined &&
        !["real-schedule", "fictional-service", "synthetic-demo"].includes(ride.serviceKind)) fail("INVALID_TRANSPORT_SAVE");
    if (ride.serviceKind === "fictional-service" && (ride.mode !== "bus" ||
        ride.geographyKind !== "abstract-town-link" || !text(ride.serviceNotice))) fail("INVALID_TRANSPORT_SAVE");
  }
  for (const leg of t.walkedLegs) {
    if (!Array.isArray(leg.points) || !leg.points.length || !leg.points.every(point)) fail("INVALID_TRANSPORT_SAVE");
  }
  const b = t.booking;
  if (!b) { if (t.sequence !== 0) fail("INVALID_TRANSPORT_SAVE"); return; }
  if (!text(b.feedId) || !text(b.revision) || b.id !== `${b.feedId}:${t.sequence}` ||
      !["active", "arrived", "cancelled", "interrupted"].includes(b.status) ||
      typeof b.paid !== "boolean" || !Number.isFinite(b.progressAt) ||
      !integer(b.nextCall) || !Array.isArray(b.calls) || !b.calls.length ||
      b.nextCall > b.calls.length || !b.offer || !integer(b.offer.fareCents) ||
      !Number.isFinite(b.offer.departureAt) || !Number.isFinite(b.offer.arrivalAt) ||
      !text(b.offer.tripId) || !integer(b.offer.fromIndex) || !integer(b.offer.toIndex) ||
      b.offer.fromIndex >= b.offer.toIndex || !integer(b.offer.delayMinutes) ||
      (b.status === "active" && b.nextCall >= b.calls.length) ||
      (!b.paid && b.nextCall !== 0) ||
      (b.paid && !t.rides.some(r => r.bookingId === b.id)) ||
      (b.status === "arrived" && (!b.paid || b.nextCall !== b.calls.length))) fail("INVALID_TRANSPORT_SAVE");
  let at = b.offer.departureAt;
  for (const c of b.calls) {
    if (!point(c.stop) || !text(c.stop.id) || !Number.isFinite(c.arrivalAt) || c.arrivalAt < at) fail("INVALID_TRANSPORT_SAVE");
    at = c.arrivalAt;
  }
  if (at !== b.offer.arrivalAt) fail("INVALID_TRANSPORT_SAVE");
}
export function transportRouteView(state) {
  validateTransportSave(state);
  return { walkedLegs: copy([...(state.transport?.walkedLegs ?? []),
    ...(state.journeyMap ? [state.journeyMap] : [])]), rides: copy(state.transport?.rides ?? []) };
}
