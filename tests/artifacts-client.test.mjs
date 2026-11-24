import test from "node:test";
import assert from "node:assert/strict";
import { createArtifactsClient } from "../artifacts-client.mjs";
import { GENERATED_INVESTIGATION_VERSION, replayLegendSession, DUNGEON_SESSION_VERSION,
  PACED_PLATFORM_VERSION, PACED_INVESTIGATION_VERSION, PACED_DUNGEON_VERSION, isDungeonSession } from "../legend-session.mjs";
import { adventureCosts, dungeonCosts } from "../adventure-costs.mjs";

const initial = { serverJourney: { id: "a".repeat(32) }, journalAccess: "b".repeat(64) };
const view = { world: "main-artifacts-v1", revision: 1, state: { ...initial, artifactRevision: 1 }, owned: [], offers: [] };
function memory() {
  const entries = new Map();
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value),
    removeItem: key => entries.delete(key) };
}
const reply = (body, status = 200) => new Response(JSON.stringify(body),
  { status, headers: { "Content-Type": "application/json" } });

test("paced content versions validate canonical responses without accepting reported puzzle or latch state", async () => {
  for (const contentVersion of [PACED_PLATFORM_VERSION, PACED_INVESTIGATION_VERSION, PACED_DUNGEON_VERSION]) {
    const dungeon = isDungeonSession(contentVersion), runId = "00000000-0000-4000-8000-000000000001";
    const progress = replayLegendSession({ contentVersion, seed: 4, weapon: "none", actions: [] });
    const adventure = { version: 1, contentVersion, runId, townId: "node/42", town: "Firmi", seed: 4,
      col: 14, row: 10, actions: [], status: "active", metrics: progress.metrics,
      costs: dungeon ? dungeonCosts(progress.metrics) : adventureCosts(progress.metrics),
      ...(dungeon ? { weapon: "none", foodKcal: 0 } : {}) };
    const result = { ...view, adventure, state: { ...view.state, col: 14, row: 10, legendAdventure: { version: 1, runId } } };
    const client = createArtifactsClient({ storage: memory(), fetcher: async () => reply(result) });
    assert.deepEqual(await client.request(initial), result);
    for (const extra of [{ activated: ["0:key"] }, { resolved: true }, { difficulty: "easy" }]) {
      const forged = createArtifactsClient({ storage: memory(), fetcher: async () => reply({
        ...result, adventure: { ...adventure, ...extra },
      }) });
      await assert.rejects(forged.request(initial), /Invalid authoritative/);
    }
  }
});

test("artifact receipt survives dropped response and local-save failure until explicit acknowledgement", async () => {
  const storage = memory(), requests = [];
  let dropped = true;
  const fetcher = async (url, options) => {
    assert.equal(url, "/api/artifacts");
    assert.equal(options.headers["X-Journal-Capability"], initial.journalAccess);
    requests.push(options.body);
    if (dropped) { dropped = false; throw new Error("Connection lost after server commit"); }
    return reply(view);
  };
  const first = createArtifactsClient({ storage, fetcher });
  await assert.rejects(first.request(initial, { type: "claim", id: "hermit" }), /Connection lost/);
  assert.equal(first.pending(initial), true);
  const reloaded = createArtifactsClient({ storage, fetcher });
  assert.deepEqual(await reloaded.request(initial), view);
  assert.equal(requests[0], requests[1]);
  assert.equal(reloaded.pending(initial), true);
  await assert.rejects(reloaded.request(initial, { type: "use", id: "hermit" }), /Retry/);
  assert.deepEqual(await reloaded.request(initial), view);
  reloaded.acknowledge(view.state);
  assert.equal(reloaded.pending(initial), false);
});

test("invalid artifact successes retain pending requests; permanent rejections explicitly clear them", async () => {
  for (const response of [{}, { ...view, world: "lore-playtest-v1" }, { ...view, revision: 0 }]) {
    const storage = memory(), client = createArtifactsClient({ storage, fetcher: async () => reply(response) });
    await assert.rejects(client.request(initial), /Invalid/);
    assert.equal(client.pending(initial), true);
  }
  for (const status of [400, 403, 409, 503]) {
    const storage = memory(), client = createArtifactsClient({ storage,
      fetcher: async () => reply({ error: "Explicit rejection" }, status) });
    await assert.rejects(client.request(initial), /Explicit rejection/);
    assert.equal(client.pending(initial), status === 503);
  }
});

test("unavailable storage prevents any artifact transmission", async () => {
  let calls = 0;
  const client = createArtifactsClient({ storage: { ...memory(), setItem() { throw new Error("Storage full"); } },
    fetcher: async () => { calls++; return reply(view); } });
  await assert.rejects(client.request(initial), /Storage full/);
  assert.equal(calls, 0);
});

