import test from "node:test";
import assert from "node:assert/strict";
import { setupLegendLook } from "../legend-look-ui.mjs";

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
  let context = { state: { serverJourney: { id: "a".repeat(32) }, journalAccess: "b".repeat(64), col: 0, row: 0 },
    blocked: false };
  const entries = [], observed = [], opened = [];
  const ui = setupLegendLook({ host, context: () => context, client,
    onEntry: value => entries.push(value), onObservation: value => observed.push(value),
    openEntrance: () => opened.push(true) });
  const descendants = node => [node, ...node.children.flatMap(descendants)];
  return { ui, doc, host, entries, observed, opened, getContext: () => context, setContext: next => { context = next; },
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
    f.button(language === "en" ? "Open the adventure entrance" : "Ouvrir l'entrée de l'aventure").click();
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
  assert.ok(f.button("Open the adventure entrance"));
  f.ui.reset();
});
