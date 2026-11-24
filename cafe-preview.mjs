import { setupCafe } from "./cafe-ui.mjs";
import { beginCafe, settleCafe } from "./cafe.mjs";
import { startSurvival } from "./survival.mjs";
import { startEconomy } from "./economy.mjs";
import { beginPressures } from "./pressures.mjs";
import { setupButtonShortcuts } from "./button-shortcuts.mjs";
import { translate } from "./i18n.mjs";
import { createCafeAudio } from "./cafe-audio.mjs";
import { setupPreviewHelp } from "./preview-help.mjs";
import { setupPreviewResonance } from "./arcane-resonance.mjs";

const language = new URLSearchParams(location.search).get("lang") === "fr" ? "fr" : "en";
document.documentElement.lang = language;
const t = (key, args) => translate(language, key, args);
const french = language === "fr";
let ui;
const resonanceMode = setupPreviewResonance("cafe", { language, onChange: () => ui?.localize() });
document.querySelector("#preview-note").textContent = french
  ? "Bac a sable local : cafe fictif, aucun effet sur votre voyage sauvegarde. Choisissez un niveau, puis ouvrez le cafe. Composez les commandes avant la fin du delai ; les quantites comptent."
  : "Local sandbox: fictional cafe, no effect on your saved journey. Choose a level, then open the cafe. Assemble each order before its deadline; quantities matter.";
document.querySelector("#preview-level-label").textContent = french ? "Niveau de test (0 = debutant)" : "Test level (0 = beginner)";

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
  const template = new DOMParser().parseFromString(html, "text/html").querySelector("#cafe-dialog");
  if (!template) throw new Error("Cafe dialog template is missing.");
  document.body.append(document.importNode(template, true));
  for (const node of document.querySelectorAll("[data-i18n]")) node.textContent = t(node.dataset.i18n);
  const cell = { terrain: "place", countryCodes: ["FR"],
    pois: [{ osmId: "node/1", name: french ? "Cafe fictif - test uniquement" : "Fictional cafe - test only",
      tags: { amenity: "cafe" } }] };
  const info = { terrain: "place", latitude: 44.54, longitude: 2.3 };
  let state;
  const status = document.querySelector("#preview-status");
  const level = document.querySelector("#preview-level");
  function reset() {
    state = beginPressures({ ...startEconomy(startSurvival(0, 0, Date.UTC(2026, 9, 18, 12),
      "balanced", config.survival), economy, () => 0), birthCard: "fool", dailyCard: "fool", reserveKcal: 1000,
      skills: { cafe: Number(level.value) * 60 } }, economy);
  }
  reset();
  let soundEnabled = true, soundError = "";
  const soundControls = document.createElement("p");
  const soundToggle = document.createElement("button");
  soundToggle.id = "cafe-sound-toggle";
  soundToggle.type = "button";
  const soundCaption = document.createElement("span");
  soundToggle.append(soundCaption);
  const soundLabel = document.createElement("label");
  soundLabel.textContent = " Volume ";
  const soundVolume = document.createElement("input");
  soundVolume.type = "range";
  soundVolume.min = "0";
  soundVolume.max = "100";
  soundVolume.value = "35";
  soundLabel.append(soundVolume);
  soundControls.append(soundToggle, soundLabel);
  document.querySelector("#cafe-start").before(soundControls);
  function soundStatus() {
    const caption = t(soundEnabled ? "audioDisable" : "audioEnable");
    if (soundCaption.textContent !== caption) soundCaption.textContent = caption;
    soundToggle.setAttribute("aria-pressed", String(soundEnabled));
    document.querySelector("#cafe-audio-status").textContent = soundError
      ? t("cafeAudioError", { error: soundError }) : t(soundEnabled ? "cafeAudioOn" : "cafeAudioOff");
  }
  const audio = createCafeAudio({
    createAudio: url => new Audio(url),
    onError(error) { soundError = error; soundStatus(); },
  });
  audio.enable(soundEnabled);
  audio.volume(0.35);
  soundStatus();
  soundToggle.addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    audio.enable(soundEnabled);
    soundStatus();
  });
  soundVolume.addEventListener("input", () => audio.volume(Number(soundVolume.value) / 100));
  ui = setupCafe(t, {
    audio,
    resonance: () => resonanceMode.active,
    context: () => ({ state, cell, info, blocked: Boolean(state.ended || state.cafePending) }),
    begin(venue) {
      reset();
      state = beginCafe(state, cell, info, venue, config.survival, economy, resonanceMode.options);
      status.textContent = french ? "Service en cours..." : "Shift in progress...";
      return state.cafePending;
    },
    settle(served, mistakes, cancelled) {
      state = settleCafe(state, served, mistakes, cancelled);
      const result = state.lastCafe;
      status.textContent = t(result.cancelled ? "cafeCancelled" : "cafeReward", {
        ...result, money: (result.rewardCents / 100).toFixed(2),
      });
      return result;
    },
  });
  level.addEventListener("change", () => { reset(); ui.localize(); });
  setupButtonShortcuts(t);
  ui.localize();
  setupPreviewHelp();
} catch (reason) {
  console.error("Unable to prepare cafe playtest:", reason);
  document.querySelector("#preview-error").textContent = `${french ? "Erreur" : "Error"}: ${reason.message}`;
}
