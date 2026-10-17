import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServerJourney, validateServerJourney } from "../server-journey.mjs";
import { createJourneyStore, createSave, validateSave } from "../journey-save.mjs";
import { walkSurvival } from "../survival.mjs";
import { finishAction, refreshPricing } from "../economy.mjs";

const root = new URL("../", import.meta.url);
const python = existsSync(new URL(".venv/bin/python", root)) ? ".venv/bin/python" : "python3";
const { record, variants } = JSON.parse(execFileSync(python, ["-c", `
import copy, json, sys, tempfile, uuid
from pathlib import Path
sys.path.insert(0, "scripts")
from journeys import JourneyStore, initial_state
from travel_server import ChunkStore, atomic_write
with tempfile.TemporaryDirectory() as directory:
    chunks = ChunkStore(cache=Path(directory))
    record, _ = JourneyStore(chunks, atomic_write).create({
        "requestId": str(uuid.uuid4()), "region": "firmi", "name": "Alex"})
    variants = []
    for card in record["economy"]["tarot"]:
        variant = copy.deepcopy(record)
        variant["state"] = initial_state(chunks.bases["firmi"], "Alex",
            record["state"]["startedAt"], card, record["survival"], record["economy"],
            record["state"]["trail"])
        variant["state"]["serverJourney"] = record["state"]["serverJourney"]
        variant["state"]["trail"] = copy.deepcopy(record["state"]["trail"])
        variant["state"]["trail"]["story"]["birthCard"] = card["id"]
        variants.append(variant)
    print(json.dumps({"record": record, "variants": variants}))
`], { cwd: root, encoding: "utf8" }));
const map = JSON.parse(readFileSync(new URL("../public/map.json", import.meta.url)));
const response = (value = record, status = 201) => new Response(JSON.stringify(value), {
  status, headers: { "Content-Type": "application/json" },
});

test("Python initial states match existing JavaScript rules for every starting tarot", () => {
  assert.equal(variants.length, 22);
  assert.equal(new Set(variants.map(v => v.state.birthCard)).size, 22);
  for (const variant of variants) {
    assert.equal(validateServerJourney(variant, "firmi", map, "Alex"), variant);
  }
});

test("new game sends only region, name and a stable request ID and accepts idempotent replay", async () => {
  const id = crypto.randomUUID(), controller = new AbortController();
  for (const status of [201, 200]) {
    const result = await createServerJourney("firmi", map, "Alex", id, controller.signal,
      async (url, options) => {
        assert.equal(url, "/api/journeys");
        assert.equal(options.method, "POST");
        assert.equal(options.headers["Content-Type"], "application/json");
        assert.deepEqual(JSON.parse(options.body), { region: "firmi", name: "Alex", requestId: id });
        assert.equal(options.signal.aborted, false);
        return response(record, status);
      });
    assert.deepEqual(result, record);
  }
});

test("creation rejects wrong map, name, region, metadata and progressed or modified starting state", () => {
  for (const modify of [
    r => { r.version = 2; }, r => { r.region = "paris"; },
    r => { r.mapIdentity = "{}"; }, r => { r.mapIdentity = "not json"; },
    r => { r.state.name = "Noa"; }, r => { delete r.state.serverJourney; },
    r => { r.state.serverJourney.seed = 12345678; },
    r => { r.state.serverJourney.id = "bad"; },
    r => { r.state.serverJourney.createdAt = "2020-01-01T00:00:00Z"; },
    r => { r.state.serverJourney.contentVersion = "unknown"; },
    r => { r.state.fatigue = 1; }, r => { r.state.walletCents++; },
    r => { r.state.reserveKcal--; }, r => { r.state.col++; },
    r => { r.state.trail.index = 1; },
  ]) {
    const changed = structuredClone(record);
    modify(changed);
    assert.throws(() => validateServerJourney(changed, "firmi", map, "Alex"));
  }
});

test("explicit API errors, old static servers and cancellation never create a fallback journey", async () => {
  const controller = new AbortController(), id = crypto.randomUUID();
  for (const status of [400, 409, 500, 503]) {
    await assert.rejects(createServerJourney("firmi", map, "Alex", id, controller.signal,
      async () => response({ error: "Creation unavailable" }, status)), /Creation unavailable/);
  }
  await assert.rejects(createServerJourney("firmi", map, "Alex", id, controller.signal,
    async () => new Response("<html>Old server</html>")), /updated game server/);
  controller.abort();
  await assert.rejects(createServerJourney("firmi", map, "Alex", id, controller.signal,
    async () => assert.fail("Aborted requests must not be sent")), { name: "AbortError" });
  const during = new AbortController();
  await assert.rejects(createServerJourney("firmi", map, "Alex", id, during.signal, async () => {
    during.abort();
    return response();
  }), { name: "AbortError" });
});

test("server identity survives progress, exact local saves and pricing refresh without requiring cloud resume", () => {
  const cell = { terrain: "plain", elevationMeters: 100 };
  const info = { latitude: 44.54, longitude: 2.3 };
  const state = finishAction(record.state,
    walkSurvival(record.state, 1, 0, cell, cell, record.survival), info, record.economy);
  const values = new Map(), storage = {
    getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v),
  };
  const store = createJourneyStore(storage);
  store.read("firmi");
  store.write({ region: "firmi", map, state, survival: record.survival, economy: record.economy });
  const restored = createJourneyStore(storage).read("firmi");
  assert.deepEqual(restored.state, state);
  assert.deepEqual(restored.state.serverJourney, record.state.serverJourney);
  const refreshed = refreshPricing(restored.economy, record.economy);
  store.write({ region: "firmi", map, state: restored.state,
    survival: restored.survival, economy: refreshed });
  assert.deepEqual(store.read("firmi").state.serverJourney, record.state.serverJourney);
  assert.ok(restored.state.distanceMeters > 0);
  const legacy = createSave({ region: "firmi", map, state, survival: record.survival,
    economy: record.economy }, 1);
  delete legacy.state.serverJourney;
  assert.equal(validateSave(legacy), legacy);
});
