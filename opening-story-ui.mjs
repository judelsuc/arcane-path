import { OPENING_STORY } from "./live-narrative.mjs";

export function setupOpeningStory(t, {
  narrative, context, onContinue, doc = document,
} = {}) {
  const dialog = doc.querySelector("#opening-story-dialog");
  const text = doc.querySelector("#opening-story-text");
  const status = doc.querySelector("#opening-story-status");
  const button = doc.querySelector("#opening-story-continue");
  let introductory = false;

  function localize() {
    const state = context();
    if (!state?.trail) return;
    const language = doc.documentElement.lang === "en" ? "en" : "fr";
    const generated = narrative.snapshot(state, OPENING_STORY);
    text.textContent = generated?.[language] ?? t("openingStoryAuthored", {
      parent: state.trail.parentName,
      motive: t(`parentStory.motive.${state.trail.story?.motive ?? "departure"}`),
    });
    status.textContent = generated ? t("openingStoryGenerated") :
      narrative.status(state, OPENING_STORY, language);
    doc.querySelector("#opening-story-title").textContent = t("openingStoryTitle");
    button.textContent = t(introductory ? "openingStoryBegin" : "windowHelpClose");
  }
  narrative.subscribe(() => { if (dialog.open) localize(); });
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
