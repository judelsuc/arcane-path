import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beginExploration, fieldSearchRules, fieldSearchChance, fieldSearchAvailable,
  prepareFieldSearch, applyFieldSearch, loadSearchProximity, fieldClueText,
  prepareRecognition, askAboutClue, recognitionHint } from "../trail-search.mjs";
import { startSurvival } from "../survival.mjs";
import { startEconomy } from "../economy.mjs";
import { trailClue } from "../trail-actions.mjs";
import { setupTrail, trailReminder, parentClueText, playerHint } from "../trail-ui.mjs";
import { recordTrailArrival } from "../trail.mjs";
import { createSave, validateSave } from "../journey-save.mjs";
import { translate } from "../i18n.mjs";

const json = name => JSON.parse(readFileSync(new URL(name, import.meta.url)));
const survival = json("../public/config.json").survival, economy = json("../public/economy.json");
const map = json("../public/map.json"), cell = { terrain: "place", countryCodes: ["FR"] };
const info = { latitude: 44.54, longitude: 2.3 };
function start() {
  const step = 45000 / 6371008.8 * 180 / Math.PI / Math.cos(info.latitude * Math.PI / 180);
  const origin = { ...info, col: 14, row: 10 };
  const stages = Array.from({ length: 10 }, (_, i) => ({
    ...info, col: 194 + i * 180, row: 10, longitude: info.longitude + (i + 1) * step,
    name: `Secret Town ${i + 1}`, osmId: `node/${i + 1}`, placeType: "town", legMeters: 45000,
    sourceUrl: "https://overpass-api.de/api/interpreter", retrievedAt: "2026-10-17T12:00:00Z",
    witnessId: `fictional-traveler-${i + 1}`,
  }));
  return beginExploration({ ...startEconomy(startSurvival(14, 10,
    Date.UTC(2026, 9, 17, 12), "balanced", survival), economy, () => 0),
  trail: { version: 2, origin, parentName: "Camille", stages, index: 0, history: [], completed: false } });
}
const signal = () => new AbortController().signal;
const response = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json" },
});
const save = state => createSave({ region: "firmi", map, state, survival, economy }, 1);
async function search(state, { pathDistance = 0, cost = 0, chance = 0, kind = 0, photo = null } = {}) {
  const rolls = [cost, cost, chance, kind];
  return prepareFieldSearch(state, cell, async () => photo, signal(), {
    proximity: async () => pathDistance, random: () => rolls.shift(),
  });
}
function collected(kind = "prefix", precision = "vague") {
  const state = start();
  state.elapsedMinutes = 60;
  const hint = { stage: 0, kind, precision, col: state.col, row: state.row, elapsedMinutes: 60 };
  state.trail.exploration.hints.push(hint);
  return state;
}
const town = (name, latitude = 45, longitude = 3) => ({ name, latitude, longitude });
const prepared = (state, towns) => ({ hint: recognitionHint(state), col: state.col, row: state.row, towns });

test("loaded land cells allow field searches; unavailable cells, water and ended journeys do not", () => {
  const state = start();
  for (const terrain of ["forest", "plain", "road", "mountain", "place"]) {
    assert.equal(fieldSearchAvailable(state, { terrain }), true);
  }
  for (const c of [null, { terrain: "water" }, { terrain: "plain", unavailable: true }]) {
    assert.equal(fieldSearchAvailable(state, c), false);
  }
  assert.equal(fieldSearchAvailable({ ...state, ended: "hunger" }, cell), false);
  assert.equal(fieldSearchAvailable({ ...state, trail: { ...state.trail, completed: true } }, cell), false);
});

