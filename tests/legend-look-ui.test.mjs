import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setupLegendLook } from "../legend-look-ui.mjs";
import { chunkPosition } from "../travel.mjs";
import { pursuitPending } from "../pursuit.mjs";
import { brawlPending } from "../brawl-journey.mjs";
import { buildingSleepPending } from "../building-sleep.mjs";

class Element {
  children = [];
  events = {};
  attributes = {};
  textContent = "";
  constructor(tag, doc) { this.tagName = tag; this.ownerDocument = doc; }
  append(node) { this.children.push(node); }
  replaceChildren() { this.children = []; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, fn) { this.events[name] = fn; }
  click() { if (!this.disabled) this.events.click?.(); }
}

const observation = { townId: "node/42", town: "Firmi", location: { col: 1, row: 0 },
  description: { en: "A slate disc beneath the oak.", fr: "Une rondelle en ardoise sous le chêne." },
  matches: true, found: false };
const entry = { townId: observation.townId, exploration: { status: "found" } };
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture(client) {
  const doc = { documentElement: { lang: "en" } };
  doc.createElement = tag => new Element(tag, doc);
  const host = new Element("section", doc);
  const action = new Element("button", doc);
  const status = new Element("p", doc);
  status.hidden = true;
  let context = { state: { serverJourney: { id: "a".repeat(32) }, journalAccess: "b".repeat(64), col: 0, row: 0 },
    blocked: false };
  const entries = [], observed = [], opened = [];
  const ui = setupLegendLook({ host, action, status, context: () => context, client,
    onEntry: value => entries.push(value), onObservation: value => observed.push(value),
    openEntrance: () => opened.push(true) });
  const descendants = node => [node, ...node.children.flatMap(descendants)];
  return { ui, doc, host, action, status, entries, observed, opened, getContext: () => context, setContext: next => { context = next; },
    text: () => descendants(host).map(node => node.textContent).join(" "),
    button: text => descendants(host).find(node => node.tagName === "button" && node.textContent === text) };
}

test("Look reveals descriptions remotely but inspection requires presence and opens the retained entrance", async () => {
  for (const language of ["en", "fr"]) {
    const calls = [];
    const f = fixture({ look: async (_state, target) => {
      calls.push(["look", target]);
      return { observations: [observation] };
    }, inspect: async (state, townId) => {
      calls.push(["inspect", state.col, townId]);
      return { entry };
    } });
    f.doc.documentElement.lang = language;
    const label = language === "en" ? "Inspect the passage" : "Inspecter le passage";
    f.ui.update(observation.location);
    await flush();
    assert.match(f.text(), language === "en" ? /slate disc.*Come closer/ : /rondelle.*Approchez/);
    assert.doesNotMatch(f.text(), /fiction|fictif|cell|case|Quests|Quêtes|costs|coûts/i);
    assert.equal(f.button(label), undefined);
    f.setContext({ ...f.getContext(), state: { ...f.getContext().state, col: 1 } });
    f.ui.update(observation.location);
    await flush();
    f.button(label).click();
    await flush();
    assert.deepEqual(f.entries, [entry]);
    assert.deepEqual(calls.at(-1), ["inspect", 1, observation.townId]);
    assert.match(f.text(), language === "en" ? /Entrance discovered/ : /Entrée découverte/);
    assert.doesNotMatch(f.text(), /fiction|fictif|cell|case|Quests|Quêtes|costs|coûts/i);
    assert.equal(f.button(language === "en" ? "Open the adventure entrance" : "Ouvrir l'entrée de l'aventure"), undefined,
      "the side panel shows the discovery; entering is the map action and the quest journal");
    f.action.click();
    assert.equal(f.opened.length, 1);
    assert.equal(f.observed.length, 2);
    f.ui.reset();
    assert.equal(f.host.hidden, true);
  }
});

test("stale Look and inspection responses cannot cross cursor, position or private journey changes", async () => {
  let resolve;
  const f = fixture({ look: () => new Promise(done => { resolve = done; }) });
  f.ui.update(observation.location);
  f.ui.update(null);
  resolve({ observations: [observation] });
  await flush();
  assert.equal(f.host.hidden, true);
  assert.deepEqual(f.observed, []);
  f.ui.update(observation.location);
  f.setContext({ ...f.getContext(), state: { ...f.getContext().state,
    serverJourney: { id: "c".repeat(32) } } });
  resolve({ observations: [observation] });
  await flush();
  assert.deepEqual(f.observed, []);
  f.ui.reset();
});

