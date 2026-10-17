import { dailyTarotPending, tarotEventChance } from "./economy.mjs";
import { renderTarotCard } from "./tarot-cards.mjs";

export function setupDailyTarot(t, { context, acknowledge, pinTarot }) {
  const dialog = document.querySelector("#daily-tarot-dialog");
  const draw = document.querySelector("#daily-tarot-draw");
  const reveal = document.querySelector("#daily-tarot-reveal");
  const art = document.querySelector("#daily-tarot-art");
  const proceed = document.querySelector("#daily-tarot-continue");
  let queued = false;

  function localize() {
    const current = context();
    if (!current || !dialog.open) return;
    const { state, data, saveStatus } = current;
    const card = data.tarot.find(card => card.id === state.dailyCard);
    const language = document.documentElement.lang === "en" ? "en" : "fr";
    renderTarotCard(art, reveal.hidden ? null : card.id, reveal.hidden ? "" : card[language], t);
    if (!reveal.hidden) pinTarot?.(document.querySelector("#daily-tarot-journal"), state, "daily", data);
    document.querySelector("#daily-tarot-date").textContent = t("dailyTarotDate", { date: state.tarotDay });
    document.querySelector("#daily-tarot-name").textContent = card[language];
    document.querySelector("#daily-tarot-meaning").textContent = t(`tarotMeaning.${card.id}`);
    document.querySelector("#daily-tarot-events").textContent = t("birthTarotEvents", {
      factor: (tarotEventChance(0.1, state, data) / 0.1).toFixed(2),
    });
    document.querySelector("#daily-tarot-save").textContent = saveStatus;
  }
  function update() {
    localize();
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      const current = context();
      if (!current || current.busy || !dailyTarotPending(current.state) ||
          document.querySelector("dialog[open]")) return;
      draw.hidden = false;
      reveal.hidden = true;
      dialog.showModal();
      localize();
      draw.focus();
    });
  }
  draw.addEventListener("click", () => {
    draw.hidden = true;
    reveal.hidden = false;
    localize();
    proceed.focus();
  });
  proceed.addEventListener("click", () => {
    if (reveal.hidden) return;
    acknowledge();
    dialog.close();
    document.querySelector("#ascii-map").focus({ preventScroll: true });
  });
  dialog.addEventListener("cancel", event => event.preventDefault());
  new MutationObserver(update).observe(document.body, {
    subtree: true, attributes: true, attributeFilter: ["open"],
  });
  return { update, reset() { dialog.close(); } };
}
