import { CHOICE_RULES, choiceAvailable } from "./survival-choices.mjs";
import { tarotEventChance } from "./economy.mjs";
import { socialFailureChance } from "./pressures.mjs";
import { canEat } from "./survival.mjs";
import { atTrailTarget } from "./trail.mjs";
import { setFeedback } from "./feedback.mjs";

export function setupSurvivalChoices(t, { context, act }) {
  const dialog = document.querySelector("#survival-choices-dialog");
  function localize() {
    const current = context();
    for (const id of ["open-survival-choices", "town-survival-choices"]) {
      document.getElementById(id).disabled = !current || current.blocked;
    }
    if (!current) return;
    document.querySelector("#cell-action-context").textContent = t("cellActionContext", {
      terrain: t(`terrain.${current.cell.terrain}`),
      name: current.info.names.join(" · ") || t(`terrain.${current.cell.terrain}`),
    });
    document.querySelector("#cell-buy").disabled = current.blocked || !canEat(current.cell);
    document.querySelector("#cell-rest").disabled = current.blocked;
    document.querySelector("#cell-sleep").disabled = current.blocked;
    document.querySelector("#cell-music").disabled = current.blocked || current.cell.terrain !== "place";
    document.querySelector("#cell-clues").disabled = current.blocked || !atTrailTarget(current.state);
    document.querySelector("#survival-choice-save").textContent = current.saveStatus;
    for (const [kind, rule] of Object.entries(CHOICE_RULES)) {
      document.querySelector(`#choice-${kind}`).disabled =
        current.blocked || !choiceAvailable(kind, current.cell);
      document.querySelector(`#choice-${kind}-note`).textContent = t(`choiceNote.${kind}`, {
        minutes: rule.minutes, fatigue: rule.fatigue,
        risk: Math.round((kind === "beg"
          ? socialFailureChance(tarotEventChance(rule.failureChance, current.state, current.data), current.state)
          : tarotEventChance(rule.failureChance, current.state, current.data)) * 100),
        kcal: rule.foodKcal ?? 0, hours: rule.detentionHours ?? 0,
      });
    }
    const result = current.state.lastSurvivalChoice;
    const resultElement = document.querySelector("#survival-choice-result");
    resultElement.hidden = !result;
    setFeedback(resultElement, result ? ["food", "money"].includes(result.outcome) ? "success" : "failure" : "");
    resultElement.textContent = result
      ? `${t(`choice.${result.kind}`)} — ${t(`choiceResult.${result.outcome}`, {
        kcal: Math.round(result.foodKcal), money: (result.moneyCents / 100).toFixed(2),
        minutes: Math.round(result.minutes), hours: result.detentionMinutes / 60,
      })}` : "";
  }
  function open() {
    if (!context() || context().blocked || document.querySelector("dialog[open]")) return;
    document.querySelector("#survival-choice-error").textContent = "";
    document.querySelector("#survival-choice-error").hidden = true;
    dialog.showModal();
    localize();
  }
  document.querySelector("#open-survival-choices").addEventListener("click", open);
  document.querySelector("#town-survival-choices").addEventListener("click", () => {
    document.querySelector("#town-dialog").close();
    open();
  });
  for (const kind of Object.keys(CHOICE_RULES)) {
    document.querySelector(`#choice-${kind}`).addEventListener("click", () => {
      document.querySelector("#survival-choice-error").textContent = "";
      act(kind);
      localize();
      const error = document.querySelector("#survival-choice-error");
      error.hidden = !error.textContent;
      const feedback = error.hidden ? document.querySelector("#survival-choice-result") : error;
      if (!feedback.hidden && dialog.open) {
        feedback.focus({ preventScroll: true });
        feedback.scrollIntoView({ block: "nearest" });
      }
    });
  }
  for (const [id, target] of Object.entries({
    "cell-buy": "eat-travel", "cell-rest": "rest-travel", "cell-sleep": "sleep-travel",
    "cell-music": "open-music", "cell-clues": "open-trail",
  })) {
    document.getElementById(id).addEventListener("click", () => {
      dialog.close();
      document.getElementById(target).click();
    });
  }
  dialog.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.preventDefault();
      dialog.close();
    }
  });
  return { localize, reset() { dialog.close(); } };
}
