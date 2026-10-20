import { mealOffers, marketPrice, shelters, tarotEventChance } from "./economy.mjs";
import { HOSPITALITY_RULES, hospitalityStatus, worshipPlaces } from "./hospitality.mjs";
import { socialFailureChance } from "./pressures.mjs";
import { setFeedback, setGenerating } from "./feedback.mjs";
import { NARRATIVE_BRIEFS } from "./live-narrative.mjs";
import { mergeAccommodations } from "./accommodations.mjs";

export function setupEconomyUI(t, { context, act, resolveCountry, findAccommodations, selectAccommodation, narrative }) {
  const dialog = document.querySelector("#economy-dialog");
  let mode = "eat";
  let resolving = false, countryError = "", generation = 0;
  let accommodationController, accommodationResult, accommodationError = "", accommodationLoading = false;
  let accommodationCancelled = false;
  let accommodationProgress;
  let accommodationPartial = false;
  let accommodationCachedKey;
  let speechKey, speech, speechBrief;
  const npcSpeech = narrative ? document.createElement("p") : null;
  const npcStatus = narrative ? document.createElement("p") : null;
  if (npcSpeech) {
    npcSpeech.id = "economy-npc-dialogue";
    npcStatus.id = "economy-npc-wording-status";
    npcStatus.setAttribute("role", "status");
    document.querySelector("#economy-shelter-context").after(npcSpeech, npcStatus);
  }
  function speechStatus() {
    if (!npcStatus || !speechBrief || !dialog.open) return;
    const current = context();
    if (current) {
      npcStatus.textContent = narrative.status(current.state, speechBrief, document.documentElement.lang);
      setGenerating(npcStatus, narrative.pending?.(current.state, speechBrief));
    }
  }
  narrative?.subscribe(speechStatus);
  const money = cents => `${(cents / 100).toFixed(2)} ${t("gameMoney")}`;
  const hospitalityResult = result => t(`${result.placeKind === "worship" ? "worshipResult" : "hospitalityResult"}.${result.outcome}`, {
    town: result.townName, day: result.day,
    minutes: Math.round(result.finishedMinutes - result.startedMinutes),
  });

  function localize() {
    const current = context();
    if (!current) return;
    const { state, cell, info, data, survival } = current;
    document.querySelector("#town-services").disabled = current.blocked;
    document.querySelector("#town-accommodation").disabled = current.blocked;
    const language = document.documentElement.lang === "en" ? "en" : "fr";
    const birth = data.tarot.find(card => card.id === state.birthCard);
    const daily = data.tarot.find(card => card.id === state.dailyCard);
    document.querySelector("#player-tarot").textContent = t("tarotStatus", {
      birth: birth[language], daily: daily[language],
    });
    document.querySelector("#outdoor-status").textContent = t("outdoorStatus", {
      hours: (state.outdoorNightMinutes / 60).toFixed(1),
    });
    if (!dialog.open) return;
    const dreamHelp = document.querySelector("#economy-dream-help");
    dreamHelp.hidden = mode !== "sleep";
    dreamHelp.textContent = t("trailDreamRules");
    document.querySelector("#nearby-accommodation").hidden = mode !== "sleep" || !findAccommodations;
    const searchButton = document.querySelector("#accommodation-search");
    searchButton.disabled = current.blocked;
    searchButton.dataset.i18n = accommodationLoading ? "accommodationCancel" : "accommodationSearch";
    searchButton.textContent = t(searchButton.dataset.i18n);
    const nearbyStatus = document.querySelector("#accommodation-status");
    nearbyStatus.textContent = accommodationError ? t("accommodationUnavailable")
      : t(accommodationLoading ? "accommodationLoading" : accommodationCancelled ? "accommodationCancelled" : accommodationResult
        ? accommodationResult.warnings.length ? "accommodationIncomplete"
          : accommodationResult.places.length ? "accommodationReady" : "accommodationEmpty"
        : "accommodationHint");
    setFeedback(nearbyStatus, accommodationError || accommodationResult?.warnings.length ? "failure"
      : accommodationLoading || !accommodationResult ? "" : accommodationResult.places.length ? "success" : "failure");
    const diagnostics = document.querySelector("#accommodation-details");
    diagnostics.textContent = accommodationError || accommodationResult?.warnings.join(" ") || "";
    if (accommodationPartial) diagnostics.textContent += ` ${t("accommodationCached")}`;
    if (accommodationLoading && accommodationProgress) showAccommodationProgress();
    const nearby = document.querySelector("#accommodation-results");
    nearby.replaceChildren();
    const accommodationPriority = place => place.col === state.col && place.row === state.row
      ? place.tags?.tourism === "hotel" ? 2 : 1 : 0;
    const nearbyPlaces = [...(accommodationResult?.places ?? [])].sort((a, b) =>
      accommodationPriority(b) - accommodationPriority(a));
    for (const place of nearbyPlaces) {
      const item = document.createElement("li"), text = document.createElement("p");
      const east = place.col - state.col, north = state.row - place.row;
      const worship = place.tags?.amenity === "place_of_worship";
      const sectors = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
      const direction = t(`hintCompass.${sectors[(Math.round(Math.atan2(east, north) / (Math.PI / 4)) + 8) % 8]}`);
      text.textContent = `${place.name || t("mappedShelter")} — ${east || north
        ? t("accommodationLocation", { meters: place.distance, direction })
        : t("accommodationHere")}`;
      const availability = document.createElement("p");
      availability.textContent = t(east || north
        ? worship ? "accommodationWalkWorship" : "accommodationWalkLodging"
        : worship ? "accommodationHereWorship" : "accommodationHereLodging");
      const credit = document.createElement("p"), source = document.createElement("a");
      const provenance = document.createElement("div");
      provenance.className = "technical-text";
      credit.textContent = `${place.credit} · ${place.license}${place.updated ? ` · ${place.updated}` : ""}`;
      source.href = place.sourceUrl;
      source.textContent = place.source;
      source.target = "_blank";
      source.rel = "noopener noreferrer";
      const license = document.createElement("a");
      license.href = place.licenseUrl;
      license.textContent = t("contentLicense");
      license.target = "_blank";
      license.rel = "noopener noreferrer";
      provenance.append(credit, source, " ", license);
      item.append(text, availability, provenance);
      if (selectAccommodation) {
        const go = document.createElement("button");
        go.type = "button";
        go.textContent = t(worship ? "accommodationGoWorship" : "accommodationGo");
        go.disabled = current.blocked;
        go.addEventListener("click", () => {
          if (context()?.blocked) return;
          selectAccommodation(place);
          dialog.close();
        });
        item.append(go);
      }
      nearby.append(item);
    }
    const quote = marketPrice(cell, 1, data, info);
    document.querySelector("#economy-pricing").textContent = t(quote.estimated ? "priceEuropeanEstimate"
      : quote.reference ? "priceReference" : "priceMarket",
      { market: quote.market ?? "", date: data.pricing.date,
        delta: `${quote.variation >= 0 ? "+" : ""}${(quote.variation * 100).toFixed(2)}` });
    if (resolving) document.querySelector("#economy-pricing").textContent = t("priceCountryLoading");
    else if (countryError) document.querySelector("#economy-pricing").textContent += ` ${t("priceCountryError", { error: countryError })}`;
    if (mode === "eat") document.querySelector("#economy-pricing").textContent += ` ${t("mealDailyOffers")}`;
    const priceSource = document.querySelector("#economy-price-source");
    priceSource.href = data.pricing.source;
    document.querySelector("#economy-title").textContent = t(mode === "eat" ? "mealTitle" : "sleepTitle");
    const list = document.querySelector("#economy-options");
    list.replaceChildren();
    document.querySelector("#economy-shelter-context").textContent = "";
    document.querySelector("#economy-hospitality-result").textContent = "";
    const add = (title, cents, run, note, url, sourceName, unavailable = false) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `${title} — ${money(cents)}`;
      button.disabled = unavailable || resolving || state.ended !== null || state.walletCents < cents || current.blocked;
      button.addEventListener("click", () => {
        if (act(run)) {
          if (run.kind === "hospitality") {
            localize();
            const feedback = document.getElementById(run.id
              ? `economy-worship-${run.id.replace("/", "-")}` : "economy-hospitality-feedback");
            if (feedback && dialog.open) {
              feedback.focus({ preventScroll: true });
              feedback.scrollIntoView({ block: "nearest" });
            }
          } else {
            dialog.close();
            document.querySelector("#ascii-map").focus({ preventScroll: true });
          }
        }
      });
      const p = document.createElement("p");
      p.textContent = note;
      item.append(button, p);
      if (url) {
        const a = document.createElement("a");
        a.href = url;
        a.textContent = sourceName;
        a.className = "technical-text";
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        item.append(a);
      }
      list.append(item);
      return p;
    };
    if (mode === "eat") {
      const meals = mealOffers(state, cell, info, data);
      document.querySelector("#economy-empty").hidden = meals.length > 0;
      for (const meal of meals) {
        const restaurant = meal.kind === "restaurant";
        const title = restaurant ? t("mealAtRestaurant", { name: meal.venue.name ?? t("mappedRestaurant") })
          : meal.kind === "basic" ? t("basicMeal") : meal.name;
        let note = restaurant ? t("restaurantMealNote") : meal.kind === "basic" ? t("basicMealNote") : meal[language];
        if (meal.kind === "specialty" && meal.area) note = `${t(
          meal.scope === "national" ? "mealNationalOrigin" : "mealRegionalOrigin", { area: meal.area })} ${note}`;
        const description = add(`${title} · ${survival.meal_minutes} min`, meal.cents,
          { kind: "meal", id: meal.id },
          note,
          restaurant ? `https://www.openstreetmap.org/${meal.venue.osmId}` : meal.source,
          restaurant ? t("townOsm") : meal.publisher);
        const effects = document.createElement("p");
        effects.className = "window-help-text";
        effects.textContent = t("mealEffect", { kcal: meal.reserveKcal, minutes: survival.meal_minutes });
        description.after(effects);
      }
    } else {
      document.querySelector("#economy-empty").hidden = true;
      const mapped = shelters(cell, state);
      const places = worshipPlaces(cell);
      document.querySelector("#economy-shelter-context").textContent =
        t(mapped.length || places.length ? "shelterCellOnly" : "shelterNoneInCell");
      const addShelter = shelter => {
        const cents = shelter.free ? 0 : marketPrice(cell, data.rules.lodgingMealUnits, data, info).cents;
        const credit = shelter.credit ? ` ${shelter.credit} · ${shelter.license}${shelter.updated ? ` · ${shelter.updated}` : ""}` : "";
        const note = add(`${shelter.name || t("mappedShelter")} · ${survival.sleep_hours} h`, cents, { kind: "sleep", id: shelter.osmId },
          t(shelter.camping ? "campingRecoveryNote" : shelter.free ? "shelterNote" : "hotelRecoveryNote", { hours: survival.sleep_hours }) + credit,
          shelter.sourceUrl ?? `https://www.openstreetmap.org/${shelter.osmId}`, shelter.source ?? t("townOsm"));
        note.className = "window-help-text";
      };
      for (const hotel of mapped.filter(shelter => shelter.tags.tourism === "hotel")) addShelter(hotel);
      const hospitality = hospitalityStatus(state, cell);
      if (hospitality.town) {
        const note = t(hospitality.attempt ? "hospitalityAlreadyAsked" : "hospitalityNote", {
            town: hospitality.town.name, minutes: HOSPITALITY_RULES.minutes, hours: survival.sleep_hours,
            chance: Math.round((1 - socialFailureChance(tarotEventChance(HOSPITALITY_RULES.failureChance, state, data), state)) * 100),
          });
        const feedback = add(`${t("hospitalityAsk")} · ${HOSPITALITY_RULES.minutes} min`, 0, { kind: "hospitality" },
          hospitality.attempt ? hospitalityResult(hospitality.attempt) : "",
          undefined, undefined, !hospitality.available);
        const rules = document.createElement("p");
        rules.className = "window-help-text";
        rules.textContent = note;
        feedback.after(rules);
        feedback.id = "economy-hospitality-feedback";
        setFeedback(feedback, hospitality.attempt
          ? hospitality.attempt.outcome === "hosted" ? "success" : "failure" : "");
        feedback.tabIndex = -1;
        feedback.setAttribute("role", "status");
        feedback.setAttribute("aria-atomic", "true");
      } else {
        document.querySelector("#economy-shelter-context").textContent += ` ${t("hospitalityTownRequired")}`;
      }
      if (npcSpeech) {
        const latest = state.hospitalityAttempts?.at(-1);
        const visible = latest && (latest === hospitality.attempt || places.some(place =>
          hospitalityStatus(state, cell, place.osmId).attempt === latest));
        const outcome = visible ? latest.outcome : "greeting";
        const brief = `npc.hospitality.${outcome}`;
        const supported = Object.hasOwn(NARRATIVE_BRIEFS, brief) && Boolean(hospitality.town || places.length);
        npcSpeech.hidden = npcStatus.hidden = !supported;
        if (supported) {
          narrative.prefetch(state, ["npc.hospitality.greeting", "npc.hospitality.hosted", "npc.hospitality.refused"]);
          const key = `${brief}:${visible ? latest.startedMinutes : "before"}`;
          if (speechKey !== key) {
            speechKey = key;
            speechBrief = brief;
            speech = narrative.snapshot(state, brief);
          }
          npcSpeech.textContent = (speech ?? NARRATIVE_BRIEFS[brief])[language];
          speechStatus();
        }
      }
      for (const place of places) {
        const status = hospitalityStatus(state, cell, place.osmId);
        const name = place.name?.trim() || t("worshipUnnamed");
        const note = t(status.attempt ? "worshipAlreadyAsked" : "worshipNote", {
          place: name, minutes: HOSPITALITY_RULES.minutes, hours: survival.sleep_hours,
          chance: Math.round((1 - socialFailureChance(tarotEventChance(HOSPITALITY_RULES.failureChance, state, data), state)) * 100),
        });
        const feedback = add(`${t("worshipAsk", { place: name })} · ${HOSPITALITY_RULES.minutes} min`, 0,
          { kind: "hospitality", id: place.osmId },
          status.attempt ? hospitalityResult(status.attempt) : "",
          `https://www.openstreetmap.org/${place.osmId}`, t("townOsm"), !status.available);
        const rules = document.createElement("p");
        rules.className = "window-help-text";
        rules.textContent = note;
        feedback.after(rules);
        feedback.id = `economy-worship-${place.osmId.replace("/", "-")}`;
        setFeedback(feedback, status.attempt
          ? status.attempt.outcome === "hosted" ? "success" : "failure" : "");
        feedback.tabIndex = -1;
        feedback.setAttribute("role", "status");
        feedback.setAttribute("aria-atomic", "true");
      }
      const result = state.hospitalityAttempts?.at(-1);
      setFeedback(document.querySelector("#economy-hospitality-result"),
        result ? result.outcome === "hosted" ? "success" : "failure" : "");
      if (result && result !== hospitality.attempt && !places.some(place =>
        hospitalityStatus(state, cell, place.osmId).attempt === result)) {
        document.querySelector("#economy-hospitality-result").textContent = hospitalityResult(result);
      }
      add(`${t("outdoorSleep")} · ${survival.sleep_hours} h`, 0,
        { kind: "sleep", id: null }, t("outdoorSleepNote")).className = "window-help-text";
      for (const shelter of mapped.filter(shelter => shelter.tags.tourism !== "hotel")) addShelter(shelter);
    }
  }

  async function open(nextMode) {
    if (!context() || context().blocked || document.querySelector("dialog[open]")) return;
    mode = nextMode;
    speechKey = undefined;
    speechBrief = undefined;
    if (npcSpeech) npcSpeech.hidden = npcStatus.hidden = mode !== "sleep";
    accommodationController?.abort();
    accommodationLoading = false;
    accommodationCancelled = false;
    accommodationPartial = false;
    accommodationResult = undefined;
    accommodationError = "";
    dialog.dataset.activity = mode;
    document.querySelector("#economy-action-error").textContent = "";
    dialog.showModal();
    const request = ++generation;
    resolving = Boolean(resolveCountry);
    countryError = "";
    localize();
    const accommodationSearch = mode === "sleep" ? searchAccommodations() : undefined;
    try {
      await resolveCountry?.();
    } catch (error) {
      console.error("Pricing country lookup failed:", error);
      if (request === generation) countryError = error.message;
    } finally {
      if (request === generation) {
        resolving = false;
        localize();
      }
    }
    await accommodationSearch;
  }
  function showAccommodationProgress() {
    document.querySelector("#accommodation-status").textContent = t("accommodationLoading");
    document.querySelector("#accommodation-details").textContent = `${
      t(`accommodationPhase.${accommodationProgress.phase}`)}${
      accommodationProgress.provider ? ` (${accommodationProgress.provider})` : ""} · ${
      t("accommodationElapsed", { seconds: accommodationProgress.elapsedSeconds })}`;
    if (accommodationPartial) document.querySelector("#accommodation-details").textContent += ` ${t("accommodationCached")}`;
  }
  async function searchAccommodations() {
    const current = context();
    if (!findAccommodations || accommodationLoading || !current || current.blocked) return;
    accommodationController = new AbortController();
    const controller = accommodationController;
    accommodationLoading = true;
    accommodationCancelled = false;
    accommodationProgress = undefined;
    accommodationCachedKey = undefined;
    accommodationError = "";
    localize();
    try {
      const result = await findAccommodations(controller.signal, progress => {
        if (controller.signal.aborted || controller !== accommodationController) return;
        accommodationProgress = progress;
        const cachedKey = progress.cached && JSON.stringify(progress.cached);
        if (progress.cached && cachedKey !== accommodationCachedKey) {
          accommodationCachedKey = cachedKey;
          accommodationResult = progress.cached;
          accommodationPartial = true;
          localize();
          return;
        }
        showAccommodationProgress();
      });
      if (controller.signal.aborted) return;
      accommodationResult = mergeAccommodations(accommodationResult ?? { places: [], warnings: [] }, result);
      accommodationPartial = false;
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error("Accommodation lookup failed:", error);
      accommodationError = error.message;
    } finally {
      if (controller === accommodationController) {
        accommodationLoading = false;
        localize();
      }
    }
  }
  function cancelAccommodationSearch() {
    accommodationController?.abort();
    accommodationController = undefined;
    accommodationLoading = false;
    accommodationCancelled = true;
    localize();
  }
  document.querySelector("#accommodation-search").addEventListener("click", () =>
    accommodationLoading ? cancelAccommodationSearch() : searchAccommodations());
  dialog.addEventListener("close", () => { if (!dialog.open) cancelAccommodationSearch(); });
  dialog.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.preventDefault();
      dialog.close();
    }
  });
  document.querySelector("#town-services").addEventListener("click", () => {
    document.querySelector("#town-dialog").close();
    open("eat");
  });
  document.querySelector("#town-accommodation").addEventListener("click", () => {
    document.querySelector("#town-dialog").close();
    void open("sleep");
  });
  return { open, localize, reset() {
    generation++; resolving = false; countryError = "";
    accommodationController?.abort();
    accommodationLoading = false;
    accommodationCancelled = false;
    accommodationPartial = false;
    accommodationResult = undefined;
    accommodationError = "";
    dialog.close();
  }, money };
}
