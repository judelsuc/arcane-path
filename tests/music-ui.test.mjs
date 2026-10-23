import test from "node:test";
import assert from "node:assert/strict";
import { setupMusic } from "../music-ui.mjs";
import { beatTime, MUSIC, musicDifficulty, holdDuration } from "../music.mjs";

test("street performance wires melody, successful and failed taps, finish and hidden-tab cancellation", t => {
  const original = globalThis.document;
  t.after(() => { globalThis.document = original; });
  const nodes = new Map();
  let doc;
  function element() {
    return {
      ownerDocument: doc, handlers: {}, children: [], dataset: {}, style: { values: {},
        setProperty(key, value) { this.values[key] = value; } },
      addEventListener(name, listener) { this.handlers[name] = listener; },
      setAttribute(name, value) { this[name] = value; },
      remove() { this.removed = true; },
      replaceChildren() { this.children = []; }, append(...children) { this.children.push(...children); },
      focus() { if (!this.disabled) doc.activeElement = this; },
      showModal() { this.open = true; }, close() { this.open = false; },
      setPointerCapture() {},
    };
  }
  doc = { hidden: false, handlers: {}, documentElement: { lang: "en" },
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
  let roll = 0, limit = 3, level = 0, resonance = false;
  t.mock.method(Math, "random", () => roll);
  t.mock.method(performance, "now", () => now);
  t.mock.method(globalThis, "setInterval", callback => { tick = callback; return 123; });
  t.mock.method(globalThis, "clearInterval", () => {});
  const ui = setupMusic((key, args) => `${key} ${JSON.stringify(args ?? {})}`, { available: () => true, begin: () => true,
    difficulty: () => musicDifficulty({ skills: { music: level * 60 } }),
    resonance: () => resonance,
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
  now = beatTime(current, 0);
  tick();
  assert.equal(nodes.get("#music-track").children[current.pattern.indexOf(1)].className, "music-beat cue");
  now = current.startedAt;
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
  assert.equal(nodes.get("#music-result").dataset.feedback, "failure");
  assert.match(nodes.get("#music-result").textContent, /minigameReputation.*"amount":-3/);
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
  doc.hidden = false;
  level = 4;
  resonance = true;
  ui.localize();
  assert.match(nodes.get("#music-dialog").className, /arcane-resonance/);
  assert.ok(nodes.get("#music-dialog").children.some(child => child.className === "arcane-backdrop"));
  assert.match(nodes.get("#music-dialog .window-help-text").textContent, /Judgement variant/);
  nodes.get("#music-start").handlers.click();
  assert.equal(nodes.get("#music-track").children.length, 22);
  assert.equal(doc.activeElement, nodes.get("#music-dialog"));
  assert.match(nodes.get("#music-score").textContent, /Demonstration/);
  assert.equal(current.intervalMs, 260);
  assert.equal(nodes.get("#music-track").children.filter(e => e.className === "music-beat rest").length, 4);
  const heldIndex = current.pattern.filter(note => note > 0).indexOf(2);
  const bars = nodes.get("#music-track").children;
  const heldSlot = current.pattern.indexOf(2);
  const reproducingAt = beatTime(current, heldIndex);
  now = reproducingAt - current.previewMs;
  tick();
  assert.equal(nodes.get("#music-tap").disabled, true);
  assert.match(bars[heldSlot].className, /cue/);
  assert.equal(bars[heldSlot].textContent, "H2");
  assert.equal(bars.some(bar => /linked/.test(bar.className)), false);
  const beforeDemoTap = hits.length;
  nodes.get("#music-tap").handlers.click();
  assert.equal(hits.length, beforeDemoTap);
  now = current.startedAt;
  tick();
  assert.match(nodes.get("#music-score").textContent, /Your turn/);
  assert.ok(bars.every(bar => bar.className === "music-beat rest" && bar.textContent === ""));
  now = beatTime(current, heldIndex);
  tick();
  assert.equal(bars[heldSlot].className, "music-beat rest");
  assert.equal(bars[heldSlot].textContent, "");
  now += current.intervalMs / 2;
  tick();
  assert.equal(bars[heldSlot].style.values["--music-fill"], "0%");
  assert.equal(bars[heldSlot + 1].style.values["--music-fill"], "0%");
  now = beatTime(current, heldIndex);
  nodes.get("#music-dialog").handlers.keydown(key);
  assert.equal(bars[heldSlot].className, "music-beat hit");
  assert.equal(bars[heldSlot].textContent, "+");
  assert.doesNotMatch(nodes.get("#music-score").textContent, /musicKeepHolding|musicReleaseNow/);
  now += holdDuration(current, heldIndex);
  tick();
  assert.doesNotMatch(nodes.get("#music-score").textContent, /musicKeepHolding|musicReleaseNow/);
  assert.equal(bars[heldSlot].textContent, "");
  nodes.get("#music-dialog").handlers.keyup(key);
  assert.equal(bars[heldSlot].textContent, "+");
  assert.equal(bars[heldSlot + 1].textContent, "+");
  assert.match(nodes.get("#music-score").textContent, /"hits":1/);
  assert.match(nodes.get("#music-score").textContent, /"mistakes":0/);
  const secondHeld = current.pattern.filter(note => note > 0).indexOf(3);
  now = beatTime(current, secondHeld);
  const pointer = { button: 0, pointerId: 1, preventDefault() {} };
  nodes.get("#music-tap").handlers.pointerdown(pointer);
  now += holdDuration(current, secondHeld) + 200;
  nodes.get("#music-tap").handlers.pointerup(pointer);
  nodes.get("#music-tap").handlers.click();
  assert.match(nodes.get("#music-score").textContent, /"hits":2/);
  assert.match(nodes.get("#music-score").textContent, /"mistakes":0/);
  now = beatTime(current, heldIndex + 12);
  nodes.get("#music-tap").handlers.pointerdown(pointer);
  nodes.get("#music-tap").handlers.pointercancel();
  assert.match(nodes.get("#music-score").textContent, /"mistakes":1/);
  now = beatTime(current, secondHeld + 12);
  nodes.get("#music-dialog").handlers.keydown(key);
  now += holdDuration(current, secondHeld + 12) + MUSIC.releaseWindowMs + 1;
  tick();
  assert.match(nodes.get("#music-score").textContent, /"mistakes":2/);
  const restSlot = current.pattern.indexOf(0);
  now = current.startedAt + MUSIC.leadMs + (current.pattern.length + restSlot) * current.intervalMs;
  nodes.get("#music-dialog").handlers.keydown(key);
  assert.equal(bars[restSlot].className, "music-beat wrong");
  assert.equal(bars[restSlot].textContent, "×");
  assert.match(nodes.get("#music-score").textContent, /"mistakes":3/);
  now += 351;
  tick();
  assert.equal(bars[restSlot].className, "music-beat rest");
  assert.equal(bars[restSlot].textContent, "");
  doc.hidden = true;
  doc.handlers.visibilitychange();
  assert.equal(nodes.get("#music-tap").disabled, true);
  ui.reset();
});
