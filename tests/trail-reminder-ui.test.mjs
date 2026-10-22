import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setupTrail, parentClueText } from "../trail-ui.mjs";
import { translate } from "../i18n.mjs";
import { PARENT_PROFILES } from "../parent-intimacy.mjs";

const data = JSON.parse(readFileSync(new URL("../public/economy.json", import.meta.url)));

for (const locale of ["fr", "en"]) {
  test(`${locale} parent window recalls obtained clues without location precision or external navigation`, t => {
    const original = globalThis.document;
    t.after(() => { globalThis.document = original; });
    class Element {
      dataset = {};
      children = []; events = {}; textContent = ""; open = false;
      nextElementSibling = { hidden: false };
      addEventListener(type, listener) { this.events[type] = listener; }
      setAttribute(name, value) { this[name] = value; }
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
    let state = { col: 100, row: -200, ended: null,
      startedAt: Date.UTC(2026, 9, 17, 12), elapsedMinutes: 60, trail: {
      version: 2, parentName: "Camille", index: 1, completed: false,
      stages: ["Known stop", "Known destination", "SECRET FUTURE"].map((name, i) => ({
        name, col: -100 - i * 200, row: 10, latitude: 45, longitude: 2 - i,
        osmId: `node/${i + 1}`, legMeters: 45000,
      })),
      history: [{ parentName: "Camille", place: "Known stop", witnessId: "fictional-traveler-1",
        clueKind: "letter", next: { name: "Known destination" }, elapsedMinutes: 20 }],
      discovery: { kind: "letter", step: 0, nextName: "Known destination", pending: false },
    } };
    const before = structuredClone(state);
    const ui = setupTrail(tr, { context: () => ({
      state, cell: { terrain: "place" }, info: { latitude: 44, longitude: 3 }, data, blocked: false,
    }), discover() {
      element("#trail-action-error").textContent = "Investigation rejected";
      return false;
    } });
    ui.open();
    assert.equal(element("#trail-target").textContent,
      tr("trailKnownDestination", { place: "Known destination" }));
    assert.equal(element("#trail-discovery-text").textContent, parentClueText(state, state.trail.discovery, tr));
    const history = element("#trail-history").children[0].children.map(p => p.textContent).join(" ");
    const latest = element("#trail-history").children[0];
    assert.equal(latest.children[0].dateTime, "2026-10-17T12:20:00.000Z");
    assert.equal(latest.children[1].textContent, tr("trailLatestRecord"));
    assert.equal(latest.children[2].textContent, tr("trailEvidenceFor", { page: 2 }));
    assert.ok(history.includes(element("#trail-discovery-text").textContent));
    assert.ok(!history.includes("fictional-traveler-1"));
    assert.ok(!history.includes("SECRET FUTURE"));
    assert.equal(element("#trail-investigation-page").hidden, false);
    assert.equal(element("#trail-evidence-page").hidden, false);
    element("#trail-section-past").events.click();
    assert.equal(element("#trail-archive-pages").hidden, false);
    assert.equal(element("#trail-history").children.length, 0);
    element("#trail-page-current").events.click();
    assert.ok(!elements.has("#trail-map-link"));
    assert.ok(!elements.has("#parent-path-status"));
    assert.ok(!elements.has("#parent-path-prepare"));
    state = { ...state, col: -300, row: 10 };
    ui.localize();
    assert.equal(element("#trail-target").textContent,
      tr("trailPageAwaiting", { page: 3, place: "Known destination" }));
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
    state = { ...state, startedAt: Date.UTC(2026, 9, 17), elapsedMinutes: 0,
      trail: { ...state.trail, story: { motive: "family", mode: "walk", orientation: "upright",
        finalState: "mobile", lore: [], falseLeads: [], movement: [],
        visits: [{ arrival: Date.UTC(2026, 9, 16), departure: Date.UTC(2026, 9, 18),
          nights: 2, purchases: 3 }],
      } } };
    ui.localize();
    element("#trail-section-past").events.click();
    for (let i = 0; i < 5; i++) element("#trail-page-previous").events.click();
    const records = () => element("#parent-story-records").children
      .flatMap(item => item.children.map(p => p.textContent)).join(" ");
    assert.match(records(), /2026-10-16/);
    assert.doesNotMatch(records(), /2026-10-18|SECRET/);
    assert.ok(records().includes(tr("parentStory.currentVisit", {
      place: "Known stop", arrival: "2026-10-16",
    })));
    state = { ...state, elapsedMinutes: 2 * 1440 };
    ui.localize();
    assert.match(records(), /2026-10-18/);
    state = { ...state, col: state.trail.stages[state.trail.index].col,
      row: state.trail.stages[state.trail.index].row, trail: { ...state.trail,
        discovery: { kind: "search", step: state.trail.index, pending: true,
          venue: "Known café", nextName: "SECRET NEXT" },
      } };
    ui.localize();
    const directions = element("#dialogue-parent").children.flatMap(item => item.children ?? [])
      .find(button => button.id === "clue-directions");
    assert.ok(directions);
    directions.events.click();
    assert.equal(element("#trail-investigation-page").hidden, false);
    assert.equal(element("#trail-evidence-page").hidden, false);
    assert.equal(element("#trail-action-error").textContent, "Investigation rejected");
    state.trail.story = { ...state.trail.story, motive: "cartomancer", intimacy: { version: 1, card: "fool" },
      visits: state.trail.stages.map(() => ({ ...state.trail.story.visits[0], clues: ["discuss", "letter"] })),
    };
    state.trail.discovery = { kind: "discuss", step: 0, pending: false,
      place: "Known stop", nextName: "Known destination", elapsedMinutes: 20 };
    ui.localize();
    const conversationText = () => element("#dialogue-parent").children.map(item => item.textContent).join(" ");
    assert.ok(conversationText().includes(PARENT_PROFILES.fool.witness[0][locale]));
    const generated = { fr: "Ce souvenir comptait plus que tout.", en: "That memory mattered above all." };
    state.parentWording = [{ key: "witness:0", text: generated }];
    ui.localize();
    assert.ok(conversationText().includes(generated[locale]));
    ui.reset();
  });
}

test("parent window markup contains no exact-location map links or route estimates", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /id="(?:trail-map-link|parent-path-status|parent-path-prepare|parent-path-retry)"/);
});
