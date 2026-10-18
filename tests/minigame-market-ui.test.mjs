import test from "node:test";
import assert from "node:assert/strict";
import { mount } from "../minigames/market-ui.mjs";
import { createGame } from "../minigames/market.mjs";
import { marketArt, moneyArt } from "../minigames/market-art.mjs";
import { createMarketAudio } from "../minigames/market-audio.mjs";

class Events {
  handlers = new Map();
  addEventListener(name, fn) {
    if (!this.handlers.has(name)) this.handlers.set(name, new Set());
    this.handlers.get(name).add(fn);
  }
  removeEventListener(name, fn) { this.handlers.get(name)?.delete(fn); }
  emit(name, event = {}) { for (const fn of [...(this.handlers.get(name) ?? [])]) fn(event); }
}
class Element extends Events {
  constructor(tag, doc) {
    super();
    this.tagName = tag.toUpperCase();
    this.ownerDocument = doc;
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.className = "";
    this.text = "";
  }
  set textContent(value) { this.text = String(value); this.replaceChildren(); }
  get textContent() { return this.text + this.children.map(node => node.textContent).join(" "); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  append(...nodes) { for (const node of nodes) { node.parentElement = this; this.children.push(node); } }
  replaceChildren(...nodes) {
    for (const node of this.children) node.parentElement = null;
    this.children = [];
    this.append(...nodes);
  }
  querySelectorAll(tag) {
    return this.children.flatMap(node => [...(node.tagName.toLowerCase() === tag ? [node] : []), ...node.querySelectorAll(tag)]);
  }
  focus() { this.ownerDocument.activeElement = this; }
  remove() {
    if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(node => node !== this);
    this.parentElement = null;
  }
}
function harness(t, options = {}) {
  let now = 0, nextId = 0;
  const timers = new Map(), finishes = [], cues = [];
  const view = new Events();
  view.performance = { now: () => now };
  view.setInterval = fn => { timers.set(++nextId, fn); return nextId; };
  view.clearInterval = id => timers.delete(id);
  const doc = new Events();
  doc.defaultView = view;
  doc.hidden = false;
  doc.createElement = tag => new Element(tag, doc);
  doc.createElementNS = (_namespace, tag) => doc.createElement(tag);
  const container = doc.createElement("div");
  const audio = { play: cue => cues.push(cue), stop: () => cues.push("stop"), unlock: () => cues.push("unlock") };
  t.mock.method(Math, "random", () => 0);
  const api = mount(container, { language: "en", ...options, audio, onFinish: value => finishes.push(value) });
  t.after(() => api.destroy());
  const root = container.children[0];
  const buttons = () => root.querySelectorAll("button");
  const button = text => buttons().find(node => node.textContent === text);
  const click = text => {
    const node = button(text);
    assert.ok(node, `Missing ${text}`);
    assert.ok(!node.disabled, `Disabled ${text}`);
    node.emit("click");
  };
  const field = name => root.querySelectorAll("input").find(node => node.name === name);
  const edit = (name, value) => {
    const node = field(name);
    assert.ok(node, `Missing input ${name}`);
    node.value = String(value);
    node.focus();
    node.emit("input");
  };
  const submit = () => root.querySelectorAll("form")[0].emit("submit", { preventDefault() {} });
  return { api, doc, view, container, root, timers, finishes, cues, click, button, field, edit, submit,
    tick(ms) { now += ms; for (const callback of [...timers.values()]) callback(); },
  };
}

test("market UI starts explicitly, uses original art, keeps fields/focus stable and returns exact change", t => {
  const h = harness(t);
  assert.equal(h.timers.size, 0);
  assert.equal(h.root.querySelectorAll("form").length, 0);
  h.click("Start");
  assert.equal(h.timers.size, 1);
  assert.ok(h.root.querySelectorAll("svg").length >= 10);
  const apple = h.field("apple");
  h.edit("apple", 1);
  h.tick(1000);
  assert.equal(h.field("apple"), apple);
  assert.equal(h.doc.activeElement, apple);
  h.edit("egg", 1);
  h.submit();
  assert.equal(h.cues.filter(cue => cue === "pick").length, 2);
  assert.ok(h.field("change"));
  const oldForm = apple.parentElement.parentElement.parentElement;
  oldForm.emit("submit", { preventDefault() {} });
  assert.ok(h.field("change"));
  const coin = h.root.querySelectorAll("button").find(node => node.getAttribute("aria-label") === "Add 2.00 €");
  coin.emit("click");
  assert.equal(h.field("change").value, "2.00");
  h.click("Clear change");
  assert.equal(h.field("change").value, "0.00");
  h.edit("change", "2.90");
  h.submit();
  assert.ok(h.field("apple"));
  assert.equal(h.finishes.length, 0);
});

test("Justice UI balances with add/remove weights and updates actual packed price", t => {
  const h = harness(t, { dailyCard: "justice" });
  assert.match(h.root.textContent, /Arcane resonance/);
  const image = h.root.querySelectorAll("img")[0];
  assert.equal(image.src, "/public/tarot/justice.jpg");
  assert.equal(image.getAttribute("aria-hidden"), "true");
  assert.equal(image.parentElement.className, "arcane-backdrop");
  const backdropStyle = h.root.querySelectorAll("style")[0].textContent;
  assert.match(backdropStyle, /object-fit:cover/);
  assert.match(backdropStyle, /transform:scale\(1\.25\)/);
  assert.match(backdropStyle, /filter:blur\(14px\)/);
  assert.match(backdropStyle, /overflow:hidden/);
  h.click("Start");
  assert.equal(h.field("apple"), undefined);
  assert.match(h.root.textContent, /0 \/ 250 g/);
  h.click("+ 200 g");
  h.click("+ 100 g");
  assert.match(h.root.textContent, /300 \/ 250 g/);
  h.click("− 50 g");
  assert.match(h.root.textContent, /250 \/ 250 g · Balanced/);
  h.edit("egg", 1);
  assert.match(h.root.textContent, /Fictional total: 2.10/);
  h.submit();
  assert.ok(h.field("change"));
  h.edit("change", "2.90");
  h.submit();
  assert.equal(h.field("change"), undefined);
  assert.ok(h.field("apple"));
  assert.equal(h.root.querySelectorAll("button").some(node => node.dataset.grams), false);
});

test("French market uses decimal commas for totals, prices, cash and denominations", t => {
  const h = harness(t, { language: "fr" });
  h.click("Commencer");
  assert.match(h.root.textContent, /1,25 €/);
  assert.match(h.root.textContent, /Total fictif: 0,00 €/);
  h.edit("apple", 1);
  h.edit("egg", 1);
  assert.match(h.root.textContent, /Total fictif: 2,10 €/);
  h.submit();
  assert.match(h.root.textContent, /Total fictif: 2,10 € · Somme fictive reçue: 5,00 €/);
  const coin = h.root.querySelectorAll("button").find(node => node.getAttribute("aria-label") === "Ajouter 2,00 €");
  assert.ok(coin);
  coin.emit("click");
  assert.equal(h.field("change").value, "2,00");
  h.edit("change", "2,90");
  h.submit();
  assert.equal(h.finishes.length, 0);
});

test("change input shows 5,05 euros for 505 cents and rejects malformed or overprecise amounts", t => {
  const h = harness(t, { language: "fr" });
  h.click("Commencer");
  h.edit("apple", 1);
  h.edit("egg", 1);
  h.submit();
  h.edit("change", "5,00");
  const coin = h.root.querySelectorAll("button").find(node => node.getAttribute("aria-label") === "Ajouter 0,05 €");
  coin.emit("click");
  assert.equal(h.field("change").value, "5,05");
  for (const amount of ["5,005", "5.005", "-1", "1e2", "", "1,2.3", "1000,01"]) {
    h.edit("change", amount);
    h.submit();
    assert.match(h.root.textContent, /Montant invalide/);
    assert.ok(h.field("change"));
  }
  h.edit("change", "2.9");
  h.submit();
  assert.equal(h.field("change"), undefined);
});

test("cash slots show limited stock, reserve/remove/clear it and preserve chosen denominations", t => {
  const h = harness(t);
  h.click("Start");
  h.edit("apple", 1);
  h.edit("egg", 1);
  h.submit();
  const coin = cents => h.root.querySelectorAll("button").find(node => node.getAttribute("aria-label") === `Add ${(cents / 100).toFixed(2)} €`);
  assert.equal(coin(1).disabled, true);
  assert.match(h.root.textContent, /Cash drawer/);
  coin(200).emit("click");
  assert.equal(h.field("change").value, "2.00");
  h.click("Remove 2.00 €");
  assert.equal(h.field("change").value, "0.00");
  for (let i = 0; i < 3; i++) coin(200).emit("click");
  assert.equal(coin(200).disabled, true);
  h.click("Clear change");
  assert.equal(coin(200).disabled, false);
  coin(200).emit("click");
  for (let i = 0; i < 4; i++) coin(20).emit("click");
  coin(10).emit("click");
  assert.equal(h.field("change").value, "2.90");
  assert.match(h.root.textContent, /Prepared change: 2.90/);
  h.submit();
  assert.ok(h.field("apple"));
  h.edit("bread", 1);
  h.edit("cheese", 1);
  h.submit();
  const slot = coin(50).parentElement;
  assert.match(slot.textContent, /7 available · 0 selected/);
  assert.match(coin(20).parentElement.textContent, /7 available · 0 selected/);
});

test("requesting extra coins can be refused or accepted, updates tender and never submits change on Enter", t => {
  const h = harness(t);
  h.click("Start");
  h.edit("apple", 1);
  h.edit("egg", 1);
  h.submit();
  h.edit("extra", "0.15");
  h.click("Ask for extra coins");
  assert.match(h.root.textContent, /customer does not have/);
  assert.match(h.root.textContent, /Mistakes: 0\/3/);
  h.edit("extra", "0.10");
  h.field("extra").emit("keydown", { key: "Enter", preventDefault() {} });
  assert.match(h.root.textContent, /customer agrees/);
  assert.match(h.root.textContent, /Fictional cash received: 5.10/);
  assert.match(h.root.textContent, /Prepared change: 0.00/);
  assert.match(h.root.textContent, /Mistakes: 0\/3/);
  h.edit("change", "3.00");
  h.submit();
  assert.ok(h.field("apple"));
  assert.equal(h.finishes.length, 0);
});

test("extra-amount buttons adjust by exactly five cents without asking or submitting, bounded from zero to five euros", t => {
  for (const language of ["fr", "en"]) {
    const h = harness(t, { language });
    h.click(language === "fr" ? "Commencer" : "Start");
    h.edit("apple", 1);
    h.edit("egg", 1);
    h.submit();
    const separator = language === "fr" ? "," : ".";
    const plus = `+ 0${separator}05 €`, minus = `− 0${separator}05 €`;
    h.click(minus);
    assert.equal(h.field("extra").value, `0${separator}00`);
    h.click(plus);
    h.click(plus);
    h.click(plus);
    assert.equal(h.field("extra").value, `0${separator}15`);
    h.click(minus);
    assert.equal(h.field("extra").value, `0${separator}10`);
    assert.equal(h.field("change").value, `0${separator}00`);
    assert.equal(h.finishes.length, 0);
    h.edit("extra", `4${separator}95`);
    h.click(plus);
    h.click(plus);
    assert.equal(h.field("extra").value, `5${separator}00`);
    h.edit("extra", "oops");
    h.click(plus);
    assert.equal(h.field("extra").value, "oops");
    assert.match(h.root.textContent, language === "fr" ? /Montant invalide/ : /Invalid amount/);
  }
});

test("all difficulty levels finish normal and resonant UI shifts with one terminal callback", t => {
  for (let level = 0; level < 5; level++) for (const resonance of [false, true]) {
    const h = harness(t, { level, resonance });
    const game = createGame({ level, resonance, random: () => 0 });
    h.click("Start");
    for (const order of game.orders) {
      for (const line of order.lines) {
        if (line.grams) for (let mass = 0; mass < line.grams; mass += 50) h.click("+ 50 g");
        else h.edit(line.id, line.quantity);
      }
      h.submit();
      h.edit("change", (order.changeCents / 100).toFixed(2));
      h.submit();
    }
    assert.equal(h.finishes.length, 1);
    assert.equal(h.finishes[0].completed, true);
    assert.equal(h.finishes[0].earningsMultiplier, resonance ? 1.1 : 1);
    assert.equal(h.timers.size, 0);
    assert.equal(h.button("Start").disabled, true);
    h.api.destroy();
    assert.equal(h.finishes.length, 1);
    assert.equal(h.container.children.length, 0);
  }
});

test("invalid values are explicit; timeout, hidden tab, Escape and destroy clean up", t => {
  const h = harness(t, { resonance: true });
  h.click("Start");
  h.edit("egg", "");
  assert.match(h.root.textContent, /Invalid value/);
  h.tick(180000);
  assert.equal(h.finishes.length, 1);
  assert.equal(h.finishes[0].completed, false);
  assert.equal(h.finishes[0].earningsMultiplier, 1);
  assert.equal(h.timers.size, 0);
  for (const ending of ["hidden", "escape", "destroy"]) {
    const run = harness(t);
    run.click("Start");
    if (ending === "hidden") { run.doc.hidden = true; run.doc.emit("visibilitychange"); }
    else if (ending === "escape") run.root.emit("keydown", { key: "Escape", preventDefault() {} });
    else run.api.destroy();
    assert.equal(run.finishes.length, 1);
    assert.equal(run.finishes[0].cancelled, true);
    assert.equal(run.timers.size, 0);
    assert.equal([...run.doc.handlers.values()].reduce((sum, set) => sum + set.size, 0), 0);
    assert.equal([...run.view.handlers.values()].reduce((sum, set) => sum + set.size, 0), 0);
  }
});

test("all produce illustrations differ and money distinguishes coins and notes", () => {
  const doc = { createElementNS: (_ns, tag) => new Element(tag, doc) };
  const drawings = ["apple", "bread", "carrot", "cheese", "egg", "honey", "pear", "tomato", "basket"]
    .map(kind => marketArt(doc, kind));
  assert.equal(new Set(drawings.map(node => JSON.stringify(node.children.map(child => child.attributes)))).size, 9);
  assert.ok(drawings.every(node => node.getAttribute("aria-hidden") === "true"));
  assert.equal(moneyArt(doc, 200).children[0].tagName, "ELLIPSE");
  assert.equal(moneyArt(doc, 500).children[0].tagName, "RECT");
  assert.throws(() => marketArt(doc, "unknown"), RangeError);
  assert.throws(() => moneyArt(doc, -1), RangeError);
});

test("market audio cues use shared mute, stop and explicit error reporting", async () => {
  const errors = [], reports = [], voices = [];
  const context = {
    state: "running", currentTime: 0, destination: {},
    createOscillator() {
      const voice = { frequency: {}, connect() {}, disconnect() { this.disconnected = true; },
        start() {}, stop() { this.stopped = true; } };
      voices.push(voice);
      return voice;
    },
    createGain() {
      return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {}, disconnect() {} };
    },
  };
  const audio = createMarketAudio({ createContext: () => context });
  await audio.unlock();
  for (const cue of ["pick", "coin", "basket", "serve", "mistake", "complete", "failed"]) await audio.play(cue);
  assert.equal(voices.length, 7);
  audio.enable(false);
  assert.ok(voices.every(voice => voice.disconnected && voice.stopped));
  await audio.play("pick");
  assert.equal(voices.length, 7);
  assert.throws(() => audio.play("unknown"), RangeError);
  const blocked = createMarketAudio({
    createContext() { throw new Error("Audio blocked"); },
    onError: message => errors.push(message), report: (...args) => reports.push(args),
  });

  test("journey market copy describes a score-based shift instead of future reward integration", t => {
    const h = harness(t, { journey: true });
    assert.match(h.root.textContent, /Market stall/);
    assert.match(h.root.textContent, /Journey reward depends on your score/);
    assert.doesNotMatch(h.root.textContent, /fictional exercise|future integration/i);
  });
  await blocked.play("pick");
  assert.deepEqual(errors, ["Audio blocked"]);
  assert.equal(reports[0][0], "Market sound playback failed:");
});
