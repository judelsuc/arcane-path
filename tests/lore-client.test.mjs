import test from "node:test";
import assert from "node:assert/strict";
import { createLoreClient } from "../lore-client.mjs";

const source = { id: "a".repeat(32), capability: "b".repeat(64) };
const key = `arcane-lore-pending-v1:${source.id}`;
const view = revision => ({ version: 1, world: "lore-playtest-v1", revision, state: {} });
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key) };
}
const response = (body, status = 200, type = "application/json") =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": type } });

test("only commands, revision and the private capability are transmitted; pending precedes the network", async () => {
  const saved = storage(), action = { type: "walk", dc: 0, dr: 1 };
  const client = createLoreClient(source, saved, async (url, options) => {
    assert.equal(url, "/api/lore-playtest");
    assert.equal(options.method, "POST");
    assert.equal(options.headers["X-Journal-Capability"], source.capability);
    const pending = JSON.parse(saved.getItem(key)), body = JSON.parse(options.body);
    assert.deepEqual(body, { ...pending, journey: source.id });
    assert.deepEqual(pending.action, action);
    assert.equal(pending.expectedRevision, 7);
    assert.match(pending.requestId, /^[a-f0-9-]{36}$/);
    assert.equal(pending.operation, "action");
    assert.deepEqual(Object.keys(pending).sort(), ["action", "expectedRevision", "operation", "requestId"]);
    return response(view(8));
  });
  assert.deepEqual(await client.act(7, action), view(8));
  assert.equal(client.pending(), false);
});

test("a dropped committed response survives reload and replays the exact receipt before resynchronizing", async () => {
  const saved = storage(), action = { type: "use", id: "hermit", target: "chariot" };
  let committed, calls = 0;
  const first = createLoreClient(source, saved, async (_url, options) => {
    committed = JSON.parse(options.body);
    throw new TypeError("Connection dropped after commit.");
  });
  await assert.rejects(first.act(3, action), /Connection dropped/);
  assert.equal(first.pending(), true);
  const resumed = createLoreClient(source, saved, async (_url, options) => {
    const body = JSON.parse(options.body);
    if (calls++ === 0) {
      assert.deepEqual(body, committed);
      assert.notEqual(saved.getItem(key), null);
      return response(view(4));
    }
    assert.deepEqual(body, { operation: "start", journey: source.id });
    assert.equal(saved.getItem(key), null);
    return response(view(5));
  });
  assert.deepEqual(await resumed.sync(), view(5));
  assert.equal(calls, 2);
  assert.equal(resumed.pending(), false);
});

test("transient responses retain the exact pending command, permanent failures clear it explicitly", async () => {
  for (const status of [400, 403, 409, 429, 500, 503]) {
    const saved = storage();
    const client = createLoreClient(source, saved, async () => response({ error: `rejected-${status}` }, status));
    await assert.rejects(client.act(1, { type: "rest" }), new RegExp(`rejected-${status}`));
    assert.equal(client.pending(), ![400, 403, 409].includes(status));
  }
  const saved = storage();
  const client = createLoreClient(source, saved, async () => response("old server", 200, "text/html"));
  await assert.rejects(client.act(1, { type: "rest" }), /updated server/);
  assert.equal(client.pending(), true);
});

test("parallel commands, refresh and new commands while a receipt is pending are rejected", async () => {
  const saved = storage();
  let complete;
  const client = createLoreClient(source, saved, () => new Promise(resolve => { complete = resolve; }));
  const first = client.act(1, { type: "rest" });
  await assert.rejects(client.act(1, { type: "rest" }), /pending/);
  await assert.rejects(client.sync(), /already in flight/);
  complete(response(view(2)));
  await first;
  saved.setItem(key, JSON.stringify({ operation: "action" }));
  await assert.rejects(client.act(2, { type: "rest" }), /pending/);
});

test("storage failures prevent transmission, and separate journeys have independent pending receipts", async () => {
  let networkCalls = 0;
  const saved = storage();
  const broken = { ...saved, setItem: () => { throw new Error("Storage full."); } };
  const client = createLoreClient(source, broken, () => { networkCalls++; });
  await assert.rejects(client.act(1, { type: "rest" }), /Storage full/);
  assert.equal(networkCalls, 0);
  saved.setItem(key, "pending");
  const other = createLoreClient({ ...source, id: "c".repeat(32) }, saved, async () => response(view(1)));
  assert.equal(other.pending(), false);
  assert.deepEqual(await other.sync(), view(1));
  assert.equal(saved.getItem(key), "pending");
  assert.throws(() => createLoreClient({ id: source.id }, saved), /private/);
});

test("a malformed success response never acknowledges and deletes a durable command", async () => {
  for (const result of [{}, null, { ...view(1), world: "other" },
    { ...view(1), revision: 0 }, { ...view(1), state: null }, { ...view(1), state: [] }]) {
    const saved = storage();
    const client = createLoreClient(source, saved, async () => response(result));
    await assert.rejects(client.act(1, { type: "rest" }), /Invalid lore server response/);
    assert.equal(client.pending(), true);
  }
});
