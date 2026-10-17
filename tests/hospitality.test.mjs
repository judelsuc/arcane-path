import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HOSPITALITY_RULES, hospitalityTown, hospitalityStatus, askHospitality, worshipPlaces } from "../hospitality.mjs";
import { startSurvival } from "../survival.mjs";
import { applyBirthTarot, startEconomy, tarotEventChance } from "../economy.mjs";
import { createTrail } from "../trail.mjs";
import { createSave, validateSave, createJourneyStore } from "../journey-save.mjs";

const json = name => JSON.parse(readFileSync(new URL(name, import.meta.url)));
const economy = json("../public/economy.json");
const survival = json("../public/config.json").survival;
const map = json("../public/map.json");
const info = { latitude: 44.54, longitude: 2.3 };
const town = { terrain: "place", settlements: [{ osmId: "node/123", name: "Firmi" }] };
const other = { ...town, settlements: [{ osmId: "node/456", name: "Another town" }] };
function start(offset = 0, hour = 12) {
  return { ...applyBirthTarot(startEconomy(startSurvival(14, 10,
    Date.UTC(2026, 9, 17, hour) + offset, "balanced", survival), economy, () => 0), economy),
    fatigue: 50, awakeHours: 12, walletCents: 0, trail: createTrail(map, 14, 10, () => 0) };
}
const ask = (state, cell = town) => askHospitality(state, cell, info, survival, economy, () => 0);
function example(outcome, hour = 12) {
  for (let i = 0; i < 1000; i++) {
    const state = start(i, hour);
    if (ask(state).hospitalityAttempts[0].outcome === outcome) return state;
  }
  assert.fail(`No ${outcome} draw found`);
}
const details = state => ({ region: "firmi", map, state, survival, economy });
const result = state => state.hospitalityAttempts.at(-1);

const worship = (osmId, religion, name) => ({
  osmId, name, tags: { amenity: "place_of_worship", religion },
});
const religiousCell = { terrain: "church", pois: [
  worship("way/201", "christian", "Church"),
  worship("node/202", "muslim", "Mosque"),
  worship("relation/203", "jewish", "Synagogue"),
  worship("way/204", "buddhist", "Temple"),
  worship("node/205", undefined, undefined),
] };
const askWorship = (state, id, cell = religiousCell) =>
  askHospitality(state, cell, info, survival, economy, () => 0, id);

test("mapped active places of worship of all religions offer requests even outside settlements", () => {
  assert.equal(hospitalityTown(religiousCell), null);
  assert.equal(worshipPlaces(religiousCell).length, 5);
  for (const place of religiousCell.pois) {
    assert.equal(hospitalityStatus(start(), religiousCell, place.osmId).available, true);
    const next = askWorship(start(), place.osmId);
    assert.equal(result(next).placeKind, "worship");
    assert.equal(result(next).townId, place.osmId);
    assert.equal(result(next).townName, place.name ?? place.osmId);
    assert.equal(next.walletCents, 0);
    assert.equal(next.elapsedMinutes, result(next).outcome === "hosted"
      ? 30 + survival.sleep_hours * 60 : 30);
    assert.deepEqual(validateSave(createSave(details(next), 1)).state, next);
  }
});

test("worship requests exclude private, inaccessible, abandoned, disused and unavailable places", () => {
  const place = religiousCell.pois[0];
  const cell = { ...religiousCell, pois: [place, place,
    ...[{ access: "private" }, { access: "no" }, { disused: "yes" }, { abandoned: "yes" },
      { amenity: "school" }].map((tags, i) => ({
      ...place, osmId: `way/${300 + i}`, tags: { ...place.tags, ...tags },
    })),
    { ...place, osmId: "invalid" },
  ] };
  assert.deepEqual(worshipPlaces(cell), [place]);
  for (const invalid of ["way/300", "way/301", "way/302", "way/303", "way/304", "node/999"]) {
    assert.throws(() => askWorship(start(), invalid, cell), /unavailable/);
  }
  assert.deepEqual(worshipPlaces({ ...cell, unavailable: true }), []);
  assert.deepEqual(worshipPlaces(null), []);
  assert.throws(() => askWorship(start(), place.osmId, { ...cell, unavailable: true }), /unavailable/);
});

