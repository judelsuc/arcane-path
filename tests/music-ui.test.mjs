import test from "node:test";
import assert from "node:assert/strict";
import { setupMusic } from "../music-ui.mjs";
import { beatTime, MUSIC } from "../music.mjs";

test("street performance wires melody, successful and failed taps, finish and hidden-tab cancellation", t => {
  const original = globalThis.document;
  t.after(() => { globalThis.document = original; });
  const nodes = new Map();
  function element() {
    return {
      handlers: {}, children: [],
      addEventListener(name, listener) { this.handlers[name] = listener; },
      replaceChildren() { this.children = []; }, append(child) { this.children.push(child); },
      focus() {}, showModal() { this.open = true; }, close() { this.open = false; },
    };
  }
  const doc = { hidden: false, handlers: {},
    addEventListener(name, listener) { this.handlers[name] = listener; },
    createElement: element,
    querySelector(selector) {
      if (selector === "dialog[open]") return null;
      if (!nodes.has(selector)) nodes.set(selector, element());
      return nodes.get(selector);
    },
  };
  globalThis.document = doc;
  let now = 1000, tick, current;
  const hits = [], settled = [];
  let stops = 0;
  let roll = 0;
  t.mock.method(Math, "random", () => roll);
  t.mock.method(performance, "now", () => now);
  t.mock.method(globalThis, "setInterval", callback => { tick = callback; return 123; });
  t.mock.method(globalThis, "clearInterval", () => {});
  const ui = setupMusic(key => key, { available: () => true, begin: () => true,
    settle(score) { settled.push(score); return 100; },
    audio: { start(game) { current = game; }, hit(value) { hits.push(value); }, stop() { stops++; } },
  });
  nodes.get("#open-music").handlers.click();
  nodes.get("#music-start").handlers.click();
  assert.ok(current);
  assert.equal(nodes.get("#music-track").children.length, MUSIC.slots);
  assert.equal(nodes.get("#music-track").children.filter(e => e.className === "music-beat rest").length, 4);
  assert.deepEqual(nodes.get("#music-track").children.map(e => e.className !== "music-beat rest"),
    current.pattern.map(Boolean));
  const firstPattern = current.pattern;
  nodes.get("#music-tap").handlers.click();
  now = beatTime(current, 0);
  nodes.get("#music-tap").handlers.click();
  nodes.get("#music-tap").handlers.click();
  assert.deepEqual(hits, [false, true, false]);
  now = beatTime(current, 8);
  tick();
  assert.match(nodes.get("#music-score").textContent, /musicLoop/);
  assert.equal(nodes.get("#music-tap").disabled, false);
  now = beatTime(current, MUSIC.beats - 1) + MUSIC.windowMs;
  tick();
  assert.deepEqual(settled, [1]);
  assert.equal(stops, 1);
  assert.equal(nodes.get("#music-tap").disabled, true);
  roll = 0.99;
  nodes.get("#music-start").handlers.click();
  assert.notDeepEqual(current.pattern, firstPattern);
  assert.deepEqual(nodes.get("#music-track").children.map(e => e.className !== "music-beat rest"),
    current.pattern.map(Boolean));
  doc.hidden = true;
  doc.handlers.visibilitychange();
  assert.deepEqual(settled, [1, 0]);
  assert.equal(stops, 2);
  ui.reset();
  assert.equal(stops, 2);
});
