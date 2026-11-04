import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { earningOptions, setupEarnMoney } from "../earn-money-ui.mjs";
import { startEconomy } from "../economy.mjs";
import { startSurvival } from "../survival.mjs";
import { translate } from "../i18n.mjs";

test("earning menu preserves existing opportunities and mapped cafes outside town without remote jobs", () => {
  assert.deepEqual(earningOptions({ terrain: "forest" }), { beg: false, steal: false, music: false, cafe: false });
  assert.deepEqual(earningOptions({ terrain: "place" }), { beg: true, steal: false, music: true, cafe: false });
  assert.deepEqual(earningOptions({ terrain: "road", pois: [
    { osmId: "node/1", tags: { amenity: "restaurant" } }, { tags: { shop: "bakery" } },
  ] }), { beg: false, steal: true, music: false, cafe: true });
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const menu = /<dialog id="earn-money-dialog"[\s\S]*?<\/dialog>/.exec(html)[0];
  for (const id of ["choice-beg", "choice-steal", "open-music", "open-cafe"]) {
    assert.ok(menu.includes(`id="${id}"`));
    assert.equal(html.split(`id="${id}"`).length - 1, 1);
  }
  assert.doesNotMatch(html, /id="town-music"|id="cell-music"/);
  assert.match(menu, /earnTheftFood/);
});

test("town/cell entrypoints open one menu, actions forward once and ended actions close", () => {
  class Element {
    events = {}; dataset = {}; textContent = ""; open = false;
    addEventListener(name, fn) { this.events[name] = fn; }
    showModal() { this.open = true; }
    close() { this.open = false; }
    focus() {} scrollIntoView() {}
  }
  const original = globalThis.document;
  try {
    const elements = new Map(), element = id => {
      if (!elements.has(id)) elements.set(id, new Element());
      return elements.get(id);
    };
    globalThis.document = { querySelector: id => id === "dialog[open]"
      ? [...elements.values()].find(e => e.open) : element(id) };
    const current = { cell: { terrain: "place" }, state: { ended: null }, blocked: false, saveStatus: "Saved" };
    const called = [];
    let thefts = 0;
    const ui = setupEarnMoney(key => key, { context: () => current, perform(kind) {
      called.push(kind);
      element("#survival-choice-result").textContent = "Money received";
      element("#survival-choice-result").dataset.feedback = "success";
    }, steal() { thefts++; } });
    element("#town-dialog").open = true;
    element("#town-earn-money").events.click();
    assert.equal(element("#town-dialog").open, false);
    assert.equal(element("#earn-money-dialog").open, true);
    assert.equal(element("#earn-cafe").hidden, true);
    element("#choice-beg").events.click();
    assert.deepEqual(called, ["beg"]);
    assert.equal(element("#earn-money-result").textContent, "Money received");
    current.cell.pois = [{ tags: { shop: "bakery" } }];
    element("#choice-steal").events.click();
    assert.equal(thefts, 1);
    assert.deepEqual(called, ["beg"]);
    current.blocked = true;
    element("#choice-beg").events.click();
    assert.equal(called.length, 1);
    ui.reset();
    assert.equal(element("#earn-money-dialog").open, false);
  } finally { globalThis.document = original; }
});

test("new activities show actual terms before opening, and harvest advertises per-point rather than capped earnings", t => {
  class Element {
    events = {}; dataset = {}; textContent = ""; open = false; children = [];
    addEventListener(name, callback) { this.events[name] = callback; }
    append(...elements) { this.children.push(...elements); }
    before(element) { this.beforeElement = element; }
    showModal() { this.open = true; }
    close() { this.open = false; }
  }
  const original = globalThis.document, elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  globalThis.document = { documentElement: { lang: "en" }, createElement: () => new Element(),
    querySelector: id => id === "dialog[open]" ? [...elements.values()].find(e => e.open) : element(id) };
  t.after(() => { globalThis.document = original; });
  const data = JSON.parse(readFileSync(new URL("../public/economy.json", import.meta.url)));
  const survival = JSON.parse(readFileSync(new URL("../public/config.json", import.meta.url))).survival;
  const state = startEconomy(startSurvival(14, 10, Date.UTC(2026, 9, 18, 12),
    "balanced", survival), data, () => 0);
  const current = { state, cell: { terrain: "vineyard", countryCodes: ["FR"] },
    info: { latitude: 44.54, longitude: 2.3 }, data, survival, blocked: false };
  const opened = [];
  const ui = setupEarnMoney((key, args) => translate("en", key, args), {
    context: () => current, perform() {}, steal() {},
    miniGames: { available: game => game === "harvest", open: game => opened.push(game) },
  });
  ui.open();
  const list = element("#earn-money-save").beforeElement;
  assert.equal(list.children.length, 9);
  const [button, terms] = list.children[0].children;
  assert.equal(button.textContent, "Vineyard harvest");
  assert.match(terms.textContent, /30 game minutes and 5 fatigue/);
  assert.match(terms.textContent, /Each paid point earns/);
  assert.doesNotMatch(terms.textContent, /Base maximum/);
  assert.equal(state.elapsedMinutes, 0);
  assert.equal(opened.length, 0);
  button.events.click();
  assert.deepEqual(opened, ["harvest"]);
  assert.equal(element("#earn-money-dialog").open, false);
});
