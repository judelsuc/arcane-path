import test from "node:test";
import assert from "node:assert/strict";
import { setupPursuit } from "../pursuit-ui.mjs";
import { beginPursuit, advancePursuit, beginPursuitEscape, settlePursuitEscape, pursuitDifficulty } from "../pursuit.mjs";
import { escapeRoute } from "./helpers/pursuit-route.mjs";

class Target {
  listeners = new Map();
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  }
  dispatch(type, data = {}) { for (const fn of this.listeners.get(type) ?? []) fn(data); }
}
class Element extends Target {
  children = []; dataset = {}; attributes = {}; hidden = false; open = false; disabled = false; textContent = "";
  constructor(tag, doc) { super(); this.tagName = tag.toUpperCase(); this.ownerDocument = doc; }
  append(...nodes) { nodes.forEach(node => { node.parent = this; this.children.push(node); }); }
  after(node) { this.parent.append(node); }
  setAttribute(key, value) { this.attributes[key] = value; }
  showModal() { this.open = true; this.opens = (this.opens ?? 0) + 1; }
  close() { this.open = false; this.dispatch("close"); }
  focus() { this.ownerDocument.focused = this; }
  click() { if (!this.disabled && !this.hidden) this.dispatch("click"); }
  getContext() {
    return this.canvasContext ??= {
      rotations: [], texts: [], save() {}, restore() {}, translate() {},
      rotate(angle) { this.rotations.push(angle); },
      fillText(value) { this.texts.push(String(value)); },
      fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, fill() {},
    };
  }
}
function fixture(status = "ready", lang = "en") {
  const doc = new Target(), timers = new Set(), actions = [];
  let time = 0, fail = "", state = advancePursuit({
    ...beginPursuit({ col: 10, row: 10, elapsedMinutes: 0, startedAt: 1, ended: null,
      health: 100, fatigue: 0, awakeHours: 0 }),
    elapsedMinutes: 2340,
  }, { terrain: "forest" });
  if (status === "active") state = beginPursuitEscape(state, "normal");
  doc.documentElement = { lang };
  doc.defaultView = Object.assign(new Target(), {
    performance: { now: () => time },
    setInterval(fn) { timers.add(fn); return fn; }, clearInterval(fn) { timers.delete(fn); },
  });
  doc.createElement = tag => new Element(tag, doc);
  doc.body = doc.createElement("body");
  const anchor = doc.createElement("p"); anchor.id = "needs-warning"; doc.body.append(anchor);
  const all = node => [node, ...node.children.flatMap(all)];
  doc.querySelector = selector => all(doc.body).find(node => selector === "dialog[open]"
    ? node.tagName === "DIALOG" && node.open : `#${node.id}` === selector) ?? null;
  const current = { busy: false, otherPending: false };
  const ui = setupPursuit({ doc,
    context: () => ({ ...current, state }),
    act(action) {
      actions.push(action);
      if (fail) throw new Error(fail);
      state = action.type === "begin" ? beginPursuitEscape(state, action.mode) : settlePursuitEscape(state, action.result);
      return true;
    },
  });
  const button = text => all(doc.body).find(node => node.tagName === "BUTTON" && node.textContent === text);
  const dialog = doc.body.children.find(node => node.className === "pursuit-dialog");
  const feedback = () => dialog.children.find(node => node.attributes.role === "status");
  const uiKey = (key, extra = {}) => dialog.dispatch("keydown", {
    key, preventDefault() {}, stopPropagation() {}, ...extra,
  });
  return { ui, doc, button, dialog, current, actions, feedback, key: uiKey, timers,
    get state() { return state; }, set state(value) { state = value; },
    fail(message) { fail = message; },
    advance(ms) {
      const end = time + ms;
      while (time < end) { time += Math.min(1000 / 60, end - time); for (const fn of [...timers]) fn(); }
    },
  };
}

