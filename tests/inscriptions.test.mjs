import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CARVE_MINUTES, KNIFE_WEAR, carvingBlocker, createInscriptionsClient, inscriptionSurface,
  inscriptionText, journeyCarve, usableKnife } from "../inscriptions.mjs";
import { setupInscriptions } from "../inscriptions-ui.mjs";
import { setupCellContent } from "../cell-content-ui.mjs";
import { beginEquipment } from "../equipment.mjs";
import { journeyEquipmentAction } from "../equipment-journey.mjs";
import { startSurvival } from "../survival.mjs";
import { startEconomy } from "../economy.mjs";
import { translate } from "../i18n.mjs";

const json = file => JSON.parse(readFileSync(new URL(file, import.meta.url)));
const economy = json("../public/economy.json"), survival = json("../public/config.json").survival;
const forest = { terrain: "forest" }, town = { terrain: "place" };
const info = { latitude: 44.54, longitude: 2.3, terrain: "place", names: [] };
const online = s => ({ ...s, serverJourney: { id: "a".repeat(32) }, journalAccess: "b".repeat(43) });
const start = () => online(beginEquipment({ ...startEconomy(startSurvival(14, 10,
  Date.UTC(2026, 9, 18, 12), "balanced", survival), economy, () => 0), walletCents: 20000 }));
const armed = () => {
  const s = journeyEquipmentAction(start(), { type: "buy", itemId: "knife" }, town, info, survival, economy);
  return { ...s, serverJourney: { id: "a".repeat(32) }, journalAccess: "b".repeat(43) };
};

test("only forest trees and town walls can be carved", () => {
  assert.equal(inscriptionSurface(forest), "tree");
  assert.equal(inscriptionSurface(town), "wall");
  for (const terrain of ["field", "water", "mountain", "road"]) assert.equal(inscriptionSurface({ terrain }), null);
  assert.equal(inscriptionSurface({ terrain: "forest", unavailable: true }), null);
  assert.equal(inscriptionSurface(null), null);
});

test("carving needs a surface, a server journey, no pending action and a usable knife", () => {
  const s = start();
  assert.equal(carvingBlocker(s, { terrain: "field" }), "surface");
  assert.equal(carvingBlocker({ ...s, journalAccess: null }, forest), "offline");
  assert.equal(carvingBlocker({ ...s, cafePending: {} }, forest), "busy");
  assert.equal(carvingBlocker(s, forest), "knife");
  const k = armed();
  assert.equal(usableKnife(k), true);
  assert.equal(carvingBlocker(k, forest), null);
  const broken = { ...k, equipment: { ...k.equipment, items: k.equipment.items.map(item =>
    item.id === "knife" ? { ...item, condition: 0 } : item) } };
  assert.equal(carvingBlocker(broken, forest), "knife");
});

test("inscription text is one plain line of at most 100 characters", () => {
  assert.equal(inscriptionText("  Ici passa la Lune  "), "Ici passa la Lune");
  assert.equal(inscriptionText("é".repeat(100)).length, 100);
  for (const bad of ["", "   ", "x".repeat(101), "deux\nlignes", "tab\there", 42]) {
    assert.throws(() => inscriptionText(bad), String(bad));
  }
});

test("carving spends game time and wears the knife without rewarding rest", () => {
  const s = armed(), knife = s.equipment.items.find(item => item.id === "knife");
  const next = journeyCarve(s, forest, info, survival, economy);
  assert.equal(next.elapsedMinutes, s.elapsedMinutes + CARVE_MINUTES);
  assert.equal(next.equipment.elapsedMinutes, next.elapsedMinutes);
  assert.ok(next.fatigue >= s.fatigue);
  assert.equal(next.walletCents, s.walletCents);
  const worn = next.equipment.items.find(item => item.id === "knife");
  assert.ok(worn.condition <= knife.condition - KNIFE_WEAR + 1e-9);
  assert.ok(worn.condition >= knife.condition - KNIFE_WEAR - 1);
  assert.throws(() => journeyCarve(start(), forest, info, survival, economy), /knife/);
  assert.throws(() => journeyCarve(s, { terrain: "field" }, info, survival, economy), /surface/);
});

test("server client sends the capability and validates the response shape", async () => {
  const calls = [];
  const view = { surface: "tree", inscriptions: [], own: null, remainingToday: 5 };
  const request = createInscriptionsClient({ fetcher: async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, json: async () => view };
  } });
  const s = { ...armed(), col: 3, row: 4 };
  assert.deepEqual(await request(s, "carve", { text: "Salut" }), view);
  assert.equal(calls[0].url, "/api/inscriptions");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers["X-Journal-Capability"], s.journalAccess);
  assert.deepEqual(JSON.parse(calls[0].options.body), { journey: s.serverJourney.id,
    location: { col: 3, row: 4 }, action: "carve", text: "Salut" });
  await assert.rejects(request({ ...s, journalAccess: null }, "list"), /capability/);
  const failing = createInscriptionsClient({ fetcher: async () => ({ ok: false, status: 409,
    json: async () => ({ error: "Your inscription is still being checked." }) }) });
  await assert.rejects(failing(s, "carve", { text: "x" }), /still being checked/);
  for (const invalidView of [
    { surface: "rock", inscriptions: [], remainingToday: 1 },
    { surface: "tree", inscriptions: [{ id: "x", own: false, reported: false }], remainingToday: 1 },
  ]) {
    const invalid = createInscriptionsClient({ fetcher: async () => ({ ok: true, status: 200,
      json: async () => invalidView }) });
    await assert.rejects(invalid(s, "list"), /Invalid/);
  }
});

