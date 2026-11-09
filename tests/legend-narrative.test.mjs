import test from "node:test";
import assert from "node:assert/strict";
import { createTownLegendNarratives } from "../legend-narrative.mjs";

const state = { serverJourney: { id: "a".repeat(32) }, journalAccess: "b".repeat(64) };
const pair = suffix => ({ en: `A memory kept alive by the neighbours who shared it. ${suffix}`,
  fr: `Un souvenir conservé par les voisins qui le partageaient. ${suffix}` });
const ready = { enabled: true, brief: "legend.town", status: "ready", text: pair("Story."),
  alternatives: [pair("Practical."), pair("Sentimental."), pair("Sceptical.")] };
const flush = () => new Promise(resolve => setImmediate(resolve));
const response = body => ({ ok: true, json: async () => body });

test("town story requests send only identity, poll queued wording and cache ready or failed records", async () => {
  const requests = [], scheduled = [];
  let queued = true;
  const narrative = createTownLegendNarratives({ schedule: fn => { scheduled.push(fn); return fn; }, cancel: () => {},
    fetcher: async (url, options) => {
      requests.push({ url, options });
      return response(queued ? { ...ready, status: "queued", text: null, alternatives: [] } : ready);
    } });
  let changes = 0;
  narrative.subscribe(() => changes++);
  narrative.request(state, "node/42");
  await flush();
  assert.equal(requests.length, 1);
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    journey: state.serverJourney.id, brief: "legend.town", townId: "node/42",
  });
  assert.equal(requests[0].options.headers["X-Journal-Capability"], state.journalAccess);
  assert.equal(narrative.get(state, "node/42").status, "queued");
  queued = false;
  scheduled.shift()();
  await flush();
  assert.deepEqual(narrative.get(state, "node/42"), ready);
  narrative.request(state, "node/42");
  await flush();
  assert.equal(requests.length, 2);
  assert.equal(changes, 3);
  narrative.reset();
});

test("malformed generated text fails visibly without repeated requests", async () => {
  for (const body of [{ ...ready, alternatives: ready.alternatives.slice(0, 2) },
    { ...ready, text: pair("x".repeat(701)) }, { ...ready, brief: "other" },
    { ...ready, text: { en: "Missing equivalent French." } }]) {
    let calls = 0;
    const narrative = createTownLegendNarratives({ fetcher: async () => { calls++; return response(body); } });
    const previous = console.error;
    console.error = () => {};
    try {
      narrative.request(state, "node/42");
      await flush();
      assert.equal(narrative.get(state, "node/42").status, "failed");
      narrative.request(state, "node/42");
      await flush();
      assert.equal(calls, 1);
    } finally { console.error = previous; narrative.reset(); }
  }
});

test("journey changes abort pending prose and cannot publish another player's reply", async () => {
  let resolve;
  const narrative = createTownLegendNarratives({ fetcher: () => new Promise(done => { resolve = done; }) });
  narrative.request(state, "node/42");
  const other = { ...state, serverJourney: { id: "c".repeat(32) } };
  assert.equal(narrative.get(other, "node/42"), undefined);
  resolve(response(ready));
  await flush();
  assert.equal(narrative.get(other, "node/42"), undefined);
  narrative.reset();
});

test("disabled or failed provider responses keep canonical gameplay independent and never poll again", async () => {
  for (const status of ["disabled", "failed"]) {
    let calls = 0, polls = 0;
    const narrative = createTownLegendNarratives({
      fetcher: async () => { calls++; return response({ ...ready, enabled: status !== "disabled",
        status, text: null, alternatives: [], error: "Provider unavailable" }); },
      schedule: () => { polls++; },
    });
    const previous = console.warn;
    console.warn = () => {};
    try {
      narrative.request(state, "node/42");
      await flush();
      narrative.request(state, "node/42");
      assert.equal(calls, 1);
      assert.equal(polls, 0);
      assert.equal(narrative.get(state, "node/42").status, status);
    } finally { console.warn = previous; narrative.reset(); }
  }
});
