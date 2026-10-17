import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createTrail, trailTarget, atTrailTarget, witnessFacts, interviewTrail,
  validateTownTrail, loadTownTrail } from "../trail.mjs";
import { startEconomy } from "../economy.mjs";
import { startSurvival } from "../survival.mjs";
import { trailDirections, playerHint } from "../trail-ui.mjs";
import { translate } from "../i18n.mjs";

test("trail directions name the correct compass direction without negative or zero offsets", () => {
  const state = { col: 14, row: 10 };
  for (const locale of ["fr", "en"]) {
    const t = (key, params) => translate(locale, key, params);
    for (const east of [-2, 0, 2]) for (const south of [-1, 0, 1]) {
      const text = trailDirections(state, { col: 14 + east, row: 10 + south }, t);
      const expected = [];
      if (east) expected.push(t(east > 0 ? "trailEast" : "trailWest", { count: Math.abs(east) }));
      if (south) expected.push(t(south > 0 ? "trailSouth" : "trailNorth", { count: Math.abs(south) }));
      assert.equal(text, expected.length ? expected.join(t("trailDirectionJoin")) : t("trailAlreadyHere"));
      assert.doesNotMatch(text, /-\d|\b0\b/);
    }
  }
  assert.equal(trailDirections(state, { col: 15, row: 9 },
    (key, params) => translate("fr", key, params)),
  "1 case(s) vers l'est (→) et 1 case(s) vers le nord (↑)");
});

const survival = JSON.parse(readFileSync(new URL("../public/config.json", import.meta.url))).survival;
const economy = JSON.parse(readFileSync(new URL("../public/economy.json", import.meta.url)));
const maps = ["../public/map.json", "../public/maps/paris.json",
  "../public/maps/alps.json", "../public/maps/tahiti.json"].map(file =>
  JSON.parse(readFileSync(new URL(file, import.meta.url))));
const info = { latitude: 44.54, longitude: 2.3 };
const start = () => {
  const state = startEconomy(startSurvival(14, 10, Date.UTC(2026, 9, 17, 12),
    "balanced", survival), economy, () => 0);
  return { ...state, trail: createTrail(maps[0], state.col, state.row, () => 0) };
};

export function townTrailFixture() {
  const latitude = 44.54, longitude = 2.3;
  const step = 45000 / 6371008.8 * 180 / Math.PI / Math.cos(latitude * Math.PI / 180);
  return { version: 2, origin: { col: 14, row: 10, latitude, longitude },
    parentName: "Camille", index: 0, completed: false, history: [],
    stages: Array.from({ length: 10 }, (_, i) => ({
      col: -166 - 180 * i, row: 10, latitude, longitude: longitude - (i + 1) * step,
      name: `Town ${i + 1}`, osmId: `node/${i + 1}`, placeType: "town",
      legMeters: 45000, sourceUrl: "https://overpass-api.de/api/interpreter",
      retrievedAt: "2026-10-17T12:00:00Z", witnessId: `fictional-traveler-${i + 1}`,
    })) };
}

test("long trails require ten real towns 30–60 km apart and allow distant negative cells", () => {
  const trail = townTrailFixture();
  assert.equal(validateTownTrail(trail), trail);
  for (const change of [
    { placeType: "hamlet" }, { legMeters: 500 }, { longitude: 2.31 },
    { col: -8001 }, { latitude: NaN }, { sourceUrl: "javascript:alert(1)" },
  ]) {
    const bad = structuredClone(trail);
    Object.assign(bad.stages[0], change);
    assert.throws(() => validateTownTrail(bad), /Invalid town/);
  }
});

test("free hints guide known objectives without revealing future towns or changing state", () => {
  for (const locale of ["fr", "en"]) {
    const t = (key, params) => translate(locale, key, params);
    const trail = townTrailFixture();
    const state = { col: trail.origin.col, row: trail.origin.row, trail, ended: null };
    const before = structuredClone(state);
    const travel = playerHint(state, info, t);
    assert.ok(travel.includes("Town 1"));
    assert.ok(travel.includes("45.0"));
    assert.ok(!travel.includes("Town 2"));
    const arrived = { ...state, col: trail.stages[0].col, row: trail.stages[0].row };
    assert.equal(playerHint(arrived, info, t), t("hintInvestigate", { place: "Town 1" }));
    const pending = { ...arrived, trail: { ...trail, discovery: {
      pending: true, venue: "Known library", nextName: "SECRET CITY",
    } } };
    assert.equal(playerHint(pending, info, t), t("hintDirections", { venue: "Known library" }));
    assert.ok(!playerHint(pending, info, t).includes("SECRET CITY"));
    assert.equal(playerHint({ ...state, ended: "hunger" }, info, t), t("hintEnded"));
    assert.deepEqual(state, before);
    const legacy = start();
    const target = legacy.trail.stages[0];
    assert.equal(playerHint({ ...legacy, col: target.col, row: target.row }, info, t),
      t("hintInterview", { place: target.name }));
  }
});

test("offline GeoNames stages retain real source identity without inventing OSM IDs", () => {
  const route = townTrailFixture();
  for (const [index, stage] of route.stages.entries()) {
    delete stage.osmId;
    stage.geonameId = index + 1;
    stage.sourceUrl = "https://www.geonames.org/";
  }
  assert.equal(validateTownTrail(route), route);
  const invalid = structuredClone(route);
  invalid.stages[0].osmId = "node/1";
  assert.throws(() => validateTownTrail(invalid), /Invalid town/);
  const duplicate = structuredClone(route);
  duplicate.stages[1].geonameId = duplicate.stages[0].geonameId;
  assert.throws(() => validateTownTrail(duplicate), /Invalid town/);
});

