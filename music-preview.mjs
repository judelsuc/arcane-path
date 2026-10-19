import { setupMusic } from "./music-ui.mjs";
import { beginBusking, settleBusking, musicDifficulty, musicMistakeLimit } from "./music.mjs";
import { createStreetMusicAudio } from "./street-music-audio.mjs";
import { startSurvival } from "./survival.mjs";
import { startEconomy } from "./economy.mjs";
import { beginPressures } from "./pressures.mjs";
import { setupButtonShortcuts } from "./button-shortcuts.mjs";
import { translate } from "./i18n.mjs";
import { setupPreviewHelp } from "./preview-help.mjs";
import { setupPreviewResonance } from "./arcane-resonance.mjs";

const language = new URLSearchParams(location.search).get("lang") === "fr" ? "fr" : "en";
document.documentElement.lang = language;
const t = (key, args) => translate(language, key, args);
const french = language === "fr";
let ui;
const resonanceMode = setupPreviewResonance("music", { language, onChange: () => ui?.localize() });
document.querySelector("#preview-note").textContent = french
  ? "Bac a sable fictif : aucun effet sur votre voyage. Son active. Espace ou bouton pour jouer ; H2/H3/H4 = tenir 2/3/4 temps. Suivez la lumiere et relachez au signal ^ (marge de 0,30 s avant/apres). Les cases vides sont des silences."
  : "Fictional sandbox: no effect on your saved journey. Sound is on. Use Space or the button; H2/H3/H4 = hold for 2/3/4 beats. Follow the growing light and release at ^ (0.30 s early/late allowed). Empty slots are rests.";
document.querySelector("#preview-level-label").textContent = french ? "Niveau de test" : "Test level";

try {
  const responses = await Promise.all(["./index.html", "./public/config.json", "./public/economy.json"]
    .map(async url => {
      const response = await fetch(url, { cache: "no-cache" });
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      return response;
    }));
  const [html, config, economy] = await Promise.all([
    responses[0].text(), responses[1].json(), responses[2].json(),
  ]);
  const template = new DOMParser().parseFromString(html, "text/html").querySelector("#music-dialog");
  if (!template) throw new Error("Music dialog template is missing.");
  document.body.append(document.importNode(template, true));
  for (const node of document.querySelectorAll("[data-i18n]")) node.textContent = t(node.dataset.i18n);
  const cell = { terrain: "place", countryCodes: ["FR"], pois: [] };
  const info = { terrain: "place", latitude: 44.54, longitude: 2.3 };
  const level = document.querySelector("#preview-level");
  let state;
  function reset() {
    state = beginPressures({ ...startEconomy(startSurvival(0, 0, Date.UTC(2026, 9, 18, 12),
      "balanced", config.survival), economy, () => 0), birthCard: "fool", dailyCard: "fool", reserveKcal: 1000,
      skills: { music: Number(level.value) * 60 } }, economy);
  }
  reset();
  const audio = createStreetMusicAudio({
    createAudio: url => new Audio(url),
    onError: message => { document.querySelector("#music-audio-status").textContent = message; },
  });
  audio.enable(true);
  ui = setupMusic(t, {
    resonance: () => resonanceMode.active,
    available: () => !state.ended && !state.performancePending,
    difficulty: () => musicDifficulty(state),
    mistakeLimit: () => musicMistakeLimit(state),
    audio,
    begin() {
      reset();
      state = beginBusking(state, cell, info, config.survival, economy, resonanceMode.options);
      return state.performancePending;
    },
    settle(hits, mistakes, cancelled) {
      state = settleBusking(state, hits, mistakes, cancelled);
      return state.lastEarningsCents;
    },
  });
  level.addEventListener("change", () => { reset(); ui.localize(); });
  setupButtonShortcuts(t);
  ui.localize();
  setupPreviewHelp();
} catch (reason) {
  console.error("Unable to prepare music playtest:", reason);
  document.querySelector("#preview-error").textContent = `${french ? "Erreur" : "Error"}: ${reason.message}`;
}
