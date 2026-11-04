import { setupTheft } from "./theft-ui.mjs";
import { beginTheft, settleTheft } from "./survival-choices.mjs";
import { startSurvival } from "./survival.mjs";
import { startEconomy } from "./economy.mjs";
import { beginPressures } from "./pressures.mjs";
import { setupButtonShortcuts } from "./button-shortcuts.mjs";
import { translate } from "./i18n.mjs";
import { createTheftAudio } from "./theft-audio.mjs";
import { setupPreviewHelp } from "./preview-help.mjs";
import { setupPreviewResonance } from "./arcane-resonance.mjs";

const language = new URLSearchParams(location.search).get("lang") === "fr" ? "fr" : "en";
const french = language === "fr";
let ui;
const resonanceMode = setupPreviewResonance("theft", { language, onChange: () => ui?.localize() });
document.documentElement.lang = language;
const t = (key, args) => translate(language, key, args);
document.querySelector("#preview-level-label").textContent = french ? "Difficulte de test" : "Test difficulty";
document.querySelector("#preview-normal").textContent = french ? "Normal" : "Normal";
document.querySelector("#preview-hard").textContent = french ? "Difficile" : "Hard";
const level = document.querySelector("#preview-level");
function showDifficulty() {
  document.querySelector("#preview-difficulty").textContent = level.value === "hard"
    ? (french ? "Difficile : curseur 50 % plus rapide, zone de 7 a 16 %. Toujours 9 secondes et un seul geste."
      : "Hard: 50% faster cursor, 7–16% target width. Still 9 seconds and one grab.")
    : (french ? "Normal : zone de 12 a 28 %, aller-retour en 1,8 seconde."
      : "Normal: 12–28% target width, 1.8-second cursor cycle.");
}
level.addEventListener("change", showDifficulty);
showDifficulty();
document.querySelector("#preview-title").textContent = french ? "Vol de nourriture - jeu 3" : "Stealing food - game 3";
document.querySelector("#preview-note").textContent = french
  ? "Bac a sable fictif : aucun effet sur votre voyage. Un seul geste : appuyez sur Espace ou cliquez dans la zone verte. Sa position et sa largeur varient a chaque essai."
  : "Fictional sandbox: no effect on your saved journey. One grab: press Space or click inside the green zone. Its position and width vary each attempt.";

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
  const template = new DOMParser().parseFromString(html, "text/html").querySelector("#theft-dialog");
  if (!template) throw new Error("Theft dialog template is missing.");
  document.body.append(document.importNode(template, true));
  for (const node of document.querySelectorAll("[data-i18n]")) node.textContent = t(node.dataset.i18n);
  const cell = { terrain: "place", countryCodes: ["FR"],
    pois: [{ osmId: "node/1", name: "Fictional sandbox bakery", tags: { shop: "bakery" } }] };
  const info = { terrain: "place", latitude: 44.54, longitude: 2.3 };
  let state;
  function reset() {
    state = beginPressures({ ...startEconomy(startSurvival(0, 0, Date.UTC(2026, 9, 18, 12),
      "balanced", config.survival), economy, () => 0), birthCard: "fool", dailyCard: "fool",
      reserveKcal: 900 }, economy);
  }
  reset();
  const audio = createTheftAudio({
    createAudio: url => new Audio(url),
    onError(error) {
      document.querySelector("#theft-audio-status").textContent = error ? t("theftAudioError", { error }) : "";
    },
  });
  audio.enable(true);
  const soundButton = document.createElement("button");
  soundButton.type = "button";
  let soundEnabled = true;
  const soundCaption = document.createElement("span");
  soundCaption.textContent = t("audioDisable");
  soundButton.append(soundCaption);
  soundButton.addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    audio.enable(soundEnabled);
    soundCaption.textContent = t(soundEnabled ? "audioDisable" : "audioEnable");
  });
  document.querySelector("#theft-start").before(soundButton);
  ui = setupTheft(t, {
    audio,
    resonance: () => resonanceMode.active,
    difficulty: () => level.value,
    available: () => !state.ended && !state.theftPending,
    begin() {
      reset();
      state = beginTheft(state, cell, info, config.survival, economy, () => 0.99,
        resonanceMode.options);
      return state.theftPending;
    },
    settle(outcome) {
      state = settleTheft(state, outcome, info, config.survival, economy, () => 0.99);
      return state.lastSurvivalChoice;
    },
  });
  const open = document.querySelector("#open-theft");
  open.addEventListener("click", ui.open);
  open.disabled = false;
  setupButtonShortcuts(t);
  ui.localize();
  setupPreviewHelp();
} catch (reason) {
  console.error("Unable to prepare theft playtest:", reason);
  document.querySelector("#preview-error").textContent = `${french ? "Erreur" : "Error"}: ${reason.message}`;
}
