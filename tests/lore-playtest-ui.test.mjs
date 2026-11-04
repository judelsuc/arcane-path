import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setImmediate } from "node:timers/promises";
import { createLoreState, applyLoreAction, loreView } from "../lore-engine.mjs";
import { startSurvival } from "../survival.mjs";
import { startEconomy } from "../economy.mjs";
import { createTrail } from "../trail.mjs";
import { LORE_ITEMS } from "../lore-catalogue.mjs";
import { inscriptionClue } from "../lore-knowledge.mjs";
import { learnDiscovery } from "../discovery.mjs";

const json = name => JSON.parse(readFileSync(new URL(name, import.meta.url)));
const map = json("../public/map.json"), survival = json("../public/config.json").survival;
const economy = json("../public/economy.json"), journey = "a".repeat(32);
const nodesIn = node => [node, ...node.children.flatMap(nodesIn)];

test("playtest UI renders real work outside interpretation callbacks, all power selectors, sanctuary warnings and receipts", async t => {
  const originals = ["document", "localStorage", "fetch", "confirm"].map(key =>
    [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  t.after(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const nodes = new Map(), confirmations = [];
  let accepted = true, current, actions = 0;
  class Element {
    children = []; events = {}; dataset = {}; style = {}; attributes = {};
    #text = ""; #value;
    get textContent() { return this.#text + this.children.map(child => child.textContent).join(" "); }
    set textContent(value) { this.#text = String(value); this.children = []; }
    get value() { return this.#value ?? this.children.find(child => child.tagName === "OPTION")?.value; }
    set value(value) { this.#value = value; }
    get options() { return this.children; }
    get selectedOptions() { return this.children.filter(child => child.value === this.value); }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.#text = ""; this.children = children; }
    addEventListener(name, listener) { this.events[name] = listener; }
    setAttribute(key, value) { this.attributes[key] = value; }
  }
  const doc = {
    documentElement: {}, events: {},
    addEventListener(name, listener) { this.events[name] = listener; },
    createElement(tag) {
      const node = new Element();
      node.tagName = tag.toUpperCase();
      node.ownerDocument = doc;
      return node;
    },
    createTextNode(text) { const node = new Element(); node.textContent = text; return node; },
    querySelector(selector) {
      if (!nodes.has(selector)) nodes.set(selector, doc.createElement("div"));
      return nodes.get(selector);
    },
  };
  const storage = new Map([["arcane-lore-source-v1", JSON.stringify({
    id: journey, capability: "b".repeat(64), name: "UI fixture",
  })]]);
  globalThis.document = doc;
  globalThis.localStorage = {
    get length() { return storage.size; }, key: index => [...storage.keys()][index],
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key),
  };
  globalThis.confirm = message => { confirmations.push(message); return accepted; };
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "/api/lore-playtest");
    const body = JSON.parse(options.body);
    if (body.operation === "action") {
      actions++;
      current = await applyLoreAction(current.runtime, current.instances, journey, map, body.action, { nowMillis: 1000 });
    }
    return new Response(JSON.stringify(body.operation === "map" ? { map } :
      loreView(current.runtime, current.instances, journey, map, { nowMillis: 1000 })),
    { headers: { "Content-Type": "application/json" } });
  };
  function fixture(id) {
    const genesis = { ...startEconomy(startSurvival(14, 11, Date.UTC(2026, 9, 19, 12),
      "balanced", survival), economy, () => 0), name: "UI fixture", trail: createTrail(map, 14, 11, () => 0) };
    let state = createLoreState(genesis, map, economy);
    state.trail.version = 2;
    state.trail.index = 1;
    state.trail.exploration = { version: 1, firstStage: 1, knownStage: null, hints: [] };
    for (const known of ["fool", "magician", "hermit"]) {
      state = learnDiscovery(state, [inscriptionClue(state, known)]);
    }
    const instances = LORE_ITEMS.map(item => ({ id: item.id, col: 14, row: 11, town: "Lestrunie",
      marker: `virtual:${item.id}`, generation: 1, owner: item.id === id ? journey : null,
      placement: item.id === id ? { id, x: 0, y: 0, rotated: false } : null,
      cooldownUntil: 0, recallJourney: null }));
    current = { runtime: { state, survival, economy, revision: 1, worldMinutes: 0 }, instances };
  }
  const settle = async () => { await setImmediate(); assert.equal(nodes.get("#feedback").dataset.failure, "false"); };
  const click = async node => { assert.ok(node); assert.ok(!node.disabled, node.textContent); node.events.click(); await settle(); };
  const findButton = (root, text) => nodesIn(nodes.get(root)).find(node =>
    node.tagName === "BUTTON" && node.textContent.startsWith(text));
  const resume = async id => { fixture(id); await click(nodes.get("#start")); };
  fixture();
  await import(`../lore-playtest.mjs?ui-regression`);
  await click(nodes.get("#start"));
  await click(findButton("#actions", "Bookshop work"));
  assert.ok(nodesIn(nodes.get("#actions")).some(node => node.id === "bookshop-work"));
  assert.match(nodes.get("#actions").textContent, /sort displayed titles alphabetically/);
  assert.match(nodes.get("#actions").textContent, /Travel/);
  const beforeKey = actions;
  doc.events.keydown({ key: "ArrowDown", target: { tagName: "BODY" } });
  assert.equal(actions, beforeKey);
  await click(findButton("#actions", "Cancel"));
  assert.equal(current.runtime.state.lastJourneyMiniGame.cancelled, true);
  assert.ok(findButton("#actions", "Bookshop work"));
  assert.match(nodes.get("#actions").textContent, /Cancelled: no reward/);

  for (const id of ["magician", "priestess", "hierophant", "judgement", "emperor"]) {
    await resume(id);
    const artifacts = nodes.get("#artifacts");
    assert.doesNotMatch(artifacts.textContent, /undefined/);
    if (["magician", "priestess", "judgement"].includes(id)) {
      assert.ok(nodesIn(artifacts).some(node => node.tagName === "SELECT" && node.options.length), id);
    }
    if (id === "hierophant") assert.equal(nodesIn(artifacts).filter(node => node.type === "checkbox").length, 3);
  }
  await click(findButton("#artifacts", "Use power"));
  assert.match(nodes.get("#actions").textContent, /sanctuary until its expiry/);
  accepted = false;
  const beforeCamp = actions;
  await click(findButton("#movement", "↓"));
  assert.match(confirmations.at(-1), /ends the sanctuary/);
  doc.events.keydown({ key: "ArrowDown", target: { tagName: "BODY" }, preventDefault() {} });
  assert.match(confirmations.at(-1), /ends the sanctuary/);
  assert.equal(actions, beforeCamp);
  assert.ok(current.runtime.state.lore.protections.emperor);
  accepted = true;
  await resume("nameless");
  await click(findButton("#artifacts", "Use power"));
  current.runtime.state.health = 1;
  current.runtime.state.reserveKcal = 0;
  await click(findButton("#actions", "Rest"));
  assert.match(nodes.get("#effects").textContent, /Life-saving charge consumed/);
  nodes.get("#language").value = "fr";
  nodes.get("#language").events.change();
  assert.match(nodes.get("#effects").textContent, /Sauvegarde vitale consommée/);
  assert.equal([...storage.keys()].filter(key => key.startsWith("arcane-journey-v1:")).length, 0);
});