test("precision boundaries are exact and random cost ranges shrink with proximity", async () => {
  const state = start(), target = state.trail.stages[0];
  for (const [cells, precision] of [[61, "vague"], [60, "partial"], [13, "partial"], [12, "precise"], [0, "precise"]]) {
    const s = { ...state, col: target.col - cells };
    assert.equal(fieldSearchRules(s).precision, precision);
    const low = await search(s), high = await search(s, { cost: 0.999999 });
    const rules = fieldSearchRules(s);
    assert.equal(low.minutes, rules.minMinutes);
    assert.equal(high.minutes, rules.maxMinutes);
    assert.equal(low.fatigue, rules.minFatigue);
    assert.equal(high.fatigue, rules.maxFatigue);
  }
  const far = fieldSearchRules(state), near = fieldSearchRules({ ...state, col: target.col });
  assert.deepEqual([far.minMinutes, far.maxMinutes, far.minFatigue, far.maxFatigue], [30, 60, 4, 7]);
  assert.deepEqual([near.minMinutes, near.maxMinutes, near.minFatigue, near.maxFatigue], [8, 14, 1, 2]);
});

test("actual route proximity determines success rather than distance to target; errors have no action cost", async () => {
  const state = start(), before = structuredClone(state);
  assert.ok(Math.abs(fieldSearchChance(0) - 0.90) < 1e-10);
  assert.ok(fieldSearchChance(3000) < fieldSearchChance(1000));
  assert.ok(fieldSearchChance(15000) > 0.14 && fieldSearchChance(15000) < 0.15);
  assert.ok((await search(state, { chance: 0.5, pathDistance: 0 })).kind);
  assert.equal((await search(state, { chance: 0.5, pathDistance: 15000 })).kind, null);
  for (const bad of [-1, NaN, Infinity]) assert.throws(() => fieldSearchChance(bad), /proximity/);
  for (const bad of [-1, 1, NaN]) await assert.rejects(search(state, { cost: bad }), /draw/);
  await assert.rejects(prepareFieldSearch(state, cell, async () => null, signal(), {
    proximity: async () => { throw new Error("Offline"); },
  }), /Offline/);
  assert.deepEqual(state, before);
});

test("gentler success probabilities meet the near and far thresholds without a route meter", () => {
  assert.ok(fieldSearchChance(6000) > .38 && fieldSearchChance(6000) < .39);
  assert.ok(fieldSearchChance(10000) > .23 && fieldSearchChance(10000) < .24);
  assert.ok(fieldSearchChance(1000000) >= .08);
});

test("small signs are frequent near the route, saved separately and never identify or advance a town", async () => {
  const state = start();
  const result = await search(state, { chance: .92 });
  assert.equal(result.kind, "sign");
  const next = applyFieldSearch(state, result, cell, info, survival, economy);
  assert.equal(next.trail.index, 0);
  assert.equal(next.trail.exploration.hints.length, 0);
  assert.equal(next.trail.exploration.signs.length, 1);
  assert.equal(next.trail.exploration.lastSearch.outcome, "sign");
  assert.equal(recognitionHint(next), undefined);
  assert.deepEqual(validateSave(JSON.parse(JSON.stringify(save(next)))).state, next);
  assert.equal((await search(state, { chance: .92, pathDistance: 6001 })).kind, null);
  assert.ok(!trailReminder(next, (key, args) => translate("en", key, args)).includes("Secret"));
});

test("three distinct nearby misses guarantee at least a sign at the next new nearby cell, including after resume", async () => {
  let state = start();
  const commit = async s => applyFieldSearch(s, await search(s, { chance: .999 }), cell, info, survival, economy);
  state = await commit(state);
  state = await commit(state);
  assert.equal(state.trail.exploration.searchStreak.misses.length, 1);
  for (let i = 0; i < 2; i++) state = await commit({ ...state, row: state.row + 1 });
  assert.equal(state.trail.exploration.searchStreak.misses.length, 3);
  const repeated = await search(state, { chance: .999 });
  assert.equal(repeated.kind, null);
  state = validateSave(JSON.parse(JSON.stringify(save(state)))).state;
  const moved = { ...state, row: state.row + 1 };
  assert.equal((await search(moved, { chance: .999, pathDistance: 6001 })).kind, null);
  const sign = await search(moved, { chance: .999, pathDistance: 6000 });
  assert.equal(sign.kind, "sign");
  state = applyFieldSearch(moved, sign, cell, info, survival, economy);
  assert.equal(state.trail.exploration.searchStreak.misses.length, 0);
  assert.equal(state.trail.exploration.signs.length, 1);
  assert.equal(state.trail.index, 0);
});

