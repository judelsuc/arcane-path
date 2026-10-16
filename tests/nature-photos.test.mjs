import assert from "node:assert/strict";
import test from "node:test";
import { naturePhotos } from "../nature-photos.mjs";
import { createContentService, contentKey, insideCell, distanceMeters } from "../cell-content.mjs";

const info = { latitude: -17.55, longitude: -149.56, meters: 250, contentSources: [],
  bounds: { south: -17.551, north: -17.549, west: -149.561, east: -149.559 } };
const photo = { id: 10, url: "https://inaturalist-open-data.s3.amazonaws.com/photos/10/square.jpg",
  license_code: "cc-by", attribution: "Test Photographer (CC BY)" };
const observation = { id: 1, geojson: { type: "Point", coordinates: [-149.56, -17.55] },
  public_positional_accuracy: 10, photos: [photo], taxon: { name: "Fregata minor" } };
const media = { type: "StillImage", identifier: photo.url, creator: "Test Photographer",
  license: "https://creativecommons.org/licenses/by/4.0/" };
const occurrence = { key: 1, decimalLatitude: -17.55, decimalLongitude: -149.56,
  coordinateUncertaintyInMeters: 20, media: [media], species: "Fregata minor" };
const response = results => new Response(JSON.stringify({ results }));
const helpers = { insideCell, distanceMeters };

test("iNaturalist accepts licensed observed photos with attribution, location and bounded thumbnail", async () => {
  const photos = await naturePhotos("iNaturalist", info, {
    ...helpers, fetcher: async () => response([observation]),
  });
  assert.equal(photos.length, 1);
  assert.equal(photos[0].nearby, false);
  assert.equal(photos[0].license, "CC BY 4.0");
  assert.equal(photos[0].url.endsWith("/medium.jpg"), true);
  assert.equal(photos[0].nature, true);
  assert.equal(photos[0].dedupKey, "inaturalist:10");
});

test("rejects restricted licenses, hidden/imprecise locations, faraway photos and unsafe hosts", async () => {
  const rows = [
    { ...observation, obscured: true },
    { ...observation, public_positional_accuracy: 500 },
    { ...observation, public_positional_accuracy: null },
    { ...observation, geojson: { type: "Point", coordinates: [0, 0] } },
    ...["cc-by-nc", null, "all-rights-reserved"].map(license_code =>
      ({ ...observation, photos: [{ ...photo, license_code }] })),
    { ...observation, photos: [{ ...photo, url: "https://localhost/private.jpg" }] },
  ];
  assert.deepEqual(await naturePhotos("iNaturalist", info, {
    ...helpers, fetcher: async () => response(rows),
  }), []);
});

test("GBIF validates media licenses independently of occurrence licenses", async () => {
  const photos = await naturePhotos("GBIF", info, {
    ...helpers, fetcher: async () => response([
      occurrence,
      { ...occurrence, license: media.license, media: [{ ...media, license: undefined }] },
      { ...occurrence, informationWithheld: "Location hidden" },
    ]),
  });
  assert.equal(photos.length, 1);
  assert.equal(photos[0].dedupKey, "inaturalist:10");
});

test("provider errors and malformed responses are explicit", async () => {
  for (const fetcher of [
    async () => new Response("", { status: 429 }),
    async () => new Response(JSON.stringify({ error: "bad" })),
  ]) await assert.rejects(naturePhotos("iNaturalist", info, { ...helpers, fetcher }));
});

test("gallery combines nature providers, deduplicates, caches bytes and reopens offline", async () => {
  const entries = new Map();
  const cache = { get: async key => entries.get(key), put: async (key, value) => entries.set(key, value) };
  const fetcher = async url => {
    if (String(url).includes("api.inaturalist.org")) return response([observation]);
    if (String(url).includes("api.gbif.org")) return response([occurrence]);
    if (String(url).includes(".jpg")) return new Response("image", { headers: { "Content-Type": "image/jpeg" } });
    return new Response(JSON.stringify({ query: { pages: {} } }));
  };
  const service = createContentService({ cache, fetcher });
  const result = await service.resolve(info, "en", "photo");
  assert.equal(result.photos.length, 1);
  assert.ok(result.photos[0].blob.size > 0);
  const offline = createContentService({ cache, fetcher: () => { throw Error("Offline"); } });
  assert.equal((await offline.resolve(info, "en", "photo")).cached, true);
});

test("v2 gallery survives offline migration to expanded-source cache", async () => {
  const entries = new Map();
  const saved = { sourceUrl: "https://commons.wikimedia.org/wiki/File:Saved.jpg", blob: new Blob(["cached"]) };
  const key = `${await contentKey(info, "en", "photo")}:5`;
  entries.set(key.replace(/^v3:/, "v2:"), { photos: [saved] });
  const result = await createContentService({
    cache: { get: async key => entries.get(key), put: async (key, value) => entries.set(key, value) },
    fetcher: async () => new Response("", { status: 503 }),
  }).resolve(info, "en", "photo");
  assert.equal(result.photos[0].blob, saved.blob);
  assert.ok(result.errors.length);
});
