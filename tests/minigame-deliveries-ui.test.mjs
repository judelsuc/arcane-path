import test from "node:test";
import assert from "node:assert/strict";
import { mount } from "../minigames/deliveries-ui.mjs";

class Element {
  constructor(doc, tag = "div") {
    this.ownerDocument = doc;
    this.tagName = tag;
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.listeners = new Map();
    this.textContent = "";
  }
  append(...nodes) { for (const n of nodes) { n.parent = this; this.children.push(n); } }
  replaceChildren(...nodes) {
    this.children.forEach(n => { n.parent = null; });
    this.children = [];
    this.append(...nodes);
  }
  setAttribute(k, v) { this.attributes[k] = v; }
  setPointerCapture(id) { this.capture = id; }
  addEventListener(k, fn) {
    if (!this.listeners.has(k)) this.listeners.set(k, new Set());
    this.listeners.get(k).add(fn);
  }
  removeEventListener(k, fn) { this.listeners.get(k)?.delete(fn); }
  dispatch(k, event = {}) {
    for (const fn of [...(this.listeners.get(k) ?? [])]) fn(event);
  }
  contains(el) { return el === this || this.children.some(n => n.contains(el)); }
  closest(tag) { return this.tagName === tag ? this : this.parent?.closest(tag); }
  querySelectorAll(tag) {
    return this.children.flatMap(n => [...(n.tagName === tag ? [n] : []), ...n.querySelectorAll(tag)]);
  }
  focus() { this.ownerDocument.activeElement = this; }
  remove() { this.parent.children = this.parent.children.filter(n => n !== this); this.parent = null; }
}
function setup(options = {}) {
  const timers = new Map(), outcomes = [];
  let time = 100, position = 0;
  const doc = new Element(null);
  doc.ownerDocument = doc;
  doc.hidden = false;
  doc.createElement = tag => new Element(doc, tag);
  doc.defaultView = {
    performance: { now: () => time },
    setInterval(fn) { const id = timers.size + 1; timers.set(id, fn); return id; },
    clearInterval(id) { timers.delete(id); },
  };
  const container = new Element(doc);
  const ui = mount(container, { onFinish: r => outcomes.push(r), ...options });
  const root = container.children[0];
  const find = (action, value) => root.querySelectorAll("button").find(b => b.dataset.action === action &&
    (value === undefined || b.dataset.value === String(value)));
  const click = (action, value) => {
    const target = find(action, value);
    assert.ok(target, `${action} ${value} exists`);
    if (!target.disabled) root.dispatch("click", { target });
  };
  const key = (value, repeat = false) => root.dispatch("keydown", {
    key: value, repeat, preventDefault() {},
  });
  const advance = elapsed => {
    while (elapsed > 0) {
      const step = Math.min(elapsed, 20);
      elapsed -= step;
      time += step;
      for (const tick of [...timers.values()]) tick();
    }
  };
  const text = el => [el.textContent, ...el.children.map(text)].join(" ");
  const houses = () => root.querySelectorAll("div").filter(el => el.className === "delivery-house");
  const manifest = () => {
    const found = [];
    houses().forEach((house, cell) => {
      const label = house.children.find(el => el.className === "delivery-house-label");
      if (label) found[label.textContent.charCodeAt(0) - 65] = cell;
    });
    return found;
  };
  const ride = keyName => {
    key(keyName);
    advance(625);
    doc.dispatch("keyup", { key: keyName });
  };
  const rideTo = cell => {
    const grid = 3 + Math.floor((options.level ?? 0) / 2);
    let x = position % grid, y = Math.floor(position / grid);
    while (x < cell % grid) { ride("ArrowRight"); x++; }
    while (x > cell % grid) { ride("ArrowLeft"); x--; }
    while (y < Math.floor(cell / grid)) { ride("ArrowDown"); y++; }
    while (y > Math.floor(cell / grid)) { ride("ArrowUp"); y--; }
    position = cell;
  };
  const bike = () => root.querySelectorAll("span").find(el => el.className?.includes("delivery-bike"));
  return { ui, doc, root, timers, outcomes, container, find, click, key, advance,
    rideTo, manifest, houses, bike, text: () => text(root) };
}

