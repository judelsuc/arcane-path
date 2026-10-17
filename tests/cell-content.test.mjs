import assert from "node:assert/strict";
import test from "node:test";
import { contentKey, createContentService as createService, insideCell, MAX_CELL_PHOTOS } from "../cell-content.mjs";

const createContentService = options => createService({ maxPhotos: 1, ...options });

const info = {
  bounds: { west: 2.30, east: 2.31, south: 44.54, north: 44.55 },
  latitude: 44.545, longitude: 2.305, meters: 250, contentSources: [],
};
const wikiPage = {
  title: "Firmi", fullurl: "https://fr.wikipedia.org/wiki/Firmi",
  extract: "A sourced short description.", coordinates: [{ lat: 44.545, lon: 2.305 }],
  pageimage: "Firmi.jpg",
};
function image(title = "File:Firmi.jpg", lat = 44.545, lon = 2.305) {
  return {
    title, coordinates: [{ lat, lon }],
    imageinfo: [{
      thumburl: "https://thumb.wikimedia.org/wikipedia/commons/firmi.jpg",
      descriptionurl: "https://commons.wikimedia.org/wiki/File:Firmi.jpg",
      extmetadata: {
        Artist: { value: "<a>Photographer</a>" },
        LicenseShortName: { value: "CC BY-SA 4.0" },
        LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0/" },
      },
    }],
  };
}
function memoryCache() {
  const values = new Map();
  return {
    get: async key => values.get(key),
    put: async (key, value) => values.set(key, structuredClone(value)),
    values,
  };
}
function api(pages) {
  return new Response(JSON.stringify({ query: { pages: Object.fromEntries(pages.map((p, i) => [i, p])) } }));
}

test("OSM description has priority, with language, provenance, and no network", async () => {
  const cache = memoryCache();
  const service = createContentService({ cache, fetcher: () => { throw Error("Unexpected network"); } });
  const cell = { ...info, contentSources: [{
    osmId: "node/123", tags: { description: "Original", "description:fr": "Description française" },
  }] };
  const result = await service.resolve(cell, "fr", "description");
  assert.equal(result.content.text, "Description française");
  assert.match(result.content.sourceUrl, /node\/123$/);
  assert.deepEqual(result.bounds, info.bounds);
  assert.equal(result.language, "fr");
  assert.ok((await service.resolve(cell, "fr", "description")).cached);
});

test("localized OSM descriptions outrank earlier unqualified sources and ignore whitespace", async () => {
  const cell = { ...info, contentSources: [
    { osmId: "node/1", tags: { description: "Unqualified" } },
    { osmId: "node/2", tags: { "description:fr": "  " } },
    { osmId: "node/3", tags: { "description:fr": "Localized" } },
  ] };
  const result = await createContentService({
    cache: memoryCache(), fetcher: () => { throw Error("Unexpected network"); },
  }).resolve(cell, "fr", "description");
  assert.equal(result.content.text, "Localized");
  assert.match(result.content.sourceUrl, /node\/3$/);
});

test("geographic cache identity ignores display indices but separates language, size and OSM changes", async () => {
  const key = await contentKey(info, "fr", "description");
  assert.equal(await contentKey({ ...info, row: 7, col: 9 }, "fr", "description"), key);
  for (const [cell, locale, kind] of [
    [info, "en", "description"], [info, "fr", "photo"],
    [{ ...info, meters: 50 }, "fr", "description"],
    [{ ...info, contentSources: [{ tags: { description: "changed" } }] }, "fr", "description"],
    [{ ...info, bounds: { ...info.bounds, west: 2.29 } }, "fr", "description"],
  ]) assert.notEqual(await contentKey(cell, locale, kind), key);
});

test("Wikipedia prefers an inside-cell description over a closer nearby page", async () => {
  const service = createContentService({ cache: memoryCache(), fetcher: async () => api([
    { ...wikiPage, title: "Nearby", coordinates: [{ lat: 44.545, lon: 2.29999 }] },
    wikiPage,
  ]) });
  const result = await service.resolve(info, "fr", "description");
  assert.equal(result.content.title, "Firmi");
  assert.equal(result.content.nearby, false);
  assert.equal(result.content.license, "CC BY-SA 4.0");
});

