import test from "node:test";
import assert from "node:assert/strict";
import { mount } from "../minigames/sketch-ui.mjs";
import { INK } from "../minigames/sketch.mjs";
import { readFileSync } from "node:fs";

// Minimal DOM/event/clock harness: no app, storage, network or external dependencies.
class Events {
  listeners = new Map();
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }
  removeEventListener(type, handler) { this.listeners.get(type)?.delete(handler); }
  emit(type, detail = {}) {
    const event = { key: "", defaultPrevented: false, stopped: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.stopped = true; }, ...detail };
    for (const handler of [...(this.listeners.get(type) ?? [])]) handler(event);
    return event;
  }
}
class Element extends Events {
  children = [];
  attributes = new Map();
  style = {};
  content = "";
  set textContent(value) { this.content = value; this.children = []; }
  get textContent() { return this.content + this.children.map(child => child.textContent).join(""); }
  hidden = false;
  disabled = false;
  parentElement = null;
  constructor(tag, doc) { super(); this.tagName = tag.toUpperCase(); this.ownerDocument = doc; }
  append(...children) { for (const child of children) { child.parentElement = this; this.children.push(child); } }
  replaceChildren() { this.children.forEach(child => { child.parentElement = null; }); this.children = []; this.content = ""; }
  remove() {
    if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(c => c !== this);
    this.parentElement = null;
  }
  get isConnected() {
    return this === this.ownerDocument.documentElement || !!this.parentElement?.isConnected;
  }
  setAttribute(key, value) { this.attributes.set(key, value); }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  focus() { this.ownerDocument.activeElement = this; }
  click() { if (!this.disabled) this.emit("click"); }
}
function harness(options = {}) {
  const doc = new Events();
  const win = new Events();
  const timers = new Map(), observers = new Set(), results = [];
  let now = 0, nextTimer = 0;
  doc.hidden = false;
  doc.defaultView = win;
  doc.createElement = tag => new Element(tag, doc);
  doc.createElementNS = (_, tag) => new Element(tag, doc);
  doc.documentElement = doc.createElement("html");
  win.performance = { now: () => now };
  win.getComputedStyle = node => ({ display: node.style.display ?? "block",
    visibility: node.style.visibility ?? "visible" });
  win.setTimeout = (callback, delay) => {
    const id = ++nextTimer;
    timers.set(id, { callback, at: now + delay });
    return id;
  };
  win.clearTimeout = id => timers.delete(id);
  win.MutationObserver = class {
    constructor(callback) { this.callback = callback; }
    observe() { observers.add(this); }
    disconnect() { observers.delete(this); }
  };
  const parent = doc.createElement("main");
  doc.documentElement.append(parent);
  const container = doc.createElement("div");
  parent.append(container);
  const ui = mount(container, { ...options, onFinish: value => results.push(value) });
  const root = container.children[0];
  const walk = node => [node, ...node.children.flatMap(walk)];
  const nodes = walk(root);
  const control = text => nodes.find(node => node.tagName === "BUTTON" && node.textContent === text);
  const cells = nodes.filter(node => node.getAttribute("aria-label")?.match(/^(Row|Ligne) \d, /));
  const model = nodes.find(node => node.tagName === "PRE");
  const status = nodes.find(node => node.getAttribute("role") === "status");
  return { doc, win, ui, parent, container, root, nodes, cells, control, model, status, results, timers, observers,
    mutations() { for (const observer of [...observers]) observer.callback(); },
    tick(milliseconds) {
      now += milliseconds;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now) { timers.delete(id); timer.callback(); }
      }
    },
    assertClean() {
      assert.equal(timers.size, 0);
      assert.equal(observers.size, 0);
      for (const node of [doc, win, ...nodes.filter(node => node.className !== "arcane-watermark")])
        for (const handlers of node.listeners.values()) assert.equal(handlers.size, 0);
    },
  };
}

