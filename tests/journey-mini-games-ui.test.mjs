import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setupJourneyMiniGames } from "../journey-mini-games-ui.mjs";
import { beginJourneyMiniGame, settleJourneyMiniGame } from "../journey-mini-games.mjs";
import { startSurvival } from "../survival.mjs";
import { startEconomy } from "../economy.mjs";

test("actual journey adapter mounts, completes, displays receipt and cleans up a real harvest UI", t => {
  class Element {
    constructor(tag, doc) {
      this.tagName = tag; this.ownerDocument = doc; this.children = [];
      this.listeners = new Map(); this.attributes = {}; this.style = {}; this.dataset = {};
      this.textContent = ""; this.disabled = false; this.open = false;
    }
    append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
    remove() { this.parent.children = this.parent.children.filter(node => node !== this); }
    contains(node) { return this === node || this.children.some(child => child.contains(node)); }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(key, callback) {
      if (!this.listeners.has(key)) this.listeners.set(key, new Set());
      this.listeners.get(key).add(callback);
    }
    removeEventListener(key, callback) { this.listeners.get(key)?.delete(callback); }
    emit(key, event = {}) { for (const callback of [...(this.listeners.get(key) ?? [])]) callback(event); }
    focus() { this.ownerDocument.activeElement = this; }
    click() { if (!this.disabled) this.emit("click", { detail: 1 }); }
    showModal() { this.open = true; }
    close() { this.open = false; this.emit("close"); }
    querySelectorAll(selector) { return all(this).slice(1).filter(node => node.tagName === selector); }
    querySelector() { return all(this).slice(1).find(node => node.tagName === "button"); }
  }
  const all = element => [element, ...element.children.flatMap(all)];
  const doc = new Element("document");
  doc.documentElement = { lang: "en" };
  doc.body = new Element("body", doc);
  doc.hidden = false;
  doc.defaultView = new Element("window", doc);
  doc.createElement = tag => new Element(tag, doc);
  doc.createElementNS = (_, tag) => new Element(tag, doc);
  let now = 1000, timerId = 0;
  const timers = new Map();
  doc.defaultView.performance = { now: () => now };
  doc.defaultView.setInterval = callback => { timers.set(++timerId, callback); return timerId; };
  doc.defaultView.clearInterval = id => timers.delete(id);
  const originalDocument = globalThis.document;
  globalThis.document = doc;
  t.after(() => { globalThis.document = originalDocument; });
  const json = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
  const data = json("../public/economy.json"), survival = json("../public/config.json").survival;
  let state = startEconomy(startSurvival(14, 10, Date.UTC(2026, 9, 18, 12),
    "balanced", survival), data, () => 0);
  state = { ...state, elapsedMinutes: .125 };
  const cell = { terrain: "vineyard", countryCodes: ["FR"] };
  const info = { terrain: "vineyard", latitude: 44.54, longitude: 2.3 };
  let settlements = 0;
  const ui = setupJourneyMiniGames(() => "", {
    context: () => ({ state, cell, info, survival, data, blocked: Boolean(state.miniGamePending) }),
    audio: { harvest: { play() {}, stop() {} } },
    act(action) {
      if (action.type === "begin") state = beginJourneyMiniGame(state, action.game, action.context);
      else { settlements++; state = settleJourneyMiniGame(state, action.game, action.result); }
      return state;
    },
  });
  assert.equal(ui.open("harvest"), true);
  const dialog = doc.body.children[0];
  assert.equal(dialog.open, true);
  assert.equal(all(dialog).find(node => node.className === "journey-mini-game__content").dataset.miniGame, "harvest");
  assert.ok(Object.hasOwn(dialog.attributes, "data-native-controls"));
  const start = all(dialog).find(node => node.tagName === "button" && node.textContent === "Start");
  assert.ok(start);
  start.click();
  now += 30000;
  for (const callback of [...timers.values()]) callback();
  assert.equal(settlements, 1);
  assert.equal(state.miniGamePending, null);
  assert.equal(state.elapsedMinutes, 30.125);
  assert.equal(dialog.open, true);
  const receipt = all(dialog).find(node => node.className === "journey-mini-game__receipt");
  assert.equal(receipt.hidden, false);
  assert.match(receipt.children[0].textContent, /30 min/);
  assert.equal(timers.size, 0);
  all(dialog).find(node => node.className === "journey-mini-game__close").click();
  assert.equal(doc.body.children.length, 0);
  assert.equal(settlements, 1);
  ui.destroy();
  assert.equal(settlements, 1);
});

test("journey and previews load the same component stylesheet, not preview-only board rules", () => {
  const games = {
    harvest: "harvest", workshop: "workshop", sketch: "sketch", market: "market",
    bookshop: "bookshop", petanque: "petanque", lanterns: "lanterns", lostfound: "lost-found",
  };
  const css = readFileSync(new URL("../mini-games.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /(?:^|\n)\s*main\s*\{/);
  for (const [preview, game] of Object.entries(games)) {
    const html = readFileSync(new URL(`../${preview}-preview.html`, import.meta.url), "utf8");
    assert.match(html, /rel="stylesheet" href="\.\/mini-games\.css"/);
    assert.ok(css.includes(`:is(#${preview}-board, [data-mini-game="${game}"])`));
    assert.ok(!html.includes(`#${preview}-board` + " {"), preview);
  }
  for (const file of ["index.html", "tests/journey-games-browser.html"]) {
    assert.match(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"),
      /rel="stylesheet" href="\.\.?\/mini-games\.css"/);
  }
  assert.match(css, /\.market-art \{[^}]*width: 76px; height: 76px;/);
  assert.match(css, /\.market-shopping-list \{[^}]*display: flex;/);
  assert.match(css, /\.market-money-art \{[^}]*width: 90px;[^}]*height: 60px;/);
});
