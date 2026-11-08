import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { startSurvival } from "../survival.mjs";
import { startEconomy } from "../economy.mjs";
import { beginEquipment } from "../equipment.mjs";
import { beginPressures } from "../pressures.mjs";
import { recordJourneyPosition, journeyMapView } from "../journey-map.mjs";
import { createSave, validateSave } from "../journey-save.mjs";
import { transitActive } from "../journey-world.mjs";
import { createTrail } from "../trail.mjs";
import { recordTrailArrival } from "../trail.mjs";
import { recordJourneyVisit } from "../journey-visits.mjs";
import { attemptHitchhiking, finishHitchhiking, loadHitchhikingLanding, hitchhikingStopChance,
  hitchhikingAvailable, hitchhikingDestinations, validateHitchhiking, hitchhikingRideMinutes } from "../hitchhiking.mjs";

const json = name => JSON.parse(readFileSync(new URL(name, import.meta.url)));
const economy = json("../public/economy.json"), survival = json("../public/config.json").survival;
const map = json("../public/map.json"), road = { terrain: "road" };
const info = { latitude: 44.54, longitude: 0, terrain: "road" };
const town = { id: "geoname:1234", name: "A real town", latitude: 44.6, longitude: 2.5,
  distanceMeters: 8000, col: 32, row: 0 };
const fixture = () => recordJourneyPosition({ ...beginPressures(beginEquipment(startEconomy(
  startSurvival(0, 0, Date.parse("2026-10-18T10:00:00Z"), "balanced", survival), economy, () => 0)), economy),
  trail: createTrail(map, 0, 0, () => 0) });
const attempt = (state, stop, risk = .99) => {
  const values = [stop, risk];
  return attemptHitchhiking(state, town, road, info, survival, economy, () => values.shift());
};
const save = state => validateSave(JSON.parse(JSON.stringify(createSave({
  region: "firmi", map, state, survival, economy }, 1)))).state;
const finish = (state, landing, cell, stay = false) =>
  finishHitchhiking(state, landing, cell, stay, info, survival, economy);

test("stop probability measurably depends on cleanliness, local hour and modest dog penalty", () => {
  const state = fixture(), chance = hitchhikingStopChance(state, info);
  const dirty = { ...state, pressures: { ...state.pressures, cleanliness: 0 } };
  const night = { ...state, startedAt: Date.parse("2026-10-18T23:00:00Z") };
  const dog = { ...state, equipment: { ...state.equipment,
    dog: { name: "Companion", hunger: 0, careNeed: 0 } } };
  assert.ok(chance > hitchhikingStopChance(dirty, info));
  assert.ok(chance > hitchhikingStopChance(night, info));
  assert.ok(Math.abs(chance - hitchhikingStopChance(dog, info) - .05) < 1e-9);
  assert.equal(hitchhikingStopChance(state, { ...info, longitude: 180 }),
    hitchhikingStopChance(night, info));
  let stopped = 0;
  for (let n = 0; n < 1000; n++)
    if (attempt(state, (n + .5) / 1000).hitchhiking.outcome !== "no-car") stopped++;
  assert.equal(stopped, Math.round(chance * 1000));
});

test("conditional dangerous and cut-short probabilities are exact, exclusive and preserve possessions", () => {
  const state = { ...fixture(), walletCents: 1001 };
  const counts = {};
  for (let n = 0; n < 1000; n++) {
    const next = attempt(state, 0, (n + .5) / 1000);
    const outcome = next.hitchhiking.outcome;
    counts[outcome] = (counts[outcome] ?? 0) + 1;
    assert.equal(next.elapsedMinutes - state.elapsedMinutes, 30);
    assert.equal(next.distanceMeters, state.distanceMeters);
    assert.deepEqual(next.equipment.items, state.equipment.items);
    if (outcome === "theft") assert.equal(next.walletCents, 500);
    else assert.equal(next.walletCents, state.walletCents);
    if (outcome === "injury") assert.equal(next.health, 80);
  }
  assert.deepEqual(counts, { injury: 10, theft: 10, short: 80, arrived: 900 });
});

