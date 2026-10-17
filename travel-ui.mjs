import { chunkPosition, journeyDate } from "./travel.mjs";
import { createChunkStream, createChunkPrefetcher, visibleDownloads } from "./travel-stream.mjs";
import { cellInfo } from "./cell-info.mjs";
import { skyState, altitudeTemperatureOffset } from "./sky.mjs";
import {
  walkSurvival, hungerPercent, canEat, normalizeCharacterName,
} from "./survival.mjs";
import { setupTowns } from "./towns-ui.mjs";
import { refreshPricing, refreshMeals, refreshNightRest, tarotEventChance, acknowledgeDailyTarot, buyMeal, sleepEconomy, restEconomy, restEffect, finishAction } from "./economy.mjs";
import { setupDailyTarot } from "./daily-tarot-ui.mjs";
import { survivalChoice } from "./survival-choices.mjs";
import { setupSurvivalChoices } from "./survival-choices-ui.mjs";
import { setupEconomyUI } from "./economy-ui.mjs";
import { beginBusking, settleBusking, musicMistakeLimit } from "./music.mjs";
import { setupMusic } from "./music-ui.mjs";
import { interviewTrail } from "./trail.mjs";
import { createServerJourney } from "./server-journey.mjs";
import { prepareParentPaths } from "./parent-path.mjs";
import { loadAccommodations, cachedAccommodations, mergeAccommodations, withDiscoveredAccommodations } from "./accommodations.mjs";
import { setFeedback } from "./feedback.mjs";
import { askHospitality } from "./hospitality.mjs";
import { agendaClock } from "./agenda-clock.mjs";
import { setupTrail } from "./trail-ui.mjs";
import { askDirections } from "./directions.mjs";
import { exposureTemperature, temperatureModifiers, precipitationModifiers } from "./weather-effects.mjs";
import { createJourneyStore, mapIdentity } from "./journey-save.mjs";
import { tarotArt } from "./tarot-art.mjs";
import { trailClue } from "./trail-actions.mjs";
import { beginExploration, applyFieldSearch, askAboutClue } from "./trail-search.mjs";
import { setupNeedsNotices } from "./needs-notices.mjs";
import { setupSaveFeedback } from "./save-feedback.mjs";

