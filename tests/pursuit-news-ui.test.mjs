import test from "node:test";
import assert from "node:assert/strict";
import { setupPursuitNews } from "../pursuit-news-ui.mjs";
import { createLiveNarrative, NARRATIVE_BRIEFS } from "../live-narrative.mjs";

class Element {
  children = []; listeners = new Map(); attributes = {}; hidden = false; disabled = false; open = false;
  textContent = "";
  constructor(tagName) { this.tagName = tagName; }
  append(...nodes) {
    for (const node of nodes) { node.parentElement = this; this.children.push(node); }
  }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(type, fn) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]); }
  dispatch(type) { for (const fn of this.listeners.get(type) ?? []) fn(); }
  click() { if (!this.hidden && !this.disabled) this.dispatch("click"); }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatch("close"); }
  focus() { globalThis.document.activeElement = this; }
}
const all = node => [node, ...node.children.flatMap(all)];
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture(t, { local = false, response = "ready" } = {}) {
  const previous = globalThis.document;
  const body = new Element("body");
  const make = (tag, id) => Object.assign(new Element(tag), { id });
  const hud = make("nav", "travel-toolbar");
  const town = make("dialog", "town-dialog"), actions = make("div", "town-actions");
  actions.append(make("button", "town-conversation"));
  town.append(actions);
  body.append(hud, town);
  const find = id => all(body).find(node => node.id === id);
  const doc = { body, documentElement: { lang: "en" }, createElement: tag => new Element(tag),
    querySelector: selector => selector === "dialog[open]"
      ? all(body).find(node => node.tagName === "dialog" && node.open) : find(selector.slice(1)) };
  globalThis.document = doc;
  const state = { startedAt: 123, elapsedMinutes: 0, col: 2, row: 3,
    pursuit: { version: 1, startedMinutes: 0, x: 9999, y: 8888 },
    ...(!local ? { serverJourney: { id: "a".repeat(32) }, journalAccess: "b".repeat(64) } : {}) };
  const cell = { terrain: "place", settlements: [{ osmId: "node/1", name: "PRIVATE TOWN" }] };
  let current = { state, cell }, calls = [];
  const narrative = createLiveNarrative({ fetcher: async (_, options) => {
    const data = JSON.parse(options.body);
    calls.push(data);
    const brief = data.brief;
    return { ok: true, json: async () => ({ brief, enabled: response !== "disabled",
      status: response, text: response === "ready" ? {
        en: `Cached ${NARRATIVE_BRIEFS[brief].en}`, fr: `En cache : ${NARRATIVE_BRIEFS[brief].fr}`,
      } : null }) };
  } });
  const ui = setupPursuitNews(() => "UNREGISTERED TRANSLATION", { context: () => current, narrative });
  t.after(() => { ui.reset(); narrative.reset(); globalThis.document = previous; });
  return { ui, state, cell, doc, find, calls, narrative, hud, town,
    setCurrent(value) { current = value; ui.update(); },
    open() { find("open-pursuit-news").click(); } };
}

test("registered bilingual newspaper and inhabitants reports use existing cache without leaking private state", async t => {
  const h = fixture(t);
  assert.equal(h.find("open-pursuit-news").parentElement, h.hud);
  assert.equal(h.find("town-pursuit-news").parentElement.id, "town-actions");
  assert.equal(h.calls.length, 0);
  const before = JSON.stringify(h.state);
  h.open();
  assert.equal(h.find("pursuit-news-dialog").open, true);
  assert.equal(h.find("pursuit-news-headline").textContent, NARRATIVE_BRIEFS["pursuit.news.headline.0"].en);
  assert.match(h.find("pursuit-news-status").textContent, /Authored bulletin/);
  await flush();
  assert.match(h.find("pursuit-news-headline").textContent, /^Cached /);
  assert.match(h.find("pursuit-news-status").textContent, /Generated bulletin/);
  assert.equal(h.find("pursuit-news-inhabitants").hidden, true);
  h.find("pursuit-news-ask").click();
  await flush();
  assert.equal(h.find("pursuit-news-inhabitants").hidden, false);
  assert.match(h.find("pursuit-news-inhabitants").children[1].textContent, /^Cached /);
  assert.deepEqual(h.calls.map(call => call.brief),
    ["pursuit.news.headline.0", "pursuit.news.report", "pursuit.inhabitant.report"]);
  for (const call of h.calls) assert.deepEqual(Object.keys(call).sort(), ["brief", "journey"]);
  assert.doesNotMatch(JSON.stringify(h.calls), /PRIVATE TOWN|9999|8888/);
  assert.equal(JSON.stringify(h.state), before);
  for (let index = 0; index < 3; index++) {
    h.find("pursuit-news-dialog").close();
    h.open();
    h.find("pursuit-news-ask").click();
    h.ui.update();
  }
  await flush();
  assert.equal(h.calls.length, 3);
  h.doc.documentElement.lang = "fr";
  h.ui.update();
  assert.equal(h.find("open-pursuit-news").textContent, "Le journal local");
  assert.match(h.find("pursuit-news-report").textContent, /^En cache/);
  assert.match(h.find("pursuit-news-ask").textContent, /poursuivant/);
  h.find("pursuit-news-dialog").close();
  assert.equal(h.doc.activeElement, h.find("open-pursuit-news"));
});

