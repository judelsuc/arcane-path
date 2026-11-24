import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importTimetable, bookTransit, advanceTransit, validateTransportSave, transportRouteView } from "../layers/transport/transport.mjs";
import { hybridTransportOffers } from "../layers/transport/hybrid.mjs";

const read = name => JSON.parse(readFileSync(new URL(
  `../data/transport/examples/grenoble-lyon/${name}.json`, import.meta.url), "utf8"));
const real = () => read("real-timetable");
const fictional = () => read("fictional-timetable");
const clone = value => JSON.parse(JSON.stringify(value));
const config = () => ({ realFeeds: [real()], fictionalFeed: fictional() });
const origin = () => real().stops.find(stop => stop.name === "Grenoble" && stop.id.includes("Train"));
const state = () => ({ ...origin(), startedAt: Date.parse("2026-10-19T11:00:00+02:00"),
  elapsedMinutes: 0, walletCents: 10000, distanceMeters: 123, reserveKcal: 1000, ended: null });
const options = { gridId: "grenoble-lyon-example-v1" };
const code = expected => error => error.code === expected;
function ride(feed, offer, initial = state()) {
  let journey = bookTransit(feed, initial, offer.id, options);
  for (let index = 0; index < 600 && journey.transport.booking.status === "active"; index++) {
    validateTransportSave(journey);
    journey = advanceTransit(feed, clone(journey), journey.transport.booking.id, {
      ...options, settle: (previous, proposed, { minutes }) => ({
        ...proposed, reserveKcal: previous.reserveKcal - minutes,
      }),
    });
  }
  return journey;
}

test("verified SNCF K6 contains 27 legal direct Grenoble to Lyon trains, not the reverse", () => {
  const report = read("connections");
  assert.equal(report.connections.length, 27);
  assert.equal(report.source.id, "tdg-83582");
  assert.equal(read("source").selection.scope, "selected-routes");
  assert.equal(report.from.name, "Grenoble");
  assert.equal(report.to.name, "Lyon Part Dieu");
  assert.ok(report.connections.every(connection => connection.mode === "train"));
  const next = report.connections.find(connection => connection.departure >= "2026-10-19T11:08:00+02:00");
  assert.equal(next.headsign, "17618");
  assert.equal(next.departure, "2026-10-19T11:21:00+02:00");
  assert.equal(next.arrival, "2026-10-19T12:44:00+02:00");
  assert.equal(next.durationMinutes, 83);
  assert.equal(next.fare.kind, "estimated-game");
});

test("hybrid offers prefer real Grenoble Lyon and provide explicitly fictional loaded-coverage gaps", () => {
  const result = hybridTransportOffers(config(), state(), options);
  assert.deepEqual(result.staleFeedIds, []);
  const lyon = result.offers.filter(offer => offer.to.name === "Lyon Part Dieu");
  assert.ok(lyon.length);
  assert.ok(lyon.every(offer => offer.serviceKind === "real-schedule"));
  const chambery = result.offers.filter(offer => offer.to.name.includes("Chambéry"));
  assert.ok(chambery.length);
  assert.ok(chambery.every(offer => offer.serviceKind === "fictional-service" &&
    offer.geographyKind === "abstract-town-link" && offer.timingQuality === "fictional-estimate" &&
    offer.fareKind === "estimated-game" && offer.serviceNotice.includes("not a verified road itinerary")));
});

test("actual Grenoble Lyon trip boards once, visits real calls, saves/resumes and arrives at 12:44", () => {
  const feed = importTimetable(real());
  const offer = hybridTransportOffers(config(), state(), options).offers.find(offer => offer.to.name === "Lyon Part Dieu");
  assert.equal(offer.departureAt, Date.parse("2026-10-19T11:21:00+02:00"));
  const finished = ride(feed, offer);
  assert.equal(finished.transport.booking.status, "arrived");
  assert.equal(finished.startedAt + finished.elapsedMinutes * 60000, Date.parse("2026-10-19T12:44:00+02:00"));
  assert.equal(finished.walletCents, 9200);
  assert.equal(finished.distanceMeters, 123);
  assert.equal(finished.col, offer.to.col);
  assert.equal(finished.row, offer.to.row);
  assert.equal(transportRouteView(finished).rides[0].points.length, 6);
  assert.equal(finished.transport.rides[0].serviceKind, "real-schedule");
});

