import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createNeedsNotices, setupNeedsNotices } from "../needs-notices.mjs";
import { isDeath, renderJourneyMarker } from "../death.mjs";
import { translate } from "../i18n.mjs";
import { startSurvival, restSurvival } from "../survival.mjs";

const config = JSON.parse(readFileSync(new URL("../public/config.json", import.meta.url))).survival;
const state = hunger => ({ reserveKcal: config.reserve_kcal * (1 - hunger / 100), ended: null });

test("hunger warning starts at exactly 75%, waits until shown, and rearms only after feeding", () => {
  const notices = createNeedsNotices();
  assert.equal(notices.pending(state(74.9), config), null);
  const hungry = state(75);
  const snapshot = structuredClone(hungry);
  assert.equal(notices.pending(hungry, config), "warning");
  assert.equal(notices.pending(hungry, config), "warning");
  notices.shown("warning");
  assert.equal(notices.pending(state(90), config), null);
  assert.equal(notices.pending(state(50), config), null);
  assert.equal(notices.pending(state(75), config), "warning");
  assert.deepEqual(hungry, snapshot);
});

test("terminal notice replaces hunger warning, supports ended saves, and does not repeat", () => {
  for (const ended of ["health", "hunger", "fatigue", "sleep"]) {
    const notices = createNeedsNotices();
    assert.equal(notices.pending({ ...state(100), ended }, config), ended);
    notices.shown(ended);
    assert.equal(notices.pending({ ...state(100), ended }, config), null);
  }
  assert.equal(createNeedsNotices().pending({ ...state(100), ended: "reunion" }, config), null);
});

test("zero health is game over and cannot be undone by resting", () => {
  const exhausted = restSurvival({ ...startSurvival(0, 0, 0, "balanced", config),
    reserveKcal: 1, health: 0.01 }, config);
  assert.equal(exhausted.reserveKcal, 0);
  assert.equal(exhausted.ended, "health");
  assert.throws(() => restSurvival(exhausted, config), /journey has ended/);
});

test("only death outcomes replace the marker with a cross; recovery and reunion keep the character", () => {
  const classes = new Set(), attributes = {};
  const tile = { classList: { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); } },
    setAttribute(name, value) { attributes[name] = value; } };
  for (const ended of [null, "health", "hunger", "fatigue", "sleep", "placement", "reunion"]) {
    const s = { ended };
    renderJourneyMarker(tile, s, key => translate("en", key));
    assert.equal(tile.textContent, isDeath(s) ? "†" : "@");
    assert.equal(classes.has("tile--dead"), isDeath(s));
    assert.equal(attributes["aria-current"], "location");
  }
});

for (const locale of ["fr", "en"]) {
  test(`${locale} death dialog shows arcane XIII and cause above a fade, acknowledges without revival`, async test => {
    const original = { document: globalThis.document, MutationObserver: globalThis.MutationObserver };
    test.after(() => Object.assign(globalThis, original));
    class Element {
      dataset = {}; events = {}; children = []; open = false; attributes = {};
      classes = new Set();
      classList = {
        toggle: (name, on) => { if (on) this.classes.add(name); else this.classes.delete(name); },
        remove: name => this.classes.delete(name),
      };
      addEventListener(event, fn) { this.events[event] = fn; }
      setAttribute(name, value) { this.attributes[name] = value; }
      append(...children) { this.children.push(...children); }
      replaceChildren(...children) { this.children = children; }
      querySelector(selector) { return selector === "img" ? this.children.find(c => c.tag === "img") : null; }
      showModal() { this.open = true; }
      close() { this.open = false; this.events.close?.(); }
    }
    const elements = new Map(), element = key => {
      if (!elements.has(key)) elements.set(key, new Element());
      return elements.get(key);
    };
    let otherDialog = false;
    globalThis.document = {
      body: new Element(),
      querySelector: key => key === "dialog[open]"
        ? otherDialog || element("#needs-notice-dialog").open : element(key),
      createElement: tag => Object.assign(new Element(), { tag }),
    };
    globalThis.MutationObserver = class { observe() {} };
    const current = { state: { ...state(100), health: 0, ended: "health" }, survival: config, busy: false };
    const before = structuredClone(current.state);
    const tr = (key, args) => translate(locale, key, args);
    const ui = setupNeedsNotices(tr, { context: () => current });
    const tick = async () => { ui.update(); await new Promise(resolve => setImmediate(resolve)); };
    otherDialog = true;
    await tick();
    assert.equal(element("#needs-notice-dialog").open, false);
    otherDialog = false;
    await tick();
    assert.equal(element("#needs-notice-dialog").open, true);
    assert.equal(element("#needs-notice-title").textContent, tr("deathTitle"));
    assert.ok(element("#needs-notice-text").textContent.includes(tr("deathCause.health")));
    assert.equal(element("#needs-death-card").hidden, false);
    const card = element("#needs-death-card").querySelector("img");
    assert.equal(card.src, "/public/tarot/nameless.jpg");
    assert.equal(card.alt, tr("deathCardTitle"));
    assert.equal(element("#death-fade").classes.has("active"), true);
    card.events.error();
    assert.equal(element("#needs-death-card").children[1].textContent, tr("tarotImageError"));
    element("#needs-death-retry").events.click();
    assert.notEqual(element("#needs-death-card").querySelector("img"), card);
    element("#needs-notice-dialog").close();
    await tick();
    assert.equal(element("#death-fade").classes.has("active"), false);
    assert.equal(element("#needs-notice-dialog").open, false);
    assert.deepEqual(current.state, before);
    ui.reset();
    current.state = { ...state(100), ended: "placement" };
    await tick();
    assert.equal(element("#needs-death-card").hidden, true);
    assert.equal(element("#death-fade").classes.has("active"), false);
    ui.reset();
    current.state = { ...state(80) };
    await tick();
    assert.equal(element("#needs-notice-title").textContent, tr("hungerWarningTitle"));
    current.state = { ...state(100), ended: "hunger" };
    await tick();
    assert.equal(element("#needs-notice-title").textContent, tr("deathTitle"));
    assert.equal(element("#needs-notice-actions").hidden, true);
  });
}

test("death fade is slow, nonblocking and reduced-motion aware; death artwork is not a draw", () => {
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(css, /#death-fade\s*\{[^}]*pointer-events: none;[^}]*transition: opacity 5s/s);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*?#death-fade \{ transition: none;/);
  assert.match(html, /id="needs-death-card" hidden/);
  assert.match(html, /id="death-fade" aria-hidden="true"/);
  const code = readFileSync(new URL("../needs-notices.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(code, /pinTarot|pinTarotCard|dailyCard\s*=/);
});
