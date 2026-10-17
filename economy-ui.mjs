import { mealOptions, marketPrice, shelters, tarotEventChance } from "./economy.mjs";
import { HOSPITALITY_RULES, hospitalityStatus, worshipPlaces } from "./hospitality.mjs";

export function setupEconomyUI(t, { context, act, resolveCountry }) {
  const dialog = document.querySelector("#economy-dialog");
  let mode = "eat";
  let resolving = false, countryError = "", generation = 0;
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
    const quote = marketPrice(cell, 1, data, info);
    document.querySelector("#economy-pricing").textContent = t(quote.estimated ? "priceEuropeanEstimate"
      : quote.reference ? "priceReference" : "priceMarket",
      { market: quote.market ?? "", date: data.pricing.date,
        delta: `${quote.variation >= 0 ? "+" : ""}${(quote.variation * 100).toFixed(2)}` });
    if (resolving) document.querySelector("#economy-pricing").textContent = t("priceCountryLoading");
    else if (countryError) document.querySelector("#economy-pricing").textContent += ` ${t("priceCountryError", { error: countryError })}`;
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
      const meals = mealOptions(cell, info, data);
      document.querySelector("#economy-empty").hidden = meals.length > 0;
      for (const meal of meals) {
        const restaurant = meal.kind === "restaurant";
        const title = restaurant ? t("mealAtRestaurant", { name: meal.venue.name ?? t("mappedRestaurant") })
          : meal.kind === "basic" ? t("basicMeal") : meal.name;
        let note = restaurant ? t("restaurantMealNote") : meal.kind === "basic" ? t("basicMealNote") : meal[language];
        if (meal.kind === "specialty" && meal.area) note = `${t(
          meal.scope === "national" ? "mealNationalOrigin" : "mealRegionalOrigin", { area: meal.area })} ${note}`;
        add(title, marketPrice(cell, meal.mealUnits, data, info).cents,
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
        feedback.tabIndex = -1;
        feedback.setAttribute("role", "status");
        feedback.setAttribute("aria-atomic", "true");
      }
      const result = state.hospitalityAttempts?.at(-1);
      if (result && result !== hospitality.attempt && !places.some(place =>
        hospitalityStatus(state, cell, place.osmId).attempt === result)) {
        document.querySelector("#economy-hospitality-result").textContent = hospitalityResult(result);
      }
      add(t("outdoorSleep"), 0, { kind: "sleep", id: null }, t("outdoorSleepNote"));
      for (const shelter of mapped) {
        const cents = shelter.free ? 0 : marketPrice(cell, data.rules.lodgingMealUnits, data, info).cents;
        add(shelter.name ?? t("mappedShelter"), cents, { kind: "sleep", id: shelter.osmId },
          t("shelterNote", { hours: survival.sleep_hours }),
          `https://www.openstreetmap.org/${shelter.osmId}`, t("townOsm"));
      }
    }
  }

  async function open(nextMode) {
    if (!context() || context().blocked || document.querySelector("dialog[open]")) ;
    mode = nextMode;
    dialog.dataset.activity = mode;
    document.querySelector("#economy-action-error").textContent = "";
    dialog.showModal();
    const request = ++generation;
    resolving = Boolean(resolveCountry);
    countryError = "";
    localize();
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
  }
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
  return { open, localize, reset() { generation++; resolving = false; countryError = ""; dialog.close(); }, money };
}
