import test from "node:test";
import assert from "node:assert/strict";
import { questDirectionTargets, recordQuestDirections, validateQuestDirections } from "../quest-knowledge.mjs";
import { createLiveNarrative } from "../live-narrative.mjs";
import { createQuestDestinationClient } from "../service-quest-client.mjs";

const point = (id, name) => ({ id, name, town: "Known town", latitude: 45, longitude: 3 });
const start = () => ({
  elapsedMinutes: 60,
  trail: { index: 0, history: [], stages: [{ ...point("parent", "SECRET parent") }],
    exploration: { firstStage: 0, knownStage: null, hints: [], reports: [] } },
  serviceQuests: { quests: [
    { id: "one", status: "active", step: 0, destinations: [point("node/1", "First"), point("node/2", "Later")] },
    { id: "two", status: "active", step: 0, destinations: [point("node/1", "First")] },
    { id: "closed", status: "completed", step: 1, destinations: [point("node/3", "Closed")] },
  ] },
  sidequests: [{ id: "journal", parent: "Other parent", step: 0, delivered: false,
    stages: [point("journal/1", "Journal destination"), point("journal/2", "SECRET journal stage")] }],
});

test("directions include every announced service step, untracked quests and the authorized journal target", () => {
  const state = start(), before = structuredClone(state);
  const targets = questDirectionTargets(state);
  assert.deepEqual(targets.map(target => target.name), ["First", "Later", "Journal destination"]);
  assert.equal(targets[0].references.length, 2);
  assert.equal(targets.filter(target => target.town === "Known town").length, 3);
  assert.doesNotMatch(JSON.stringify(targets), /SECRET|Closed/);
  assert.deepEqual(state, before);
});

test("earned directions persist separately without unlocking or completing a quest", () => {
  const state = start(), target = questDirectionTargets(state)[0];
  const next = recordQuestDirections(state, target, "Take the eastern road.", "en");
  assert.deepEqual(next.serviceQuests, state.serviceQuests);
  assert.deepEqual(next.trail, state.trail);
  assert.equal(next.questDirections.length, 1);
  validateQuestDirections(next);
  assert.throws(() => recordQuestDirections(state, { ...target, key: "hidden" }, "Go there", "en"), /Invalid/);
  assert.throws(() => validateQuestDirections({ ...next, elapsedMinutes: 0 }), /Invalid/);
});

test("quest wording is isolated by instance and phase and sends no private journal or route", async () => {
  const requests = [];
  const client = createLiveNarrative({ fetcher: async (_, options) => {
    const body = JSON.parse(options.body); requests.push(body);
    return new Response(JSON.stringify({ enabled: true, status: "ready", brief: "quest.service",
      text: { en: `Request ${body.quest.phase}.`, fr: `Demande ${body.quest.phase}.` } }));
  } });
  const state = { ...start(), serverJourney: { id: "a".repeat(32) }, journalAccess: "b".repeat(64),
    notes: "PRIVATE" };
  const quest = { template: "star.employment-check", instance: "c".repeat(32), phase: "offer", reason: "money" };
  client.prefetchQuest(state, quest);
  await new Promise(resolve => setImmediate(resolve));
  client.prefetchQuest(state, { ...quest, phase: "arrival" });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests.length, 2);
  assert.equal(client.questSnapshot(state, quest.instance, "offer").en, "Request offer.");
  assert.equal(client.questSnapshot(state, quest.instance, "arrival").en, "Request arrival.");
  assert.equal(client.questSnapshot(state, "d".repeat(32), "offer"), null);
  assert.doesNotMatch(JSON.stringify(requests), /PRIVATE|SECRET|latitude/);
  assert.equal(client.questSnapshot({ ...state, serverJourney: { id: "e".repeat(32) } }, quest.instance, "offer"), null);
});

test("destination polling reuses the frozen request and explicitly surfaces failed lookups", async () => {
  const bodies = [];
  const client = createQuestDestinationClient({ wait: async () => {}, fetcher: async (_, options) => {
    bodies.push(options.body);
    return new Response(JSON.stringify(bodies.length === 1 ? { status: "running" }
      : { status: "ready", destinations: [point("node/1", "POI")], distanceKm: 50 }));
  } });
  const state = { col: 1, row: 2, serverJourney: { id: "a".repeat(32) }, journalAccess: "b".repeat(64) };
  const request = { template: "example", nonce: "c".repeat(32), scope: "regional" };
  const ready = await client.prepare(state, request);
  assert.equal(ready.status, "ready");
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
  const failed = createQuestDestinationClient({ fetcher: async () =>
    new Response(JSON.stringify({ status: "failed", error: "Route provider unavailable" })) });
  await assert.rejects(failed.prepare(state, request), /Route provider unavailable/);
});
