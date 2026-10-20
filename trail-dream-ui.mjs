import { trailDreamText, trailDreamVariant } from "./trail-dreams.mjs";
import { LOST_PLAYER_DREAM } from "./live-narrative.mjs";
import { setGenerating } from "./feedback.mjs";

export function setupTrailDream(t, { context, openTrail, narrative }) {
  const dialog = document.querySelector("#trail-dream-dialog");
  const wordingStatus = narrative ? document.createElement("p") : null;
  if (wordingStatus) {
    wordingStatus.id = "trail-dream-wording-status";
    wordingStatus.setAttribute("role", "status");
    document.querySelector("#trail-dream-continue").before(wordingStatus);
  }
  let seen = new Set(), pending = [], showing, wording, variant = 0, queued = false;
  function localize() {
    if (!dialog.open || !showing) return;
    const language = document.documentElement.lang === "en" ? "en" : "fr";
    document.querySelector("#trail-dream-title").textContent = t("trailDreamTitle");
    document.querySelector("#trail-dream-text").textContent = trailDreamText(showing, t, wording, language);
    if (wordingStatus) {
      wordingStatus.textContent = narrative.introductionStatus(
        context()?.state, LOST_PLAYER_DREAM, language, Boolean(wording), variant);
      setGenerating(wordingStatus, !wording && narrative.pending?.(context()?.state, LOST_PLAYER_DREAM));
    }
    document.querySelector("#trail-dream-journal").textContent = t("trailDreamJournal");
    document.querySelector("#trail-dream-continue").textContent = t("trailArrivalContinue");
  }
  function update() {
    const current = context();
    if (current && !current.state.ended) {
      if (current.state.trail && !current.state.trail.completed) narrative?.prefetch(current.state, [LOST_PLAYER_DREAM]);
      for (const check of current.state.trail?.dreams?.checks ?? []) {
        if (seen.has(check.checkMinutes)) continue;
        seen.add(check.checkMinutes);
        if (check.outcome === "guidance" && check.stage === current.state.trail.index) pending.push(check);
      }
    }
    localize();
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      const current = context();
      pending = pending.filter(check => check.stage === current?.state.trail?.index);
      if (!current || current.busy || current.state.ended || !pending.length ||
          document.querySelector("dialog[open]")) return;
      showing = pending.shift();
      variant = trailDreamVariant(current.state, showing);
      wording = narrative?.snapshot(current.state, LOST_PLAYER_DREAM, variant);
      dialog.showModal();
      localize();
      document.querySelector("#trail-dream-journal").focus();
    });
  }
  document.querySelector("#trail-dream-journal").addEventListener("click", () => {
    dialog.close();
    openTrail();
  });
  document.querySelector("#trail-dream-continue").addEventListener("click", () => {
    dialog.close();
    document.querySelector("#ascii-map").focus({ preventScroll: true });
  });
  dialog.addEventListener("cancel", event => event.preventDefault());
  new MutationObserver(update).observe(document.body, {
    subtree: true, attributes: true, attributeFilter: ["open"],
  });
  narrative?.subscribe(localize);
  return { update, reset(state) {
    seen = new Set((state?.trail?.dreams?.checks ?? []).map(check => check.checkMinutes));
    pending = [];
    showing = undefined;
    wording = undefined;
    dialog.close();
  } };
}
