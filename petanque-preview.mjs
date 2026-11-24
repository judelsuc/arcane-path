import { mount } from "./minigames/petanque-ui.mjs";
import { createPetanqueAudio } from "./minigames/petanque-audio.mjs";
import { setupPreviewHelp } from "./preview-help.mjs";
import { setupPreviewResonance } from "./arcane-resonance.mjs";

const language = new URLSearchParams(location.search).get("lang") === "fr" ? "fr" : "en";
const french = language === "fr";
document.documentElement.lang = language;
document.querySelector("#preview-title").textContent = french ? "Petanque au village - jeu 8" : "Village petanque - game 8";
document.querySelector("#preview-note").textContent = french
  ? "Trois boules par joueur contre l'ordinateur. Comptage petanque anime en fin de manche. Bac a sable fictif sans sauvegarde ni gain au voyage."
  : "Three boules each against the computer, with animated petanque scoring at the end. Fictional sandbox with no save access or journey earnings.";
document.querySelector("#preview-level-label").textContent = french ? "Niveau de test" : "Test level";
const reset = document.querySelector("#preview-reset");
reset.textContent = french ? "Nouvelle partie" : "New round";
const status = document.querySelector("#preview-result");
const sound = document.querySelector("#preview-sound");
let soundEnabled = true;
const audio = createPetanqueAudio({
  createAudio: source => new Audio(source),
  onError(message) { document.querySelector("#preview-error").textContent = message; },
});
audio.enable(soundEnabled);
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
const resonance = setupPreviewResonance("petanque", { language, onChange: restart });
function restart() {
  try {
    ui?.destroy();
    status.textContent = "";
    document.querySelector("#preview-error").textContent = "";
    ui = mount(document.querySelector("#petanque-board"), {
      language, level: Number(document.querySelector("#preview-level").value), audio, ...resonance.options,
      onFinish(result) {
        status.textContent = result.cancelled ? (french ? "Partie annulee." : "Round cancelled.")
          : result.timedOut ? (french ? "Temps ecoule : aucun point." : "Time is up: no points.")
            : french ? `Vous : ${result.score} - Ordinateur : ${result.opponentScore}`
              : `You: ${result.score} - Computer: ${result.opponentScore}`;
      },
    });
  } catch (reason) {
    console.error("Unable to prepare petanque playtest:", reason);
    document.querySelector("#preview-error").textContent = `Error: ${reason.message}`;
  }
}
reset.addEventListener("click", restart);
document.querySelector("#preview-level").addEventListener("change", restart);
restart();
setupPreviewHelp();
