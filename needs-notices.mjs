import { hungerPercent } from "./survival.mjs";

export function createNeedsNotices() {
  let hungerSeen = false, endedSeen;
  return {
    pending(state, config) {
      if (hungerPercent(state, config) < 75) hungerSeen = false;
      if (state.ended) return state.ended !== "reunion" && state.ended !== endedSeen ? state.ended : null;
      return !hungerSeen && hungerPercent(state, config) >= 75 ? "warning" : null;
    },
    shown(kind) {
      if (kind === "warning") hungerSeen = true;
      else endedSeen = kind;
    },
  };
}

export function setupNeedsNotices(t, { context }) {
  const dialog = document.querySelector("#needs-notice-dialog");
  let notices = createNeedsNotices(), kind, queued = false;
  function localize() {
    if (!dialog.open || !kind) return;
    document.querySelector("#needs-notice-title").textContent = t(
      kind === "warning" ? "hungerWarningTitle" : "needsEndedTitle");
    document.querySelector("#needs-notice-text").textContent = kind === "warning"
      ? t("hungerWarningText") : `${t(`journeyEnded.${kind}`)} ${t("needsEndedHelp")}`;
    document.querySelector("#needs-notice-actions").hidden = kind !== "warning";
  }
  function update() {
    localize();
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      const current = context();
      if (!current) return;
      const pending = notices.pending(current.state, current.survival);
      if (!pending || current.busy || document.querySelector("dialog[open]")) return;
      kind = pending;
      notices.shown(kind);
      dialog.showModal();
      localize();
    });
  }
  document.querySelector("#needs-notice-cell").addEventListener("click", () => {
    dialog.close();
    document.querySelector("#open-survival-choices").click();
  });
  new MutationObserver(update).observe(document.body, {
    subtree: true, attributes: true, attributeFilter: ["open"],
  });
  return { update, reset() { notices = createNeedsNotices(); kind = undefined; dialog.close(); } };
}
