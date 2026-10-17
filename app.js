import { resolveLocale, translate } from "./i18n.mjs";
import { osmReferenceUrls } from "./osm-reference.mjs";
import { cellInfo } from "./cell-info.mjs";
import { setupCellContent } from "./cell-content-ui.mjs";
import { setupTravel } from "./travel-ui.mjs";
import { setupAudio } from "./audio-ui.mjs";
import { setupButtonShortcuts } from "./button-shortcuts.mjs";
import { setupStartingPoint, validateStartingMap } from "./starting-point-ui.mjs";
import { setupCopyCoordinates } from "./copy-coordinates.mjs";
import { setupShortcutHelp } from "./shortcut-help.mjs";

const mapElement = document.querySelector("#ascii-map");
const viewport = document.querySelector("#map-viewport");
const languageSelect = document.querySelector("#language");
const regionSelect = document.querySelector("#region");
const osmDrawer = document.querySelector("#osm-drawer");
const openOsm = document.querySelector("#open-osm");
const regionPaths = {
  firmi: "./public/map.json",
  paris: "./public/maps/paris.json",
  alps: "./public/maps/alps.json",
  tahiti: "./public/maps/tahiti.json",
};
let locale = resolveLocale(navigator.languages);
let mapData;
let loadFailed = false;
let activeRequest;
let inspectedTile;
let entered = false;
const cellContent = setupCellContent(t);
const audio = setupAudio(t);
const coordinates = setupCopyCoordinates(t, () => mapData && inspectedTile
  ? cellInfo(mapData, Number(inspectedTile.dataset.row), Number(inspectedTile.dataset.col)) : null);
const controls = setupShortcutHelp(t);
const travel = setupTravel({
  t, renderMap,
  musicAudio: audio.busking,
  onAudioContext: context => audio.update(context),
  onStep: terrain => audio.step(terrain),
  onActiveChange(active) {
    document.querySelector("#journey-setup").hidden = !entered || active;
    document.querySelector("#game-content").hidden = !entered || !active;
  },
  selectPlayer(data, tile) {
    inspectTile(tile);
    if (data.rows[Number(tile.dataset.row)][Number(tile.dataset.col)].unavailable) {
      cellContent.reset();
    } else {
      cellContent.select(data, tile);
    }
  },
  resetContent: () => cellContent.reset(),
  onStop: () => loadRegion(),
});
function addOrigin({ region, name }) {
  if ([...regionSelect.options].some(option => option.value === region)) return;
  const option = document.createElement("option");
  option.value = region;
  option.textContent = name.split(",")[0];
  option.title = name;
  regionSelect.append(option);
}
const startingPoint = setupStartingPoint(t, {
  addOrigin,
  setPreparing: value => travel.setPreparing(value),
  async select(region, data) {
    addOrigin({ region, name: data.name });
    regionSelect.value = region;
    if (!await loadRegion(data)) throw new Error(t("loadError"));
  },
});

document.querySelector("#enter-world").addEventListener("click", () => {
  entered = true;
  document.querySelector("#title-screen").hidden = true;
  document.querySelector("#journey-setup").hidden = false;
  document.body.classList.remove("is-title");
  document.querySelector("#region").focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "instant" });
  controls.welcome();
});
document.querySelector("#back-title").addEventListener("click", () => {
  startingPoint.reset();
  travel.reset();
  entered = false;
  document.querySelector("#journey-setup").hidden = true;
  document.querySelector("#title-screen").hidden = false;
  document.body.classList.add("is-title");
  document.querySelector("#enter-world").focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "instant" });
});
document.querySelector("#open-options").addEventListener("click", () => {
  document.querySelector("#options-dialog").showModal();
});

osmDrawer.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    osmDrawer.close();
  }
});

openOsm.addEventListener("click", () => {
  if (!mapData) return;
  osmDrawer.showModal();
  const frame = document.querySelector("#osm-frame");
  if (!frame.hasAttribute("src")) {
    frame.src = osmReferenceUrls(mapData.referenceBounds ?? mapData.bounds, mapData.player).embed;
  }
});

function tileDetails(tile, includePois = true) {
  const info = cellInfo(mapData, Number(tile.dataset.row), Number(tile.dataset.col));
  let details = t("cellDetails", {
    ...info,
    terrain: info.names.length
      ? `${info.names.join(", ")} — ${t(`terrain.${info.terrain}`)}`
      : t(`terrain.${info.terrain}`),
    latitude: info.latitude.toFixed(5),
    longitude: info.longitude.toFixed(5),
  });
  if (info.waterCoveragePercent > 0) {
    details += `\n${t("cellWaterCoverage", { percent: info.waterCoveragePercent.toFixed(1) })}`;
  }
  if (info.waterways.length) {
    details += `\n${t("cellWaterways")}`;
  }
  if (!includePois || !info.pois.length) {
    return details;
  }
  const points = info.pois.map((poi) => {
    const category = t(`poi.${poi.category}`);
    return poi.name ? `${poi.name} (${category})` : category;
  });
  return `${details}\n${t("cellPois", { points: points.join("; ") })}`;
}

