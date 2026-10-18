import test from "node:test";
import assert from "node:assert/strict";
import { mount } from "../minigames/harvest-ui.mjs";
import { difficulty } from "../minigames/harvest.mjs";

function harness(t, { level = 0, language = "en", random = () => 0, ...options } = {}) {
  class Element {
    constructor(tag, ownerDocument) {
      this.tagName = tag;
      this.ownerDocument = ownerDocument;
      this.children = [];
      this.listeners = new Map();
      this.attributes = {};
      this.style = {};
      this.dataset = {};
      this.disabled = false;
    }
    append(...elements) { for (const el of elements) { el.parent = this; this.children.push(el); } }
    remove() { this.parent.children = this.parent.children.filter(el => el !== this); }
    contains(el) { return this === el || this.children.some(child => child.contains(el)); }
    setAttribute(key, value) { this.attributes[key] = value; }
    setPointerCapture(id) { this.capture = id; }
    addEventListener(key, fn) {
      if (!this.listeners.has(key)) this.listeners.set(key, new Set());
      this.listeners.get(key).add(fn);
    }
    removeEventListener(key, fn) { this.listeners.get(key)?.delete(fn); }
    emit(key, event = {}) { for (const fn of [...(this.listeners.get(key) ?? [])]) fn(event); }
    focus() { this.ownerDocument.focused = this; }
    click() { if (!this.disabled) this.emit("click", { detail: 1 }); }
  }
  const doc = new Element("document");
  doc.defaultView = new Element("window", doc);
  doc.hidden = false;
  doc.createElement = tag => new Element(tag, doc);
  doc.createElementNS = (_, tag) => new Element(tag, doc);
  const container = new Element("div", doc);
  let now = 1000, counter = 0;
  const timers = new Map(), finishes = [], sounds = [];
  let stops = 0;
  doc.defaultView.performance = { now: () => now };
  doc.defaultView.setInterval = fn => { timers.set(++counter, fn); return counter; };
  doc.defaultView.clearInterval = id => { timers.delete(id); };
  t.mock.method(Math, "random", random);
  const ui = mount(container, { level, language, ...options, onFinish: value => finishes.push(value),
    audio: { play: kind => sounds.push(kind), stop: () => stops++ } });
  const root = container.children[0];
  const all = el => [el, ...el.children.flatMap(all)];
  const elements = all(root);
  const [start, left, right, cancel] = elements.filter(el => el.tagName === "button");
  const find = className => elements.find(el => el.className === className);
  function key(key, extra = {}) {
    let prevented = false;
    root.emit("keydown", { key, preventDefault() { prevented = true; }, ...extra });
    return prevented;
  }
  return { ui, root, container, doc, start, left, right, cancel,
    field: find("harvest-field"), grape: find("harvest-grape"),
    baskets: elements.filter(el => el.className === "harvest-basket"),
    feedback: find("harvest-feedback"), cue: find("harvest-cue"), status: find("harvest-score"),
    timers, finishes, sounds, key, find, stops: () => stops,
    release(key) { doc.emit("keyup", { key, preventDefault() {} }); },
    tick(value) { now = value; [...timers.values()].forEach(fn => fn()); },
    assertClean() {
      assert.equal(timers.size, 0);
      for (const el of [doc, doc.defaultView, ...elements.filter(el => el.className !== "arcane-watermark")]) {
        assert.equal([...el.listeners.values()].reduce((n, set) => n + set.size, 0), 0);
      }
    },
  };
}

