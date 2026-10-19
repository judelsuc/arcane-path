import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CLOSING_STORY, closingSummary, closingStoryText } from "../closing-story.mjs";
import { setupClosingStory } from "../closing-story-ui.mjs";
import { createLiveNarrative } from "../live-narrative.mjs";
import { translate } from "../i18n.mjs";

const flush = () => new Promise(resolve => setImmediate(resolve));
const generated = {
  en: "The road is now a memory, and your search has reached its ending. ".repeat(12).trim(),
  fr: "La route est un souvenir, et votre recherche a atteint son terme. ".repeat(12).trim(),
};
const fixture = (ended = "reunion") => ({
  ended, distanceMeters: 309000.25, elapsedMinutes: 40525.2, ascentMeters: 1250.4,
  meals: 46, sleeps: 25, performances: 8, cafeShifts: 2,
  name: "PRIVATE PLAYER", notes: "PRIVATE NOTE", photos: [{ note: "PRIVATE PHOTO" }],
  col: 123, row: 456, journalAccess: "b".repeat(64), storyNameFlavour: true,
  serverJourney: { id: "a".repeat(32) },
  trail: { parentName: "PRIVATE PARENT", index: 10, history: Array.from({ length: 10 }, () => ({})),
    stages: Array.from({ length: 13 }, (_, stage) => ({ name: `PRIVATE STAGE ${stage}` })),
    exploration: { hints: [{}, {}], signs: [{}], reports: [{ outcome: "suggestion" }, { outcome: "nothing" }] },
    dreams: { checks: [{ outcome: "guidance" }, { outcome: "miss" }] } },
  events: { history: [
    { kind: "food", elapsedMinutes: 100 }, { kind: "lostCoins", elapsedMinutes: 200 },
    { kind: "whiteDeer", elapsedMinutes: 300 },
  ] },
});

test("closing brief includes only recorded aggregate counters and eligible terminal outcomes", () => {
  for (const outcome of ["health", "hunger", "fatigue", "sleep", "reunion"]) {
    const state = fixture(outcome), before = structuredClone(state);
    assert.deepEqual(closingSummary(state), {
      outcome, walkingMeters: 309000, elapsedMinutes: 40525, ascentMeters: 1250,
      stagesReached: 10, meals: 46, sleeps: 25, performances: 8, cafeShifts: 2,
      recordedClues: 4, recordedDreams: 1, recordedEncounters: 3,
      reachedStages: Array.from({ length: 10 }, (_, stage) => ({ stage, elapsedMinutes: null })),
      events: [
        { kind: "food", elapsedMinutes: 100 }, { kind: "lostCoins", elapsedMinutes: 200 },
        { kind: "whiteDeer", elapsedMinutes: 300 },
      ],
    });
    assert.deepEqual(state, before);
  }
  assert.equal(closingSummary(null), null);
  for (const outcome of [null, "placement", "unknown"]) assert.equal(closingSummary(fixture(outcome)), null);
  const legacy = fixture("hunger");
  delete legacy.trail; delete legacy.events; delete legacy.performances; delete legacy.cafeShifts;
  assert.equal(closingSummary(legacy).recordedClues, 0);
  assert.equal(closingSummary(legacy).performances, 0);
});

test("stages use actual arrivals before clue collection times; unknown legacy times stay unknown and hidden stages stay out", () => {
  const state = fixture("hunger");
  state.trail.history = [{ elapsedMinutes: 50 }, {}];
  state.trail.arrivals = [{ stage: 0, elapsedMinutes: 40 }, { stage: 2, elapsedMinutes: 100 }];
  assert.deepEqual(closingSummary(state).reachedStages, [
    { stage: 0, elapsedMinutes: 40 }, { stage: 1, elapsedMinutes: null }, { stage: 2, elapsedMinutes: 100 },
  ]);
  assert.equal(closingSummary(state).stagesReached, 3);
  const t = (key, args) => translate("en", key, args);
  const authored = closingStoryText(state, t);
  assert.ok(authored.includes("PRIVATE STAGE 0 → PRIVATE STAGE 1 → PRIVATE STAGE 2"));
  assert.ok(!authored.includes("PRIVATE STAGE 3"));
  assert.ok(authored.includes(t("journeyEvent.food")));
  assert.ok(authored.includes(t("journeyEvent.lostCoins")));
  assert.ok(!closingStoryText(state, t, null, "en", { milestones: false }).includes("PRIVATE STAGE"));
});

test("maximum stage and event history fits the existing 4 KiB HTTP contract without sending names or coordinates", () => {
  const state = fixture();
  state.trail.history = Array.from({ length: 13 }, (_, stage) => ({ elapsedMinutes: stage * 100000 }));
  state.elapsedMinutes = 100000000;
  state.events.history = Array.from({ length: 32 }, (_, index) => ({
    kind: "impossibleShadow", elapsedMinutes: 99999900 + index,
  }));
  const body = JSON.stringify({
    journey: state.serverJourney.id, keeper: "c".repeat(32), brief: CLOSING_STORY, summary: closingSummary(state),
  });
  assert.ok(Buffer.byteLength(body) < 4096, `Request body has ${Buffer.byteLength(body)} bytes`);
  assert.ok(!body.includes("PRIVATE"));
});

