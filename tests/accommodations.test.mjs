import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadAccommodations, cachedAccommodations, mergeAccommodations, withDiscoveredAccommodations } from "../accommodations.mjs";
import { sleepEconomy, startEconomy, applyBirthTarot, shelters } from "../economy.mjs";
import { startSurvival } from "../survival.mjs";

const place = { id: "relation/42", osmId: "relation/42", name: "Hostel", latitude: 50,
  longitude: 4, col: 16, row: 10, distance: 500, tags: { tourism: "hostel" },
  source: "OpenStreetMap", sourceUrl: "https://www.openstreetmap.org/relation/42",
  credit: "OpenStreetMap contributors", license: "ODbL",
  licenseUrl: "https://www.openstreetmap.org/copyright" };
const info = { latitude: 50, longitude: 4 };
const payload = (places = [place]) => ({ places, warnings: [], radiusMeters: 5000 });
const response = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json" },
});

test("loaded cells provide immediate bounded lodging without network and preserve exact chunk cells", () => {
  const poi = { osmId: "node/42", name: "Loaded hostel", latitude: 50, longitude: 4,
    tags: { tourism: "hostel" } };
  const base = { rows: [[{ pois: [poi, { ...poi, osmId: "node/43", tags: { ...poi.tags, access: "private" } },
    { ...poi, osmId: "node/44", longitude: 5 }] }]] };
  const chunk = { chunk: { x: -2, y: 3 }, rows: [[{ pois: [poi] }]] };
  const result = cachedAccommodations(base, [chunk], info);
  assert.equal(result.places.length, 1);
  assert.equal(result.places[0].col, -16);
  assert.equal(result.places[0].row, 24);
  assert.equal(result.places[0].distance, 0);
  const combined = mergeAccommodations(result, payload([{ ...place, id: "node/42", osmId: "node/42", name: "Updated" }, place]));
  assert.equal(combined.places.length, 2);
  assert.equal(combined.places.find(p => p.id === "node/42").name, "Updated");
  assert.equal(cachedAccommodations({ rows: [[{}]] }, [], info).places.length, 0);
});

test("cached server results are delivered during polling and unsafe provisional places are rejected", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let delivered, calls = 0;
  const loading = loadAccommodations("firmi", info, new AbortController().signal, async () =>
    ++calls === 1 ? response({ progress: { phase: "provider", cached: payload() } }, 202) : response(payload()),
  progress => { if (progress.cached) delivered = progress.cached; });
  for (let i = 0; i < 30 && !delivered; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(delivered.places[0].name, place.name);
  assert.equal(calls, 1);
  t.mock.timers.tick(1500);
  await loading;
  await assert.rejects(loadAccommodations("firmi", info, new AbortController().signal, async () =>
    response({ progress: { phase: "osm", cached: payload([{ ...place, sourceUrl: "javascript:alert(1)" }]) } }, 202)),
  /Invalid nearby accommodation/);
});

test("nearby lodging request uses exact player coordinates and accepts relation and supplementary sources", async () => {
  const supplementary = { ...place, id: "https://data.datatourisme.fr/42", osmId: undefined,
    source: "DATAtourisme", sourceUrl: "https://data.datatourisme.fr/42" };
  const result = await loadAccommodations("firmi", info, new AbortController().signal, async (url, options) => {
    const query = new URL(url, "https://example.org").searchParams;
    assert.equal(query.get("region"), "firmi");
    assert.equal(query.get("latitude"), "50");
    assert.equal(query.get("longitude"), "4");
    assert.ok(options.signal instanceof AbortSignal);
    return response(payload([place, supplementary]));
  });
  assert.equal(result.places.length, 2);
});

