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
      handlers: {}, children: [], dataset: {},
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
  const hits = [], settled = [], mistakes = [];
  let stops = 0;
  let roll = 0, limit = 3;
  t.mock.method(Math, "random", () => roll);
  t.mock.method(performance, "now", () => now);
  t.mock.method(globalThis, "setInterval", callback => { tick = callback; return 123; });
  t.mock.method(globalThis, "clearInterval", () => {});
  const ui = setupMusic((key, args) => `${key} ${JSON.stringify(args ?? {})}`, { available: () => true, begin: () => true,
    mistakeLimit: () => limit,
    settle(score, errors) { settled.push(score); mistakes.push(errors); return errors >= current.mistakeLimit ? 0 : 100; },
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
  assert.deepEqual(mistakes, [2]);
  assert.equal(stops, 1);
  assert.equal(nodes.get("#music-result").dataset.feedback, "success");
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
  doc.hidden = false;
  nodes.get("#music-start").handlers.click();
  now = beatTime(current, 0);
  nodes.get("#music-tap").handlers.click();
  now = current.startedAt + MUSIC.leadMs + current.pattern.indexOf(0) * MUSIC.intervalMs;
  const key = { code: "Space", preventDefault() {}, repeat: false };
  nodes.get("#music-dialog").handlers.keydown(key);
  assert.match(nodes.get("#music-score").textContent, /"mistakes":1/);
  nodes.get("#music-dialog").handlers.keydown({ ...key, repeat: true });
  assert.match(nodes.get("#music-score").textContent, /"mistakes":1/);
  nodes.get("#music-dialog").handlers.keydown(key);
  assert.match(nodes.get("#music-score").textContent, /"mistakes":2/);
  assert.equal(nodes.get("#music-tap").disabled, false);
  nodes.get("#music-dialog").handlers.keydown(key);
  assert.match(nodes.get("#music-score").textContent, /"mistakes":3,"limit":3/);
  assert.match(nodes.get("#music-result").textContent, /musicTooManyMistakes/);
  assert.equal(nodes.get("#music-result").dataset.feedback, "failure");
  assert.deepEqual(settled, [1, 0, 0]);
  assert.deepEqual(mistakes, [2, 0, 3]);
  assert.equal(stops, 3);
  assert.equal(nodes.get("#music-tap").disabled, true);
  nodes.get("#music-dialog").handlers.keydown(key);
  ui.reset();
  assert.equal(stops, 3);
  assert.deepEqual(settled, [1, 0, 0]);
  limit = 8;
  nodes.get("#open-music").handlers.click();
  assert.match(nodes.get("#music-card-effect").textContent, /"charisma":6,"limit":8/);
  nodes.get("#music-start").handlers.click();
  now = current.startedAt + MUSIC.leadMs + current.pattern.indexOf(0) * MUSIC.intervalMs;
  for (let errors = 1; errors <= 8; errors++) {
    nodes.get("#music-tap").handlers.click();
    assert.match(nodes.get("#music-score").textContent, new RegExp(`"mistakes":${errors},"limit":8`));
    assert.equal(nodes.get("#music-tap").disabled, errors === 8);
  }
  assert.deepEqual(settled, [1, 0, 0, 0]);
  assert.deepEqual(mistakes, [2, 0, 3, 8]);
  assert.match(nodes.get("#music-result").textContent, /musicTooManyMistakes.*"limit":8/);
  ui.reset();
});