test("Star UI sparkles three landmarks then keeps neutral positions without leaking model colours", t => {
  t.mock.method(Math, "random", () => 0.25);
  const h = harness({ language: "en", level: 4, journeyCard: "star", dailyCard: "star" });
  assert.match(h.nodes.find(node => node.className === "arcane-banner").textContent, /×1.1/);
  h.control("Start").click();
  const target = h.model.textContent.replaceAll("\n", "");
  const landmarks = h.model.children.filter(node => node.className === "sketch-landmark");
  assert.equal(landmarks.length, 3);
  h.control("Draw now").click();
  assert.equal(h.model.textContent, "");
  const starCells = h.cells.filter(cell => cell.children.some(node => node.className === "sketch-star"));
  assert.equal(starCells.length, 3);
  for (const cell of starCells) {
    const star = cell.children[0];
    assert.equal(star.textContent, "☆");
    assert.equal(star.style.color, undefined);
    assert.equal(cell.style.color, INK[0].colour);
  }
  const overlay = h.nodes.find(node => node.tagName === "SVG");
  assert.equal(overlay.children.length, 0);
  for (const cell of starCells) {
    const index = h.cells.indexOf(cell);
    const ink = INK.findIndex(value => value.symbol === target[index]);
    h.control(`${INK[ink].symbol} ${["Eraser", "Green", "Red", "Blue", "Purple"][ink]}`).click();
    cell.click();
  }
  assert.equal(overlay.children.length, 2);
  h.control("Clear").click();
  assert.equal(overlay.children.length, 0);
  h.control("Finish sketch").click();
  assert.equal(h.results[0].earningsMultiplier, 1.1);
  h.assertClean();
});

test("Star cancellation hides observation and cleans timers without a multiplier", () => {
  const h = harness({ language: "fr", dailyCard: "star" });
  h.control("Commencer").click();
  h.doc.hidden = true;
  h.doc.emit("visibilitychange");
  assert.equal(h.model.textContent, "");
  assert.equal(h.results[0].earningsMultiplier, 1);
  h.assertClean();
  h.ui.destroy();
  assert.equal(h.results.length, 1);
});
function drawFromModel(h) {
  h.control("Start").click();
  const target = h.model.textContent.replaceAll("\n", "");
  h.control("Draw now").click();
  for (let index = 0; index < target.length; index++) if (target[index] === "#") h.cells[index].click();
}

test("reveal compares the original coloured model and the actual imperfect drawing side by side", () => {
  for (const language of ["en", "fr"]) {
    const h = harness({ language, level: 4 });
    const comparison = h.nodes.find(node => node.className === "sketch-comparison");
    const player = h.nodes.find(node => node.className === "sketch-player");
    h.control(language === "en" ? "Start" : "Commencer").click();
    const target = h.model.textContent;
    const targetColours = h.model.children.map(node => node.style.color);
    assert.equal(player.textContent, "");
    assert.equal(player.parentElement.hidden, true);
    h.control(language === "en" ? "Draw now" : "Dessiner maintenant").click();
    assert.equal(h.model.textContent, "");
    assert.equal(comparison.hidden, true);
    h.cells[0].click();
    h.control(language === "en" ? "Finish sketch" : "Terminer le croquis").click();
    assert.equal(comparison.hidden, false);
    assert.equal(comparison.style.display, "grid");
    assert.equal(comparison.style.gridTemplateColumns, undefined, "responsive columns must not be overridden inline");
    assert.equal(player.parentElement.hidden, false);
    assert.equal(h.model.textContent, target);
    assert.deepEqual(h.model.children.map(node => node.style.color), targetColours);
    assert.equal(player.textContent, h.results[0].sketch.rows.join("\n"));
    assert.notEqual(player.textContent, target);
    assert.notEqual(player.getAttribute("aria-label"), h.model.getAttribute("aria-label"));
    h.assertClean();
    h.ui.destroy();
  }
});

test("observation and revealed sketches keep large matching symbols and stack on narrow screens", () => {
  const css = readFileSync(new URL("../mini-games.css", import.meta.url), "utf8");
  assert.match(css, /pre \{[^}]*font: bold clamp\(36px, 5vw, 52px\)\/1\.35 monospace;/);
  assert.match(css, /\.sketch-comparison \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 640px\) \{\s*\.sketch-comparison \{ grid-template-columns: minmax\(0, 1fr\)/);
  assert.doesNotMatch(css, /\.sketch-revealed pre[^}]*font-size/);
});
test("explicit English start, perfect clickable puzzle, safe output and once-only completion", () => {
  const h = harness({ language: "en" });
  assert.equal(h.results.length, 0);
  assert.equal(h.timers.size, 0);
  assert.equal(h.model.hidden, true);
  assert.equal(h.model.textContent, "");
  assert.ok(h.nodes.some(node => /not photos/.test(node.textContent)));
  drawFromModel(h);
  assert.equal(h.model.hidden, true);
  assert.equal(h.model.textContent, "", "memory target removed from accessible DOM");
  assert.equal(h.timers.size, 0);
  h.control("Finish sketch").click();
  assert.equal(h.results.length, 1);
  assert.equal(h.results[0].score, h.results[0].maxScore);
  assert.equal(h.results[0].completed, true);
  assert.match(h.status.textContent, /Different squares: 0/);
  assert.equal(h.doc.activeElement, h.status);
  assert.equal(h.model.textContent, h.results[0].sketch.rows.join("\n"));
  h.assertClean();
  h.control("Finish sketch").click();
  h.doc.hidden = true;
  h.doc.emit("visibilitychange");
  h.ui.destroy();
  h.ui.destroy();
  assert.equal(h.results.length, 1);
  assert.equal(h.container.children.length, 0);
});

