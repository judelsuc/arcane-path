import { carriedPlayerIcon } from "./legend-rewards.mjs";

export function isDeath(state) {
  return ["health", "hunger", "fatigue", "sleep"].includes(state?.ended);
}

export function renderJourneyMarker(tile, state, t) {
  const dead = isDeath(state);
  tile.textContent = dead ? "†" : "@";
  tile.classList.toggle("tile--dead", dead);
  tile.setAttribute("data-player-icon", dead ? "default" : carriedPlayerIcon(state));
  tile.setAttribute("aria-current", "location");
  tile.setAttribute("aria-label", t(dead ? "deathMarker" : "playerMarker"));
}