for (const language of ["en", "fr"]) {
  test(`${language} pursuit warns briefly, waits for other dialogs, starts on its own and imposes the pace`, async () => {
    const h = fixture("ready", language);
    h.current.otherPending = true;
    h.ui.update();
    assert.equal(h.dialog.open, false);
    const status = h.doc.querySelector("#pursuit-status");
    assert.match(status.textContent, language === "en" ? /must escape/ : /devez fuir/);
    h.current.otherPending = false;
    h.ui.update();
    assert.equal(h.dialog.open, true);
    const canvas = h.dialog.children.find(node => node.tagName === "CANVAS");
    assert.match(canvas.attributes["aria-label"], language === "en" ? /weather data unavailable/ : /météo indisponible/);
    assert.equal(h.dialog.children.find(node => node.tagName === "SELECT"), undefined,
      "no pace selector: the game decides");
    assert.equal(h.dialog.children.filter(node => node.tagName === "P" && !node.attributes.role).length, 0,
      "no intro paragraphs: directions live inside the game view");
    await Promise.resolve();
    assert.equal(h.state.pursuit.pending.mode, "normal",
      "a healthy traveller is imposed the normal pace without pressing anything");
    assert.equal(h.state.pursuit.pending.status, "active");
    assert.equal(h.button(language === "en" ? "Start escape" : "Commencer la fuite").hidden, true,
      "no start button: the escape begins after the countdown");
    h.advance(100);
    const texts = canvas.getContext().texts;
    assert.ok(texts.includes("3"), "the countdown is drawn in the game view");
    assert.ok(texts.some(line => line.includes(language === "en" ? "jump" : "aute")),
      "short directions are drawn in the game view");
    h.ui.reset();
  });

  test(`${language} a weakened traveller is imposed the slower pace and told so in the game view`, async () => {
    const h = fixture("ready", language);
    h.state = { ...h.state, pursuit: { ...h.state.pursuit, pending: {
      ...h.state.pursuit.pending,
      difficulty: pursuitDifficulty({ health: 30, fatigue: 80, awakeHours: 20 }, 2),
    } } };
    assert.ok(h.state.pursuit.pending.difficulty.modifier > 0, "weak condition raises the modifier");
    h.ui.update();
    await Promise.resolve();
    assert.equal(h.state.pursuit.pending.mode, "accessible",
      "weak condition imposes the slower course");
    h.advance(100);
    const canvas = h.dialog.children.find(node => node.tagName === "CANVAS");
    assert.ok(canvas.getContext().texts.some(line =>
      language === "en" ? /Careful pace/.test(line) : /prudente/.test(line)),
    "the imposed pace is announced in the game view");
    h.ui.reset();
  });
}

test("three-second preparation waits for held movement keys and Help pauses the exact simulation", async () => {
  const h = fixture();
  h.doc.dispatch("keydown", { key: "ArrowRight" });
  h.ui.update();
  await Promise.resolve();
  const canvas = h.dialog.children.find(node => node.tagName === "CANVAS");
  h.advance(3500);
  assert.ok(canvas.getContext().texts.some(line => /Release held keys/.test(line)),
    "the release prompt is drawn in the game view");
  h.doc.dispatch("keyup", { key: "ArrowRight" });
  h.advance(1000);
  const before = h.feedback().textContent;
  h.button("Help / pause").click();
  h.advance(10000);
  assert.equal(h.feedback().textContent, before);
  h.key(" ");
  h.button("Resume").click();
  h.advance(1000);
  assert.notEqual(h.feedback().textContent, before);
  assert.equal(h.actions.length, 1);
  h.ui.reset();
});

test("night, fog and rain are announced and rendered; Help and reduced motion stop weather movement", async () => {
  const h = fixture();
  h.state.pursuit.pending.atmosphere = {
    version: 1, phase: "night", precipitation: "storm", fog: "dense", seed: 123,
  };
  const canvas = h.dialog.children.find(node => node.tagName === "CANVAS"), ctx = canvas.getContext();
  let rain = [];
  ctx.fillRect = function(x, y, width, height) {
    if (this.fillStyle === "#263f4c" && width === 640 && height === 320) rain = [];
    if (this.fillStyle.startsWith("rgba(188,214,222") && width === 1) rain.push([x, y]);
  };
  h.ui.update();
  assert.match(canvas.attributes["aria-label"], /night.*heavy rain.*dense fog/);
  const initial = structuredClone(rain);
  assert.equal(initial.length, 128);
  await Promise.resolve();
  h.advance(3500);
  assert.notDeepEqual(rain, initial);
  h.button("Help / pause").click();
  const paused = structuredClone(rain);
  h.advance(10000);
  assert.deepEqual(rain, paused);
  h.button("Resume").click();
  h.doc.defaultView.matchMedia = () => ({ matches: true });
  h.advance(500);
  const still = structuredClone(rain);
  h.advance(500);
  assert.deepEqual(rain, still);
  h.ui.reset();
});

