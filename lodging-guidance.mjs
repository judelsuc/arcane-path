import { distanceMeters } from "./cell-content.mjs";

export function lodgingGuidance(place, state, info, t) {
  const east = place.col - state.col, north = state.row - place.row;
  const sectors = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
  const direction = t(`hintCompass.${sectors[(Math.round(Math.atan2(east, north) / (Math.PI / 4)) + 8) % 8]}`);
  return t(east || north ? "lodgingTarget" : "lodgingArrived", {
    name: place.name || t("mappedShelter"),
    meters: distanceMeters(info, place.latitude, place.longitude), direction,
    latitude: place.latitude.toFixed(6), longitude: place.longitude.toFixed(6),
  });
}
