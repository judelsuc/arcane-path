export const SITE_GLYPHS = Object.freeze({
  stadium: "S", mall: "M", cemetery: "C", airport: "A", hospital: "H", university: "U",
  industrial: "I", harbour: "P", garden: "G", attraction: "Z", castle: "K", exhibition: "E",
});
export const TERRAIN_KINDS = Object.freeze(["plain", "water", "road", "major_road", "rail", "cable",
  "cable_station", "mountain", "hill", "building", "forest", "grass", "field", "vineyard",
  "park", "church", "station", "place"]);
export const TILE_KINDS = Object.freeze([...TERRAIN_KINDS, ...Object.keys(SITE_GLYPHS), "unknown"]);
export const APPEARANCE_KEY = "arcane-path-map-appearance-v1";
let current = { tileset: "ascii", skin: "default" };
let activePack;

export function mapAppearance() { return { ...current }; }
export function pixelPack() { return activePack; }

export function mappedSites(cell) {
  const found = new Map();
  for (const site of cell.sites ?? []) {
    if (Object.hasOwn(SITE_GLYPHS, site.kind) && /^(node|way|relation)\/\d+$/.test(site.osmId)) {
      found.set(site.osmId, site);
    }
  }
  // Old maps retain only these exact source tags; never infer a site from its name.
  for (const poi of cell.pois ?? []) {
    const tags = poi.tags ?? {};
    const kind = tags.shop === "mall" ? "mall" : tags.amenity === "grave_yard" ? "cemetery"
      : tags.amenity === "hospital" ? "hospital" : ["university", "college"].includes(tags.amenity) ? "university"
      : ["zoo", "theme_park"].includes(tags.tourism) ? "attraction"
      : ["castle", "archaeological_site", "fort"].includes(tags.historic) ? "castle"
      : ["exhibition_centre", "conference_centre"].includes(tags.amenity) ? "exhibition" : null;
    if (kind && tags.disused !== "yes" && tags.abandoned !== "yes" && !found.has(poi.osmId)) {
      found.set(poi.osmId, { osmId: poi.osmId, kind, ...(poi.name ? { name: poi.name } : {}) });
    }
  }
  return [...found.values()].sort((a, b) => Object.keys(SITE_GLYPHS).indexOf(a.kind) -
    Object.keys(SITE_GLYPHS).indexOf(b.kind) || a.osmId.localeCompare(b.osmId));
}

export function visualKind(cell) {
  if (cell.unavailable) return "unknown";
  // Preserve mapped transport/water at the same scale; sites are a separate small badge.
  return ["water", "road", "major_road", "rail", "cable", "cable_station", "station"].includes(cell.terrain)
    ? cell.terrain : mappedSites(cell)[0]?.kind ?? cell.terrain;
}

