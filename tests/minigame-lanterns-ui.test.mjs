import test from "node:test";
import assert from "node:assert/strict";
import { mount } from "../minigames/lanterns-ui.mjs";
import { lanternArt } from "../minigames/lanterns-art.mjs";

class Target {
  listeners = new Map();
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  dispatch(type, event = {}) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }
  listenerCount() { return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0); }
}

class Element extends Target {
  children = [];
  attributes = {};
  style = { setProperty(name, value) { this[name] = value; } };
  dataset = {};
  textContent = "";
  disabled = false;
  hidden = false;
  constructor(tag, doc) { super(); this.tagName = tag; this.ownerDocument = doc; }
  setAttribute(key, value) { this.attributes[key] = value; }
  append(...nodes) {
    for (const node of nodes) { node.parent = this; node.parentElement = this; this.children.push(node); }
  }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); }
  click() { if (!this.disabled) this.dispatch("click"); }
  focus() { this.ownerDocument.activeElement = this; }
  getBoundingClientRect() {
    return this.tagName === "button"
      ? { left: Math.max(0, (this.parentElement?.children.indexOf(this) ?? 1) - 1) * 100, top: 0, width: 100, height: 160 }
      : { left: 0, top: 0, width: 600, height: 180 };
  }
}

function fixture(options = {}) {
  let now = 0;
  let nextId = 0;
  const timers = new Map();
  const observers = new Set();
  const win = new Target();
  win.MutationObserver = class {
    nodes = new Set();
    constructor(callback) { this.callback = callback; observers.add(this); }
    observe(node) { this.nodes.add(node); }
    disconnect() { observers.delete(this); }
  };
  win.performance = { now: () => now };
  win.setTimeout = (fn, delay) => { const id = ++nextId; timers.set(id, { fn, at: now + delay }); return id; };
  win.clearTimeout = id => timers.delete(id);
  const doc = new Target();
  doc.defaultView = win;
  doc.hidden = false;
  doc.createElement = tag => new Element(tag, doc);
  doc.createElementNS = (_namespace, tag) => new Element(tag, doc);
  const container = new Element("div", doc);
  const results = [];
  const api = mount(container, { onFinish: result => results.push(result), ...options });
  const root = container.children[0];
  const [, , , , status, score, board, start, cancel] = root.children;
  const buttons = board.children.filter(child => child.tagName === "button");
  function next() {
    assert.ok(timers.size, "expected a scheduled playback transition");
    const [id, timer] = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
    now = timer.at;
    timers.delete(id);
    timer.fn();
  }

  function playback() {
    start.click();
    const sequence = [];
    let count = 0;
    while (timers.size) {
      assert.ok(++count < 100, "bounded playback");
      next();
      const spark = board.children.find(node => node.attributes.class === "hermit-glow");
      const active = spark?.style.visibility === "visible" ? Number(spark.dataset.to)
        : buttons.findIndex(button => button.style.outline);
      if (active >= 0) sequence.push(active);
    }
    return sequence;
  }
  function key(key, extra = {}) {
    let prevented = false;
    root.dispatch("keydown", { key, preventDefault: () => { prevented = true; }, ...extra });
    return prevented;
  }
  function listeners() {
    const descendants = node => [node, ...node.children.flatMap(descendants)];
    return [doc, win, ...descendants(root)].reduce((sum, target) => sum + target.listenerCount(), 0);
  }
  return { api, container, root, doc, win, status, score, buttons, start, cancel, timers, results,
    next, playback, key, listeners, observers,
    hide(node) {
      node.hidden = true;
      for (const observer of [...observers]) {
        if (observer.nodes.has(node)) observer.callback();
      }
    },
  };
}

