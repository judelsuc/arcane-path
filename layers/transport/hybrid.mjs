import { importTimetable, transportOffers, TransportError } from "./transport.mjs";

const pair = (from, to) => JSON.stringify([from.col, from.row, to.col, to.row]);
const dateAt = (at, timeZone) => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric",
    month: "2-digit", day: "2-digit" }).formatToParts(new Date(at));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

export function hybridTransportOffers({ realFeeds = [], fictionalFeed }, state, options) {
  const feeds = realFeeds.map(feed => importTimetable(feed));
  if (feeds.some(feed => feed.kind !== "supplied")) throw new TransportError("EXPECTED_REAL_TIMETABLE");
  const fallback = fictionalFeed && importTimetable(fictionalFeed, { allowFictional: true });
  if (fallback && fallback.kind !== "fictional-service") throw new TransportError("EXPECTED_FICTIONAL_TIMETABLE");
  if (new Set([...feeds, ...(fallback ? [fallback] : [])].map(feed => feed.id)).size !== feeds.length + (fallback ? 1 : 0)) {
    throw new TransportError("DUPLICATE_TIMETABLE");
  }
  if (!feeds.length && !fallback) throw new TransportError("NO_TRANSPORT_SOURCES");
  const offers = [], coverage = new Set(), staleFeedIds = [];
  for (const feed of feeds) {
    try {
      offers.push(...transportOffers(feed, state, options));
    } catch (error) {
      if (!(error instanceof TransportError) || error.code !== "UNKNOWN_SERVICE_DATE") throw error;
      staleFeedIds.push(feed.id);
      continue;
    }
    const now = state.startedAt + state.elapsedMinutes * 60000;
    const day = dateAt(now, feed.timeZone);
    const stops = new Map(feed.stops.map(stop => [stop.id, stop]));
    for (const trip of feed.trips) {
      for (let index = 0; index < trip.calls.length - 1; index++) {
        const call = trip.calls[index], from = stops.get(call.stopId);
        if (from.col !== state.col || from.row !== state.row || (call.pickupType ?? 0) !== 0 ||
            (trip.serviceDate !== day && !(trip.serviceDate < day && Date.parse(call.departure) >= now))) continue;
        for (const arrival of trip.calls.slice(index + 1)) {
          if ((arrival.dropOffType ?? 0) === 0) coverage.add(pair(from, stops.get(arrival.stopId)));
        }
      }
    }
  }
  if (fallback) {
    for (const offer of transportOffers(fallback, state, options)) {
      if (!coverage.has(pair(offer.from, offer.to))) offers.push(offer);
    }
  }
  return {
    offers: offers.sort((a, b) => a.departureAt - b.departureAt || a.arrivalAt - b.arrivalAt),
    staleFeedIds,
    notice: "Real schedules take precedence for covered origin/destination cells on their supplied service day. " +
      "A missed or cancelled real service does not create a replacement fictional coach. " +
      "Fictional services cover absent or explicitly out-of-date data only, not operator disruption recovery.",
  };
}
