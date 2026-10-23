import { hungerPercent } from "./survival.mjs";
import { isDeath } from "./death.mjs";
import { renderTarotCard } from "./tarot-cards.mjs";
import { healthValue } from "./health.mjs";
import { PLACEMENT_FACTORS } from "./pressures.mjs";

const WARNING_MESSAGES = {
  warning: ["hungerWarningTitle", "hungerWarningText"],
  healthWarning: ["healthWarningTitle", "healthWarningText"],
  fatigueWarning: ["fatigueWarningTitle", "fatigueWarningText"],
  sleepWarning: ["sleepWarningTitle", "sleepWarningText"],
};

export function createNeedsNotices(restoredState) {
  let hungerSeen = false, healthSeen = false, fatigueSeen = false, sleepSeen = false, endedSeen;
  let faintSeen = restoredState?.faints ?? 0;
  let placementSeen = restoredState?.pressures?.placements.length ?? 0;
  return {
    pending(state, config) {
      if (hungerPercent(state, config) < 75) hungerSeen = false;
      if (healthValue(state) > 25) healthSeen = false;
      if (state.fatigue < config.warning_percent) fatigueSeen = false;
      if (state.awakeHours < config.sleep_warning_hours) sleepSeen = false;
      if (state.ended) return state.ended !== "reunion" && state.ended !== endedSeen ? state.ended : null;
      if ((state.pressures?.placements.length ?? 0) > placementSeen) return "placed";
      if ((state.faints ?? 0) > faintSeen) return "fainted";
      if (!healthSeen && healthValue(state) <= 25) return "healthWarning";
      if (!hungerSeen && hungerPercent(state, config) >= 75) return "warning";
      if (!fatigueSeen && state.fatigue >= config.warning_percent) return "fatigueWarning";
      return !sleepSeen && state.awakeHours >= config.sleep_warning_hours ? "sleepWarning" : null;
    },
    shown(kind, state) {
      if (kind === "warning") hungerSeen = true;
      else if (kind === "healthWarning") healthSeen = true;
      else if (kind === "fatigueWarning") fatigueSeen = true;
      else if (kind === "sleepWarning") sleepSeen = true;
      else if (kind === "placed") {
        placementSeen = state.pressures.placements.length;
        faintSeen = state.faints ?? 0;
      }
      else if (kind === "fainted") faintSeen = state.faints;
      else endedSeen = kind;
    },
  };
}

export function placementReason(placement, t) {
  const trigger = placement.trigger;
  if (!trigger) return t("placementReasonLegacy");
  const factors = PLACEMENT_FACTORS.filter(key => trigger.factors[key] !== 0)
    .map(key => t("placementFactor", { cause: t(`placementCause.${key}`),
      points: `${trigger.factors[key] > 0 ? "+" : ""}${trigger.factors[key].toFixed(2)}` }));
  return t("placementReason", { before: trigger.vigilanceBefore.toFixed(2),
    minutes: trigger.minutes.toFixed(1), factor: Math.round(trigger.tarotFactor * 100),
    factors: factors.join(" ; ") });
}

export function setupNeedsNotices(t, { context }) {
  const dialog = document.querySelector("#needs-notice-dialog");
  const deathCard = document.querySelector("#needs-death-card");
  const fade = document.querySelector("#death-fade");
  let notices = createNeedsNotices(), kind, queued = false, deathAcknowledged = false;
  function localize() {
    if (!dialog.open || !kind) return;
    const current = context();
    if (!current) return;
    const { state, survival } = current;
    const dead = isDeath(state);
    deathCard.hidden = !dead;
    document.querySelector("#needs-death-retry").hidden = !dead;
    dialog.classList.toggle("death-notice", dead);
    if (dead) renderTarotCard(deathCard, "nameless", t("deathCardTitle"), t);
    const faint = state?.lastFaint;
    const placement = state?.pressures?.placements.at(-1);
    const placementText = placement ? `${placementReason(placement, t)} ${t("placementText", {
      count: state.pressures.placements.length, money: (placement.lostCents / 100).toFixed(2),
    })}${placement.recovery ? ` ${t("placementRecovery", { town: placement.recovery.town })}` : ""}` : "";
    const faintText = faint ? `${t(faint.reason === "sleep" ? "sleepFaintingText" : "faintingText")} ${t(faint.robbed ? "faintingRobbed" : "faintingSafe", {
      money: (faint.stolenCents / 100).toFixed(2), risk: Math.round(faint.chance * 100),
    })}` : "";
    const warning = WARNING_MESSAGES[kind];
    document.querySelector("#needs-notice-title").textContent = t(
      dead ? "deathTitle" : warning ? warning[0] : kind === "fainted" ? "faintingTitle"
        : kind === "placed" ? "placementTitle" : "needsEndedTitle");
    document.querySelector("#needs-notice-text").textContent = dead
      ? `${t(`deathCause.${state.ended}`)} ${t("needsEndedHelp")}` : warning
      ? t(warning[1], { threshold: survival.warning_percent, hours: survival.sleep_warning_hours })
      : kind === "fainted" ? faintText : kind === "placed" ? placementText
        : kind === "placement" ? `${placementText} ${t("journeyEnded.placement")} ${t("needsEndedHelp")}`
        : `${faint?.finishedMinutes === state.elapsedMinutes ? `${faintText} ` : ""}${t(`journeyEnded.${kind}`)} ${t("needsEndedHelp")}`;
    document.querySelector("#needs-notice-actions").hidden = !warning;
    document.querySelector("#needs-notice-cell").hidden = !["warning", "healthWarning"].includes(kind);
    document.querySelector("#needs-notice-rest").hidden = kind !== "fatigueWarning";
    document.querySelector("#needs-notice-sleep").hidden = !["fatigueWarning", "sleepWarning"].includes(kind);
  }
  function update() {
    const currentState = context()?.state;
    fade.classList.toggle("active", isDeath(currentState) && !deathAcknowledged);
    fade.setAttribute("aria-hidden", "true");
    if (dialog.open && isDeath(currentState) && !["health", "hunger", "fatigue", "sleep"].includes(kind)) {
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
      if (!pending || current.busy) return;
      if (isDeath(current.state) && !dialog.open) {
        for (const other of document.querySelectorAll("dialog[open]")) other.close();
      }
      if (document.querySelector("dialog[open]")) return;
      kind = pending;
      dialog.showModal();
      notices.shown(kind, current.state);
      localize();
    });
  }
  document.querySelector("#needs-notice-cell").addEventListener("click", () => {
    dialog.close();
    document.querySelector("#open-survival-choices").click();
  });
  for (const action of ["rest", "sleep"]) {
    document.querySelector(`#needs-notice-${action}`).addEventListener("click", () => {
      dialog.close();
      document.querySelector(`#${action}-travel`).click();
    });
  }
  document.querySelector("#needs-death-retry").addEventListener("click", () => {
    delete deathCard.dataset.card;
    localize();
  });
  dialog.addEventListener("close", () => {
    if (isDeath(context()?.state) && ["health", "hunger", "fatigue", "sleep"].includes(kind)) {
      deathAcknowledged = true;
      fade.classList.remove("active");
    }
  });
  new MutationObserver(update).observe(document.body, {
    subtree: true, attributes: true, attributeFilter: ["open"],
  });
  return { update, reset(restoredState) {
    notices = createNeedsNotices(restoredState);
    kind = undefined;
    deathAcknowledged = false;
    fade.classList.remove("active");
    dialog.close();
  } };
}