test("fictional coach uses the same settlement/charge/save engine without becoming real rail geometry", () => {
  const feed = importTimetable(fictional(), { allowFictional: true });
  const initial = state();
  initial.startedAt = Date.parse("2026-10-19T13:50:00+02:00");
  const offer = hybridTransportOffers(config(), initial, options).offers.find(offer => offer.to.name.includes("Chambéry"));
  assert.ok(offer);
  const finished = ride(feed, offer, initial);
  assert.equal(finished.transport.booking.status, "arrived");
  assert.equal(finished.walletCents, initial.walletCents - offer.fareCents);
  assert.equal(finished.distanceMeters, 123);
  assert.equal(finished.transport.rides[0].serviceKind, "fictional-service");
  assert.equal(finished.transport.rides[0].geographyKind, "abstract-town-link");
  assert.equal(transportRouteView(finished).rides[0].points.length, 2);
  assert.ok(finished.reserveKcal < initial.reserveKcal);
  const tampered = clone(bookTransit(feed, initial, offer.id, options));
  delete tampered.transport.booking.offer.serviceNotice;
  assert.throws(() => advanceTransit(feed, tampered, tampered.transport.booking.id,
    { ...options, settle: (_previous, proposed) => proposed }), code("INVALID_TRANSPORT_SAVE"));
});

test("missed or cancelled real service does not conjure a fictional replacement", () => {
  const earlierOnly = real();
  earlierOnly.trips = earlierOnly.trips.filter(trip => trip.id.includes("OCESN17600"));
  const missed = hybridTransportOffers({ realFeeds: [earlierOnly], fictionalFeed: fictional() }, state(), options);
  assert.equal(missed.offers.filter(offer => offer.to.name === "Lyon Part Dieu").length, 0);
  const initial = state();
  initial.startedAt = Date.parse("2026-10-19T21:30:00+02:00");
  assert.equal(hybridTransportOffers(config(), initial, options).offers.filter(offer => offer.to.name === "Lyon Part Dieu").length, 0);
  const cancelled = { id: "test-cancellation", startsAt: Date.parse("2026-10-19T00:00:00+02:00"),
    endsAt: Date.parse("2026-10-20T00:00:00+02:00"), cancelled: true,
    routeId: real().trips[0].routeId };
  const result = hybridTransportOffers(config(), state(), { ...options, disruptions: [cancelled] });
  assert.equal(result.offers.filter(offer => offer.to.name === "Lyon Part Dieu").length, 0);
  assert.ok(result.offers.some(offer => offer.serviceKind === "fictional-service"));
});

test("outdated real data is explicit, corrupt data and mismatched grids never silently become fiction", () => {
  const future = state();
  future.startedAt += 86400000;
  const futureFictional = fictional();
  futureFictional.validFrom = futureFictional.validThrough = "2026-10-20";
  for (const trip of futureFictional.trips) {
    trip.serviceDate = "2026-10-20";
    for (const call of trip.calls) for (const key of ["arrival", "departure"]) {
      call[key] = call[key].replace("2026-10-19", "2026-10-20");
    }
  }
  const result = hybridTransportOffers({ realFeeds: [real()], fictionalFeed: futureFictional }, future, options);
  assert.deepEqual(result.staleFeedIds, [real().id]);
  assert.ok(result.offers.length);
  assert.ok(result.offers.every(offer => offer.serviceKind === "fictional-service"));
  assert.throws(() => hybridTransportOffers(config(), state(), { gridId: "wrong" }), code("GRID_MISMATCH"));
  const invalid = real(); invalid.trips[0].fareCents = -1;
  assert.throws(() => hybridTransportOffers({ ...config(), realFeeds: [invalid] }, state(), options), code("INVALID_TRIP"));
  assert.throws(() => hybridTransportOffers({}, state(), options), code("NO_TRANSPORT_SOURCES"));
  assert.throws(() => hybridTransportOffers({ realFeeds: [real(), real()] }, state(), options), code("DUPLICATE_TIMETABLE"));
});

test("fictional import needs explicit opt-in, proper labels, game fares and bus-only mode", () => {
  assert.throws(() => importTimetable(fictional()), code("FICTIONAL_SERVICE_NOT_ENABLED"));
  for (const mutate of [
    feed => { delete feed.fictionalNotice; },
    feed => { feed.trips[0].mode = "train"; },
    feed => { feed.trips[0].timingQuality = "source-timepoints"; },
    feed => { delete feed.trips[0].fare; },
  ]) {
    const feed = fictional(); mutate(feed);
    assert.throws(() => importTimetable(feed, { allowFictional: true }), code("INVALID_FICTIONAL_SERVICE"));
  }
});
