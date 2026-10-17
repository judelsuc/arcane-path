import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadAccommodations, withDiscoveredAccommodations } from "../accommodations.mjs";
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
