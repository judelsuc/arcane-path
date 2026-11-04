import test from "node:test";
import assert from "node:assert/strict";
import { setupQuestLayout } from "../quest-layout.mjs";

class Element {
  children = [];
  events = {};
  dataset = {};
  hidden = false;
  open = false;
  disabled = false;
  focused = false;
  append(...children) { this.children.push(...children); }
  addEventListener(type, callback) { this.events[type] = callback; }
  close() { this.open = false; this.events.close?.(); }
  focus() { this.focused = true; }
  scrollIntoView(options) { this.scrolled = options; }
  querySelector() { return null; }
  remove() { this.removed = true; }
  setAttribute(name, value) { this[name] = value; }
  showModal() { this.open = true; }
}

function fixture(t, hasParentTrail) {
  const previous = globalThis.document, nodes = new Map();
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, new Element());
    return nodes.get(id);
  };
  globalThis.document = {
    getElementById: get,
    createElement: () => new Element(),
    querySelector: selector => selector === "dialog[open]"
      ? [...nodes.values()].find(node => node.open) ?? null : get(selector),
  };
  t.after(() => { globalThis.document = previous; });
  get("open-quests").disabled = !hasParentTrail;
  get("open-investigation").disabled = false;
  get("trail-investigation-page").hidden = true;
  get("trail-dialog").children = [];
  get("hint-dialog").children = [
    Object.assign(new Element(), { tagName: "H2" }),
    Object.assign(new Element(), { tagName: "BUTTON" }),
  ];
  const investigation = get("investigation-dialog");
  investigation.querySelector = selector => {
    if (selector === "#investigation-title") return get("investigation-title");
    if (selector === "[data-i18n='investigation.intro']") return get("investigation-intro");
    return null;
  };
  const layout = setupQuestLayout(key => key);
  return { get, layout };
}

test("map investigation opens clue groups without requiring a parent-trail quest", t => {
  const f = fixture(t, false);
  f.get("open-investigation").events.click();
  const groups = f.get("investigation-content").children;
  assert.equal(f.get("investigation-dialog").open, true);
  assert.equal(groups.length, 5);
  assert.equal(groups[0].hidden, true);
  assert.equal(f.get("trail-investigation-page").hidden, true);
  for (const index of [1, 2, 3, 4]) assert.equal(groups[index].hidden, false);
  assert.equal(f.get("investigation-close").focused, true);
  f.get("investigation-dialog").close();
  assert.equal(f.get("open-investigation").focused, true);
});

test("map investigation includes parent actions when a parent trail exists", t => {
  const f = fixture(t, true);
  f.get("open-investigation").events.click();
  assert.equal(f.get("investigation-content").children[0].hidden, false);
  assert.equal(f.get("trail-investigation-page").hidden, false);
  assert.equal(f.get("dialogue-parent").hidden, false);
});

test("map investigation does not open over another modal", t => {
  const f = fixture(t, true);
  f.get("trail-dialog").showModal();
  f.get("open-investigation").events.click();
  assert.equal(f.get("investigation-dialog").open, false);
});

test("directions shortcut opens the shared chooser without requiring a parent trail", t => {
  const f = fixture(t, false);
  f.layout.openDirections();
  assert.equal(f.get("investigation-dialog").open, true);
  assert.equal(f.get("hint-town").focused, true);
  assert.deepEqual(f.get("hint-town").scrolled, { block: "center" });
});

test("directions shortcut focuses the empty-state explanation when no destination is known", t => {
  const f = fixture(t, false);
  f.get("hint-town").disabled = true;
  f.layout.openDirections();
  assert.equal(f.get("investigation-dialog").open, true);
  assert.equal(f.get("hint-town-empty").focused, true);
  assert.equal(f.get("hint-town").focused, false);
});

test("clue shortcut leaves Quests for the investigation clue list and focuses the first question", t => {
  const f = fixture(t, true);
  const ask = { focused: false, focus() { this.focused = true; }, scrollIntoView(o) { this.scrolled = o; } };
  f.get("hint-clues").querySelector = selector => selector === "button:not([disabled])" ? ask : null;
  f.get("trail-dialog").showModal();
  f.layout.openClues();
  assert.equal(f.get("trail-dialog").open, false);
  assert.equal(f.get("investigation-dialog").open, true);
  assert.equal(ask.focused, true);
  assert.deepEqual(ask.scrolled, { block: "center" });
});

test("directions shortcut respects disabled actions and other modals", t => {
  const f = fixture(t, true);
  f.get("open-investigation").disabled = true;
  f.layout.openDirections();
  assert.equal(f.get("investigation-dialog").open, false);
  f.get("open-investigation").disabled = false;
  f.get("conversation-dialog").showModal();
  f.layout.openDirections();
  assert.equal(f.get("investigation-dialog").open, false);
  assert.equal(f.get("hint-town").focused, false);
});
