export const SNAPSHOT_VERSION = 1;
import { mapAppearance } from "./map-appearance.mjs";
const NUMBERS = ["col", "row", "elapsedMinutes", "distanceMeters", "health", "fatigue",
  "reserveKcal", "awakeHours", "walletCents"];
const identifier = value => typeof value === "string" && /^[a-z][a-z0-9-]{0,79}$/.test(value);

export function diagnosticSnapshot(state, {
  doc = document, viewport = globalThis, build = { commit: "development", version: 1 },
  capturedAt = new Date().toISOString(),
} = {}) {
  const game = {};
  for (const key of NUMBERS) if (Number.isFinite(state?.[key])) game[key] = state[key];
  if (state?.ended !== undefined) game.ended = state.ended === null ? null
    : ["sleep", "hunger", "health", "reunited", "abandoned"].includes(state.ended) ? state.ended : "other";
  const dialogs = [...doc.querySelectorAll("dialog[open]")].map(node => node.id)
    .filter(identifier).slice(0, 8);
  const screen = ["title-screen", "journey-setup", "travel-controls"]
    .find(id => { const node = doc.getElementById(id); return node && !node.hidden &&
      node.getBoundingClientRect().width > 0; }) ?? "game";
  return {
    version: SNAPSHOT_VERSION, capturedAt,
    build: { commit: build.commit, version: build.version },
    language: doc.documentElement.lang === "en" ? "en" : "fr",
    viewport: {
      width: Math.round(viewport.innerWidth), height: Math.round(viewport.innerHeight),
      pixelRatio: viewport.devicePixelRatio || 1,
      scrollX: Math.round(viewport.scrollX || 0), scrollY: Math.round(viewport.scrollY || 0),
    },
    appearance: mapAppearance(),
    visible: { screen, dialogs },
    game,
  };
}
