import { mealOffers, marketPrice, shelters, tarotEventChance } from "./economy.mjs";
import { HOSPITALITY_RULES, hospitalityStatus, worshipPlaces } from "./hospitality.mjs";
import { setFeedback } from "./feedback.mjs";

export function setupEconomyUI(t, { context, act, resolveCountry, findAccommodations }) {
  const dialog = document.querySelector("#economy-dialog");
  let mode = "eat";
  let resolving = false, countryError = "", generation = 0;
  let accommodationController, accommodationResult, accommodationError = "", accommodationLoading = false;
  let accommodationCancelled = false;
  let accommodationProgress;
  let accommodationPartial = false;
  let accommodationCachedKey;
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
    document.querySelector("#nearby-accommodation").hidden = mode !== "sleep" || !findAccommodations;
    const searchButton = document.querySelector("#accommodation-search");
    searchButton.disabled = current.blocked;
    searchButton.dataset.i18n = accommodationLoading ? "accommodationCancel" : "accommodationSearch";
    searchButton.textContent = t(searchButton.dataset.i18n);
    const nearbyStatus = document.querySelector("#accommodation-status");
    nearbyStatus.textContent = accommodationError ? t("accommodationError", { error: accommodationError })
      : t(accommodationLoading ? "accommodationLoading" : accommodationCancelled ? "accommodationCancelled" : accommodationResult
        ? accommodationResult.warnings.length ? "accommodationIncomplete"
          : accommodationResult.places.length ? "accommodationReady" : "accommodationEmpty"
        : "accommodationHint");
    setFeedback(nearbyStatus, accommodationError || accommodationResult?.warnings.length ? "failure"
      : accommodationLoading || !accommodationResult ? "" : accommodationResult.places.length ? "success" : "failure");
    if (accommodationResult?.warnings.length) nearbyStatus.textContent += ` ${accommodationResult.warnings.join(" ")}`;
    if (accommodationPartial && !accommodationLoading) nearbyStatus.textContent += ` ${t("accommodationCached")}`;
    if (accommodationLoading && accommodationProgress) showAccommodationProgress();
    const nearby = document.querySelector("#accommodation-results");
    nearby.replaceChildren();
    for (const place of accommodationResult?.places ?? []) {
      const item = document.createElement("li"), text = document.createElement("p");
      const east = place.col - state.col, north = state.row - place.row;
      const sectors = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
      const direction = t(`hintCompass.${sectors[(Math.round(Math.atan2(east, north) / (Math.PI / 4)) + 8) % 8]}`);
      text.textContent = `${place.name || t("mappedShelter")} — ${east || north
        ? t("accommodationLocation", { meters: place.distance, direction })
        : t("accommodationHere")}`;
      const credit = document.createElement("p"), source = document.createElement("a");
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
      item.append(text, credit, source, " ", license);
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
        add(title, meal.cents,
          { kind: "meal", id: meal.id },
          `${note} ${t("mealEffect", { kcal: meal.reserveKcal, minutes: survival.meal_minutes })}`,
          restaurant ? `https://www.openstreetmap.org/${meal.venue.osmId}` : meal.source,
          restaurant ? t("townOsm") : meal.publisher);
      }
    } else {
      document.querySelector("#economy-empty").hidden = true;
      const mapped = shelters(cell);
      document.querySelector("#economy-shelter-context").textContent =
        t(mapped.length ? "shelterCellOnly" : "shelterNoneInCell");
      const hospitality = hospitalityStatus(state, cell);
      if (hospitality.town) {
        const note = t(hospitality.attempt ? "hospitalityAlreadyAsked" : "hospitalityNote", {
            town: hospitality.town.name, minutes: HOSPITALITY_RULES.minutes, hours: survival.sleep_hours,
            chance: Math.round((1 - tarotEventChance(HOSPITALITY_RULES.failureChance, state, data)) * 100),
          });
        const feedback = add(t("hospitalityAsk"), 0, { kind: "hospitality" },
          hospitality.attempt ? `${hospitalityResult(hospitality.attempt)} ${note}` : note,
          undefined, undefined, !hospitality.available);
        feedback.id = "economy-hospitality-feedback";
        setFeedback(feedback, hospitality.attempt
          ? hospitality.attempt.outcome === "hosted" ? "success" : "failure" : "");
        feedback.tabIndex = -1;
        feedback.setAttribute("role", "status");
        feedback.setAttribute("aria-atomic", "true");
      } else {
        document.querySelector("#economy-shelter-context").textContent += ` ${t("hospitalityTownRequired")}`;
      }
      const places = worshipPlaces(cell);
      for (const place of places) {
        const status = hospitalityStatus(state, cell, place.osmId);
        const name = place.name?.trim() || t("worshipUnnamed");
        const note = t(status.attempt ? "worshipAlreadyAsked" : "worshipNote", {
          place: name, minutes: HOSPITALITY_RULES.minutes, hours: survival.sleep_hours,
          chance: Math.round((1 - tarotEventChance(HOSPITALITY_RULES.failureChance, state, data)) * 100),
        });
        const feedback = add(t("worshipAsk", { place: name }), 0,
          { kind: "hospitality", id: place.osmId },
          status.attempt ? `${hospitalityResult(status.attempt)} ${note}` : note,
          `https://www.openstreetmap.org/${place.osmId}`, t("townOsm"), !status.available);
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
      add(t("outdoorSleep"), 0, { kind: "sleep", id: null }, t("outdoorSleepNote"));
      for (const shelter of mapped) {
        const cents = shelter.free ? 0 : marketPrice(cell, data.rules.lodgingMealUnits, data, info).cents;
        const credit = shelter.credit ? ` ${shelter.credit} · ${shelter.license}${shelter.updated ? ` · ${shelter.updated}` : ""}` : "";
        add(shelter.name || t("mappedShelter"), cents, { kind: "sleep", id: shelter.osmId },
          t("shelterNote", { hours: survival.sleep_hours }) + credit,
          shelter.sourceUrl ?? `https://www.openstreetmap.org/${shelter.osmId}`, shelter.source ?? t("townOsm"));
      }
    }
  }

  async function open(nextMode) {
    if (!context() || context().blocked || document.querySelector("dialog[open]")) return;
    mode = nextMode;
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
    document.querySelector("#accommodation-status").textContent = `${t("accommodationLoading")} ${
      t(`accommodationPhase.${accommodationProgress.phase}`)}${
      accommodationProgress.provider ? ` (${accommodationProgress.provider})` : ""} · ${
      t("accommodationElapsed", { seconds: accommodationProgress.elapsedSeconds })}`;
    if (accommodationPartial) document.querySelector("#accommodation-status").textContent += ` ${t("accommodationCached")}`;
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
      accommodationResult = result;
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
