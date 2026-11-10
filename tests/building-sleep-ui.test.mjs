import test from "node:test";
import assert from "node:assert/strict";
import { setupBuildingSleep } from "../building-sleep-ui.mjs";
import { translate } from "../i18n.mjs";

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
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  setAttribute(key, value) { this.attributes[key] = value; }
  remove() { this.parent.children = this.parent.children.filter(node => node !== this); }
  focus() {}
  showModal() { this.open = true; }
  close() { this.open = false; }
  click() { if (!this.disabled && !this.hidden) this.dispatch("click"); }
}
async function fixture(t, status = "ready", illustrations) {
  const original = globalThis.document, doc = new Target(), timers = new Set(), actions = [];
  doc.defaultView = Object.assign(new Target(), {
    performance: { now: () => 0 },
    setInterval(fn) { timers.add(fn); return fn; }, clearInterval(fn) { timers.delete(fn); },
  });
  doc.documentElement = { lang: "en" };
  doc.createElement = tag => new Element(tag, doc);
  doc.body = doc.createElement("body");
  const all = node => [node, ...node.children.flatMap(all)];
  doc.querySelector = selector => selector === "dialog[open]"
    ? all(doc.body).find(node => node.tagName === "dialog" && node.open) : null;
  globalThis.document = doc;
  const attempt = { col: 1, row: 1, startedMinutes: 0, outcome: "searching",
    qte: { version: 3, status, fatigue: 0, health: 100, ...(status === "active" ? { mode: "normal" } : {}) } };
  const state = { startedAt: 1, buildingSleepAttempts: [attempt] };
  const ui = setupBuildingSleep((key, args) => translate("en", key, args), {
    illustrations,
    context: () => ({ state, survival: { sleep_hours: 8 } }),
    act(action) {
      actions.push(action);
      if (action.kind === "building-sleep-begin") attempt.qte.status = "active";
      else { attempt.qte.status = "skipped"; attempt.outcome = "outside"; }
      queueMicrotask(() => ui.update());
      return true;
    },
  });
  t.after(() => { ui.reset(); globalThis.document = original; });
  ui.update();
  await Promise.resolve();
  return { ui, doc, state, actions, timers, attempt, dialog: doc.body.children[0],
    receipt: doc.body.children[1],
    button: text => all(doc.body).find(node => node.tagName === "button" && node.textContent === text),
    nodes: () => all(doc.body) };
}

test("successful shelter popup renders cached art and refreshes without reopening or blocking feedback", async t => {
  let notify;
  const calls = [];
  const illustrations = {
    subscribe(fn) { notify = fn; },
    render(...args) { calls.push(args); args[0].hidden = false; return false; },
  };
  const h = await fixture(t, "ready", illustrations);
  const searchCalls = calls.length;
  assert.ok(searchCalls > 0);
  assert.equal(calls[0][2], "shelter.building.search");
  assert.equal(calls[0][3], "building-search:0");
  h.attempt.outcome = "slept";
  h.attempt.qte.status = "success";
  h.ui.update();
  assert.equal(h.receipt.open, true);
  assert.equal(calls.length, searchCalls + 1);
  assert.equal(calls.at(-1)[2], "shelter.building.slept");
  assert.equal(calls.at(-1)[3], "building-sleep:0");
  const resultIllustration = calls.at(-1)[0];
  assert.ok(h.receipt.children.some(node => node.textContent === translate("en", "buildingSleepSuccess")));
  notify();
  assert.equal(calls.length, searchCalls + 2);
  h.button("Close").click();
  const closedCalls = calls.length;
  notify();
  assert.equal(h.receipt.open, false);
  assert.equal(calls.length, closedCalls + 1);
  h.ui.reset();
  assert.equal(resultIllustration.hidden, true);
});

