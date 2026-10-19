import { trailDreamText } from "./trail-dreams.mjs";

export function setupTrailDream(t, { context, openTrail }) {
  const dialog = document.querySelector("#trail-dream-dialog");
  let seen = new Set(), pending = [], showing, queued = false;
  function localize() {
    if (!dialog.open || !showing) return;
    document.querySelector("#trail-dream-title").textContent = t("trailDreamTitle");
    document.querySelector("#trail-dream-text").textContent = trailDreamText(showing, t);
    document.querySelector("#trail-dream-journal").textContent = t("trailDreamJournal");
    document.querySelector("#trail-dream-continue").textContent = t("trailArrivalContinue");
  }
  function update() {
    const current = context();
    if (current && !current.state.ended) {
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
  return { update, reset(state) {
    seen = new Set((state?.trail?.dreams?.checks ?? []).map(check => check.checkMinutes));
    pending = [];
    showing = undefined;
    dialog.close();
  } };
}