test("Look errors are visible and explicitly retryable; blocked actions do not inspect", async () => {
  let calls = 0;
  const f = fixture({ look: async () => {
    if (++calls === 1) throw new Error("Catalogue unavailable");
    return { observations: [observation] };
  }, inspect: () => assert.fail("blocked inspection") });
  f.setContext({ ...f.getContext(), state: { ...f.getContext().state, col: 1 }, blocked: true });
  f.ui.update(observation.location);
  assert.equal(calls, 0);
  f.setContext({ ...f.getContext(), blocked: false });
  const previous = console.error;
  console.error = () => {};
  try {
    f.ui.update(observation.location);
    await flush();
    assert.match(f.text(), /Catalogue unavailable/);
    f.ui.update(observation.location);
    assert.equal(calls, 1);
    f.button("Retry Look").click();
    await flush();
    const inspect = f.button("Inspect the passage");
    assert.ok(inspect);
    f.setContext({ ...f.getContext(), blocked: true });
    inspect.click();
    await flush();
    assert.equal(calls, 2);
  } finally { console.error = previous; f.ui.reset(); }
});

test("already found entrance reloads its entry without relying on the first history page", async () => {
  const found = { ...observation, found: true, entry };
  const f = fixture({ look: async () => ({ observations: [found] }) });
  f.setContext({ ...f.getContext(), state: { ...f.getContext().state, col: 1 } });
  f.ui.update(observation.location);
  await flush();
  assert.deepEqual(f.entries, [entry]);
  assert.equal(f.button("Open the adventure entrance"), undefined);
  assert.equal(f.action.textContent, "Enter the adventure");
  f.ui.reset();
});

test("cell descriptions include independent legend content and the current position is checked without Look", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /id="cell-description"[^>]*><\/div>\s*<section id="legend-look" aria-live="polite"/);
  assert.equal((html.match(/id="legend-look"/g) ?? []).length, 1);
  const travel = readFileSync(new URL("../travel-ui.mjs", import.meta.url), "utf8");
  assert.match(travel, /cursor \?\? \{ col: p.col \+ 8, row: p.row \+ 8 \}/);
  assert.match(travel, /legendLookUI.update\(active && cell && !cell.unavailable/);
  assert.match(travel, /onDiscovery: \(\) => updateLegendLook\(true\)/);
});

test("newly learned legends refresh the same cell and keep inspection explicit", async () => {
  let learned = false, calls = 0;
  const f = fixture({ look: async () => {
    calls++;
    return { observations: learned ? [observation] : [] };
  }, inspect: () => assert.fail("description must not inspect automatically") });
  f.setContext({ ...f.getContext(), state: { ...f.getContext().state, col: 1 } });
  f.ui.update(observation.location);
  await flush();
  assert.equal(f.host.hidden, true);
  learned = true;
  f.ui.update(observation.location, true);
  await flush();
  assert.equal(calls, 2);
  assert.match(f.text(), /slate disc/);
  assert.ok(f.button("Inspect the passage"));
  f.doc.documentElement.lang = "fr";
  f.ui.update(observation.location);
  assert.match(f.text(), /rondelle/);
  assert.equal(calls, 2);
  f.ui.reset();
});

test("town arrival guidance stays visible beside the description without inventing an entrance observation", async () => {
  const guidance = { ...observation, matches: false, contextual: true, description: {
    en: "The story points north of town. Use Look to examine the surrounding ground.",
    fr: "L'histoire mène au nord du bourg. Utilisez Regarder pour examiner les environs.",
  } };
  const f = fixture({ look: async () => ({ observations: [guidance] }),
    inspect: () => assert.fail("town guidance cannot inspect") });
  f.ui.update(observation.location);
  await flush();
  assert.equal(f.host.hidden, false);
  assert.match(f.text(), /story points north.*Use Look/);
  assert.deepEqual(f.observed, []);
  assert.deepEqual(f.entries, []);
  assert.equal(f.button("Inspect the passage"), undefined);
  f.doc.documentElement.lang = "fr";
  f.ui.update(observation.location);
  assert.match(f.text(), /nord du bourg.*Utilisez Regarder/);
  f.ui.reset();
});