test("Empress shows rotten grapes, Space holds for half a second and cancels cleanly", t => {
  const h = harness(t, { journeyCard: "empress", dailyCard: "empress" });
  assert.match(h.find("arcane-banner").textContent, /×1.1/);
  h.start.click();
  assert.equal(h.find("harvest-next"), undefined);
  assert.match(h.cue.textContent, /Rotten/);
  assert.equal(h.grape.dataset.rotten, "true");
  assert.match(h.grape.children[0].children[0].attributes.href, /#rotten-grape$/);
  h.key("ArrowRight");
  h.tick(1100);
  h.release("ArrowRight");
  const position = h.grape.style.left;
  assert.equal(h.key(" "), true);
  assert.equal(h.grape.hidden, false);
  h.tick(1599);
  assert.match(h.status.textContent, /Score: 0/);
  assert.match(h.find("harvest-hold").textContent, /0.5 \/ 0.5 s/);
  h.tick(1600);
  assert.equal(h.grape.hidden, false);
  assert.match(h.feedback.textContent, /squashed/);
  assert.equal(h.sounds.at(-1), "squish");
  assert.match(h.status.textContent, /Score: 1/);
  h.key(" ", { repeat: true });
  assert.equal(h.sounds.length, 1);
  h.release(" ");
  h.tick(1000 + difficulty(0).fallMs);
  assert.notEqual(h.grape.style.left, position);
  assert.equal(h.grape.hidden, false);
  h.doc.hidden = true;
  h.doc.emit("visibilitychange");
  assert.equal(h.finishes[0].earningsMultiplier, 1);
  h.assertClean();
  h.ui.destroy();
  assert.equal(h.finishes.length, 1);
});

test("Empress completed UI returns a single multiplier and raw score", t => {
  const h = harness(t, { dailyCard: "empress" });
  h.start.click();
  h.tick(1000 + difficulty(0).durationMs);
  assert.equal(h.finishes[0].earningsMultiplier, 1.1);
  assert.equal(h.finishes[0].maxScore, 12);
  h.assertClean();
});

test("journey copy does not promise that costs, earnings or saves are disabled", t => {
  const h = harness(t, { journey: true });
  const copy = h.root.children.map(node => node.textContent).join(" ");
  assert.doesNotMatch(copy, /Fictional playtest|no journey costs|no save changes/i);
  assert.match(copy, /Sort grapes|Triez les grappes/);
});

test("French drop button instantly lands good grapes; missed rot reports its penalty", t => {
  const h = harness(t, { resonance: true, language: "fr" });
  const squash = h.find("harvest-controls").children.at(-1);
  assert.equal(squash.attributes["aria-keyshortcuts"], "Space");
  assert.equal(squash.disabled, true);
  h.start.click();
  h.tick(1000 + difficulty(0).fallMs);
  assert.match(h.feedback.textContent, /pourrie dans le panier/);
  h.tick(1000 + difficulty(0).fallMs * 2);
  assert.equal(h.grape.dataset.rotten, "false");
  squash.click();
  assert.equal(h.grape.hidden, false);
  assert.equal(squash.disabled, false);
  assert.match(h.status.textContent, /Score: 0/);
  const startTop = parseFloat(h.grape.style.top);
  h.tick(6080);
  assert.ok(parseFloat(h.grape.style.top) > startTop + 25);
  assert.equal(h.grape.hidden, false);
  h.tick(6160);
  assert.match(h.feedback.textContent, /attrapée/);
  assert.match(h.status.textContent, /Score: 1/);
  h.ui.destroy();
  h.assertClean();
});

test("normal Space drops one bunch per fresh press and the shift continues past sixteen bunches", t => {
  const h = harness(t);
  h.start.click();
  for (let i = 0; i < 20; i++) {
    assert.equal(h.key(" "), true);
    h.key(" ", { repeat: true });
    h.release(" ");
    h.tick(1000 + (i + 1) * 160);
    assert.match(h.status.textContent, new RegExp(`Bunch: ${i + 2} ·`));
  }
  assert.equal(h.finishes.length, 0);
  h.tick(30999);
  assert.equal(h.finishes.length, 0);
  h.tick(31000);
  assert.equal(h.finishes[0].completed, true);
  assert.ok(h.finishes[0].maxScore > 20);
  h.assertClean();
});

test("touch holds squash at 500 ms, never repeat on the next bunch, and cancel on capture/focus loss", t => {
  const h = harness(t, { resonance: true });
  const button = h.find("harvest-controls").children.at(-1);
  h.start.click();
  const down = () => button.emit("pointerdown", { button: 0, pointerId: 7, preventDefault() {} });
  down();
  h.tick(1499);
  assert.match(h.status.textContent, /Score: 0/);
  button.emit("lostpointercapture", { pointerId: 7 });
  h.tick(1500);
  assert.match(h.status.textContent, /Score: 0/);
  down();
  h.tick(2000);
  assert.match(h.status.textContent, /Score: 1/);
  assert.match(h.feedback.textContent, /squashed/);
  h.tick(2500);
  assert.match(h.status.textContent, /Score: 1/);
  h.doc.emit("pointerup", { pointerId: 7 });
  down();
  h.tick(2999);
  h.root.emit("focusout", { relatedTarget: null });
  h.tick(3000);
  assert.match(h.status.textContent, /Score: 1/);
  h.ui.destroy();
  h.assertClean();
});

test("explicit start, illustrated baskets/grapes, automatic falling and exactly-once completion", t => {
  const h = harness(t);
  assert.equal(h.timers.size, 0);
  assert.ok(h.grape.hidden);
  assert.ok(h.left.disabled);
  assert.equal(h.baskets.length, 3);
  assert.equal(h.baskets[0].tagName, "div");
  assert.equal(h.baskets[0].children[0].tagName, "svg");
  assert.equal(h.grape.children[0].children[0].attributes.href, "./minigames/harvest-art.svg#grape");
  h.start.click();
  assert.equal(h.doc.focused, h.root);
  assert.equal(h.timers.size, 1);
  assert.match(h.cue.textContent, /Purple/);
  assert.equal(h.grape.style.top, "8%");
  h.tick(1000 + difficulty(0).fallMs / 2);
  assert.equal(h.grape.style.top, "44%");
  assert.equal(h.grape.style.left, "8%");
  assert.equal(h.sounds.length, 0);
  for (let i = 1; i <= 12; i++) h.tick(1000 + i * difficulty(0).fallMs);
  assert.equal(h.finishes[0].completed, true);
  assert.equal(h.finishes[0].maxScore, 12);
  assert.equal(h.finishes[0].earningsMultiplier, 1);
  assert.equal(h.sounds.length, 12);
  assert.equal(h.grape.hidden, true);
  assert.match(h.feedback.textContent, /complete/);
  h.assertClean();
  h.ui.destroy();
  h.ui.destroy();
  assert.equal(h.container.children.length, 0);
  assert.equal(h.finishes.length, 1);
});

test("held arrows steer without teleporting and releasing stops without stopping the fall", t => {
  const h = harness(t);
  h.start.click();
  assert.equal(h.key("ArrowRight"), true);
  h.tick(1300);
  assert.ok(Math.abs(parseFloat(h.grape.style.left) - 30.5) < 1e-10);
  const y = h.grape.style.top;
  h.release("ArrowRight");
  const x = h.grape.style.left;
  h.tick(1800);
  assert.equal(h.grape.style.left, x);
  assert.notEqual(h.grape.style.top, y);
  assert.equal(h.key("1"), false);
  assert.equal(h.key(" "), true);
  h.release(" ");
  h.tick(1000 + difficulty(0).fallMs);
  assert.equal(h.sounds[0], "success");
  h.ui.destroy();
  h.assertClean();
});

test("wrong landing sounds once, shows feedback and starts another bunch", t => {
  const h = harness(t);
  h.start.click();
  h.key("ArrowRight");
  h.tick(1000 + difficulty(0).fallMs - 1);
  h.release("ArrowRight");
  assert.equal(h.grape.style.left, "96%");
  h.tick(1000 + difficulty(0).fallMs);
  assert.equal(h.sounds[0], "caught");
  assert.match(h.feedback.textContent, /Wrong basket/);
  assert.match(h.status.textContent, /Score: 0/);
  assert.equal(h.grape.style.left, "8%");
  h.tick(1000 + difficulty(0).fallMs + 20);
  assert.equal(h.sounds.length, 1);
  h.ui.destroy();
});

test("touch steering works, pointer release and capture loss stop it", t => {
  const h = harness(t);
  h.start.click();
  h.right.emit("pointerdown", { button: 0, pointerId: 2, preventDefault() {} });
  assert.equal(h.right.capture, 2);
  h.tick(1400);
  h.doc.emit("pointerup", { pointerId: 2 });
  const stopped = h.grape.style.left;
  h.tick(1800);
  assert.equal(h.grape.style.left, stopped);
  h.left.emit("pointerdown", { button: 0, pointerId: 3, preventDefault() {} });
  h.tick(1900);
  h.left.emit("lostpointercapture", { pointerId: 3 });
  const stoppedAgain = h.grape.style.left;
  h.tick(2000);
  assert.equal(h.grape.style.left, stoppedAgain);
  h.ui.destroy();
});

test("opposing held keys cancel out; releasing one resumes the other; blur stops", t => {
  const h = harness(t);
  h.start.click();
  h.key("ArrowRight");
  h.key("ArrowLeft");
  h.tick(1200);
  assert.equal(h.grape.style.left, "8%");
  h.release("ArrowLeft");
  h.tick(1400);
  const moved = h.grape.style.left;
  assert.notEqual(moved, "8%");
  h.doc.defaultView.emit("blur");
  h.tick(1600);
  assert.equal(h.grape.style.left, moved);
  h.ui.destroy();
});

test("hidden tab cancels without extra catches and stale timers cannot finish again", t => {
  const h = harness(t);
  h.start.click();
  const stale = [...h.timers.values()][0];
  h.tick(3800);
  h.doc.hidden = true;
  h.doc.emit("visibilitychange");
  stale();
  h.ui.destroy();
  assert.deepEqual(h.finishes, [{ completed: false, score: 1, maxScore: 1, cancelled: true, earningsMultiplier: 1 }]);
  assert.ok(h.stops() > 0);
  h.assertClean();
});

test("hidden state without an event also cancels on the next tick", t => {
  const h = harness(t);
  h.start.click();
  h.doc.hidden = true;
  h.tick(100000);
  assert.equal(h.finishes[0].cancelled, true);
  assert.equal(h.finishes[0].score, 0);
  h.assertClean();
});

test("French hard level has six illustrated baskets, faster falls, and Escape cancellation", t => {
  const h = harness(t, { language: "fr", level: 4 });
  assert.equal(h.start.textContent, "Commencer");
  assert.equal(h.baskets.length, 6);
  assert.equal(new Set(h.baskets.map(basket => basket.style.color)).size, 6);
  assert.equal(h.root.lang, "fr");
  h.start.click();
  h.tick(1000 + difficulty(4).fallMs);
  assert.equal(h.sounds.length, 1);
  assert.equal(h.key("ArrowLeft", { ctrlKey: true }), false);
  assert.equal(h.key("Escape"), true);
  assert.match(h.feedback.textContent, /aucune récompense/);
  h.assertClean();
});

test("cancel, pagehide and destruction each report once and clean all listeners", t => {
  const h = harness(t);
  h.cancel.click();
  h.start.click();
  h.ui.destroy();
  assert.equal(h.finishes.length, 1);
  assert.equal(h.finishes[0].cancelled, true);
  h.assertClean();
});

test("pagehide cancels a running game and stops audio", t => {
  const h = harness(t);
  h.start.click();
  h.doc.defaultView.emit("pagehide");
  assert.equal(h.finishes[0].cancelled, true);
  assert.ok(h.stops() > 0);
  h.assertClean();
});

test("invalid randomness and backwards clocks visibly fail and log instead of silently succeeding", t => {
  const errors = [];
  t.mock.method(console, "error", (...args) => errors.push(args));
  const h = harness(t, { random: () => NaN });
  h.start.click();
  assert.match(h.feedback.textContent, /error/);
  assert.equal(h.finishes[0].cancelled, true);
  h.assertClean();
  const h2 = harness(t);
  h2.start.click();
  h2.tick(0);
  assert.match(h2.feedback.textContent, /error/);
  assert.equal(h2.finishes[0].cancelled, true);
  assert.equal(errors.length, 2);
  h2.assertClean();
});
