import { drawJourneyMap } from "./journey-map.mjs";
import { objectiveCell } from "./quest-objectives.mjs";

const terrainRequests = new WeakMap();

export function renderQuestMap(host, state, targets, map, t, loadTerrain) {
  const known = targets.map(target => ({ ...objectiveCell(target, map), name: target.name }))
    .filter(target => Number.isSafeInteger(target.col) && Number.isSafeInteger(target.row));
  if (!known.length) return;
  const canvas = document.createElement("canvas");
  canvas.className = "quest-overview-map";
  canvas.setAttribute("role", "img"); canvas.setAttribute("aria-label", t("quests.mapNote"));
  host.append(canvas);
  const view = { points: [{ col: state.col, row: state.row }], cellSizeMeters: map.cellSizeMeters,
    partial: true,
    stops: [{ col: state.col, row: state.row, kind: "current", label: t("quests.you") },
      ...known.map((target, index) => ({ ...target, kind: "quest", label: String(index + 1) }))] };
  drawJourneyMap(canvas, view, t);
  const legend = document.createElement("p");
  legend.textContent = `${t("quests.mapNote")} ${t("quests.you")} · ${known.map((target, index) =>
    `${index + 1}. ${target.name}`).join(" · ")}`;
  host.append(legend);
  const sectors = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
  for (const [index, target] of known.entries()) {
    const east = target.col - state.col, north = state.row - target.row;
    const direction = t(`hintCompass.${sectors[(Math.round(Math.atan2(east, north) / (Math.PI / 4)) + 8) % 8]}`);
    const line = document.createElement("p");
    line.textContent = t(east || north ? "quests.mapBearing" : "quests.mapHere", {
      number: index + 1, name: target.name, direction,
      distance: (Math.hypot(east, north) * map.cellSizeMeters / 1000).toFixed(2),
    });
    host.append(line);
  }
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  host.append(status);
  if (!loadTerrain) {
    status.textContent = t("quests.mapNoTerrain");
    return;
  }
  status.textContent = t("journalMapLoading");
  let requests = terrainRequests.get(loadTerrain);
  if (!requests) { requests = new Map(); terrainRequests.set(loadTerrain, requests); }
  const key = JSON.stringify(view.stops.map(({ col, row }) => [col, row]));
  let request = requests.get(key);
  if (!request) {
    request = Promise.resolve().then(() => loadTerrain(view));
    requests.set(key, request);
    if (requests.size > 8) requests.delete(requests.keys().next().value);
  }
  return request.then(terrain => {
    if (canvas.isConnected === false) return;
    drawJourneyMap(canvas, { ...view, terrain }, t);
    status.textContent = !terrain.cells.length ? t("quests.mapNoTerrain")
      : terrain.missing || terrain.sampled ? t("journalMapTerrainGaps") : t("journalMapCached");
  }).catch(error => {
    requests.delete(key);
    console.error("Quest map terrain unavailable:", error);
    if (canvas.isConnected !== false) status.textContent = t("quests.mapTerrainFailed", { error: error.message });
  });
}
