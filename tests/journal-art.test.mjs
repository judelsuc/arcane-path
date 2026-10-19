import test from "node:test";
import assert from "node:assert/strict";
import { observeIllustrationDay, illustrationScenes, createJournalIllustrator } from "../journal-art.mjs";

const start = Date.UTC(2026, 9, 19, 23, 30);
const state = (elapsedMinutes = 0, extra = {}) => ({
  startedAt: start, elapsedMinutes, birthCard: "hermit", dailyCard: "moon",
  distanceMeters: 0, sleeps: 0, meals: 0, ...extra,
});
const tick = () => new Promise(resolve => setImmediate(resolve));

test("permanent cover captures initial tarot and coarse scenery, never identity or coordinates", () => {
  const history = observeIllustrationDay(null, state(0, { name: "PRIVATE", col: 100, row: 200 }), ["forest"]);
  assert.deepEqual(history.cover, {
    key: "cover", birth: "hermit", daily: "moon", scenes: ["forest"], activities: [], partial: false,
  });
  assert.doesNotMatch(JSON.stringify(history), /PRIVATE|"col"|"row"/);
  const next = observeIllustrationDay(history, state(20, { dailyCard: "sun" }), ["town"]);
  assert.deepEqual(next.cover, history.cover);
  assert.equal(next.days.length, 0);
});

test("daily memories settle at UTC midnight, not every 24 hours or every sleep", () => {
  let history = observeIllustrationDay(null, state(), ["forest"]);
  history = observeIllustrationDay(history, state(29, { distanceMeters: 500 }), ["forest"]);
  assert.equal(history.days.length, 0);
  history = observeIllustrationDay(history, state(30, { distanceMeters: 750, dailyCard: "sun" }), ["town"]);
  assert.equal(history.days.length, 1);
  assert.equal(history.days[0].key, "2026-10-19");
  assert.deepEqual(history.days[0].activities, ["walking"]);
  assert.equal(history.days[0].daily, "moon");
  assert.equal(history.current.key, "2026-10-20");
  assert.equal(history.current.daily, "sun");
  history = observeIllustrationDay(history, state(510, { distanceMeters: 750, sleeps: 1, dailyCard: "sun" }), ["town"]);
  assert.equal(history.days.length, 1);
  assert.ok(history.current.activities.includes("sleep"));
});

test("sleep across several midnights preserves each day and does not invent intermediate meals or work", () => {
  let history = observeIllustrationDay(null, state(), ["mountains"]);
  history = observeIllustrationDay(history, state(3000, { sleeps: 1, meals: 1 }), ["mountains"]);
  assert.deepEqual(history.days.map(day => day.key), ["2026-10-19", "2026-10-20", "2026-10-21"]);
  for (const day of history.days) {
    assert.deepEqual(day.activities, ["sleep"]);
    assert.ok(!day.activities.includes("work"));
  }
  assert.ok(history.current.activities.includes("meal"));
});

test("joining an old journey starts partial observations rather than fabricating past days", () => {
  const history = observeIllustrationDay(null, state(3000), ["town"]);
  assert.equal(history.days.length, 0);
  assert.equal(history.current.partial, true);
  assert.throws(() => observeIllustrationDay(history, state(0), []), /rewound/);
  assert.throws(() => observeIllustrationDay(null, state(0, { dailyCard: "unknown" }), []), /Invalid/);
  assert.throws(() => observeIllustrationDay(null, state(), ["exact private place"]), /Invalid/);
});

test("scenery tags include only coarse actual terrain and known weather", () => {
  assert.deepEqual(illustrationScenes("forest", "rain"), ["forest", "rain"]);
  assert.deepEqual(illustrationScenes("mountain", "snow"), ["mountains", "snow"]);
  assert.deepEqual(illustrationScenes("place"), ["town"]);
  assert.deepEqual(illustrationScenes(undefined), []);
});

test("client queues the cover once, downloads ready artwork, persists it, then queues completed days", async () => {
  const storageRows = new Map(), calls = [], assets = [], statuses = [];
  const storage = { getItem: key => storageRows.get(key) ?? null, setItem: (key, value) => storageRows.set(key, value) };
  const entries = [];
  const illustrator = createJournalIllustrator({
    storage, schedule: () => 1, cancel() {},
    fetcher: async (url, options) => {
      assert.equal(url, "/api/journal-art");
      const body = JSON.parse(options.body);
      calls.push(body);
      assert.equal(options.headers["X-Journal-Capability"], "private-fixture");
      if (body.operation === "image") return {
        ok: true, blob: async () => new Blob(["fixture"], { type: "image/webp" }),
      };
      if (body.operation === "enqueue") entries.push({
        key: body.brief.key, brief: body.brief, status: "ready", model: "fixture", license: "fixture",
      });
      return { ok: true, json: async () => ({ enabled: true, entries: structuredClone(entries) }) };
    },
    onAsset: async (...args) => assets.push(args), onStatus: status => statuses.push(status),
  });
  const credentials = { serverJourney: { id: "journey" }, journalAccess: "private-fixture", name: "PRIVATE" };
  illustrator.observe(state(0, credentials), ["forest"]);
  await tick();
  assert.equal(assets.length, 1);
  assert.equal(calls.filter(call => call.operation === "enqueue").length, 1);
  illustrator.observe(state(30, { ...credentials, distanceMeters: 500 }), ["forest"]);
  await tick();
  assert.equal(calls.filter(call => call.operation === "enqueue").length, 2);
  assert.equal(assets.length, 2);
  const stored = [...storageRows.values()][0];
  assert.doesNotMatch(stored, /PRIVATE|private-fixture/);
  assert.equal(statuses.at(-1), "ready");
  illustrator.stop();
});

test("disabled service makes no provider enqueue and missing credentials make no request", async () => {
  let calls = 0;
  const statuses = [];
  const illustrator = createJournalIllustrator({
    storage: { getItem: () => null, setItem() {} },
    fetcher: async () => { calls++; return { ok: true, json: async () => ({ enabled: false, entries: [] }) }; },
    onStatus: value => statuses.push(value),
  });
  illustrator.observe(state(), []);
  assert.equal(calls, 0);
  const source = { serverJourney: { id: "journey" }, journalAccess: "fixture" };
  illustrator.observe(state(0, source), []);
  await tick();
  illustrator.observe(state(30, source), []);
  await tick();
  assert.equal(calls, 1);
  assert.deepEqual(statuses, ["disabled"]);
  illustrator.stop();
});
