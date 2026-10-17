import { localMeals, marketPrice, shelters } from "./economy.mjs";

export function setupEconomyUI(t, { context, act, resolveCountry }) {
  const dialog = document.querySelector("#economy-dialog");
  let mode = "eat";
  let resolving = false, countryError = "", generation = 0;
  const money = cents => `${(cents / 100).toFixed(2)} ${t("gameMoney")}`;

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
    const add = (title, cents, run, note, url, sourceName) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `${title} — ${money(cents)}`;
      button.disabled = resolving || state.ended !== null || state.walletCents < cents || current.blocked;
      button.addEventListener("click", () => {
        if (act(run)) {
          dialog.close();
          document.querySelector("#ascii-map").focus({ preventScroll: true });
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
    };
    if (mode === "eat") {
      const meals = cell.terrain === "place" ? localMeals(info, data) : [];
      document.querySelector("#economy-empty").hidden = meals.length > 0;
      for (const meal of meals) add(meal.name, marketPrice(cell, meal.mealUnits, data, info).cents,
        { kind: "meal", id: meal.id },
        `${meal[language]} ${t("mealEffect", { kcal: meal.reserveKcal, minutes: survival.meal_minutes })}`,
        meal.source, meal.publisher);
    } else {
      document.querySelector("#economy-empty").hidden = true;
      add(t("outdoorSleep"), 0, { kind: "sleep", id: null }, t("outdoorSleepNote"));
      for (const shelter of shelters(cell)) {
        const cents = shelter.free ? 0 : marketPrice(cell, data.rules.lodgingMealUnits, data, info).cents;
        add(shelter.name ?? t("mappedShelter"), cents, { kind: "sleep", id: shelter.osmId },
          t("shelterNote", { hours: survival.sleep_hours }),
          `https://www.openstreetmap.org/${shelter.osmId}`, t("townOsm"));
      }
    }
  }

  async function open(nextMode) {
    if (!context() || context().blocked || document.querySelector("dialog[open]")) return;
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
