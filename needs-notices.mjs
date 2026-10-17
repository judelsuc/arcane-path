import { hungerPercent } from "./survival.mjs";
import { isDeath } from "./death.mjs";
import { renderTarotCard } from "./tarot-cards.mjs";

export function createNeedsNotices() {
  let hungerSeen = false, endedSeen, faintSeen = 0, placementSeen = 0;
  return {
    pending(state, config) {
      if (hungerPercent(state, config) < 75) hungerSeen = false;
      if (state.ended) return state.ended !== "reunion" && state.ended !== endedSeen ? state.ended : null;
      if ((state.pressures?.placements.length ?? 0) > placementSeen) return "placed";
      if ((state.faints ?? 0) > faintSeen) return "fainted";
      return !hungerSeen && hungerPercent(state, config) >= 75 ? "warning" : null;
    },
    shown(kind, state) {
      if (kind === "warning") hungerSeen = true;
      else if (kind === "placed") {
        placementSeen = state.pressures.placements.length;
        faintSeen = state.faints ?? 0;
      }
      else if (kind === "fainted") faintSeen = state.faints;
      else endedSeen = kind;
    },
  };
}

export function setupNeedsNotices(t, { context }) {
  const dialog = document.querySelector("#needs-notice-dialog");
  const deathCard = document.querySelector("#needs-death-card");
  const fade = document.querySelector("#death-fade");
  let notices = createNeedsNotices(), kind, queued = false, deathAcknowledged = false;
  function localize() {
    if (!dialog.open || !kind) return;
    const state = context()?.state;
    const dead = isDeath(state);
    deathCard.hidden = !dead;
    document.querySelector("#needs-death-retry").hidden = !dead;
    dialog.classList.toggle("death-notice", dead);
    if (dead) renderTarotCard(deathCard, "nameless", t("deathCardTitle"), t);
    const faint = state?.lastFaint;
    const placement = state?.pressures?.placements.at(-1);
    const placementText = placement ? t("placementText", {
      count: state.pressures.placements.length, money: (placement.lostCents / 100).toFixed(2),
    }) : "";
    const faintText = faint ? `${t(faint.reason === "sleep" ? "sleepFaintingText" : "faintingText")} ${t(faint.robbed ? "faintingRobbed" : "faintingSafe", {
      money: (faint.stolenCents / 100).toFixed(2), risk: Math.round(faint.chance * 100),
    })}` : "";
    document.querySelector("#needs-notice-title").textContent = t(
      dead ? "deathTitle" : kind === "warning" ? "hungerWarningTitle" : kind === "fainted" ? "faintingTitle"
        : kind === "placed" ? "placementTitle" : "needsEndedTitle");
    document.querySelector("#needs-notice-text").textContent = dead
      ? `${t(`deathCause.${state.ended}`)} ${t("needsEndedHelp")}` : kind === "warning"
      ? t("hungerWarningText") : kind === "fainted" ? faintText : kind === "placed" ? placementText
        : kind === "placement" ? `${placementText} ${t("journeyEnded.placement")} ${t("needsEndedHelp")}`
        : `${faint?.finishedMinutes === state.elapsedMinutes ? `${faintText} ` : ""}${t(`journeyEnded.${kind}`)} ${t("needsEndedHelp")}`;
    document.querySelector("#needs-notice-actions").hidden = kind !== "warning";
  }
  function update() {
    const currentState = context()?.state;
    fade.classList.toggle("active", isDeath(currentState) && !deathAcknowledged);
    fade.setAttribute("aria-hidden", "true");
    if (dialog.open && isDeath(currentState) && !["hunger", "fatigue", "sleep"].includes(kind)) {
      kind = currentState.ended;
      notices.shown(kind, currentState);
    }
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
  document.querySelector("#needs-death-retry").addEventListener("click", () => {
    delete deathCard.dataset.card;
    localize();
  });
  dialog.addEventListener("close", () => {
    if (isDeath(context()?.state) && ["hunger", "fatigue", "sleep"].includes(kind)) {
      deathAcknowledged = true;
      fade.classList.remove("active");
    }
  });
  new MutationObserver(update).observe(document.body, {
    subtree: true, attributes: true, attributeFilter: ["open"],
  });
  return { update, reset() {
    notices = createNeedsNotices();
    kind = undefined;
    deathAcknowledged = false;
    fade.classList.remove("active");
    dialog.close();
  } };
}
