import test from "node:test";
import assert from "node:assert/strict";
import { mount } from "../minigames/lost-found-ui.mjs";
import { objectIllustration } from "../minigames/lost-found-art.mjs";
import { readFileSync } from "node:fs";

test("large item artwork uses roomy choice cards, a two-column mobile grid and a larger close-up", () => {
  const css = readFileSync(new URL("../mini-games.css", import.meta.url), "utf8");
  assert.match(css, /\.lost-found-choices \{[^}]*minmax\(min\(100%, 210px\), 1fr\)/);
  assert.match(css, /\.lost-found-art \{ display: block; width: 100%; max-width: 260px; height: auto;/);
  assert.match(css, /\.lost-found-inspection \.lost-found-art \{ max-width: 320px;/);
  assert.match(css, /@media \(max-width: 640px\) \{\s*[^{]+\.lost-found-choices \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  const f = fixture();
  assert.ok(f.all().find(node => node.className === "lost-found-choices"));
  f.api.destroy();
});

// Small DOM contract fixture with a controlled clock: no dependencies or network.
class Element {
  constructor(tag, doc) {
    this.tagName = tag; this.ownerDocument = doc; this.nodeType = 1;
    this.children = []; this.dataset = {}; this.attributes = {}; this.listeners = new Map();
    this.textContent = ""; this.disabled = false; this.hidden = false;
  }
  append(...children) {
    for (const child of children) { child.parentElement = this; this.children.push(child); }
  }
  replaceChildren(...children) {
    for (const child of this.children) child.parentElement = null;
    this.children = []; this.append(...children);
  }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  emit(type, extra = {}) {
    const event = { target: this, preventDefault() { this.prevented = true; }, ...extra };
    for (let node = this; node; node = node.parentElement) {
      for (const fn of node.listeners.get(type) ?? []) fn(event);
    }
    return event;
  }
  closest(selector) {
    for (let node = this; node; node = node.parentElement) {
      if (selector === "button" ? node.tagName === "button" :
        node.hidden || node.attributes["aria-hidden"] === "true") return node;
    }
    return null;
  }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  get isConnected() { return this.ownerDocument.documentElement.contains(this); }
  focus() { this.ownerDocument.activeElement = this; }
  remove() {
    if (this.parentElement) {
      this.parentElement.children = this.parentElement.children.filter(child => child !== this);
      this.parentElement = null;
    }
  }
}
function fixture(options = {}, configure = () => {}) {
  const observers = [];
  const timers = new Map(), clock = { now: 0 };
  let timerId = 0;
  const doc = new Element("document", null);
  doc.ownerDocument = doc;
  doc.createElement = tag => new Element(tag, doc);
  doc.createElementNS = (namespace, tag) => {
    const node = doc.createElement(tag);
    node.namespaceURI = namespace;
    return node;
  };
  doc.documentElement = new Element("html", doc);
  doc.documentElement.parentElement = doc;
  // Avoid contains() traversing the documentElement parent in the connectivity getter.
  doc.defaultView = Object.assign(new Element("window", doc), {
    performance: { now: () => clock.now },
    setInterval(callback) { const id = ++timerId; timers.set(id, callback); return id; },
    clearInterval(id) { timers.delete(id); },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe() { this.active = true; }
      disconnect() { this.active = false; }
    },
    getComputedStyle: node => ({ display: node.display ?? "block", visibility: node.visibility ?? "visible" }),
  });
  const container = new Element("main", doc);
  doc.documentElement.append(container);
  configure({ doc, container });
  const outcomes = [];
  const api = mount(container, { ...options, onFinish: result => outcomes.push(result) });
  const root = container.children[0];
  const all = (node = root) => [node, ...node.children.flatMap(child => all(child))];
  const find = action => all().find(node => node.dataset.action === action);
  const click = node => { if (!node.disabled) node.emit("click"); };
  const keyboard = (node, key) => {
    node.focus();
    const event = node.emit("keydown", { key });
    // Browser-native button activation: UI intentionally does not synthesize clicks.
    if (!event.prevented && ["Enter", " "].includes(key) && node.tagName === "button") click(node);
  };
  return { doc, container, api, root, outcomes, all, find, click, keyboard, observers, timers, clock,
    tick(milliseconds) { clock.now += milliseconds; for (const tick of [...timers.values()]) tick(); },
    mutations() { for (const observer of observers) if (observer.active) observer.callback(); } };
}
function correctButton(f) {
  const text = f.doc.activeElement.textContent;
  const patterns = [
    ["umbrella-moon", /moon|crescent|lune|croissant/i],
    ["umbrella-star", /star|five.point|five points|étoile|cinq point/i],
    ["notebook-leaf", /leaf|branch|feuille|branche/i],
    ["notebook-flower", /flower|petals|fleur|pétales/i],
    ["keys-fish", /fish|swimmer|fins|poisson|nageur|nageoires/i],
    ["keys-bird", /bird|feather|wings|oiseau|plumes|ailes/i],
    ["pouch-square", /square|four.corner|four right|four equal|carrée|quatre coins|quatre angles|quatre côtés/i],
    ["pouch-round", /round|without corners|circle|without.*corner|ronde|sans coins|cercle|sans.*coin/i],
  ];
  const buttons = f.all().filter(node => node.dataset.action === "match");
  // At level 4 the clues also negate the paired feature; use the positive phrase.
  const positive = text.split(/, not |, pas |, without |, sans |, pas une |, pas un /)[0]
    .replace(/\s(?:sans ailes|without wings)[.!]?$/, "");
  const matches = patterns.filter(([id, pattern]) => buttons.some(node => node.dataset.objectId === id) &&
    pattern.test(positive));
  assert.equal(matches.length, 1, `Unique visible clue: ${text}`);
  return buttons.find(node => node.dataset.objectId === matches[0][0]);
}

test("Moon UI requires accessible close-up and explicit confirmation while the original timer continues", () => {
  for (const language of ["en", "fr"]) {
    const f = fixture({ language, dailyCard: "moon" });
    assert.ok(f.all().some(node => node.className === "arcane-banner"));
    assert.ok(f.all().some(node => node.className === "game-help-text" && /15/.test(node.textContent) && /Inspect|inspect/.test(node.textContent)));
    f.click(f.find("start"));
    const pair = f.all().filter(node => node.dataset.action === "inspect");
    assert.equal(pair.length, 2);
    f.click(pair[0]);
    assert.equal(f.outcomes.length, 0);
    assert.equal(f.timers.size, 1);
    const confirm = f.find("confirm");
    assert.ok(confirm);
    assert.equal(f.doc.activeElement, confirm);
    assert.ok(f.all().some(node => node.tagName === "svg" && node.attributes.viewBox === "86 94 51 48"));
    const dots = f.all().filter(node => node.attributes["data-detail"] === "engraved-dot");
    assert.ok(dots.length >= 4, "board and close-up both show the real engraved dots");
    assert.ok(f.all().some(node => /engraved dot|points? gravé/.test(node.textContent)));
    f.tick(14999);
    assert.equal(f.outcomes.length, 0);
    assert.equal(f.doc.activeElement, confirm, "timer does not rebuild inspection");
    f.tick(1);
    assert.equal(f.outcomes[0].timedOut, true);
    assert.equal(f.outcomes[0].earningsMultiplier, 1);
    assert.equal(f.find("confirm"), undefined);
    assert.equal(f.timers.size, 0);
    f.api.destroy();
    assert.equal(f.outcomes.length, 1);
    assert.equal(f.container.children.length, 0);
  }
});

test("Moon UI serves the inspected pair and ordinary objects, with the unchanged raw perfect score", () => {
  const f = fixture({ language: "en", journeyCard: "moon" });
  f.click(f.find("start"));
  while (!f.outcomes.length) {
    const report = f.doc.activeElement.textContent;
    if (/My blue umbrella/.test(report)) {
      const id = /two/.test(report) ? "umbrella-star" : "umbrella-moon";
      f.click(f.all().find(node => node.dataset.action === "inspect" && node.dataset.objectId === id));
      f.click(f.find("confirm"));
    } else f.click(correctButton(f));
  }
  assert.equal(f.outcomes[0].score, 4);
  assert.equal(f.outcomes[0].earningsMultiplier, 1.1);
  assert.equal(f.timers.size, 0);
  f.api.destroy();
});

test("explicit start, native buttons, score, instructions and bilingual perfect games at all levels", () => {
  for (const language of ["fr", "en"]) for (let level = 0; level <= 4; level++) {
    const f = fixture({ language, level });
    assert.equal(f.find("match"), undefined);
    assert.equal(f.outcomes.length, 0);
    assert.equal(f.root.lang, language);
    assert.match(f.all().map(node => node.textContent).join(" "), /Tab/);
    const gifts = f.all().find(node => node.type === "checkbox");
    gifts.checked = true;
    f.keyboard(f.find("start"), "Enter");
    assert.equal(gifts.disabled, true);
    assert.equal(f.find("start").disabled, true);
    for (let i = 0; i < 4 + level; i++) {
      const choice = correctButton(f);
      assert.equal(choice.tagName, "button");
      assert.equal(choice.type, "button");
      if (i % 2) f.click(choice); else f.keyboard(choice, " ");
    }
    assert.deepEqual(f.outcomes, [{ completed: true, score: 4 + level, maxScore: 4 + level, cancelled: false, timedOut: false, earningsMultiplier: 1 }]);
    assert.match(f.all().map(node => node.textContent).join(" "), /×/);
    assert.equal(f.find("match"), undefined);
    assert.equal(f.observers[0].active, false);
    assert.equal(f.timers.size, 0);
    f.api.destroy(); f.api.destroy();
    assert.equal(f.outcomes.length, 1);
    assert.equal(f.container.children.length, 0);
  }
});

test("wrong matches show errors and three mistakes finish once without a gift", () => {
  const f = fixture({ language: "en" });
  f.click(f.find("start"));
  for (let i = 0; i < 3; i++) {
    const correct = correctButton(f);
    f.click(f.all().find(node => node.dataset.action === "match" && node !== correct));
    if (i < 2) assert.match(f.all().find(node => node.attributes.role === "status").textContent, /does not match/);
  }
  assert.deepEqual(f.outcomes, [{ completed: false, score: 0, maxScore: 4, cancelled: false, timedOut: false, earningsMultiplier: 1 }]);
  assert.match(f.all().find(node => node.attributes.role === "status").textContent, /Three mistakes.*3\/3/);
  assert.doesNotMatch(f.all().map(node => node.textContent).join(" "), /×/);
  f.api.destroy();
  assert.equal(f.outcomes.length, 1);
});

test("cancel button, Escape and destroy discard partial progress and clean every listener", () => {
  for (const mode of ["button", "escape", "destroy", "before-start"]) {
    const f = fixture();
    if (mode !== "before-start") {
      f.click(f.find("start"));
      f.click(correctButton(f));
    }
    if (mode === "button") f.click(f.find("cancel"));
    else if (mode === "escape") assert.equal(f.keyboard(f.doc.activeElement, "Escape"), undefined);
    else f.api.destroy();
    assert.deepEqual(f.outcomes, [{ completed: false, score: 0, maxScore: 4, cancelled: true, timedOut: false, earningsMultiplier: 1 }]);
    assert.equal(f.doc.listeners.get("visibilitychange").size, 0);
    assert.equal(f.root.listeners.get("click").size, 0);
    assert.equal(f.root.listeners.get("keydown").size, 0);
    assert.equal(f.observers[0].active, false);
    assert.equal(f.timers.size, 0);
    f.api.destroy(); f.doc.emit("visibilitychange"); f.mutations();
    assert.equal(f.outcomes.length, 1);
  }
});

test("document/ancestor hiding, CSS hiding, pagehide and external removal cancel with no reward", () => {
  for (const mode of ["document", "hidden", "aria", "display", "visibility", "removed", "pagehide", "tick-hidden"]) {
    const f = fixture();
    f.click(f.find("start")); f.click(correctButton(f));
    if (mode === "document") { f.doc.hidden = true; f.doc.emit("visibilitychange"); }
    else if (mode === "pagehide") f.doc.defaultView.emit("pagehide");
    else if (mode === "tick-hidden") { f.doc.hidden = true; f.tick(100); }
    else {
      if (mode === "hidden") f.container.hidden = true;
      if (mode === "aria") f.container.setAttribute("aria-hidden", "true");
      if (mode === "display") f.container.display = "none";
      if (mode === "visibility") f.container.visibility = "hidden";
      if (mode === "removed") f.root.remove();
      f.mutations();
    }
    assert.deepEqual(f.outcomes, [{ completed: false, score: 0, maxScore: 4, cancelled: true, timedOut: false, earningsMultiplier: 1 }]);
    assert.equal(f.timers.size, 0);
    assert.equal(f.doc.defaultView.listeners.get("pagehide").size, 0);
    f.api.destroy();
    assert.equal(f.outcomes.length, 1);
  }
});

test("initially hidden mounts cancel; invalid options do not modify the host", () => {
  const f = fixture({}, ({ doc }) => { doc.hidden = true; });
  assert.equal(f.outcomes[0].cancelled, true);
  f.api.destroy();
  assert.throws(() => mount(f.container, { level: 8 }), RangeError);
  assert.throws(() => mount(f.container, { onFinish: null }), TypeError);
  assert.throws(() => mount(null), TypeError);
  assert.equal(f.container.children.length, 0);
});

test("optional gift is off by default; destroy preserves unrelated container content", () => {
  const f = fixture({ language: "en" });
  const unrelated = f.doc.createElement("p");
  unrelated.textContent = "Host content";
  f.container.append(unrelated);
  f.click(f.find("start"));
  while (!f.outcomes.length) f.click(correctButton(f));
  assert.doesNotMatch(f.all().map(node => node.textContent).join(" "), /×/);
  f.api.destroy();
  assert.deepEqual(f.container.children, [unrelated]);
});

test("journey mode removes the fake thank-you gift and playtest disclaimers", () => {
  const f = fixture({ language: "en", journey: true });
  assert.equal(f.all().some(node => node.type === "checkbox"), false);
  assert.doesNotMatch(f.all().map(node => node.textContent).join(" "),
    /fictional detective|fictional thank-you|no money, inventory/i);
  assert.match(f.all().map(node => node.textContent).join(" "), /Lost and found/);
  f.api.destroy();
});

test("all eight objects have original, distinct SVG drawings with visible paired details", () => {
  const f = fixture({ language: "en", level: 4 });
  f.click(f.find("start"));
  const choices = f.all().filter(node => node.dataset.action === "match");
  assert.equal(choices.length, 8);
  const drawings = [];
  for (const [index, choice] of choices.entries()) {
    const art = choice.children[0];
    assert.equal(art.tagName, "svg");
    assert.equal(art.namespaceURI, "http://www.w3.org/2000/svg");
    assert.equal(art.attributes["aria-hidden"], "true");
    assert.equal(art.attributes["data-object"], choice.dataset.objectId);
    assert.equal(art.attributes.viewBox, "0 0 180 160");
    const drawingNodes = f.all(art);
    const detail = choice.dataset.objectId.split("-")[1];
    assert.equal(drawingNodes.some(node => node.attributes["data-detail"] === detail), true);
    assert.equal(drawingNodes.some(node => node.tagName === "text"), false, "distinctions must be drawn, not written");
    assert.equal(choice.children[1].textContent, `Object ${index + 1}`, "neutral caption does not give the clue away");
    assert.ok(choice.attributes["aria-label"].length > 10, "screen readers still receive the full description");
    drawings.push(drawingNodes.map(node => [node.tagName,
      Object.fromEntries(Object.entries(node.attributes).filter(([name]) => !name.startsWith("data-")))]));
  }
  assert.equal(new Set(drawings.map(drawing => JSON.stringify(drawing))).size, 8);
  const correct = correctButton(f);
  f.click(correct.children[0].children[0]);
  assert.match(f.all().find(node => node.attributes.role === "status").textContent, /Score: 1\/8/);
  assert.throws(() => objectIllustration(f.doc, "unknown"), RangeError);
  f.api.destroy();
});

test("countdown starts only on Start, keeps focus and object nodes stable, then expires exactly once", () => {
  const f = fixture({ language: "en" });
  const timer = f.all().find(node => node.attributes.role === "timer");
  assert.match(timer.textContent, /starting when you press Start/);
  assert.equal(f.timers.size, 0);
  f.tick(600000);
  assert.equal(f.outcomes.length, 0);
  f.click(f.find("start"));
  const choice = f.find("match");
  choice.focus();
  assert.equal(timer.textContent, "Time left: 0:15");
  f.tick(4999);
  assert.equal(timer.textContent, "Time left: 0:11");
  assert.equal(timer.dataset.urgent, "false");
  f.tick(1);
  assert.equal(timer.textContent, "Time left: 0:10");
  assert.equal(timer.dataset.urgent, "true");
  assert.equal(f.find("match"), choice);
  assert.equal(f.doc.activeElement, choice);
  f.tick(9999);
  assert.equal(f.outcomes.length, 0);
  f.tick(1);
  assert.deepEqual(f.outcomes, [{ completed: false, score: 0, maxScore: 4, cancelled: false, timedOut: true, earningsMultiplier: 1 }]);
  assert.equal(timer.textContent, "Time left: 0:00");
  assert.match(f.all().find(node => node.attributes.role === "status").textContent, /Time is up/);
  assert.equal(f.find("match"), undefined);
  assert.equal(f.timers.size, 0);
  f.tick(10000);
  f.api.destroy();
  assert.equal(f.outcomes.length, 1);
});

test("late clicks cannot beat expiry; success just before the deadline stops the timer", () => {
  const late = fixture({ language: "en" });
  late.click(late.find("start"));
  const gifts = late.all().find(node => node.type === "checkbox");
  gifts.checked = true;
  late.clock.now = 15000;
  late.click(correctButton(late));
  assert.equal(late.outcomes[0].score, 0);
  assert.equal(late.outcomes[0].timedOut, true);
  assert.doesNotMatch(late.all().map(node => node.textContent).join(" "), /×/);
  assert.equal(late.timers.size, 0);
  late.api.destroy();

  const timely = fixture({ language: "fr" });
  timely.click(timely.find("start"));
  timely.clock.now = 14999;
  while (!timely.outcomes.length) timely.click(correctButton(timely));
  assert.equal(timely.outcomes[0].completed, true);
  assert.equal(timely.outcomes[0].timedOut, false);
  assert.equal(timely.timers.size, 0);
  timely.tick(10000);
  timely.api.destroy();
  assert.equal(timely.outcomes.length, 1);
});