test("successful evidence clears the unlucky streak, earlier stages cannot guarantee a sign", async () => {
  const state = start();
  state.trail.exploration.searchStreak = { stage: 0, misses: [
    { col: 1, row: 1 }, { col: 2, row: 1 }, { col: 3, row: 1 },
  ] };
  const next = applyFieldSearch(state, await search(state), cell, info, survival, economy);
  assert.equal(next.trail.exploration.searchStreak.misses.length, 0);
  const later = { ...state, trail: { ...state.trail, index: 1 } };
  assert.equal((await search(later, { chance: .999 })).kind, null);
});

test("reassurance history is bounded and malformed or future streak/sign records are rejected", async () => {
  let state = start();
  for (let i = 0; i < 6; i++) {
    state = { ...state, row: state.row + 1 };
    state = applyFieldSearch(state, await search(state, { chance: .92 }), cell, info, survival, economy);
  }
  assert.equal(state.trail.exploration.signs.length, 4);
  assert.deepEqual(validateSave(JSON.parse(JSON.stringify(save(state)))).state, state);
  for (const mutate of [
    e => { e.signs[0].stage = 9; },
    e => { e.signs[0].elapsedMinutes = 9999; },
    e => { e.searchStreak.misses = [{ col: 1, row: 1 }, { col: 1, row: 1 }]; },
    e => { e.searchStreak.misses = [{ col: NaN, row: 0 }]; },
    e => { e.signs.push({ ...e.signs[0] }); },
  ]) {
    const bad = structuredClone(state);
    mutate(bad.trail.exploration);
    assert.throws(() => save(bad), /field clue/);
  }
});

test("twenty narrative direction discoveries stay stable, anchored and localized without destination leaks", () => {
  const state = start(), texts = new Set();
  for (const locale of ["fr", "en"]) {
    const t = (key, args) => translate(locale, key, args);
    for (let col = 0; col < 20; col++) {
      const hint = { stage: 0, col, row: 10, kind: "direction" };
      const text = fieldClueText(state, hint, t);
      assert.match(text, /Camille/);
      assert.doesNotMatch(text, /Secret|fieldDirection|undefined/);
      assert.equal(fieldClueText({ ...state, col: 500 }, hint, t), text);
      texts.add(text);
    }
  }
  assert.equal(texts.size, 40);
});

test("successful and empty searches both consume rolled time, energy and fatigue without advancing", async () => {
  for (const chance of [0, 0.99]) {
    const state = start(), result = await search(state, { chance });
    const next = applyFieldSearch(state, result, cell, info, survival, economy);
    assert.equal(next.elapsedMinutes, result.minutes);
    assert.ok(next.fatigue >= result.fatigue);
    assert.ok(next.reserveKcal < state.reserveKcal);
    assert.ok(next.energyKcal > result.minutes);
    assert.equal(next.walletCents, state.walletCents);
    assert.equal(next.lastExpenseCents, 0);
    assert.equal(next.trail.index, 0);
    assert.equal(next.trail.exploration.lastSearch.outcome, chance ? "nothing" : "found");
    assert.deepEqual(validateSave(JSON.parse(JSON.stringify(save(next)))).state, next);
  }
});

test("nearby successful searches reveal the current town but never advance or reveal the next", async () => {
  const initial = start(), state = { ...initial, col: initial.trail.stages[0].col - 8 };
  const result = await search(state);
  assert.equal(result.kind, "place");
  const next = applyFieldSearch(state, result, cell, info, survival, economy);
  for (const locale of ["fr", "en"]) {
    const t = (key, args) => translate(locale, key, args);
    assert.ok(trailReminder(next, t).includes(state.trail.stages[0].name));
    assert.ok(!trailReminder(next, t).includes(state.trail.stages[1].name));
  }
  assert.equal(next.trail.index, 0);
});

