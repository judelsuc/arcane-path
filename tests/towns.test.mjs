import test from "node:test";
import assert from "node:assert/strict";
import { settlementView, nearestSettlement } from "../towns.mjs";
import { createContentService, contentKey } from "../cell-content.mjs";
import { setupTowns } from "../towns-ui.mjs";
import { translate } from "../i18n.mjs";

const settlement = { osmId: "node/10", name: "Firmi", wikipedia: null };
const poi = (id, overrides = {}) => ({
  osmId: `node/${id}`, name: `Cafe ${id}`, category: "amenity",
  latitude: 44.545, longitude: 2.305, tags: { amenity: "cafe" }, ...overrides,
});
function map(pois = []) {
  return {
    width: 1, height: 1, cellSizeMeters: 250,
    bounds: { minLatitude: 44.543, maxLatitude: 44.547, minLongitude: 2.303, maxLongitude: 2.307 },
    rows: [[{ terrain: "place", names: ["Firmi"], settlements: [settlement], pois }]],
  };
}

test("town menu remains accessible at public washing facilities outside named settlements", t => {
  const original = globalThis.document;
  t.after(() => { globalThis.document = original; });
  class Element {
    children = []; events = {}; open = false; hidden = false;
    addEventListener(type, listener) { this.events[type] = listener; }
    append(...children) { this.children.push(...children); }
    replaceChildren() { this.children = []; }
    showModal() { this.open = true; }
    close() { this.open = false; }
  }
  const nodes = new Map();
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, new Element());
    return nodes.get(selector);
  };
  globalThis.document = { createElement: () => new Element(),
    querySelector: selector => selector === "dialog[open]"
      ? [...nodes.values()].find(element => element.open) ?? null : node(selector) };
  const ui = setupTowns((key, args) => translate("fr", key, args));
  const data = map([poi(1, { tags: { amenity: "shower" } })]);
  data.rows[0][0] = { ...data.rows[0][0], terrain: "plain", settlements: [] };
  ui.update(data, 0, 0);
  assert.equal(node("#open-town").disabled, false);
  assert.equal(node("#town-dialog").open, false);
  assert.equal(node("#town-refresh").disabled, true);
  node("#open-town").events.click();
  assert.equal(node("#town-dialog").open, true);
  assert.equal(node("#town-title").textContent, "Services sur place");
  data.rows[0][0].pois[0].tags.access = "private";
  ui.update(data, 0, 0, false);
  assert.equal(node("#open-town").disabled, true);
  assert.equal(node("#town-dialog").open, false);
});
function service(fetcher) {
  const values = new Map();
  return createContentService({ fetcher, cache: {
    get: async key => values.get(key), put: async (key, value) => values.set(key, value),
  } });
}
const page = (title = "Firmi", overrides = {}) => ({
  title, extract: "A sourced welcome.", coordinates: [{ lat: 44.545, lon: 2.305 }],
  fullurl: `https://fr.wikipedia.org/wiki/${title}`, ...overrides,
});
const response = pages => new Response(JSON.stringify({ query: {
  pages: Object.fromEntries(pages.map((entry, index) => [index, entry])),
} }));

test("placement finds the nearest usable named town cell, not a POI, water or unavailable cell", () => {
  const data = { width: 4, height: 4,
    rows: Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => ({ terrain: "plain" }))) };
  data.rows[0][0] = { terrain: "place", settlements: [{ ...settlement, name: "Farther" }] };
  data.rows[1][1] = { terrain: "place", settlements: [settlement], unavailable: true };
  data.rows[1][2] = { terrain: "water", settlements: [settlement] };
  data.rows[2][1] = { terrain: "place", settlements: [{ ...settlement, name: " " }] };
  data.rows[2][2] = { terrain: "plain", pois: [poi(10)] };
  data.rows[3][3] = { terrain: "place", settlements: [settlement] };
  const before = structuredClone(data);
  assert.deepEqual(nearestSettlement({ col: 2, row: 2 }, [data]), { col: 3, row: 3, town: "Firmi" });
  assert.deepEqual(nearestSettlement({ col: 3, row: 3 }, [data]), { col: 3, row: 3, town: "Firmi" });
  assert.equal(nearestSettlement({ col: 0, row: 0 }, []), null);
  assert.deepEqual(data, before);
});

test("nearest town accounts for negative streamed coordinates and resolves ties independently of chunk order", () => {
  const chunk = x => ({ chunk: { x, y: -1 }, width: 8, height: 8,
    rows: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => ({ terrain: "plain" }))) });
  const left = chunk(-1), right = chunk(0);
  left.rows[4][7] = { terrain: "place", settlements: [settlement] };
  right.rows[4][1] = { terrain: "place", settlements: [{ ...settlement, name: "Other" }] };
  const expected = { col: -1, row: -4, town: "Firmi" };
  assert.deepEqual(nearestSettlement({ col: 0, row: -4 }, [left, right]), expected);
  assert.deepEqual(nearestSettlement({ col: 0, row: -4 }, [right, left]), expected);
});