test("bilingual memory, original graphics, no coordinates, free riding and Space deliveries", () => {
  for (const language of ["fr", "en"]) {
    const h = setup({ language });
    assert.equal(h.timers.size, 0);
    h.click("start");
    const targets = h.manifest();
    assert.equal(targets.length, 4);
    assert.equal(h.houses().length, 9);
    assert.equal(h.root.querySelectorAll("span").filter(el =>
      el.className === "delivery-art delivery-art-house").length, 8);
    assert.ok(h.bike());
    assert.doesNotMatch(h.text(), /[A-E][1-5]/);
    h.key("r");
    assert.equal(h.manifest().length, 0);
    assert.match(h.text(), language === "en" ? /Parcel in hand: A/ : /Colis en main: A/);
    targets.forEach((cell, parcel) => {
      h.key(String(parcel + 1));
      h.rideTo(cell);
      assert.equal(h.houses()[cell].dataset.near, "true");
      h.key(" ");
      const deliveredLabel = h.houses()[cell].children.find(el => el.className === "delivery-house-label");
      assert.equal(deliveredLabel.dataset.delivered, "true");
      assert.match(deliveredLabel.textContent, /✓/);
      assert.match(h.houses()[cell].attributes["aria-label"], language === "en" ? /delivered/ : /livré/);
    });
    assert.equal(h.outcomes.length, 1);
    assert.equal(h.outcomes[0].completed, true);
    assert.ok(h.outcomes[0].score > 0);
    assert.ok(h.outcomes[0].distance > 0);
    assert.equal(h.timers.size, 0);
    h.ui.destroy();
    h.ui.destroy();
    assert.equal(h.outcomes.length, 1);
    assert.equal(h.container.children.length, 0);
    assert.equal(h.root.listeners.get("keydown").size, 0);
    assert.equal(h.doc.listeners.get("keyup").size, 0);
    assert.equal(h.doc.listeners.get("visibilitychange").size, 0);
  }
});

test("top-row and numpad physical keys select parcels, including the sixth; undelivered labels stay hidden", () => {
  const h = setup({ level: 4, language: "en" });
  h.click("start");
  const targets = h.manifest();
  h.click("ready");
  const physicalKey = code => h.root.dispatch("keydown", { key: "Unidentified", code, preventDefault() {} });
  physicalKey("Digit6");
  assert.match(h.text(), /Parcel in hand: F/);
  h.rideTo(targets[5]);
  h.key(" ");
  assert.equal(h.find("parcel", 5).disabled, true);
  assert.equal(h.houses()[targets[5]].children.find(el => el.className === "delivery-house-label").dataset.delivered, "true");
  physicalKey("Numpad2");
  assert.match(h.text(), /Parcel in hand: B/);
  const labels = h.houses().flatMap(house => house.children.filter(el => el.className === "delivery-house-label"));
  assert.equal(labels.length, 1);
  physicalKey("Numpad6");
  assert.match(h.text(), /Parcel in hand: B/);
  h.ui.destroy();
});

