import { CLOSING_STORY, closingSummary, closingStoryText } from "./closing-story.mjs";
import { setGenerating } from "./feedback.mjs";

export function setupClosingStory(t, { narrative, context, doc = document }) {
  const section = doc.querySelector("#closing-story");
  const text = doc.querySelector("#closing-story-text");
  const status = doc.querySelector("#closing-story-status");
  function localize() {
    const state = context();
    section.hidden = !closingSummary(state);
    if (section.hidden) {
      text.textContent = status.textContent = "";
      setGenerating(status, false);
      return;
    }
    const language = doc.documentElement.lang === "en" ? "en" : "fr";
    const generated = narrative.snapshot(state, CLOSING_STORY);
    text.textContent = closingStoryText(state, t, generated, language);
    status.textContent = generated ? t("closingStoryGenerated") : narrative.status(state, CLOSING_STORY, language);
    setGenerating(status, narrative.pending?.(state, CLOSING_STORY));
  }
  narrative.subscribe(localize);
  return {
    update() {
      const state = context();
      if (closingSummary(state)) narrative.prefetch(state, [CLOSING_STORY]);
      localize();
    },
  };
}
