import { chunkPosition, journeyDate } from "./travel.mjs";
import { createChunkStream, neighborDownloads } from "./travel-stream.mjs";
import { cellInfo } from "./cell-info.mjs";
import { skyState, estimatedTemperature, altitudeTemperatureOffset } from "./sky.mjs";
import {
  startSurvival, walkSurvival,
  validateSurvivalConfig, hungerPercent, canEat,
} from "./survival.mjs";
import { setupTowns } from "./towns-ui.mjs";
import { validateEconomy, startEconomy, buyMeal, sleepEconomy, restEconomy, finishAction } from "./economy.mjs";
import { setupEconomyUI } from "./economy-ui.mjs";
import { beginBusking, settleBusking } from "./music.mjs";
import { setupMusic } from "./music-ui.mjs";
import { createTrail, interviewTrail } from "./trail.mjs";
import { setupTrail } from "./trail-ui.mjs";
import { createJourneyStore, mapIdentity } from "./journey-save.mjs";

export function setupTravel({ t, renderMap, selectPlayer, resetContent, onStop, onAudioContext }) {
  const start = document.querySelector("#start-travel");
  const resume = document.querySelector("#resume-travel");
  const saveStatus = document.querySelector("#journey-save-status");
  const stop = document.querySelector("#stop-travel");
  const rest = document.querySelector("#rest-travel");
  const retry = document.querySelector("#retry-travel");
  const look = document.querySelector("#look-travel");
  const sleep = document.querySelector("#sleep-travel");
  const eat = document.querySelector("#eat-travel");
  const profile = document.querySelector("#character-profile");
  const controls = document.querySelector("#travel-controls");
  const stats = document.querySelector("#travel-stats");
  const status = document.querySelector("#travel-status");
  const height = document.querySelector("#travel-elevation");
  const note = document.querySelector("#travel-note");
  const directions = [...document.querySelectorAll("[data-move]")];
  const towns = setupTowns(t);
  let state, stream, region, base, token = 0, busy = false, error = "", active = false;
  let transient = "", missingHeightMoves = 0;
  let heading = [0, 0];
  let cursor, cameraData;
  let survivalConfig, economyData;
  let saveStore, savedJourney, slotOccupied = false, saveError = "", savedAt;
  let pendingRestore;
  function readJourney() {
    savedJourney = undefined;
    slotOccupied = false;
    savedAt = undefined;
    saveError = "";
    try {
      saveStore ??= createJourneyStore(localStorage);
      slotOccupied = localStorage.getItem(`arcane-journey-v1:${region}`) !== null;
      savedJourney = saveStore.read(region);
      if (savedJourney && savedJourney.mapIdentity !== mapIdentity(base)) {
        throw new Error(t("saveMapChanged"));
      }
      savedAt = savedJourney?.savedAt;
    } catch (reason) {
      savedJourney = undefined;
      saveError = reason.message;
      console.error("Unable to read journey save:", reason);
    }
  }
  function autosave() {
    try {
      if (!saveStore) throw new Error(t("saveStorageUnavailable"));
      const saved = saveStore.write({ region, map: base, state,
        survival: survivalConfig, economy: economyData });
      savedJourney = saved;
      slotOccupied = true;
      savedAt = saved.savedAt;
      saveError = "";
    } catch (reason) {
      saveError = reason.message;
      console.error("Unable to save journey:", reason);
    }
  }
  function economyContext() {
    if (!state || !stream || !economyData) return null;
    const p = chunkPosition(state.col, state.row);
    const chunk = stream.get(p.x, p.y);
    if (!chunk) return null;
    return { state, cell: chunk.rows[p.row][p.col], info: cellInfo(chunk, p.row, p.col),
      data: economyData, survival: survivalConfig, blocked: busy || Boolean(cursor) || Boolean(state.ended) };
  }
  const economyUI = setupEconomyUI(t, { context: economyContext, act: economyAction });
  const musicUI = setupMusic(t, {
    available: () => {
      const current = economyContext();
      return Boolean(current && !current.blocked && current.cell.terrain === "place");
    },
    begin() {
      const current = economyContext();
      if (!current || current.blocked) return false;
      try {
        state = beginBusking(state, current.cell, current.info, survivalConfig, economyData);
        autosave();
        localize();
        return Boolean(state.performancePending);
      } catch (reason) {
        report(reason);
        return false;
      }
    },
    settle(hits) {
      if (!state?.performancePending) return null;
      try {
        state = settleBusking(state, hits);
        autosave();
        localize();
        return state.lastEarningsCents;
      } catch (reason) {
        report(reason);
        return null;
      }
    },
  });
  const trailUI = setupTrail(t, {
    context: economyContext,
    interview() {
      const current = economyContext();
      if (!current || current.blocked) return false;
      try {
        state = interviewTrail(state, current.info, survivalConfig, economyData);
        autosave();
        localize();
        return true;
      } catch (reason) {
        report(reason);
        return false;
      }
    },
  });
  const weatherCache = new Map();
  let weatherKey, weatherData, weatherError = "", weatherController;

  function updateWeather(chunk) {
    if (!chunk || !state) return;
    const b = chunk.bounds;
    const key = [Math.floor((b.minLatitude + b.maxLatitude) / 2 * 10 + 0.5),
      Math.floor((b.minLongitude + b.maxLongitude) / 2 * 10 + 0.5)].join(",");
    if (key === weatherKey) return;
    weatherKey = key;
    weatherError = "";
    weatherData = weatherCache.get(key);
    weatherController?.abort();
    if (weatherData) return;
    const controller = new AbortController();
    weatherController = controller;
    const p = chunkPosition(state.col, state.row);
    fetch(`/api/weather?${new URLSearchParams({ region, x: p.x, y: p.y })}`, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(120_000)]),
    }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
      if (data.months?.length !== 12 || data.months.some(month =>
        !["clear", "cloudy", "fog", "rain", "snow", "storm"].includes(month.condition) ||
        !["meanC", "minC", "maxC", "rainMm", "frequency", "samples"].every(field =>
          Number.isFinite(month[field])))) throw new Error("Invalid historical weather response.");
      if (controller.signal.aborted) return;
      weatherCache.set(key, data);
      if (weatherCache.size > 25) weatherCache.delete(weatherCache.keys().next().value);
      if (key === weatherKey) weatherData = data;
    }).catch(reason => {
      if (controller.signal.aborted) return;
      console.error("Historical weather unavailable:", reason);
      if (key === weatherKey) weatherError = reason.message;
    }).finally(() => {
      if (!controller.signal.aborted && active) localize();
    });
  }
  const reported = new Set();

  function localize() {
    towns.localize(document.documentElement.lang);
    economyUI.localize();
    musicUI.localize();
    trailUI.localize();
    document.querySelector("#map-workspace").classList.toggle("travel-active", active);
    document.body.classList.toggle("is-travelling", active);
    controls.hidden = !active;
    start.hidden = active;
    start.disabled = !base;
    resume.hidden = active || !slotOccupied;
    resume.disabled = !base || !savedJourney;
    document.querySelector("#save-travel").disabled = !state || busy;
    saveStatus.textContent = saveError ? t("saveError", { error: saveError })
      : savedAt ? t("saveStored", {
        date: new Date(savedAt).toLocaleString(document.documentElement.lang),
      }) : t("saveNone");
    document.querySelector("#character-setup").hidden = active;
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
    const ended = Boolean(state?.ended);
    document.querySelector("#journey-ended").hidden = !ended;
    if (state && survivalConfig) {
      const character = state.character;
      document.querySelector("#player-character").textContent = t("characterStats", {
        profile: t(`profile.${state.profileId}`), strength: character.strength,
        endurance: character.endurance, pace: character.pace,
      });
      const values = {
        hunger: hungerPercent(state, survivalConfig),
        fatigue: state.fatigue,
        sleep: Math.min(100, state.awakeHours / survivalConfig.sleep_limit_hours * 100),
      };
      for (const [key, value] of Object.entries(values)) {
        const meter = document.querySelector(`#needs-${key}`);
        meter.value = value;
        meter.low = survivalConfig.warning_percent * 0.6;
        meter.high = survivalConfig.warning_percent;
        document.querySelector(`#needs-${key}-value`).textContent = `${Math.round(value)}%`;
      }
      document.querySelector("#needs-sleep").title = t("needsAwake", { hours: state.awakeHours.toFixed(1) });
      const warnings = [];
      if (values.hunger >= survivalConfig.warning_percent) warnings.push(t("needsHungry"));
      if (values.fatigue >= survivalConfig.warning_percent) warnings.push(t("needsTired"));
      if (state.awakeHours >= survivalConfig.sleep_warning_hours) warnings.push(t("needsSleepy"));
      document.querySelector("#needs-warning").textContent = warnings.join(" ");
      document.querySelector("#journey-outcome").textContent = ended ? t(`journeyEnded.${state.ended}`) : "";
      rest.textContent = t("needsRestAction", { minutes: survivalConfig.rest_minutes });
      sleep.textContent = t("sleepTitle");
      eat.textContent = t("mealTitle");
      document.querySelector("#meal-location").textContent = canEat(cell)
        ? t("needsMealAvailable") : t("needsMealUnavailable");
    }
    updateWeather(chunk);
    const weatherSummary = document.querySelector("#weather-summary");
    const weatherSource = document.querySelector("#weather-source");
    weatherSource.hidden = !weatherData;
    document.querySelector("#weather-display").hidden = !weatherData;
    document.querySelector("#weather-state").textContent = weatherData ? "" : weatherError
      ? t("weatherError", { error: weatherError }) : active ? t("weatherLoading") : "";
    if (weatherData) {
      const month = weatherData.months[journeyDate(state).getUTCMonth()];
      const number = value => new Intl.NumberFormat(document.documentElement.lang, {
        maximumFractionDigits: 1,
      }).format(value);
      const player = cellInfo(chunk, position.row, position.col);
      const elevationKnown = Number.isFinite(cell?.elevationMeters) &&
        Number.isFinite(weatherData.elevationMeters);
      const offset = elevationKnown
        ? altitudeTemperatureOffset(cell.elevationMeters, weatherData.elevationMeters) : 0;
      const temperature = estimatedTemperature(journeyDate(state), player.latitude, player.longitude,
        month.minC + offset, month.maxC + offset);
      document.querySelector("#weather-temperature").textContent = `${number(temperature)} °C`;
      document.querySelector("#weather-condition").textContent = t(`weather.${month.condition}`);
      document.querySelector("#weather-range").textContent =
        t("weatherRange", { min: number(month.minC + offset), max: number(month.maxC + offset) });
      document.querySelector("#weather-altitude").textContent = elevationKnown
        ? t("weatherAltitude", { player: Math.round(cell.elevationMeters),
          reference: Math.round(weatherData.elevationMeters), offset: number(offset) })
        : t("weatherAltitudeUnknown");
      for (const icon of document.querySelectorAll("[data-weather-icon]")) {
        icon.style.display = icon.dataset.weatherIcon.split(" ").includes(month.condition) ? "" : "none";
      }
      weatherSummary.textContent = t("weatherSummary", {
        mean: month.meanC, min: month.minC, max: month.maxC, rain: month.rainMm,
        condition: t(`weather.${month.condition}`), frequency: month.frequency,
        start: weatherData.startYear, end: weatherData.endYear,
        month: new Intl.DateTimeFormat(document.documentElement.lang, {
          month: "long", timeZone: "UTC",
        }).format(journeyDate(state)),
      });
      weatherSource.href = weatherData.sourceUrl;
      weatherSource.textContent = `${weatherData.source} · ${weatherData.license}`;
    } else {
      weatherSummary.textContent = weatherError
        ? t("weatherError", { error: weatherError }) : active ? t("weatherLoading") : "";
    }
    for (const button of directions) button.disabled = busy || !cell || (ended && !cursor);
    rest.disabled = sleep.disabled = busy || !cell || Boolean(cursor) || ended;
    eat.disabled = rest.disabled || !canEat(cell);
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
    const sky = document.querySelector("#travel-sky");
    sky.hidden = !cell;
    if (cell) {
      const player = cellInfo(chunk, position.row, position.col);
      const cycle = skyState(journeyDate(state), player.latitude, player.longitude);
      sky.dataset.phase = cycle.phase;
      document.querySelector("#sky-marker").setAttribute("transform", `translate(${cycle.x} ${cycle.y})`);
      document.querySelector("#sky-sun").style.display = cycle.phase === "day" ? "" : "none";
      document.querySelector("#sky-moon").style.display = cycle.phase === "night" ? "" : "none";
      document.querySelector("#sky-phase").textContent = t(cycle.phase === "day" ? "skyDay" : "skyNight");
      const time = timestamp => new Intl.DateTimeFormat(document.documentElement.lang, {
        hour: "2-digit", minute: "2-digit", timeZone: "UTC",
      }).format(new Date(timestamp));
      const text = cycle.polar
        ? t(cycle.polar === "day" ? "skyPolarDay" : "skyPolarNight")
        : t("skyTimes", { sunrise: time(cycle.sunrise), sunset: time(cycle.sunset) });
      document.querySelector("#sky-times").textContent = text;
      document.querySelector("#sky-title").textContent =
        `${t(cycle.phase === "day" ? "skyDay" : "skyNight")} · ${text} · ${t("skyNote")}`;
    }
    onAudioContext?.({ active, ended: state?.ended, region, terrain: cell?.terrain,
      night: Boolean(cell) && sky.dataset.phase === "night" });
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
    towns.update(data, position.row + 8, position.col + 8, !state.ended);
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
    if (!state || busy || !active || state.ended) return;
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
      const previous = state;
      state = walkSurvival(state, dc, dr, fromCell, target.rows[to.row][to.col], survivalConfig);
      state = finishAction(previous, state, cellInfo(target, to.row, to.col), economyData);
      autosave();
      if (!state.lastMove.elevationKnown) missingHeightMoves++;
      if (target.elevation.error) error = target.elevation.error;
      resetContent();
      draw();
      if (!state.ended) prefetch();
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

  async function begin(restored, replacementConfirmed = false) {
    if (!base || active) return;
    if (!restored && slotOccupied && !replacementConfirmed && !confirm(t("saveReplaceConfirm"))) return;
    pendingRestore = restored;
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
      if (restored) {
        state = structuredClone(restored.state);
        survivalConfig = structuredClone(restored.survival);
        economyData = structuredClone(restored.economy);
        profile.value = state.profileId;
      } else {
        const settingsResponse = await fetch("./public/config.json", {
          cache: "no-cache", signal: AbortSignal.timeout(5000),
        });
        if (!settingsResponse.ok) throw new Error(`Survival configuration: HTTP ${settingsResponse.status}`);
        survivalConfig = validateSurvivalConfig((await settingsResponse.json()).survival);
        const economyResponse = await fetch("./public/economy.json", {
          cache: "no-cache", signal: AbortSignal.timeout(5000),
        });
        if (!economyResponse.ok) throw new Error(`Economy database: HTTP ${economyResponse.status}`);
        economyData = validateEconomy(await economyResponse.json());
        if (currentToken !== token) return;
        state = startEconomy(startSurvival(Math.floor(base.width / 2), Math.floor(base.height / 2),
          Date.now(), profile.value, survivalConfig), economyData);
        state = { ...state, trail: createTrail(base, state.col, state.row) };
      }
      if (currentToken !== token) return;
      const p = chunkPosition(state.col, state.row);
      stream = createChunkStream(region, { onUpdate: () => {
        if (currentToken === token) draw();
      } });
      const first = await stream.load(p.x, p.y, true);
      if (currentToken !== token) return;
      if (first.elevation.error) error = first.elevation.error;
      autosave();
      resetContent();
      trailUI.open();
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
    musicUI.reset();
    trailUI.reset();
    towns.reset();
    economyUI.reset();
    stream?.stop();
    stream = undefined;
    state = undefined;
    cursor = cameraData = undefined;
    weatherController?.abort();
    weatherKey = weatherData = undefined;
    weatherError = "";
    active = busy = false;
    error = transient = "";
    missingHeightMoves = 0;
    heading = [0, 0];
    reported.clear();
    document.querySelector("#ascii-map").classList.remove("travel-map");
    document.querySelector("#map-viewport").classList.remove("travel-viewport");
    localize();
  }
  start.addEventListener("click", () => begin());
  resume.addEventListener("click", () => {
    readJourney();
    if (savedJourney) begin(savedJourney);
    else localize();
  });
  document.querySelector("#save-travel").addEventListener("click", () => {
    if (!state || busy) return;
    autosave();
    localize();
  });
  document.querySelector("#restart-travel").addEventListener("click", () => {
    if (slotOccupied && !confirm(t("saveReplaceConfirm"))) return;
    reset();
    begin(undefined, true);
  });
  look.addEventListener("click", toggleLook);
  stop.addEventListener("click", () => {
    reset();
    onStop();
  });
  function survivalAction(action) {
    if (!state || busy || cursor || state.ended) return;
    try {
      const current = economyContext();
      if (!current) throw new Error("Current cell is not loaded.");
      if (action !== "rest") return economyUI.open(action);
      state = restEconomy(state, current.info, survivalConfig, economyData);
      autosave();
      localize();
      document.querySelector("#ascii-map").focus({ preventScroll: true });
    } catch (reason) {
      report(reason);
    }
  }
  function economyAction(action) {
    const current = economyContext();
    if (!current || current.blocked) return false;
    try {
      state = action.kind === "meal"
        ? buyMeal(state, current.cell, current.info, action.id, survivalConfig, economyData)
        : sleepEconomy(state, current.cell, current.info, action.id, survivalConfig, economyData);
      autosave();
      error = "";
      localize();
      return true;
    } catch (reason) {
      report(reason);
      document.querySelector("#economy-action-error").textContent = reason.message;
      return false;
    }
  }
  rest.addEventListener("click", () => survivalAction("rest"));
  sleep.addEventListener("click", () => survivalAction("sleep"));
  eat.addEventListener("click", () => survivalAction("eat"));
  retry.addEventListener("click", async () => {
    if (busy) return;
    if (weatherError) weatherKey = undefined;
    if (!state || !stream) {
      active = false;
      return begin(pendingRestore, true);
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
      autosave();
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
    if (!active || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey ||
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
      survivalAction("rest");
    }
  });
  return {
    localize, reset, get active() { return active; },
    configure(nextRegion, map) {
      region = nextRegion;
      base = map;
      if (base) readJourney();
      localize();
    },
  };
}