test("Chariot marks its home parcel in memory, shows only an optional faint route, and scales earnings not score", () => {
  const h = setup({ language: "en", resonance: true });
  h.click("start");
  const targets = h.manifest();
  const homeParcel = h.houses()[targets[0]].children.find(el => el.className === "delivery-house-label");
  assert.match(h.text(homeParcel), /HOME/);
  assert.match(h.text(), /parcel marked HOME/i);
  h.click("ready");
  assert.equal(h.houses().flatMap(house =>
    house.children.filter(el => el.className === "delivery-house-label")).length, 0);
  const hint = h.find("home-route");
  assert.ok(hint);
  assert.match(h.text(hint), /Space 3 s/);
  h.root.dispatch("keydown", { key: "Tab",
    preventDefault() { assert.fail("Tab must retain focus navigation"); } });
  h.key(" ");
  h.advance(2999);
  assert.match(h.text(), /Hold Space : 3.0 \/ 3 s/);
  assert.equal(h.find("home-route").attributes["aria-pressed"], "false");
  h.advance(1);
  const route = h.root.querySelectorAll("span").find(el => el.className === "delivery-home-route");
  assert.equal(route.hidden, false);
  assert.equal(route.style.opacity, "0.24");
  assert.equal(h.find("home-route").attributes["aria-pressed"], "true");
  assert.match(h.text(), /Route home: shown/);
  h.key(" ", true);
  h.advance(3000);
  assert.equal(h.find("home-route").attributes["aria-pressed"], "true");
  h.doc.dispatch("keyup", { key: " ", preventDefault() {} });
  h.key(" ");
  h.advance(3000);
  assert.equal(h.find("home-route").attributes["aria-pressed"], "false");
  h.doc.dispatch("keyup", { key: " ", preventDefault() {} });
  h.click("home-route");
  assert.equal(h.find("home-route").attributes["aria-pressed"], "true");
  assert.match(h.text(), /parcel assignments stay hidden/i);
  h.key(" ");
  h.advance(1000);
  h.root.dispatch("focusout", { relatedTarget: null });
  h.advance(2000);
  h.doc.dispatch("keyup", { key: " ", preventDefault() {} });
  assert.equal(h.find("home-route").attributes["aria-pressed"], "true");
  targets.forEach((cell, parcel) => {
    h.key(String(parcel + 1));
    h.rideTo(cell);
    if (parcel === 0) {
      h.key(" ");
      h.advance(3000);
      h.doc.dispatch("keyup", { key: " ", preventDefault() {} });
      assert.equal(h.outcomes.length, 0);
      assert.equal(h.find("parcel", 0).disabled, false);
    }
    h.key(" ");
    assert.equal(h.outcomes.length, 0);
    h.doc.dispatch("keyup", { key: " ", preventDefault() {} });
  });
  assert.equal(h.outcomes.length, 1);
  assert.equal(h.outcomes[0].completed, true);
  assert.equal(h.outcomes[0].earningsMultiplier, 1.1);
  assert.ok(h.outcomes[0].score <= h.outcomes[0].maxScore);
  h.ui.destroy();
});

test("board never teleports the bike or accepts remote delivery; frame updates preserve DOM", () => {
  const h = setup({ language: "en" });
  h.click("start");
  h.click("ready");
  const bike = h.bike(), left = bike.style.left;
  const remote = h.houses()[8];
  h.root.dispatch("click", { target: remote });
  h.key(" ");
  assert.equal(h.bike().style.left, left);
  assert.match(h.text(), /Mistakes: 0/);
  h.key("ArrowRight");
  h.advance(200);
  assert.equal(h.bike(), bike);
  assert.notEqual(bike.style.left, left);
  // Between the two houses, outside either delivery radius.
  h.advance(100);
  assert.equal(h.houses().some(el => el.dataset.near === "true"), false);
  h.key(" ");
  assert.match(h.text(), /Mistakes: 0/);
  h.doc.dispatch("keyup", { key: "ArrowRight" });
  const stopped = h.bike().style.left;
  h.advance(100);
  assert.equal(h.bike().style.left, stopped);
  h.ui.destroy();
});

test("holding touchscreen controls rides; release, capture loss and focus loss stop movement", () => {
  const h = setup();
  h.click("start");
  h.click("ready");
  const arrow = h.find("steer", "ArrowRight");
  h.root.dispatch("pointerdown", { target: arrow, button: 0, pointerId: 3, preventDefault() {} });
  h.advance(200);
  assert.equal(arrow.capture, 3);
  h.doc.dispatch("pointerup", { pointerId: 3 });
  const stopped = h.bike().style.left;
  h.advance(200);
  assert.equal(h.bike().style.left, stopped);
  h.root.dispatch("pointerdown", { target: arrow, button: 0, pointerId: 4, preventDefault() {} });
  h.root.dispatch("lostpointercapture", { pointerId: 4 });
  h.advance(200);
  assert.equal(h.bike().style.left, stopped);
  h.key("ArrowRight");
  h.root.dispatch("focusout", { relatedTarget: null });
  h.advance(200);
  assert.equal(h.bike().style.left, stopped);
  h.ui.destroy();
});