test("town letters and photos become collected vague clues that people can recognize for the next lead", () => {
  for (const [kind, expected] of [["photo", "photo"], ["letter", "prefix"], ["discuss", "direction"]]) {
    const initial = start(), state = { ...initial, col: initial.trail.stages[0].col };
    const next = trailClue(state, kind, cell, info, survival, economy);
    const hint = next.trail.exploration.hints[0];
    assert.equal(hint.kind, expected);
    assert.equal(hint.stage, 1);
    assert.equal(hint.precision, "vague");
    assert.equal(Boolean(recognitionHint(next)), kind !== "discuss");
    assert.deepEqual(validateSave(JSON.parse(JSON.stringify(save(next)))).state, next);
    for (const locale of ["fr", "en"]) {
      const t = (key, args) => translate(locale, key, args);
      assert.doesNotMatch(parentClueText(next, next.trail.discovery, t), /Secret Town 2/);
    }
  }
});

test("photo preparation is free until committed, falls back explicitly, deduplicates hints and rejects stale commits", async () => {
  const state = start(), before = structuredClone(state);
  const result = await search(state, { kind: 0.9 });
  assert.equal(result.kind, "prefix");
  assert.equal(result.photoUnavailable, true);
  assert.deepEqual(state, before);
  const content = { blob: new Blob(["real decoded photo fixture"]) };
  const photo = await search(state, { kind: 0.9, photo: content });
  assert.equal(photo.kind, "photo");
  assert.equal(photo.content, content);
  const next = applyFieldSearch(state, result, cell, info, survival, economy);
  const again = applyFieldSearch(next, await search(next, { kind: 0.5 }), cell, info, survival, economy);
  assert.equal(again.trail.exploration.hints.length, 1);
  assert.equal(next.trail.exploration.lastSearch.repeated, undefined);
  assert.equal(again.trail.exploration.lastSearch.repeated, true);
  assert.equal(again.elapsedMinutes, 60);
  assert.throws(() => applyFieldSearch({ ...state, col: state.col + 1 }, result, cell, info, survival, economy), /Stale/);
  assert.throws(() => applyFieldSearch(state, { ...result, minutes: 0 }, cell, info, survival, economy), /Invalid/);
  assert.deepEqual(validateSave(JSON.parse(JSON.stringify(save(again)))).state, again);
  for (const invalid of ["yes", 1]) {
    const malformed = structuredClone(again);
    malformed.trail.exploration.lastSearch.repeated = invalid;
    assert.throws(() => validateSave(save(malformed)));
  }
});

test("search interrupted by fainting or hunger cannot award hints", async () => {
  const state = { ...start(), reserveKcal: 1 };
  const next = applyFieldSearch(state, await search(state), cell, info, survival, economy);
  assert.equal(next.trail.exploration.hints.length, 0);
  assert.notEqual(next.trail.exploration.lastSearch.outcome, "found");
});

test("FR/EN new leads never leak town names, distances or future town clues; old known leads survive resume", async () => {
  const state = start();
  for (const locale of ["fr", "en"]) {
    const t = (key, args) => translate(locale, key, args);
    for (const text of [trailReminder(state, t), playerHint(state, info, t)]) {
      assert.doesNotMatch(text, /Secret|Town|45000|45 km|194/);
    }
    const hint = { stage: 0, col: 14, row: 10, kind: "prefix", precision: "vague" };
    assert.ok(fieldClueText(state, hint, t).includes("Se"));
    assert.doesNotMatch(fieldClueText(state, hint, t), /Secret/);
    const atTown = { ...state, col: state.trail.stages[0].col };
    const next = trailClue(atTown, "discuss", cell, info, survival, economy);
    assert.equal(next.trail.index, 1);
    assert.doesNotMatch(parentClueText(next, next.trail.discovery, t), /Secret/);
    assert.doesNotMatch(trailReminder(next, t), /Secret/);
    assert.deepEqual(validateSave(JSON.parse(JSON.stringify(save(next)))).state, next);
    const legacy = structuredClone(state);
    delete legacy.trail.exploration;
    const resumed = beginExploration(legacy, true);
    assert.ok(trailReminder(resumed, t).includes("Secret Town 1"));
  }
  const short = { ...state, trail: { ...state.trail, stages: [{ name: "Eu" }] } };
  assert.equal(fieldClueText(short, { stage: 0, kind: "prefix", precision: "partial" },
    (key, args) => args.prefix), "E");
});

