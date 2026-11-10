import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setupJourneyEvents } from "../journey-events-ui.mjs";
import { acknowledgeJourneyEvent } from "../journey-events.mjs";
import { translate } from "../i18n.mjs";
import { journeyEventArt } from "../journey-event-art.mjs";
import { eventChallenge, challengeOutcome } from "../event-qte.mjs";

const economy = JSON.parse(readFileSync(new URL("../public/economy.json", import.meta.url)));
const flush = () => new Promise(resolve => setImmediate(resolve));

for (const language of ["fr", "en"]) {
  test(`${language} event notice waits for needs/daily dialogs, acknowledges once and preserves saved outcomes`, async t => {
    const original = { document: globalThis.document, MutationObserver: globalThis.MutationObserver };
    t.after(() => Object.assign(globalThis, original));
    class Element {
      handlers = {}; open = false; textContent = "";
      dataset = {}; style = {};
      replaceChildren(...children) { this.children = children; this.textContent = children.map(c => typeof c === "string" ? c : c.textContent).join(""); }
      addEventListener(name, fn) { this.handlers[name] = fn; }
      showModal() { this.open = true; }
      close() { this.open = false; this.handlers.close?.(); }
      focus() {}
      before() {}
      querySelector() { return null; }
      setAttribute() {}
    }

    const nodes = new Map(), el = id => {
      if (!nodes.has(id)) nodes.set(id, new Element());
      return nodes.get(id);
    };
    let observe;
    globalThis.document = { documentElement: { lang: language }, createElement: () => new Element(),
      querySelector: id => id === "dialog[open]" ? [...nodes.values()].find(e => e.open) : el(id) };
    globalThis.MutationObserver = class {
      constructor(fn) { observe = fn; }
      observe() {}
    };
    const event = { id: 1, kind: "coins", birthCard: "star", dailyCard: "moon",
      occurrence: 0.315, positive: 0.55, minutes: 0, foodKcal: 0, moneyCents: 150,
      fatigue: 0, reputation: 0 };
    const current = { state: { ended: null, tarotDay: "2026-10-18", dailyTarotSeenDay: "2026-10-17",
      walletCents: 150, events: { pending: 1, history: [event] } }, economy, busy: false, saveStatus: "Saved" };
    let acknowledgements = 0;
    let imageReady = false, paint;
    const ui = setupJourneyEvents((key, args) => translate(language, key, args), {
      context: () => current,
      illustrations: { render: () => imageReady, subscribe: listener => { paint = listener; } },
      acknowledge() { acknowledgements++; current.state = acknowledgeJourneyEvent(current.state); },
    });
    ui.update();
    await flush();
    assert.equal(el("#journey-event-dialog").open, false);
    current.state.dailyTarotSeenDay = current.state.tarotDay;
    current.busy = true;
    ui.update(); await flush();
    assert.equal(el("#journey-event-dialog").open, false);
    current.busy = false;
    el("#needs-notice-dialog").open = true;
    observe(); await flush();
    assert.equal(el("#journey-event-dialog").open, false);
    el("#needs-notice-dialog").close();
    observe(); await flush();
    assert.equal(el("#journey-event-dialog").open, true);
    assert.match(el("#journey-event-text").textContent, /1\.50/);
    assert.equal(el("#journey-event-text").children.find(c => c.textContent === "+1.50").dataset.feedback, "success");
    assert.equal(el("#journey-event-text").children.find(c => c.textContent === "0").dataset.feedback, undefined);
    assert.equal(el("#journey-event-art").textContent, journeyEventArt("coins"));
    assert.equal(el("#journey-event-art").hidden, false);
    imageReady = true;
    paint();
    assert.equal(el("#journey-event-art").hidden, true, "decoded image replaces ASCII without reopening");
    imageReady = false;
    paint();
    assert.equal(el("#journey-event-art").hidden, false, "failed image leaves the ASCII fallback visible");
    const cards = el("#journey-event-cards").textContent;
    assert.ok(cards.includes(economy.tarot.find(c => c.id === "star")[language]));
    assert.ok(cards.includes(economy.tarot.find(c => c.id === "moon")[language]));
    assert.equal(el("#journey-event-save").textContent, "Saved");
    let prevented = false;
    el("#journey-event-dialog").handlers.cancel({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    ui.update(); ui.update(); await flush();
    assert.equal(el("#journey-event-art").textContent, journeyEventArt("coins"));
    assert.equal(acknowledgements, 0);
    el("#journey-event-continue").handlers.click();
    el("#journey-event-continue").handlers.click();
    assert.equal(acknowledgements, 1);
    assert.equal(current.state.events.pending, null);
    assert.equal(current.state.walletCents, 150);
    assert.equal(el("#journey-event-dialog").open, false);
    observe(); await flush();
    assert.equal(el("#journey-event-dialog").open, false);
    current.state.events.pending = 1;
    current.state.events.history[0] = { ...event, kind: "forestBoar" };
    current.state.ended = "hunger";
    el("#needs-notice-dialog").open = true;
    ui.update(); await flush();
    assert.equal(el("#journey-event-dialog").open, false);
    el("#needs-notice-dialog").close();
    observe(); await flush();
    assert.equal(el("#journey-event-dialog").open, true);
    assert.equal(el("#journey-event-art").textContent, journeyEventArt("forestBoar"));
    el("#journey-event-continue").handlers.click();
    assert.equal(current.state.ended, "hunger");
    ui.reset();
    assert.equal(acknowledgements, 2);
  });
}

test("QTE dialog blocks continue, preserves active attempts during localization, and clears stale journey controls", async t => {
  const original = { document: globalThis.document, MutationObserver: globalThis.MutationObserver };
  t.after(() => Object.assign(globalThis, original));
  let doc;
  class Element {
    children = []; handlers = {}; attributes = {}; dataset = {}; style = {};
    hidden = false; disabled = false; open = false; textContent = "";
    constructor(tag = "div") { this.tag = tag; this.ownerDocument = doc; }
    append(...children) { for (const child of children) { this.children.push(child); if (typeof child !== "string") child.parent = this; } }
    before(child) { if (child.parent) child.remove(); this.parent.children.splice(this.parent.children.indexOf(this), 0, child); child.parent = this.parent; }
    replaceChildren(...children) { this.children = []; this.append(...children); this.textContent = children.map(c => typeof c === "string" ? c : c.textContent).join(""); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); }
    addEventListener(name, callback) { this.handlers[name] = callback; }
    removeEventListener(name, callback) { if (this.handlers[name] === callback) delete this.handlers[name]; }
    setAttribute(name, value) { this.attributes[name] = value; }
    removeAttribute(name) { delete this.attributes[name]; }
    querySelector(selector) { return all(this).find(node => `#${node.id}` === selector) ?? null; }
    focus() { doc.activeElement = this; }
    showModal() { this.open = true; this.children.find(child => child.tag === "button")?.focus(); }
    close() { this.open = false; this.handlers.close?.(); }
  }
  const all = element => [element, ...element.children.filter(child => typeof child !== "string").flatMap(all)];
  const nodes = new Map(), el = selector => {
    if (!nodes.has(selector)) nodes.set(selector, new Element());
    return nodes.get(selector);
  };
  const timers = new Set();
  let time = 0;
  doc = { documentElement: { lang: "en" }, createElement: tag => new Element(tag),
    defaultView: { performance: { now: () => time }, setInterval: fn => { timers.add(fn); return fn; }, clearInterval: fn => timers.delete(fn) },
    addEventListener() {}, removeEventListener() {},
    querySelector: selector => selector === "dialog[open]" ? [...nodes.values()].find(e => e.open) : el(selector) };
  globalThis.document = doc;
  globalThis.MutationObserver = class { observe() {} };
  const dialog = el("#journey-event-dialog"), proceed = el("#journey-event-continue");
  dialog.append(proceed);
  const event = { id: 1, opportunity: 1, kind: "coins", birthCard: "star", dailyCard: "moon",
    occurrence: 0.315, positive: 0.55, minutes: 0, foodKcal: 0, moneyCents: 0, fatigue: 0, reputation: 0,
    qte: { version: 1, status: "ready" } };
  const current = { state: { startedAt: "first-journey", ended: null, tarotDay: "2026-10-18",
    dailyTarotSeenDay: "2026-10-18", events: { pending: 1, history: [event] } }, economy, busy: false, saveStatus: "Saved" };
  let starts = 0, settlements = 0, acknowledgements = 0, imageReady = false, paint, imageContainer;
  const ui = setupJourneyEvents((key, args) => translate(doc.documentElement.lang, key, args), {
    context: () => current,
    illustrations: {
      render(container, state, scene, occurrence) {
        imageContainer = container;
        assert.equal(scene, "event.coins");
        assert.equal(occurrence, "event:1");
        return imageReady;
      },
      subscribe(listener) { paint = listener; },
    },
    pinEvent(host) { host.textContent = "Settled event pin"; },
    beginChallenge(id, mode) {
      starts++;
      assert.equal(id, 1);
      current.state.events.history[0] = { ...event, qte: { version: 1, status: "active", mode } };
      ui.update();
      return true;
    },
    settleChallenge(id, result) {
      settlements++;
      const active = current.state.events.history[0];
      const status = challengeOutcome(active, active.qte.mode, result.trace, result.elapsedMs, result.skipped);
      current.state.events.history[0] = { ...active, qte: { ...active.qte, status }, moneyCents: status === "success" ? 150 : 0 };
      ui.update();
      return true;
    },
    acknowledge() { acknowledgements++; current.state = acknowledgeJourneyEvent(current.state); },
  });
  ui.update(); await flush();
  assert.equal(dialog.open, true);
  assert.equal(proceed.disabled, true);
  assert.equal(all(dialog).find(node => node.className === "event-qte-receipt").hidden, true);
  proceed.handlers.click();
  assert.equal(acknowledgements, 0);
  assert.equal(starts, 1, "challenge starts automatically when the dialog opens");
  assert.equal(imageContainer.parent.className, "event-qte-scene");
  const fallback = all(dialog).find(node => node.className === "event-qte-backdrop");
  assert.equal(fallback.hidden, false);
  imageReady = true; paint();
  assert.equal(fallback.hidden, true, "decoded model artwork replaces the QTE's ASCII fallback");
  imageReady = false; paint();
  assert.equal(fallback.hidden, false, "image failure restores the contextual fallback without restarting");
  const activeSection = all(dialog).find(node => node.tag === "section");
  doc.documentElement.lang = "fr";
  ui.update(); await flush();
  assert.equal(all(dialog).find(node => node.tag === "section"), activeSection, "language switch cannot restart an active attempt");
  assert.equal(timers.size, 1);
  time = 1000;
  activeSection.handlers.keydown({ key: " ", preventDefault() {}, stopPropagation() {} });
  assert.equal(starts, 1);
  assert.equal(settlements, 1);
  assert.equal(proceed.disabled, false);
  const receipt = all(dialog).find(node => node.className === "event-qte-receipt");
  assert.equal(receipt.hidden, false);
  assert.equal(receipt.open, true, "settled outcome opens above the event panel");
  assert.ok(receipt.children.some(node => node.textContent === "+1.50"));
  assert.equal(doc.activeElement, receipt.children.at(-1), "result dismissal keeps keyboard focus above the event");
  const dismiss = receipt.children.at(-1);
  ui.update(); await flush();
  assert.equal(receipt.children.at(-1), dismiss, "observer refresh preserves the focused dismissal control");
  receipt.close();
  assert.equal(doc.activeElement, proceed);
  ui.update(); await flush();
  assert.equal(receipt.open, false, "refreshing the event cannot reopen a dismissed receipt");
  assert.equal(timers.size, 0);
  assert.equal(dialog.attributes["data-native-controls"], undefined);
  const pin = dialog.querySelector("#journey-event-pin");
  assert.equal(pin.textContent, "Settled event pin");
  current.state = { ...current.state, startedAt: "second-journey", events: { pending: 1, history: [event] } };
  ui.update();
  assert.equal(pin.hidden, true, "previous event's pin must not remain actionable on an unresolved event");
  assert.equal(proceed.disabled, true);
  const staleSection = all(dialog).find(node => node.tag === "section");
  const staleInput = staleSection.handlers.keydown;
  ui.reset();
  staleInput({ key: " ", preventDefault() {}, stopPropagation() {} });
  assert.equal(starts, 1);
  assert.equal(timers.size, 0);
  assert.equal(dialog.open, false);
});