test("French defaults, clear, wrong/empty score, and accessible native touch/keyboard controls", () => {
  const h = harness();
  assert.equal(h.root.lang, "fr");
  assert.match(h.status.textContent, /Prêt/);
  h.control("Commencer").click();
  assert.match(h.status.textContent, /7 secondes/);
  h.control("Dessiner maintenant").click();
  assert.equal(h.doc.activeElement, h.cells[0]);
  assert.equal(h.cells.length, 9);
  for (const cell of h.cells) {
    assert.equal(cell.tagName, "BUTTON");
    assert.equal(cell.type, "button", "native Space/Enter activation and no form submission");
    assert.match(cell.getAttribute("aria-label"), /Ligne \d, colonne \d/);
    assert.equal(cell.style.minHeight, "44px");
  }
  h.cells[0].click();
  assert.equal(h.cells[0].getAttribute("aria-pressed"), "true");
  assert.equal(h.cells[0].textContent, "#");
  const event = h.cells[0].emit("keydown", { key: "ArrowRight" });
  assert.equal(event.defaultPrevented, true);
  assert.equal(h.doc.activeElement, h.cells[1]);
  h.cells[1].emit("keydown", { key: "ArrowDown" });
  assert.equal(h.doc.activeElement, h.cells[4]);
  h.cells[4].emit("keydown", { key: "Home" });
  assert.equal(h.doc.activeElement, h.cells[3]);
  h.cells[3].emit("keydown", { key: "End" });
  assert.equal(h.doc.activeElement, h.cells[5]);
  h.cells[0].emit("keydown", { key: "ArrowLeft" });
  assert.equal(h.doc.activeElement, h.cells[0]);
  h.control("Effacer").click();
  assert.ok(h.cells.every(cell => cell.getAttribute("aria-pressed") === "false"));
  h.control("Terminer le croquis").click();
  assert.equal(h.results[0].score, 0);
  assert.match(h.status.textContent, /Score : 0\/\d+\. Cases différentes : \d+/);
  h.assertClean();
});

test("all levels show their actual grid and palette; coloured models reproduce with exact colours", () => {
  for (let level = 0; level <= 4; level++) {
    const h = harness({ level, language: "en" });
    const size = 3 + level, colours = [1, 1, 2, 2, 4][level];
    assert.equal(h.cells.length, size ** 2);
    assert.ok(h.nodes.some(node => node.textContent.includes(`${size}×${size} grid, ${colours} colour(s)`)));
    h.control("Start").click();
    const target = h.model.textContent.replaceAll("\n", "");
    assert.equal(target.length, size ** 2);
    h.control("Draw now").click();
    assert.equal(h.model.children.length, 0);
    for (let index = 0; index < target.length; index++) {
      const ink = INK.findIndex(value => value.symbol === target[index]);
      if (!ink) continue;
      const names = ["Eraser", "Green", "Red", "Blue", "Purple"];
      h.control(`${INK[ink].symbol} ${names[ink]}`).click();
      h.cells[index].click();
      assert.equal(h.cells[index].style.color, INK[ink].colour);
      assert.equal(h.cells[index].textContent, INK[ink].symbol);
    }
    h.control("Finish sketch").click();
    assert.equal(h.results[0].score, h.results[0].maxScore);
    assert.equal(h.results[0].sketch.width, size);
    assert.equal(h.model.textContent, h.results[0].sketch.rows.join("\n"));
    h.assertClean();
    h.ui.destroy();
  }
});