test("legacy escapes have no retroactively generated atmosphere", async () => {
  const h = fixture();
  h.state.pursuit.pending.version = 5;
  delete h.state.pursuit.pending.atmosphere;
  h.ui.update();
  const canvas = h.dialog.children.find(node => node.tagName === "CANVAS");
  assert.doesNotMatch(canvas.attributes["aria-label"], /Atmosphere/);
  await Promise.resolve();
  h.advance(100);
  assert.ok(canvas.getContext().texts.some(line => line.includes("Difficulty 1/10")));
  h.ui.reset();
});

test("a pending escape opens after another modal closes without requiring a blocked action", async () => {
  const h = fixture();
  const other = h.doc.createElement("dialog"); h.doc.body.append(other); other.showModal();
  h.ui.update();
  assert.equal(h.dialog.open, false);
  other.close();
  h.doc.dispatch("close");
  await Promise.resolve();
  assert.equal(h.dialog.open, true);
  h.ui.reset();
});

test("failure saving the start reveals the fallback button; result retry saves the same attempt without restarting", async () => {
  const h = fixture();
  h.fail("Storage is full");
  h.ui.update();
  await Promise.resolve();
  assert.equal(h.timers.size, 0);
  assert.equal(h.state.pursuit.pending.status, "ready");
  assert.match(h.feedback().textContent, /Storage is full/);
  const start = h.button("Start escape");
  assert.equal(start.hidden, false, "the start button only appears as a save-failure fallback");
  h.fail(""); start.click();
  assert.equal(start.hidden, true);
  h.fail("Storage is full");
  h.doc.hidden = true;
  h.doc.dispatch("visibilitychange");
  assert.equal(h.state.pursuit.pending.status, "active");
  assert.equal(h.button("Retry saving the result").hidden, false);
  const first = h.actions.at(-1).result;
  const image = h.dialog.children.find(node => node.tagName === "IMG");
  assert.equal(image.hidden, true, "capture must be saved before showing the face");
  h.fail(""); h.button("Retry saving the result").click();
  assert.equal(h.state.ended, "captured");
  assert.deepEqual(h.actions.at(-1).result, first);
  assert.equal(h.button("Continue").disabled, false);
  assert.equal(image.hidden, false);
  assert.match(image.src, /public\/pursuit-capture\.png$/);
  assert.equal(h.dialog.children.find(node => node.tagName === "CANVAS").hidden, true);
  h.ui.reset();
  assert.equal(image.hidden, true);
});

test("restored active attempts cannot replay; they must persist capture before continuing", async () => {
  const h = fixture("active");
  h.ui.update();
  await Promise.resolve();
  assert.equal(h.button("Start escape").hidden, true);
  assert.equal(h.button("Continue").disabled, true);
  assert.equal(h.timers.size, 0);
  assert.equal(h.actions.length, 0, "a restored attempt never begins again on its own");
  h.button("Retry saving the result").click();
  assert.equal(h.state.ended, "captured");
  assert.equal(h.actions.length, 1);
  h.ui.reset();
});

test("three stumbles show a static capture portrait; a missing image reports an explicit error", async () => {
  for (const missing of [false, true]) {
    const h = fixture();
    h.doc.defaultView.matchMedia = () => ({ matches: true });
    h.ui.update();
    const image = h.dialog.children.find(node => node.tagName === "IMG");
    if (missing) image.dispatch("error");
    await Promise.resolve();
    h.advance(15000);
    assert.equal(h.state.ended, "captured");
    assert.equal(h.state.pursuit.history[0].abandoned, false);
    assert.equal(image.hidden, missing);
    assert.equal(h.timers.size, 0, "capture portrait has no animation or flashes");
    if (missing) assert.match(h.feedback().textContent, /caught.*illustration could not be loaded/);
    h.ui.reset();
  }
});

