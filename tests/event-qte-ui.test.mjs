import test from "node:test";
import assert from "node:assert/strict";
import { mountEventChallenge, trackEventQteKeys } from "../event-qte-ui.mjs";
import { eventChallenge, challengeOutcome, reactionCue, QTE_PREPARATION_MS, QTE_LETTERS } from "../event-qte.mjs";

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
  children = []; attributes = {}; style = {}; textContent = ""; disabled = false; hidden = false; open = false;
  constructor(tag, doc) { super(); this.tagName = tag; this.ownerDocument = doc; }
  append(node) { node.parent = this; this.children.push(node); }
  setAttribute(name, value) { this.attributes[name] = value; }
  remove() { this.parent.children = this.parent.children.filter(child => child !== this); }
  focus() {}
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatch("close"); }
  click() { if (!this.disabled && !this.hidden) this.dispatch("click"); }
}
async function fixture(kind = "coins", language = "en", options = {}) {
  let time = 0, serial = 0;
  const timers = new Map(), doc = new Target(), outcomes = [], starts = [], errors = [];
  doc.defaultView = { performance: { now: () => time },
    setInterval(fn) { timers.set(++serial, fn); return serial; }, clearInterval(id) { timers.delete(id); } };
  doc.createElement = tag => new Element(tag, doc);
  const host = new Element("div", doc);
  const event = { id: 1, opportunity: 1, kind,
    qte: { version: 2, status: "ready", fatigue: 0, health: 100 }, ...options.event };
  let mode;
  const api = mountEventChallenge(host, { event, language,
    begin: value => { mode = value; starts.push(value); return true; },
    settle: result => { outcomes.push({ ...result,
      outcome: challengeOutcome(event, mode ?? event.qte.mode, result.trace, result.elapsedMs, result.skipped) }); return true; },
    onError: reason => errors.push(reason), ...options });
  const all = node => [node, ...node.children.flatMap(all)], root = host.children[0];
  const nodes = all(host);
  await Promise.resolve();
  const offset = options.preparation ? 0 : QTE_PREPARATION_MS;
  if (offset) {
    time = offset;
    for (const fn of [...timers.values()]) fn();
  }
  return { api, doc, host, nodes, timers, starts, outcomes, errors, root, event,
    button: text => nodes.find(node => node.tagName === "button" && node.textContent === text),
    tick(value) { time = value + offset; for (const fn of [...timers.values()]) fn(); },
    key(key, extra = {}) { root.dispatch("keydown", { key, preventDefault() {}, stopPropagation() {}, ...extra }); },
    release(key) { doc.dispatch("keyup", { key }); } };
}
test("three-second preparation ignores walking input, waits for release and starts the clock only afterwards", async () => {
  const heldKeys = new Set(["ArrowRight"]);
  const f = await fixture("coins", "en", { preparation: true, heldKeys });
  const rule = eventChallenge(f.event);
  assert.deepEqual(f.starts, ["normal"]);
  for (const time of [0, 1000, 2999]) {
    f.tick(time);
    f.key("ArrowRight", { repeat: true });
    f.key("ArrowLeft");
    f.release("ArrowLeft");
    assert.deepEqual(f.outcomes, []);
    assert.ok(f.nodes.filter(n => n.className === "event-qte-key").every(n => n.disabled));
  }
  f.tick(3000);
  assert.equal(f.nodes.find(n => n.className === "event-qte-target").textContent, "Release held keys to begin.");
  f.tick(20000);
  assert.deepEqual(f.outcomes, []);
  f.release("ArrowRight");
  f.tick(20001);
  assert.equal(f.nodes.find(n => n.className === "event-qte-target").textContent, "Watch the keys…");
  for (const [index, key] of rule.keys.entries()) {
    f.tick(20001 + reactionCue(rule, index).startMs + 50);
    f.key(key);
    f.release(key);
  }
  assert.equal(f.outcomes[0].outcome, "success");
  assert.equal(f.outcomes[0].trace[0].atMs, 950);
  f.api.destroy();
  assert.equal(f.doc.listeners.get("keyup").size, 0);
});