export function validatePixelPack(pack) {
  if (!pack || pack.version !== 1 || pack.id !== "path-pixel" || pack.size !== 16 ||
      pack.license !== "CC0-1.0" || typeof pack.credit !== "string" || pack.credit.length > 200 ||
      !pack.tiles || Object.keys(pack.tiles).length !== TILE_KINDS.length ||
      TILE_KINDS.some(kind => !Object.hasOwn(pack.tiles, kind))) throw new Error("Incomplete tileset manifest.");
  for (const tile of Object.values(pack.tiles)) {
    if (!/^#[a-f0-9]{6}$/i.test(tile.background) || !Array.isArray(tile.rects) ||
        !tile.rects.length || tile.rects.length > 64 || tile.rects.some(rect => !Array.isArray(rect) ||
          rect.length !== 5 || rect.slice(0, 4).some(v => !Number.isInteger(v)) ||
          rect[0] < 0 || rect[1] < 0 || rect[2] < 1 || rect[3] < 1 ||
          rect[0] + rect[2] > 16 || rect[1] + rect[3] > 16 || !/^#[a-f0-9]{6}$/i.test(rect[4]))) {
      throw new Error("Invalid pixel tile geometry or colour.");
    }
  }
  return pack;
}

export function drawPixelTile(context, pack, kind, x, y, size) {
  const tile = pack.tiles[kind];
  if (!tile) throw new Error(`Missing pixel tile: ${kind}`);
  context.fillStyle = tile.background;
  context.fillRect(x, y, size, size);
  for (const [left, top, width, height, color] of tile.rects) {
    context.fillStyle = color;
    context.fillRect(x + left * size / 16, y + top * size / 16, width * size / 16, height * size / 16);
  }
}

export function setupMapAppearance(t, { onChange = () => {}, doc = document,
  storage, fetcher = fetch } = {}) {
  const select = doc.getElementById("map-tileset"), status = doc.getElementById("map-appearance-status");
  const credit = doc.getElementById("map-tileset-credit");
  let loading = false, error = "";
  function localize() {
    select.value = current.tileset;
    select.disabled = loading;
    status.textContent = error ? t("appearance.error", { error }) : loading ? t("appearance.loading")
      : t("appearance.active", { name: t(`appearance.${current.tileset}`) });
    credit.textContent = current.tileset === "path-pixel" ? activePack.credit : "";
  }
  async function activate(value, persist = true) {
    if (loading) return;
    if (!["ascii", "path-pixel"].includes(value)) {
      error = "Unsupported map appearance.";
      console.error(error);
      localize();
      return;
    }
    loading = true;
    error = "";
    localize();
    try {
      let candidate = activePack;
      if (value === "path-pixel" && !candidate) {
        const response = await fetcher("./public/tilesets/path-pixel.json", { signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error(`Tileset HTTP ${response.status}`);
        candidate = validatePixelPack(await response.json());
        const rules = [];
        for (const kind of TILE_KINDS) {
          const canvas = doc.createElement("canvas");
          canvas.width = canvas.height = 16;
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Pixel tile canvas unavailable.");
          drawPixelTile(context, candidate, kind, 0, 0, 16);
          const source = canvas.toDataURL("image/png");
          const image = new Image();
          image.src = source;
          await image.decode();
          rules.push(`[data-map-tileset="path-pixel"] [data-map-kind="${kind}"]{--map-tile:url("${source}")}`);
          rules.push(`[data-map-tileset="path-pixel"] [data-site-kind="${kind}"]{--site-tile:url("${source}")}`);
        }
        let style = doc.getElementById("map-pixel-rules");
        if (!style) { style = doc.createElement("style"); style.id = "map-pixel-rules"; doc.head.append(style); }
        style.textContent = rules.join("\n");
      }
      if (value === "path-pixel") activePack = candidate;
      current = { tileset: value, skin: "default" };
      doc.documentElement.dataset.mapTileset = value;
      onChange();
      if (persist) storage.setItem(APPEARANCE_KEY, value);
    } catch (reason) {
      console.error("Map appearance change failed:", reason);
      error = reason.message;
    } finally { loading = false; localize(); }
  }
  select.addEventListener("change", () => { void activate(select.value); });
  let stored;
  try { storage ??= globalThis.localStorage; stored = storage.getItem(APPEARANCE_KEY); }
  catch (reason) { console.error("Map appearance preference unavailable:", reason); error = reason.message; }
  doc.documentElement.dataset.mapTileset = current.tileset;
  localize();
  if (stored) {
    if (["ascii", "path-pixel"].includes(stored)) void activate(stored, false);
    else { error = "Invalid saved map appearance."; console.error(error); localize(); }
  }
  return { activate, localize };
}

export function decorateMapTile(tile, cell, { doc = document } = {}) {
  tile.dataset.mapKind = visualKind(cell);
  const site = mappedSites(cell)[0];
  if (!site || cell.unavailable) return;
  tile.dataset.siteKind = site.kind;
  if (tile.dataset.mapKind === site.kind) return;
  const badge = doc.createElement("span");
  badge.className = "map-site-badge";
  badge.setAttribute("aria-hidden", "true");
  badge.textContent = SITE_GLYPHS[site.kind];
  tile.append(badge);
}