export function setupTravel({ t, renderMap, selectPlayer, resetContent, onStop, onAudioContext, onStep, onActiveChange, musicAudio, pinPhoto }) {
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
  const nameInput = document.querySelector("#character-name");
  nameInput.addEventListener("input", () => nameInput.setCustomValidity(""));
  const controls = document.querySelector("#travel-controls");
  const stats = document.querySelector("#travel-stats");
  const status = document.querySelector("#travel-status");
  const height = document.querySelector("#travel-elevation");
  const note = document.querySelector("#travel-note");
  const directions = [...document.querySelectorAll("[data-move]")];
  const towns = setupTowns(t);
  let state, stream, region, base, token = 0, busy = false, error = "", active = false;
  let preparingOrigin = false;
  let trailController;
  let pendingCreation;
  let parentPathController, parentPathKey, parentPathStatus = "", parentPathError = "";
  let backgroundDownloads;
  const pricingCountries = new Map();
  let discoveredLodging = [];
  let transient = "", missingHeightMoves = 0;
  let heading = [0, 0];
  let cursor, cameraData;
  let survivalConfig, economyData;
  let saveStore, savedJourney, slotOccupied = false, saveError = "", savedAt;
  let pendingRestore;
  const saveFeedback = setupSaveFeedback(t, {
    available: () => Boolean(state && !busy),
    save() {
      autosave();
      localize();
      return saveError ? { error: saveError } : { savedAt };
    },
  });
  const birthDialog = document.querySelector("#birth-tarot-dialog");
  const birthDraw = document.querySelector("#birth-tarot-draw");
  const birthReveal = document.querySelector("#birth-tarot-reveal");
  const birthArt = document.querySelector(".birth-card-art");
  let birthPending = false;
  function openJourneyIntro() {
    if (birthPending) {
      birthDraw.hidden = false;
      birthReveal.hidden = true;
      birthArt.textContent = tarotArt();
      birthDialog.showModal();
      birthDraw.focus();
      birthPending = false;
    } else {
      trailUI.open();
    }
  }
  function localizeBirthCard() {
    if (!state || !economyData) return;
    const card = economyData.tarot.find(card => card.id === state.birthCard);
    birthArt.textContent = tarotArt(birthReveal.hidden ? null : card.id);
    const language = document.documentElement.lang === "en" ? "en" : "fr";
    document.querySelector("#birth-tarot-name").textContent = card[language];
    document.querySelector("#birth-character-name").textContent = state.name ?? "";
    document.querySelector("#birth-tarot-meaning").textContent = t(`tarotMeaning.${card.id}`);
    document.querySelector("#birth-tarot-budget").textContent = t("birthTarotBudget", {
      money: (state.walletCents / 100).toFixed(2), units: card.mealUnits,
    });
    document.querySelector("#birth-tarot-attributes").textContent = t("characterStats", {
      profile: card[language], ...state.character,
    });
    document.querySelector("#birth-tarot-events").textContent = t("birthTarotEvents", {
      factor: (tarotEventChance(0.1, state, economyData) / 0.1).toFixed(2),
    });
  }
  birthDraw.addEventListener("click", () => {
    birthDraw.hidden = true;
    birthReveal.hidden = false;
    localizeBirthCard();
    document.querySelector("#birth-tarot-continue").focus();
  });
  document.querySelector("#birth-tarot-continue").addEventListener("click", () => {
    birthDialog.close();
    trailUI.open();
  });
  birthDialog.addEventListener("cancel", event => event.preventDefault());
  const dailyTarotUI = setupDailyTarot(t, {
    context: () => active && state && economyData ? {
      state, data: economyData, busy, saveStatus: saveStatus.textContent,
    } : null,
    acknowledge() {
      state = acknowledgeDailyTarot(state);
      autosave();
      localize();
    },
  });
  const needsNotices = setupNeedsNotices(t, {
    context: () => active && state && survivalConfig ? { state, survival: survivalConfig, busy } : null,
  });
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
    saveFeedback.reset();
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
  function prepareCurrentParentPath(retry = false) {
    if (!state?.serverJourney || state.ended || state.trail?.version !== 2 || state.trail.completed) {
      parentPathController?.abort();
      parentPathStatus = "";
      return;
    }
    const key = `${state.serverJourney.id}:${state.trail.index}`;
    if (!retry && key === parentPathKey) return;
    parentPathController?.abort();
    const controller = parentPathController = new AbortController();
    parentPathKey = key;
    parentPathStatus = "loading";
    parentPathError = "";
    void prepareParentPaths(state, { signal: controller.signal }).then(() => {
      if (!controller.signal.aborted) parentPathStatus = "ready";
    }).catch(reason => {
      if (controller.signal.aborted) return;
      console.error("Automatic parent path preparation failed:", reason);
      parentPathStatus = "error";
      parentPathError = reason.message;
    }).finally(() => {
      if (!controller.signal.aborted) localize();
    });
  }
  function economyContext() {
    if (!state || !stream || !economyData) return null;
    const p = chunkPosition(state.col, state.row);
    const chunk = stream.get(p.x, p.y);
    if (!chunk) return null;
    const mappedCell = chunk.rows[p.row][p.col];
    const country = pricingCountries.get(`${state.col},${state.row}`);
    const pricedCell = !(mappedCell.countryCodes?.length) && country
      ? { ...mappedCell, countryCodes: [country] } : mappedCell;
    const cell = withDiscoveredAccommodations(pricedCell, discoveredLodging, state.col, state.row);
    return { state, cell, info: exposureInfo(chunk, p.row, p.col),
      data: economyData, survival: survivalConfig, blocked: busy || Boolean(cursor) || Boolean(state.ended) };
  }
  const economyUI = setupEconomyUI(t, {
    context: economyContext, act: economyAction,
    async findAccommodations(signal, onProgress) {
      const current = economyContext(), currentToken = token;
      if (!current || current.blocked) throw new Error("Accommodation lookup requires a loaded player cell.");
      const cached = cachedAccommodations(base, stream.chunks.values(), current.info);
      discoveredLodging = cached.places;
      onProgress({ phase: "maps", cached, elapsedSeconds: 0 });
      const result = await loadAccommodations(region, current.info, signal, fetch, progress => {
        if (signal.aborted || currentToken !== token) return;
        if (progress.cached) {
          progress = { ...progress, cached: mergeAccommodations(cached, progress.cached) };
          discoveredLodging = progress.cached.places;
        }
        onProgress(progress);
      });
      signal.throwIfAborted();
      if (currentToken !== token) throw new Error("Journey changed during accommodation lookup.");
      discoveredLodging = result.places;
      return result;
    },
    async resolveCountry() {
      const current = economyContext();
      if (!current || current.cell.countryCodes?.length ||
          current.info.latitude < 34 || current.info.latitude > 72 ||
          current.info.longitude < -32 || current.info.longitude > 60) return;
      const currentToken = token, key = `${state.col},${state.row}`;
      const response = await fetch(`/api/pricing-country?${new URLSearchParams({
        latitude: current.info.latitude, longitude: current.info.longitude,
      })}`, { signal: AbortSignal.timeout(30000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? `Country lookup: HTTP ${response.status}`);
      if (!/^[A-Z]{2}$/.test(result.countryCode)) throw new Error("Invalid pricing country.");
      if (currentToken === token) pricingCountries.set(key, result.countryCode);
    },
  });
  const choicesUI = setupSurvivalChoices(t, {
    context: () => {
      const current = economyContext();
      return current ? { ...current, saveStatus: saveStatus.textContent } : null;
    },
    act(kind) {
      const current = economyContext();
      if (!current || current.blocked) return false;
      try {
        state = survivalChoice(state, kind, current.cell, current.info, survivalConfig, economyData);
        autosave();
        localize();
        return true;
      } catch (reason) {
        report(reason);
        document.querySelector("#survival-choice-error").textContent = reason.message;
        return false;
      }
    },
  });
  const musicUI = setupMusic(t, {
    mistakeLimit: () => state ? musicMistakeLimit(state) : null,
    audio: musicAudio,
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
    settle(hits, mistakes) {
      if (!state?.performancePending) return null;
      try {
        state = settleBusking(state, hits, mistakes);
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
    pinPhoto,
    askDirections() {
      const current = economyContext();
      if (!current || current.blocked) return null;
      try {
        const result = askDirections(state, current.cell, current.info, survivalConfig, economyData);
        state = result.state;
        autosave();
        error = "";
        localize();
        return result.outcome;
      } catch (reason) {
        report(reason);
        document.querySelector("#hint-action-error").textContent = reason.message;
        return null;
      }
    },
    context: () => {
      const current = economyContext();
      return current ? { ...current, saveStatus: saveStatus.textContent } : null;
    },
    searchField(result) {
      const current = economyContext();
      if (!current || current.blocked) return false;
      try {
        state = applyFieldSearch(state, result, current.cell, current.info, survivalConfig, economyData);
        autosave();
        localize();
        return true;
      } catch (reason) {
        report(reason);
        document.querySelector("#trail-action-error").textContent = reason.message;
        return false;
      }
    },
    recognizeField(prepared) {
      const current = economyContext();
      if (!current || current.blocked) return null;
      try {
        const result = askAboutClue(state, prepared, current.cell, current.info, survivalConfig, economyData);
        state = result.state;
        autosave();
        localize();
        return result;
      } catch (reason) {
        report(reason);
        document.querySelector("#hint-action-error").textContent = reason.message;
        return null;
      }
    },
    discover(kind) {
      const current = economyContext();
      if (!current || current.blocked) return false;
      try {
        state = trailClue(state, kind, current.cell, current.info, survivalConfig, economyData);
        autosave();
        prepareCurrentParentPath();
        localize();
        return true;
      } catch (reason) {
        report(reason);
        document.querySelector("#trail-action-error").textContent = reason.message;
        return false;
      }
    },
    interview() {
      const current = economyContext();
      if (!current || current.blocked) return false;
      try {
        state = interviewTrail(state, current.info, survivalConfig, economyData);
        autosave();
        prepareCurrentParentPath();
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

  function chunkWeatherKey(chunk) {
    const b = chunk.bounds;
    return [Math.floor((b.minLatitude + b.maxLatitude) / 2 * 10 + 0.5),
      Math.floor((b.minLongitude + b.maxLongitude) / 2 * 10 + 0.5)].join(",");
  }
  function exposureInfo(chunk, row, col) {
    const info = cellInfo(chunk, row, col);
    const weather = weatherCache.get(chunkWeatherKey(chunk));
    return { ...info, ...(weather ? { weather } : {}),
      elevationMeters: chunk.rows[row][col].elevationMeters };
  }

  function updateWeather(chunk) {
    if (!chunk || !state) return;
    const key = chunkWeatherKey(chunk);
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
    saveFeedback.localize();
    localizeBirthCard();
    towns.localize(document.documentElement.lang);
    economyUI.localize();
    musicUI.localize();
    trailUI.localize();
    document.querySelector("#map-workspace").classList.toggle("travel-active", active);
    document.body.classList.toggle("is-travelling", active);
    controls.hidden = !active;
    onActiveChange?.(active);
    start.hidden = active;
    start.disabled = !base || preparingOrigin || busy;
    resume.hidden = active || !slotOccupied;
    resume.disabled = !base || !savedJourney || preparingOrigin || busy;
    document.querySelector("#journey-start-status").textContent = active ? ""
      : error ? t("journeyStartError", { error }) : busy && transient ? t(transient) : "";
    document.querySelector("#journey-start-status").classList.toggle("is-loading", !active && busy);
    setFeedback(document.querySelector("#journey-start-status"), !active && error ? "failure" : "");
    document.querySelector("#cancel-journey-start").hidden = active || !busy;
    document.querySelector("#save-travel").disabled = !state || busy;
    saveStatus.textContent = saveError ? t("saveError", { error: saveError })
      : savedAt ? t("saveStored", {
        date: new Date(savedAt).toLocaleString(document.documentElement.lang),
      }) : t("saveNone");
    document.querySelector("#birth-tarot-save").textContent = saveStatus.textContent;
    document.querySelector("#journey-play-save").textContent = saveStatus.textContent;
    for (const element of [saveStatus, document.querySelector("#birth-tarot-save"),
      document.querySelector("#journey-play-save")]) {
      setFeedback(element, saveError ? "failure" : savedAt ? "success" : "");
    }
    choicesUI.localize();
    document.querySelector("#character-setup").hidden = active;
    retry.disabled = busy;
    stop.disabled = busy;
    status.textContent = error ? t("travelError", { error }) : transient ? t(transient) : "";
    setFeedback(status, error ? "failure" : "");
    if (state?.ended) parentPathStatus = "";
    document.querySelector("#journey-path-status").textContent = parentPathStatus
      ? t(`journeyPath.${parentPathStatus}`, { error: parentPathError }) : "";
    document.querySelector("#journey-path-retry").hidden = parentPathStatus !== "error";
    setFeedback(document.querySelector("#journey-path-status"),
      parentPathStatus === "error" ? "failure" : parentPathStatus === "ready" ? "success" : "");
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
    if (ended) {
      backgroundDownloads?.stop();
      parentPathController?.abort();
    }
    document.querySelector("#journey-ended").hidden = !ended;
    if (state && survivalConfig) {
      document.querySelector("#player-wallet").textContent = t("wallet", {
        money: `${(state.walletCents / 100).toFixed(2)} ${t("gameMoney")}`,
      });
      document.querySelector("#player-food").textContent = t("foodEnergy", {
        kcal: Math.floor(state.reserveKcal), max: survivalConfig.reserve_kcal,
      });
      document.querySelector("#player-name").textContent = state.name ?? t("unnamedCharacter");
      const character = state.character;
      document.querySelector("#player-character").textContent = t("characterStats", {
        profile: state.profileId === "tarot"
          ? economyData.tarot.find(c => c.id === state.birthCard)[document.documentElement.lang === "en" ? "en" : "fr"]
          : t(`profile.${state.profileId}`), strength: character.strength,
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
        meter.high = key === "hunger" ? 75 : survivalConfig.warning_percent;
        document.querySelector(`#needs-${key}-value`).textContent = `${Math.round(value)}%`;
      }
      document.querySelector("#needs-sleep").title = t("needsAwake", { hours: state.awakeHours.toFixed(1) });
      const warnings = [];
      if (values.hunger >= 75) warnings.push(t("needsHungry"));
      if (values.fatigue >= survivalConfig.warning_percent) warnings.push(t("needsTired"));
      if (state.awakeHours >= survivalConfig.sleep_warning_hours) warnings.push(t("needsSleepy"));
      document.querySelector("#needs-warning").textContent = warnings.join(" ");
      document.querySelector("#journey-outcome").textContent = ended ? t(`journeyEnded.${state.ended}`) : "";
      setFeedback(document.querySelector("#journey-outcome"),
        ended ? state.ended === "reunion" ? "success" : "failure" : "");
      rest.textContent = t("needsRestAction", { minutes: survivalConfig.rest_minutes });
      sleep.textContent = t("sleepTitle");
      eat.textContent = t("mealTitle");
      document.querySelector("#rest-effect").textContent = cell ? t("restEffect", {
        minutes: survivalConfig.rest_minutes, before: state.fatigue.toFixed(1),
        after: restEffect(state, exposureInfo(chunk, position.row, position.col), survivalConfig, economyData).fatigue.toFixed(1),
      }) : "";
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
    setFeedback(document.querySelector("#weather-state"), !weatherData && weatherError ? "failure" : "");
    if (weatherData) {
      const month = weatherData.months[journeyDate(state).getUTCMonth()];
      const number = value => new Intl.NumberFormat(document.documentElement.lang, {
        maximumFractionDigits: 1,
      }).format(value);
      const elevationKnown = Number.isFinite(cell?.elevationMeters) &&
        Number.isFinite(weatherData.elevationMeters);
      const offset = elevationKnown
        ? altitudeTemperatureOffset(cell.elevationMeters, weatherData.elevationMeters) : 0;
      const temperature = exposureTemperature(journeyDate(state), exposureInfo(chunk, position.row, position.col));
      document.querySelector("#weather-temperature").textContent = `${number(temperature)} °C`;
      const effects = temperatureModifiers(temperature);
      document.querySelector("#weather-effects").textContent = t(effects.extraCaloriesFactor
        ? "temperatureCold" : effects.fatiguePerHour ? "temperatureHot" : "temperatureMild", {
        percent: number(effects.extraCaloriesFactor * 100), fatigue: number(effects.fatiguePerHour),
      });
      const precipitation = precipitationModifiers(month.condition);
      if (precipitation.fatiguePerHour) {
        document.querySelector("#weather-effects").textContent += ` ${t("weatherRainEffect", {
          fatigue: precipitation.fatiguePerHour, percent: Math.round((1 - precipitation.speedFactor) * 100),
        })}`;
      }
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
      document.querySelector("#weather-effects").textContent = active ? t("temperatureUnavailable") : "";
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
    clock.hidden = !state;
    if (state) {
      const parts = agendaClock(journeyDate(state), document.documentElement.lang);
      clock.dateTime = parts.iso;
      clock.setAttribute("aria-label", t("travelClock", { date: parts.full }));
      for (const key of ["weekday", "day", "month", "year", "time"]) {
        document.querySelector(`#agenda-${key}`).textContent = parts[key];
      }
      document.querySelector("#agenda-hour-hand").setAttribute("transform", `rotate(${parts.hourDegrees} 40 40)`);
      document.querySelector("#agenda-minute-hand").setAttribute("transform", `rotate(${parts.minuteDegrees} 40 40)`);
    }
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
    onAudioContext?.({ active, ended: state?.ended, terrain: cell?.terrain,
      sources: cell?.contentSources ?? [],
      night: Boolean(cell) && sky.dataset.phase === "night" });
    needsNotices.update();
    dailyTarotUI.update();
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
        const x = position.x - 1 + Math.floor(col / 8);
        const y = position.y - 1 + Math.floor(row / 8);
        const chunk = stream.get(x, y);
        cells.push(chunk?.rows[row % 8][col % 8] ?? {
          terrain: "plain", glyph: "?", unavailable: true,
          downloading: stream.isPending(x, y) && row % 8 === 3 && col % 8 === 3,
        });
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
    backgroundDownloads.update(visibleDownloads(state.col, state.row, ...heading));
  }

  async function move(dc, dr) {
    if (!state || busy || !active || state.ended) return;
    heading = [dc, dr];
    stream.prioritize(visibleDownloads(state.col, state.row, ...heading));
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
      const weatherInfo = exposureInfo(stream.get(from.x, from.y), from.row, from.col);
      state = walkSurvival(state, dc, dr, fromCell, target.rows[to.row][to.col], survivalConfig, weatherInfo);
      state = finishAction(previous, state, { ...weatherInfo, terrain: target.rows[to.row][to.col].terrain }, economyData,
        { survival: survivalConfig });
      autosave();
      onStep?.(target.rows[to.row][to.col].terrain);
      if (state.lastMove && !state.lastMove.elevationKnown) missingHeightMoves++;
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
    if (!base || active || busy || preparingOrigin) return;
    let characterName;
    if (!restored) {
      try {
        characterName = normalizeCharacterName(nameInput.value);
      } catch {
        nameInput.setCustomValidity(t("characterNameError"));
        nameInput.reportValidity();
        return;
      }
      nameInput.setCustomValidity("");
      nameInput.value = characterName;
    }
    if (!restored && slotOccupied && !replacementConfirmed && !confirm(t("saveReplaceConfirm"))) return;
    pendingRestore = restored;
    const currentToken = ++token;
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
        nameInput.value = state.name ?? "";
        state.dailyTarotSeenDay ??= state.tarotDay;
        survivalConfig = structuredClone(restored.survival);
        const response = await fetch("./public/economy.json", {
          cache: "no-cache", signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) throw new Error(`Economy database: HTTP ${response.status}`);
        const currentEconomy = await response.json();
        economyData = refreshMeals(
          refreshNightRest(refreshPricing(restored.economy, currentEconomy), currentEconomy), currentEconomy);
        if (currentToken !== token) return;
        profile.value = state.profileId;
      } else {
        transient = "serverJourneyPreparing";
        localize();
        trailController = new AbortController();
        if (pendingCreation?.region !== region || pendingCreation?.name !== characterName) {
          pendingCreation = { region, name: characterName, requestId: crypto.randomUUID() };
        }
        const created = await createServerJourney(region, base, characterName,
          pendingCreation.requestId, trailController.signal);
        if (currentToken !== token) return;
        state = created.state;
        survivalConfig = created.survival;
        economyData = created.economy;
        transient = "travelLoading";
        birthPending = true;
      }
      if (currentToken !== token) return;
      state = beginExploration(state, Boolean(restored));
      prepareCurrentParentPath();
      const p = chunkPosition(state.col, state.row);
      stream = createChunkStream(region, { onUpdate: () => {
        if (currentToken === token) draw();
      } });
      backgroundDownloads = createChunkPrefetcher(stream, {
        cached: targets => stream.restoreCached(targets),
        onError(reason) {
          if (currentToken === token) report(reason);
        }, onLoad(chunk, x, y) {
          const key = `${x},${y}`;
          if (currentToken === token && chunk.elevation.error && !reported.has(key)) {
            reported.add(key);
            report(new Error(chunk.elevation.error));
          }
        },
      });
      const first = await stream.load(p.x, p.y, true);
      if (currentToken !== token) return;
      if (first.elevation.error) error = first.elevation.error;
      active = true;
      autosave();
      pendingCreation = undefined;
      resetContent();
      openJourneyIntro();
      draw();
      prefetch();
      if (!document.querySelector("dialog[open]")) document.querySelector("#ascii-map").focus({ preventScroll: true });
    } catch (reason) {
      if (currentToken === token) {
        reset();
        report(reason);
      }
    } finally {
      if (currentToken === token) {
        busy = false;
        transient = "";
        localize();
      }
    }
  }

  function reset() {
    saveFeedback.reset();
    token++;
    trailController?.abort();
    trailController = undefined;
    parentPathController?.abort();
    parentPathController = parentPathKey = undefined;
    parentPathStatus = parentPathError = "";
    pricingCountries.clear();
    discoveredLodging = [];
    birthDialog.close();
    dailyTarotUI.reset();
    needsNotices.reset();
    birthPending = false;
    musicUI.reset();
    trailUI.reset();
    towns.reset();
    economyUI.reset();
    choicesUI.reset();
    stream?.stop();
    backgroundDownloads?.stop();
    backgroundDownloads = undefined;
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
  document.querySelector("#cancel-journey-start").addEventListener("click", reset);
  resume.addEventListener("click", () => {
    readJourney();
    if (savedJourney) begin(savedJourney);
    else localize();
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
    document.querySelector("#region").focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
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
        : action.kind === "hospitality"
        ? askHospitality(state, current.cell, current.info, survivalConfig, economyData, Math.random, action.id)
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
  document.querySelector("#journey-path-retry").addEventListener("click", () => {
    prepareCurrentParentPath(true);
    localize();
  });
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
      backgroundDownloads.retry();
      stream.drop(p.x, p.y);
      const chunk = await stream.load(p.x, p.y, true);
      if (currentToken !== token) return;
      if (chunk.elevation.error) error = chunk.elevation.error;
      autosave();
      if (birthPending) openJourneyIntro();
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
    setPreparing(value) {
      preparingOrigin = value;
      localize();
    },
    configure(nextRegion, map) {
      region = nextRegion;
      base = map;
      if (base) readJourney();
      localize();
    },
  };
}