test("observation timeout respects level, drawing has no timeout, early hiding clears timer", () => {
  const h = harness({ level: 4, language: "en" });
  h.control("Start").click();
  assert.equal(h.timers.size, 1);
  h.tick(10999);
  assert.equal(h.model.hidden, false);
  h.tick(1);
  assert.equal(h.model.hidden, true);
  assert.equal(h.doc.activeElement, h.cells[0]);
  assert.equal(h.timers.size, 0);
  h.tick(1000000);
  assert.equal(h.results.length, 0);
  h.ui.destroy();
  assert.equal(h.results[0].cancelled, true);
  h.assertClean();
});

test("levels 2 and 3 display and enforce the rebalanced two-colour observation windows", () => {
  for (const [level, seconds] of [[2, 7], [3, 12]]) {
    const h = harness({ level, language: "en" });
    assert.ok(h.nodes.some(node => node.textContent.includes(
      `${3 + level}×${3 + level} grid, 2 colour(s), ${seconds} seconds`)));
    assert.equal(h.control("+ Blue"), undefined);
    h.control("Start").click();
    h.tick(seconds * 1000 - 1);
    assert.equal(h.model.hidden, false);
    h.tick(1);
    assert.equal(h.model.hidden, true);
    assert.equal(h.model.textContent, "");
    h.ui.destroy();
    h.assertClean();
  }
});

test("cancel, Escape and destroy before/after start all cancel once with zero reward", () => {
  for (const mode of ["cancel", "escape", "destroy-ready", "destroy-observe", "destroy-draw"]) {
    const h = harness({ language: "en" });
    if (mode !== "destroy-ready") h.control("Start").click();
    if (mode === "destroy-draw") h.control("Draw now").click();
    if (mode === "cancel") h.control("Cancel").click();
    else if (mode === "escape") {
      assert.equal(h.root.emit("keydown", { key: "Escape" }).defaultPrevented, true);
    } else h.ui.destroy();
    h.ui.destroy();
    h.tick(50000);
    assert.equal(h.results.length, 1, mode);
    assert.equal(h.results[0].score, 0);
    assert.equal(h.results[0].completed, false);
    assert.equal(h.results[0].cancelled, true);
    assert.equal(h.results[0].sketch, undefined);
    h.assertClean();
  }
});

test("hidden document, ancestor, style, removal and pagehide cancel without rewarding drawn ink", () => {
  for (const mode of ["document", "ancestor", "style", "aria", "removed", "root-hidden",
    "root-removed", "resize", "pagehide", "hidden-submit"]) {
    const h = harness({ language: "en" });
    drawFromModel(h);
    if (mode === "document") { h.doc.hidden = true; h.doc.emit("visibilitychange"); }
    else if (mode === "pagehide") h.win.emit("pagehide");
    else {
      if (mode === "ancestor" || mode === "hidden-submit") h.parent.hidden = true;
      if (mode === "style") h.parent.style.display = "none";
      if (mode === "aria") h.parent.setAttribute("aria-hidden", "true");
      if (mode === "removed") h.container.remove();
      if (mode === "root-hidden") h.root.hidden = true;
      if (mode === "root-removed") h.root.remove();
      if (mode === "resize") { h.parent.style.display = "none"; h.win.emit("resize"); }
      if (mode === "hidden-submit") h.control("Finish sketch").click();
      else h.mutations();
    }
    assert.equal(h.results.length, 1, mode);
    assert.equal(h.results[0].cancelled, true, mode);
    assert.equal(h.results[0].score, 0, mode);
    h.assertClean();
    h.ui.destroy();
  }
});

test("hiding during observation or before start clears pending work and never completes", () => {
  for (const started of [false, true]) {
    const h = harness({ language: "en" });
    if (started) h.control("Start").click();
    h.doc.hidden = true;
    h.doc.emit("visibilitychange");
    h.tick(100000);
    assert.equal(h.results.length, 1);
    assert.equal(h.results[0].cancelled, true);
    assert.equal(h.results[0].score, 0);
    h.assertClean();
    h.ui.destroy();
  }
});

test("invalid mounting options do not attach nodes or listeners; fallback locale is French", () => {
  assert.throws(() => mount(null), TypeError);
  const h = harness({ language: "unknown" });
  h.ui.destroy();
  assert.throws(() => mount(h.container, { onFinish: "bad" }), TypeError);
  assert.throws(() => mount(h.container, { level: 5 }), RangeError);
  assert.equal(h.container.children.length, 0);
  h.assertClean();
  const fresh = harness({ language: "unknown" });
  assert.equal(fresh.root.lang, "fr");
  fresh.ui.destroy();
});
