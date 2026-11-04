import test from "node:test";
import assert from "node:assert/strict";
import { mount } from "../minigames/workshop-ui.mjs";
import { difficulty, PARTS } from "../minigames/workshop.mjs";
import { bikeIllustration } from "../minigames/workshop-art.mjs";

class Element {
  constructor(doc, tag = "div") {
    this.ownerDocument = doc;
    this.tagName = tag;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.listeners = new Map();
    this.textContent = "";
  }
  append(...nodes) {
    for (const node of nodes) {
      node.remove();
      node.parentNode = this;
      this.children.push(node);
    }
  }
  replaceChildren(...nodes) {
    this.children.forEach(node => { node.parentNode = null; });
    this.children = [];
    this.append(...nodes);
  }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(key, fn) {
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key).add(fn);
  }
  removeEventListener(key, fn) { this.listeners.get(key)?.delete(fn); }
  dispatch(key, event = {}) { for (const fn of [...(this.listeners.get(key) ?? [])]) fn(event); }
  contains(element) { return element === this || this.children.some(node => node.contains(element)); }
  closest(tag) { return this.tagName === tag ? this : this.parentNode?.closest(tag); }
  focus() { this.ownerDocument.activeElement = this; }
  remove() {
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(node => node !== this);
    this.parentNode = null;
  }
}
const all = element => [element, ...element.children.flatMap(all)];
const text = element => [element.textContent, ...element.children.map(text)].join(" ");
function harness(options = {}) {
  const timers = new Map(), outcomes = [];
  let time = 100, id = 0;
  const doc = new Element(null, "document");
  doc.hidden = false;
  doc.createElement = tag => new Element(doc, tag);
  doc.createElementNS = (_, tag) => new Element(doc, tag);
  const view = new Element(doc, "window");
  view.performance = { now: () => time };
  view.setInterval = fn => { timers.set(++id, fn); return id; };
  view.clearInterval = id => timers.delete(id);
  doc.defaultView = view;
  const container = new Element(doc);
  const ui = mount(container, { language: "en", onFinish: value => outcomes.push(value), ...options });
  const root = container.children[0];
  const byClass = name => all(root).find(element => element.className?.split(" ").includes(name));
  const find = (action, value) => all(root).find(element => element.dataset.action === action &&
    (value === undefined || element.dataset.part === value || element.dataset.choice === String(value)));
  const click = (action, value) => {
    const target = find(action, value);
    assert.ok(target, `${action} ${value} exists`);
    if (!target.disabled) root.dispatch("click", { target });
    return target;
  };
  const key = (key, code) => root.dispatch("keydown", { key, code, preventDefault() {} });
  const modelPart = part => all(byClass("workshop-model")).find(element => element.attributes["data-part"] === part);
  const chooseMatch = part => {
    click("category", part);
    const value = modelPart(part).attributes;
    const choice = all(byClass("workshop-choices")).filter(element => element.tagName === "button").find(element =>
      all(element).some(node => node.attributes["data-part"] === part &&
        node.attributes["data-colour"] === value["data-colour"] && node.attributes["data-size"] === value["data-size"]));
    assert.ok(choice);
    root.dispatch("click", { target: choice });
  };
  return { ui, root, doc, view, container, outcomes, timers, find, click, key, byClass, modelPart, chooseMatch,
    tick(value) { time = value; for (const fn of [...timers.values()]) fn(); },
    text: () => text(root),
    assertClean() {
      assert.equal(timers.size, 0);
      for (const element of [root, doc, view]) {
        assert.equal([...element.listeners.values()].reduce((sum, set) => sum + set.size, 0), 0);
      }
    },
  };
}

