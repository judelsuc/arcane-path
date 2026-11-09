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
import { LEGEND_THEMES, treasureId, composedReward } from "../legend-rewards.mjs";
import { pixelSet, drawPixelSprite } from "../minigames/legend-pixel-art.mjs";
import { PLAYER_ICONS, themePlayerIcon } from "../player-icons.mjs";

const pack = JSON.parse(readFileSync(new URL("../public/tilesets/path-pixel.json", import.meta.url)));

test("generated carried icons render on ASCII maps and captured notebooks and are cleared on drop", async t => {
  const f = fixture(t), artwork = { ...PLAYER_ICONS[0], id: "generated:daily-fixture:role-1" };
  const id = treasureId("node/42", 6, true), reward = { ...composedReward(6), icon: artwork };
  const state = { treasures: { version: 1, equipped: null, iconEquipped: id,
    inventory: [{ id, reward, placement: { id, x: 0, y: 0, rotated: false } }] } };
  const controller = f.ui;
  await controller.syncJourney(state);
  assert.equal(mapAppearance().playerIcon, artwork.id);
  assert.deepEqual(mapAppearance().playerIconArtwork, artwork);
  const captured = mapAppearance();
  await controller.syncJourney({ treasures: { version: 1, equipped: null, iconEquipped: null, inventory: [] } });
  assert.equal(mapAppearance().playerIcon, "default");
  assert.equal(mapAppearance().playerIconArtwork, undefined);
  assert.deepEqual(captured.playerIconArtwork, artwork);
});
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

test("dotted directions have a pale casing and dark core above both terrain tilesets", async t => {
  const f = fixture(t);
  for (const tileset of ["ascii", "path-pixel"]) {
    await f.ui.activate(tileset);
    const strokes = [], events = [];
    let path = [], dash = [];
    const ctx = {
      fillRect() { events.push("terrain"); }, fillText() {}, arc() {},
      fill() { events.push("marker"); },
      beginPath() { path = []; },
      moveTo(...p) { path.push(p); }, lineTo(...p) { path.push(p); },
      setLineDash(value) { dash = value; },
      stroke() {
        events.push(this.strokeStyle);
        strokes.push({ color: this.strokeStyle, width: this.lineWidth,
          cap: this.lineCap, dash, path: structuredClone(path) });
      },
    };
    const view = journeyMapView({ col: 4, row: 3, distanceMeters: 1000,
      trail: { origin: { col: 0, row: 0 } } });
    view.terrain = { cells: [{ col: 2, row: 1, terrain: "forest" }], stride: 1 };
    drawJourneyMap({ getContext: () => ctx }, view, key => translate("en", key));
    const casing = strokes.find(stroke => stroke.color === "#fff8e6");
    const core = strokes.find(stroke => stroke.color === "#594022");
    assert.deepEqual(casing, { color: "#fff8e6", width: 10, cap: "round",
      dash: [4, 14], path: core.path });
    assert.equal(core.width, 5);
    assert.equal(core.cap, "round");
    assert.deepEqual(core.dash, casing.dash);
    assert.equal(core.path.length, 2);
    assert.ok(events.lastIndexOf("terrain") < events.indexOf(casing.color));
    assert.ok(events.indexOf(casing.color) < events.indexOf(core.color));
    assert.ok(events.indexOf(core.color) < events.indexOf("marker"));
    assert.equal(strokes.find(stroke => stroke.color === "#ac3029").cap, "butt");
  }
  await f.ui.activate("ascii");
});

test("collectible looks apply to map and adventure renderers only while carried and preserve browser preferences", async t => {
  const f = fixture(t);
  await f.ui.activate("ascii");
  const writes = f.writes.length, geometries = new Set(), sprites = new Set();
  for (const [seed, theme] of LEGEND_THEMES.entries()) {
    const id = treasureId("node/42", seed), state = { treasures: {
      inventory: [{ id }], equipped: id,
    } };
    await f.ui.syncJourney(state);
    assert.deepEqual(mapAppearance(), { tileset: "path-pixel", skin: theme.id, uiSkin: "default", playerIcon: "default" });
    assert.equal(f.doc.documentElement.dataset.mapSkin, theme.id);
    assert.equal(f.get("map-tileset").disabled, true);
    assert.equal(f.writes.length, writes, "equipping never overwrites browser preference");
    const set = pixelSet(0);
    geometries.add(JSON.stringify([set.masonry, set.trim]));
    assert.equal(set.accent, theme.accent);
    const sprite = [], ctx = { fillRect: (...args) => sprite.push([ctx.fillStyle, ...args]) };
    drawPixelSprite(ctx, "explorer", 0, 0);
    sprites.add(JSON.stringify(sprite));
    const frozen = journeyMapView(initialJourney(0, 0, 0));
    await f.ui.syncJourney({ treasures: { inventory: [], equipped: id } });
    assert.deepEqual(mapAppearance(), { tileset: "ascii", skin: "default", uiSkin: "default", playerIcon: "default" });
    assert.equal(f.get("map-tileset").disabled, false);
    assert.equal(frozen.appearance.skin, theme.id);
    const rects = [];
    drawJourneyMap({ getContext: () => ({ fillRect: (...args) => rects.push(args),
      fillText() {}, beginPath() {}, stroke() {}, setLineDash() {}, moveTo() {}, lineTo() {}, arc() {}, fill() {} }) },
    { ...frozen, terrain: { cells: [{ col: 0, row: 0, terrain: "forest" }], stride: 1 } }, key => key);
    assert.ok(rects.length > pack.tiles.forest.rects.length, "frozen notebook retains its collectible tiles");
  }
  assert.equal(geometries.size, 16);
  assert.equal(sprites.size, 16);
});

