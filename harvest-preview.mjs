import { mount } from "./minigames/harvest-ui.mjs";
import { createHarvestAudio } from "./minigames/harvest-audio.mjs";
import { setupPreviewHelp } from "./preview-help.mjs";
import { setupPreviewResonance } from "./arcane-resonance.mjs";

const language = new URLSearchParams(location.search).get("lang") === "fr" ? "fr" : "en";
const french = language === "fr";
document.documentElement.lang = language;
document.querySelector("#preview-title").textContent = french ? "Vendanges - jeu 5" : "Grape harvest - game 5";
document.querySelector("#preview-note").textContent = french
  ? "Bac a sable fictif sans acces a votre sauvegarde. Guidez chaque grappe en chute vers le panier de meme couleur avec les fleches. Aucun gain ni cout applique au voyage."
  : "Fictional sandbox with no access to your save. Steer each falling bunch into the same-coloured basket with the arrow keys. No earnings or costs applied to the journey.";
document.querySelector("#preview-level-label").textContent = french ? "Niveau de test" : "Test level";
const reset = document.querySelector("#preview-reset");
reset.textContent = french ? "Nouvelle partie" : "New round";
const status = document.querySelector("#preview-result");
const sound = document.querySelector("#preview-sound");
let soundEnabled = true;
const audio = createHarvestAudio({
  createAudio: source => new Audio(source),
  onError(message) { document.querySelector("#preview-error").textContent = message; },
});
audio.enable(soundEnabled);
audio.volume(0.35);
function updateSound() {
  sound.textContent = french ? (soundEnabled ? "Son : actif" : "Son : coupe")
    : (soundEnabled ? "Sound: on" : "Sound: off");
  sound.setAttribute("aria-pressed", String(soundEnabled));
}
sound.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  audio.enable(soundEnabled);
  updateSound();
});
document.addEventListener("visibilitychange", () => { if (document.hidden) audio.stop(); });
window.addEventListener("pagehide", () => audio.stop());
updateSound();
let ui;
const resonance = setupPreviewResonance("harvest", { language, onChange: restart });
function restart() {
  try {
    ui?.destroy();
    status.textContent = "";
    document.querySelector("#preview-error").textContent = "";
    ui = mount(document.querySelector("#harvest-board"), {
      language, level: Number(document.querySelector("#preview-level").value), audio, ...resonance.options,
      onFinish(result) {
        status.textContent = result.cancelled ? (french ? "Partie annulee." : "Round cancelled.")
          : `${french ? "Points payés" : "Paid points"}: ${result.score} · ${
            french ? "Grappes traitées" : "Bunches handled"}: ${result.maxScore} · ${
            french ? "Gain potentiel" : "Potential earnings"}: ${result.score} × ${result.earningsMultiplier}`;
      },
    });
  } catch (reason) {
    console.error("Unable to prepare harvest playtest:", reason);
    document.querySelector("#preview-error").textContent = `Error: ${reason.message}`;
  }
}
reset.addEventListener("click", restart);
document.querySelector("#preview-level").addEventListener("change", restart);
restart();
setupPreviewHelp();
