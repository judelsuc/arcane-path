import { chunkPosition, journeyDate, journeyActionBlocker } from "./travel.mjs";
import { createChunkStream, createChunkPrefetcher, visibleDownloads } from "./travel-stream.mjs";
import { cellInfo } from "./cell-info.mjs";
import { skyState, altitudeTemperatureOffset } from "./sky.mjs";
import {
  walkSurvival, hungerPercent, canEat, normalizeCharacterName,
} from "./survival.mjs";
import { setupTowns } from "./towns-ui.mjs";
import { nearestSettlement } from "./towns.mjs";
import { refreshPricing, refreshMeals, refreshNightRest, tarotEventChance, acknowledgeDailyTarot, buyMeal, sleepEconomy, restEconomy, restEffect, finishAction, washEconomy, marketPrice } from "./economy.mjs";
import { setupDailyTarot } from "./daily-tarot-ui.mjs";
import { survivalChoice, beginTheft, settleTheft, choiceAvailable } from "./survival-choices.mjs";
import { setupTheft } from "./theft-ui.mjs";
import { setupSurvivalChoices } from "./survival-choices-ui.mjs";
import { setupEconomyUI } from "./economy-ui.mjs";
import { beginBusking, settleBusking, musicMistakeLimit, musicDifficulty } from "./music.mjs";
import { beginCafe, settleCafe } from "./cafe.mjs";
import { setupCafe } from "./cafe-ui.mjs";
import { setupEarnMoney } from "./earn-money-ui.mjs";
import { recordJourneyPosition, createJourneyTerrainLoader } from "./journey-map.mjs";
import { renderJourneyMarker } from "./death.mjs";
import { setupMusic } from "./music-ui.mjs";
import { interviewTrail, recordTrailArrival } from "./trail.mjs";
import { setupTrailArrival } from "./trail-arrival-ui.mjs";
import { setupTrailDream } from "./trail-dream-ui.mjs";
import { settleTrailDream, trailDreamText, trailDreamVariant } from "./trail-dreams.mjs";
import { setupJourneyWorld } from "./journey-world-ui.mjs";
import { transitActive, reserveJourneyTransit, stepJourneyTransit, cancelJourneyTransit } from "./journey-world.mjs";
import { createServerJourney } from "./server-journey.mjs";
import { prepareParentPaths } from "./parent-path.mjs";
import { loadAccommodations, cachedAccommodations, mergeAccommodations, withDiscoveredAccommodations } from "./accommodations.mjs";
import { setFeedback } from "./feedback.mjs";
import { askHospitality, HOSPITALITY_RULES } from "./hospitality.mjs";
import { agendaClock } from "./agenda-clock.mjs";
import { setupTrail, trailReminder, parentClueText, trailEntryDate } from "./trail-ui.mjs";
import { askDirections } from "./directions.mjs";
import { exposureTemperature, temperatureModifiers, precipitationModifiers } from "./weather-effects.mjs";
import { createJourneyStore, mapIdentity, JOURNEY_SAVE_PREFIX } from "./journey-save.mjs";
import { renderTarotCard } from "./tarot-cards.mjs";
import { trailClue } from "./trail-actions.mjs";
import { beginExploration, applyFieldSearch, askAboutClue, fieldClueText } from "./trail-search.mjs";
import { setupNeedsNotices } from "./needs-notices.mjs";
import { setupOpeningStory } from "./opening-story-ui.mjs";
import { advanceJourneyEvents, acknowledgeJourneyEvent } from "./journey-events.mjs";
import { setupJourneyEvents } from "./journey-events-ui.mjs";
import { createLiveNarrative, LOST_PLAYER_DREAM } from "./live-narrative.mjs";
import { CLOSING_STORY, closingStoryText } from "./closing-story.mjs";
import { setupClosingStory } from "./closing-story-ui.mjs";
import { migrateHealth, healthValue } from "./health.mjs";
import { setupSaveFeedback } from "./save-feedback.mjs";
import { lodgingGuidance } from "./lodging-guidance.mjs";
import { pendingJournalCreation, finishJournalCreation, ensureJournalAccess, createJournalClient } from "./abandoned-journals.mjs";
import { setupAbandonedJournals } from "./abandoned-journals-ui.mjs";
import { encodeNotebook } from "./notebook-transfer.mjs";
import { updateWeatherPanel } from "./weather-panel.mjs";
import { beginPressures, sympathy, policePresence, washingAvailable } from "./pressures.mjs";
import { beginEquipment } from "./equipment.mjs";
import { journeyEquipmentAction } from "./equipment-journey.mjs";
import { setupEquipment } from "./equipment-ui.mjs";
import { setupJourneyMiniGames } from "./journey-mini-games-ui.mjs";
import { beginJourneyMiniGame, settleJourneyMiniGame } from "./journey-mini-games.mjs";
import { synchronizeParentDiscovery, applyJournalDiscovery } from "./discovery-targets.mjs";