test("unavailable, unnamed and non-settlement cells, inactive pursuit and blocked or ended journeys cannot give reports", t => {
  const h = fixture(t);
  const cases = [
    null, { state: { ...h.state, pursuit: undefined }, cell: h.cell },
    { state: { ...h.state, pursuit: { version: 2 } }, cell: h.cell },
    { state: { ...h.state, ended: "exhausted" }, cell: h.cell },
    { state: h.state, cell: h.cell, blocked: true },
    ...[{ ...h.cell, unavailable: true }, { ...h.cell, terrain: "water" },
      { ...h.cell, terrain: "major_road" }, { ...h.cell, settlements: [] },
      { ...h.cell, settlements: [{ osmId: "node/1", name: " " }] },
      { ...h.cell, settlements: [{ osmId: "invalid", name: "A town" }] }].map(cell => ({ state: h.state, cell })),
  ];
  for (const current of cases) {
    h.setCurrent(current);
    h.open();
    assert.equal(h.find("open-pursuit-news").hidden, true);
    assert.equal(h.find("pursuit-news-dialog").open, false);
  }
  assert.equal(h.calls.length, 0);
});

test("daily selection survives reset and cycles a bounded set without render-time generation", async t => {
  const h = fixture(t);
  h.open();
  await flush();
  h.ui.reset();
  assert.equal(h.find("pursuit-news-dialog").open, false);
  assert.equal(h.find("open-pursuit-news").hidden, true);
  h.ui.update();
  h.open();
  await flush();
  assert.equal(h.calls.length, 2);
  for (let day = 1; day <= 3; day++) {
    h.state.elapsedMinutes = day * 1440;
    h.ui.update();
    assert.equal(h.find("pursuit-news-dialog").open, false);
    h.open();
    await flush();
    assert.match(h.find("pursuit-news-edition").textContent, new RegExp(`Day ${day + 1}`));
  }
  assert.deepEqual(h.calls.map(call => call.brief),
    ["pursuit.news.headline.0", "pursuit.news.report", "pursuit.news.headline.1", "pursuit.news.headline.2"]);
  h.state.col++;
  h.ui.update();
  assert.equal(h.find("pursuit-news-dialog").open, false);
  assert.equal(h.find("pursuit-news-report").textContent, "");
});

test("local, disabled and failed providers explicitly retain authored prose without retries", async t => {
  for (const options of [{ local: true }, { response: "disabled" }, { response: "failed" }]) {
    await t.test(options.local ? "local" : options.response, async t => {
      const h = fixture(t, options);
      h.open();
      await flush();
      h.find("pursuit-news-ask").click();
      await flush();
      assert.equal(h.find("pursuit-news-report").textContent, NARRATIVE_BRIEFS["pursuit.news.report"].en);
      assert.match(h.find("pursuit-news-status").textContent, /Authored bulletin/);
      assert.match(h.find("pursuit-news-status").textContent, /unavailable|could not be written/);
      const count = h.calls.length;
      h.find("pursuit-news-dialog").close();
      h.open();
      h.find("pursuit-news-ask").click();
      await flush();
      assert.equal(h.calls.length, count);
      if (options.local) assert.equal(count, 0);
    });
  }
});

test("town action opens over town modal but never interrupts other dialogs or survives a journey switch", async t => {
  const h = fixture(t);
  const other = new Element("dialog");
  other.id = "other-dialog";
  h.doc.body.append(other);
  other.showModal();
  h.open();
  assert.equal(h.find("pursuit-news-dialog").open, false);
  assert.equal(h.calls.length, 0);
  other.close();
  h.town.showModal();
  h.find("town-pursuit-news").click();
  assert.equal(h.find("pursuit-news-dialog").open, true);
  await flush();
  h.setCurrent({ state: { ...h.state, serverJourney: { id: "c".repeat(32) } }, cell: h.cell });
  assert.equal(h.find("pursuit-news-dialog").open, false);
  assert.equal(h.find("pursuit-news-report").textContent, "");
});