test("all sixteen UI skins work independently with ASCII or a different map theme and reset with custody", async t => {
  const f = fixture(t), mapId = treasureId("node/42", 1);
  await f.ui.syncJourney(null);
  await f.ui.activate("ascii");
  const writes = f.writes.length;
  for (const [seed, theme] of LEGEND_THEMES.entries()) {
    const id = treasureId("way/123", seed);
    const state = { treasures: { inventory: [{ id }, { id: mapId }], equipped: null, uiEquipped: id } };
    await f.ui.syncJourney(state);
    assert.deepEqual(mapAppearance(), { tileset: "ascii", skin: "default", uiSkin: theme.id, playerIcon: "default" });
    assert.equal(f.doc.documentElement.dataset.uiSkin, theme.id);
    assert.equal(f.get("map-tileset").disabled, false);
    assert.ok(f.get("treasure-ui-rules").textContent.includes(`--skin-surface:${theme.floor}`));
    await f.ui.syncJourney({ treasures: { ...state.treasures, equipped: mapId } });
    assert.deepEqual(mapAppearance(), { tileset: "path-pixel", skin: "moonlit", uiSkin: theme.id, playerIcon: "default" });
    assert.equal(diagnosticSnapshot({ col: 2, row: 3 }, { doc: f.doc,
      viewport: { innerWidth: 375, innerHeight: 812, devicePixelRatio: 2 } }).appearance.uiSkin, theme.id);
  }
  await f.ui.syncJourney(null);
  assert.deepEqual(mapAppearance(), { tileset: "ascii", skin: "default", uiSkin: "default", playerIcon: "default" });
  assert.equal(f.doc.documentElement.dataset.uiSkin, "default");
  assert.equal(f.writes.length, writes);
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

test("earned player icons are independent of skins, retain ASCII and freeze into notebook maps", async t => {
  const f = fixture(t), selected = new Set();
  await f.ui.syncJourney(null);
  await f.ui.activate("ascii");
  const writes = f.writes.length;
  for (const [seed, theme] of LEGEND_THEMES.entries()) {
    const id = treasureId("node/42", seed), icon = themePlayerIcon(theme.id);
    await f.ui.syncJourney({ treasures: { inventory: [{ id }], equipped: null, iconEquipped: id } });
    selected.add(icon);
    assert.deepEqual(mapAppearance(), { tileset: "ascii", skin: "default", uiSkin: "default", playerIcon: icon });
    assert.equal(f.get("map-tileset").disabled, false);
    assert.ok(f.get("treasure-ui-rules").textContent.includes(`data-player-icon="${icon}"`));
    const snapshot = diagnosticSnapshot({ col: 0, row: 0 }, { doc: f.doc,
      viewport: { innerWidth: 375, innerHeight: 812, devicePixelRatio: 2 } });
    assert.equal(snapshot.appearance.playerIcon, icon);
    const frozen = journeyMapView(initialJourney(0, 0, 0));
    await f.ui.syncJourney(null);
    assert.equal(mapAppearance().playerIcon, "default");
    const colours = [];
    const ctx = { fillRect: () => colours.push(ctx.fillStyle), fillText() {}, beginPath() {}, stroke() {},
      setLineDash() {}, moveTo() {}, lineTo() {}, arc() {}, fill() {} };
    drawJourneyMap({ getContext: () => ctx }, frozen, key => key);
    assert.ok(colours.includes(PLAYER_ICONS.find(item => item.id === icon).coat));
    assert.equal(frozen.appearance.playerIcon, icon);
  }
  assert.equal(selected.size, 8);
  assert.equal(f.writes.length, writes);
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