test("the tracker remembers keys held before the event opens and releases them outside the panel", () => {
  const doc = new Target();
  doc.defaultView = new Target();
  const held = trackEventQteKeys(doc);
  doc.dispatch("keydown", { key: "ArrowUp" });
  doc.dispatch("keydown", { key: "A" });
  assert.deepEqual([...held], ["ArrowUp", "a"]);
  doc.dispatch("keyup", { key: "ArrowUp" });
  assert.deepEqual([...held], ["a"]);
  doc.defaultView.dispatch("blur");
  assert.equal(held.size, 0);
});

test("a sheltered-sleep challenge can supply its own scene and result without journey-event rewards", async () => {
  const f = await fixture("delay", "en", {
    presentation: { action: "Find a fictional empty shelter.", social: false },
    backdrop: "[fictional building]",
    outcomeText: () => "Stay outside. Vigilance +5.",
  });
  assert.equal(f.nodes.find(node => node.className === "event-qte-action").textContent,
    "Find a fictional empty shelter.");
  assert.equal(f.nodes.find(node => node.className === "event-qte-backdrop").textContent,
    "[fictional building]");
  f.button("Skip challenge").click();
  assert.equal(f.nodes.find(node => node.className === "event-qte-result").textContent,
    "Stay outside. Vigilance +5.");
  assert.equal(f.outcomes.length, 1);
  f.api.destroy();
});

test("Help freezes preparation and skipping during preparation settles once with an empty trace", async () => {
  const f = await fixture("coins", "en", { preparation: true });
  f.tick(1000);
  f.button("Help").click();
  f.tick(11000);
  f.key("ArrowUp");
  f.release("ArrowUp");
  f.button("Resume").click();
  f.tick(12999);
  assert.ok(f.nodes.filter(n => n.className === "event-qte-key").every(n => n.disabled));
  f.tick(13000);
  assert.ok(f.nodes.filter(n => n.className === "event-qte-key").every(n => !n.disabled));
  f.api.destroy();
  const skipped = await fixture("coins", "en", { preparation: true });
  skipped.button("Skip challenge").click();
  assert.equal(skipped.outcomes[0].outcome, "skipped");
  assert.deepEqual(skipped.outcomes[0].trace, []);
  assert.equal(skipped.outcomes[0].elapsedMs, 0);
  assert.equal(skipped.timers.size, 0);
  skipped.api.destroy();
});

test("high difficulty displays scattered letter buttons and accepts uppercase keyboard or touch", async () => {
  for (const touch of [false, true]) {
    const f = await fixture("forestBoar", "en", { event: { id: 1, opportunity: 1, kind: "forestBoar",
      qte: { version: 3, status: "ready", fatigue: 60, health: 100 } } });
    const rule = eventChallenge(f.event);
    assert.ok(rule.keys.some(key => QTE_LETTERS.includes(key)));
    for (const [index, key] of rule.keys.entries()) {
      f.tick(reactionCue(rule, index).startMs + 50);
      const lit = f.nodes.find(n => n.attributes["aria-pressed"] === "true");
      assert.equal(lit.attributes["aria-keyshortcuts"], key);
      if (touch) lit.click();
      else f.key(key.length === 1 ? key.toUpperCase() : key);
    }
    assert.equal(f.outcomes[0].outcome, "success");
    f.api.destroy();
  }
});
test("reaction starts automatically, lights one key at a time and accepts keyboard/touch in both languages", async () => {
  for (const language of ["en", "fr"]) for (const touch of [false, true]) {
    const f = await fixture("coins", language);
    const rules = eventChallenge(f.event);
    assert.deepEqual(f.starts, ["normal"]);
    assert.ok(!f.nodes.some(node => /^(Start|Commencer)/.test(node.textContent)));
    assert.deepEqual(f.outcomes, []);
    assert.equal(f.timers.size, 1);
    assert.ok(f.nodes.some(node => node.className === "event-qte-backdrop" && node.textContent.trim()));
    assert.equal(f.nodes.filter(node => node.attributes["aria-pressed"] === "true").length, 0);
    for (const [index, key] of rules.keys.entries()) {
      f.tick(reactionCue(rules, index).startMs + 50);
      const lit = f.nodes.filter(node => node.attributes["aria-pressed"] === "true");
      assert.equal(lit.length, 1);
      assert.equal(lit[0].attributes["aria-keyshortcuts"], key);
      if (touch) lit[0].click();
      else f.key(key === "Space" ? " " : key);
      assert.equal(f.nodes.filter(node => node.attributes["aria-pressed"] === "true").length, 0);
    }
    assert.equal(f.outcomes[0].outcome, "success");
    f.key(" ");
    assert.equal(f.outcomes.length, 1);
    assert.equal(f.timers.size, 0);
    f.api.destroy();
    assert.equal(f.host.children.length, 0);
    assert.equal(f.doc.listeners.get("visibilitychange").size, 0);
  }
});