test("proximity requests require exact stage/position, fail explicitly on pending/bad servers and never accept geometry", async () => {
  const state = { ...start(), serverJourney: { id: "a".repeat(32) } };
  const data = { status: "ready", version: "grid-walk-v1", stage: 0, col: 14, row: 10, pathDistanceMeters: 1250 };
  assert.equal(await loadSearchProximity(state, signal(), async url => {
    assert.match(url, /col=14&row=10/);
    return response(data);
  }), 1250);
  for (const value of [{ ...data, col: 15 }, { ...data, stage: 1 }, { ...data, pathDistanceMeters: -1 }]) {
    await assert.rejects(loadSearchProximity(state, signal(), async () => response(value)), /Invalid/);
  }
  await assert.rejects(loadSearchProximity(state, signal(), async () => response({ status: "loading" }, 202)), /prepared/);
  await assert.rejects(loadSearchProximity(state, signal(), async () => new Response("<html>")), /updated/);
});

test("prefix recognition usually suggests the nearest real matching town and may confuse alternatives", () => {
  const state = collected(), candidates = [town("Secretville"), town("Seaside")];
  for (const [roll, name] of [[0, "Secretville"], [0.79, "Secretville"], [0.8, "Seaside"], [0.999, "Seaside"]]) {
    const rolls = [0, roll];
    const result = askAboutClue(state, prepared(state, candidates), cell, info, survival, economy, () => rolls.shift());
    assert.equal(result.outcome, "suggestion");
    assert.equal(result.state.trail.exploration.lastReport.town.name, name);
    assert.equal(result.state.elapsedMinutes, 70);
    assert.equal(result.state.trail.index, 0);
    assert.equal(result.state.trail.exploration.hints.length, 1);
    assert.deepEqual(validateSave(JSON.parse(JSON.stringify(save(result.state)))).state, result.state);
  }
  const one = askAboutClue(state, prepared(state, [candidates[0]]), cell, info, survival, economy, () => 0.89);
  assert.equal(one.state.trail.exploration.lastReport.town.name, "Secretville");
});

test("photo recognition can correctly identify or mistake a real town, without marking either answer as confirmed", () => {
  const state = collected("photo"), target = state.trail.stages[0];
  const candidates = [town(target.name, target.latitude, target.longitude), town("Other real town")];
  for (const [roll, expected] of [[0, target.name], [0.64, target.name], [0.65, "Other real town"], [0.99, "Other real town"]]) {
    const rolls = [0, roll];
    const result = askAboutClue(state, prepared(state, candidates), cell, info, survival, economy, () => rolls.shift());
    const report = result.state.trail.exploration.lastReport;
    assert.equal(report.town.name, expected);
    assert.equal(report.correct, undefined);
    for (const locale of ["fr", "en"]) {
      assert.match(translate(locale, "fieldReport.suggestion", { place: report.town.name }),
        locale === "fr" ? /non confirmé/ : /Unconfirmed/);
    }
    assert.deepEqual(validateSave(JSON.parse(JSON.stringify(save(result.state)))).state, result.state);
  }
});

test("nobody, unknown clues, hunger and stale recognition never grant suggestions", () => {
  const state = collected();
  const nobody = askAboutClue(state, prepared(state, [town("Seaside")]),
    { terrain: "forest" }, info, survival, economy, () => 0.99);
  assert.equal(nobody.outcome, "nobody");
  const unsure = askAboutClue(state, prepared(state, []), cell, info, survival, economy, () => 0);
  assert.equal(unsure.outcome, "unsure");
  const exhaustedState = { ...state, reserveKcal: 1 };
  const exhausted = askAboutClue(exhaustedState, prepared(exhaustedState, [town("Seaside")]),
    cell, info, survival, economy, () => 0);
  assert.notEqual(exhausted.outcome, "suggestion");
  assert.equal(exhausted.state.trail.exploration.reports.length, 0);
  assert.throws(() => askAboutClue({ ...state, col: 15 }, prepared(state, []),
    cell, info, survival, economy), /Stale/);
});