test("a missing or malformed authoritative session cannot acknowledge real adventure charges", async () => {
  for (const adventure of [undefined, { version: 1, actions: [], status: "active" }]) {
    const storage = memory(), client = createArtifactsClient({ storage, fetcher: async () => reply({
      ...view, state: { ...view.state, legendAdventure: { version: 1, runId: "00000000-0000-4000-8000-000000000001" } },
      adventure,
    }) });
    await assert.rejects(client.request(initial, { type: "legend-start" }), /legend session/);
    assert.equal(client.pending(initial), true);
  }
});

test("generated session responses survive dropped receipts and reject forged costs or unsupported content", async () => {
  const runId = "00000000-0000-4000-8000-000000000001";
  const progress = replayLegendSession({ contentVersion: GENERATED_INVESTIGATION_VERSION, seed: 4, actions: [] });
  const adventure = { version: 1, contentVersion: GENERATED_INVESTIGATION_VERSION, runId,
    townId: "node/42", town: "Firmi", seed: 4, col: 14, row: 10, actions: [], status: "active",
    costs: adventureCosts(progress.metrics), metrics: progress.metrics };
  const result = { ...view, adventure, state: { ...view.state, col: 14, row: 10,
    legendAdventure: { version: 1, runId } } };
  const storage = memory(), requests = [];
  let dropped = true;
  const fetcher = async (_url, options) => {
    requests.push(options.body);
    if (dropped) { dropped = false; throw new Error("Response lost"); }
    return reply(result);
  };
  const first = createArtifactsClient({ storage, fetcher });
  await assert.rejects(first.request(initial, { type: "legend-start", townId: "node/42",
    contentVersion: GENERATED_INVESTIGATION_VERSION }), /Response lost/);
  const reloaded = createArtifactsClient({ storage, fetcher });
  assert.deepEqual(await reloaded.request(initial), result);
  assert.equal(requests[0], requests[1]);
  assert.equal(reloaded.pending(initial), true);
  reloaded.acknowledge(result.state);
  assert.equal(reloaded.pending(initial), false);
  for (const change of [{ contentVersion: "seeded-investigation-v99" }, { seed: undefined },
    { costs: { ...adventure.costs, minutes: 0 } }, { metrics: { ...adventure.metrics, roomEntries: 999 } }]) {
    const client = createArtifactsClient({ storage: memory(), fetcher: async () => reply({
      ...result, adventure: { ...adventure, ...change },
    }) });
    await assert.rejects(client.request(initial));
    assert.equal(client.pending(initial), true);
  }
});

test("dungeon responses validate canonical weapon and creature accounting before acknowledging charges", async () => {
  const runId = "00000000-0000-4000-8000-000000000001";
  const progress = replayLegendSession({ contentVersion: DUNGEON_SESSION_VERSION, seed: 4, weapon: "none", actions: [] });
  const adventure = { version: 1, contentVersion: DUNGEON_SESSION_VERSION, runId,
    townId: "node/42", town: "Firmi", seed: 4, col: 14, row: 10, actions: [], status: "active", weapon: "none",
    costs: dungeonCosts(progress.metrics), metrics: progress.metrics };
  const result = { ...view, adventure, state: { ...view.state, col: 14, row: 10,
    legendAdventure: { version: 1, runId } } };
  const storage = memory(), requests = [];
  let dropped = true;
  const fetcher = async (_url, options) => {
    requests.push(options.body);
    if (dropped) { dropped = false; throw new Error("Response lost"); }
    return reply(result);
  };
  const client = createArtifactsClient({ storage, fetcher });
  await assert.rejects(client.request(initial, { type: "legend-input", runId, input: { type: "wait" } }), /Response lost/);
  const recovered = createArtifactsClient({ storage, fetcher });
  assert.deepEqual(await recovered.request(initial), result);
  assert.equal(requests[0], requests[1]);
  assert.equal(recovered.pending(initial), true);
  recovered.acknowledge(result.state);
  assert.equal(recovered.pending(initial), false);
  for (const patch of [{ weapon: "sword" }, { weapon: undefined },
    { metrics: { ...adventure.metrics, creatureHits: 10 } }, { costs: { ...adventure.costs, minutes: 0 } }]) {
    const invalid = createArtifactsClient({ storage: memory(), fetcher: async () => reply({
      ...result, adventure: { ...adventure, ...patch },
    }) });
    await assert.rejects(invalid.request(initial));
    assert.equal(invalid.pending(initial), true);
  }
});
