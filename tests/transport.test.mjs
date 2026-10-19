import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { startSurvival, restSurvival } from "../survival.mjs";
import { startEconomy, finishAction } from "../economy.mjs";
import { importTimetable, transportOffers, bookTransit, advanceTransit,
  validateTransportSave, transportRouteView } from "../layers/transport/transport.mjs";
import { demoTimetable, demoJourney } from "../layers/transport/demo-fixture.mjs";

const feed = () => importTimetable(demoTimetable(), { allowDemo: true });
const options = { gridId: "imaginary-grid" };
const settle = (previous, proposed, { minutes }) => ({
  ...proposed, reserveKcal: previous.reserveKcal - minutes,
  energyKcal: previous.energyKcal + minutes, awakeHours: previous.awakeHours + minutes / 60,
});
const clone = s => JSON.parse(JSON.stringify(s));
const code = expected => error => error.code === expected;
function book(f = feed(), s = demoJourney(), index = 1, extra = {}) {
  return bookTransit(f, s, transportOffers(f, s, { ...options, ...extra })[index].id, { ...options, ...extra });
}
function step(f, s, extra = {}) {
  return advanceTransit(f, s, s.transport.booking.id, { ...options, settle, ...extra });
}
function finish(f, s, extra) {
  for (let n = 0; n < 30 && s.transport.booking.status === "active"; n++) s = step(f, s, extra);
  return s;
}
test("synthetic fixtures never silently become live journey offers; input is immutable", () => {
  assert.throws(() => importTimetable(demoTimetable()), code("DEMO_NOT_LIVE_SERVICE"));
  const source = demoTimetable(), f = importTimetable(source, { allowDemo: true });
  source.stops[0].col = 8;
  assert.equal(f.stops[0].col, 0);
  assert.throws(() => { f.stops[0].col = 5; }, TypeError);
});
test("supplied import requires provenance, exact integer fares, mapped stops and supported modes", () => {
  const raw = demoTimetable(); raw.kind = "supplied";
  assert.equal(importTimetable(raw).trips.length, 2);
  for (const mutate of [
    s => { s.trips[0].fareCents = 2.4; }, s => { s.trips[0].currency = "USD"; },
    s => { s.source.reference = ""; }, s => { s.trips[0].mode = "teleport"; },
    s => { s.trips[0].calls[0].stopId = "unknown"; }, s => { s.stops[0].col = 0.1; },
    s => { s.trips[0].calls[1].arrival = "2026-10-18T09:00:00+02:00"; },
  ]) {
    const x = demoTimetable(); mutate(x);
    assert.throws(() => importTimetable(x, { allowDemo: true }));
  }
});
test("only mapped current-cell departures, known dates and grids are offered", () => {
  const f = feed(), s = demoJourney();
  assert.equal(transportOffers(f, s, options).length, 3);
  assert.deepEqual(transportOffers(f, { ...s, col: 1 }, options), []);
  assert.throws(() => transportOffers(f, s, { gridId: "different" }), code("GRID_MISMATCH"));
  assert.throws(() => transportOffers(f, { ...s, elapsedMinutes: 1440 }, options), code("UNKNOWN_SERVICE_DATE"));
  assert.deepEqual(transportOffers(f, { ...s, elapsedMinutes: 60 }, options), []);
});
test("GTFS restricted pickup/drop-off never creates an ordinary boarding/alighting offer", () => {
  for (const restriction of [1, 2, 3]) {
    const raw = demoTimetable();
    raw.trips[0].calls[0].pickupType = restriction;
    let f = importTimetable(raw, { allowDemo: true });
    assert.equal(transportOffers(f, demoJourney(), options).filter(o => o.tripId === raw.trips[0].id).length, 0);
    raw.trips[0].calls[0].pickupType = 0;
    raw.trips[0].calls[1].dropOffType = restriction;
    f = importTimetable(raw, { allowDemo: true });
    const offers = transportOffers(f, demoJourney(), options).filter(o => o.tripId === raw.trips[0].id);
    assert.equal(offers.length, 1);
    assert.equal(offers[0].to.id, raw.trips[0].calls[2].stopId);
  }
  for (const invalid of [-1, 4, "0", null]) {
    const raw = demoTimetable();
    raw.trips[0].calls[0].pickupType = invalid;
    assert.throws(() => importTimetable(raw, { allowDemo: true }), code("INVALID_STOP_ACCESS"));
  }
});
test("estimated game fares stay labelled in offers and inconsistent metadata is rejected", () => {
  const raw = demoTimetable();
  raw.fareNotice = "Estimated fictional game fare, not operator tickets.";
  raw.trips[0].fare = { kind: "estimated-game", policy: "test-only",
    currency: "EUR", cents: raw.trips[0].fareCents };
  raw.trips[0].timingQuality = "source-approximate";
  const f = importTimetable(raw, { allowDemo: true });
  const offer = transportOffers(f, demoJourney(), options)[0];
  assert.equal(offer.fareKind, "estimated-game");
  assert.equal(offer.timingQuality, "source-approximate");
  assert.match(offer.fareNotice, /not operator tickets/);
  for (const mutate of [
    data => { delete data.fareNotice; },
    data => { data.trips[0].fare.cents++; },
    data => { data.trips[0].fare.kind = "official"; },
  ]) {
    const changed = clone(raw); mutate(changed);
    assert.throws(() => importTimetable(changed, { allowDemo: true }), code("INVALID_FARE_METADATA"));
  }
  raw.trips[0].timingQuality = "invented-exact";
  assert.throws(() => importTimetable(raw, { allowDemo: true }), code("INVALID_TIME_QUALITY"));
});
test("booking is constrained to a current offer; no charge until boarding, insufficient funds explicit", () => {
  const f = feed(), s = demoJourney(), offer = transportOffers(f, s, options)[1];
  assert.throws(() => bookTransit(f, { ...s, walletCents: 239 }, offer.id, options), code("INSUFFICIENT_FUNDS"));
  assert.throws(() => bookTransit(f, { ...s, elapsedMinutes: 3 }, offer.id, options), code("SERVICE_UNAVAILABLE_OR_STALE"));
  assert.throws(() => bookTransit(f, s, "unknown", options), code("SERVICE_UNAVAILABLE_OR_STALE"));
  const b = book(f);
  assert.equal(b.walletCents, 1000);
  assert.throws(() => book(f, b), code("BOOKING_ACTIVE"));
});
test("waiting and riding run metabolism every minute, fare once, intermediate stops only, no walked distance", () => {
  const f = feed();
  let s = book(f);
  s = step(f, s); assert.equal(s.elapsedMinutes, 1); assert.equal(s.walletCents, 1000);
  s = step(f, s); assert.equal(s.elapsedMinutes, 2); assert.equal(s.walletCents, 1000);
  s = step(f, s); assert.equal(s.walletCents, 760); assert.equal(s.col, 0);
  s = finish(f, s);
  assert.equal(s.transport.booking.status, "arrived");
  assert.equal(s.col, 7); assert.equal(s.row, 2); assert.equal(s.elapsedMinutes, 10);
  assert.equal(s.reserveKcal, 90); assert.equal(s.fatigue, 20); assert.equal(s.walletCents, 760);
  assert.equal(s.distanceMeters, 0);
  assert.deepEqual(transportRouteView(s).rides[0].points, [{ col: 0, row: 0 }, { col: 3, row: 1 }, { col: 7, row: 2 }]);
  assert.deepEqual(s.journeyMap.points, [{ col: 7, row: 2 }]);
  assert.throws(() => step(f, s), code("STALE_BOOKING"));
});
test("train uses same bounded engine", () => {
  const f = feed(), s = finish(f, book(f, demoJourney(), 2));
  assert.equal(s.elapsedMinutes, 8); assert.equal(s.walletCents, 480);
  assert.equal(s.transport.rides[0].mode, "train");
});
test("JSON save/resume at waiting, boarded and intermediate stop is deterministic, exactly once", () => {
  const f = feed();
  let s = book(f);
  for (let n = 0; n < 8; n++) {
    validateTransportSave(clone(s));
    assert.deepEqual(finish(f, clone(s)), finish(f, s));
    s = step(f, clone(s));
  }
  assert.equal(finish(f, s).walletCents, 760);
  const stale = { ...s, elapsedMinutes: s.elapsedMinutes + 1 };
  assert.throws(() => step(f, stale), code("STALE_JOURNEY_CLOCK"));
  assert.throws(() => advanceTransit(f, s, "old-id", { ...options, settle }), code("STALE_BOOKING"));
});
test("saved itinerary tampering and timetable revision changes cannot teleport", () => {
  const f = feed(), s = clone(book(f));
  s.transport.booking.calls[0].stop.col = 100;
  assert.throws(() => step(f, s), code("INVALID_TRANSPORT_SAVE"));
  const source = demoTimetable(); source.revision = "2";
  assert.throws(() => step(importTimetable(source, { allowDemo: true }), book(f)), code("STALE_TIMETABLE"));
  const broken = clone(book(f)); broken.transport.booking.nextCall = 9;
  assert.throws(() => validateTransportSave(broken), code("INVALID_TRANSPORT_SAVE"));
});
test("hunger/death while waiting or riding prevents destination arrival; no survival duplication", () => {
  const f = feed();
  for (const limit of [1, 4, 6, 9]) {
    const s = finish(f, book(f), { settle: (previous, proposed, meta) => ({
      ...settle(previous, proposed, meta), ended: proposed.elapsedMinutes >= limit ? "hunger" : null,
    }) });
    assert.equal(s.transport.booking.status, "interrupted");
    assert.equal(s.ended, "hunger"); assert.notEqual(s.col, 7);
    assert.equal(s.elapsedMinutes, limit);
    assert.throws(() => step(f, s), code("JOURNEY_ENDED"));
  }
});
test("fainting or placement interrupts even if settlement advances clock or leaves same cell", () => {
  const f = feed();
  for (const change of [{ faints: 1 }, { pressures: { placements: [{}] } }]) {
    const s = step(f, book(f), { settle: (p, n) => ({ ...n, ...change, elapsedMinutes: 481 }) });
    assert.equal(s.transport.booking.status, "interrupted"); assert.equal(s.col, 0);
  }
});
test("host health terminal outcome is generic and blocks arrival without copied health rules", () => {
  const f = feed();
  const s = finish(f, book(f), { settle: (p, n, meta) => ({
    ...settle(p, n, meta), health: n.elapsedMinutes >= 4 ? 0 : 100,
    ended: n.elapsedMinutes >= 4 ? "health" : null,
  }) });
  assert.equal(s.ended, "health"); assert.equal(s.health, 0);
  assert.equal(s.col, 0); assert.equal(s.elapsedMinutes, 4);
  assert.equal(s.transport.booking.status, "interrupted");
});
test("cancellations, delay, selectors and half-open intervals are validated; no additive duplicated delays", () => {
  const f = feed(), s = demoJourney(), at = Date.parse("2026-10-18T10:02:00+02:00");
  const notice = { id: "strike", startsAt: at, endsAt: at + 60000, routeId: "fiction-bus", cancelled: true };
  assert.equal(transportOffers(f, s, { ...options, disruptions: [notice] }).length, 1);
  const cancelled = step(f, book(f), { disruptions: [notice] });
  assert.equal(cancelled.transport.booking.status, "cancelled"); assert.equal(cancelled.walletCents, 1000);
  const ended = { ...notice, startsAt: at - 60000, endsAt: at };
  assert.equal(transportOffers(f, s, { ...options, disruptions: [ended] }).length, 3);
  const delay = { id: "late", startsAt: at, endsAt: at + 1, tripId: "demo-bus", delayMinutes: 3 };
  const o = transportOffers(f, s, { ...options, disruptions: [delay, { ...delay, id: "duplicate-report" }] })[0];
  assert.equal(o.waitMinutes, 4); // Train first, then delayed bus.
  const bus = transportOffers(f, s, { ...options, disruptions: [delay] }).find(o => o.tripId === "demo-bus");
  assert.equal(bus.waitMinutes, 5);
  assert.throws(() => transportOffers(f, s, { ...options, disruptions: [{ ...delay, delayMinutes: -1 }] }), code("INVALID_DISRUPTION"));
});
test("explicit service seconds support after-midnight GTFS-derived calls without guessed recurrence", () => {
  const raw = demoTimetable(); raw.trips = [raw.trips[0]];
  raw.trips[0].calls = raw.trips[0].calls.slice(0, 2);
  for (const [i, c] of raw.trips[0].calls.entries()) {
    c.arrival = c.departure = `2026-10-19T00:0${i + 1}:00+02:00`;
    c.arrivalServiceSeconds = c.departureServiceSeconds = 86400 + (i + 1) * 60;
  }
  const f = importTimetable(raw, { allowDemo: true });
  const s = { ...demoJourney(), startedAt: Date.parse("2026-10-18T23:59:00+02:00") };
  assert.equal(finish(f, book(f, s, 0)).col, 3);
  const afterMidnight = { ...s, startedAt: Date.parse("2026-10-19T00:00:00+02:00") };
  assert.equal(finish(f, book(f, afterMidnight, 0)).col, 3);
});
test("IANA timezone validates spring gaps, autumn folds and mismatched service dates", () => {
  const rawFor = (day, first, second) => {
    const raw = demoTimetable(); raw.validFrom = raw.validThrough = day; raw.trips = [raw.trips[0]];
    raw.trips[0].serviceDate = day; raw.trips[0].calls = raw.trips[0].calls.slice(0, 2);
    for (const [i, c] of raw.trips[0].calls.entries()) {
      c.arrival = c.departure = `${day}T02:${i ? "40" : "30"}:00${i ? second : first}`;
      c.arrivalServiceSeconds = c.departureServiceSeconds = 9000 + i * 600;
    }
    return raw;
  };
  assert.throws(() => importTimetable(rawFor("2026-03-29", "+01:00", "+01:00"), { allowDemo: true }), code("TIMEZONE_SERVICE_DATE_MISMATCH"));
  assert.doesNotThrow(() => importTimetable(rawFor("2026-10-25", "+02:00", "+01:00"), { allowDemo: true }));
  assert.throws(() => importTimetable(rawFor("2026-02-30", "+01:00", "+01:00"), { allowDemo: true }), code("INVALID_DATE"));
  assert.throws(() => importTimetable(rawFor("2026-10-25", "+03:00", "+03:00"), { allowDemo: true }), code("TIMEZONE_SERVICE_DATE_MISMATCH"));
});
test("actual existing survival + finishAction can settle awake transport without fatigue recovery or double time", () => {
  const config = JSON.parse(readFileSync(new URL("../public/config.json", import.meta.url))).survival;
  const economy = JSON.parse(readFileSync(new URL("../public/economy.json", import.meta.url)));
  const startedAt = demoJourney().startedAt;
  const initial = { ...startEconomy(startSurvival(0, 0, startedAt, "balanced", config),
    economy, () => 0), fatigue: 20 };
  const f = feed();
  const info = { latitude: 48.85, longitude: 2.35, terrain: "station" };
  const result = finish(f, book(f, initial), {
    settle(previous, proposed, meta) {
      const metabolized = restSurvival({ ...proposed, elapsedMinutes: previous.elapsedMinutes },
        { ...config, rest_minutes: meta.minutes, rest_fatigue_recovery: 0 });
      return finishAction(previous, metabolized, info, economy,
        { survival: config, sheltered: meta.sheltered, activity: meta.activity, random: () => 0 });
    },
  });
  assert.equal(result.transport.booking.status, "arrived");
  assert.equal(result.elapsedMinutes, 10);
  assert.equal(result.walletCents, initial.walletCents - 240);
  assert.equal(result.fatigue, initial.fatigue);
  assert.ok(result.reserveKcal < initial.reserveKcal);
  assert.ok(result.awakeHours > initial.awakeHours);
});
