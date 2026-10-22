import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { askDirections, directionsChance, citedTowns } from "../directions.mjs";
import { startSurvival } from "../survival.mjs";
import { startEconomy, finishAction } from "../economy.mjs";
import { createSave, validateSave } from "../journey-save.mjs";
import { createTrail } from "../trail.mjs";
import { setupTrail, citedTownDirections } from "../trail-ui.mjs";
import { translate } from "../i18n.mjs";

const json = name => JSON.parse(readFileSync(new URL(name, import.meta.url)));
const survival = json("../public/config.json").survival, economy = json("../public/economy.json");
const map = json("../public/map.json"), info = { latitude: 44.54, longitude: 2.3 };
const start = (hour = 12) => ({
  ...startEconomy(startSurvival(14, 10, Date.UTC(2026, 9, 17, hour), "balanced", survival), economy, () => 0),
  trail: createTrail(map, 14, 10, () => 0),
});
const ask = (state, terrain = "place", roll = 0) =>
  askDirections(state, { terrain }, info, survival, economy, () => roll);

test("directions to another quest remain available when the parent trail is complete", () => {
  const state = start();
  state.trail.completed = true;
  const destination = { name: "Quest town", latitude: 44.6, longitude: 2.4 };
  const result = askDirections(state, { terrain: "place" }, info, survival, economy, () => 0, destination);
  assert.equal(result.outcome, "helped");
  assert.equal(result.state.trail.completed, true);
  assert.ok(result.state.elapsedMinutes > state.elapsedMinutes);
});
test("town choices retain old witness suggestions without exposing uncollected future destinations", () => {
  const stages = ["Visited", "CURRENT SECRET", "FUTURE SECRET"].map((name, i) => ({
    name, latitude: 44 + i, longitude: 2,
  }));
  const proposed = { name: "Suggested town", latitude: 45.1, longitude: 2.1 };
  const state = { trail: { index: 1, stages, history: [{ next: stages[1], elapsedMinutes: 30 }],
    arrivals: [{ stage: 0, elapsedMinutes: 10 }],
    exploration: { firstStage: 0, knownStage: null, hints: [],
      reports: [{ stage: 0, outcome: "suggestion", town: proposed, elapsedMinutes: 15 }],
      lastReport: { stage: 1, outcome: "suggestion", town: proposed, elapsedMinutes: 50 } },
  } };
  const before = structuredClone(state);
  let choices = citedTowns(state);
  assert.deepEqual(choices.map(town => town.name), ["Suggested town", "Visited"]);
  assert.equal(choices[0].status, "suggested");
  assert.equal(choices[0].stage, 1);
  assert.equal(choices[1].status, "visited");
  assert.deepEqual(state, before);
  state.trail.exploration.hints.push({ stage: 1, kind: "place", elapsedMinutes: 60 });
  choices = citedTowns(state);
  assert.equal(choices[0].name, "CURRENT SECRET");
  assert.equal(choices[0].status, "known");
  assert.ok(!choices.some(town => town.name === "FUTURE SECRET"));
  for (const language of ["fr", "en"]) {
    const text = citedTownDirections(choices.find(town => town.status === "suggested"), info,
      (key, args) => translate(language, key, args));
    assert.match(text, /Suggested town/);
    assert.match(text, language === "fr" ? /non confirmée/ : /unconfirmed/);
    assert.match(text, /45[.,]100000|45\.100000/);
  }
});

test("every terrain has the approved rate, including 90% in towns and zero on water", () => {
  const groups = [
    [0.9, ["place"]], [0.75, ["station", "cable_station"]],
    [0.5, ["road", "major_road", "building", "church"]],
    [0.25, ["plain", "grass", "field", "vineyard", "park"]],
    [0.15, ["forest", "hill"]], [0.05, ["mountain", "rail", "cable"]], [0, ["water"]],
  ];
  for (const [chance, terrains] of groups) for (const terrain of terrains) {
    assert.equal(directionsChance({ terrain }), chance);
    let successes = 0;
    for (let i = 0; i < 100; i++) {
      if (ask(start(), terrain, (i + 0.5) / 100).outcome === "helped") successes++;
    }
    assert.equal(successes, chance * 100, terrain);
    assert.equal(ask(start(), terrain, chance).outcome, "nobody");
  }
});

