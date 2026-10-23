import { drawJourneyMap } from "./journey-map.mjs";
import { objectiveCell } from "./quest-objectives.mjs";

export function renderQuestMap(host, state, targets, map, t) {
  const known = targets.map(target => ({ ...objectiveCell(target, map), name: target.name }))
    .filter(target => Number.isSafeInteger(target.col) && Number.isSafeInteger(target.row));
  if (!known.length) return;
  const canvas = document.createElement("canvas");
  canvas.className = "quest-overview-map";
  canvas.setAttribute("role", "img"); canvas.setAttribute("aria-label", t("quests.mapNote"));
  host.append(canvas);
  drawJourneyMap(canvas, { points: [{ col: state.col, row: state.row }], cellSizeMeters: map.cellSizeMeters,
    stops: [{ col: state.col, row: state.row, kind: "current" }, ...known.map(target => ({ ...target, kind: "quest" }))] }, t);
  const legend = document.createElement("p");
  legend.textContent = `${t("quests.mapNote")} 1. ${t("quests.you")} · ${known.map((target, index) =>
    `${index + 2}. ${target.name}`).join(" · ")}`;
  host.append(legend);
}
