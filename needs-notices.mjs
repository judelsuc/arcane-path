import { hungerPercent } from "./survival.mjs";

export function createNeedsNotices() {
  let hungerSeen = false, endedSeen, faintSeen = 0;
  return {
    pending(state, config) {
      if (hungerPercent(state, config) < 75) hungerSeen = false;
      if (state.ended) return state.ended !== "reunion" && state.ended !== endedSeen ? state.ended : null;
      if ((state.faints ?? 0) > faintSeen) return "fainted";
      return !hungerSeen && hungerPercent(state, config) >= 75 ? "warning" : null;
    },
    shown(kind, state) {
      if (kind === "warning") hungerSeen = true;
      else if (kind === "fainted") faintSeen = state.faints;
      else endedSeen = kind;
    },
  };
}

export function setupNeedsNotices(t, { context }) {
  const dialog = document.querySelector("#needs-notice-dialog");
  let notices = createNeedsNotices(), kind, queued = false;
  function localize() {
    if (!dialog.open || !kind) return;
    const state = context()?.state;
    const faint = state?.lastFaint;
    const faintText = faint ? `${t(faint.reason === "sleep" ? "sleepFaintingText" : "faintingText")} ${t(faint.robbed ? "faintingRobbed" : "faintingSafe", {
      money: (faint.stolenCents / 100).toFixed(2), risk: Math.round(faint.chance * 100),
    })}` : "";
    document.querySelector("#needs-notice-title").textContent = t(
      kind === "warning" ? "hungerWarningTitle" : kind === "fainted" ? "faintingTitle" : "needsEndedTitle");
    document.querySelector("#needs-notice-text").textContent = kind === "warning"
      ? t("hungerWarningText") : kind === "fainted" ? faintText
        : `${faint?.finishedMinutes === state.elapsedMinutes ? `${faintText} ` : ""}${t(`journeyEnded.${kind}`)} ${t("needsEndedHelp")}`;
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
      notices.shown(kind, current.state);
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