test("worship refusals and welcomes are stable, per-place/day and survive real save/resume", () => {
  const id = "relation/203";
  for (const outcome of ["hosted", "refused"]) {
    let state;
    for (let i = 0; i < 1000 && !state; i++) {
      const candidate = start(i);
      if (result(askWorship(candidate, id)).outcome === outcome) state = candidate;
    }
    assert.ok(state, `found ${outcome}`);
    const next = askWorship(state, id);
    assert.equal(next.sleeps, outcome === "hosted" ? state.sleeps + 1 : state.sleeps);
    assert.equal(next.outdoorNightMinutes, state.outdoorNightMinutes);
    assert.deepEqual(askWorship(structuredClone(state), id), next);
    const restored = validateSave(JSON.parse(JSON.stringify(createSave(details(next), 1)))).state;
    assert.equal(hospitalityStatus(restored, religiousCell, id).available, false);
    assert.throws(() => askWorship(restored, id), /already asked/);
    assert.equal(hospitalityStatus(restored, religiousCell, "way/201").available, true);
    assert.equal(hospitalityStatus(restored, town).available, true);
    const tomorrow = { ...restored, elapsedMinutes: restored.elapsedMinutes + 1440 };
    assert.equal(hospitalityStatus(tomorrow, religiousCell, id).available, true);
    assert.throws(() => askWorship({ ...state, ended: "hunger" }, id), /ended/);
    const corrupt = createSave(details(next), 1);
    corrupt.state.hospitalityAttempts[0].placeKind = "unknown";
    assert.throws(() => validateSave(corrupt), /hospitality/);
  }
});

test("hospitality requires a real named settlement cell and a stable OSM identity", () => {
  assert.equal(hospitalityTown(town).osmId, "node/123");
  for (const cell of [null, { terrain: "forest" }, { terrain: "place" },
    { ...town, unavailable: true }, { terrain: "place", settlements: [{ name: "Invented" }] }]) {
    assert.equal(hospitalityStatus(start(), cell).available, false);
    assert.throws(() => ask(start(), cell), /mapped, named/);
  }
  const settlements = [...other.settlements, ...town.settlements];
  assert.equal(hospitalityTown({ ...town, settlements }).osmId,
    hospitalityTown({ ...town, settlements: settlements.toReversed() }).osmId);
});

test("success costs exactly 30 minutes plus a free sheltered night, not food or money", () => {
  const state = example("hosted"), before = structuredClone(state), next = ask(state);
  assert.equal(HOSPITALITY_RULES.minutes, 30);
  assert.equal(next.elapsedMinutes - state.elapsedMinutes, 30 + survival.sleep_hours * 60);
  assert.equal(next.sleeps, state.sleeps + 1);
  assert.equal(next.walletCents, 0);
  assert.equal(next.lastExpenseCents, 0);
  assert.equal(next.fatigue, 0);
  assert.equal(next.awakeHours, 0);
  assert.ok(next.reserveKcal < state.reserveKcal);
  assert.equal(next.meals, state.meals);
  assert.equal(next.ended, null);
  assert.equal(next.col, state.col);
  assert.equal(next.row, state.row);
  assert.deepEqual(state, before);
});

test("refusal costs exactly 30 minutes with no recovery or reward and only one attempt per town/day", () => {
  const state = example("refused"), next = ask(state);
  assert.equal(next.elapsedMinutes - state.elapsedMinutes, 30);
  assert.equal(next.fatigue, state.fatigue);
  assert.equal(next.sleeps, state.sleeps);
  assert.equal(next.walletCents, 0);
  assert.ok(next.reserveKcal < state.reserveKcal);
  assert.equal(hospitalityStatus(next, town).available, false);
  assert.throws(() => ask(next), /already asked/);
  assert.equal(hospitalityStatus(next, other).available, true);
  const another = ask(next, other);
  assert.equal(another.hospitalityAttempts.length, 2);
  assert.equal(hospitalityStatus(another, town).available, false);
});

test("roll is stable across reloads and cell changes, with both tarot cards affecting the threshold", () => {
  const state = example("refused");
  const snapshot = createSave(details(state), 1);
  assert.deepEqual(ask(validateSave(JSON.parse(JSON.stringify(snapshot))).state), ask(state));
  assert.equal(result(ask({ ...state, col: state.col + 1 })).outcome, result(ask(state)).outcome);
  const chance = s => 1 - tarotEventChance(HOSPITALITY_RULES.failureChance, s, economy);
  assert.notEqual(chance(start()), chance({ ...start(), dailyCard: "star" }));
  assert.notEqual(chance(start()), chance({ ...start(), birthCard: "star" }));
  let dailyMatters = false;
  for (let i = 0; i < 1000 && !dailyMatters; i++) {
    const s = start(i);
    dailyMatters = result(ask(s)).outcome !== result(ask({ ...s, dailyCard: "star" })).outcome;
  }
  assert.ok(dailyMatters);
});