test("only real named public-facing POIs within 2km enter the settlement menu", () => {
  const data = map([
    poi(1), poi(2, { name: "" }), poi(3, { tags: { amenity: "cafe", access: "private" } }),
    poi(4, { tags: { amenity: "police" } }), poi(5, { tags: { amenity: "cafe", disused: "yes" } }),
    poi(6, { latitude: 45 }), poi(7, { category: "shop", tags: { shop: "vacant" } }),
    poi(8, { category: "shop", tags: { shop: "bakery" } }),
    poi(9, { tags: undefined }), poi(10, { osmId: "invented" }),
    poi(11, { category: "tourism", tags: { tourism: "museum" } }),
    poi(12, { tags: { amenity: "cafe", access: "no" } }),
    poi(13, { latitude: NaN }), poi(14, { tags: { amenity: "cafe", abandoned: "yes" } }),
  ]);
  const view = settlementView(data, 0, 0);
  assert.deepEqual(view.places.map(item => item.osmId).sort(), ["node/1", "node/11", "node/8"]);
  assert.equal(view.identity, "node/10");
});

test("town menu is bounded to five entries per category and deduplicated", () => {
  const data = map([...Array.from({ length: 12 }, (_, i) => poi(i)), poi(0)]);
  const view = settlementView(data, 0, 0);
  assert.equal(view.places.length, 5);
  assert.equal(new Set(view.places.map(item => item.osmId)).size, 5);
  assert.deepEqual(settlementView(data, 0, 0), view);
});

test("accommodation has a separate bounded allowance and includes lodging relations and huts", () => {
  const museum = poi(100, { category: "tourism", tags: { tourism: "museum" } });
  const hotels = Array.from({ length: 25 }, (_, i) => poi(i, {
    category: "tourism", osmId: `relation/${i + 1}`, tags: { tourism: i ? "hotel" : "alpine_hut" },
  }));
  const view = settlementView(map([museum, ...hotels]), 0, 0);
  assert.equal(view.places.filter(p => p.tags.tourism === "museum").length, 1);
  assert.equal(view.places.filter(p => p.tags.tourism !== "museum").length, 20);
  assert.ok(view.places.some(p => p.tags.tourism === "alpine_hut"));
});

test("unloaded and non-settlement cells never open a town, and empty towns remain honest", () => {
  const data = map();
  assert.deepEqual(settlementView(data, 0, 0).places, []);
  data.rows[0][0].terrain = "forest";
  assert.equal(settlementView(data, 0, 0), null);
  data.rows[0][0] = { unavailable: true };
  assert.equal(settlementView(data, 0, 0), null);
});

test("welcome rejects unrelated nearby Wikipedia pages and caches the correct named article", async () => {
  let calls = 0;
  const content = service(async () => { calls++; return response([page("Wrong nearby landmark"), page()]); });
  const view = settlementView(map(), 0, 0);
  const result = await content.resolve(view, "fr", "settlement");
  assert.equal(result.content.title, "Firmi");
  assert.equal(result.content.license, "CC BY-SA 4.0");
  assert.equal((await content.resolve(view, "fr", "settlement")).cached, true);
  assert.equal(calls, 1);
  assert.equal((await service(async () => response([page("Wrong")])).resolve(view, "fr", "settlement")).content, null);
});

test("explicit OSM Wikipedia association follows its source language and supports redirected titles", async () => {
  const data = map();
  data.rows[0][0].settlements = [{ ...settlement, wikipedia: "fr:Firmi" }];
  const view = settlementView(data, 0, 0);
  const content = service(async url => {
    const parsed = new URL(url);
    assert.equal(parsed.hostname, "fr.wikipedia.org");
    assert.equal(parsed.searchParams.get("titles"), "Firmi");
    assert.equal(parsed.searchParams.has("generator"), false);
    return response([page("Firmi (Aveyron)")]);
  });
  const result = await content.resolve(view, "en", "settlement");
  assert.equal(result.content.language, "fr");
  assert.equal(result.content.title, "Firmi (Aveyron)");
});

test("a town with no matched article keeps an explicit absence, never unrelated OSM text", async () => {
  const data = map();
  data.rows[0][0].contentSources = [{ tags: { description: "Nearby business, not town history." } }];
  const view = settlementView(data, 0, 0);
  assert.equal((await service(async () => response([])).resolve(view, "fr", "settlement")).content, null);
  const other = { ...view, settlement: { ...settlement, name: "Another hamlet" } };
  assert.notEqual(await contentKey(view, "fr", "settlement"), await contentKey(other, "fr", "settlement"));
  assert.notEqual(await contentKey(view, "en", "settlement"), await contentKey(view, "fr", "settlement"));
});