test("Hermit hides all lanterns and numbers during demonstration, showing only a positional spark and tone", () => {
  const tones = [];
  const f = fixture({ language: "en", journeyCard: "hermit", audio: { play: note => tones.push(note), stop() {} } });
  const board = f.root.children[6];
  const glow = board.children.find(node => node.attributes.class === "hermit-glow");
  assert.ok(glow);
  assert.ok(f.root.children.some(node => node.className === "arcane-banner"));
  assert.match(f.root.children.find(node => /small spark/.test(node.textContent)).textContent, /7–11/);
  const sequence = f.playback();
  assert.equal(board.dataset.answering, "true");
  assert.equal(board.dataset.sceneLit, "false");
  assert.equal(glow.style.visibility, "hidden");
  assert.deepEqual(tones, sequence);
  f.key(String(sequence[0] + 1));
  assert.equal(board.dataset.sceneLit, "true");
  assert.ok(board.style["--glow-x"]);
  assert.equal(f.buttons[sequence[0]].attributes["data-lit"], "true");
  f.next();
  assert.equal(board.dataset.sceneLit, "false");
  f.next();
  f.next();
  const first = Number(glow.dataset.to);
  f.next();
  f.next();
  assert.equal(glow.style.visibility, "visible");
  const second = Number(glow.dataset.to);
  assert.equal(glow.children.length, 1, "no connecting line");
  assert.equal(glow.children[0].tagName, "circle");
  assert.ok(f.buttons.every(button => button.style.visibility === "hidden"));
  assert.ok(f.buttons.every(button => button.attributes["aria-hidden"] === "true"));
  assert.ok(f.buttons.every(button => !button.style.outline && button.attributes["data-lit"] === "false"));
  assert.equal(board.dataset.sceneLit, "false");
  assert.deepEqual(tones.slice(-2), [first, second]);
  while (f.timers.size) f.next();
  assert.ok(f.buttons.every(button => button.style.visibility === "visible"));
  assert.ok(f.buttons.every(button => button.attributes["aria-hidden"] === "false"));
  f.api.destroy();
  assert.equal(f.results.length, 1);
  assert.equal(f.results[0].earningsMultiplier, 1);
  assert.equal(f.listeners(), 1, "only the detached decorative image error handler remains");
  assert.equal(f.timers.size, 0);
  assert.equal(f.observers.size, 0);
  assert.equal(f.container.children.length, 0);
});

test("explicit start, bilingual instructions and accessible native labeled buttons", () => {
  for (const language of ["fr", "en", "unknown"]) {
    const f = fixture({ language });
    assert.equal(f.timers.size, 0);
    assert.equal(f.results.length, 0);
    assert.equal(f.root.lang, language === "en" ? "en" : "fr");
    assert.match(f.root.children[1].textContent, language === "en" ? /Fictional.*No real festival/ : /fictive.*Aucune fête réelle/);
    assert.match(f.root.children[2].textContent, language === "en" ? /number keys/ : /chiffres/);
    for (const note of f.root.children.slice(1, 4)) assert.equal(note.className, "game-help-text");
    assert.equal(f.status.attributes.role, "status");
    assert.equal(f.status.attributes["aria-live"], "polite");
    assert.equal(f.buttons.length, 3);
    for (const [index, button] of f.buttons.entries()) {
      assert.equal(button.tagName, "button");
      assert.equal(button.type, "button");
      assert.equal(button.disabled, true);
      assert.match(button.attributes["aria-label"], new RegExp(`^${index + 1} · .+`));
      assert.equal(button.children[0].tagName, "svg");
      assert.equal(button.textContent, "", "no visible word labels on lanterns");
      assert.equal(button.attributes["aria-keyshortcuts"], String(index + 1));
    }
    f.buttons[0].click();
    assert.equal(f.key("1"), false);
    assert.equal(f.results.length, 0);
    f.api.destroy();
    assert.equal(f.listeners(), 0);
    assert.equal(f.observers.size, 0);
  }
});

test("actual visual playback gates input; click and keyboard complete perfect games at every level", () => {
  for (let level = 0; level <= 4; level++) {
    const f = fixture({ level, language: "en" });
    let remembered = [];
    for (let round = 1; round <= 7 + level; round++) {
      const sequence = f.playback();
      assert.equal(sequence.length, round);
      assert.deepEqual(sequence.slice(0, -1), remembered, "same sequence extended by one");
      remembered = sequence;
      assert.match(f.status.textContent, /Your turn/);
      assert.match(f.status.textContent, new RegExp(`Round ${round}/${7 + level}`));
      assert.equal(f.doc.activeElement, f.buttons[0]);
      assert.ok(f.buttons.every(button => !button.disabled));
      assert.equal(f.key("1", { repeat: true }), false);
      assert.equal(f.key("1", { ctrlKey: true }), false);
      assert.equal(f.key("x"), false);
      for (const [step, index] of sequence.entries()) {
        if (step % 2) assert.equal(f.key(String(index + 1)), true);
        else f.buttons[index].click();
        assert.equal(f.buttons[index].attributes["data-lit"], "true");
        f.next();
      }
      if (round < 7 + level) assert.equal(f.results.length, 0);
    }
    assert.deepEqual(f.results, [{ completed: true, score: 7 + level, maxScore: 7 + level, cancelled: false, earningsMultiplier: 1 }]);
    assert.match(f.status.textContent, /complete/);
    assert.match(f.score.textContent, new RegExp(`${7 + level}/${7 + level}`));
    assert.equal(f.timers.size, 0);
    assert.equal(f.listeners(), 0);
    f.cancel.click();
    f.api.destroy();
    f.api.destroy();
    assert.equal(f.results.length, 1);
    assert.equal(f.container.children.length, 0);
  }
});

