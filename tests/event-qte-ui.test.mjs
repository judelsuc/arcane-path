import test from "node:test";
import assert from "node:assert/strict";
import { mountEventChallenge } from "../event-qte-ui.mjs";
import { eventChallenge, challengeOutcome } from "../event-qte.mjs";

class Target {
  listeners = new Map();
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  dispatch(type, data = {}) { for (const fn of this.listeners.get(type) ?? []) fn(data); }
}
class Element extends Target {
  children = []; attributes = {}; style = {}; textContent = ""; disabled = false; hidden = false;
  constructor(tag, doc) { super(); this.tagName = tag; this.ownerDocument = doc; }
  append(node) { node.parent = this; this.children.push(node); }
  setAttribute(name, value) { this.attributes[name] = value; }
  remove() { this.parent.children = this.parent.children.filter(child => child !== this); }
  focus() {}
  click() { if (!this.disabled && !this.hidden) this.dispatch("click"); }
}
function fixture(kind = "coins", language = "en", options = {}) {
  let time = 0, serial = 0;
  const timers = new Map(), doc = new Target(), outcomes = [], starts = [], errors = [];
  doc.defaultView = { performance: { now: () => time },
    setInterval(fn) { timers.set(++serial, fn); return serial; }, clearInterval(id) { timers.delete(id); } };
  doc.createElement = tag => new Element(tag, doc);
  const host = new Element("div", doc);
  const event = { id: 1, opportunity: 1, kind, qte: { version: 1, status: "ready" }, ...options.event };
  let mode;
  const api = mountEventChallenge(host, { event, language,
    begin: value => { mode = value; starts.push(value); return true; },
    settle: result => { outcomes.push({ ...result,
      outcome: challengeOutcome(event, mode ?? event.qte.mode, result.trace, result.elapsedMs, result.skipped) }); return true; },
    onError: reason => errors.push(reason), ...options });
  const all = node => [node, ...node.children.flatMap(all)], root = host.children[0];
  const nodes = all(host);
  return { api, doc, host, nodes, timers, starts, outcomes, errors, root, event,
    button: text => nodes.find(node => node.tagName === "button" && node.textContent === text),
    tick(value) { time = value; for (const fn of [...timers.values()]) fn(); },
    key(key, extra = {}) { root.dispatch("keydown", { key, preventDefault() {}, stopPropagation() {}, ...extra }); } };
}
test("timing starts explicitly, accepts keyboard/touch, and cleans timers/listeners in both languages", () => {
  for (const language of ["en", "fr"]) for (const touch of [false, true]) {
    const f = fixture("coins", language);
    f.tick(10000);
    assert.equal(f.timers.size, 0);
    assert.deepEqual(f.outcomes, []);
    assert.ok(f.nodes.some(node => node.textContent.includes("35–65%") || node.textContent.includes("35–65 %")),
      "timing instructions are visible before starting");
    f.button(language === "en" ? "Start · 6 seconds" : "Commencer · 6 secondes").click();
    assert.equal(f.timers.size, 1);
    f.tick(11000);
    if (touch) f.button(language === "en" ? "Act · Space" : "Agir · Espace").click();
    else f.key(" ");
    assert.equal(f.outcomes[0].outcome, "success");
    f.key(" ");
    assert.equal(f.outcomes.length, 1);
    assert.equal(f.timers.size, 0);
    f.api.destroy();
    assert.equal(f.host.children.length, 0);
    assert.equal(f.doc.listeners.get("visibilitychange").size, 0);
  }
});
test("sequence and observation require correct directions; repeat/modifier keys cannot complete the challenge", () => {
  for (const kind of ["forestBoar", "stars"]) {
    const f = fixture(kind), rules = eventChallenge(f.event);
    f.button("Start · 6 seconds").click();
    f.key(rules.keys[0], { repeat: true });
    f.key(rules.keys[0], { ctrlKey: true });
    assert.equal(f.outcomes.length, 0);
    rules.keys.forEach(key => f.key(key));
    assert.equal(f.outcomes[0].outcome, "success");
    f.api.destroy();
    const wrong = fixture(kind);
    wrong.button("Start · 6 seconds").click();
    wrong.key(rules.keys[0] === "ArrowLeft" ? "ArrowRight" : "ArrowLeft");
    assert.equal(wrong.outcomes[0].outcome, "failure");
    wrong.api.destroy();
  }
});
test("untimed alternative removes the reaction deadline and replaces timing with observation", () => {
  const f = fixture();
  f.button("Untimed accessible mode").click();
  f.tick(100000);
  assert.equal(f.outcomes.length, 0);
  f.key(eventChallenge(f.event, "relaxed").keys[0]);
  assert.equal(f.outcomes[0].outcome, "success");
  assert.deepEqual(f.starts, ["relaxed"]);
  f.api.destroy();
});
test("deadline, skip and backgrounding settle once without rewards; restored active challenges cannot restart", () => {
  for (const action of ["timeout", "skip", "hidden"]) {
    const f = fixture();
    if (action !== "skip") f.button("Start · 6 seconds").click();
    if (action === "timeout") f.tick(6000);
    if (action === "skip") f.button("Skip challenge").click();
    if (action === "hidden") { f.doc.hidden = true; f.doc.dispatch("visibilitychange"); }
    assert.equal(f.outcomes[0].outcome, action === "skip" ? "skipped" : "failure");
    assert.equal(f.outcomes.length, 1);
    f.api.destroy();
  }
  const restored = fixture("coins", "en", { event: { id: 1, opportunity: 1, kind: "coins",
    qte: { version: 1, status: "active", mode: "relaxed" } } });
  assert.equal(restored.button("Start · 6 seconds").hidden, true);
  assert.equal(restored.outcomes.length, 0);
  restored.button("Retry saving the result").click();
  assert.equal(restored.outcomes[0].outcome, "failure");
  restored.api.destroy();
});
test("save failures stay visible and result retries do not restart input or silently succeed", () => {
  let attempts = 0;
  const f = fixture("coins", "en", { settle() {
    if (++attempts === 1) throw new Error("Storage unavailable.");
    return true;
  } });
  f.button("Start · 6 seconds").click();
  f.tick(1000);
  f.key(" ");
  assert.equal(f.errors[0].message, "Storage unavailable.");
  assert.equal(f.button("Retry saving the result").hidden, false);
  f.button("Retry saving the result").click();
  assert.equal(attempts, 2);
  assert.equal(f.button("Retry saving the result").hidden, true);
  assert.equal(f.timers.size, 0);
  f.api.destroy();
  const blocked = fixture("coins", "en", { begin() { throw new Error("Cannot save start."); } });
  blocked.button("Start · 6 seconds").click();
  assert.equal(blocked.errors[0].message, "Cannot save start.");
  assert.equal(blocked.timers.size, 0);
  blocked.api.destroy();
});