test("misses cost exactly thirty minutes; free accepted rides save, resume and preserve walking history", async () => {
  const state = fixture();
  const missed = save(attempt(state, .999));
  assert.equal(missed.hitchhiking.outcome, "no-car");
  assert.equal(missed.elapsedMinutes, state.elapsedMinutes + 30);
  assert.equal(missed.col, state.col);
  let next = save(attempt(state, 0));
  assert.equal(transitActive(next), true);
  assert.throws(() => attempt(next, 0), /not available/);
  const failedStream = { load: async () => { throw new Error("Network unavailable"); } };
  await assert.rejects(loadHitchhikingLanding(next, failedStream), /Network unavailable/);
  next = save(next);
  const stream = { load: async () => ({ rows: Array.from({ length: 8 }, () =>
    Array.from({ length: 8 }, () => ({ terrain: "place" }))) }) };
  const loaded = await loadHitchhikingLanding(next, stream);
  const arrived = save(finish(next, loaded.landing, loaded.cell));
  assert.equal(arrived.col, town.col);
  assert.equal(arrived.elapsedMinutes, state.elapsedMinutes + 30 + 12);
  assert.equal(arrived.hitchhiking.rideMinutes, 12);
  assert.ok(arrived.reserveKcal < next.reserveKcal);
  assert.ok(arrived.awakeHours > next.awakeHours);
  assert.equal(arrived.walletCents, state.walletCents);
  assert.equal(arrived.distanceMeters, state.distanceMeters);
  assert.equal(arrived.journeyMap.points.length, 1);
  assert.equal(journeyMapView(arrived).rides[0].mode, "car");
  assert.deepEqual(journeyMapView(arrived).walkedLegs[0], state.journeyMap);
  assert.equal(transitActive(arrived), false);
  assert.throws(() => finish(arrived, loaded.landing, loaded.cell), /Invalid/);
});

test("short and robbed rides land on a real road between endpoints, and recovery never recharges", async () => {
  const state = fixture();
  const next = save(attempt(state, 0, .05));
  let calls = 0;
  const stream = { load: async () => {
    calls++;
    const rows = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => ({ terrain: "plain" })));
    rows[0][1] = road;
    return { rows };
  } };
  const loaded = await loadHitchhikingLanding(next, stream);
  assert.equal(calls, 1);
  assert.equal(loaded.landing.col, 17);
  const landed = save(finish(next, loaded.landing, loaded.cell));
  assert.equal(landed.hitchhiking.outcome, "short");
  assert.equal(landed.elapsedMinutes, state.elapsedMinutes + 30 + 7);
  assert.throws(() => finish(next, town, { terrain: "plain" }), /mapped road/);
  const recovered = save(finish(next, next.hitchhiking.origin, road, true));
  assert.equal(recovered.hitchhiking.outcome, "recovered");
  assert.equal(recovered.col, 0);
  assert.deepEqual(recovered.journeyMap, state.journeyMap);
  assert.equal(recovered.elapsedMinutes, state.elapsedMinutes + 30);
  const noRoad = { load: async () => ({ rows: Array.from({ length: 8 }, () =>
    Array.from({ length: 8 }, () => ({ terrain: "plain" }))) }) };
  await assert.rejects(loadHitchhikingLanding(next, noRoad), /No mapped road/);
});

test("hunger/health and sleep interruptions during waiting remain saveable without completing thirty minutes", () => {
  const base = fixture();
  const starving = { ...base, reserveKcal: 0, health: .1 };
  const hurt = { ...base, reserveKcal: .01, health: .1 };
  const sleepy = { ...base, awakeHours: survival.sleep_limit_hours - .001 };
  for (const state of [starving, hurt, sleepy]) {
    const next = save(attempt(state, 0));
    assert.equal(next.hitchhiking.outcome, "interrupted");
    assert.equal(next.hitchhiking.status, "complete");
    assert.equal(next.col, state.col);
    assert.equal(next.distanceMeters, state.distanceMeters);
    assert.equal(transitActive(next), false);
  }
  assert.ok(attempt(starving, 0).elapsedMinutes < 30);
  assert.equal(attempt(starving, 0).ended, "health");
  assert.ok(attempt(sleepy, 0).faints > (sleepy.faints ?? 0));
});

