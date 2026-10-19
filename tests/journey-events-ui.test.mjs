import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setupJourneyEvents } from "../journey-events-ui.mjs";
import { acknowledgeJourneyEvent } from "../journey-events.mjs";
import { translate } from "../i18n.mjs";
import { journeyEventArt } from "../journey-event-art.mjs";

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
      close() { this.open = false; }
      focus() {}
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
    const ui = setupJourneyEvents((key, args) => translate(language, key, args), {
      context: () => current,
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
