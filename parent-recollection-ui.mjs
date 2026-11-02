import { parentRecollectionVisible, parentRecollectionText, parentIntuitionText } from "./parent-recollection.mjs";
import { trailReminder, citedTownDirections } from "./trail-ui.mjs";
import { citedTowns } from "./directions.mjs";
import { recognitionHint } from "./trail-search.mjs";
import { atTrailTarget } from "./trail.mjs";

export function parentRecollectionGuidance(state, info, t) {
  if (atTrailTarget(state)) return t("parentRecollection.investigate");
  const towns = citedTowns(state).filter(town => town.stage === state.trail.index);
  const town = towns.find(town => town.status === "known") ??
    towns.find(town => town.status === "suggested");
  if (town && Number.isFinite(info?.latitude) && Number.isFinite(info?.longitude)) {
    return [town.status === "suggested" ? parentIntuitionText(state, t) : "",
      `${t("parentRecollection.searchTown")} ${citedTownDirections(town, info, t)}`]
      .filter(Boolean).join("\n");
  }
  return [parentIntuitionText(state, t),
    t(recognitionHint(state) ? "parentRecollection.recognize" : "parentRecollection.search")]
    .filter(Boolean).join("\n");
}

export function setupParentRecollection(t, { context, openTrail }) {
  const notice = document.querySelector("#parent-recollection");
  const text = document.querySelector("#parent-recollection-text");
  const button = document.querySelector("#parent-recollection-open");
  button.addEventListener("click", openTrail);
  return {
    update() {
      const current = context(), state = current?.state;
      notice.hidden = !parentRecollectionVisible(state);
      if (notice.hidden) return;
      text.textContent = `${parentRecollectionText(state, t, trailReminder(state, t))}\n${
        parentRecollectionGuidance(state, current.info, t)}`;
      button.textContent = t("parentRecollection.open");
    },
  };
}
