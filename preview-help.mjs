import { setupWindowHelp } from "./window-help.mjs";

const SOURCES = [
  ".game-help-text", "#preview-note", "#preview-difficulty",
  '[data-i18n="cafeInstructions"]', '[data-i18n="cafeCost"]', "#cafe-skill",
  '[data-i18n="musicInstructions"]', '[data-i18n="musicCost"]', "#music-card-effect", "#music-skill",
  '[data-i18n="theftInstructions"]', '[data-i18n="theftCost"]',
].join(", ");

export function setupPreviewHelp(doc = globalThis.document) {
  return setupWindowHelp(doc, {
    sources: SOURCES, hosts: "main, #cafe-dialog, #music-dialog, #theft-dialog", contextual: false,
    anchor: host => host === doc.querySelector("main") ? host.querySelector("#preview-level") : host.querySelector("h2"),
    words: () => doc.documentElement.lang === "fr"
      ? { help: "Aide", close: "Fermer", timing: "Les chronomètres continuent pendant la consultation de l’aide." }
      : { help: "Help", close: "Close", timing: "Game timers keep running while help is open." },
  });
}
