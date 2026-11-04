import test from "node:test";
import assert from "node:assert/strict";
import { setupCafe } from "../cafe-ui.mjs";
import { cafeDifficulty } from "../cafe.mjs";
import { translate } from "../i18n.mjs";

for (const language of ["fr", "en"]) {
  test(`${language} cafe click/keyboard targets serve a shift, preserve focus, cancel once and clean timers`, async t => {
    const original = { document: globalThis.document, performance: globalThis.performance,
      setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval, random: Math.random };
    t.after(() => {
      Object.assign(globalThis, { document: original.document, performance: original.performance,
        setInterval: original.setInterval, clearInterval: original.clearInterval });
      Math.random = original.random;
    });
    class Element {
      children = []; events = {}; attributes = {}; dataset = {}; textContent = ""; disabled = false; value = ""; open = false;
      append(...children) { this.children.push(...children); }
      replaceChildren(...children) { this.children = children; }
      addEventListener(name, fn) { this.events[name] = fn; }
      setAttribute(name, value) { this.attributes[name] = value; }
      showModal() { this.open = true; }
      close() { this.open = false; this.events.close?.(); }
      focus() { globalThis.document.activeElement = this; }
      click() { if (!this.disabled) this.events.click?.(); }
    }
    const elements = new Map(), element = id => {
      if (!elements.has(id)) elements.set(id, new Element());
      return elements.get(id);
    };
    const events = {};
    globalThis.document = { hidden: false, activeElement: null,
      createElement: () => new Element(), addEventListener: (name, fn) => { events[name] = fn; },
      querySelector: id => id === "dialog[open]" ? [...elements.values()].find(e => e.open) : element(id) };
    let now = 0, tick, timers = 0, pending = false, settlements = [], starts = 0, stops = 0;
    const pickups = [];
    globalThis.performance = { now: () => now };
    globalThis.setInterval = fn => { tick = fn; timers++; return 1; };
    globalThis.clearInterval = () => { tick = undefined; timers--; };
    Math.random = () => 0;
    const current = { state: {}, cell: { terrain: "road",
      pois: [{ osmId: "node/1", name: "Cafe test", tags: { amenity: "cafe" } }] }, blocked: false };
    const ui = setupCafe((key, args) => translate(language, key, args), {
      audio: { start() { starts++; }, stop() { stops++; }, pickup(item) { pickups.push(item); } },
      context: () => ({ ...current, state: { cafePending: pending ? {} : null } }),
      begin() { pending = true; return cafeDifficulty({}); },
      settle(served, mistakes, cancelled) {
        pending = false;
        settlements.push({ served, mistakes, cancelled });
        return { served: cancelled ? 0 : served, orders: 5, mistakes, cancelled, rewardCents: cancelled ? 0 : served * 100, foodKcal: served ? 600 : 0 };
      },
    });
    ui.open();
    assert.equal(element("#cafe-dialog").open, true);
    assert.equal(element("#cafe-venue").children[0].textContent, "Cafe test");
    element("#cafe-start").click();
    assert.equal(timers, 1);
    assert.equal(starts, 1);
    assert.equal(element("#cafe-start").disabled, true);
    const firstButton = element("#cafe-orders").children[0];
    const focus = globalThis.document.activeElement;
    now = 200; tick();
    assert.equal(element("#cafe-orders").children[0], firstButton);
    assert.equal(globalThis.document.activeElement, focus);
    assert.match(firstButton.children[0].textContent, /(?:Coffee|Cafe|Café) x3/);
    const slots = [...element("#cafe-tray-art").children];
    assert.equal(slots.length, 5);
    for (let i = 0; i < 5; i++) {
      now = i * 6500 + 200;
      tick();
      for (let item = 0; item < 3 + i % 3; item++) element("#cafe-coffee").click();
      const sounds = pickups.length;
      element("#cafe-coffee").click();
      assert.equal(pickups.length, sounds);
      assert.deepEqual(element("#cafe-tray-art").children, slots);
      assert.equal(slots[0].children[1].textContent, String(3 + i % 3));
      assert.equal(slots[0].dataset.empty, "false");
      assert.equal(slots[1].children[1].textContent, "0");
      assert.match(element("#cafe-tray").textContent, new RegExp(`x${3 + i % 3}`));
      element("#cafe-serve").click();
      assert.equal(slots[0].children[1].textContent, "0");
      assert.equal(slots[0].dataset.empty, "true");
    }
    assert.deepEqual(settlements[0], { served: 5, mistakes: 0, cancelled: false });
    assert.equal(timers, 0);
    assert.equal(stops, 1);
    assert.equal(pickups.length, 19);
    assert.ok(pickups.every(item => item === "coffee"));
    assert.match(element("#cafe-result").textContent, /5\/5/);
    element("#cafe-start").click();
    globalThis.document.hidden = true;
    events.visibilitychange();
    assert.equal(timers, 0);
    assert.equal(settlements.length, 2);
    assert.equal(settlements[1].cancelled, true);
    assert.equal(stops, 2);
    ui.reset();
    assert.equal(settlements.length, 2);
    assert.equal(stops, 2);
    assert.equal(element("#cafe-dialog").open, false);
  });
}

