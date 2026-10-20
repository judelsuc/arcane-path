import test from "node:test";
import assert from "node:assert/strict";
import { setupAbandonedJournals } from "../abandoned-journals-ui.mjs";
import { applyJournalDiscovery } from "../discovery-targets.mjs";

class Element {
  dataset = {};
  children = [];
  listeners = {};
  hidden = false;
  disabled = false;
  textContent = "";
  replaceChildren(...items) { this.children = items; }
  append(...items) { this.children.push(...items); }
  insertAdjacentElement(_position, item) { this.before = item; }
  addEventListener(kind, action) { this.listeners[kind] = action; }
}

test("SIDEQUEST pickup, progress, delivery and death publication never alter own parent trail", async () => {
  const globals = Object.fromEntries(["document", "window", "localStorage", "fetch"]
    .map(key => [key, globalThis[key]]));
  const nodes = Object.fromEntries(["abandoned-journals", "abandoned-status", "abandoned-list",
    "abandoned-refresh"].map(id => [id, new Element()]));
  const data = new Map(), sent = [];
  globalThis.document = { querySelector: id => nodes[id.slice(1)], createElement: () => new Element() };
  globalThis.window = { addEventListener() {} };
  globalThis.localStorage = { getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value) };
  const ownTrail = { parentName: "Own parent", index: 4, stages: ["Own town"] };
  let state = { serverJourney: { id: "1".repeat(32) }, journalAccess: "2".repeat(64),
    col: 0, row: 0, elapsedMinutes: 0, ended: null, trail: structuredClone(ownTrail),
    photos: ["PRIVATE"], notes: "PRIVATE" };
  const quest = { id: "3".repeat(32), parent: "Other parent", history: ["Earlier town"],
    stages: [{ name: "Other town", latitude: 44, longitude: 2 }], step: 0, delivered: false };
  let held = false, delivered = false;
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    sent.push(body);
    assert.equal(url, "/api/abandoned-journals");
    if (body.action === "claim") held = true;
    if (body.action === "advance") delivered = true;
    return new Response(JSON.stringify({ sidequests: held ? [{ ...quest, delivered }] : [],
      nearby: held ? [] : [quest], published: body.ended === "fatigue" }));
  };
  const t = (key, values = {}) => `${key} ${Object.values(values).join(" ")}`;
  try {
    const ui = setupAbandonedJournals(t, {
      context: () => state,
      persist(sidequests, published, nearby, observedMinutes) {
        state = applyJournalDiscovery(state, sidequests, nearby, observedMinutes);
        if (published) state = { ...state, journalPublished: true };
      },
    });

    await new Promise(resolve => setImmediate(resolve));
    assert.match(nodes["abandoned-list"].children[0].textContent, /Other parent/);
    assert.equal(state.discovery.entries[0].kind, "rumour");
    assert.equal(state.discovery.entries[0].observedMinutes, 0);
    await nodes["abandoned-list"].children[0].children[1].listeners.click();
    assert.equal(state.sidequests[0].id, quest.id);
    assert.equal(state.discovery.entries.length, 2);
    assert.deepEqual(state.trail, ownTrail);
    assert.match(nodes["abandoned-list"].children[0].textContent, /Other town/);
    await nodes["abandoned-list"].children[0].children[1].listeners.click();
    assert.equal(state.sidequests[0].delivered, true);
    assert.ok(state.discovery.entries.every(entry => entry.availability === "historical"));
    assert.match(nodes["abandoned-list"].children[0].textContent, /abandoned.delivered/);
    state = { ...state, ended: "fatigue", elapsedMinutes: 10 };
    ui.update();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(state.journalPublished, true);
    assert.match(nodes["abandoned-status"].textContent, /abandoned.published/);
    assert.equal(JSON.stringify(sent).includes("PRIVATE"), false);
    assert.deepEqual(state.trail, ownTrail);
  } finally {
    for (const [key, value] of Object.entries(globals)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});

test("dynamic town conversation, bilingual reports and exterior proximity status preserve pickup flow", async () => {
  const globals = Object.fromEntries(["document", "window", "localStorage", "fetch"]
    .map(key => [key, globalThis[key]]));
  const nodes = Object.fromEntries(["abandoned-journals", "abandoned-status", "abandoned-list",
    "abandoned-refresh", "town-dialog"].map(id => [id, new Element()]));
  const root = { lang: "en" }, data = new Map(), sent = [];
  globalThis.document = { documentElement: root, querySelector: id => nodes[id.slice(1)],
    createElement: () => new Element() };
  globalThis.window = { addEventListener() {} };
  globalThis.localStorage = { getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value) };
  let state = { serverJourney: { id: "1".repeat(32) }, journalAccess: "2".repeat(64),
    col: 0, row: 0, elapsedMinutes: 60, ended: null,
    trail: { parentName: "Own parent", index: 0, stages: ["Own town"] } };
  const report = { id: "3".repeat(32), parent: "Other parent", bearing: "east",
    distanceBand: "within-1km", observedMinutes: 60,
    availability: "current", evidenceKey: `town:${"4".repeat(32)}` };
  let earned = false, available = true;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    sent.push(body);
    if (body.action === "rumours") earned = true;
    return new Response(JSON.stringify({ nearby: [], sidequests: [], published: false,
      rumours: earned ? [{ ...report, availability: available ? "current" : "unavailable" }] : [],
      indications: available ? [{ ...report, evidenceKey: `near:${"5".repeat(32)}` }] : [] }));
  };
  try {
    const ui = setupAbandonedJournals(key => key, { context: () => state,
      persist(sidequests, _published, nearby, observed, rumours, indications) {
        state = applyJournalDiscovery(state, sidequests, nearby, observed, rumours, indications);
      } });
    await new Promise(resolve => setImmediate(resolve));
    const ask = nodes["town-dialog"].children.find(item => item.id === "abandoned-ask-town");
    assert.match(ask.textContent, /Ask locals/);
    assert.equal(nodes["abandoned-journals"].before.hidden, false);
    assert.match(nodes["abandoned-journals"].before.textContent, /1 km.*200 m/);
    assert.equal(nodes["abandoned-list"].children.length, 0);
    await ask.listeners.click();
    assert.equal(sent.at(-1).action, "rumours");
    assert.ok(state.discovery.entries.some(entry => entry.channels.includes("npc")));
    const townText = nodes["town-dialog"].children.at(-1);
    assert.match(townText.textContent, /east.*1 km.*not a guarantee/);
    root.lang = "fr";
    ui.localize();
    assert.match(ask.textContent, /Parler/);
    assert.match(townText.textContent, /est.*1 km.*pas une garantie/);
    available = false;
    await ask.listeners.click();
    assert.match(townText.textContent, /Disparu ou emporté/);
    assert.equal(nodes["abandoned-journals"].before.hidden, true);
    state = { ...state, ended: "reunion" };
    ui.localize();
    assert.equal(ask.disabled, true);
    assert.equal(ask.hidden, true);
  } finally {
    for (const [key, value] of Object.entries(globals)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});
