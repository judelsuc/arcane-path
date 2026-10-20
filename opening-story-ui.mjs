import { OPENING_STORY } from "./live-narrative.mjs";
import { setGenerating } from "./feedback.mjs";
import { translate } from "./i18n.mjs";

export function setupOpeningStory(t, {
  narrative, context, onContinue, onJournal, doc = document,
} = {}) {
  const dialog = doc.querySelector("#opening-story-dialog");
  const text = doc.querySelector("#opening-story-text");
  const status = doc.querySelector("#opening-story-status");
  const button = doc.querySelector("#opening-story-continue");
  let introductory = false;
  let journalKey;

  function localize() {
    const state = context();
    if (!state?.trail) return;
    if (state.trail.story) narrative.prefetch(state, [OPENING_STORY]);
    const language = doc.documentElement.lang === "en" ? "en" : "fr";
    const pending = narrative.pending?.(state, OPENING_STORY) === true;
    const generated = narrative.snapshot(state, OPENING_STORY);
    const wording = generated ?? Object.fromEntries(["fr", "en"].map(language => [
      language, translate(language, "openingStoryAuthored", {
        parent: state.trail.parentName,
        motive: translate(language, `parentStory.motive.${state.trail.story?.motive ?? "departure"}`),
      }),
    ]));
    if (!pending && onJournal) {
      const key = JSON.stringify([state.serverJourney?.id ?? state.startedAt, wording]);
      if (key !== journalKey) {
        journalKey = key;
        void Promise.resolve().then(() => onJournal(state, wording, Boolean(generated))).catch(error => {
          journalKey = undefined;
          console.error("Could not save biography in journal:", error);
          if (context()?.serverJourney?.id === state.serverJourney?.id) status.textContent = error.message;
        });
      }
    }
    text.hidden = pending;
    text.textContent = pending ? "" : wording[language];
    status.textContent = pending ? t("openingStoryWaiting", { name: state.name })
      : narrative.status(state, OPENING_STORY, language);
    setGenerating(status, pending);
    button.disabled = pending;
    doc.querySelector("#opening-story-title").textContent = t("openingStoryTitle");
    button.textContent = t(introductory ? "openingStoryBegin" : "windowHelpClose");
  }
  narrative.subscribe(localize);
  button.addEventListener("click", () => {
    if (button.disabled) return;
    dialog.close();
    if (introductory) onContinue();
    introductory = false;
  });
  dialog.addEventListener("cancel", event => {
    if (introductory || button.disabled) event.preventDefault();
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