test("Escape cancels the rehearsal once and clears playback timers", () => {
  const f = fixture({ language: "en" });
  f.start.click();
  assert.ok(f.timers.size > 0);
  assert.equal(f.key("Escape"), true);
  assert.deepEqual(f.results, [{ completed: false, score: 0, maxScore: 7, cancelled: true, earningsMultiplier: 1 }]);
  assert.equal(f.timers.size, 0);
  f.api.destroy();
  assert.equal(f.results.length, 1);
});

test("all six lanterns use distinct original SVG motifs and colours, not word labels or external images", () => {
  const f = fixture({ level: 4 });
  const drawings = f.buttons.map(button => button.children[0]);
  const serialized = drawings.map(drawing => JSON.stringify(drawing.children.map(node => [node.tagName, node.attributes])));
  assert.equal(new Set(serialized).size, 6);
  const colors = drawings.map(drawing => drawing.children.find(node => node.attributes.class === "lantern-paper").attributes.fill);
  assert.equal(new Set(colors).size, 6);
  assert.ok(drawings.every(drawing => drawing.attributes["aria-hidden"] === "true"));
  assert.ok(drawings.every(drawing => drawing.children.every(node => node.tagName !== "image" && node.tagName !== "text")));
  assert.throws(() => lanternArt(f.doc, 6), RangeError);
  f.api.destroy();
});

test("playback and every answer play the selected tone; final flash is visible before finishing", () => {
  const tones = [];
  let stops = 0;
  const f = fixture({ audio: { play: index => tones.push(index), stop: () => stops++ } });
  for (let round = 1; round <= 7; round++) {
    const before = tones.length;
    const sequence = f.playback();
    assert.deepEqual(tones.slice(before), sequence, "every demonstration flash plays its own note, including repeats");
    for (const index of sequence) {
      f.buttons[index].click();
      assert.equal(tones.at(-1), index);
      assert.equal(f.buttons[index].attributes["data-lit"], "true");
      assert.equal(f.results.length, 0, "completion waits for the final answer flash");
      f.next();
      assert.equal(f.buttons[index].attributes["data-lit"], "false");
    }
  }
  assert.equal(f.results.length, 1);
  assert.equal(stops, 1);
  f.api.destroy();
  assert.ok(stops >= 1);
});

test("rapid answers restart the flash; cancellation clears the pulse and stops sound", () => {
  const tones = [];
  let stopped = false;
  const f = fixture({ audio: { play: index => tones.push(index), stop: () => { stopped = true; } } });
  const first = f.playback();
  f.buttons[first[0]].click();
  f.next();
  const second = f.playback();
  f.buttons[second[0]].click();
  f.buttons[second[1]].click();
  if (second[0] !== second[1]) assert.equal(f.buttons[second[0]].attributes["data-lit"], "false");
  assert.equal(f.buttons[second[1]].attributes["data-lit"], "true");
  assert.equal(f.timers.size, 2, "one answer pulse plus the scheduled next round");
  assert.deepEqual(tones.slice(-2), second);
  f.cancel.click();
  assert.equal(f.timers.size, 0);
  assert.ok(stopped);
  assert.equal(f.buttons[second[1]].attributes["data-lit"], "false");
  f.api.destroy();
});

test("the first wrong answer flashes and ends the game without another round", () => {
  const f = fixture({ language: "en" });
  const sequence = f.playback();
  const index = (sequence[0] + 1) % f.buttons.length;
  f.buttons[index].click();
  assert.match(f.status.textContent, /Wrong answer/);
  assert.equal(f.buttons[index].attributes["data-lit"], "true");
  assert.equal(f.results.length, 0);
  f.next();
  assert.deepEqual(f.results, [{ completed: false, score: 0, maxScore: 7, cancelled: false, earningsMultiplier: 1 }]);
  assert.equal(f.timers.size, 0);
  f.api.destroy();
});