test("nearby descriptions are labelled with measured distance, not cell-specific facts", async () => {
  const service = createContentService({ cache: memoryCache(), fetcher: async () => api([
    { ...wikiPage, coordinates: [{ lat: 44.55, lon: 2.32 }] },
  ]) });
  const result = await service.resolve(info, "en", "description");
  assert.equal(result.content.nearby, true);
  assert.ok(result.content.distance > 1000);
});

test("photo priority selects OSM-linked Commons first and caches image bytes for offline reads", async () => {
  const cache = memoryCache(), calls = [];
  const cell = { ...info, contentSources: [{ tags: { wikimedia_commons: "File:Firmi.jpg" } }] };
  const service = createContentService({ cache, fetcher: async url => {
    calls.push(String(url));
    if (String(url).includes("/w/api.php")) return api([image()]);
    return new Response(new Blob(["image bytes"], { type: "image/jpeg" }));
  } });
  const first = await service.resolve(cell, "fr", "photo");
  assert.equal(first.content.attribution, "Photographer");
  assert.equal(first.content.association, "osm");
  assert.equal(calls.length, 2);
  const offline = createContentService({ cache, fetcher: () => { throw Error("Offline"); } });
  const cached = await offline.resolve(cell, "fr", "photo");
  assert.equal(cached.cached, true);
  assert.equal(await cached.content.blob.text(), "image bytes");
  assert.deepEqual(cached.content.coordinates, { latitude: 44.545, longitude: 2.305 });
});

test("OSM image tags pointing at Commons file pages use the highest-priority source", async () => {
  const cell = { ...info, contentSources: [{
    tags: { image: "https://commons.wikimedia.org/wiki/File:Firmi.jpg" },
  }] };
  const service = createContentService({ cache: memoryCache(), fetcher: async url => {
    if (String(url).includes("/w/api.php")) {
      assert.equal(new URL(url).searchParams.get("titles"), "File:Firmi.jpg");
      return api([image()]);
    }
    return new Response(new Blob(["bytes"], { type: "image/jpeg" }));
  } });
  const result = await service.resolve(cell, "fr", "photo");
  assert.equal(result.content.association, "osm");
});

test("geolocated Commons photos inside cell outrank nearby and Wikipedia images", async () => {
  const service = createContentService({ cache: memoryCache(), fetcher: async url => {
    if (String(url).includes("/w/api.php")) {
      assert.match(String(url), /commons/);
      return api([image("File:Nearby.jpg", 44.55, 2.32), image()]);
    }
    return new Response(new Blob(["bytes"], { type: "image/jpeg" }));
  } });
  const result = await service.resolve(info, "fr", "photo");
  assert.equal(result.content.title, "File:Firmi.jpg");
  assert.equal(result.content.nearby, false);
});

test("Wikipedia image fallback is restricted to local articles and reusable Commons metadata", async () => {
  const calls = [];
  const service = createContentService({ cache: memoryCache(), fetcher: async url => {
    calls.push(String(url));
    const parsed = new URL(url);
    if (parsed.hostname.includes("wikipedia")) return api([wikiPage]);
    if (parsed.searchParams.has("titles")) {
      const photo = image();
      delete photo.coordinates;
      return api([photo]);
    }
    if (parsed.pathname.endsWith("api.php")) return api([]);
    return new Response(new Blob(["bytes"], { type: "image/jpeg" }));
  } });
  const result = await service.resolve(info, "fr", "photo");
  assert.equal(result.content.nearby, false);
  assert.ok(calls.some(url => url.includes("titles=File")));
  assert.equal(result.content.association, "wikipedia");
  assert.equal(result.content.associationUrl, wikiPage.fullurl);
});

test("nearby photo fallback reports its coordinates and distance", async () => {
  const service = createContentService({ cache: memoryCache(), fetcher: async url => {
    const parsed = new URL(url);
    if (parsed.hostname.includes("wikipedia")) return api([]);
    if (parsed.pathname.endsWith("api.php")) return api([image("File:Nearby.jpg", 44.55, 2.32)]);
    return new Response(new Blob(["bytes"], { type: "image/jpeg" }));
  } });
  const result = await service.resolve(info, "fr", "photo");
  assert.equal(result.content.nearby, true);
  assert.ok(result.content.distance > 1000);
});