class Element {
  dataset = {};
  textContent = "";
  value = "";
  disabled = false;
  hidden = false;
  open = false;
  events = {};
  children = [];
  addEventListener(type, handler) { this.events[type] = handler; }
  click() { if (!this.disabled) this.events.click?.(); }
  showModal() { this.open = true; }
  close() { this.open = false; this.events.close?.(); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren() { this.children = []; }
}
const flush = () => new Promise(resolve => setImmediate(resolve));

function harness(t, language, responses, { request: customRequest, onUpdate = () => {} } = {}) {
  const previous = globalThis.document, elements = new Map();
  const get = key => {
    if (!elements.has(key)) elements.set(key, new Element());
    return elements.get(key);
  };
  globalThis.document = { getElementById: id => get(id), createElement: () => new Element(),
    querySelector: () => [...elements.values()].find(e => e.open) ?? null };
  t.after(() => { globalThis.document = previous; });
  const current = { state: armed(), cell: forest, info, blocked: false };
  const sent = [];
  let carved = 0;
  const ui = setupInscriptions((key, args) => translate(language, key, args), {
    context: () => current,
    carve: () => { carved++; },
    request: customRequest ?? (async (state, action, details = {}) => {
      sent.push({ action, ...details });
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next;
    }),
    onUpdate,
    wait: 40,
  });
  ui.localize();
  return { get, ui, sent, current, carved: () => carved };
}
const own = (status, reason = null, retryable = false) => ({ id: "o", text: "Mon nom", status, reason,
  carvedAt: 1, retryable });
const listView = (extra = {}) => ({ surface: "tree", inscriptions: [
  { id: "x", text: "Bonjour voyageur", carvedAt: 1, own: false, reported: false }],
  own: null, remainingToday: 5, moderation: true, maxCharacters: 100, ...extra });

for (const language of ["fr", "en"]) {
  test(`${language} dialog lists carvings, carves, polls and shows the precise rejection reason`, async t => {
    const h = harness(t, language, [listView(), listView({ own: own("pending") }),
      listView({ own: own("rejected", "hate") })]);
    assert.equal(h.get("open-inscriptions").disabled, false);
    h.get("open-inscriptions").click();
    await flush();
    assert.equal(h.get("inscriptions-dialog").open, true);
    assert.deepEqual(h.sent, [{ action: "list" }]);
    assert.equal(h.get("inscriptions-list").children.length, 1);
    assert.equal(h.get("inscriptions-empty").hidden, true);
    assert.equal(h.get("inscriptions-carve").disabled, true);
    h.get("inscriptions-text").value = "  Mon nom  ";
    h.get("inscriptions-text").events.input();
    assert.equal(h.get("inscriptions-carve").disabled, false);
    h.get("inscriptions-form").events.submit({ preventDefault() {} });
    await flush();
    assert.deepEqual(h.sent[1], { action: "carve", text: "Mon nom" });
    assert.equal(h.carved(), 1);
    assert.equal(h.get("inscriptions-text").value, "");
    assert.match(h.get("inscriptions-own").textContent, /Mon nom/);
    assert.equal(h.get("inscriptions-text").disabled, true);
    for (let i = 0; i < 100 && h.sent.length < 3; i++) await new Promise(resolve => setTimeout(resolve, 10));
    await flush();
    assert.deepEqual(h.sent[2], { action: "list" });
    assert.ok(h.get("inscriptions-own").textContent.includes(translate(language, "inscriptions.reason.hate")));
    assert.equal(h.get("inscriptions-text").disabled, false);
  });
}

test("reporting and retry send the right actions and failures stay visible without carving", async t => {
  const h = harness(t, "en", [listView({ own: own("unchecked", "unavailable", true) }),
    listView({ inscriptions: [{ id: "x", text: "Bonjour voyageur", carvedAt: 1, own: false, reported: true }] }),
    listView({ own: own("approved") }), new Error("You can carve at most 5 inscriptions per day.")]);
  h.get("open-inscriptions").click();
  await flush();
  assert.equal(h.get("inscriptions-retry").hidden, false);
  assert.match(h.get("inscriptions-own").textContent, /could not be checked \(checking service unavailable\)/);
  h.get("inscriptions-list").children[0].children[2].click();
  await flush();
  assert.deepEqual(h.sent[1], { action: "report", inscription: "x" });
  assert.equal(h.get("inscriptions-list").children[0].children[2].disabled, true);
  h.get("inscriptions-retry").click();
  await flush();
  assert.deepEqual(h.sent[2], { action: "retry" });
  h.get("inscriptions-text").value = "Encore";
  h.get("inscriptions-form").events.submit({ preventDefault() {} });
  await flush();
  assert.match(h.get("inscriptions-error").textContent, /at most 5/);
  assert.equal(h.get("inscriptions-error").hidden, false);
  assert.equal(h.carved(), 0);
  h.ui.reset();
  assert.equal(h.get("inscriptions-dialog").open, false);
});

test("the dialog refuses to open off-surface and blocks carving without a knife", async t => {
  const h = harness(t, "en", [listView()]);
  h.current.cell = { terrain: "field" };
  h.ui.localize();
  assert.equal(h.get("open-inscriptions").disabled, true);
  h.ui.open();
  assert.equal(h.get("inscriptions-dialog").open, false);
  h.current.cell = forest;
  h.current.state = start();
  h.ui.open();
  await flush();
  assert.equal(h.get("inscriptions-blocker").hidden, false);
  assert.match(h.get("inscriptions-blocker").textContent, /knife/);
  h.get("inscriptions-text").value = "Salut";
  h.get("inscriptions-form").events.submit({ preventDefault() {} });
  await flush();
  assert.equal(h.sent.length, 1);
  assert.equal(h.carved(), 0);
});

test("cell entry caches only server-visible carvings and reuses them on revisit", async t => {
  const h = harness(t, "en", [listView(), listView({ inscriptions: [
    { id: "y", text: "Fresh mark", carvedAt: 2, own: false, reported: false }],
  })]);
  const state = { ...armed(), col: 14, row: 9 };
  h.ui.enter(state, forest);
  h.ui.enter(state, forest);
  assert.equal(h.ui.current(), null);
  await flush();
  assert.deepEqual(h.sent, [{ action: "list" }]);
  assert.deepEqual(h.ui.current(), { surface: "tree", inscriptions: [{ text: "Bonjour voyageur" }] });
  assert.equal(h.ui.current().inscriptions[0].own, undefined);
  h.ui.enter({ ...state, col: 15 }, forest);
  await flush();
  assert.deepEqual(h.ui.current(), { surface: "tree", inscriptions: [{ text: "Fresh mark" }] });
  h.ui.enter(state, forest);
  assert.deepEqual(h.sent, [{ action: "list" }, { action: "list" }]);
});

test("a late arrival response cannot replace the description for the new cell", async t => {
  const pending = [];
  const updated = [];
  const h = harness(t, "en", [], {
    request: () => new Promise(resolve => pending.push(resolve)),
    onUpdate: () => updated.push(h.ui.current()),
  });
  const state = { ...armed(), col: 2, row: 3 };
  h.ui.enter(state, forest);
  h.ui.enter({ ...state, col: 3 }, forest);
  await flush();
  pending[0](listView());
  await flush();
  assert.equal(h.ui.current(), null);
  pending[1](listView({ inscriptions: [
    { id: "new", text: "This tree", carvedAt: 3, own: false, reported: false }],
  }));
  await flush();
  assert.deepEqual(h.ui.current(), { surface: "tree", inscriptions: [{ text: "This tree" }] });
  assert.deepEqual(updated, [h.ui.current()]);
  h.ui.enter({ ...state, journalAccess: null }, forest);
  assert.equal(h.ui.current(), null);
});

test("cell description renders only visible engraving text without rebuilding unchanged content", t => {
  const previous = globalThis.document;
  const elements = new Map();
  class MockElement {
    children = [];
    events = {};
    hidden = false;
    textContent = "";
    addEventListener(type, handler) { this.events[type] = handler; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    after(node) { this.afterElement = node; }
  }
  globalThis.document = {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, new MockElement());
      return elements.get(selector);
    },
    createElement: () => new MockElement(),
    addEventListener() {},
  };
  t.after(() => { globalThis.document = previous; });
  const ui = setupCellContent(key => key);
  const description = elements.get("#cell-description");
  ui.setInscriptions({ surface: "tree", inscriptions: [{ text: "Gravure approuvée" }] });
  const section = description.afterElement;
  assert.equal(section.hidden, false);
  assert.equal(section.children[0].textContent, "inscriptions.surface.tree");
  assert.equal(section.children[1].children[0].children[0].textContent, "Gravure approuvée");
  const originalChildren = section.children;
  ui.setInscriptions({ surface: "tree", inscriptions: [{ text: "Gravure approuvée" }] });
  assert.equal(section.children, originalChildren);
  ui.setInscriptions({ surface: "wall", inscriptions: [{ text: "<script>non exécuté</script>" }] });
  assert.equal(section.children[1].children[0].children[0].textContent, "<script>non exécuté</script>");
  ui.setInscriptions(null);
  assert.equal(section.hidden, true);
});
