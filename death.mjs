export function isDeath(state) {
  return ["hunger", "fatigue", "sleep"].includes(state?.ended);
}

export function renderJourneyMarker(tile, state, t) {
  const dead = isDeath(state);
  tile.textContent = dead ? "†" : "@";
  tile.classList.toggle("tile--dead", dead);
  tile.setAttribute("aria-current", "location");
  if (dead) tile.setAttribute("aria-label", t("deathMarker"));
}
