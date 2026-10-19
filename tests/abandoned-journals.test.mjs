import test from "node:test";
import assert from "node:assert/strict";
import { createJournalClient, pendingJournalCreation, finishJournalCreation,
  journalRequest } from "../abandoned-journals.mjs";

function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
const state = { serverJourney: { id: "1".repeat(32) }, journalAccess: "2".repeat(64),
  col: 5, row: 8, ended: "hunger", trail: { index: 3 },
  photos: ["private"], notes: "personal", name: "personal" };
const response = value => new Response(JSON.stringify(value), {
  headers: { "Content-Type": "application/json" },
});

test("zero-health death is durably queued and flushed without publishing extra private state", async () => {
  const local = storage(), calls = [];
  const client = createJournalClient(local, async (url, options) => {
    calls.push(JSON.parse(options.body));
    return response({});
  });
  client.queueDeath({ ...state, health: 0, ended: "health" });
  await client.flush();
  await client.flush();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].ended, "health");
  assert.equal(calls[0].health, undefined);
  assert.equal(calls[0].notes, undefined);
});

test("capability and request ID are persisted before network and reused across reloads", () => {
  const local = storage(), pending = pendingJournalCreation(local, "firmi", "Alex");
  assert.match(pending.capability, /^[a-f0-9]{64}$/);
  assert.deepEqual(pendingJournalCreation(local, "firmi", "Alex"), pending);
  assert.notEqual(pendingJournalCreation(local, "firmi", "Noa").capability, pending.capability);
  finishJournalCreation(local, "firmi");
  assert.notEqual(pendingJournalCreation(local, "firmi", "Alex").requestId, pending.requestId);
  assert.throws(() => pendingJournalCreation({ ...local, setItem() { throw Error("full"); } },
    "other", "Alex"), /full/);
});

test("death outbox survives offline failure, reload and replacement with another run", async () => {
  const local = storage(), offline = createJournalClient(local, async () => { throw Error("offline"); });
  offline.queueDeath(state);
  offline.queueDeath({ ...state, row: 99 });
  offline.queueDeath({ ...state, ended: "reunion" });
  await assert.rejects(offline.flush(), /offline/);
  const calls = [];
  const online = createJournalClient(local, async (url, options) => {
    calls.push({ url, options });
    return response({});
  });

  test("terminal placement is durably published but recoverable episodes remain private", async () => {
    const local = storage(), calls = [];
    const client = createJournalClient(local, async (url, options) => {
      calls.push(JSON.parse(options.body));
      return response({});
    });
    client.queueDeath({ ...state, ended: null, pressures: { placements: [{}] } });
    await client.flush();
    assert.equal(calls.length, 0);
    client.queueDeath({ ...state, ended: "placement" });
    await client.flush();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].ended, "placement");
    assert.equal(calls[0].col, state.col);
    assert.equal(calls[0].row, state.row);
  });
  await online.flush();
  await online.flush();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers["X-Journal-Capability"], state.journalAccess);
  const body = JSON.parse(calls[0].options.body);
  assert.deepEqual(body, journalRequest(state));
  assert.equal(body.row, 8);
  assert.ok(!JSON.stringify(body).includes("private"));
  assert.ok(!JSON.stringify(body).includes("personal"));
});

test("legacy and reunion saves never enqueue publication; server errors retain durable death", async () => {
  const local = storage(), calls = [];
  const client = createJournalClient(local, async (...args) => {
    calls.push(args);
    return new Response('{"error":"busy"}', { status: 503 });
  });
  client.queueDeath({ ...state, journalAccess: undefined });
  client.queueDeath({ ...state, ended: "reunion" });
  await client.flush();
  assert.equal(calls.length, 0);
  client.queueDeath(state);
  await assert.rejects(client.flush(), /busy/);
  await assert.rejects(client.flush(), /busy/);
  assert.equal(calls.length, 2);
});

test("side quest requests use expected step for retry safety without changing own trail", async () => {
  const before = structuredClone(state);
  const client = createJournalClient(storage(), async (url, options) => {
    assert.deepEqual(JSON.parse(options.body), {
      ...journalRequest(state), action: "advance", journal: "3".repeat(32), step: 4,
    });
    return response({ sidequests: [], nearby: [] });
  });
  await client.sync(state, "advance", { id: "3".repeat(32), step: 4 });
  assert.deepEqual(state, before);
});