test("missing content is explicit and cached; source failures are not cached as absence", async () => {
  const cache = memoryCache();
  const service = createContentService({ cache, fetcher: async () => api([]) });
  const empty = await service.resolve(info, "fr", "description");
  assert.equal(empty.content, null);
  assert.deepEqual(empty.errors, []);
  assert.equal(cache.values.size, 1);
  const failureCache = memoryCache();
  const failing = createContentService({ cache: failureCache, fetcher: async () => new Response("", { status: 503 }) });
  const failed = await failing.resolve(info, "fr", "description");
  assert.match(failed.errors[0], /503/);
  assert.equal(failureCache.values.size, 0);
});

test("refresh bypasses cache and cache-write errors surface explicitly", async () => {
  const cache = memoryCache();
  let count = 0;
  const service = createContentService({ cache, fetcher: async () => { count++; return api([wikiPage]); } });
  await service.resolve(info, "fr", "description");
  await service.resolve(info, "fr", "description", true);
  assert.equal(count, 2);
  const brokenCache = { get: async () => undefined, put: async () => { throw Error("Quota exceeded"); } };
  await assert.rejects(
    createContentService({ cache: brokenCache, fetcher: async () => api([wikiPage]) })
      .resolve(info, "fr", "description"), /Quota exceeded/,
  );
});

test("unlicensed images and unexpected image hosts are rejected", async () => {
  const service = createContentService({ cache: memoryCache(), fetcher: async url => {
    if (new URL(url).hostname.includes("wikipedia")) return api([]);
    const unlicensed = image(), unsafe = image();
    delete unlicensed.imageinfo[0].extmetadata.LicenseUrl;
    unsafe.imageinfo[0].thumburl = "https://untrusted.example/photo.jpg";
    return api([unlicensed, unsafe]);
  } });
  const result = await service.resolve(info, "fr", "photo");
  assert.equal(result.content, null);
  assert.equal(insideCell(info, 44, 2), false);
});

test("unreadable preferred photo falls back to the next source with explicit warnings", async () => {
  const cache = memoryCache();
  const cell = { ...info, contentSources: [{ tags: { wikimedia_commons: "File:Broken.jpg" } }] };
  const service = createContentService({ cache, fetcher: async url => {
    const parsed = new URL(url);
    if (parsed.searchParams.has("titles")) {
      const broken = image("File:Broken.jpg");
      broken.imageinfo[0].thumburl = "https://thumb.wikimedia.org/broken.jpg";
      broken.imageinfo[0].descriptionurl = "https://commons.wikimedia.org/wiki/File:Broken.jpg";
      return api([broken]);
    }
    if (parsed.pathname.endsWith("api.php")) return api([image()]);
    if (parsed.pathname === "/broken.jpg") return new Response("missing", { status: 404 });
    return new Response(new Blob(["good bytes"], { type: "image/jpeg" }));
  } });
  const result = await service.resolve(cell, "fr", "photo");
  assert.equal(result.content.title, "File:Firmi.jpg");
  assert.match(result.errors[0], /404/);
  assert.equal(await result.content.blob.text(), "good bytes");
  assert.equal(cache.values.size, 1);
});

test("non-image downloads are refused and not cached as successful photos", async () => {
  const cache = memoryCache();
  const service = createContentService({ cache, fetcher: async url => {
    const parsed = new URL(url);
    if (parsed.hostname.includes("wikipedia")) return api([]);
    if (parsed.pathname.endsWith("api.php")) return api([image()]);
    return new Response("Not an image", { headers: { "Content-Type": "text/html" } });
  } });
  const result = await service.resolve(info, "fr", "photo");
  assert.equal(result.content, null);
  assert.match(result.errors[0], /Invalid or oversized image/);
  assert.equal(cache.values.size, 0);
});

