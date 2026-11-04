import test from "node:test";
import assert from "node:assert/strict";
import { mount } from "../minigames/bookshop-ui.mjs";
import { createGame, difficulty } from "../minigames/bookshop.mjs";

// Minimal DOM contract exercised by the real UI, with no browser/dependency setup.
class Events {
  handlers = new Map();
  addEventListener(name, fn) {
    if (!this.handlers.has(name)) this.handlers.set(name, new Set());
    this.handlers.get(name).add(fn);
  }
  removeEventListener(name, fn) { this.handlers.get(name)?.delete(fn); }
  emit(name, event = {}) { for (const fn of [...(this.handlers.get(name) ?? [])]) fn(event); }
  listenerCount() { return [...this.handlers.values()].reduce((count, items) => count + items.size, 0); }
}
class Element extends Events {
  constructor(tag, doc) {
    super();
    this.tagName = tag.toUpperCase();
    this.ownerDocument = doc;
    this.dataset = {};
    this.attributes = {};
    this.children = [];
    this.disabled = false;
    this.parentElement = null;
    this.text = "";
  }
  set textContent(value) { this.text = String(value); this.replaceChildren(); }
  get textContent() { return this.text + this.children.map(child => child.textContent).join(" "); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
  append(...items) { for (const item of items) { this.children.push(item); item.parentElement = this; } }
  replaceChildren(...items) {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    this.append(...items);
  }
  contains(element) { return element === this || this.children.some(child => child.contains(element)); }
  querySelectorAll(selector) {
    return this.children.flatMap(child => [...(child.tagName.toLowerCase() === selector ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  closest(selector) {
    return this.tagName.toLowerCase() === selector ? this : this.parentElement?.closest(selector) ?? null;
  }
  focus() { this.ownerDocument.activeElement = this; }
  remove() {
    if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this);
    this.parentElement = null;
  }
}
class Document extends Events {
  hidden = false;
  activeElement = null;
  createElement(tag) { return new Element(tag, this); }
  createElementNS(_namespace, tag) { return this.createElement(tag); }
}
function harness(t, options = {}) {
  let now = 1000, nextId = 0;
  const timers = new Map(), finishes = [];
  const doc = new Document();
  doc.hidden = Boolean(options.hidden);
  const container = doc.createElement("div");
  t.mock.method(performance, "now", () => now);
  t.mock.method(Math, "random", () => 0.3);
  t.mock.method(globalThis, "setInterval", callback => { timers.set(++nextId, callback); return nextId; });
  t.mock.method(globalThis, "clearInterval", id => { timers.delete(id); });
  const api = mount(container, { ...options, onFinish: value => { finishes.push(value); options.onFinish?.(value); } });
  const root = container.children[0];
  t.after(() => api.destroy());
  const find = (command, value) => root.querySelectorAll("button").find(button =>
    button.dataset.command === command && (value === undefined || button.dataset.value === String(value)));
  function click(command, value) {
    const target = find(command, value);
    assert.ok(target, `Missing button ${command} ${value}`);
    assert.equal(target.disabled, false, `Disabled button ${command} ${value}`);
    target.focus();
    root.emit("click", { target });
  }
  function key(key, extra = {}) {
    let prevented = false;
    root.emit("keydown", { key, preventDefault() { prevented = true; }, ...extra });
    return prevented;
  }
  return { api, doc, root, container, timers, finishes, find, click, key,
    game: createGame({ ...options, level: options.level ?? 0, language: options.language === "en" ? "en" : "fr", random: () => 0.3, now }),
    tick(ms) { now += ms; for (const fn of [...timers.values()]) fn(); },
    hide() { doc.hidden = true; doc.emit("visibilitychange"); },
    get now() { return now; },
  };
}
function sortByClick(h) {
  for (const book of h.game.books) {
    h.click("select", book.id);
    const position = h.game.shelves.indexOf(book.genre) * h.game.config.slots + alphabeticalSlot(h.game, book);
    h.click("place", position);
  }
}
function alphabeticalSlot(game, book) {
  return game.books.filter(item => item.genre === book.genre)
    .sort((a, b) => a.title[game.language].localeCompare(b.title[game.language], game.language, { sensitivity: "base", ignorePunctuation: true }))
    .findIndex(item => item.id === book.id);
}
function serveByClick(h) {
  for (const request of h.game.requests) {
    h.click("select", request.bookId);
    h.click("serve");
  }
}
function cleaned(h) {
  assert.equal(h.timers.size, 0);
  assert.equal(h.doc.listenerCount(), 0);
  assert.equal(h.root.listenerCount(), 0);
}

for (const language of ["en", "fr"]) {
  test(`Priestess UI ${language}: personal wish, explanatory reaction, persistent decoration and cleanup`, t => {
    const h = harness(t, { language, dailyCard: "priestess" });
    const decoration = () => h.root.children.filter(child => child.className === "arcane-banner");
    assert.equal(decoration().length, 1);
    assert.match(h.root.textContent, language === "en" ? /personal wish/ : /envie personnelle/);
    h.click("start");
    sortByClick(h);
    assert.match(h.root.textContent, language === "en" ? /escape from everyday life/ : /m’évader loin du quotidien/);
    assert.equal(decoration().length, 1);
    h.click("select", "book-2");
    h.click("serve");
    assert.match(h.root.textContent, language === "en" ? /pirate adventure takes me far/ : /aventure de pirates m’emporte/);
    for (const request of h.game.requests.slice(1)) {
      h.click("select", request.bookId);
      h.click("serve");
    }
    assert.equal(decoration().length, 1);
    assert.equal(h.finishes[0].earningsMultiplier, 1.1);
    assert.equal(h.finishes[0].score, h.game.maxScore);
    cleaned(h);
    h.api.destroy();
    assert.equal(h.finishes.length, 1);
    assert.equal(h.container.children.length, 0);
  });
}

test("Priestess teardown before start has no gain and removes resources", t => {
  const h = harness(t, { journeyCard: "priestess" });
  h.api.destroy();
  assert.equal(h.finishes[0].earningsMultiplier, 1);
  assert.equal(h.finishes[0].cancelled, true);
  cleaned(h);
});

for (let level = 0; level <= 4; level++) {
  test(`clickable level ${level}: explicit start, shelves, requests, perfect finish once and cleanup`, t => {
    const h = harness(t, { level, language: "en" });
    assert.match(h.root.textContent, /alphabetically/);
    assert.match(h.root.textContent, /Tab \/ Enter/);
    assert.equal(h.timers.size, 0);
    assert.equal(h.finishes.length, 0);
    assert.equal(h.find("select"), undefined);
    h.click("start");
    assert.equal(h.timers.size, 1);
    assert.match(h.root.textContent, new RegExp(`×${difficulty(level).rewardMultiplier}`));
    assert.equal(h.find("serve").disabled, true);
    assert.equal(h.root.querySelectorAll("fieldset").length, h.game.config.shelves);
    assert.equal(h.find("select").getAttribute("aria-pressed"), "false");
    sortByClick(h);
    assert.match(h.root.textContent, /Shelves ready/);
    assert.match(h.root.textContent, /Customer 1/);
    assert.equal(h.find("serve").disabled, false);
    assert.equal(h.root.querySelectorAll("button").filter(button =>
      button.dataset.command === "select" && !button.disabled).length, h.game.books.length);
    for (const [index, request] of h.game.requests.entries()) {
      assert.ok(h.root.textContent.includes(request.text.en));
      assert.ok(h.root.textContent.includes(`Customer ${index + 1}`));
      h.click("select", request.bookId);
      assert.equal(h.find("select", request.bookId).getAttribute("aria-pressed"), "true");
      h.click("serve");
    }
    assert.deepEqual(h.finishes, [{ completed: true, score: h.game.maxScore, maxScore: h.game.maxScore, cancelled: false, earningsMultiplier: 1 }]);
    assert.match(h.root.textContent, /Service complete/);
    assert.ok(h.root.querySelectorAll("p").some(element => element.getAttribute("aria-live") === "polite"));
    cleaned(h);
    h.tick(1000000);
    h.hide();
    h.key("Escape");
    h.api.destroy();
    h.api.destroy();
    assert.equal(h.finishes.length, 1);
    assert.equal(h.container.children.length, 0);
  });
}

test("full level 4 is playable with keyboard alone; shelf cursor is bounded and visible", t => {
  const h = harness(t, { level: 4 });
  assert.equal(h.root.lang, "fr");
  assert.match(h.root.textContent, /Commencer/);
  assert.equal(h.key("Tab"), false);
  assert.equal(h.key("s", { repeat: true }), false);
  assert.equal(h.key("s", { ctrlKey: true }), false);
  assert.equal(h.key("s", { metaKey: true }), false);
  assert.equal(h.key("s", { altKey: true }), false);
  assert.equal(h.key("s", { isComposing: true }), false);
  assert.equal(h.timers.size, 0);
  assert.equal(h.key("s"), true);
  h.key("s");
  assert.equal(h.timers.size, 1);
  h.key("ArrowLeft");
  h.key("ArrowUp");
  assert.equal(h.find("place", 0).getAttribute("aria-current"), "true");
  function selectBook(id) {
    for (let i = 0; i <= h.game.books.length; i++) {
      if (h.find("select", id).getAttribute("aria-pressed") === "true") return;
      h.key("b");
    }
    assert.fail(`Could not select ${id}`);
  }
  for (const book of h.game.books) {
    selectBook(book.id);
    for (let i = 0; i < 5; i++) { h.key("ArrowLeft"); h.key("ArrowUp"); }
    const row = h.game.shelves.indexOf(book.genre);
    for (let i = 0; i < row; i++) h.key("ArrowDown");
    const slot = alphabeticalSlot(h.game, book);
    for (let i = 0; i < slot; i++) h.key("ArrowRight");
    assert.equal(h.find("place", row * h.game.config.slots + slot).getAttribute("aria-current"), "true");
    h.key("p");
  }
  assert.match(h.root.textContent, /Rayons prêts/);
  for (const request of h.game.requests) {
    assert.ok(h.root.textContent.includes(request.text.fr));
    selectBook(request.bookId);
    h.key("r");
  }
  assert.equal(h.finishes.length, 1);
  assert.equal(h.finishes[0].completed, true);
  assert.equal(h.finishes[0].score, h.game.maxScore);
  cleaned(h);
});

test("visible wrong placement and missing selection feedback, mistakes and bounded failure", t => {
  const h = harness(t, { language: "en" });
  h.click("start");
  h.click("place", 0);
  assert.match(h.root.textContent, /Select a book first/);
  assert.match(h.root.textContent, /Mistakes: 1\/5/);
  const book = h.game.books[0];
  h.click("select", book.id);
  assert.match(h.root.textContent, /Book selected/);
  const position = ((h.game.shelves.indexOf(book.genre) + 1) % h.game.config.shelves) * h.game.config.slots;
  h.click("place", position);
  assert.match(h.root.textContent, /Wrong slot/);
  assert.match(h.root.textContent, /Mistakes: 2\/5/);
  for (let i = 0; i < 3; i++) h.click("place", position);
  assert.match(h.root.textContent, /too many mistakes/);
  assert.deepEqual(h.finishes, [{ completed: false, score: 0, maxScore: h.game.maxScore, cancelled: false, earningsMultiplier: 1 }]);
  cleaned(h);
});

test("incorrect customer choice keeps the same request; retry can still complete perfectly", t => {
  const h = harness(t, { language: "en" });
  h.click("start");
  sortByClick(h);
  h.click("select", h.game.books.find(book => book.id !== h.game.requests[0].bookId).id);
  h.click("serve");
  assert.match(h.root.textContent, /doesn't answer the request/);
  assert.ok(h.root.textContent.includes(h.game.requests[0].text.en));
  assert.match(h.root.textContent, /Customer 1\/2/);
  assert.match(h.root.textContent, /Mistakes: 1\/5/);
  assert.equal(h.finishes.length, 0);
  serveByClick(h);
  assert.equal(h.finishes[0].completed, true);
  cleaned(h);
});

test("timer updates remaining time without stealing button focus; exact deadline fails without reward", t => {
  const h = harness(t, { language: "en" });
  h.click("start");
  const book = h.game.books[0];
  h.click("select", book.id);
  const selectedNode = h.find("select", book.id);
  h.tick(1000);
  assert.match(h.root.textContent, /119 seconds/);
  assert.equal(h.doc.activeElement, h.find("select", book.id));
  assert.equal(h.find("select", book.id), selectedNode, "timer updates do not rebuild illustrated book cards");
  h.tick(h.game.config.durationMs - 1000);
  assert.match(h.root.textContent, /Time is up/);
  assert.deepEqual(h.finishes, [{ completed: false, score: 0, maxScore: h.game.maxScore, cancelled: false, earningsMultiplier: 1 }]);
  cleaned(h);
  h.tick(1000);
  assert.equal(h.finishes.length, 1);
});

test("bilingual original covers show titles, authors and themes, never genre labels or numbered answers", t => {
  for (const language of ["fr", "en"]) {
    const h = harness(t, { level: 4, language });
    h.click("start");
    const drawings = [];
    for (const book of h.game.books) {
      const card = h.find("select", book.id);
      assert.ok(card.textContent.includes(book.title[language]));
      assert.ok(card.textContent.includes(book.author));
      assert.ok(card.textContent.includes(book.summary[language]));
      assert.equal(card.children[0].children[1].tagName, "SVG");
      drawings.push(JSON.stringify(card.children[0].children[1].children.map(node => node.attributes)));
      assert.equal(card.getAttribute("aria-label"), `${book.title[language]} — ${book.author}. ${book.summary[language]}`);
      assert.doesNotMatch(card.textContent, /· [1-4]| — (Travel|Nature|Mystery|Poetry|Voyages|Mystères|Poésie)/);
      assert.equal(card.dataset.genre, undefined);
      assert.equal(card.dataset.slot, undefined);
    }
    assert.equal(new Set(drawings).size, 16);
  }
});

test("bookshop actions sound on selection, placement, service and mistakes; finish and cancel clean up", t => {
  const calls = [];
  const h = harness(t, { audio: {
    play: cue => calls.push(cue), stop: () => calls.push("stop"), unlock: () => calls.push("unlock"),
  } });
  h.click("start");
  assert.deepEqual(calls, ["unlock"]);
  h.click("place", 0);
  assert.equal(calls.at(-1), "mistake");
  h.click("select", h.game.books[0].id);
  assert.equal(calls.at(-1), "select");
  sortByClick(h);
  assert.equal(calls.filter(cue => cue === "place").length, h.game.books.length);
  serveByClick(h);
  assert.equal(calls.filter(cue => cue === "serve").length, h.game.requests.length - 1);
  assert.deepEqual(calls.slice(-2), ["stop", "complete"]);
  h.api.destroy();
  assert.equal(calls.at(-1), "stop", "reset or teardown also stops the completion cue");
});

for (const phase of ["before start", "sorting", "requests"]) {
  for (const mode of ["click", "keyboard", "hidden", "destroy"]) {
    test(`${mode} cancellation ${phase} forfeits reward, finishes once and removes all resources`, t => {
      const h = harness(t, { language: "en" });
      if (phase !== "before start") h.click("start");
      if (phase === "requests") sortByClick(h);
      if (mode === "click") h.click("cancel");
      if (mode === "keyboard") h.key("Escape");
      if (mode === "hidden") h.hide();
      if (mode === "destroy") h.api.destroy();
      assert.deepEqual(h.finishes, [{ completed: false, score: 0, maxScore: h.game.maxScore, cancelled: true, earningsMultiplier: 1 }]);
      cleaned(h);
      if (mode !== "destroy") assert.match(h.root.textContent, /Cancelled: no reward/);
      h.hide();
      h.tick(1000000);
      h.api.destroy();
      h.api.destroy();
      assert.equal(h.finishes.length, 1);
      assert.equal(h.container.children.length, 0);
    });
  }
}

test("mounting into a hidden document immediately cancels without a running timer", t => {
  const h = harness(t, { hidden: true });
  assert.equal(h.finishes.length, 1);
  assert.equal(h.finishes[0].cancelled, true);
  cleaned(h);
});

test("invalid mount options fail before creating listeners or nodes; unknown language falls back to French", t => {
  const doc = new Document(), container = doc.createElement("div");
  for (const level of [-1, 5, "1", NaN]) assert.throws(() => mount(container, { level }), RangeError);
  assert.throws(() => mount(null), TypeError);
  assert.throws(() => mount(container, { onFinish: 42 }), TypeError);
  assert.equal(container.children.length, 0);
  assert.equal(doc.listenerCount(), 0);
  const h = harness(t, { language: "zz" });
  assert.equal(h.root.lang, "fr");
  assert.match(h.root.textContent, /Commencer/);
});

test("unrelated clicks and input are ignored; stale detached controls cannot change state", t => {
  const h = harness(t);
  const outside = h.doc.createElement("button");
  outside.dataset.command = "start";
  h.root.emit("click", { target: outside });
  assert.equal(h.timers.size, 0);
  h.root.emit("click", { target: h.root });
  h.key("p");
  h.key("r");
  h.key("b");
  assert.equal(h.finishes.length, 0);
  const stale = h.find("start");
  h.click("start");
  h.root.emit("click", { target: stale });
  assert.equal(h.timers.size, 1);
  h.key("z");
  assert.equal(h.finishes.length, 0);
});

test("destroy cleans resources even if the host finish callback throws", t => {
  const h = harness(t, { onFinish() { throw new Error("host callback"); } });
  h.click("start");
  assert.throws(() => h.api.destroy(), /host callback/);
  assert.equal(h.container.children.length, 0);
  cleaned(h);
  h.api.destroy();
  assert.equal(h.finishes.length, 1);
});
