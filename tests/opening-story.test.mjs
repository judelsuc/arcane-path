import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createLiveNarrative, OPENING_STORY } from "../live-narrative.mjs";
import { setupOpeningStory } from "../opening-story-ui.mjs";
import { translate, translations } from "../i18n.mjs";

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
    const journaled = [];
    const requests = [];
    const narrative = createLiveNarrative({ fetcher: async (url, options) => {
      requests.push([url, options]);
      return new Promise(done => { resolve = done; });
    } });
    const before = structuredClone(state);
    const ui = setupOpeningStory((key, values) => translate(language, key, values), {
      narrative, doc, context: () => state, onContinue: () => { started++; },
      onJournal: (owner, wording) => { journaled.push({ owner, wording }); },
    });
    ui.prepare();
    ui.open();
    assert.equal(started, 0);
    assert.ok(doc.querySelector("#opening-story-dialog").open);
    assert.equal(doc.querySelector("#opening-story-text").hidden, true);
    assert.equal(doc.querySelector("#opening-story-text").textContent, "");
    assert.equal(doc.querySelector("#opening-story-continue").disabled, true);
    doc.querySelector("#opening-story-continue").handlers.click();
    assert.equal(started, 0);
    assert.match(doc.querySelector("#opening-story-status").textContent, language === "fr" ? /PRIVATE.*patienter/ : /PRIVATE.*wait/);
    assert.equal(requests.length, 1);
    assert.equal(doc.querySelector("#opening-story-status").ariaBusy, "true");
    assert.deepEqual(JSON.parse(requests[0][1].body), {
      journey: state.serverJourney.id, brief: OPENING_STORY, nameFlavour: true,
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
    assert.equal(doc.querySelector("#opening-story-status").ariaBusy, "false");
    assert.equal(doc.querySelector("#opening-story-text").hidden, false);
    assert.equal(doc.querySelector("#opening-story-continue").disabled, false);
    assert.deepEqual(journaled, [{ owner: state, wording: generated }]);
    assert.equal(started, 0);
    doc.querySelector("#opening-story-continue").handlers.click();
    assert.equal(started, 1);
    doc.querySelector("#read-opening-story").handlers.click();
    doc.querySelector("#opening-story-continue").handlers.click();
    assert.equal(started, 1);
    assert.equal(requests.length, 1);
    assert.equal(journaled.length, 1);
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

test("explicit regeneration sends stable consent, preserves old prose while pending and after failure", async () => {
  let responseStatus = "ready", calls = [];
  const client = createLiveNarrative({ schedule: () => 1, cancel() {},
    fetcher: async (_, options) => {
      calls.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ enabled: true, brief: OPENING_STORY,
        status: responseStatus, text: responseStatus === "ready" ? generated : null,
        ...(responseStatus !== "ready" ? { previousText: generated } : {}) }) };
    },
  });
  client.prefetch(state, [OPENING_STORY]);
  await flush();
  const consented = { ...state, storyNameFlavour: true };
  responseStatus = "queued";
  client.regenerateOpening(consented, "e".repeat(32));
  assert.deepEqual(client.snapshot(consented, OPENING_STORY), generated);
  await flush();
  assert.deepEqual(calls[1], { journey: state.serverJourney.id, brief: OPENING_STORY,
    nameFlavour: true, regenerate: "e".repeat(32) });
  assert.equal(client.pending(consented, OPENING_STORY), true);
  assert.throws(() => client.regenerateOpening(consented), /still being prepared/);
  const reloaded = createLiveNarrative({ fetcher: async () => ({ ok: true, json: async () => ({
    enabled: true, brief: OPENING_STORY, status: "failed", previousText: generated,
  }) }) });
  reloaded.prefetch(consented, [OPENING_STORY]);
  await flush();
  assert.deepEqual(reloaded.snapshot(consented, OPENING_STORY), generated);
  assert.match(reloaded.status(consented, OPENING_STORY, "en"), /failed/);
  assert.throws(() => client.regenerateOpening(state), /consent/);
  client.reset();
});

test("failed or local opening journals the original bilingual pretext without a manual generation action", async () => {
  class Element {
    open = false; handlers = {};
    addEventListener(type, handler) { this.handlers[type] = handler; }
    showModal() { this.open = true; }
    close() { this.open = false; }
    focus() {}
  }
  const nodes = new Map(), doc = { documentElement: { lang: "en" }, querySelector(key) {
    if (!nodes.has(key)) nodes.set(key, new Element());
    return nodes.get(key);
  } };
  const journaled = [];
  let resolve;
  const narrative = createLiveNarrative({ fetcher: async () => new Promise(done => { resolve = done; }) });
  const ui = setupOpeningStory((key, args) => translate("en", key, args), {
    doc, context: () => state, onContinue() {}, narrative,
    onJournal: (owner, text, generated) => { journaled.push({ text, generated }); },
  });
  ui.open(false);
  assert.equal(doc.querySelector("#opening-story-continue").disabled, true);
  let prevented = false;
  doc.querySelector("#opening-story-dialog").handlers.cancel({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  await flush();
  assert.equal(journaled.length, 0);
  resolve({ ok: true, json: async () => ({ enabled: true, brief: OPENING_STORY,
    status: "failed", text: null, error: "Test failure" }) });
  await flush();
  assert.equal(doc.querySelector("#opening-story-continue").disabled, false);
  assert.equal(doc.querySelector("#opening-story-status").ariaBusy, "false");
  assert.match(doc.querySelector("#opening-story-status").textContent, /failed/);
  assert.equal(journaled.length, 1);
  assert.equal(journaled[0].generated, false);
  assert.match(journaled[0].text.en, /Camille/);
  assert.match(journaled[0].text.fr, /Camille/);
  ui.localize();
  await flush();
  assert.equal(journaled.length, 1);
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /id="story-name-flavour"[^>]*\bchecked\b/);
  assert.doesNotMatch(html, /id="opening-story-regenerate"/);
  assert.match(html, /<p id="opening-story-status" role="status" aria-live="polite">/);
  assert.doesNotMatch(html, /id="opening-story-status"[^>]*window-help-text/);
});

test("main journey opens story after tarot and before play, including zero-minute resume", () => {
  const ui = readFileSync(new URL("../travel-ui.mjs", import.meta.url), "utf8");
  assert.match(ui, /birthDialog\.close\(\);\s*openingStory\.open\(\)/);
  assert.match(ui, /state\.elapsedMinutes === 0\) openingStory\.open\(\)/);
  assert.match(ui, /openingStory\.prepare\(\);\s*state = migrateHealth/);
  assert.match(ui, /openingStory\.reset\(\)/);
  assert.match(ui, /openingStory\.localize\(\)/);
});

test("player messages have no provider name or cache terminology", () => {
  for (const language of ["fr", "en"]) {
    for (const text of Object.values(translations[language])) assert.doesNotMatch(text, /\bOVH\b/);
    const client = createLiveNarrative();
    for (const message of [client.status({}, OPENING_STORY, language),
      client.introductionStatus({}, "event.coins", language, true)]) {
      assert.doesNotMatch(message, /\bOVH\b|\bcache\b|\bcached\b/);
    }
  }
});