test("visible graphical reference, six part categories, assembled preview, colour/size choices and successful building at all levels", () => {
  for (let level = 0; level <= 4; level++) {
    const h = harness({ level });
    assert.equal(h.timers.size, 0);
    assert.match(h.text(), /model stays visible/);
    assert.equal(all(h.byClass("workshop-model")).filter(element => element.attributes["data-part"]).length, 6);
    assert.equal(all(h.byClass("workshop-assembly")).filter(element => element.attributes.opacity === "0.25").length, 6);
    assert.equal(h.byClass("workshop-shelf").hidden, true);
    h.click("start");
    assert.equal(h.byClass("workshop-shelf").hidden, false);
    assert.equal(h.timers.size, 1);
    assert.equal(all(h.byClass("workshop-choices")).filter(element => element.tagName === "button").length, difficulty(level).options);
    for (const part of PARTS) h.chooseMatch(part);
    assert.match(h.byClass("workshop-progress").textContent, /6\/6/);
    assert.equal(all(h.byClass("workshop-assembly")).filter(element => element.attributes.opacity === "0.25").length, 0);
    h.click("submit");
    assert.deepEqual(h.outcomes, [{ completed: true, score: 1000, maxScore: 1000, cancelled: false, earningsMultiplier: 1 }]);
    assert.match(h.text(), /Perfect match/);
    h.assertClean();
    h.ui.destroy();
    h.ui.destroy();
    assert.equal(h.outcomes.length, 1);
    assert.equal(h.container.children.length, 0);
  }
});

test("Magician mount exposes one repaintable piece, a working palette, visible model and boosted result", t => {
  t.mock.method(Math, "random", () => 0);
  const h = harness({ journeyCard: "magician", dailyCard: "magician" });
  assert.match(h.byClass("arcane-banner").textContent, /×1.1/);
  assert.match(h.text(), /one part has no exact match/);
  h.click("start");
  const part = "frame";
  const target = h.modelPart(part).attributes;
  const special = all(h.byClass("workshop-choices")).find(element => element.tagName === "button" &&
    element.attributes["aria-label"]?.includes("Repaintable"));
  assert.ok(special);
  h.root.dispatch("click", { target: special });
  const paint = all(h.byClass("workshop-palette")).find(element => element.dataset.colour === target["data-colour"]);
  assert.equal(paint.disabled, false);
  h.root.dispatch("click", { target: paint });
  assert.equal(h.byClass("workshop-model").hidden, undefined);
  for (const other of PARTS.filter(value => value !== part)) h.chooseMatch(other);
  h.click("submit");
  assert.equal(h.outcomes[0].score, 1000);
  assert.equal(h.outcomes[0].earningsMultiplier, 1.1);
  h.assertClean();
  h.ui.destroy();
});

test("Magician timeout cleans the timer and never earns the resonance multiplier", t => {
  t.mock.method(Math, "random", () => 0);
  const h = harness({ dailyCard: "magician" });
  h.click("start");
  h.tick(100 + difficulty(0).timeMs);
  assert.equal(h.outcomes[0].earningsMultiplier, 1);
  h.assertClean();
  h.ui.destroy();
  assert.equal(h.outcomes.length, 1);
});

test("Magician palette repaints every category and accepts wrong-size fitted parts", t => {
  t.mock.method(Math, "random", () => 0);
  const h = harness({ resonance: true });
  h.click("start");
  for (const part of PARTS) {
    h.click("category", part);
    const model = h.modelPart(part).attributes;
    const choice = all(h.byClass("workshop-choices")).find(element => element.tagName === "button" &&
      all(element).some(node => node.attributes["data-part"] === part &&
        node.attributes["data-size"] !== model["data-size"]));
    h.root.dispatch("click", { target: choice });
    assert.equal(h.byClass("workshop-palette").hidden, false);
    const paint = all(h.byClass("workshop-palette")).find(element => element.dataset.colour === "red");
    assert.equal(paint.disabled, false);
    h.root.dispatch("click", { target: paint });
    const fitted = all(h.byClass("workshop-assembly")).find(node => node.attributes["data-part"] === part);
    assert.equal(fitted.attributes["data-colour"], "red");
    assert.notEqual(fitted.attributes["data-size"], model["data-size"]);
  }
  h.ui.destroy();
  h.assertClean();
});

test("size and colour are visible in shelf labels; wrong parts can be replaced without resetting time", () => {
  const h = harness();
  h.click("start");
  for (const part of PARTS) h.chooseMatch(part);
  h.click("category", "seat");
  const target = h.modelPart("seat").attributes;
  const incorrect = all(h.byClass("workshop-choices")).filter(element => element.tagName === "button").find(element =>
    all(element).some(node => node.attributes["data-part"] === "seat" &&
      node.attributes["data-size"] !== target["data-size"]));
  h.root.dispatch("click", { target: incorrect });
  h.tick(1100);
  h.click("submit");
  assert.match(h.byClass("workshop-feedback").textContent, /Compare these parts.*Seat/);
  assert.doesNotMatch(h.byClass("workshop-feedback").textContent, /Model:|Fitted:/);
  assert.equal(h.outcomes.length, 0);
  assert.equal(h.byClass("workshop-countdown").textContent, "Time left: 59 s");
  h.chooseMatch("seat");
  h.click("submit");
  assert.equal(h.outcomes[0].completed, true);
  h.ui.destroy();
});

