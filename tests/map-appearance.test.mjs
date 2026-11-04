import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { APPEARANCE_KEY, SITE_GLYPHS, TILE_KINDS, mappedSites, visualKind,
  validatePixelPack, drawPixelTile, setupMapAppearance, mapAppearance } from "../map-appearance.mjs";
import { diagnosticSnapshot } from "../change-request-snapshot.mjs";
import { translate } from "../i18n.mjs";
import { drawJourneyMap, journeyMapView } from "../journey-map.mjs";
import { initialJourney, moveJourney } from "../travel.mjs";
import { mapIdentity } from "../journey-save.mjs";

const pack = JSON.parse(readFileSync(new URL("../public/tilesets/path-pixel.json", import.meta.url)));

test("original CC0 pixel pack has complete terrain/site/unknown coverage and bounded non-executable geometry", () => {
  assert.equal(validatePixelPack(pack), pack);
  assert.equal(Object.keys(SITE_GLYPHS).length, 12);
  assert.equal(Object.keys(pack.tiles).length, TILE_KINDS.length);
  for (const change of [
    p => { delete p.tiles.rail; }, p => { p.tiles.mall.rects[0][2] = 900; },
    p => { p.tiles.stadium.background = 'url("https://example.test")'; },
    p => { p.tiles.forest.rects[0][4] = "red;display:none"; },
    p => { p.size = 1024; }, p => { p.license = "unknown"; },
  ]) {
    const invalid = structuredClone(pack);
    change(invalid);
    assert.throws(() => validatePixelPack(invalid), /tileset|pixel/);
  }
  const cells = [];
  drawPixelTile({ fillRect: (...args) => cells.push(args) }, pack, "stadium", 0, 0, 16);
  assert.equal(cells.length, pack.tiles.stadium.rects.length + 1);
  assert.ok(cells.flat().every(Number.isFinite));
  assert.throws(() => drawPixelTile({}, pack, "fictional-terrain", 0, 0, 16), /Missing/);
});

test("site presentation never mutates terrain/actions or derives landmarks from names", () => {
  const sites = Object.keys(SITE_GLYPHS).map((kind, index) => ({ kind, osmId: `node/${index}` }));
  for (const site of sites) {
    const cell = { terrain: "plain", glyph: " ", sites: [site] };
    const before = structuredClone(cell);
    assert.equal(visualKind(cell), site.kind);
    assert.deepEqual(cell, before);
    assert.equal(visualKind({ ...cell, terrain: "rail" }), "rail");
    assert.equal(visualKind({ ...cell, terrain: "water" }), "water");
    assert.equal(visualKind({ ...cell, unavailable: true }), "unknown");
    const state = initialJourney(0, 0, 0);
    const base = { terrain: "plain", glyph: " ", elevationMeters: 100 };
    assert.deepEqual(moveJourney(state, 1, 0, base, base),
      moveJourney(state, 1, 0, { ...base, sites: [site] }, { ...base, sites: [site] }));
  }
  const map = { width: 1, height: 1, cellSizeMeters: 250, bounds: {}, rows: [[{ terrain: "plain" }]] };
  assert.equal(mapIdentity(map), mapIdentity({ ...map, rows: [[{ terrain: "plain", sites }]], sitesVersion: 1 }));
  assert.deepEqual(mappedSites({ pois: [{ osmId: "node/1", name: "Hospital Castle", tags: {} }] }), []);
  assert.equal(mappedSites({ pois: [{ osmId: "node/1", tags: { shop: "mall" } }] })[0].kind, "mall");
  assert.deepEqual(mappedSites({ pois: [{ osmId: "node/1", tags: { shop: "mall", abandoned: "yes" } }] }), []);
});

function fixture(t, { saved = null, response = () => Response.json(pack), blockedStorage = false } = {}) {
  const nodes = new Map(), writes = [], callbacks = [], draws = [];
  const node = () => ({ value: "", disabled: false, hidden: true, textContent: "", events: {},
    addEventListener(type, handler) { this.events[type] = handler; } });
  const get = id => { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); };
  const doc = { documentElement: { dataset: {}, lang: "en" },
    getElementById: get, querySelectorAll: () => [], head: { append() {} },
    createElement(type) {
      if (type !== "canvas") return node();
      return { getContext: () => ({ fillRect: (...args) => draws.push(args) }),
        toDataURL: () => "data:image/png;base64,fixture" };
    } };
  const previous = globalThis.Image;
  globalThis.Image = class { async decode() {} };
  t.after(() => { globalThis.Image = previous; });
  const storage = {
    getItem: key => { assert.equal(key, APPEARANCE_KEY); if (blockedStorage) throw new Error("Storage blocked"); return saved; },
    setItem: (key, value) => writes.push([key, value]),
  };
  t.mock.method(console, "error", () => {});
  const ui = setupMapAppearance((key, args) => translate("en", key, args), {
    doc, storage, fetcher: response, onChange: () => callbacks.push(mapAppearance()),
  });
  return { ui, doc, get, writes, callbacks, draws };
}