export function setupTravel({ t, renderMap, selectPlayer, resetContent, onStop, onAudioContext, onStep, onActiveChange, musicAudio, cafeAudio, theftAudio, miniGameAudio, pinPhoto, pinTarot, useNotebook, snapshotNotebook, showNotebook, updateNotebookStats }) {
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
  let lodgingTarget;
  let transient = "", missingHeightMoves = 0;
  let heading = [0, 0];
  let cursor, cameraData;
  let renderedRecovery;
  let survivalConfig, economyData;
  let saveStore, savedJourney, slotOccupied = false, saveError = "", savedAt;
  let pendingRestore;
  const journalClient = createJournalClient(localStorage);
  let publishingNotebook;
  async function publishNotebook(previous) {
    if (previous.journalPublished) return;
    if (publishingNotebook) return publishingNotebook;
    publishingNotebook = (async () => {
      const photos = await snapshotNotebook(previous);
      const dated = (record, text) =>
        `${trailEntryDate(previous, record.elapsedMinutes, document.documentElement.lang, t)} — ${text}`;
      const closing = closingStoryText(previous, t, liveNarrative.snapshot(previous, CLOSING_STORY),
        document.documentElement.lang, { milestones: false });
      const clues = [...(closing ? [closing] : []), trailReminder(previous, t),
        ...(previous.trail.dreams?.checks ?? []).filter(check => check.outcome === "guidance")
          .map(check => dated(check, trailDreamText(check, t,
            liveNarrative.snapshot(previous, LOST_PLAYER_DREAM, trailDreamVariant(previous, check)),
            document.documentElement.lang))),
        ...(previous.trail.exploration?.hints ?? []).map(h => dated(h,
          `${fieldClueText(previous, h, t)} ${t("fieldRecordedAt", {
            col: h.col, row: h.row, minutes: Math.round(h.elapsedMinutes),
          })}`)),
        ...(previous.trail.exploration?.signs ?? []).map(sign =>
          dated(sign, t("fieldSign", { parent: previous.trail.parentName }))),
        ...(previous.trail.exploration?.reports ?? []).map(r => dated(r,
          `${t(`fieldReport.${r.kind}`, { place: r.town.name })} (${r.town.latitude}, ${r.town.longitude})`)),
        ...previous.trail.history.map((facts, step) => dated(facts, facts.next
          ? previous.trail.version === 2
            ? parentClueText(previous, { kind: facts.clueKind, step, nextName: facts.next.name, pending: false }, t)
            : t("trailDialogue", { parent: facts.parentName, place: facts.place, next: facts.next.name })
          : t("trailReunion", { parent: previous.trail.parentName })))];
      await journalClient.publish(previous, await encodeNotebook(photos), clues);
    })();
    try { await publishingNotebook; }
    finally { publishingNotebook = undefined; }
  }
  const abandonedUI = setupAbandonedJournals(t, {
    publishNotebook, showNotebook,
    context: () => state,
    persist(sidequests, published, nearby, observedMinutes) {
      if (!state) return;
      state = applyJournalDiscovery(state, sidequests, nearby, observedMinutes);
      if (published) state = { ...state, journalPublished: true };
      autosave();
      localize();
    },
  });
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
      renderTarotCard(birthArt, null, "", t);
      birthDialog.showModal();
      birthDraw.focus();
      birthPending = false;
    } else {
      if (state.elapsedMinutes === 0) openingStory.open();
      else trailUI.open();
    }
  }
  function localizeBirthCard() {
    if (!state || !economyData) return;
    const card = economyData.tarot.find(card => card.id === state.birthCard);
    const language = document.documentElement.lang === "en" ? "en" : "fr";
    renderTarotCard(birthArt, birthReveal.hidden ? null : card.id, birthReveal.hidden ? "" : card[language], t);
    if (!birthReveal.hidden) pinTarot?.(document.querySelector("#birth-tarot-journal"), state, "birth", economyData);
    if (!birthReveal.hidden) pinTarot?.(document.querySelector("#birth-daily-tarot-journal"), state, "daily", economyData);
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
    openingStory.open();
  });
  birthDialog.addEventListener("cancel", event => event.preventDefault());
  const dailyTarotUI = setupDailyTarot(t, {
    pinTarot,
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
  const trailArrivalUI = setupTrailArrival(t, {
    context: () => active && state ? { state, busy } : null,
    openTrail: () => trailUI.open(),
  });
  const liveNarrative = createLiveNarrative();
  const closingStory = setupClosingStory(t, {
    narrative: liveNarrative, context: () => active ? state : null,
  });
  const trailDreamUI = setupTrailDream(t, {
    narrative: liveNarrative,
    context: () => active && state ? { state, busy } : null,
    openTrail: () => trailUI.open(),
  });
  const openingStory = setupOpeningStory(t, {
    narrative: liveNarrative, context: () => state, onContinue: () => trailUI.open(),
  });
  const journeyEventsUI = setupJourneyEvents(t, {
    narrative: liveNarrative,
    pinEvent: (container, current, economy) => pinTarot(container, current, "event", economy),
    context: () => active && state && economyData ? {
      state, economy: economyData, busy, saveStatus: saveStatus.textContent,
    } : null,
    acknowledge() {
      state = acknowledgeJourneyEvent(state);
      autosave();
      localize();
    },
  });
  function readJourney() {
    savedJourney = undefined;
    slotOccupied = false;
    savedAt = undefined;
    saveError = "";
    try {
      saveStore ??= createJourneyStore(localStorage);
      slotOccupied = localStorage.getItem(`${JOURNEY_SAVE_PREFIX}${region}`) !== null;
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
    if (state) state = recordJourneyPosition(recordTrailArrival(state));
    try {
      if (!saveStore) throw new Error(t("saveStorageUnavailable"));
      state = synchronizeParentDiscovery(state);
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
    abandonedUI.update();
    const placement = state?.pressures?.placements.at(-1);
    if (active && placement?.recovery && placement.finishedMinutes === state.elapsedMinutes &&
        renderedRecovery !== placement.finishedMinutes) {
      renderedRecovery = placement.finishedMinutes;
      cursor = undefined;
      resetContent();
      draw();
      prefetch();
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
      data: economyData, survival: survivalConfig, blocked: busy || Boolean(cursor) || Boolean(state.ended) ||
        Boolean(transitActive(state) || state.performancePending || state.cafePending || state.theftPending || state.miniGamePending || state.events?.pending ||
          state.equipment?.dogEncounter === "pending") };
  }
  const journeyWorldUI = setupJourneyWorld(t, {
    context() {
      const current = economyContext();
      return active && current ? { ...current, gridId: region, busy } : null;
    },
    saveEncounters(encounters) { state = { ...state, worldEncounters: encounters }; autosave(); },
    reserve(feed, id) {
      const current = economyContext();
      if (!current || current.blocked) throw new Error(t("worldBlocked"));
      state = reserveJourneyTransit(state, feed, id, region);
      autosave(); localize();
    },
    cancel() {
      if (busy) throw new Error(t("worldBlocked"));
      state = cancelJourneyTransit(state); autosave(); localize();
    },
    async advance() {
      if (busy || !transitActive(state)) throw new Error(t("worldBlocked"));
      busy = true;
      const currentToken = token;
      try {
        for (let minute = 0; minute < 30 && transitActive(state) && !state.ended; minute++) {
          const booking = state.transport.booking;
          const stop = booking.calls[booking.nextCall].stop;
          const now = state.startedAt + state.elapsedMinutes * 60000;
          if (now >= booking.offer.departureAt &&
              booking.calls[booking.nextCall].arrivalAt - now <= 60000) {
            const target = chunkPosition(stop.col, stop.row);
            await stream.load(target.x, target.y, true);
            if (currentToken !== token) return;
          }
          const current = economyContext();
          if (!current) throw new Error(t("worldCellMissing"));
          state = stepJourneyTransit(state, region, current.info, survivalConfig, economyData);
          autosave();
        }
        resetContent(); draw(); prefetch();
      } finally {
        if (currentToken === token) { busy = false; localize(); }
      }
    },
  });
  const equipmentUI = setupEquipment(t, {
    context() {
      const current = economyContext();
      return current && active ? { ...current, saveStatus: saveStatus.textContent,
        blocked: busy || transitActive(state) || Boolean(cursor) || Boolean(state.ended || state.performancePending ||
          state.cafePending || state.theftPending || state.miniGamePending || state.events?.pending) } : null;
    },
    act(action) {
      const current = economyContext();
      if (!current) throw new Error("Current cell is not loaded.");
      state = journeyEquipmentAction(state, action, current.cell, current.info, survivalConfig, economyData);
      autosave();
      draw();
    },
  });
  const economyUI = setupEconomyUI(t, {
    narrative: liveNarrative,
    context: economyContext, act: economyAction,
    selectAccommodation(place) {
      lodgingTarget = place;
      draw();
    },
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
    difficulty: () => state ? musicDifficulty(state) : { level: 0, xp: 0, beats: 24, multiplier: 1 },
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
    settle(hits, mistakes, cancelled) {
      if (!state?.performancePending) return null;
      try {
        state = settleBusking(state, hits, mistakes, cancelled);
        autosave();
        localize();
        return state.lastEarningsCents;
      } catch (reason) {
        report(reason);
        return null;
      }
    },
  });
  const cafeUI = setupCafe(t, {
    audio: cafeAudio,
    context: economyContext,
    begin(venueId) {
      const current = economyContext();
      if (!current || current.blocked) return null;
      try {
        state = beginCafe(state, current.cell, current.info, venueId, survivalConfig, economyData);
        autosave();
        localize();
        return state.cafePending;
      } catch (reason) {
        report(reason);
        throw reason;
      }
    },
    settle(served, mistakes, cancelled) {
      if (!state?.cafePending) return null;
      try {
        state = settleCafe(state, served, mistakes, cancelled);
        autosave();
        localize();
        return state.lastCafe;
      } catch (reason) {
        report(reason);
        throw reason;
      }
    },
  });
  const theftUI = setupTheft(t, {
    audio: theftAudio,
    available() {
      const current = economyContext();
      return Boolean(current && !current.blocked && choiceAvailable("steal", current.cell));
    },
    begin() {
      const current = economyContext();
      if (!current || current.blocked) return false;
      state = beginTheft(state, current.cell, current.info, survivalConfig, economyData);
      autosave();
      localize();
      return state.theftPending;
    },
    settle(outcome) {
      if (!state?.theftPending) return null;
      const current = economyContext();
      state = settleTheft(state, outcome, current.info, survivalConfig, economyData);
      autosave();
      localize();
      return state.lastSurvivalChoice;
    },
  });
  const miniGamesUI = setupJourneyMiniGames(t, {
    audio: miniGameAudio,
    context: economyContext,
    act(action) {
      try {
        if (action.type === "begin") {
          const current = economyContext();
          if (!current || current.blocked) throw new Error("This activity is unavailable.");
          state = beginJourneyMiniGame(state, action.game, current);
        } else if (action.type === "settle") {
          state = settleJourneyMiniGame(state, action.game, action.result);
        } else throw new Error("Unknown journey mini-game action.");
        autosave();
        localize();
        return state;
      } catch (reason) {
        report(reason);
        throw reason;
      }
    },
  });
  const earnMoneyUI = setupEarnMoney(t, {
    context: () => {
      const current = economyContext();
      return current ? { ...current, saveStatus: saveStatus.textContent } : null;
    },
    perform: choicesUI.perform,
    steal: theftUI.open,
    miniGames: miniGamesUI,
  });
  const trailUI = setupTrail(t, {
    narrative: liveNarrative,
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
      placementTown: position => {
        const town = nearestSettlement(position, stream.chunks.values());
        if (!town) throw new Error(t("placementTownMissing"));
        return town;
      },
      police: policePresence(chunk.rows[row][col]),
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
    abandonedUI.localize();
    saveFeedback.localize();
    localizeBirthCard();
    towns.localize(document.documentElement.lang);
    economyUI.localize();
    musicUI.localize();
    cafeUI.localize();
    theftUI.localize();
    trailUI.localize();
    journeyWorldUI.update();
    openingStory.localize();
    document.querySelector("#map-workspace").classList.toggle("travel-active", active);
    document.body.classList.toggle("is-travelling", active);
    controls.hidden = !active;
    document.querySelector("#travel-overview").hidden = !active;
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
    earnMoneyUI.localize();
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
    const activityPending = Boolean(state?.performancePending || state?.cafePending || state?.theftPending ||
      transitActive(state) || state?.miniGamePending || state?.events?.pending || state?.equipment?.dogEncounter === "pending");
    const marker = document.querySelector(".tile--player");
    if (marker && state) renderJourneyMarker(marker, state, t);
    if (state && survivalConfig && economyData) {
      updateNotebookStats?.({ state, survival: survivalConfig, economy: economyData,
        cellSizeMeters: base.cellSizeMeters, mapTerrain: stream?.journeyTerrain,
        artTerrain: cell?.terrain,
        artWeather: weatherData?.months[journeyDate(state).getUTCMonth()]?.condition,
        startingPoint: base.origin?.name ?? base.name });
    }
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
        health: healthValue(state),
        hunger: hungerPercent(state, survivalConfig),
        fatigue: state.fatigue,
        sleep: Math.min(100, state.awakeHours / survivalConfig.sleep_limit_hours * 100),
      };
      for (const [key, value] of Object.entries(values)) {
        const meter = document.querySelector(`#needs-${key}`);
        meter.value = value;
        meter.low = key === "health" ? 25 : survivalConfig.warning_percent * 0.6;
        meter.high = key === "health" ? 60 : key === "hunger" ? 75 : survivalConfig.warning_percent;
        document.querySelector(`#needs-${key}-value`).textContent = `${Math.round(value)}%`;
      }
      document.querySelector("#needs-sleep").title = t("needsAwake", { hours: state.awakeHours.toFixed(1) });
      const warnings = [];
      if (values.health <= 25) warnings.push(t("needsInjured"));
      if (values.hunger >= 75) warnings.push(t("needsHungry"));
      if (values.fatigue >= survivalConfig.warning_percent) warnings.push(t("needsTired"));
      if (state.awakeHours >= survivalConfig.sleep_warning_hours) warnings.push(t("needsSleepy"));
      const speed = state.speedEffect;
      document.querySelector("#needs-speed-effect").textContent = speed && speed.expiresMinutes > state.elapsedMinutes
        ? t("journeyEventSpeed", { percent: Math.round((speed.factor - 1) * 100),
          minutes: Math.ceil(speed.expiresMinutes - state.elapsedMinutes) }) : "";
      document.querySelector("#needs-warning").textContent = warnings.join(" ");
      const pressures = state.pressures;
      document.querySelector("#player-vigilance").hidden = !pressures;
      document.querySelector("#player-hygiene").hidden = !pressures;
      document.querySelector("#pressure-panel").hidden = !pressures;
      if (pressures) {
        for (const [key, value] of Object.entries({ vigilance: pressures.vigilance,
          cleanliness: pressures.cleanliness, sympathy: sympathy(state) })) {
          document.querySelector(`#pressure-${key}`).value = value;
          document.querySelector(`#pressure-${key}-value`).textContent = `${Math.round(value)}%`;
        }
        document.querySelector("#pressure-status").textContent = t("pressureStatus", {
          count: pressures.placements.length, hours: (pressures.localMinutes / 60).toFixed(1),
        });
        const language = document.documentElement.lang === "en" ? "en" : "fr";
        document.querySelector("#pressure-tarot").textContent = t("pressureTarot", {
          birth: economyData.tarot.find(c => c.id === state.birthCard)[language],
          daily: economyData.tarot.find(c => c.id === state.dailyCard)[language],
          factor: Math.round(pressures.tarotFactor * 100),
          sympathy: ((1 - pressures.tarotFactor) * 30).toFixed(1),
        });
        const washing = document.querySelector("#wash-travel");
        const price = cell ? marketPrice(cell, 0.25, economyData,
          exposureInfo(chunk, position.row, position.col)).cents : null;
        washing.textContent = t("washAction", { money: price === null ? "—" : (price / 100).toFixed(2) });
        washing.disabled = busy || Boolean(cursor) || ended || !washingAvailable(cell) ||
          price === null || state.walletCents < price || activityPending;
      }
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
      updateWeatherPanel(document.querySelector("#journey-atmosphere"), temperature, month.condition);
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
      updateWeatherPanel(document.querySelector("#journey-atmosphere"), null, null);
      document.querySelector("#weather-effects").textContent = active ? t("temperatureUnavailable") : "";
      weatherSummary.textContent = weatherError
        ? t("weatherError", { error: weatherError }) : active ? t("weatherLoading") : "";
    }
    for (const button of directions) button.disabled = busy || !cell || (ended && !cursor) || activityPending;
    const blocker = active ? journeyActionBlocker(state, { busy, cell }) : null;
    const blockerStatus = document.querySelector("#travel-blocker");
    blockerStatus.hidden = !blocker;
    blockerStatus.textContent = blocker ? t(`travelBlocked.${blocker}`) : "";
    rest.disabled = sleep.disabled = busy || !cell || Boolean(cursor) || ended || activityPending;
    eat.disabled = rest.disabled || !canEat(cell);
    look.disabled = busy || !cell;
    look.textContent = t(cursor ? "travelLookExit" : "travelLook");
    look.setAttribute("aria-pressed", String(Boolean(cursor)));
    document.querySelector("#look-status").textContent = cursor ? t("travelLookHint") : "";
    const lodgingStatus = document.querySelector("#lodging-target-status");
    lodgingStatus.hidden = !lodgingTarget || !cell;
    lodgingStatus.textContent = lodgingTarget && cell
      ? lodgingGuidance(lodgingTarget, state, cellInfo(chunk, position.row, position.col), t) : "";
    document.querySelector("#lodging-target-clear").hidden = !lodgingTarget;
    setFeedback(lodgingStatus, lodgingTarget && state &&
      lodgingTarget.col === state.col && lodgingTarget.row === state.row ? "success" : "");
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
      for (const key of ["weekday", "day", "month", "year"]) {
        document.querySelector(`#agenda-${key}`).textContent = parts[key];
      }
      document.querySelector("#agenda-hour-hand").setAttribute("transform", `rotate(${parts.hourDegrees} 40 40)`);
      document.querySelector("#agenda-minute-hand").setAttribute("transform", `rotate(${parts.minuteDegrees} 40 40)`);
    }
    const sky = document.querySelector("#travel-sky");
    sky.hidden = !cell;
    if (!active) delete document.body.dataset.journeyPhase;
    if (cell) {
      const player = cellInfo(chunk, position.row, position.col);
      const cycle = skyState(journeyDate(state), player.latitude, player.longitude);
      if (active) document.body.dataset.journeyPhase = cycle.background;
      sky.dataset.phase = cycle.phase;
      document.querySelector("#sky-marker").style.left = `${cycle.x / 200 * 100}%`;
      document.querySelector("#sky-marker").style.top = `${cycle.y / 110 * 100}%`;
      document.querySelector("#sky-sun").style.display = cycle.phase === "day" ? "" : "none";
      document.querySelector("#sky-moon").style.display = cycle.phase === "night" ? "" : "none";
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
    journeyEventsUI.update();
    equipmentUI.update();
    trailArrivalUI.update();
    trailDreamUI.update();
    closingStory.update();
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
    if (lodgingTarget) {
      const row = lodgingTarget.row - (position.y - 1) * 8;
      const col = lodgingTarget.col - (position.x - 1) * 8;
      const destination = document.querySelector(`.tile[data-row="${row}"][data-col="${col}"]`);
      if (destination) {
        destination.classList.add("tile--lodging");
        destination.title = lodgingTarget.name || t("mappedShelter");
      }
    }
    const tile = document.querySelector(`.tile[data-row="${position.row + 8}"][data-col="${position.col + 8}"]`);
    tile.classList.add("tile--player");
    renderJourneyMarker(tile, state, t);
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
    if (!state || busy || !active || transitActive(state) || state.ended || state.performancePending || state.cafePending || state.theftPending || state.miniGamePending ||
        state.events?.pending || state.equipment?.dogEncounter === "pending") return;
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
      const walked = walkSurvival(previous, dc, dr, fromCell, target.rows[to.row][to.col], survivalConfig, weatherInfo);
      const finalized = finishAction(previous, walked, { ...weatherInfo, terrain: target.rows[to.row][to.col].terrain,
        police: policePresence(target.rows[to.row][to.col]) }, economyData,
        { survival: survivalConfig });
      const eventInfo = exposureInfo(target, to.row, to.col);
      state = advanceJourneyEvents(previous, recordTrailArrival(finalized), eventInfo, survivalConfig, economyData);
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
    journeyWorldUI.reset();
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
      if (!restored && savedJourney && !savedJourney.state.journalPublished) {
        const previous = ensureJournalAccess(savedJourney.state);
        savedJourney = saveStore.write({ region, map: base, state: previous,
          survival: savedJourney.survival, economy: savedJourney.economy });
        await publishNotebook(previous);
        savedJourney = saveStore.write({ region, map: base, state: { ...previous, journalPublished: true },
          survival: savedJourney.survival, economy: savedJourney.economy });
      }
      const health = await fetch("/api/travel", { signal: AbortSignal.timeout(5000) });
      if (!health.ok || !(health.headers.get("content-type") ?? "").includes("application/json")) {
        throw new Error(t("travelServerRequired"));
      }
      const config = await health.json();
      if (config.chunkSize !== 8 || config.cellSizeMeters !== 250) throw new Error("Unsupported travel server.");
      if (currentToken !== token) return;
      if (restored) {
        state = ensureJournalAccess(structuredClone(restored.state));
        if (state.journalPublished && !state.ended) throw new Error(t("abandoned.alreadyLeft"));
        savedJourney = saveStore.write({ region, map: base, state,
          survival: restored.survival, economy: restored.economy });
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
          pendingCreation = pendingJournalCreation(localStorage, region, characterName);
        }
        const created = await createServerJourney(region, base, characterName,
          pendingCreation.requestId, trailController.signal, fetch, pendingCreation.capability);
        if (currentToken !== token) return;
        state = { ...created.state, journalAccess: pendingCreation.capability,
          storyNameFlavour: document.querySelector("#story-name-flavour").checked };
        survivalConfig = created.survival;
        economyData = created.economy;
        transient = "travelLoading";
        birthPending = true;
      }
      if (currentToken !== token) return;
      openingStory.prepare();
      state = migrateHealth(state);
      state = beginEquipment(state);
      state = beginExploration(state, Boolean(restored));
      state = beginPressures(state, economyData);
      needsNotices.reset(restored ? state : undefined);
      trailArrivalUI.reset(restored ? state : undefined);
      trailDreamUI.reset(restored ? state : undefined);
      await useNotebook?.(state, Boolean(restored));
      if (restored) {
        pinTarot?.(document.querySelector("#restored-birth-tarot-journal"), state, "birth", economyData);
        if (state.dailyTarotSeenDay === state.tarotDay) {
          pinTarot?.(document.querySelector("#restored-daily-tarot-journal"), state, "daily", economyData);
        }
      }
      prepareCurrentParentPath();
      const p = chunkPosition(state.col, state.row);
      stream = createChunkStream(region, { onUpdate: () => {
        if (currentToken === token) draw();
      } });
      stream.journeyTerrain = createJourneyTerrainLoader(region, stream.chunks);
      backgroundDownloads = createChunkPrefetcher(stream, {
        cached: targets => stream.restoreCached(targets),
        onError(reason) {
          if (currentToken === token) report(reason);
        }, onLoad(chunk, x, y) {
          const key = chunk.elevation.error;
          if (currentToken === token && chunk.elevation.error && !reported.has(key)) {
            reported.add(key);
            report(new Error(chunk.elevation.error));
          }
        },
      });
      const first = await stream.load(p.x, p.y, true);
      if (currentToken !== token) return;
      if (first.elevation.error) {
        error = first.elevation.error;
        reported.add(error);
      }
      active = true;
      autosave();
      if (!saveError) finishJournalCreation(localStorage, region);
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
    lodgingTarget = undefined;
    birthDialog.close();
    dailyTarotUI.reset();
    needsNotices.reset();
    trailArrivalUI.reset();
    trailDreamUI.reset();
    journeyWorldUI.reset();
    journeyEventsUI.reset();
    liveNarrative.reset();
    openingStory.reset();
    equipmentUI.reset();
    birthPending = false;
    musicUI.reset();
    cafeUI.reset();
    theftUI.reset();
    earnMoneyUI.reset();
    miniGamesUI.destroy();
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
    renderedRecovery = undefined;
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
    if (busy) return;
    if (slotOccupied && !confirm(t("saveReplaceConfirm"))) return;
    reset();
    begin(undefined, true);
  });
  look.addEventListener("click", toggleLook);
  document.querySelector("#lodging-target-clear").addEventListener("click", () => {
    lodgingTarget = undefined;
    draw();
  });
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
      if (current.blocked) return;
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
      const previous = state;
      let next = action.kind === "meal"
        ? buyMeal(state, current.cell, current.info, action.id, survivalConfig, economyData)
        : action.kind === "hospitality"
        ? askHospitality(state, current.cell, current.info, survivalConfig, economyData, Math.random, action.id)
        : sleepEconomy(state, current.cell, current.info, action.id, survivalConfig, economyData);
      if (action.kind !== "meal") {
        const hosted = action.kind === "hospitality" && next.hospitalityAttempts?.at(-1)?.outcome === "hosted";
        next = settleTrailDream(previous, next, {
          startedMinutes: previous.elapsedMinutes + (hosted ? HOSPITALITY_RULES.minutes : 0),
        });
      }
      state = next;
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
  document.querySelector("#wash-travel").addEventListener("click", () => {
    const current = economyContext();
    if (!current || current.blocked) return;
    try {
      state = washEconomy(state, current.cell, current.info, survivalConfig, economyData);
      autosave();
      localize();
    } catch (reason) {
      report(reason);
    }
  });
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