test("every reroll pays ten minutes and two fatigue, metabolism, but no money or free recovery", () => {
  const state = { ...start(), fatigue: 30, lastExpenseCents: 999 }, before = structuredClone(state);
  const failed = ask(state, "place", 0.99);
  assert.equal(failed.outcome, "nobody");
  assert.equal(failed.state.elapsedMinutes, 10);
  assert.equal(failed.state.fatigue, 32);
  assert.equal(failed.state.awakeHours, state.awakeHours + 10 / 60);
  assert.ok(Math.abs(state.reserveKcal - failed.state.reserveKcal - survival.basal_kcal_per_hour / 6) < 1e-9);
  assert.equal(failed.state.walletCents, state.walletCents);
  assert.equal(failed.state.lastExpenseCents, 0);
  const helped = ask(failed.state);
  assert.equal(helped.outcome, "helped");
  assert.equal(helped.state.elapsedMinutes, 20);
  assert.equal(helped.state.fatigue, 34);
  assert.deepEqual(helped.state.trail, state.trail);
  assert.equal(helped.state.col, state.col);
  assert.equal(helped.state.row, state.row);
  assert.deepEqual(state, before);
  const saved = createSave({ region: "firmi", map, state: helped.state, survival, economy }, 1);
  assert.deepEqual(validateSave(JSON.parse(JSON.stringify(saved))).state, helped.state);
});

test("night exposure, fainting and fatal needs apply before directions are granted", () => {
  const night = ask(start(23));
  assert.equal(night.state.outdoorNightMinutes, 10);
  assert.ok(night.state.fatigue > 2);
  const hungry = ask({ ...start(), reserveKcal: 0.1, health: 0.01 });
  assert.equal(hungry.outcome, "exhausted");
  assert.equal(hungry.state.ended, "health");
  const sleepy = ask({ ...start(), awakeHours: survival.sleep_limit_hours - 0.01 });
  assert.equal(sleepy.outcome, "fainted");
  assert.equal(sleepy.state.lastFaint.reason, "sleep");
  assert.equal(sleepy.state.elapsedMinutes, 490);
  const fainted = ask({ ...start(), fatigue: 99 });
  assert.equal(fainted.outcome, "fainted");
  assert.equal(fainted.state.fatigue, 40);
  assert.equal(fainted.state.elapsedMinutes, 490);
  for (const cell of [null, { terrain: "unknown" }, { terrain: "place", unavailable: true }]) {
    assert.throws(() => askDirections(start(), cell, info, survival, economy), /loaded cell/);
  }
  for (const roll of [-1, 1, NaN]) assert.throws(() => ask(start(), "place", roll), /draw/);
  assert.throws(() => ask({ ...start(), ended: "hunger" }), /active journey/);
});

test("water entry adds forty fatigue independent of endurance and uses existing collapse finalization", async () => {
  const { travelCost } = await import("../travel.mjs");
  const road = { terrain: "road", elevationMeters: 0 }, water = { ...road, terrain: "water" };
  for (const enduranceFactor of [0.5, 1, 2]) {
    const cost = travelCost(road, water, 250, 0, { baseSpeedKmh: 4.5, bodyMassKg: 40, enduranceFactor });
    const usual = cost.minutes * 0.08 * cost.terrainCost / enduranceFactor;
    assert.equal(cost.fatigueGain - usual, 40);
  }
  const { walkSurvival } = await import("../survival.mjs");
  const state = { ...start(), fatigue: 65 };
  const moved = walkSurvival(state, 1, 0, road, water, survival);
  assert.equal(moved.fatigue, 100);
  const next = finishAction(state, moved, info, economy, { survival, random: () => 0.99 });
  assert.equal(next.fatigue, 40);
  assert.equal(next.faints, 1);
  const bridge = walkSurvival(start(), 1, 0, road, road, survival);
  assert.ok(bridge.fatigue < 1);
  const exiting = travelCost(water, road, 250, 0);
  assert.equal(exiting.fatigueGain, exiting.minutes * 0.08 * exiting.terrainCost);
});