test("countdown is live without replacing bike or buttons, and late input fails at the exact deadline", () => {
  const h = harness({ level: 4 });
  h.click("start");
  const bike = h.byClass("workshop-model").children[1];
  const choice = h.find("choose", 0);
  choice.focus();
  const stale = [...h.timers.values()][0];
  h.tick(26100);
  assert.equal(h.byClass("workshop-countdown").textContent, "Time left: 10 s");
  assert.equal(h.byClass("workshop-countdown").dataset.urgent, "true");
  assert.equal(h.doc.activeElement, choice);
  assert.equal(h.find("choose", 0), choice);
  assert.equal(h.byClass("workshop-model").children[1], bike);
  h.tick(36100);
  assert.equal(h.outcomes[0].completed, false);
  assert.equal(h.outcomes[0].cancelled, false);
  assert.equal(h.outcomes[0].score, 0);
  assert.match(h.text(), /Time is up/);
  stale();
  assert.equal(h.outcomes.length, 1);
  h.assertClean();
  h.ui.destroy();
});

test("number keys choose categories and native controls retain focus after fitting", () => {
  const h = harness();
  h.click("start");
  h.key("6", "Digit6");
  assert.equal(h.find("category", "handlebars").attributes["aria-pressed"], "true");
  h.key("Unidentified", "Numpad4");
  assert.equal(h.find("category", "seat").attributes["aria-pressed"], "true");
  h.click("choose", 0);
  assert.equal(h.doc.activeElement.dataset.choice, "0");
  assert.equal(h.doc.activeElement.attributes["aria-pressed"], "true");
  assert.match(all(h.byClass("workshop-assembly")).find(element => element.tagName === "svg").attributes["aria-label"], /Seat:/);
  h.ui.destroy();
});

test("Escape, hiding, pagehide, and destruction cancel exactly once and clean timers/listeners", () => {
  for (const started of [true, false]) {
    for (const method of ["escape", "cancel", "hidden", "pagehide", "destroy"]) {
      const h = harness();
      if (started) { h.click("start"); h.chooseMatch("frame"); }
      if (method === "escape") h.key("Escape");
      if (method === "cancel") h.click("cancel");
      if (method === "hidden") { h.doc.hidden = true; h.doc.dispatch("visibilitychange"); }
      if (method === "pagehide") h.view.dispatch("pagehide");
      if (method === "destroy") h.ui.destroy();
      if (!started && method === "hidden") assert.equal(h.outcomes.length, 0);
      else assert.equal(h.outcomes.length, 1, `${started}: ${method}`);
      h.ui.destroy();
      assert.equal(h.outcomes.length, 1);
      assert.equal(h.outcomes[0].cancelled, true);
      assert.equal(h.outcomes[0].score, 0);
      h.assertClean();
    }
  }
});

test("a hidden idle page cannot start the timed round", () => {
  const h = harness();
  h.doc.hidden = true;
  h.click("start");
  assert.equal(h.timers.size, 0);
  assert.equal(h.outcomes.length, 0);
  assert.equal(h.byClass("workshop-shelf").hidden, true);
  h.doc.hidden = false;
  h.click("start");
  assert.equal(h.timers.size, 1);
  h.ui.destroy();
});

test("fitting and checking play sounds once per action; reselection, categories and ticks do not", () => {
  const sounds = [];
  let stopped = 0;
  const h = harness({ audio: { play: kind => sounds.push(kind), stop: () => stopped++ } });
  h.click("start");
  h.click("choose", 0);
  assert.deepEqual(sounds, ["success"]);
  h.click("choose", 0);
  h.click("category", "seat");
  h.tick(200);
  assert.deepEqual(sounds, ["success"]);
  for (const part of PARTS) h.chooseMatch(part);
  const model = h.modelPart("seat").attributes;
  h.click("category", "seat");
  const incorrect = all(h.byClass("workshop-choices")).filter(element => element.tagName === "button").find(element =>
    all(element).some(node => node.attributes["data-part"] === "seat" &&
      node.attributes["data-size"] !== model["data-size"]));
  h.root.dispatch("click", { target: incorrect });
  h.click("submit");
  assert.equal(sounds.at(-1), "caught");
  h.chooseMatch("seat");
  const beforeSuccess = sounds.length;
  h.click("submit");
  assert.equal(sounds.length, beforeSuccess + 1);
  assert.equal(sounds.at(-1), "success");
  h.click("submit");
  assert.equal(sounds.length, beforeSuccess + 1);
  h.ui.destroy();
  assert.ok(stopped > 0);
});

