import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setupTrail, parentClueText } from "../trail-ui.mjs";
import { translate } from "../i18n.mjs";

const data = JSON.parse(readFileSync(new URL("../public/economy.json", import.meta.url)));

for (const locale of ["fr", "en"]) {
  test(`${locale} parent window recalls obtained clues without location precision or external navigation`, t => {
    const original = globalThis.document;
    t.after(() => { globalThis.document = original; });
    class Element {
      children = []; events = {}; textContent = ""; open = false;
      nextElementSibling = { hidden: false };
      addEventListener(type, listener) { this.events[type] = listener; }
      append(...children) { this.children.push(...children); }
      replaceChildren() { this.children = []; }
      showModal() { this.open = true; }
      close() { this.open = false; }
    }
    const elements = new Map();
    const element = selector => {
      if (!elements.has(selector)) elements.set(selector, new Element());
      return elements.get(selector);
    };
    globalThis.document = {
      documentElement: { lang: locale }, createElement: () => new Element(),
      querySelector: selector => selector === "dialog[open]"
        ? [...elements.values()].find(e => e.open) ?? null : element(selector),
    };
    const tr = (key, args) => translate(locale, key, args);
    let state = { col: 100, row: -200, ended: null, trail: {
      version: 2, parentName: "Camille", index: 1, completed: false,
      stages: ["Known stop", "Known destination", "SECRET FUTURE"].map((name, i) => ({
        name, col: -100 - i * 200, row: 10, latitude: 45, longitude: 2 - i,
        osmId: `node/${i + 1}`, legMeters: 45000,
      })),
      history: [{ parentName: "Camille", place: "Known stop", witnessId: "fictional-traveler-1",
        clueKind: "letter", next: { name: "Known destination" } }],
      discovery: { kind: "letter", step: 0, nextName: "Known destination", pending: false },
    } };
    const before = structuredClone(state);
    const ui = setupTrail(tr, { context: () => ({
      state, cell: { terrain: "place" }, info: { latitude: 44, longitude: 3 }, data, blocked: false,
    }) });
    ui.open();
    assert.equal(element("#trail-target").textContent,
      tr("trailKnownDestination", { place: "Known destination" }));
    assert.equal(element("#trail-discovery-text").textContent, parentClueText(state, state.trail.discovery, tr));
    const history = element("#trail-history").children[0].children.map(p => p.textContent).join(" ");
    assert.ok(history.includes(element("#trail-discovery-text").textContent));
    assert.ok(!history.includes("fictional-traveler-1"));
    assert.ok(!history.includes("SECRET FUTURE"));
    assert.ok(!elements.has("#trail-map-link"));
    assert.ok(!elements.has("#parent-path-status"));
    assert.ok(!elements.has("#parent-path-prepare"));
    const target = element("#trail-target").textContent;
    state = { ...state, col: -300, row: 10 };
    ui.localize();
    assert.equal(element("#trail-target").textContent, target);
    assert.deepEqual(before.trail, state.trail);
    state = { ...state, col: 0, row: 0, trail: { ...state.trail, index: 6,
      stages: Array.from({ length: 10 }, (_, i) => ({
        name: i === 6 ? "Berchem" : `Stop ${i + 1}`, col: 138, row: 13,
        latitude: 50.8, longitude: 4.3, legMeters: 57000, osmId: `node/${i + 1}`,
      })),
    } };
    ui.localize();
    assert.equal(element("#trail-target").textContent, tr("trailKnownDestination", { place: "Berchem" }));
    assert.doesNotMatch(element("#trail-target").textContent, /138|13|57|km|→|↓|7\/10/);
    state = { ...state, trail: { ...state.trail,
      discovery: { kind: "search", step: 5, pending: true, venue: "Known café", nextName: "SECRET NEXT" },
    } };
    ui.localize();
    assert.equal(element("#trail-target").textContent, tr("clueAskDirections", { venue: "Known café" }));
    assert.doesNotMatch(element("#trail-target").textContent, /Berchem|SECRET NEXT/);
    assert.doesNotMatch(element("#trail-discovery-text").textContent, /SECRET NEXT/);
    ui.reset();
  });
}

test("parent window markup contains no exact-location map links or route estimates", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /id="(?:trail-map-link|parent-path-status|parent-path-prepare|parent-path-retry)"/);
});
