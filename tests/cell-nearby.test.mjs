import test from "node:test";
import assert from "node:assert/strict";
import { withNearbyMappedPois } from "../cell-nearby.mjs";
import { mappedGameVenues } from "../minigames/venues.mjs";
import { available as petanqueAvailable } from "../minigames/petanque.mjs";

test("economy nearby context keeps original properties and only deduplicated loaded POIs within 2km", () => {
  const info = { latitude: 45, longitude: 3 };
  const nearby = { osmId: "node/1", latitude: 45.01, longitude: 3, tags: { sport: "boules", leisure: "pitch" } };
  const distant = { ...nearby, osmId: "node/2", latitude: 45.03 };
  const missing = { osmId: "node/3", tags: { sport: "boules" } };
  const unavailable = { ...nearby, osmId: "node/4" };
  const base = { terrain: "plain", countryCodes: ["FR"], nearby: { retained: true },
    pois: [{ osmId: "node/5", tags: { amenity: "bench" } }] };
  const chunks = new Map([["0,0", { rows: [[{ pois: [nearby, distant, missing] },
    { pois: [nearby] }, { unavailable: true, pois: [unavailable] }]] }]]);
  const result = withNearbyMappedPois(base, info, chunks);
  assert.deepEqual(result.pois, base.pois);
  assert.equal(result.countryCodes, base.countryCodes);
  assert.equal(result.nearby.retained, true);
  assert.equal(result.nearby.pois.length, 1);
  assert.ok(result.nearby.pois[0].distance > 1000 && result.nearby.pois[0].distance < 2000);
  assert.equal(mappedGameVenues(result).length, 2);
  assert.equal(petanqueAvailable(result), true);
  assert.equal(petanqueAvailable(withNearbyMappedPois({ terrain: "plain" }, info, chunks)), true);
  assert.equal(petanqueAvailable({ ...result, unavailable: true }), false);
  assert.equal(base.nearby.pois, undefined);
});