test("live switching, independent local preference, diagnostic snapshot and notebook use the same validated pack", async t => {
  const f = fixture(t);
  await f.ui.activate("ascii");
  await f.ui.activate("path-pixel");
  assert.equal(f.doc.documentElement.dataset.mapTileset, "path-pixel");
  assert.deepEqual(f.writes.at(-1), [APPEARANCE_KEY, "path-pixel"]);
  const diagnostic = diagnosticSnapshot({ col: 2, row: 3 }, { doc: f.doc,
    viewport: { innerWidth: 375, innerHeight: 812, devicePixelRatio: 2 } });
  assert.equal(diagnostic.appearance.tileset, "path-pixel");
  const rects = [];
  const ctx = { fillRect: (...args) => rects.push(args), fillText() {}, beginPath() {}, stroke() {},
    setLineDash() {}, moveTo() {}, lineTo() {}, arc() {}, fill() {} };
  const frozenView = journeyMapView(initialJourney(0, 0, 0));
  frozenView.terrain = { cells: [{ col: 0, row: 0, terrain: "plain", siteKind: "stadium" }], stride: 1 };
  drawJourneyMap({ getContext: () => ctx }, {
    points: [{ col: 0, row: 0 }], stops: [], cellSizeMeters: 250,
    terrain: { cells: [{ col: 0, row: 0, terrain: "plain", siteKind: "stadium" }], stride: 1 },
  }, (key, args) => translate("en", key, args));
  assert.ok(rects.length > pack.tiles.stadium.rects.length);
  await f.ui.activate("ascii");
  assert.equal(mapAppearance().tileset, "ascii");
  assert.equal(f.get("map-tileset-credit").textContent, "");
  rects.length = 0;
  drawJourneyMap({ getContext: () => ctx }, frozenView, (key, args) => translate("en", key, args));
  assert.ok(rects.length > pack.tiles.stadium.rects.length);
  assert.equal(frozenView.appearance.tileset, "path-pixel");
});

test("failed manifest retains working ASCII, reports error and does not persist a broken preference", async t => {
  // The already validated pack is process-cached; test rejection before any activation in a fresh module.
  const isolated = await import(`../map-appearance.mjs?failure=${Date.now()}`);
  const f = fixture(t);
  const writes = [];
  const ui = isolated.setupMapAppearance((key, args) => translate("en", key, args), {
    doc: f.doc, storage: { getItem: () => null, setItem: (...args) => writes.push(args) },
    fetcher: async () => Response.json({ ...pack, tiles: {} }),
  });
  await ui.activate("path-pixel");
  assert.equal(isolated.mapAppearance().tileset, "ascii");
  assert.match(f.get("map-appearance-status").textContent, /Incomplete tileset/);
  assert.deepEqual(writes, []);
});

test("invalid saved preference or blocked storage is explicit without disabling ASCII", async t => {
  const f = fixture(t, { saved: "remote-executable-pack" });
  assert.match(f.get("map-appearance-status").textContent, /Invalid saved/);
  const blocked = fixture(t, { blockedStorage: true });
  assert.match(blocked.get("map-appearance-status").textContent, /Storage blocked/);
  assert.equal(blocked.get("map-tileset").disabled, false);
});

test("tile image decode failure retains ASCII and reports the failed resource rather than partial activation", async t => {
  const isolated = await import(`../map-appearance.mjs?decode-failure=${Date.now()}`);
  const f = fixture(t);
  globalThis.Image = class { async decode() { throw new Error("Tile PNG decode failed"); } };
  const writes = [];
  const ui = isolated.setupMapAppearance((key, args) => translate("en", key, args), {
    doc: f.doc, storage: { getItem: () => null, setItem: (...args) => writes.push(args) },
    fetcher: async () => Response.json(pack),
  });
  await ui.activate("path-pixel");
  assert.equal(isolated.mapAppearance().tileset, "ascii");
  assert.match(f.get("map-appearance-status").textContent, /Tile PNG decode failed/);
  assert.deepEqual(writes, []);
});
