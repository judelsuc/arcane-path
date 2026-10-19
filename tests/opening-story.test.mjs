import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createLiveNarrative, OPENING_STORY } from "../live-narrative.mjs";
import { setupOpeningStory } from "../opening-story-ui.mjs";
import { translate } from "../i18n.mjs";

const flush = () => new Promise(resolve => setImmediate(resolve));
const state = { name: "PRIVATE", notes: "SECRET", col: 12, row: 34,
  trail: { parentName: "Camille", story: { motive: "family" } },
  serverJourney: { id: "a".repeat(32) }, journalAccess: "b".repeat(64) };
const generated = { en: "Your parent Camille left. ".repeat(30).trim(),
  fr: "Votre parent Camille est parti. ".repeat(30).trim() };

for (const language of ["en", "fr"]) {
  test(`${language}: backstory is shown before gameplay; no game mutation or generation on reread`, async () => {
    class Element {
      open = false; textContent = ""; handlers = {};
      addEventListener(type, handler) { this.handlers[type] = handler; }
      showModal() { this.open = true; }
      close() { this.open = false; }
      focus() {}
    }
    const elements = new Map();
    const doc = { documentElement: { lang: language }, querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, new Element());
      return elements.get(selector);
    } };
    let resolve, started = 0;
    const requests = [];
    const narrative = createLiveNarrative({ fetcher: async (url, options) => {
      requests.push([url, options]);
      return new Promise(done => { resolve = done; });
    } });
    const before = structuredClone(state);
    const ui = setupOpeningStory((key, values) => translate(language, key, values), {
      narrative, doc, context: () => state, onContinue: () => { started++; },
    });
    ui.prepare();
    ui.open();
    assert.equal(started, 0);
    assert.ok(doc.querySelector("#opening-story-dialog").open);
    assert.match(doc.querySelector("#opening-story-text").textContent, /Camille/);
    assert.equal(requests.length, 1);
    assert.deepEqual(JSON.parse(requests[0][1].body), {
      journey: state.serverJourney.id, brief: OPENING_STORY,
    });
    assert.ok(!requests[0][1].body.includes("PRIVATE"));
    let prevented = false;
    doc.querySelector("#opening-story-dialog").handlers.cancel({ preventDefault() { prevented = true; } });
    assert.ok(prevented);
    resolve({ ok: true, json: async () => ({
      enabled: true, brief: OPENING_STORY, status: "ready", text: generated,
    }) });
    await flush();
    assert.equal(doc.querySelector("#opening-story-text").textContent, generated[language]);
    assert.equal(started, 0);
    doc.querySelector("#opening-story-continue").handlers.click();
    assert.equal(started, 1);
    doc.querySelector("#read-opening-story").handlers.click();
    doc.querySelector("#opening-story-continue").handlers.click();
    assert.equal(started, 1);
    assert.equal(requests.length, 1);
    assert.deepEqual(state, before);
  });
}

test("a failed opening uses authored backstory, not a blocking loading screen", async () => {
  const client = createLiveNarrative({ fetcher: async () => ({
    ok: true, json: async () => ({ enabled: true, brief: OPENING_STORY,
      status: "failed", text: null, error: "Test failure" }),
  }) });
  client.prefetch(state, [OPENING_STORY]);
  await flush();
  assert.equal(client.snapshot(state, OPENING_STORY), null);
  assert.match(client.status(state, OPENING_STORY, "en"), /failed/);
});

test("main journey opens story after tarot and before play, including zero-minute resume", () => {
  const ui = readFileSync(new URL("../travel-ui.mjs", import.meta.url), "utf8");
  assert.match(ui, /birthDialog\.close\(\);\s*openingStory\.open\(\)/);
  assert.match(ui, /state\.elapsedMinutes === 0\) openingStory\.open\(\)/);
  assert.match(ui, /openingStory\.prepare\(\);\s*state = migrateHealth/);
  assert.match(ui, /openingStory\.reset\(\)/);
  assert.match(ui, /openingStory\.localize\(\)/);
});