test("Help owns the rules, freezes the exact cue instant and resumes without restarting or accepting paused input", async () => {
  const f = await fixture("stars", "fr");
  const rules = eventChallenge(f.event), help = f.nodes.find(node => node.tagName === "dialog");
  assert.ok(help.children.some(node => node.textContent.includes("chaque touche illuminée")));
  assert.ok(!f.root.children.some(node => node.textContent.includes("chaque touche illuminée")));
  f.tick(1000);
  f.button("Aide").click();
  assert.ok(help.open);
  f.tick(21000);
  f.key(rules.keys[0]);
  assert.deepEqual(f.outcomes, []);
  f.button("Reprendre").click();
  assert.equal(help.open, false);
  assert.deepEqual(f.starts, ["normal"]);
  for (const [index, key] of rules.keys.entries()) {
    f.tick(20000 + reactionCue(rules, index).startMs + 100);
    f.key(key);
  }
  assert.equal(f.outcomes[0].outcome, "success");
  assert.equal(f.outcomes[0].trace[0].atMs, 1000);
  f.api.destroy();
});

test("presentation prefers a ready generated illustration, restores ASCII on failure and keeps the event story central", async () => {
  const f = await fixture("stars");
  const art = f.nodes.find(node => node.className === "event-qte-backdrop");
  f.api.updatePresentation({ text: "A brief light crosses the night sky.", imageReady: true });
  assert.equal(art.hidden, true);
  assert.equal(f.nodes.find(node => node.className === "event-qte-story").textContent,
    "A brief light crosses the night sky.");
  f.api.updatePresentation({ imageReady: false });
  assert.equal(art.hidden, false);
  f.api.destroy();
});

test("physical actions remain justified even when retained narrative or artwork refreshes", async () => {
  for (const language of ["en", "fr"]) {
    const f = await fixture("coins", language);
    const action = f.nodes.find(node => node.className === "event-qte-action");
    const text = action.textContent;
    assert.match(text, language === "en" ? /tosses.*catch/ : /lance.*rattraper/);
    f.api.updatePresentation({ text: language === "en" ? "A passer-by offers a few coins." :
      "Un passant vous offre quelques pièces.", imageReady: true });
    assert.equal(action.textContent, text);
    f.tick(reactionCue(eventChallenge(f.event), 0).endMs);
    assert.match(f.nodes.find(node => node.className === "event-qte-result").textContent,
      language === "en" ? /coins slip/ : /pièces vous échappent/);
    f.api.destroy();
  }
});