test("wrong nearby deliveries fail on the third mistake, with audio feedback", () => {
  const sounds = [];
  const h = setup({ language: "en", audio: { play: value => sounds.push(value), stop() {} } });
  h.click("start");
  const targets = h.manifest();
  h.click("ready");
  h.rideTo(targets[1]);
  h.key(" ");
  assert.match(h.text(), /Wrong house/);
  h.key(" ", true);
  assert.match(h.text(), /Mistakes: 1/);
  h.click("deliver");
  h.key(" ");
  assert.equal(h.outcomes[0].completed, false);
  assert.equal(h.outcomes[0].score, 0);
  assert.deepEqual(sounds, ["caught", "caught", "caught"]);
  h.ui.destroy();
});

test("riding detours count in final distance and reduce score", () => {
  const h = setup({ language: "en", audio: { play() {}, stop() {} } });
  h.click("start");
  const targets = h.manifest();
  h.click("ready");
  for (let i = 0; i < 6; i++) { h.rideTo(8); h.rideTo(0); }
  targets.forEach((cell, parcel) => { h.click("parcel", parcel); h.rideTo(cell); h.click("deliver"); });
  assert.equal(h.outcomes[0].completed, true);
  assert.ok(h.outcomes[0].distance > 48);
  assert.ok(h.outcomes[0].score < 500);
  h.ui.destroy();
});

test("close, Escape, destroy and hidden-tab cancellation stop timers and report once", () => {
  for (const started of [false, true]) {
    for (const method of ["close", "escape", "destroy", "hidden"]) {
      const h = setup();
      if (started) { h.click("start"); h.click("ready"); }
      if (method === "close") h.click("cancel");
      if (method === "escape") h.key("Escape");
      if (method === "destroy") h.ui.destroy();
      if (method === "hidden") { h.doc.hidden = true; h.doc.dispatch("visibilitychange"); }
      if (!started && method === "hidden") {
        assert.equal(h.outcomes.length, 0);
        assert.equal(h.timers.size, 0);
        h.ui.destroy();
      }
      assert.equal(h.outcomes.length, 1, `${started} ${method}`);
      assert.equal(h.outcomes[0].cancelled, true);
      assert.equal(h.outcomes[0].completed, false);
      assert.equal(h.outcomes[0].score, 0);
      assert.equal(h.timers.size, 0);
      h.ui.destroy();
      h.doc.dispatch("visibilitychange");
      assert.equal(h.outcomes.length, 1);
    }
  }
});

test("clock automatically hides memory and times out with no reward at hard level", () => {
  const h = setup({ level: 4, language: "en" });
  h.click("start");
  assert.equal(h.manifest().length, 7);
  h.advance(9000);
  assert.equal(h.manifest().length, 0);
  const button = h.find("parcel", 0);
  button.focus();
  h.advance(200);
  assert.equal(h.doc.activeElement, button);
  h.advance(100000);
  assert.equal(h.outcomes.length, 1);
  assert.equal(h.outcomes[0].score, 0);
  assert.match(h.text(), /Time is up/);
  assert.equal(h.timers.size, 0);
  h.ui.destroy();
});

test("route countdown is prominent, warns in the last ten seconds and fails at the deadline", () => {
  const h = setup({ language: "en" });
  h.click("start");
  h.click("ready");
  const timer = h.root.querySelectorAll("p").find(element => element.className === "delivery-countdown");
  assert.equal(timer.attributes.role, "timer");
  assert.equal(timer.textContent, "Seconds left: 60");
  h.advance(50000);
  assert.equal(timer.textContent, "Seconds left: 10");
  assert.equal(timer.dataset.urgent, "true");
  h.advance(9980);
  assert.equal(h.outcomes.length, 0);
  h.advance(20);
  assert.equal(h.outcomes[0].completed, false);
  assert.equal(h.outcomes[0].score, 0);
  assert.match(h.text(), /Time is up/);
  h.ui.destroy();
});

test("invalid mount parameters are rejected", () => {
  assert.throws(() => mount(null), /Invalid/);
  assert.throws(() => setup({ level: -1 }), /Invalid/);
  assert.throws(() => setup({ onFinish: "bad" }), /Invalid/);
});
