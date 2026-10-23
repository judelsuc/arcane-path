import test from "node:test";
import assert from "node:assert/strict";
import { createArtifactsClient } from "../artifacts-client.mjs";

const initial = { serverJourney: { id: "a".repeat(32) }, journalAccess: "b".repeat(64) };
const view = { world: "main-artifacts-v1", revision: 1, state: { ...initial, artifactRevision: 1 }, owned: [], offers: [] };
function memory() {
  const entries = new Map();
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value),
    removeItem: key => entries.delete(key) };
}
const reply = (body, status = 200) => new Response(JSON.stringify(body),
  { status, headers: { "Content-Type": "application/json" } });

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