test("malformed lodging, unsafe URLs, out-of-radius and server errors are explicit", async () => {
  for (const changed of [{ distance: 5001 }, { col: .5 }, { latitude: 91 },
    { id: "invented", osmId: "invented" }, { sourceUrl: "https://[" },
    { licenseUrl: "javascript:alert(1)" }, { tags: { tourism: "museum" } }]) {
    await assert.rejects(loadAccommodations("firmi", info, new AbortController().signal,
      async () => response(payload([{ ...place, ...changed }]))), /Invalid nearby/);
  }
  await assert.rejects(loadAccommodations("firmi", info, new AbortController().signal,
    async () => response({ error: "Provider offline" }, 502)), /Provider offline/);
  await assert.rejects(loadAccommodations("firmi", info, new AbortController().signal,
    async () => new Response("<html>old server</html>")), /updated game server/);
});

test("pending and queue-full requests poll, while closing cancels waits immediately", async () => {
  const controller = new AbortController();
  let calls = 0;
  const result = await loadAccommodations("firmi", info, controller.signal, async () => {
    calls++;
    return calls < 3 ? response({ status: "loading" }, calls === 1 ? 202 : 429) : response(payload());
  });
  assert.equal(result.places[0].id, place.id);
  assert.equal(calls, 3);
  const pending = loadAccommodations("firmi", info, controller.signal, async () => response({}, 202));
  controller.abort(new Error("Closed"));
  await assert.rejects(pending, /Closed/);
});

test("a bounded overall deadline prevents endless loading or queue-full polling", async t => {
  const timeout = AbortSignal.timeout;
  const deadline = new AbortController();
  t.mock.method(AbortSignal, "timeout", milliseconds => {
    if (milliseconds === 240000) return deadline.signal;
    return timeout(milliseconds);
  });
  let calls = 0;
  const loading = loadAccommodations("firmi", info, new AbortController().signal, async () => {
    calls++;
    deadline.abort(new DOMException("Lookup timed out", "TimeoutError"));
    return response({}, 429);
  });
  await assert.rejects(loading, { name: "TimeoutError" });
  assert.equal(calls, 1);
});

test("loading reports real server phases and queue saturation without invented percentages", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const events = [];
  let calls = 0;
  const loading = loadAccommodations("firmi", info, new AbortController().signal, async () => {
    calls++;
    if (calls === 1) return response({}, 429);
    if (calls === 2) return response({ progress: { phase: "provider", provider: "overpass.example.org" } }, 202);
    return response(payload());
  }, event => events.push(event));
  for (let i = 0; i < 30 && calls < 3; i++) {
    await new Promise(resolve => setImmediate(resolve));
    t.mock.timers.tick(1500);
  }
  await loading;
  assert.deepEqual(events.map(event => event.phase), ["queued", "queued", "provider"]);
  assert.equal(events.at(-1).provider, "overpass.example.org");
  assert.ok(events.every(event => Number.isInteger(event.elapsedSeconds) && !("percent" in event)));
  await assert.rejects(loadAccommodations("firmi", info, new AbortController().signal,
    async () => response({ progress: { phase: "invented" } }, 202)), /Invalid accommodation search progress/);
});
test("discovered lodging only enables sleep at its exact cell and does not duplicate mapped POIs", () => {
  const json = name => JSON.parse(readFileSync(new URL(name, import.meta.url)));
  const survival = json("../public/config.json").survival, economy = json("../public/economy.json");
  const state = { ...applyBirthTarot(startEconomy(startSurvival(14, 10,
    Date.UTC(2026, 9, 17, 12), "balanced", survival), economy, () => 0), economy), walletCents: 100000 };
  const cell = { terrain: "road" };
  const remote = withDiscoveredAccommodations(cell, [place], 14, 10);
  assert.equal(remote, cell);
  assert.throws(() => sleepEconomy(state, remote, info, place.id, survival, economy), /player's cell/);
  const arrived = withDiscoveredAccommodations(cell, [place], place.col, place.row);
  assert.equal(shelters(arrived).length, 1);
  const slept = sleepEconomy({ ...state, col: place.col, row: place.row }, arrived, info,
    place.id, survival, economy);
  assert.ok(slept.elapsedMinutes > state.elapsedMinutes);
  assert.ok(slept.walletCents < state.walletCents);
  assert.equal(withDiscoveredAccommodations(arrived, [place], place.col, place.row), arrived);
  assert.equal(cell.pois, undefined);
});