test("gallery downloads at most five distinct photos, retaining priority and offline bytes", async () => {
  const cache = memoryCache(), downloads = [];
  function distinct(index, nearby = false) {
    const page = image(`File:Photo ${index}.jpg`, nearby ? 44.55 : 44.545, nearby ? 2.32 : 2.305);
    page.imageinfo[0].thumburl = `https://thumb.wikimedia.org/photo-${index}.jpg`;
    page.imageinfo[0].descriptionurl = `https://commons.wikimedia.org/wiki/File:Photo_${index}.jpg`;
    return page;
  }
  const cell = { ...info, contentSources: [{ tags: { wikimedia_commons: "File:Photo 0.jpg" } }] };
  const service = createService({ cache, fetcher: async url => {
    const parsed = new URL(url);
    if (parsed.searchParams.has("titles")) return api([distinct(0)]);
    if (parsed.pathname.endsWith("api.php")) {
      return api([distinct(0), distinct(9, true), ...Array.from({ length: 8 }, (_, i) => distinct(i + 1))]);
    }
    downloads.push(parsed.pathname);
    return new Response(new Blob([parsed.pathname], { type: "image/jpeg" }));
  } });
  const result = await service.resolve(cell, "fr", "photo");
  assert.equal(MAX_CELL_PHOTOS, 5);
  assert.equal(result.photos.length, 5);
  assert.equal(downloads.length, 5);
  assert.equal(new Set(result.photos.map(p => p.sourceUrl)).size, 5);
  assert.equal(result.photos[0].association, "osm");
  assert.ok(result.photos.every(p => !p.nearby));
  const offline = createService({ cache, fetcher: () => { throw Error("Network must not run"); } });
  const cached = await offline.resolve(cell, "fr", "photo");
  assert.equal(cached.cached, true);
  for (let i = 0; i < 5; i++) {
    assert.equal(await cached.photos[i].blob.text(), downloads[i]);
    assert.ok(cached.photos[i].licenseUrl);
  }
});

test("gallery returns fewer photos when only a few unique usable photos exist", async () => {
  const page = image();
  const service = createService({ cache: memoryCache(), fetcher: async url => {
    const parsed = new URL(url);
    if (parsed.hostname.includes("wikipedia")) return api([]);
    if (parsed.pathname.endsWith("api.php")) return api([page, page, page]);
    return new Response(new Blob(["one unique image"], { type: "image/jpeg" }));
  } });
  const result = await service.resolve(info, "fr", "photo");
  assert.equal(result.photos.length, 1);
  assert.equal(result.photos[0].title, page.title);
});

test("old single-photo cache is preserved offline during gallery upgrade", async () => {
  const cache = memoryCache();
  const legacyKey = (await contentKey(info, "fr", "photo")).replace(/^v3:/, "v1:");
  await cache.put(legacyKey, {
    content: { title: "Old photo", blob: new Blob(["old bytes"], { type: "image/jpeg" }) },
    retrievedAt: "2026-10-01T00:00:00.000Z", errors: [],
  });
  const service = createService({ cache, fetcher: async () => new Response("", { status: 503 }) });
  const result = await service.resolve(info, "fr", "photo");
  assert.equal(await result.photos[0].blob.text(), "old bytes");
  assert.ok(result.errors.length > 0);
});

test("invalid gallery limits fail explicitly", () => {
  for (const maxPhotos of [0, 21, 1.5, NaN]) {
    assert.throws(() => createService({ cache: memoryCache(), maxPhotos }), /Photo limit/);
  }
});

test("configured gallery emits usable photos before remaining downloads finish", async () => {
  const cache = memoryCache();
  let release, firstReady;
  const first = new Promise(resolve => { firstReady = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const progress = [];
  let downloads = 0, completed = false;
  const service = createService({ cache, maxPhotos: 7, fetcher: async url => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("api.php")) {
      return api(Array.from({ length: 9 }, (_, i) => {
        const page = image(`File:Progress ${i}.jpg`, 44.545, 2.305);
        page.imageinfo[0].thumburl = `https://thumb.wikimedia.org/progress-${i}.jpg`;
        page.imageinfo[0].descriptionurl = `https://commons.wikimedia.org/wiki/File:Progress_${i}.jpg`;
        return page;
      }));
    }
    if (++downloads === 2) await gate;
    return new Response(new Blob(["photo"], { type: "image/jpeg" }));
  } });
  const pending = service.resolve(info, "fr", "photo", false, result => {
    progress.push(result);
    if (result.photos.length === 1) firstReady();
  }).then(result => { completed = true; return result; });
  await first;
  assert.equal(completed, false);
  assert.equal(progress[0].photos.length, 1);
  assert.equal(progress[0].loading, true);
  assert.ok(progress[0].content.blob.size);
  release();
  const result = await pending;
  assert.equal(result.photos.length, 7);
  assert.equal(downloads, 7);
  assert.equal(progress[0].photos.length, 1);
  assert.equal((await service.resolve(info, "fr", "photo")).cached, true);
});