function inspectTile(tile) {
  if (!mapData || !tile?.matches(".tile")) {
    return;
  }
  inspectedTile?.classList.remove("tile--inspected");
  inspectedTile = tile;
  tile.classList.add("tile--inspected");
  document.querySelector("#cell-info").textContent = tileDetails(tile, false);
  updateCellHeading(tile);
  coordinates.update();
}

function updateCellHeading(tile) {
  const info = cellInfo(mapData, Number(tile.dataset.row), Number(tile.dataset.col));
  const fallbackName = info.pois.find(poi => poi.name)?.name ??
    info.contentSources.find(source => source.tags.name)?.tags.name;
  const names = info.names.length ? info.names : fallbackName ? [fallbackName] : [];
  document.querySelector("#ascii-title").textContent = names.length
    ? [...new Set(names)].join(" · ") : t(`terrain.${info.terrain}`);
  updateCountry(mapData.rows[Number(tile.dataset.row)][Number(tile.dataset.col)].countryCodes ?? []);
}

function updateCountry(codes) {
  const names = new Intl.DisplayNames([locale], { type: "region" });
  document.querySelector("#map-country").textContent = codes.length
    ? codes.map(code => names.of(code)).join(" · ") : t("countryUnavailable");
}

for (const event of ["focusin", "click"]) {
  mapElement.addEventListener(event, (event) => {
    if (travel.active) return;
    inspectTile(event.target);
    if (!mapData?.rows[Number(event.target.dataset.row)]?.[Number(event.target.dataset.col)]?.unavailable) {
      cellContent.select(mapData, event.target);
    }
  });
}

function t(key, parameters) {
  return translate(locale, key, parameters);
}

function localize() {
  document.documentElement.lang = locale;
  document.title = t("pageTitle");
  document.querySelector('meta[name="description"]').content = t("description");
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  languageSelect.value = locale;
  updateCountry([]);
  cellContent.localize(locale);
  audio.localize();
  travel.localize();
  startingPoint.localize();
  coordinates.update();
  controls.localize();
  document.querySelector("#starting-map-status").textContent = mapData
    ? t("setupSelected", { name: mapData.origin ? mapData.name.split(",")[0] : mapData.name })
    : t(loadFailed ? "loadError" : "loading");
  mapElement.setAttribute("aria-label", t("mapLabel"));
  document.querySelector("#cell-info").textContent = t("cellHint");

  if (loadFailed) {
    document.querySelector(".map-error").textContent = t("loadError");
  }
  if (!mapData) {
    document.querySelector("#map-title").textContent = t(loadFailed ? "loadErrorTitle" : "loading");
    document.querySelector("#ascii-title").textContent = t(loadFailed ? "loadErrorTitle" : "loading");
    return;
  }

  document.querySelector("#map-title").textContent = mapData.illustrative
    ? t("demoRegion", { name: mapData.name })
    : mapData.name;
  document.querySelector("#ascii-title").textContent = document.querySelector("#map-title").textContent;
  document.querySelector("#osm-frame").title = t("referenceFrame", { name: mapData.name });
  document.querySelector("#map-scale").textContent =
    t("scale", { meters: mapData.cellSizeMeters });
  document.querySelector("#map-size").textContent =
    t("size", { width: mapData.width, height: mapData.height });
  document.querySelector("#map-source").textContent =
    t(mapData.illustrative ? "demoSource" : "source", { source: mapData.source });
  const attribution = document.querySelector("#map-attribution");
  attribution.hidden = !mapData.copyright;
  attribution.replaceChildren();
  if (mapData.copyright) {
    const credit = document.createElement("a");
    credit.href = "https://www.openstreetmap.org/copyright";
    credit.textContent = t("attribution");
    const license = document.createElement("a");
    license.href = "https://opendatacommons.org/licenses/odbl/1-0/";
    license.textContent = "ODbL 1.0";
    attribution.append(credit, " · ", license);
  }

  const legend = document.createDocumentFragment();
  mapData.legend.forEach((entry) => {
    const item = document.createElement("li");
    const glyph = document.createElement("span");
    glyph.className = `legend-glyph tile--${entry.terrain}`;
    glyph.textContent = entry.glyph;
    const label = document.createElement("span");
    label.textContent = t(`terrain.${entry.terrain}`);
    item.append(glyph, label);
    legend.append(item);
  });
  document.querySelector("#legend").replaceChildren(legend);
  mapElement.querySelectorAll(".tile").forEach((tile) => {
    const details = tileDetails(tile);
    tile.setAttribute("aria-label", tile.classList.contains("tile--downloading")
      ? `${t("travelChunkLoading")} ${details}` : details);
  });
  if (inspectedTile) {
    document.querySelector("#cell-info").textContent = tileDetails(inspectedTile, false);
    updateCellHeading(inspectedTile);
  }
}