test("recognition API validates collected clue, candidates and stale replies, with explicit provider failures", async () => {
  const state = { ...collected(), serverJourney: { id: "a".repeat(32) } }, hint = recognitionHint(state);
  const data = { status: "recognition", stage: 0, col: 14, row: 10,
    kind: "vague-prefix", towns: [town("Seaside")], sourceUrl: "https://www.geonames.org/" };
  const valid = await prepareRecognition(state, hint, signal(), async url => {
    assert.match(url, /recognize=vague-prefix/);
    return response(data);
  });
  assert.deepEqual(valid.towns, data.towns);
  for (const bad of [{ ...data, stage: 1 }, { ...data, towns: [town("Bad", NaN)] },
    { ...data, sourceUrl: "http://evil.test" }]) {
    await assert.rejects(prepareRecognition(state, hint, signal(), async () => response(bad)), /Invalid/);
  }
  await assert.rejects(prepareRecognition(state, hint, signal(),
    async () => response({ error: "Offline" }, 503)), /Offline/);
  await assert.rejects(prepareRecognition(state, { ...hint }, signal()), /collected/);
});

test("save validation rejects malformed or future hint/recognition history", () => {
  const state = collected();
  for (const mutate of [
    e => { e.version = 2; }, e => { e.firstStage = -1; }, e => { e.knownStage = 5; },
    e => { e.hints[0].stage = 1; }, e => { e.hints[0].kind = "place"; },
    e => { e.hints[0].elapsedMinutes = 9999; }, e => { e.hints[0].col = 194; },
    e => { e.hints.push({ ...e.hints[0] }); },
    e => { e.reports = [{ stage: 0, kind: "prefix", precision: "vague", elapsedMinutes: 10,
      outcome: "suggestion", town: town("Bad", 90) }]; },
  ]) {
    const bad = structuredClone(state);
    mutate(bad.trail.exploration);
    assert.throws(() => save(bad), /field clue/);
  }
});

