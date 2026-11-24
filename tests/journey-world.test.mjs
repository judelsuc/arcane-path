import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { startSurvival } from "../survival.mjs";
import { startEconomy } from "../economy.mjs";
import { createTrail } from "../trail.mjs";
import { createSave, validateSave } from "../journey-save.mjs";
import { importTimetable, transportOffers } from "../layers/transport/transport.mjs";
import { demoTimetable } from "../layers/transport/demo-fixture.mjs";
import { reserveJourneyTransit, stepJourneyTransit, cancelJourneyTransit,
  validateJourneyWorld, journeyTransportOptions } from "../journey-world.mjs";
import { recordJourneyPosition, journeyMapView } from "../journey-map.mjs";
import { createLiveNarrative } from "../live-narrative.mjs";

const json = name => JSON.parse(readFileSync(new URL(name, import.meta.url)));
const economy = json("../public/economy.json"), survival = json("../public/config.json").survival;
const map = json("../public/map.json"), info = { latitude: 44.54, longitude: 2.3, terrain: "place" };
function fixture() {
  const raw = demoTimetable(); raw.kind = "supplied";
  const feed = importTimetable(raw);
  let state = startEconomy(startSurvival(0, 0, Date.parse("2026-10-18T10:00:00+02:00"), "balanced", survival), economy, () => 0);
  state = recordJourneyPosition({ ...state, walletCents: 10000, reserveKcal: 1200,
    trail: createTrail(map, 0, 0, () => 0) });
  return { state, feed };
}
const save = state => validateSave(JSON.parse(JSON.stringify(createSave({ region: "firmi", map,
  state, survival, economy }, 1)))).state;

test("real host transit preserves walking distance, spends awake metabolism, pays once and resumes a pinned schedule", () => {
  const { state, feed } = fixture(), grid = feed.gridId;
  const offer = transportOffers(feed, state, { gridId: grid })[0];
  let next = reserveJourneyTransit(state, feed, offer.id, grid);
  assert.equal(next.walletCents, state.walletCents);
  next = save(next);
  for (let count = 0; count < 200 && next.transport.booking.status === "active"; count++) {
    next = stepJourneyTransit(next, grid, info, survival, economy);
    next = save(next);
  }
  assert.equal(next.transport.booking.status, "arrived");
  assert.equal(next.walletCents, state.walletCents - offer.fareCents);
  assert.equal(next.distanceMeters, state.distanceMeters);
  assert.equal(next.fatigue, state.fatigue);
  assert.equal(next.sleeps, state.sleeps);
  assert.ok(next.awakeHours > state.awakeHours);
  assert.ok(next.reserveKcal < state.reserveKcal);
  assert.equal(next.col, offer.to.col); assert.equal(next.row, offer.to.row);
  assert.ok(journeyMapView(next).rides.length);
  assert.equal(next.journeyMap.points.length, 1, "arrival must not create a walked straight line");
});

test("unpaid cancellation is free; hunger/sleep interruptions cannot teleport to arrival", () => {
  const { state, feed } = fixture(), grid = feed.gridId;
  const offer = transportOffers(feed, state, { gridId: grid })[0];
  const booked = reserveJourneyTransit(state, feed, offer.id, grid);
  const cancelled = cancelJourneyTransit(booked);
  assert.equal(cancelled.walletCents, state.walletCents);
  assert.equal(cancelled.elapsedMinutes, state.elapsedMinutes);
  assert.equal(cancelled.transport.booking.status, "cancelled");
  const sleepy = { ...booked, awakeHours: survival.sleep_limit_hours - 0.0001 };
  const next = stepJourneyTransit(sleepy, grid, info, survival, economy);
  assert.equal(next.transport.booking.status, "interrupted");
  assert.equal(next.col, sleepy.col); assert.equal(next.row, sleepy.row);
  assert.ok(next.faints > (sleepy.faints ?? 0));
});

test("live transport rejects demos, missing/mismatched saved feeds and stale position responses", () => {
  const { state, feed } = fixture();
  assert.throws(() => reserveJourneyTransit(state, demoTimetable(), "x", feed.gridId), /DEMO/);
  const offer = transportOffers(feed, state, { gridId: feed.gridId })[0];
  const booked = reserveJourneyTransit(state, feed, offer.id, feed.gridId);
  assert.throws(() => validateJourneyWorld({ ...booked, transitFeed: undefined }), /saved timetable/);
  const altered = structuredClone(booked); altered.transitFeed.revision = "changed";
  assert.throws(() => validateJourneyWorld(altered), /match booking/);
  assert.throws(() => journeyTransportOptions({ version: 1, col: 3, row: 0, gridId: feed.gridId,
    realFeeds: [feed], coverage: [] }, state, feed.gridId), /Invalid/);
  assert.equal(journeyTransportOptions({ version: 1, col: 0, row: 0, gridId: feed.gridId,
    realFeeds: [], coverage: [], fictionalFeed: null }, state, feed.gridId).offers.length, 0);
  save(state);
});

test("name opt-in is sent only for opening stories, never for event wording or as arbitrary client prose", async () => {
  const requests = [];
  const client = createLiveNarrative({ fetcher: async (_, options) => {
    const data = JSON.parse(options.body); requests.push(data);
    return { ok: true, json: async () => ({ brief: data.brief, enabled: false, status: "disabled" }) };
  } });
  const state = { serverJourney: { id: "id" }, journalAccess: "secret", storyNameFlavour: true, name: "Lucky Luke" };
  client.prefetch(state, ["story.opening"]);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(requests[0].nameFlavour, true);
  assert.equal(JSON.stringify(requests).includes("Lucky"), false);
  client.reset(); requests.length = 0;
  client.prefetch(state, ["event.coins"]);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(Object.hasOwn(requests[0], "nameFlavour"), false);
});