test("directions dialog hides guidance until a paid successful attempt, permits paid retries and resets", t => {
  const original = globalThis.document;
  t.after(() => { globalThis.document = original; });
  class Element {
    children = []; events = {}; dataset = {}; textContent = ""; open = false;
    nextElementSibling = { hidden: false };
    addEventListener(type, listener) { this.events[type] = listener; }
    setAttribute(name, value) { this[name] = value; }
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
    documentElement: { lang: "en" }, createElement: () => new Element(),
    querySelector: selector => selector === "dialog[open]"
      ? [...elements.values()].find(e => e.open) ?? null : element(selector),
  };
  let state = start(), attempts = 0;
  const ui = setupTrail((key, args) => translate("en", key, args), {
    context: () => ({ state, cell: { terrain: "place" }, info, data: economy, blocked: false }),
    askDirections: () => {
      const result = ask(state, "place", attempts++ === 0 ? 0.99 : 0);
      state = result.state;
      return result.outcome;
    },
  });
  ui.localize();
  element("#conversation-dialog").showModal();
  assert.equal(attempts, 0);
  assert.equal(state.elapsedMinutes, 0);
  assert.equal(element("#hint-guidance").textContent, translate("en", "hintBeforeAsk"));
  assert.match(element("#hint-cost").textContent, /10 min and \+2 fatigue/);
  assert.match(element("#hint-cost").textContent, /90%/);
  element("#hint-ask").events.click();
  assert.equal(state.elapsedMinutes, 10);
  assert.equal(element("#hint-guidance").textContent, translate("en", "hintOutcome.nobody"));
  element("#hint-ask").events.click();
  assert.equal(state.elapsedMinutes, 20);
  assert.ok(element("#hint-guidance").textContent.includes(state.trail.stages[0].name));
  ui.reset();
  ui.localize();
  element("#conversation-dialog").showModal();
  assert.equal(element("#hint-guidance").textContent, translate("en", "hintBeforeAsk"));
  assert.equal(attempts, 2);
  state = { ...state, elapsedMinutes: 60, trail: { ...state.trail, version: 2, index: 1,
    stages: state.trail.stages.map((stage, i) => ({ ...stage,
      latitude: 44 + i / 10, longitude: 2, name: i === 0 ? "Visited town" : `SECRET ${i}` })),
    history: [],
    exploration: { firstStage: 1, knownStage: null, hints: [], reports: [],
      lastReport: { stage: 1, outcome: "suggestion",
        kind: "prefix", precision: "vague",
        town: { name: "Witness town", latitude: 45, longitude: 3 }, elapsedMinutes: 50 } },
  } };
  ui.localize();
  assert.equal(element("#hint-towns").hidden, false);
  const town = citedTowns(state).find(town => town.name === "Witness town");
  element("#hint-town").events.change({ target: { value: town.key } });
  const trailBefore = structuredClone(state.trail), minutesBefore = state.elapsedMinutes;
  attempts = 0;
  element("#hint-town-ask").events.click();
  assert.equal(element("#hint-guidance").textContent, translate("en", "hintOutcome.nobody"));
  element("#hint-town-ask").events.click();
  assert.match(element("#hint-guidance").textContent, /Witness town/);
  assert.match(element("#hint-guidance").textContent, /unconfirmed/);
  assert.doesNotMatch(element("#hint-guidance").textContent, /SECRET/);
  assert.equal(state.elapsedMinutes, minutesBefore + 20);
  assert.deepEqual(state.trail, trailBefore);
  ui.reset();
});
