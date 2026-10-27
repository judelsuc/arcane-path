import test from "node:test";
import assert from "node:assert/strict";
import { createCharactersClient } from "../characters-client.mjs";

test("character client uses the private capability for exchanges, contracts and portraits", async () => {
  const calls = [];
  const client = createCharactersClient({
    newRequestId: () => "00000000-0000-4000-8000-000000000001",
    async fetcher(path, options) {
      calls.push({ path, options });
      return { ok: true, json: async () => ({ characters: [], canCreate: true, factIds: [] }),
        blob: async () => new Blob(["portrait"]) };
    },
  });
  const state = { serverJourney: { id: "a".repeat(32) }, journalAccess: "b".repeat(64), col: 8, row: 9 };
  await client.list(state);
  await client.create(state);
  await client.meet(state, "c".repeat(32));
  await client.exchange(state, "c".repeat(32), "parent");
  await client.contract(state, "c".repeat(32),
    { id: "d".repeat(32), event: "offered", step: 0, totalSteps: 2 },
    { location: { col: 3, row: 4 } });
  await client.portrait(state, "c".repeat(32));
  await client.visitors(state, "c".repeat(32), { cursor: "Camille", limit: 10 });
  assert.equal(calls.length, 7);
  const requests = calls.map(({ path, options }) => ({
    path, headers: options.headers, body: JSON.parse(options.body),
  }));
  for (const request of requests) {
    assert.equal(request.path, "/api/characters");
    assert.equal(request.headers["X-Journal-Capability"], state.journalAccess);
    if (request.body.action !== "contract") {
      assert.deepEqual(request.body.location, { col: 8, row: 9 });
    }
    assert.equal(request.body.journey, state.serverJourney.id);
  }
  assert.equal(requests[0].body.action, "list");
  assert.equal(requests[1].body.action, "create");
  assert.equal(requests[1].body.requestId, "00000000-0000-4000-8000-000000000001");
  assert.equal(requests[2].body.action, "meet");
  assert.equal(requests[3].body.action, "exchange");
  assert.equal(requests[3].body.topic, "parent");
  assert.equal(requests[4].body.action, "contract");
  assert.deepEqual(requests[4].body.contract,
    { id: "d".repeat(32), event: "offered", step: 0, totalSteps: 2 });
  assert.deepEqual(requests[4].body.location, { col: 3, row: 4 });
  assert.equal(requests[5].body.action, "portrait");
  assert.deepEqual(requests[6].body, { action: "visitors", journey: state.serverJourney.id,
    location: { col: 8, row: 9 }, characterId: "c".repeat(32), cursor: "Camille", limit: 10 });
  assert.equal("elapsedMinutes" in requests[3].body, false);
});

test("character client rejects missing authorization and unknown topics", async () => {
  const client = createCharactersClient({ fetcher: async () => { throw new Error("unexpected request"); } });
  await assert.rejects(client.list({}), /private capability/);
  assert.throws(() => client.exchange({
    serverJourney: { id: "a".repeat(32) }, journalAccess: "b".repeat(64), col: 0, row: 0,
  }, "c".repeat(32), "hidden-stage"), /Unknown character conversation topic/);
});
