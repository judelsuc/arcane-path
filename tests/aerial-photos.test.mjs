import test from "node:test";
import assert from "node:assert/strict";
import { aerialPhoto } from "../aerial-photos.mjs";
import { createContentService, contentKey } from "../cell-content.mjs";

const latitude = 43.992579, longitude = 2.397766;
const step = 125 / 111195, dx = step / Math.cos(latitude * Math.PI / 180);
const info = { latitude, longitude, meters: 250, countryCodes: ["FR"], contentSources: [],
  bounds: { west: longitude - dx, east: longitude + dx, south: latitude - step, north: latitude + step } };
const empty = () => new Response(JSON.stringify({ query: { pages: {} }, results: [] }));

test("IGN fallback requests the exact reported cell with correct WMS axis order and credits", async () => {
  const photo = await aerialPhoto(info);
  const url = new URL(photo.url), query = url.searchParams;
  assert.equal(url.origin, "https://data.geopf.fr");
  assert.equal(query.get("LAYERS"), "ORTHOIMAGERY.ORTHOPHOTOS");
  assert.equal(query.get("BBOX"), `${info.bounds.south},${info.bounds.west},${info.bounds.north},${info.bounds.east}`);
  assert.equal(query.get("WIDTH"), "512");
  assert.equal(query.get("HEIGHT"), "512");
  assert.equal(photo.distance, 0);
  assert.equal(photo.nearby, false);
  assert.equal(photo.aerial, true);
  assert.equal(photo.license, "Licence Ouverte 2.0");
  assert.match(photo.attribution, /IGN/);
});

test("the second reported empty location also maps to its exact cell", async () => {
  const latitude = 43.778990, longitude = 2.407230;
  const dy = 125 / 111195, dx = dy / Math.cos(latitude * Math.PI / 180);
  const bounds = { south: latitude - dy, north: latitude + dy, west: longitude - dx, east: longitude + dx };
  const photo = await aerialPhoto({ ...info, latitude, longitude, bounds });
  assert.equal(new URL(photo.url).searchParams.get("BBOX"),
    `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`);
  assert.deepEqual(photo.coordinates, { latitude, longitude });
});

test("IGN coverage is checked, not assumed from a rectangular French extent", async () => {
  assert.equal(await aerialPhoto({ ...info, countryCodes: ["ES"] }), null);
  assert.equal(await aerialPhoto({ ...info, countryCodes: ["FR", "ES"] }), null);
  assert.equal(await aerialPhoto({ ...info, bounds: { west: 4, east: 5, south: 53, north: 54 } }), null);
  const photo = await aerialPhoto({ ...info, countryCodes: [] }, async url => {
    assert.match(url, /^\/api\/pricing-country\?/);
    return new Response(JSON.stringify({ countryCode: "FR" }));
  });
  assert.ok(photo.aerial);
  await assert.rejects(aerialPhoto({ ...info, countryCodes: [] }, async () =>
    new Response(JSON.stringify({ countryCode: "unknown" }))), /Invalid aerial coverage country/);
});

test("empty cached cells retry sources and receive a cached, pinnable aerial image", async () => {
  const values = new Map(), calls = [];
  const key = `${await contentKey(info, "fr", "photo")}:1`;
  values.set(key, { content: null, photos: [], errors: [] });
  const service = createContentService({ maxPhotos: 1,
    cache: { get: async key => values.get(key), put: async (key, value) => values.set(key, value) },
    fetcher: async url => {
      calls.push(String(url));
      return String(url).startsWith("https://data.geopf.fr/")
        ? new Response(new Blob(["aerial bytes"], { type: "image/jpeg" })) : empty();
    },
  });
  const result = await service.resolve(info, "fr", "photo");
  assert.equal(result.content.aerial, true);
  assert.equal(await result.content.blob.text(), "aerial bytes");
  assert.equal(result.photos.length, 1);
  const requests = calls.length;
  assert.equal((await service.resolve(info, "fr", "photo")).cached, true);
  assert.equal(calls.length, requests);
});

test("aerial failures are reported explicitly and do not cache a definitive absence", async () => {
  const writes = [];
  const result = await createContentService({ maxPhotos: 1,
    cache: { get: async () => undefined, put: async (...args) => writes.push(args) },
    fetcher: async url => String(url).startsWith("https://data.geopf.fr/")
      ? new Response("Unavailable", { status: 503 }) : empty(),
  }).resolve(info, "fr", "photo");
  assert.equal(result.content, null);
  assert.match(result.errors.join(" "), /503/);
  assert.equal(writes.length, 0);
});