test("town route loading validates new routes, propagates failures and requests one origin", async () => {
  const signal = new AbortController().signal;
  const urls = [];
  const response = data => new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
  const trail = await loadTownTrail("firmi", signal, async url => {
    urls.push(url);
    return response(townTrailFixture());
  });
  assert.equal(trail.stages.length, 10);
  assert.match(urls[0], /^\/api\/trail\?region=firmi&seed=[a-f0-9]{8}$/);
  await assert.rejects(loadTownTrail("firmi", signal, async () =>
    response({ ...townTrailFixture(), index: 1 })), /Invalid new/);
  await assert.rejects(loadTownTrail("firmi", signal, async () =>
    new Response('{"error":"No onward town 30–60 km away"}', { status: 502,
      headers: { "Content-Type": "application/json" } })), /No onward town/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(loadTownTrail("firmi", controller.signal, async () =>
    response(townTrailFixture())), { name: "AbortError" });
});

test("temporary full route queues keep polling the same job and remain cancellable", async () => {
  const urls = [];
  const progress = [];
  const trail = await loadTownTrail("firmi", new AbortController().signal, async url => {
    urls.push(url);
    return new Response(JSON.stringify(urls.length === 1 ? { error: "Queue full" } : townTrailFixture()), {
      status: urls.length === 1 ? 429 : 200, headers: { "Content-Type": "application/json" },
    });
  }, detail => progress.push(detail));
  assert.equal(trail.stages.length, 10);
  assert.equal(urls.length, 2);
  assert.equal(urls[0], urls[1]);
  assert.deepEqual(progress, [{ phase: "queued" }]);
  const controller = new AbortController();
  const loading = loadTownTrail("firmi", controller.signal, async () => {
    controller.abort();
    return new Response('{"error":"Queue full"}', { status: 429,
      headers: { "Content-Type": "application/json" } });
  });
  await assert.rejects(loading, { name: "AbortError" });
});

test("all four real maps support ten distinct local stages using existing named OSM objects", () => {
  for (const map of maps) {
    for (let seed = 0; seed < 12; seed++) {
      const col = Math.floor(map.width / 2), row = Math.floor(map.height / 2);
      const trail = createTrail(map, col, row, () => (seed + 0.5) / 12);
      assert.equal(trail.stages.length, 10);
      assert.equal(new Set(trail.stages.map(s => `${s.col},${s.row}`)).size, 10);
      for (const stage of trail.stages) {
        const cell = map.rows[stage.row][stage.col];
        assert.ok([...(cell.settlements ?? []), ...(cell.pois ?? [])].some(p =>
          p.osmId === stage.osmId && p.name === stage.name));
        assert.match(stage.witnessId, /^fictional-/);
      }
    }
  }
});

test("generation is deterministic for fixed draws and fails explicitly with insufficient map locations", () => {
  assert.deepEqual(createTrail(maps[0], 14, 10, () => 0.5),
    createTrail(maps[0], 14, 10, () => 0.5));
  assert.throws(() => createTrail({ width: 1, height: 1, rows: [[{ terrain: "plain" }]] }, 0, 0), /10 distinct/);
  assert.throws(() => createTrail(maps[0], 14, 10, () => 1), /draw/);
});

test("witness sheets constrain dialogue to the parent, current place and next real landmark", () => {
  const state = start();
  const facts = witnessFacts(state);
  assert.equal(facts.parentName, state.trail.parentName);
  assert.equal(facts.place, trailTarget(state).name);
  assert.equal(facts.next.name, state.trail.stages[1].name);
  assert.equal(facts.fictional, true);
  assert.equal(atTrailTarget(state), false);
  assert.throws(() => interviewTrail(state, info, survival, economy), /player's position/);
});

test("ten ordered encounters consume exactly five minutes each and only the last ends in reunion", () => {
  let state = start();
  for (let index = 0; index < 10; index++) {
    const target = trailTarget(state);
    state = { ...state, col: target.col, row: target.row };
    const previous = state;
    state = interviewTrail(state, info, survival, economy);
    assert.equal(state.trail.index, index + 1);
    assert.equal(state.trail.history.length, index + 1);
    assert.equal(state.elapsedMinutes - previous.elapsedMinutes, 5);
    assert.ok(state.reserveKcal < previous.reserveKcal);
    assert.equal(previous.trail.index, index);
    assert.equal(state.walletCents, previous.walletCents);
    assert.equal(state.ended, index === 9 ? "reunion" : null);
  }
  assert.equal(state.ended, "reunion");
  assert.equal(state.trail.completed, true);
  assert.equal(trailTarget(state), null);
  assert.throws(() => interviewTrail(state, info, survival, economy), /No new/);
});

test("revisiting a witness cannot advance twice and survival failure takes priority over reunion", () => {
  const state = start();
  const first = trailTarget(state);
  const next = interviewTrail({ ...state, col: first.col, row: first.row }, info, survival, economy);
  assert.throws(() => interviewTrail(next, info, survival, economy), /No new/);
  const last = state.trail.stages[2];
  const hungry = interviewTrail({ ...state, col: last.col, row: last.row, reserveKcal: 1,
    trail: { ...state.trail, index: 2 } }, info, survival, economy);
  assert.equal(hungry.ended, "hunger");
  assert.equal(hungry.trail.completed, false);
  assert.equal(hungry.trail.index, 2);
});