for (const locale of ["fr", "en"]) {
  test(`${locale} actual journal handlers search, ask about fragments and retain unconfirmed guesses on resume`, async t => {
    const original = { document: globalThis.document, fetch: globalThis.fetch, random: Math.random };
    t.after(() => {
      globalThis.document = original.document;
      globalThis.fetch = original.fetch;
      Math.random = original.random;
    });
    class Element {
      dataset = {};
      children = []; events = {}; textContent = ""; open = false;
      nextElementSibling = { hidden: false };
      addEventListener(type, listener) { this.events[type] = listener; }
      append(...children) { this.children.push(...children); }
      replaceChildren() { this.children = []; }
      showModal() { this.open = true; }
      close() { this.open = false; }
    }
    const elements = new Map();
    const element = selector => {
      if (!elements.has(selector)) elements.set(selector, new Element());
      return elements.get(selector);
    };
    globalThis.document = {
      documentElement: { lang: locale }, createElement: () => new Element(),
      querySelector: selector => selector === "dialog[open]"
        ? [...elements.values()].find(e => e.open) ?? null : element(selector),
    };
    let state = { ...start(), serverJourney: { id: "a".repeat(32), seed: "00000042",
      contentVersion: "a".repeat(64), createdAt: "2026-10-17T12:00:00.000Z" } };
    globalThis.fetch = async url => {
      const query = new URL(url, "http://localhost").searchParams;
      return response(query.has("recognize")
        ? { status: "recognition", stage: 0, col: state.col, row: state.row,
          kind: query.get("recognize"), towns: [town("Seaside"), town("Secretville")],
          sourceUrl: "https://www.geonames.org/" }
        : { status: "ready", version: "grid-walk-v1", stage: 0,
          col: state.col, row: state.row, pathDistanceMeters: 0 });
    };
    let rolls = [0, 0, 0, 0.5];
    Math.random = () => rolls.shift() ?? 0;
    const ui = setupTrail((key, args) => translate(locale, key, args), {
      context: () => ({ state, cell, info, data: economy, blocked: false }),
      searchField(result) { state = applyFieldSearch(state, result, cell, info, survival, economy); },
      recognizeField(prepared) { state = askAboutClue(state, prepared, cell, info, survival, economy).state; },
    });
    const texts = node => [node.textContent, ...node.children.flatMap(texts)];
    ui.open();
    const searchItem = element("#trail-actions").children.find(c =>
      c.children.some(b => b.id === "clue-field-search"));
    assert.equal(searchItem.children[0].id, "clue-field-search");
    const help = searchItem.children.find(c => c.children[0]?.textContent ===
      translate(locale, "fieldSearchHelp"));
    assert.ok(help);
    assert.notEqual(help.open, true);
    assert.match(searchItem.children[1].textContent, /min/);
    assert.doesNotMatch(element("#trail-target").textContent, /Secret/);
    await element("#trail-actions").children.find(c => c.children.some(b => b.id === "clue-field-search"))
      .children.find(b => b.id === "clue-field-search").events.click();
    assert.equal(state.elapsedMinutes, 30);
    assert.match(element("#trail-target").textContent, /Se/);
    assert.ok(element("#trail-history").children[0].children.every(b => !b.events.click));
    element("#trail-dialog").close();
    element("#open-hint").events.click();
    assert.equal(element("#hint-dialog").open, true);
    const ask = element("#hint-clues").children[0].children.find(b => b.events.click);
    await ask.events.click();
    assert.equal(state.elapsedMinutes, 40);
    assert.equal(state.trail.exploration.lastReport.town.name, "Seaside");
    assert.match(element("#hint-guidance").textContent, /coordinates|coordonnées/);
    assert.match(element("#hint-guidance").textContent, /unconfirmed|non confirmé/i);
    assert.equal(state.trail.index, 0);
    state = validateSave(JSON.parse(JSON.stringify(save(state)))).state;
    ui.reset();
    ui.open();
    const text = texts(element("#trail-history")).join(" ");
    assert.match(text, /Seaside/);
    assert.match(text, locale === "fr" ? /non confirmé/ : /Unconfirmed/);
    assert.doesNotMatch(text, /Secret Town|45 km|194/);
    state = applyFieldSearch(state, await search(state, { kind: 0.5 }), cell, info, survival, economy);
    const repeatedCount = state.trail.exploration.hints.length;
    ui.localize();
    const repeatedItem = element("#trail-actions").children.find(c =>
      c.children.some(b => b.id === "clue-field-search"));
    const feedback = repeatedItem.children.find(c => c.textContent ===
      translate(locale, "fieldOutcome.repeated", state.trail.exploration.lastSearch));
    assert.ok(feedback);
    assert.equal(feedback.dataset.feedback, "failure");
    assert.equal(state.trail.exploration.hints.length, repeatedCount);
    state = validateSave(JSON.parse(JSON.stringify(save(state)))).state;
    state = { ...state, col: state.trail.stages[0].col - 8 };
    ui.localize();
    const nextSearch = element("#trail-actions").children.flatMap(c => c.children)
      .find(b => b.id === "clue-field-search");
    // A queued old close event must not abort a search in the reopened dialog.
    const pending = nextSearch.events.click();
    element("#trail-dialog").events.close();
    await pending;
    assert.equal(state.elapsedMinutes, 79);
    assert.match(element("#trail-target").textContent, /Secret Town 1/);
    assert.doesNotMatch(texts(element("#trail-history")).join(" "), /Secret Town 2/);
    assert.equal(state.trail.index, 0);
    const dates = element("#trail-history").children.map(item => item.children.at(-1).dateTime);
    assert.deepEqual(dates, [...dates].sort().reverse());
    state = recordTrailArrival({ ...state, col: state.trail.stages[0].col });
    ui.localize();
    assert.equal(element("#trail-page-status").textContent,
      translate(locale, "trailPageAwaiting", { page: 2, place: state.trail.stages[0].name }));
    assert.equal(state.trail.index, 0);
    state = trailClue(state, "letter", cell, info, survival, economy);
    ui.localize();
    assert.match(element("#trail-page-status").textContent, /2/);
    assert.equal(element("#trail-page-current").disabled, true);
    element("#trail-page-previous").events.click();
    assert.match(element("#trail-page-status").textContent, /Secret Town 1/);
    assert.equal(element("#trail-page-status").dataset.feedback, "success");
    assert.equal(element("#trail-actions").hidden, true);
    element("#trail-page-current").events.click();
    assert.equal(element("#trail-actions").hidden, false);
    ui.reset();
  });
}
