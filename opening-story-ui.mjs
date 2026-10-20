import { OPENING_STORY } from "./live-narrative.mjs";
import { setGenerating } from "./feedback.mjs";

export function setupOpeningStory(t, {
  narrative, context, onContinue, onNameConsent, onJournal, doc = document,
} = {}) {
  const dialog = doc.querySelector("#opening-story-dialog");
  const text = doc.querySelector("#opening-story-text");
  const status = doc.querySelector("#opening-story-status");
  const button = doc.querySelector("#opening-story-continue");
  const regenerate = doc.querySelector("#opening-story-regenerate");
  let introductory = false;
  let journalKey;

  function localize() {
    const state = context();
    if (!state?.trail) return;
    const language = doc.documentElement.lang === "en" ? "en" : "fr";
    const generated = narrative.snapshot(state, OPENING_STORY);
    if (generated && onJournal) {
      const key = JSON.stringify([state.serverJourney?.id ?? state.startedAt, generated]);
      if (key !== journalKey) {
        journalKey = key;
        void Promise.resolve().then(() => onJournal(state, generated)).catch(error => {
          journalKey = undefined;
          console.error("Could not save biography in journal:", error);
          if (context()?.serverJourney?.id === state.serverJourney?.id) status.textContent = error.message;
        });
      }
    }
    text.textContent = generated?.[language] ?? t("openingStoryAuthored", {
      parent: state.trail.parentName,
      motive: t(`parentStory.motive.${state.trail.story?.motive ?? "departure"}`),
    });
    status.textContent = narrative.status(state, OPENING_STORY, language);
    setGenerating(status, narrative.pending?.(state, OPENING_STORY));
    regenerate.textContent = t("openingStoryRegenerate");
    regenerate.disabled = !onNameConsent || !state.serverJourney?.id || !state.journalAccess ||
      narrative.pending?.(state, OPENING_STORY) === true;
    doc.querySelector("#opening-story-title").textContent = t("openingStoryTitle");
    button.textContent = t(introductory ? "openingStoryBegin" : "windowHelpClose");
  }
  narrative.subscribe(localize);
  regenerate.addEventListener("click", () => {
    const state = context();
    if (regenerate.disabled || !state ||
        !confirm(t("openingStoryRegenerateConfirm", { name: state.name }))) return;
    try {
      const consented = onNameConsent();
      narrative.regenerateOpening(consented);
      localize();
    } catch (error) {
      console.error("Opening biography regeneration failed:", error);
      status.textContent = error.message;
    }
  });
  button.addEventListener("click", () => {
    dialog.close();
    if (introductory) onContinue();
    introductory = false;
  });
  dialog.addEventListener("cancel", event => {
    if (introductory) event.preventDefault();
  });
  doc.querySelector("#read-opening-story").addEventListener("click", () => open(false));
  function prepare() {
    const state = context();
    if (state?.trail?.story) narrative.prefetch(state, [OPENING_STORY]);
  }
  function open(first = true) {
    introductory = first;
    prepare();
    localize();
    if (!dialog.open) dialog.showModal();
    button.focus();
  }
  return { prepare, open, localize,
    reset() { introductory = false; if (dialog.open) dialog.close(); } };
}