test("the actual travel context permits remote Look requests without permitting ordinary actions or pending activities", async () => {
  const source = readFileSync(new URL("../travel-ui.mjs", import.meta.url), "utf8");
  const start = source.indexOf("  function economyContext(");
  const end = source.indexOf("  function finishJourneyArrival()", start);
  assert.ok(start >= 0 && end > start);
  assert.match(source, /const legendLookUI = setupLegendLook\(\{\s*context: \(\) => active \? economyContext\(\{ allowLook: true \}\)/);
  const f = fixture({ look: async () => ({ observations: [observation] }) });
  const state = f.getContext().state;
  const terrain = { rows: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => ({ terrain: "forest" }))) };
  const values = {
    state, stream: { get: () => terrain, chunks: new Map() }, economyData: {},
    chunkPosition, pricingCountries: new Map(), exposureInfo: () => ({}),
    withDiscoveredAccommodations: cell => cell, discoveredLodging: new Map(),
    withNearbyMappedPois: cell => cell, base: {}, survivalConfig: {},
    busy: false, cursor: { col: 9, row: 8 }, artifactsUI: { pending: () => false },
    transitActive: () => false, pursuitPending, brawlPending, buildingSleepPending,
  };
  const context = overrides => {
    const inputs = { ...values, ...overrides };
    return new Function(...Object.keys(inputs), `${source.slice(start, end)}; return economyContext;`)(...Object.values(inputs));
  };
  const economy = context();
  assert.equal(economy().blocked, true, "ordinary actions stay blocked by the Look cursor");
  assert.equal(economy({ allowLook: true }).blocked, false);
  f.setContext(economy({ allowLook: true }));
  f.ui.update(observation.location);
  await flush();
  assert.equal(f.observed.length, 1, "the remote clue request actually completes while Look is active");
  assert.match(f.text(), /slate disc.*Come closer/);
  assert.equal(f.button("Inspect the passage"), undefined, "remote inspection still requires presence");
  for (const override of [{ busy: true }, { artifactsUI: { pending: () => true } },
    { transitActive: () => true }, ...["ended", "performancePending", "cafePending", "theftPending", "miniGamePending"]
      .map(key => ({ state: { ...state, [key]: true } })),
    { state: { ...state, events: { pending: true } } },
    { state: { ...state, pursuit: { pending: { status: "ready" } } } },
    { state: { ...state, equipment: { dogEncounter: "pending" } } }]) {
    assert.equal(context(override)({ allowLook: true }).blocked, true);
  }
  f.ui.reset();
});

test("the toolbar Explore is always available: it reports nothing, inspects the passage and enters the adventure", async () => {
  const calls = [];
  const f = fixture({ look: async () => ({ observations: [observation] }),
    inspect: async () => { calls.push("inspect"); return { entry }; } });
  f.ui.update(observation.location);
  await flush();
  assert.equal(f.action.hidden, false, "Explore is a permanent map action");
  assert.equal(f.action.textContent, "Explore");
  f.action.click();
  assert.equal(f.status.hidden, false);
  assert.equal(f.status.textContent, "You find nothing unusual here.");
  assert.deepEqual(calls, []);
  f.setContext({ ...f.getContext(), state: { ...f.getContext().state, col: 1 } });
  f.ui.update(observation.location);
  await flush();
  assert.equal(f.status.hidden, true, "moving clears the empty-handed note");
  assert.equal(f.action.textContent, "Inspect the passage");
  f.action.click();
  await flush();
  assert.deepEqual(calls, ["inspect"]);
  assert.equal(f.action.textContent, "Enter the adventure");
  f.action.click();
  assert.equal(f.opened.length, 1, "entering starts directly from the map");
  f.ui.reset();
  assert.equal(f.status.hidden, true);
});

test("an entrance found while observing (Look) can be entered: Look is left before the adventure starts", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../travel-ui.mjs", import.meta.url), "utf8");
  assert.match(source, /const townLegendsUI = setupTownLegends\(\{[\s\S]*?context: \(\) => active \? economyContext\(\{ allowLook: true \}\) : null/);
  assert.match(source, /startTrial: action => \{\s*if \(cursor\) toggleLook\(\);\s*void artifactsUI\.startLegend\(action\);/);
});

test("a cell without legend detail never opens the panel, even while Look is waiting for the answer", async () => {
  let answer;
  const f = fixture({ look: () => new Promise(resolve => { answer = resolve; }) });
  f.ui.update({ col: 3, row: 0 });
  assert.equal(f.host.hidden, true, "no flash while the answer is pending");
  answer({ observations: [] });
  await flush();
  assert.equal(f.host.hidden, true);
  f.ui.update(observation.location);
  answer({ observations: [observation] });
  await flush();
  assert.equal(f.host.hidden, false, "a described cell still opens the panel");
});
