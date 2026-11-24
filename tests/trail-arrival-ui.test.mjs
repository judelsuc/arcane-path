import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setupTrailArrival } from "../trail-arrival-ui.mjs";
import { recordTrailArrival } from "../trail.mjs";
import { translate } from "../i18n.mjs";

for (const language of ["fr", "en"]) {
  test(`${language} arrival celebrates once, waits for other dialogs and busy actions, and reveals no future stop`, async t => {
    const original = { document: globalThis.document, MutationObserver: globalThis.MutationObserver };
    t.after(() => Object.assign(globalThis, original));
    class Element {
      events = {}; open = false; shows = 0;
      addEventListener(name, fn) { this.events[name] = fn; }
      showModal() { this.open = true; this.shows++; }
      close() { this.open = false; }
      focus() { this.focused = true; }
    }
    const elements = new Map();
    const element = key => {
      if (!elements.has(key)) elements.set(key, new Element());
      return elements.get(key);
    };
    let observer, otherDialog = false, busy = false, trailOpened = 0;
    globalThis.document = { body: {}, querySelector: key => key === "dialog[open]"
      ? otherDialog || element("#trail-arrival-dialog").open : element(key) };
    globalThis.MutationObserver = class {
      constructor(fn) { observer = fn; }
      observe() {}
    };
    let state = { col: 0, row: 0, elapsedMinutes: 30, ended: null, trail: {
      version: 2, index: 0, parentName: "Camille", completed: false,
      stages: [{ name: "Reached village", col: 10, row: -2 },
        { name: "SECRET FUTURE", col: 40, row: -2 }],
    } };
    const ui = setupTrailArrival((key, args) => translate(language, key, args), {
      context: () => ({ state, busy }), openTrail: () => { trailOpened++; },
    });
    ui.update(); await Promise.resolve();
    const dialog = element("#trail-arrival-dialog");
    assert.equal(dialog.open, false);
    state = recordTrailArrival({ ...state, col: 9, row: -1 });
    const reached = structuredClone(state);
    busy = true; ui.update(); await Promise.resolve();
    assert.equal(dialog.open, false);
    busy = false; otherDialog = true; ui.update(); await Promise.resolve();
    assert.equal(dialog.open, false);
    otherDialog = false; observer(); await Promise.resolve();
    assert.equal(dialog.open, true);
    assert.equal(element("#trail-arrival-title").textContent, translate(language, "trailArrivalTitle"));
    assert.match(element("#trail-arrival-text").textContent, /Camille.*Reached village.*1\/2/);
    assert.doesNotMatch(element("#trail-arrival-text").textContent, /SECRET FUTURE/);
    assert.equal(element("#trail-arrival-investigate").focused, true);
    assert.deepEqual(state, reached, "showing the popup must not modify gameplay");
    element("#trail-arrival-investigate").events.click();
    assert.equal(trailOpened, 1);
    assert.equal(dialog.open, false);
    state = recordTrailArrival({ ...state, col: 10, row: -2 });
    ui.update(); await Promise.resolve();
    assert.equal(dialog.shows, 1, "revisiting or redraw must not replay a popup");
    ui.reset(state); ui.update(); await Promise.resolve();
    assert.equal(dialog.shows, 1, "resume seeds already recorded arrivals");
    state = recordTrailArrival({ ...state, col: 40, row: -2, trail: { ...state.trail, index: 1 } });
    ui.update(); await Promise.resolve();
    assert.equal(dialog.shows, 2);
    element("#trail-arrival-continue").events.click();
    assert.equal(element("#ascii-map").focused, true);
    assert.equal(trailOpened, 1);
    ui.reset();
    state = { ...state, ended: "reunion" };
    ui.update(); await Promise.resolve();
    assert.equal(dialog.open, false, "final reunion retains its own UI");
    ui.reset();
    ui.update();
    ui.reset();
    await Promise.resolve();
    assert.equal(dialog.open, false, "reset discards queued notices");
  });
}

test("arrival popup is wired after survival/event notices and reset on resume and exit", () => {
  const source = readFileSync(new URL("../travel-ui.mjs", import.meta.url), "utf8");
  assert.ok(source.indexOf("trailArrivalUI.update()") > source.indexOf("needsNotices.update()"));
  assert.ok(source.indexOf("trailArrivalUI.update()") > source.indexOf("journeyEventsUI.update()"));
  assert.match(source, /trailArrivalUI\.reset\(restored \? state : undefined\)/);
  assert.match(source, /needsNotices\.reset\(\);\s*trailArrivalUI\.reset\(\)/);
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /id="trail-arrival-dialog" aria-labelledby="trail-arrival-title" aria-describedby="trail-arrival-text"/);
});
