import { dailyTarotPending } from "./economy.mjs";
import { journeyEventTextParts, eventPlaytestEnabled, JOURNEY_EVENTS } from "./journey-events.mjs";
import { journeyEventArt } from "./journey-event-art.mjs";

export function setupJourneyEvents(t, { context, acknowledge, pinEvent }) {
  const dialog = document.querySelector("#journey-event-dialog");
  const proceed = document.querySelector("#journey-event-continue");
  const testMode = eventPlaytestEnabled();
  const banner = testMode ? document.createElement("p") : null;
  if (banner) {
    banner.id = "event-playtest-banner";
    banner.setAttribute("role", "status");
    banner.style.cssText = "position:sticky;top:0;z-index:10;padding:12px;background:#493a20;color:#fff0c4;text-align:center";
    document.body.prepend(banner);
  }
  let queued = false;
  function localize() {
    if (banner) {
      banner.textContent = document.documentElement.lang === "en"
        ? "LOCAL EVENT PLAYTEST — event opportunity every 5 walking minutes (18× normal frequency). Tarot probabilities unchanged. Separate test save; your normal journey is untouched."
        : "TEST LOCAL DES ÉVÉNEMENTS — une occasion toutes les 5 minutes de marche (fréquence ×18). Probabilités du tarot inchangées. Sauvegarde de test séparée ; votre voyage normal reste intact.";
      const rules = dialog.querySelector(".window-help-text");
      if (rules) rules.textContent = t("journeyEventRules").replace("90", String(JOURNEY_EVENTS.intervalMinutes));
    }
    const current = context();
    const event = current?.state.events?.history.at(-1);
    if (!dialog.open || !event) return;
    const language = document.documentElement.lang === "en" ? "en" : "fr";
    const card = id => current.economy.tarot.find(c => c.id === id)[language];
    document.querySelector("#journey-event-text").replaceChildren(...journeyEventTextParts(event, t).map(part => {
      if (typeof part === "string") return part;
      const number = document.createElement("span");
      number.textContent = part.text;
      if (part.feedback) {
        number.dataset.feedback = part.feedback;
        number.style.fontWeight = "bold";
      }
      return number;
    }));
    document.querySelector("#journey-event-art").textContent = journeyEventArt(event.kind);
    document.querySelector("#journey-event-cards").textContent = t("journeyEventCards", {
      birth: card(event.birthCard), daily: card(event.dailyCard),
      chance: Math.round(event.occurrence * 100), positive: Math.round(event.positive * 100),
    });
    document.querySelector("#journey-event-save").textContent = current.saveStatus;
    if (pinEvent) {
      let pinned = dialog.querySelector("#journey-event-pin");
      if (!pinned) {
        pinned = document.createElement("div");
        pinned.id = "journey-event-pin";
        proceed.before(pinned);
      }
      pinEvent(pinned, current.state, current.economy);
    }
  }
  function update() {
    localize();
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      const current = context();
      if (!current || current.busy || !current.state.events?.pending ||
          dailyTarotPending(current.state) || document.querySelector("dialog[open]")) return;
      dialog.showModal();
      localize();
      proceed.focus();
    });
  }
  proceed.addEventListener("click", () => {
    if (!context()?.state.events?.pending) return;
    try {
      acknowledge();
      dialog.close();
      document.querySelector("#ascii-map").focus({ preventScroll: true });
    } catch (reason) {
      console.error("Unable to acknowledge journey event:", reason);
      document.querySelector("#journey-event-save").textContent = t("journeyEventError", { error: reason.message });
    }
  });
  dialog.addEventListener("cancel", event => event.preventDefault());
  new MutationObserver(update).observe(document.body, {
    subtree: true, attributes: true, attributeFilter: ["open"],
  });
  return { update, reset() { dialog.close(); } };
}
