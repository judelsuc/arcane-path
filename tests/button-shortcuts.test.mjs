import test from "node:test";
import assert from "node:assert/strict";
import { buttonBindings, shortcutCode, setupButtonShortcuts } from "../button-shortcuts.mjs";

test("fixed shortcuts and dynamic menu options have distinct keys in each dialog", () => {
  const buttons = [{ close: true }, ...["town-refresh", "town-services", "town-music"]
    .map(id => ({ id })), ...Array.from({ length: 25 }, () => ({}))];
  const bindings = buttonBindings(buttons);
  assert.equal(new Set(bindings.map(b => b.key)).size, buttons.length);
  assert.equal(bindings[0].key, "Escape");
  assert.equal(bindings[1].key, "U");
  assert.equal(bindings[4].key, "1");
  assert.deepEqual(buttonBindings(buttons), bindings);
});

test("spatial and native game controls do not consume automatic shortcut keys", () => {
  const controls = [...Array.from({ length: 64 }, () => ({ native: true })),
    { id: "equipment-close" }, { id: "equipment-rotate" }];
  assert.deepEqual(buttonBindings(controls).map(b => b.key), ["Escape", "R"]);
  assert.equal(buttonBindings([{ id: "equipment-travel" }])[0].key, "V");
});

test("native game buttons have live hover/focus tooltips without allocating or stealing keys", t => {
  const original = { document: globalThis.document, window: globalThis.window,
    MutationObserver: globalThis.MutationObserver, innerWidth: globalThis.innerWidth };
  t.after(() => Object.assign(globalThis, original));
  class Element {
    attributes = new Map(); children = []; style = {}; hidden = false;
    title = ""; textContent = ""; isConnected = true; offsetWidth = 100; offsetHeight = 20;
    hasAttribute(name) { return this.attributes.has(name); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    setAttribute(name, value) { this.attributes.set(name, value); }
    removeAttribute(name) { this.attributes.delete(name); }
    append(child) { child.parentElement = this; this.children.push(child); }
    contains(child) { return this === child || this.children.some(node => node.contains(child)); }
    closest(selector) {
      if (selector === "button") return this === button ? this : null;
      if (selector === "dialog") return this === host || this === button ? host : null;
      return null;
    }
    querySelectorAll() { return this.children.filter(child => child === button); }
    getBoundingClientRect() { return { top: 100, left: 50 }; }
  }
  const body = new Element(), main = new Element(), host = new Element(), button = new Element();
  button.textContent = "Start";
  host.setAttribute("data-native-controls", "");
  host.append(button);
  body.append(main); body.append(host);
  const events = {}, doc = { body, activeElement: button,
    createElement: () => new Element(),
    querySelector: selector => selector === "main" ? main : null,
    querySelectorAll: selector => selector.startsWith("dialog") ? [host] : [],
    addEventListener: (type, callback) => { events[type] = callback; } };
  let refresh;
  Object.assign(globalThis, { document: doc, window: { addEventListener() {} }, innerWidth: 500,
    MutationObserver: class {
      constructor(callback) { refresh = () => callback([{ target: host }]); }
      observe() {}
    } });
  setupButtonShortcuts(() => { throw new Error("Native controls must not allocate shortcut captions."); });
  assert.equal(button.title, "Start");
  assert.equal(button.children.length, 0);
  assert.equal(button.hasAttribute("aria-keyshortcuts"), false);
  const tooltip = body.children.find(child => child.id === "button-tooltip");
  events.pointerover({ target: button });
  assert.equal(tooltip.textContent, "Start");
  assert.equal(tooltip.hidden, false);
  assert.equal(tooltip.parentElement, host, "tooltip belongs to the active modal top layer");
  assert.equal(button.getAttribute("aria-describedby"), "button-tooltip");
  events.pointerout();
  assert.equal(tooltip.hidden, true);
  assert.equal(button.getAttribute("aria-describedby"), null);
  button.textContent = "Commencer";
  refresh();
  events.focusin({ target: button });
  assert.equal(tooltip.textContent, "Commencer");
  button.setAttribute("aria-label", "Steer left");
  refresh();
  assert.equal(button.title, "Steer left");
  button.title = "An authored detailed hint";
  refresh();
  assert.equal(button.title, "An authored detailed hint");
  events.keydown({ key: "ArrowLeft", code: "ArrowLeft", target: button,
    preventDefault() { assert.fail("Native game keys must pass through"); } });
});

test("directions, reveal, rhythm and photo controls retain meaningful bindings", () => {
  for (const [button, expected] of [
    [{ move: "0,-1" }, "ArrowUp"], [{ id: "birth-tarot-draw" }, "D"],
    [{ id: "birth-tarot-continue" }, "Enter"], [{ id: "music-tap" }, "Space"],
    [{ id: "previous-photo" }, "ArrowLeft"], [{ id: "audio-toggle" }, "M"],
    [{ id: "open-options" }, "K"], [{ id: "search-place" }, "G"],
    [{ id: "use-location" }, "V"], [{ id: "back-title" }, "Escape"],
    [{ id: "cancel-place" }, "Z"],
    [{ id: "theft-start" }, "Enter"], [{ id: "theft-grab" }, "Space"],
    [{ id: "journey-event-continue" }, "Enter"],
    [{ id: "open-controls" }, "?"],
    [{ id: "open-journal" }, "A"],
    [{ id: "journal-previous" }, "ArrowLeft"], [{ id: "journal-next" }, "ArrowRight"],
  ]) assert.equal(buttonBindings([button])[0].key, expected);
  assert.throws(() => buttonBindings(Array.from({ length: 37 }, () => ({}))), /Too many/);
});

test("hidden conversation action sources retain direct keys only while the map toolbar is active", t => {
  const original = { document: globalThis.document, window: globalThis.window,
    MutationObserver: globalThis.MutationObserver };
  t.after(() => Object.assign(globalThis, original));
  const sources = { dataset: { shortcutSources: "travel-toolbar" } };
  const toolbar = { hidden: false, inert: false,
    getClientRects() { return this.hidden ? [] : [{}]; },
    closest() { return this.hidden || this.inert ? this : null; } };
  const keys = { "sleep-travel": "H", "eat-travel": "E", "open-town": "T",
    "open-earn-money": "B", "open-journey-world": "6" };
  const buttons = Object.keys(keys).map(id => ({
    id, dataset: {}, parentElement: sources, hidden: false, disabled: false, clicks: 0,
    title: "", childNodes: [{ textContent: id }], caption: null, inert: false,
    hasAttribute() { return false; },
    setAttribute() {},
    querySelector() { return this.caption; },
    append(node) { this.caption = node; this.childNodes.push(node); },
    getClientRects() { return []; },
    closest(selector) {
      if (selector === "form" || selector === "#travel-toolbar") return null;
      if (selector === "[inert]") return this.inert ? this : null;
      if (selector === "[hidden]") return this.hidden ? this : sources;
      return null;
    },
    click() { this.clicks++; },
  }));
  const main = { hasAttribute: () => false, querySelectorAll: () => buttons };
  const events = {};
  Object.assign(globalThis, {
    document: { body: { append() {} },
      createElement: () => ({ setAttribute() {}, style: {} }),
      querySelector: () => main, querySelectorAll: () => [],
      getElementById: id => id === "travel-toolbar" ? toolbar : null,
      addEventListener: (name, callback) => { events[name] = callback; } },
    window: { addEventListener() {} },
    MutationObserver: class { observe() {} },
  });
  setupButtonShortcuts((key, args) => args?.action ?? key);
  function press(key) {
    let prevented = false;
    events.keydown({ key, code: /^\d$/.test(key) ? `Digit${key}` : `Key${key}`,
      target: { closest: () => null }, preventDefault() { prevented = true; },
      stopImmediatePropagation() {} });
    return prevented;
  }
  for (const button of buttons) {
    assert.equal(press(keys[button.id]), true, button.id);
    assert.equal(button.clicks, 1);
    button.disabled = true;
    assert.equal(press(keys[button.id]), false);
    button.disabled = false;
    button.hidden = true;
    assert.equal(press(keys[button.id]), false);
    button.hidden = false;
    button.inert = true;
    assert.equal(press(keys[button.id]), false);
    button.inert = false;
    toolbar.hidden = true;
    assert.equal(press(keys[button.id]), false);
    toolbar.hidden = false;
    toolbar.inert = true;
    assert.equal(press(keys[button.id]), false);
    toolbar.inert = false;
    assert.equal(button.clicks, 1);
  }
  sources.dataset.shortcutSources = "missing-toolbar";
  assert.equal(press("J"), false);
  delete sources.dataset.shortcutSources;
  assert.equal(press("J"), false, "ordinary hidden buttons cannot be activated");
});

test("single keys follow the keyboard layout and retain the legacy Alt+Shift alias", () => {
  const event = { altKey: true, shiftKey: true, code: "KeyS", key: "Í" };
  assert.equal(shortcutCode(event), "S");
  assert.equal(shortcutCode({ ...event, code: "Digit1" }), "1");
  assert.equal(shortcutCode({ ...event, code: "Enter" }), "Enter");
  for (const change of [{ shiftKey: false }, { ctrlKey: true }, { metaKey: true }, { code: "Tab" }]) {
    assert.equal(shortcutCode({ ...event, ...change }), null);
  }
  assert.equal(shortcutCode({ key: "j", code: "KeyJ" }), "J");
  assert.equal(shortcutCode({ key: "a", code: "KeyQ" }), "A");
  assert.equal(shortcutCode({ key: "J", code: "KeyJ", shiftKey: true }), "J");
  assert.equal(shortcutCode({ key: "1", code: "Digit1" }), "1");
  assert.equal(shortcutCode({ key: "ArrowUp", code: "ArrowUp" }), "ArrowUp");
  assert.equal(shortcutCode({ key: "j", code: "KeyJ", ctrlKey: true }), null);
  assert.equal(shortcutCode({ key: "j", code: "KeyJ", isComposing: true }), null);
  assert.equal(shortcutCode({ key: "?", code: "Slash", shiftKey: true }), "?");
  assert.equal(shortcutCode({ key: "?", code: "Comma", shiftKey: true }), "?");
  assert.equal(shortcutCode({ key: "?", code: "Slash", ctrlKey: true }), null);
});

test("cell services and clue forms keep stable, non-conflicting action keys", () => {
  const cellIds = ["cell-buy", "cell-rest", "cell-sleep", "cell-music", "cell-clues",
    "choice-forage", "choice-beg", "choice-steal"];
  const cell = buttonBindings(cellIds.map(id => ({ id })));
  assert.equal(new Set(cell.map(b => b.key)).size, cellIds.length);
  for (const [toolbar, menu] of [["eat-travel", "cell-buy"], ["rest-travel", "cell-rest"],
    ["sleep-travel", "cell-sleep"], ["open-music", "cell-music"], ["open-trail", "cell-clues"]]) {
    assert.equal(buttonBindings([{ id: toolbar }])[0].key, buttonBindings([{ id: menu }])[0].key);
  }
  const clues = ["clue-discuss", "clue-photo", "clue-letter", "clue-search",
    "clue-buy", "clue-guestbook", "clue-ticket", "clue-directions"];
  const original = new Map(buttonBindings(clues.map(id => ({ id }))).map(b => [b.button.id, b.key]));
  assert.equal(new Set(original.values()).size, clues.length);
  for (const id of clues) assert.equal(buttonBindings([{ id }])[0].key, original.get(id));
  assert.equal(buttonBindings([{ id: "clue-investigate" }])[0].key, "F");
  assert.equal(buttonBindings([{ id: "clue-field-search" }])[0].key, "F");
});

test("conversation topics and expanded cell actions retain unique shortcuts within each popup", () => {
  for (const ids of [
    ["cell-buy", "cell-rest", "cell-sleep", "cell-earn-money", "cell-clues", "cell-town",
      "cell-conversation", "cell-transport", "cell-hint", "cell-equipment", "cell-wash", "cell-dog",
      "cell-journal", "cell-notebooks", "cell-photo", "cell-save", "choice-forage"],
    ["conversation-close", "conversation-parent", "conversation-clues", "conversation-notebooks",
      "conversation-artifacts", "conversation-shelter", "conversation-food", "conversation-work",
      "conversation-transport", "conversation-town"],
  ]) {
    const keys = buttonBindings(ids.map(id => ({ id }))).map(binding => binding.key);
    assert.equal(new Set(keys).size, ids.length);
  }
  assert.equal(buttonBindings([{ id: "open-conversation" }])[0].key, "G");
  assert.equal(buttonBindings([{ id: "open-journey-world" }])[0].key, "6");
});