for (const language of ["en", "fr"]) {
test(`${language} Temperance revised order is highlighted without changing the tray or blocking other customers`, t => {
  const original = { document: globalThis.document, performance: globalThis.performance,
    setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval, random: Math.random };
  t.after(() => {
    Object.assign(globalThis, { document: original.document, performance: original.performance,
      setInterval: original.setInterval, clearInterval: original.clearInterval });
    Math.random = original.random;
  });
  class Element {
    children = []; events = {}; attributes = {}; dataset = {}; style = {}; textContent = ""; className = "";
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    addEventListener(name, fn) { this.events[name] = fn; }
    setAttribute(name, value) { this.attributes[name] = value; }
    remove() { this.removed = true; }
    showModal() { this.open = true; }
    close() { this.open = false; this.events.close?.(); }
    click() { if (!this.disabled) this.events.click?.(); }
    focus() {}
  }
  let doc;
  const elements = new Map(), element = id => {
    if (!elements.has(id)) {
      const created = new Element();
      created.ownerDocument = doc;
      elements.set(id, created);
    }
    return elements.get(id);
  };
  doc = { hidden: false, documentElement: { lang: language }, createElement: () => {
    const created = new Element();
    created.ownerDocument = doc;
    return created;
  },
    addEventListener() {}, querySelector: id => id === "dialog[open]"
      ? [...elements.values()].find(e => e.open) : element(id) };
  globalThis.document = doc;
  let now = 0, tick, settled;
  globalThis.performance = { now: () => now };
  globalThis.setInterval = fn => { tick = fn; return 1; };
  globalThis.clearInterval = () => { tick = undefined; };
  Math.random = () => 0;
  const current = { state: {}, cell: { pois: [{ osmId: "node/1", name: "Cafe",
    tags: { amenity: "cafe" } }] }, blocked: false };
  const ui = setupCafe((key, args) => translate(language, key, args), {
    context: () => current,
    resonance: () => true,
    begin: () => ({ ...cafeDifficulty({}), resonance: true }),
    settle(served, mistakes, cancelled) {
      settled = { served, mistakes, cancelled };
      return { served, orders: 5, mistakes, cancelled, rewardCents: 0, foodKcal: 0 };
    },
  });
  ui.open();
  assert.match(element("#cafe-dialog").className, /arcane-resonance/);
  assert.ok(element("#cafe-dialog").children.some(child => child.className === "arcane-backdrop"));
  assert.match(element("#cafe-dialog .window-help-text").textContent, /20/);
  element("#cafe-start").click();
  now = 6500;
  tick();
  for (let i = 0; i < 2; i++) element("#cafe-coffee").click();
  const customers = element("#cafe-orders").children;
  assert.match(customers[0].className, /cafe-customer-changed/);
  assert.equal(customers[0].disabled, false);
  assert.equal(customers[1].disabled, false);
  assert.match(customers[0].children[0].textContent, /x4/);
  assert.match(customers[0].children[1].textContent, /(?:add|ajouter) 1/);
  assert.equal(customers[0].children[1].attributes["aria-live"], "polite");
  assert.match(element("#cafe-tray").textContent, /x2/);
  for (let i = 0; i < 2; i++) element("#cafe-coffee").click();
  element("#cafe-serve").click();
  assert.equal(customers[0].children[1].textContent, "");
  customers[1].click();
  assert.equal(element("#cafe-serve").disabled, false);
  for (let i = 0; i < 5; i++) element("#cafe-coffee").click();
  element("#cafe-serve").click();
  assert.equal(settled, undefined);
  assert.equal(customers[0].className, "cafe-customer");
  element("#cafe-dialog").close();
  assert.deepEqual(settled, { served: 2, mistakes: 0, cancelled: true });
  ui.reset();
});
}
