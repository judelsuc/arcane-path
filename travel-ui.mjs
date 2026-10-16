import { initialJourney, moveJourney, restJourney, chunkPosition, journeyDate } from "./travel.mjs";
import { createChunkStream, neighborDownloads } from "./travel-stream.mjs";
import { cellInfo } from "./cell-info.mjs";

export function setupTravel({ t, renderMap, selectPlayer, resetContent, onStop }) {
  const start = document.querySelector("#start-travel");
  const stop = document.querySelector("#stop-travel");
  const rest = document.querySelector("#rest-travel");
  const retry = document.querySelector("#retry-travel");
  const look = document.querySelector("#look-travel");
  const controls = document.querySelector("#travel-controls");
  const stats = document.querySelector("#travel-stats");
  const status = document.querySelector("#travel-status");
  const height = document.querySelector("#travel-elevation");
  const note = document.querySelector("#travel-note");
  const directions = [...document.querySelectorAll("[data-move]")];
  let state, stream, region, base, token = 0, busy = false, error = "", active = false;
  let transient = "", missingHeightMoves = 0;
  let heading = [0, 0];
  let cursor, cameraData;
  const reported = new Set();

  function localize() {
    document.querySelector("#map-workspace").classList.toggle("travel-active", active);
    document.body.classList.toggle("is-travelling", active);
    controls.hidden = !active;
    start.hidden = active;
    start.disabled = !base;
    retry.disabled = busy;
    stop.disabled = busy;
    status.textContent = error ? t("travelError", { error }) : transient ? t(transient) : "";
    stats.textContent = state ? t("travelStats", {
      distance: (state.distanceMeters / 1000).toFixed(2),
      time: state.elapsedMinutes.toFixed(0), fatigue: state.fatigue.toFixed(1),
      energy: state.energyKcal.toFixed(0), ascent: state.ascentMeters.toFixed(0),
      descent: state.descentMeters.toFixed(0),
    }) : "";
    const position = state && chunkPosition(state.col, state.row);
    const chunk = position && stream?.get(position.x, position.y);
    const cell = chunk?.rows[position.row][position.col];
    for (const button of directions) button.disabled = busy || !cell;
    rest.disabled = busy || !cell || Boolean(cursor);
    look.disabled = busy || !cell;
    look.textContent = t(cursor ? "travelLookExit" : "travelLook");
    look.setAttribute("aria-pressed", String(Boolean(cursor)));
    document.querySelector("#look-status").textContent = cursor ? t("travelLookHint") : "";
    document.querySelector("#travel-streaming").textContent = active && stream
      ? t("travelStreaming", { count: stream.chunks.size }) : "";
    height.replaceChildren();
    if (state) {
      const p = document.createElement("p");
      p.textContent = Number.isFinite(cell?.elevationMeters)
        ? t("travelHeight", { height: cell.elevationMeters.toFixed(0) }) : t("travelUnknownHeight");
      height.append(p);
      if (state.lastMove) {
        const speed = document.createElement("p");
        speed.textContent = t("travelSpeed", { speed: state.lastMove.speedKmh.toFixed(2) });
        height.append(speed);
      }
      if (missingHeightMoves) {
        const warning = document.createElement("p");
        warning.textContent = t("travelHeightEstimates", { count: missingHeightMoves });
        height.append(warning);
      }
      if (chunk?.elevation?.sourceUrl) {
        const credit = document.createElement("a");
        credit.href = chunk.elevation.sourceUrl;
        credit.target = "_blank";
        credit.rel = "noopener noreferrer";
        credit.textContent = `${chunk.elevation.source} · ${chunk.elevation.license}`;
        height.append(credit);
      }
    }
    note.textContent = active ? t("travelModelNote") : "";
    const clock = document.querySelector("#travel-clock");
    clock.textContent = state ? t("travelClock", {
      date: new Intl.DateTimeFormat(document.documentElement.lang, {
        dateStyle: "medium", timeStyle: "short", timeZone: "UTC",
      }).format(journeyDate(state)),
    }) : "";
    clock.dateTime = state ? journeyDate(state).toISOString() : "";
  }

  function draw() {
    if (!active || !state) return;
    const position = chunkPosition(state.col, state.row);
    const center = stream.get(position.x, position.y);
    if (!center) return;
    const latStep = (center.bounds.maxLatitude - center.bounds.minLatitude) / 8;
    const lonStep = (center.bounds.maxLongitude - center.bounds.minLongitude) / 8;
    const player = cellInfo(center, position.row, position.col);
    const rows = [];
    for (let row = 0; row < 24; row++) {
      const cells = [];
      for (let col = 0; col < 24; col++) {
        const chunk = stream.get(position.x - 1 + Math.floor(col / 8), position.y - 1 + Math.floor(row / 8));
        cells.push(chunk?.rows[row % 8][col % 8] ?? { terrain: "plain", glyph: "?", unavailable: true });
      }
      rows.push(cells);
    }
    const data = { ...center, rows, width: 24, height: 24, bounds: {
      minLongitude: center.bounds.minLongitude - 8 * lonStep,
      maxLongitude: center.bounds.maxLongitude + 8 * lonStep,
      minLatitude: center.bounds.minLatitude - 8 * latStep,
      maxLatitude: center.bounds.maxLatitude + 8 * latStep,
    }, referenceBounds: {
      minLongitude: player.longitude - 4 * lonStep, maxLongitude: player.longitude + 4 * lonStep,
      minLatitude: player.latitude - 4 * latStep, maxLatitude: player.latitude + 4 * latStep,
    }, player: { latitude: player.latitude, longitude: player.longitude } };
    // Use the same projection as the prepared chunks across the entire camera window.
    data.projectionLatitude = center.projectionLatitude;
    cameraData = data;
    renderMap(data);
    const tile = document.querySelector(`.tile[data-row="${position.row + 8}"][data-col="${position.col + 8}"]`);
    tile.classList.add("tile--player");
    tile.textContent = "@";
    tile.setAttribute("aria-current", "location");
    inspectPosition();
    localize();
  }

  function inspectPosition() {
    if (!cameraData || !state) return;
    const p = chunkPosition(state.col, state.row);
    const position = cursor ?? { row: p.row + 8, col: p.col + 8 };
    document.querySelector(".tile--look")?.classList.remove("tile--look");
    document.querySelector(".tile--selected")?.classList.remove("tile--selected");
    const tile = document.querySelector(`.tile[data-row="${position.row}"][data-col="${position.col}"]`);
    if (cursor) tile.classList.add("tile--look");
    selectPlayer(cameraData, tile);
  }

  function toggleLook() {
    if (!active || busy || !state) return;
    const p = chunkPosition(state.col, state.row);
    cursor = cursor ? undefined : { row: p.row + 8, col: p.col + 8 };
    inspectPosition();
    localize();
    document.querySelector("#ascii-map").focus({ preventScroll: true });
  }

  function step(dc, dr) {
    if (!cursor) return move(dc, dr);
    cursor = {
      col: Math.max(0, Math.min(cameraData.width - 1, cursor.col + dc)),
      row: Math.max(0, Math.min(cameraData.height - 1, cursor.row + dr)),
    };
    inspectPosition();
  }

  function report(errorValue) {
    console.error("Travel streaming failed:", errorValue);
    error = errorValue.message;
    localize();
  }

  function prefetch() {
    const neighbors = neighborDownloads(state.col, state.row, ...heading);
    stream.prioritize(neighbors);
    const currentToken = token;
    for (const { x, y } of neighbors) {
      const key = `${x},${y}`;
      stream.load(x, y).then(chunk => {
        if (token !== currentToken) return;
        if (chunk.elevation.error && !reported.has(key)) {
          reported.add(key);
          report(new Error(chunk.elevation.error));
        }
      }).catch(reason => {
        if (token !== currentToken) return;
        report(reason);
      });
    }
  }

  async function move(dc, dr) {
    if (!state || busy || !active) return;
    heading = [dc, dr];
    stream.prioritize(neighborDownloads(state.col, state.row, ...heading));
    busy = true;
    transient = "travelLoading";
    error = "";
    localize();
    const currentToken = token;
    try {
      const from = chunkPosition(state.col, state.row);
      const to = chunkPosition(state.col + dc, state.row + dr);
      const target = await stream.load(to.x, to.y, true);
      if (currentToken !== token) return;
      const fromCell = stream.get(from.x, from.y).rows[from.row][from.col];
      state = moveJourney(state, dc, dr, fromCell, target.rows[to.row][to.col]);
      if (!state.lastMove.elevationKnown) missingHeightMoves++;
      if (target.elevation.error) error = target.elevation.error;
      resetContent();
      draw();
      prefetch();
      document.querySelector("#ascii-map").focus({ preventScroll: true });
      await new Promise(resolve => setTimeout(resolve, 130));
    } catch (reason) {
      if (currentToken === token) report(reason);
    } finally {
      if (currentToken === token) {
        busy = false;
        transient = "";
        localize();
      }
    }
  }

  async function begin() {
    if (!base || active) return;
    const currentToken = ++token;
    active = true;
    busy = true;
    error = "";
    transient = "travelLoading";
    document.querySelector("#ascii-map").classList.add("travel-map");
    document.querySelector("#ascii-map").tabIndex = 0;
    document.querySelector("#map-viewport").classList.add("travel-viewport");
    localize();
    try {
      const health = await fetch("/api/travel", { signal: AbortSignal.timeout(5000) });
      if (!health.ok || !(health.headers.get("content-type") ?? "").includes("application/json")) {
        throw new Error(t("travelServerRequired"));
      }
      const config = await health.json();
      if (config.chunkSize !== 8 || config.cellSizeMeters !== 250) throw new Error("Unsupported travel server.");
      if (currentToken !== token) return;
      state = initialJourney(Math.floor(base.width / 2), Math.floor(base.height / 2));
      const p = chunkPosition(state.col, state.row);
      stream = createChunkStream(region, { onUpdate: () => {
        if (currentToken === token) draw();
      } });
      const first = await stream.load(p.x, p.y, true);
      if (currentToken !== token) return;
      if (first.elevation.error) error = first.elevation.error;
      resetContent();
      draw();
      prefetch();
      document.querySelector("#ascii-map").focus({ preventScroll: true });
    } catch (reason) {
      if (currentToken === token) report(reason);
    } finally {
      if (currentToken === token) {
        busy = false;
        transient = "";
        localize();
      }
    }
  }

  function reset() {
    token++;
    stream?.stop();
    stream = undefined;
    state = undefined;
    cursor = cameraData = undefined;
    active = busy = false;
    error = transient = "";
    missingHeightMoves = 0;
    heading = [0, 0];
    reported.clear();
    document.querySelector("#ascii-map").classList.remove("travel-map");
    document.querySelector("#map-viewport").classList.remove("travel-viewport");
    localize();
  }
  start.addEventListener("click", begin);
  look.addEventListener("click", toggleLook);
  stop.addEventListener("click", () => {
    reset();
    onStop();
  });
  rest.addEventListener("click", () => {
    if (!state || busy) return;
    state = restJourney(state);
    localize();
  });
  retry.addEventListener("click", async () => {
    if (busy) return;
    if (!state || !stream) {
      active = false;
      return begin();
    }
    busy = true;
    error = "";
    transient = "travelLoading";
    localize();
    const currentToken = token, p = chunkPosition(state.col, state.row);
    try {
      stream.drop(p.x, p.y);
      const chunk = await stream.load(p.x, p.y, true);
      if (currentToken !== token) return;
      if (chunk.elevation.error) error = chunk.elevation.error;
      prefetch();
      draw();
    } catch (reason) {
      if (currentToken === token) report(reason);
    } finally {
      if (currentToken === token) {
        busy = false;
        transient = "";
        localize();
      }
    }
  });
  for (const button of directions) {
    button.addEventListener("click", () => step(...button.dataset.move.split(",").map(Number)));
  }
  document.addEventListener("keydown", event => {
    if (!active || event.ctrlKey || event.metaKey || event.altKey ||
        document.querySelector("dialog[open]") ||
        event.target.closest("input,select,textarea,[contenteditable]")) return;
    const delta = { ArrowUp: [0, -1], ArrowRight: [1, 0], ArrowDown: [0, 1], ArrowLeft: [-1, 0] }[event.key];
    if (event.key.toLowerCase() === "l" || (event.key === "Escape" && cursor)) {
      event.preventDefault();
      if (!event.repeat) toggleLook();
    } else if (delta) {
      event.preventDefault();
      if (!event.repeat) step(...delta);
    } else if (event.key.toLowerCase() === "r" && !event.repeat) {
      event.preventDefault();
      if (state && !busy && !cursor) {
        state = restJourney(state);
        localize();
      }
    }
  });
  return {
    localize, reset, get active() { return active; },
    configure(nextRegion, map) { region = nextRegion; base = map; localize(); },
  };
}