test("a request is charged to its starting UTC day even if asking crosses midnight", () => {
  const state = { ...example("refused", 23), elapsedMinutes: 45 };
  const next = ask(state);
  assert.equal(result(next).day, "2026-10-17");
  assert.equal(next.tarotDay, "2026-10-18");
  assert.equal(next.dailyTarotSeenDay, "2026-10-17");
  assert.equal(hospitalityStatus(next, town).available, true);
  const following = ask(next);
  assert.equal(result(following).day, "2026-10-18");
  assert.equal(hospitalityStatus(following, town).available, false);
  assert.deepEqual(validateSave(createSave(details(following), 1)).state, following);
});

test("night exposure affects asking but not hosted sleep, and no fatal need is bypassed", () => {
  const state = example("hosted", 23), hosted = ask(state);
  assert.equal(hosted.outdoorNightMinutes - state.outdoorNightMinutes, 30);
  const exhausted = ask({ ...state, reserveKcal: 1 });
  assert.equal(exhausted.ended, "hunger");
  assert.equal(result(exhausted).outcome, "exhausted");
  assert.equal(exhausted.sleeps, 0);
  assert.equal(exhausted.elapsedMinutes, 30);
  const sleepy = ask({ ...state, awakeHours: survival.sleep_limit_hours - 0.1 });
  assert.equal(sleepy.ended, null);
  assert.equal(result(sleepy).outcome, "fainted");
  assert.equal(sleepy.lastFaint.reason, "sleep");
  assert.equal(sleepy.sleeps, 0);
  assert.equal(sleepy.elapsedMinutes, 510);
  const fainted = ask({ ...state, fatigue: 99.5 });
  assert.equal(fainted.ended, null);
  assert.equal(fainted.fatigue, 40);
  assert.equal(result(fainted).outcome, "fainted");
  assert.equal(fainted.sleeps, 0);
  assert.equal(fainted.elapsedMinutes, 510);
  assert.deepEqual(validateSave(createSave(details(fainted), 1)).state, fainted);
  const hungryOvernight = ask({ ...state, reserveKcal: 40 });
  assert.equal(hungryOvernight.ended, "hunger");
  assert.equal(result(hungryOvernight).outcome, "exhausted");
  assert.throws(() => ask({ ...state, ended: "reunion" }), /ended/);
});

test("save/resume preserves history exactly and legacy states remain compatible", () => {
  for (const outcome of ["hosted", "refused"]) {
    const next = ask(example(outcome));
    const values = new Map();
    const storage = { getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value) };
    const store = createJourneyStore(storage);
    store.read("firmi");
    store.write(details(next));
    const restored = createJourneyStore(storage).read("firmi");
    assert.deepEqual(restored.state, next);
    assert.equal(hospitalityStatus(restored.state, town).available, false);
  }
  const legacy = createSave(details(start()), 1);
  assert.equal(legacy.state.hospitalityAttempts, undefined);
  assert.equal(hospitalityStatus(validateSave(legacy).state, town).available, true);
});

test("save validation rejects duplicate town/day, malformed, future and overlapping histories", () => {
  const saved = createSave(details(ask(example("refused"))), 1);
  for (const change of [
    s => { s.hospitalityAttempts = {}; },
    s => { s.hospitalityAttempts.push({ ...s.hospitalityAttempts[0] }); },
    s => { s.hospitalityAttempts[0].townId = "invented"; },
    s => { s.hospitalityAttempts[0].townName = ""; },
    s => { s.hospitalityAttempts[0].outcome = "food"; },
    s => { s.hospitalityAttempts[0].day = "2026-10-18"; },
    s => { s.hospitalityAttempts[0].startedMinutes = -1; },
    s => { s.hospitalityAttempts[0].finishedMinutes = s.elapsedMinutes + 1; },
    s => { s.hospitalityAttempts[0].finishedMinutes = 29; },
  ]) {
    const corrupt = structuredClone(saved);
    change(corrupt.state);
    assert.throws(() => validateSave(corrupt), /hospitality/);
  }
});
