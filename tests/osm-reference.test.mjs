import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { osmReferenceUrls } from "../osm-reference.mjs";

for (const path of ["map.json", "maps/paris.json", "maps/alps.json"]) {
  test(`reference map uses exact downloaded bounds for ${path}`, () => {
    const map = JSON.parse(readFileSync(new URL(`../public/${path}`, import.meta.url), "utf8"));
    const referenceBounds = map.referenceBounds ?? map.bounds;
    const { embed, full } = osmReferenceUrls(referenceBounds);
    const expected = [
      referenceBounds.minLongitude, referenceBounds.minLatitude,
      referenceBounds.maxLongitude, referenceBounds.maxLatitude,
    ].join(",");
    assert.equal(new URL(embed).origin, "https://www.openstreetmap.org");
    assert.equal(new URL(embed).pathname, "/export/embed.html");
    assert.equal(new URL(embed).searchParams.get("bbox"), expected);
    assert.equal(new URL(embed).searchParams.get("layer"), "mapnik");
    assert.equal(new URL(full).searchParams.get("bbox"), expected);
  });
}

test("invalid bounds are reported rather than displaying a misleading reference", () => {
  for (const bounds of [
    {},
    { minLongitude: 3, minLatitude: 44, maxLongitude: 2, maxLatitude: 45 },
    { minLongitude: 2, minLatitude: 44, maxLongitude: 3, maxLatitude: NaN },
    { minLongitude: 2, minLatitude: 44, maxLongitude: 3, maxLatitude: 91 },
  ]) {
    assert.throws(() => osmReferenceUrls(bounds), /Invalid geographic bounds/);
  }
});
test("travel reference centers on a valid player marker with matching full-map link", () => {
  const bounds = { minLongitude: 2.3, maxLongitude: 2.32, minLatitude: 44.53, maxLatitude: 44.55 };
  const urls = osmReferenceUrls(bounds, { latitude: 44.54, longitude: 2.31 });
  assert.equal(new URL(urls.embed).searchParams.get("marker"), "44.54,2.31");
  assert.equal(new URL(urls.full).searchParams.get("mlat"), "44.54");
  assert.throws(() => osmReferenceUrls(bounds, { latitude: 90, longitude: 0 }), /Invalid player marker/);
});