test("cancel, hidden document, pagehide and destroy finish once without reward in all phases", () => {
  for (const phase of ["ready", "playback", "input", "roundGap"]) {
    for (const trigger of ["cancel", "hidden", "pagehide", "destroy"]) {
      const f = fixture();
      if (phase === "playback") { f.start.click(); f.next(); }
      if (phase === "input") f.playback();
      if (phase === "roundGap") {
        const sequence = f.playback();
        f.buttons[sequence[0]].click();
      }
      if (trigger === "cancel") f.cancel.click();
      if (trigger === "hidden") { f.doc.hidden = true; f.doc.dispatch("visibilitychange"); }
      if (trigger === "pagehide") f.win.dispatch("pagehide");
      if (trigger === "destroy") f.api.destroy();
      assert.deepEqual(f.results, [{ completed: false, score: 0, maxScore: 7, cancelled: true, earningsMultiplier: 1 }], `${phase}/${trigger}`);
      assert.equal(f.listeners(), 0);
      assert.equal(f.timers.size, 0);
      f.doc.hidden = false;
      f.doc.dispatch("visibilitychange");
      f.win.dispatch("pagehide");
      f.api.destroy();
      assert.equal(f.results.length, 1);
    }
  }
});

test("hiding during the final answer flash cancels rather than awarding an unseen completion", () => {
  const f = fixture();
  for (let round = 1; round <= 7; round++) {
    const sequence = f.playback();
    for (const [step, index] of sequence.entries()) {
      f.buttons[index].click();
      if (round < 7 || step < sequence.length - 1) f.next();
    }
  }
  assert.equal(f.results.length, 0);
  f.hide(f.container);
  assert.deepEqual(f.results, [{ completed: false, score: 0, maxScore: 7, cancelled: true, earningsMultiplier: 1 }]);
  assert.equal(f.timers.size, 0);
  assert.equal(f.listeners(), 0);
  f.api.destroy();
});

test("Hermit final-flash cancellation forfeits its bonus, while a visible finish keeps raw Simon points", () => {
  for (const cancel of [true, false]) {
    const f = fixture({ dailyCard: "hermit" });
    for (let round = 1; round <= 7; round++) {
      const sequence = f.playback();
      for (const [step, index] of sequence.entries()) {
        f.key(String(index + 1));
        if (round < 7 || step < sequence.length - 1) f.next();
      }
    }
    assert.equal(f.results.length, 0);
    if (cancel) f.hide(f.container);
    else f.next();
    assert.equal(f.results[0].completed, !cancel);
    assert.equal(f.results[0].score, cancel ? 0 : 7);
    assert.equal(f.results[0].earningsMultiplier, cancel ? 1 : 1.1);
    assert.equal(f.timers.size, 0);
    assert.equal(f.observers.size, 0);
    f.api.destroy();
    assert.equal(f.results.length, 1);
  }
});

test("hiding the container during playback cancels at the next timer", () => {
  const f = fixture();
  f.start.click();
  f.container.hidden = true;
  f.next();
  assert.equal(f.results[0].cancelled, true);
  assert.equal(f.timers.size, 0);
  assert.equal(f.listeners(), 0);
  f.api.destroy();
});

test("hidden attributes cancel even while ready or waiting for input, without a timer", () => {
  for (const phase of ["ready", "input"]) {
    for (const target of ["container", "root"]) {
      const f = fixture();
      if (phase === "input") {
        f.playback();
      }
      assert.equal(f.timers.size, 0);
      f.hide(f[target]);
      assert.deepEqual(f.results, [{ completed: false, score: 0, maxScore: 7, cancelled: true, earningsMultiplier: 1 }]);
      assert.equal(f.listeners(), 0);
      assert.equal(f.observers.size, 0);
      f.api.destroy();
    }
  }
});

test("mount validates options before adding UI; callback exceptions still clean up", () => {
  assert.throws(() => mount(null), TypeError);
  assert.throws(() => fixture({ level: 8 }), RangeError);
  assert.throws(() => fixture({ onFinish: 3 }), TypeError);
  const f = fixture({ onFinish() { throw new Error("host failure"); } });
  f.start.click();
  assert.throws(() => f.api.destroy(), /host failure/);
  assert.equal(f.listeners(), 0);
  assert.equal(f.timers.size, 0);
  assert.equal(f.container.children.length, 0);
  f.api.destroy();
});