test("a complete keyboard route succeeds in normal and slower mode without duplicate settlement", async () => {
  for (const [mode, level] of [["normal", 1], ["normal", 5], ["normal", 10],
    ["accessible", 3], ["accessible", 5], ["accessible", 10]]) {
    const h = fixture();
    if (level === 5) h.doc.defaultView.matchMedia = () => ({ matches: true });
    // Strong condition keeps modifier 0 (normal pace); a weakened traveller gets
    // modifier +2, which imposes the slower course and raises the level.
    const condition = mode === "accessible"
      ? { health: 20, fatigue: 80, awakeHours: 24 } : { health: 70, fatigue: 40, awakeHours: 12 };
    const completed = mode === "accessible" ? (level - 3) * 2 : (level - 1) * 2;
    h.state.pursuit.pending.difficulty = pursuitDifficulty(condition, completed);
    h.ui.update();
    const seed = h.state.pursuit.pending.seed;
    const plan = escapeRoute(seed, h.state.pursuit.pending.version, level);
    const jumpTicks = plan.transcript.jumps;
    assert.equal(plan.state.hits, 0, `planned route at level ${level}`);
    await Promise.resolve();
    h.advance(100);
    assert.ok(h.dialog.children.find(node => node.tagName === "CANVAS").getContext()
      .texts.some(line => line.includes(`Difficulty ${level}/10`)));
    h.advance(2901);
    const retrySuccess = mode === "normal" && level === 1;
    if (retrySuccess) h.fail("Storage is full");
    let ms = 0;
    for (const tick of jumpTicks) {
      const at = (tick - 1) * 1000 / 60 / (mode === "accessible" ? 0.65 : 1);
      h.advance(at - ms);
      h.key(" ");
      ms = at;
    }
    h.advance(4000);
    if (retrySuccess) {
      assert.equal(h.state.pursuit.pending.status, "active");
      assert.equal(h.timers.size, 0, "victory must not play until the result is saved");
      assert.equal(h.dialog.children.find(node => node.tagName === "CANVAS").getContext().rotations.length, 0);
      h.fail("");
      h.button("Retry saving the result").click();
      assert.deepEqual(h.actions.at(-1).result, h.actions.at(-2).result);
    }
    assert.equal(h.state.ended, null, mode);
    const image = h.dialog.children.find(node => node.tagName === "IMG");
    assert.equal(image.hidden, true);
    if (retrySuccess) {
      image.dispatch("error");
      assert.match(h.feedback().textContent, /boy escapes/);
    }
    assert.equal(h.state.pursuit.history[0]?.outcome, "escaped", mode);
    assert.match(h.feedback().textContent, /30 km/);
    assert.match(h.feedback().textContent, /trips and falls.*boy escapes/);
    const ticks = h.state.pursuit.history[0].ticks;
    if (level === 5) assert.equal(h.timers.size, 0, "reduced motion presents the final still without a timer");
    if (mode === "normal" && level === 10) {
      h.button("Continue").click();
      assert.equal(h.dialog.open, false);
      assert.equal(h.timers.size, 0);
      assert.equal(h.actions.filter(action => action.type === "settle").length, retrySuccess ? 2 : 1);
      h.ui.reset();
      continue;
    }
    h.ui.update(); h.advance(2600);
    const canvas = h.dialog.children.find(node => node.tagName === "CANVAS");
    assert.equal(canvas.getContext().rotations.at(-1), Math.PI / 2);
    assert.match(canvas.attributes["aria-label"], /boy escapes/);
    assert.equal(h.state.pursuit.history[0].ticks, ticks);
    assert.equal(h.timers.size, 0);
    assert.equal(h.actions.filter(action => action.type === "settle").length, retrySuccess ? 2 : 1);
    h.ui.reset();
  }
});