test("ready search art replaces ASCII without restarting the QTE, and failure restores ASCII", async t => {
  let ready = false, notify;
  const illustrations = {
    subscribe(fn) { notify = fn; },
    render() { return ready; },
  };
  const h = await fixture(t, "ready", illustrations);
  const art = h.nodes().find(node => node.className === "event-qte-backdrop");
  assert.equal(art.hidden, false);
  assert.equal(h.actions.length, 1);
  ready = true;
  notify();
  assert.equal(art.hidden, true);
  assert.equal(h.actions.length, 1);
  assert.equal(h.timers.size, 1);
  ready = false;
  notify();
  assert.equal(art.hidden, false);
  assert.equal(h.actions.length, 1);
});

test("shelter modal locks closing until the result is saved and shows the five-point consequence", async t => {
  const h = await fixture(t);
  assert.equal(h.dialog.open, true);
  assert.equal(h.dialog.attributes["data-native-controls"], "");
  assert.equal(h.button("Continue the journey").disabled, true);
  let prevented = false;
  h.dialog.dispatch("cancel", { preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(h.dialog.open, true);
  h.button("Skip challenge").click();
  await Promise.resolve();
  assert.deepEqual(h.actions.map(action => action.kind), ["building-sleep-begin", "building-sleep-settle"]);
  assert.equal(h.actions[1].result.skipped, true);
  assert.equal(h.button("Continue the journey").disabled, false);
  assert.equal(h.receipt.open, true);
  assert.equal(h.receipt.className, "event-qte-receipt");
  assert.ok(h.nodes().some(node => node.textContent.includes("Vigilance: +5")));
  h.button("Close").click();
  assert.equal(h.receipt.open, false);
  h.ui.update();
  assert.equal(h.receipt.open, false);
  h.button("Continue the journey").click();
  h.dialog.dispatch("close");
  assert.equal(h.dialog.open, false);
  assert.equal(h.timers.size, 0);
});

test("an active saved shelter QTE cannot restart and must settle as failure", async t => {
  const h = await fixture(t, "active");
  assert.equal(h.actions.length, 0);
  assert.equal(h.button("Continue the journey").disabled, true);
  h.button("Retry saving the result").click();
  await Promise.resolve();
  assert.equal(h.actions.length, 1);
  assert.equal(h.actions[0].kind, "building-sleep-settle");
  assert.equal(h.actions[0].result.skipped, false);
  assert.deepEqual(h.actions[0].result.trace, []);
  assert.equal(h.button("Continue the journey").disabled, false);
  assert.equal(h.receipt.open, true);
});

test("a delayed close event cannot destroy a newly opened shelter attempt", async t => {
  const h = await fixture(t);
  h.button("Skip challenge").click();
  await Promise.resolve();
  h.button("Close").click();
  h.button("Continue the journey").click();
  h.state.buildingSleepAttempts.push({ ...h.attempt, col: 2, startedMinutes: 20,
    outcome: "searching", qte: { version: 3, status: "ready", fatigue: 0, health: 100 } });
  h.ui.show();
  await Promise.resolve();
  h.dialog.dispatch("close");
  assert.equal(h.dialog.open, true);
  assert.ok(h.button("Skip challenge"));
  assert.equal(h.timers.size, 1);
});

for (const [outcome, key] of [["slept", "buildingSleepSuccess"], ["interrupted", "buildingSleepInterrupted"]]) {
  test(`${outcome} opens a distinct feedback popup once, and reset closes it`, async t => {
    const h = await fixture(t);
    assert.equal(h.receipt.open, false);
    h.attempt.outcome = outcome;
    h.attempt.qte.status = outcome === "slept" ? "success" : "skipped";
    h.ui.update();
    assert.equal(h.dialog.open, true);
    assert.equal(h.receipt.open, true);
    assert.equal(h.receipt.children[0].textContent, translate("en", key));
    assert.equal(h.dialog.children.some(node => node.textContent === translate("en", key)), false);
    h.button("Close").click();
    h.ui.update();
    assert.equal(h.receipt.open, false);
    h.ui.reset();
    assert.equal(h.dialog.open, false);
    assert.equal(h.receipt.open, false);
  });
}