test("timeout sounds once, cancellation stops sound without playing a result", () => {
  for (const method of ["timeout", "cancel", "hidden", "destroy"]) {
    const sounds = [];
    let stopped = 0;
    const h = harness({ audio: { play: kind => sounds.push(kind), stop: () => stopped++ } });
    h.click("start");
    if (method === "timeout") {
      h.tick(60100);
      h.tick(60200);
      assert.deepEqual(sounds, ["caught"]);
    } else {
      if (method === "cancel") h.click("cancel");
      if (method === "hidden") { h.doc.hidden = true; h.doc.dispatch("visibilitychange"); }
      if (method === "destroy") h.ui.destroy();
      assert.deepEqual(sounds, []);
      assert.ok(stopped > 0);
    }
    h.ui.destroy();
    h.assertClean();
  }
});

test("handlebar mismatch gives no written target answer; top drawings remain the reference", () => {
  const h = harness();
  h.click("start");
  for (const part of PARTS) h.chooseMatch(part);
  h.click("category", "handlebars");
  const model = h.modelPart("handlebars").attributes;
  const wrong = all(h.byClass("workshop-choices")).filter(element => element.tagName === "button").find(element =>
    all(element).some(node => node.attributes["data-part"] === "handlebars" &&
      node.attributes["data-colour"] === model["data-colour"] && node.attributes["data-size"] !== model["data-size"]));
  h.root.dispatch("click", { target: wrong });
  assert.equal(h.byClass("workshop-comparison"), undefined);
  h.click("submit");
  assert.match(h.byClass("workshop-feedback").textContent, /Handlebars/);
  assert.doesNotMatch(h.byClass("workshop-feedback").textContent, /Model:|Fitted:|Small|Medium|Large/);
  assert.equal(h.outcomes.length, 0);
  h.chooseMatch("handlebars");
  h.click("submit");
  assert.equal(h.outcomes[0].completed, true);
  h.ui.destroy();
});

test("French labels, language fallback, invalid mounts and explicit clock errors", t => {
  const h = harness({ language: "fr" });
  assert.match(h.text(), /Le modèle reste visible/);
  assert.equal(h.find("start").textContent, "Commencer");
  h.ui.destroy();
  const fallback = harness({ language: "unknown" });
  assert.equal(fallback.root.lang, "fr");
  fallback.ui.destroy();
  assert.throws(() => mount(null), /Invalid/);
  assert.throws(() => harness({ onFinish: "bad" }), /Invalid/);
  const errors = [];
  t.mock.method(console, "error", (...args) => errors.push(args));
  const broken = harness();
  broken.click("start");
  broken.tick(0);
  assert.match(broken.byClass("workshop-feedback").textContent, /Workshop error/);
  assert.equal(broken.byClass("workshop-feedback").attributes.role, "alert");
  assert.equal(errors.length, 1);
  broken.assertClean();
  broken.ui.destroy();
});

test("every part uses visibly different geometry and colours for its variants, in bike and shelf", () => {
  const h = harness();
  const serialize = element => JSON.stringify({ tag: element.tagName, attributes: element.attributes,
    children: element.children.map(serialize) });
  for (const part of PARTS) {
    const small = bikeIllustration(h.doc, { [part]: { size: "small", colour: "red" } }, "small", { part });
    const large = bikeIllustration(h.doc, { [part]: { size: "large", colour: "blue" } }, "large", { part });
    assert.notEqual(small.children[0].children.map(serialize).join(""), large.children[0].children.map(serialize).join(""), part);
    assert.notEqual(small.children[0].attributes.stroke, large.children[0].attributes.stroke);
    assert.equal(small.attributes.role, "img");
    assert.equal(large.attributes["aria-label"], "large");
  }
  h.ui.destroy();
});