function renderMap(data) {
  if (
    !data ||
    !Array.isArray(data.rows) ||
    data.rows.length !== data.height ||
    data.rows.some((row) => !Array.isArray(row) || row.length !== data.width) ||
    !Array.isArray(data.legend)
  ) {
    throw new Error("Incomplete or inconsistent map data.");
  }
  data.legend.forEach((entry) => t(`terrain.${entry.terrain}`));
  const referenceUrls = osmReferenceUrls(data.referenceBounds ?? data.bounds, data.player);

  const map = document.createDocumentFragment();
  data.rows.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      const tile = document.createElement("span");
      tile.className = `tile tile--${cell.terrain}`;
      tile.textContent = cell.glyph;
      if (cell.downloading) {
        tile.classList.add("tile--downloading");
        tile.title = t("travelChunkLoading");
        tile.setAttribute("aria-label", t("travelChunkLoading"));
        tile.setAttribute("aria-busy", "true");
      }
      tile.dataset.row = rowIndex;
      tile.dataset.col = colIndex;
      tile.tabIndex = travel.active ? -1 : 0;
      tile.setAttribute("aria-describedby", "cell-info");
      map.append(tile);
    });
    if (rowIndex < data.rows.length - 1) {
      map.append(document.createTextNode("\n"));
    }
  });
  mapElement.replaceChildren(map);
  mapElement.style.setProperty("--map-columns", data.width);
  inspectedTile = undefined;
  coordinates.update();
  viewport.replaceChildren(mapElement);
  mapData = data;
  const referenceFrame = document.querySelector("#osm-frame");
  if (referenceFrame.hasAttribute("src") && referenceFrame.src !== referenceUrls.embed) {
    referenceFrame.removeAttribute("src");
  }
  document.querySelector("#osm-link").href = referenceUrls.full;
  document.querySelector("#osm-reference").hidden = false;
  openOsm.disabled = false;
  localize();
}

languageSelect.addEventListener("change", () => {
  locale = languageSelect.value;
  localize();
});
localize();

async function loadRegion(prepared) {
  travel.reset();
  travel.configure(regionSelect.value, undefined);
  activeRequest?.abort();
  const request = new AbortController();
  activeRequest = request;
  mapData = undefined;
  osmDrawer.close();
  openOsm.disabled = true;
  cellContent.reset();
  inspectedTile = undefined;
  loadFailed = false;
  document.querySelector("#osm-reference").hidden = true;
  document.querySelector("#osm-frame").removeAttribute("src");
  document.querySelector("#osm-link").removeAttribute("href");
  viewport.replaceChildren(mapElement);
  mapElement.replaceChildren();
  document.querySelector("#legend").replaceChildren();
  for (const id of ["map-scale", "map-size", "map-source", "map-attribution"]) {
    document.getElementById(id).textContent = "";
  }
  document.querySelector("#map-attribution").hidden = true;
  localize();
  try {
    let data = prepared;
    if (!data) {
      const path = regionPaths[regionSelect.value] ??
        `/api/origin-map?${new URLSearchParams({ region: regionSelect.value })}`;
      const response = await fetch(path, { signal: request.signal });
      if (!response.ok) {
        throw new Error(`Map request failed (HTTP ${response.status}).`);
      }
      data = await response.json();
    }
    if (!request.signal.aborted) {
      if (regionSelect.value.startsWith("origin-")) validateStartingMap(data);
      renderMap(data);
      travel.configure(regionSelect.value, data);
      return true;
    }
  } catch (error) {
    if (request.signal.aborted) {
      return;
    }
    console.error("Unable to load map:", error);
    loadFailed = true;
    mapData = undefined;
    const message = document.createElement("p");
    message.className = "map-error";
    message.setAttribute("role", "alert");
    viewport.replaceChildren(message);
    localize();
  }
  return false;
}

regionSelect.addEventListener("change", () => {
  startingPoint.reset();
  loadRegion();
});
setupButtonShortcuts(t);
loadRegion();
