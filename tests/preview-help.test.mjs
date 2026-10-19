import test from "node:test";
import assert from "node:assert/strict";
import { setupPreviewHelp } from "../preview-help.mjs";
import { setupGameHelp } from "../game-help.mjs";
import { translate } from "../i18n.mjs";
import { readFile } from "node:fs/promises";

class Element {
  constructor(tagName, doc) {
    Object.assign(this, { tagName, ownerDocument: doc, nodeType: 1, children: [],
      className: "", id: "", textContent: "", hidden: false, open: false, listeners: new Map(), attributes: {} });
  }
  append(...nodes) {
    for (const node of nodes) { node.parentElement = this; this.children.push(node); }
  }
  prepend(node) { node.parentElement = this; this.children.unshift(node); }
  after(node) {
    node.parentElement = this.parentElement;
    this.parentElement.children.splice(this.parentElement.children.indexOf(this) + 1, 0, node);
  }
  replaceChildren(...nodes) {
    for (const node of this.children) node.parentElement = null;
    this.children = [];
    this.append(...nodes);
  }
  remove() {
    this.parentElement.children = this.parentElement.children.filter(node => node !== this);
    this.parentElement = null;
  }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  get isConnected() { return this.ownerDocument.body.contains(this); }
  matches(selectors) {
    return selectors.split(",").some(raw => {
      const selector = raw.trim();
      if (selector.startsWith(".")) return this.className.split(" ").includes(selector.slice(1));
      if (selector.startsWith("#")) return this.id === selector.slice(1);
      const attr = selector.match(/^\[data-i18n="([^"]+)"\]$/);
      return attr ? this.attributes["data-i18n"] === attr[1] : selector === this.tagName;
    });
  }
  querySelectorAll(selector) {
    return this.children.flatMap(node => [...(node.matches(selector) ? [node] : []), ...node.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector); }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  emit(type) {
    const event = { stopped: false, stopPropagation() { this.stopped = true; } };
    for (const fn of this.listeners.get(type) ?? []) fn(event);
    return event;
  }
  focus() { this.ownerDocument.activeElement = this; }
  showModal() { this.open = true; this.querySelector("button")?.focus(); }
  close() { this.open = false; this.emit("close"); }
}

function fixture(language = "en", legacy = false, gameMode = false) {
  let observer;
  const doc = {
    documentElement: { lang: language },
    createElement(tag) { return new Element(tag, this); },
    querySelector(selector) { return this.body.querySelector(selector); },
    querySelectorAll(selector) { return this.body.querySelectorAll(selector); },
    defaultView: { MutationObserver: class {
      constructor(callback) { observer = this; this.callback = callback; }
      observe() { this.active = true; }
      disconnect() { this.active = false; }
    } },
  };
  doc.body = doc.createElement("body");
  const main = doc.createElement("main");
  if (gameMode) main.id = "title-screen";
  const select = doc.createElement("select");
  select.id = "preview-level";
  main.append(select);
  doc.body.append(main);
  let host = main;
  if (legacy) {
    host = doc.createElement("dialog");
    host.id = "music-dialog";
    host.append(doc.createElement("h2"));
    doc.body.append(host);
  }
  const rules = doc.createElement("p");
  rules.className = gameMode ? "window-help-text" : "game-help-text";
  rules.textContent = "Rules with arrow keys and scoring.";
  const status = doc.createElement("p");
  status.textContent = "Your turn";
  status.setAttribute("role", "status");
  host.append(rules, status);
  const api = gameMode ? setupGameHelp(key => translate(doc.documentElement.lang, key), doc) : setupPreviewHelp(doc);
  const popup = doc.querySelector(".preview-help-dialog");
  const trigger = host.querySelector(".preview-help-button");
  return { doc, main, host, rules, status, api, popup, trigger, observer,
    update(target, addedNodes = [], removedNodes = []) {
      observer.callback([{ target, addedNodes, removedNodes }]);
    } };
}

test("English/French help hides only explanations, opens modally, closes and restores focus", () => {
  for (const language of ["en", "fr"]) {
    const f = fixture(language);
    assert.equal(f.rules.hidden, true);
    assert.equal(f.status.hidden, false);
    assert.equal(f.trigger.textContent, language === "fr" ? "Aide" : "Help");
    assert.equal(f.trigger.attributes["aria-haspopup"], "dialog");
    assert.equal(f.popup.open, false);
    f.trigger.emit("click");
    assert.equal(f.popup.open, true);
    assert.equal(f.doc.activeElement, f.popup.querySelector("button"));
    assert.equal(f.popup.querySelector("div").children[0].textContent, f.rules.textContent);
    assert.equal(f.popup.emit("keydown").stopped, true);
    assert.equal(f.popup.emit("keyup").stopped, true);
    f.popup.querySelector("button").emit("click");
    assert.equal(f.popup.open, false);
    assert.equal(f.doc.activeElement, f.trigger);
    f.api.destroy();
    assert.equal(f.observer.active, false);
    assert.equal(f.rules.hidden, false);
    assert.equal(f.doc.querySelector(".preview-help-dialog"), null);
    assert.equal(f.doc.querySelector(".preview-help-button"), null);
  }
});

test("rerendered game instructions and level changes refresh help without altering live state", () => {
  const f = fixture();
  const replacement = f.doc.createElement("p");
  replacement.className = "game-help-text";
  replacement.textContent = "Level 4 instructions";
  f.rules.remove();
  f.host.append(replacement);
  f.update(f.host, [replacement], [f.rules]);
  assert.equal(replacement.hidden, true);
  assert.equal(f.popup.querySelector("div").children[0].textContent, replacement.textContent);
  assert.equal(f.doc.querySelectorAll(".preview-help-button").length, 1);
  const note = f.doc.createElement("p");
  note.id = "preview-difficulty";
  note.textContent = "Expert difficulty";
  f.host.append(note);
  f.update(f.host, [note]);
  assert.equal(note.hidden, true);
  assert.equal(f.popup.querySelector("div").children.length, 2);
  note.textContent = "Easy difficulty";
  f.update(note);
  assert.equal(f.popup.querySelector("div").children[1].textContent, "Easy difficulty");
  const content = f.popup.querySelector("div").children[0];
  f.status.textContent = "Score 1";
  f.update(f.status);
  assert.equal(f.popup.querySelector("div").children[0], content, "game ticks do not rebuild help");
  assert.equal(f.status.hidden, false);
  f.api.destroy();
});

test("legacy modal games have their own reachable Help button and keep their dialog open", () => {
  const f = fixture("en", true);
  f.host.open = true;
  assert.equal(f.doc.querySelectorAll(".preview-help-button").length, 2);
  f.trigger.emit("click");
  assert.equal(f.host.open, true);
  assert.equal(f.popup.open, true);
  f.popup.close();
  assert.equal(f.host.open, true);
  assert.equal(f.doc.activeElement, f.trigger);
  f.api.destroy();
});

test("help preserves initially hidden source state and rejects missing preview hosts", () => {
  assert.throws(() => setupPreviewHelp({ querySelector: () => null }), TypeError);
  const f = fixture();
  const hidden = f.doc.createElement("p");
  hidden.className = "game-help-text";
  hidden.hidden = true;
  f.main.append(hidden);
  f.update(f.main, [hidden]);
  f.api.destroy();
  assert.equal(hidden.hidden, true);
});

test("main-game Help is scoped to each window and never hides prices, warnings, stories or statuses", () => {
  const f = fixture("en", true, true);
  const price = f.doc.createElement("p");
  price.textContent = "Cost: 2 euros";
  f.host.append(price);
  const warning = f.doc.createElement("p");
  warning.setAttribute("role", "alert");
  warning.textContent = "Not enough money";
  f.host.append(warning);
  const mainRules = f.doc.createElement("p");
  mainRules.className = "window-help-text";
  mainRules.textContent = "Starting screen help only";
  f.main.append(mainRules);
  f.update(f.main, [mainRules]);
  assert.equal(f.doc.querySelectorAll(".window-help-button").length, 2, "one trigger per window, none inside help itself");
  f.trigger.emit("click");
  const text = f.popup.querySelector("div").children.map(node => node.textContent).join("\n");
  assert.match(text, /Start the performance/);
  assert.match(text, /Rules with arrow keys/);
  assert.doesNotMatch(text, /Starting screen help only/);
  assert.equal(price.hidden, false);
  assert.equal(warning.hidden, false);
  assert.equal(f.status.hidden, false);
  f.popup.close();
  f.main.querySelector(".window-help-button").emit("click");
  const titleHelp = f.popup.querySelector("div").children.map(node => node.textContent).join("\n");
  assert.match(titleHelp, /Starting screen help only/);
  assert.doesNotMatch(titleHelp, /Rules with arrow keys/);
  f.api.destroy();
});

test("main-game Help relocalizes labels and open content without changing its owning window", () => {
  const f = fixture("en", true, true);
  f.host.open = true;
  f.trigger.emit("click");
  f.doc.documentElement.lang = "fr";
  f.rules.textContent = "Les règles du jeu";
  f.api.localize();
  assert.equal(f.popup.open, true);
  assert.equal(f.host.open, true);
  assert.equal(f.trigger.textContent, "Aide");
  assert.equal(f.popup.querySelector("button").textContent, "Fermer");
  assert.match(f.popup.querySelector("div").children[0].textContent, /Commencez la prestation/);
  assert.equal(f.popup.querySelector("div").children[1].textContent, "Les règles du jeu");
  f.rules.textContent = "Les règles mises à jour";
  f.update({ nodeType: 3, parentElement: f.rules });
  assert.equal(f.popup.querySelector("div").children[1].textContent, "Les règles mises à jour");
  f.api.destroy();
});

test("a newly created window gets contextual Help without adding a Help button to the Help modal", () => {
  const f = fixture("en", false, true);
  const added = f.doc.createElement("dialog");
  added.id = "needs-notice-dialog";
  added.append(f.doc.createElement("h2"));
  f.doc.body.append(added);
  f.update(f.doc.body, [added]);
  assert.equal(added.querySelectorAll(".window-help-button").length, 1);
  assert.equal(f.popup.querySelectorAll(".window-help-button").length, 0);
  added.querySelector(".window-help-button").emit("click");
  assert.match(f.popup.querySelector("div").children[0].textContent, /important journey situation/);
  f.api.destroy();
});

test("integrated game Help collects native game instructions and refreshes rerendered controls in FR/EN", () => {
  for (const language of ["fr", "en"]) {
    const f = fixture(language, false, true);
    const host = f.doc.createElement("dialog");
    host.id = "journey-mini-game-dialog";
    host.setAttribute("data-native-controls", "");
    host.append(f.doc.createElement("h2"));
    const instructions = f.doc.createElement("p");
    instructions.className = "game-help-text";
    instructions.textContent = language === "fr" ? "Flèches pour guider, Espace pour lâcher." : "Arrows steer, Space drops.";
    const status = f.doc.createElement("p");
    status.textContent = "Score: 0";
    host.append(instructions, status);
    f.doc.body.append(host);
    f.update(f.doc.body, [host]);
    const trigger = host.querySelector(".window-help-button");
    host.showModal();
    trigger.emit("click");
    const text = f.popup.querySelector("div").children.map(node => node.textContent).join("\n");
    assert.ok(text.includes(instructions.textContent));
    assert.equal(instructions.hidden, true);
    assert.equal(status.hidden, false);
    assert.equal(host.open, true);
    assert.equal(f.popup.open, true);
    f.popup.close();
    assert.equal(f.doc.activeElement, trigger);
    const changed = f.doc.createElement("p");
    changed.className = "game-help-text";
    changed.textContent = "New round instructions";
    host.append(changed);
    f.update(host, [changed]);
    trigger.emit("click");
    assert.ok(f.popup.querySelector("div").children.some(node => node.textContent === changed.textContent));
    f.api.destroy();
  }
});

test("all shipped game windows have bilingual contextual help; consequential content stays inline", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const ids = ["title-screen", "journey-setup", "game-content",
    ...[...html.matchAll(/<dialog id="([^"]+)"/g)].map(match => match[1])];
  assert.equal(ids.length, 25);
  for (const language of ["en", "fr"]) {
    for (const id of ids) assert.ok(translate(language, `windowHelp.${id}`).length > 30, `${language}: ${id}`);
  }
  for (const id of ["needs-notice-text", "journey-event-text", "economy-pricing",
    "survival-choice-error", "trail-target", "daily-tarot-meaning", "birth-tarot-meaning"]) {
    const tag = html.match(new RegExp(`<[^>]+id="${id}"[^>]*>`))?.[0];
    assert.ok(tag, id);
    assert.doesNotMatch(tag, /window-help-text/, `${id} must not disappear into help`);
  }
  for (const key of ["cafeInstructions", "musicInstructions", "theftInstructions", "footstepNote",
    "setupIntro", "birthTarotIntro", "dailyTarotIntro", "townScope", "cellActionAvailability", "journeyEventRules"]) {
    assert.match(html, new RegExp(`<p[^>]+class="[^"]*window-help-text[^"]*"[^>]+data-i18n="${key}"`));
  }
});