test("closing stories send fixed bounded counters, never journal content, names, coordinates or name opt-in", async () => {
  const requests = [], jobs = [];
  let calls = 0;
  const client = createLiveNarrative({
    schedule(fn) { jobs.push(fn); return jobs.length; }, cancel() {},
    fetcher: async (_, options) => {
      requests.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({
        brief: CLOSING_STORY, enabled: true, status: ++calls === 1 ? "running" : "ready",
        text: calls === 1 ? null : generated, alternatives: [],
      }) };
    },
  });
  const state = fixture();
  client.prefetch(state, [CLOSING_STORY]);
  await flush();
  const original = closingSummary(state);
  state.meals++;
  jobs.shift()();
  await flush();
  assert.deepEqual(requests, [1, 2].map(() => ({
    journey: state.serverJourney.id, brief: CLOSING_STORY, summary: original,
  })));
  assert.ok(!JSON.stringify(requests).includes("PRIVATE"));
  assert.deepEqual(client.snapshot(state, CLOSING_STORY), generated);
  client.prefetch(state, [CLOSING_STORY]);
  await flush();
  assert.equal(calls, 2);
});

test("ongoing journeys and placement cannot queue endings; local endings retain authored copy without calls", async () => {
  let calls = 0;
  const narrative = createLiveNarrative({ fetcher: async () => { calls++; throw new Error("unexpected"); } });
  for (const ended of [null, "placement"]) narrative.prefetch(fixture(ended), [CLOSING_STORY]);
  const local = { ...fixture(), journalAccess: undefined };
  narrative.prefetch(local, [CLOSING_STORY]);
  await flush();
  assert.equal(calls, 0);
  assert.match(narrative.status(local, CLOSING_STORY, "en"), /local journey/);
});

test("failed or truncated closing prose falls back explicitly without automatic retries", async () => {
  for (const response of [
    { enabled: true, status: "failed", text: null },
    { enabled: true, status: "ready", text: { en: "Too short", fr: "Trop court" } },
    { enabled: true, status: "ready", text: { ...generated, en: "x".repeat(3001) } },
  ]) {
    let calls = 0;
    const client = createLiveNarrative({ fetcher: async () => {
      calls++;
      return { ok: true, json: async () => ({ brief: CLOSING_STORY, ...response }) };
    } });
    const state = fixture();
    client.prefetch(state, [CLOSING_STORY]);
    await flush();
    assert.equal(client.snapshot(state, CLOSING_STORY), null);
    assert.match(client.status(state, CLOSING_STORY, "en"), /failed/);
    client.prefetch(state, [CLOSING_STORY]);
    assert.equal(calls, 1);
  }
});

for (const language of ["fr", "en"]) {
  for (const outcome of ["hunger", "reunion"]) {
    test(`${language}/${outcome}: inline ending stays usable while generating, relocalizes and never changes gameplay`, async () => {
      const nodes = new Map();
      const doc = { documentElement: { lang: language }, querySelector(id) {
        if (!nodes.has(id)) nodes.set(id, { textContent: "", hidden: true });
        return nodes.get(id);
      } };
      let resolve;
      const requests = [];
      const narrative = createLiveNarrative({ fetcher: async (_, options) => {
        requests.push(JSON.parse(options.body));
        return new Promise(done => { resolve = done; });
      } });
      let state = fixture(outcome);
      const before = structuredClone(state);
      const tr = (key, args) => translate(doc.documentElement.lang, key, args);
      const ui = setupClosingStory(tr, { narrative, context: () => state, doc });
      ui.update();
      assert.equal(doc.querySelector("#closing-story").hidden, false);
      const authored = doc.querySelector("#closing-story-text").textContent;
      assert.equal(authored, closingStoryText(state, tr));
      assert.ok(authored.includes("309.00"));
      assert.match(doc.querySelector("#closing-story-status").textContent, /préparation|prepared/);
      resolve({ ok: true, json: async () => ({
        brief: CLOSING_STORY, enabled: true, status: "ready", text: generated,
      }) });
      await flush();
      assert.equal(doc.querySelector("#closing-story-text").textContent, generated[language]);
      assert.equal(doc.querySelector("#closing-story-status").textContent, tr("closingStoryGenerated"));
      const other = language === "fr" ? "en" : "fr";
      doc.documentElement.lang = other;
      ui.update();
      assert.equal(doc.querySelector("#closing-story-text").textContent, generated[other]);
      assert.equal(requests.length, 1);
      assert.deepEqual(state, before);
      state = null;
      ui.update();
      assert.equal(doc.querySelector("#closing-story").hidden, true);
      assert.equal(doc.querySelector("#closing-story-text").textContent, "");
    });
  }
}

test("main host integrates the chronicle after ending, and includes available prose in notebook publication", () => {
  const host = readFileSync(new URL("../travel-ui.mjs", import.meta.url), "utf8");
  assert.match(host, /setupClosingStory\(t,[\s\S]*?context: \(\) => active \? state : null/);
  assert.match(host, /closingStory\.update\(\)/);
  assert.match(host, /closingStoryText\(previous, t, liveNarrative\.snapshot\(previous, CLOSING_STORY\)/);
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /id="journey-ended"[\s\S]*?id="closing-story" hidden open[\s\S]*?id="closing-story-status" role="status"/);
});