test("ride survival interruptions prevent teleportation and never stay pending or apply time twice", () => {
  const base = fixture(), pending = attempt(base, 0);
  for (const state of [
    { ...pending, reserveKcal: 0, health: .1 },
    { ...pending, awakeHours: survival.sleep_limit_hours - .001 },
  ]) {
    const next = save(finish(state, town, { terrain: "place" }));
    assert.equal(next.hitchhiking.outcome, "interrupted");
    assert.equal(next.hitchhiking.status, "complete");
    assert.equal(next.col, state.col);
    assert.equal(transitActive(next), false);
    assert.throws(() => finish(next, town, { terrain: "place" }), /Invalid/);
  }
  assert.equal(hitchhikingRideMinutes(pending.hitchhiking), 12);
  assert.equal(hitchhikingRideMinutes({ ...pending.hitchhiking,
    destination: { ...town, distanceMeters: 100000000 } }), 720);
});

test("successful and shortened road arrivals feed the same trail/visit hooks as scheduled transit", () => {
  for (const risk of [.99, .05]) {
    const base = fixture();
    const arrival = risk === .99 ? town : { ...town, col: 17 };
    const state = { ...base, trail: { ...base.trail, stages: base.trail.stages.map((stage, index) =>
      index ? stage : { ...stage, col: arrival.col, row: arrival.row }) } };
    const pending = attempt(state, 0, risk);
    const arrived = finish(pending, arrival, risk === .99 ? { terrain: "place" } : road);
    const recorded = recordJourneyVisit(recordTrailArrival(arrived),
      { settlements: [{ name: town.name }] });
    assert.equal(recorded.trail.arrivals[0].elapsedMinutes, recorded.elapsedMinutes);
    assert.equal(recorded.journeyVisits[0].name, town.name);
    assert.equal(recorded.hitchhiking.rideMinutes, risk === .99 ? 12 : 7);
  }
  const ui = readFileSync(new URL("../travel-ui.mjs", import.meta.url), "utf8");
  const resume = ui.slice(ui.indexOf("async function resumeHitchhiking"), ui.indexOf("const journeyWorldUI"));
  const transit = ui.slice(ui.indexOf("async advance()"), ui.indexOf("const equipmentUI"));
  assert.match(resume, /finishJourneyArrival\(\)/);
  assert.match(transit, /finishJourneyArrival\(\)/);
  assert.match(ui, /function finishJourneyArrival\(\)[\s\S]*?draw\(\);[\s\S]*?serviceQuestsUI\.localize\(\);[\s\S]*?questTrackingUI\.localize\(\);/);
});

test("cancelled map loads stop before scanning further chunks and cannot finalize a stale journey", async () => {
  const controller = new AbortController();
  const next = attempt(fixture(), 0, .05);
  let loads = 0;
  const stream = { load: async () => {
    loads++; controller.abort();
    return { rows: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => road)) };
  } };
  await assert.rejects(loadHitchhikingLanding(next, stream, false, controller.signal),
    reason => reason.name === "AbortError");
  assert.equal(loads, 1);
  assert.equal(next.hitchhiking.status, "pending");
  assert.equal(next.elapsedMinutes, 30);
});

test("road-only and destination/save validation reject stale, duplicate or malformed data", () => {
  const state = fixture();
  const towns = Array.from({ length: 10 }, (_, n) => ({ ...town, id: `geoname:${100 + n}`, col: n + 1 }));
  const payload = { version: 1, gridId: "firmi", col: 0, row: 0, destinations: towns };
  assert.equal(hitchhikingDestinations(payload, state, "firmi").length, 10);
  for (const destinations of [towns.slice(1), [...towns, town], Array(10).fill(town)])
    assert.throws(() => hitchhikingDestinations({ ...payload, destinations }, state, "firmi"), /Invalid/);
  assert.throws(() => hitchhikingDestinations(payload, { ...state, col: 1 }, "firmi"), /Invalid/);
  for (const position of [{ latitude: 91 }, { longitude: 181 }])
    assert.throws(() => hitchhikingDestinations({ ...payload,
      destinations: [{ ...towns[0], ...position }, ...towns.slice(1)] }, state, "firmi"), /Invalid/);
  assert.equal(hitchhikingAvailable({ terrain: "major_road" }), true);
  assert.equal(hitchhikingAvailable({ terrain: "road", unavailable: true }), false);
  assert.equal(hitchhikingAvailable({ terrain: "plain" }), false);
  const next = attempt(state, 0);
  assert.throws(() => validateHitchhiking({ ...next, elapsedMinutes: 29 }), /Invalid/);
  assert.throws(() => validateHitchhiking({ ...next, col: 1 }), /Invalid/);
});