test("each successful social signal advances a distinct line, refreshes preserve it, and mistakes leave a narrative impression", async () => {
  for (const language of ["en", "fr"]) for (const kind of ["encouragement", "friendlyAdvice", "stranger", "dogMakesFriend"]) {
    const f = await fixture(kind, language, { event: { id: 1, opportunity: 1, kind,
      qte: { version: 2, status: "ready", fatigue: 100, health: 0 } } });
    const rules = eventChallenge(f.event), dialogue = f.nodes.find(node => node.className === "event-qte-dialogue");
    assert.equal(dialogue.hidden, false);
    for (const [index, key] of rules.keys.entries()) {
      f.tick(reactionCue(rules, index).startMs + 50);
      f.key(key);
      assert.equal(dialogue.children.length, index + 1);
      assert.ok(dialogue.children[index].textContent);
      f.api.updatePresentation({ text: "Retained context.", imageReady: true });
      assert.equal(dialogue.children.length, index + 1);
    }
    assert.equal(new Set(dialogue.children.map(line => line.textContent)).size, rules.keys.length);
    assert.equal(f.outcomes[0].outcome, "success");
    assert.match(f.nodes.find(node => node.className === "event-qte-result").textContent,
      language === "en" ? /warm impression/ : /impression chaleureuse/);
    f.api.destroy();

    const failed = await fixture(kind, language);
    failed.tick(950);
    failed.key(eventChallenge(failed.event).keys[0] === "Space" ? "ArrowLeft" : "Space");
    assert.equal(failed.nodes.find(node => node.className === "event-qte-dialogue").children.length, 0);
    assert.equal(failed.outcomes[0].outcome, "failure");
    assert.match(failed.nodes.find(node => node.className === "event-qte-result").textContent,
      language === "en" ? /poor impression/ : /mauvaise impression/);
    failed.api.destroy();
  }
});
test("every event uses the same reaction mechanic; wrong or premature input fails and held keys are ignored", async () => {
  for (const kind of ["forestBoar", "stars"]) {
    const f = await fixture(kind), rules = eventChallenge(f.event);
    f.tick(950);
    f.key(rules.keys[0], { repeat: true });
    f.key(rules.keys[0], { ctrlKey: true });
    assert.equal(f.outcomes.length, 0);
    rules.keys.forEach((key, index) => {
      f.tick(reactionCue(rules, index).startMs + 50);
      f.key(key);
    });
    assert.equal(f.outcomes[0].outcome, "success");
    f.api.destroy();
    const wrong = await fixture(kind);
    wrong.key(rules.keys[0]);
    assert.equal(wrong.outcomes[0].outcome, "failure");
    wrong.api.destroy();
  }
});
test("a missed cue fails without waiting for the end of the sequence", async () => {
  const f = await fixture();
  f.tick(reactionCue(eventChallenge(f.event), 0).endMs);
  assert.equal(f.outcomes[0].outcome, "failure");
  assert.equal(f.timers.size, 0);
  f.api.destroy();
});
test("deadline, skip and backgrounding settle once without rewards; restored active challenges cannot restart", async () => {
  for (const action of ["timeout", "skip", "hidden"]) {
    const f = await fixture();
    if (action === "timeout") f.tick(eventChallenge(f.event).durationMs);
    if (action === "skip") f.button("Skip challenge").click();
    if (action === "hidden") { f.doc.hidden = true; f.doc.dispatch("visibilitychange"); }
    assert.equal(f.outcomes[0].outcome, action === "skip" ? "skipped" : "failure");
    assert.equal(f.outcomes.length, 1);
    f.api.destroy();
  }
  const restored = await fixture("coins", "en", { event: { id: 1, opportunity: 1, kind: "coins",
    qte: { version: 1, status: "active", mode: "relaxed" } } });
  assert.deepEqual(restored.starts, []);
  assert.equal(restored.outcomes.length, 0);
  restored.button("Retry saving the result").click();
  assert.equal(restored.outcomes[0].outcome, "failure");
  restored.api.destroy();
});
test("save failures stay visible and result retries do not restart input or silently succeed", async () => {
  let attempts = 0;
  const f = await fixture("coins", "en", { settle() {
    if (++attempts === 1) throw new Error("Storage unavailable.");
    return true;
  } });
  f.tick(reactionCue(eventChallenge(f.event), 0).endMs);
  assert.equal(f.errors[0].message, "Storage unavailable.");
  assert.equal(f.button("Retry saving the result").hidden, false);
  f.button("Retry saving the result").click();
  assert.equal(attempts, 2);
  assert.equal(f.button("Retry saving the result").hidden, true);
  assert.equal(f.timers.size, 0);
  f.api.destroy();
  const blocked = await fixture("coins", "en", { begin() { throw new Error("Cannot save start."); } });
  assert.equal(blocked.errors[0].message, "Cannot save start.");
  assert.equal(blocked.timers.size, 0);
  blocked.api.destroy();
});
