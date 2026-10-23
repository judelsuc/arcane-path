import { mount } from "./minigames/lanterns-ui.mjs";
import { difficulty } from "./minigames/lanterns.mjs";
import { setupPreviewHelp } from "./preview-help.mjs";
import { setupPreviewResonance } from "./arcane-resonance.mjs";
import { createLanternAudio } from "./minigames/lanterns-audio.mjs";

const language = new URLSearchParams(location.search).get("lang") === "fr" ? "fr" : "en";
const french = language === "fr";
document.documentElement.lang = language;
document.title = french ? "La répétition des lanternes - jeu 10" : "Lantern rehearsal - game 10";
document.querySelector("#preview-title").textContent = document.title;
document.querySelector("#preview-note").textContent = french
  ? "Répétez 1 lanterne, puis la même suite avec 2, puis 3… Une erreur termine la partie. Objectif : 7 à 11 éléments selon le niveau. Bac à sable fictif sans accès à votre sauvegarde ni récompense appliquée au voyage."
  : "Repeat 1 lantern, then the same sequence with 2, then 3… One mistake ends the game. Reach 7 to 11 items depending on level. Fictional sandbox with no save access or journey rewards.";
document.querySelector("#preview-level-label").textContent = french ? "Niveau de test" : "Test level";
const reset = document.querySelector("#preview-reset");
reset.textContent = french ? "Nouvelle répétition" : "New rehearsal";
const levelSelect = document.querySelector("#preview-level");
const status = document.querySelector("#preview-result");
const sound = document.querySelector("#preview-sound");
const audio = createLanternAudio({
  createContext: () => new AudioContext(),
  onError: message => { document.querySelector("#preview-audio-error").textContent = message; },
});
let soundEnabled = true;
function updateSound() {
  audio.enable(soundEnabled);
  sound.textContent = french ? `Son : ${soundEnabled ? "activé" : "coupé"}` : `Sound: ${soundEnabled ? "on" : "off"}`;
  sound.setAttribute("aria-pressed", String(soundEnabled));
}
sound.addEventListener("click", () => { soundEnabled = !soundEnabled; updateSound(); });
updateSound();
let ui;
const resonance = setupPreviewResonance("lanterns", { language, onChange: restart });
function restart() {
  try {
    ui?.destroy();
    status.textContent = "";
    document.querySelector("#preview-error").textContent = "";
    const level = Number(levelSelect.value);
    const rules = difficulty(level);
    document.querySelector("#preview-difficulty").textContent = french
      ? `${rules.lanternCount} lanternes · manches de 1 à ${rules.length} éléments · ${rules.litMs} ms par éclairage.`
      : `${rules.lanternCount} lanterns · rounds from 1 to ${rules.length} items · ${rules.litMs} ms per flash.`;
    ui = mount(document.querySelector("#lanterns-board"), {
      language, level, audio, ...resonance.options,
      onFinish(result) {
        status.textContent = result.cancelled ? (french ? "Répétition annulée." : "Rehearsal cancelled.")
          : result.completed ? (french ? `Répétition réussie : ${result.score}/${result.maxScore}.` : `Rehearsal complete: ${result.score}/${result.maxScore}.`)
            : (french ? "Séquence incorrecte — partie terminée." : "Wrong sequence — game over.");
        if (result.completed) status.textContent += french
          ? ` Gains fictifs : ×${result.earningsMultiplier}.` : ` Fictional gains: ×${result.earningsMultiplier}.`;
      },
    });
  } catch (reason) {
    console.error("Unable to prepare lantern playtest:", reason);
    document.querySelector("#preview-error").textContent = `${french ? "Erreur" : "Error"}: ${reason.message}`;
  }
}
reset.addEventListener("click", restart);
levelSelect.addEventListener("change", restart);
restart();
setupPreviewHelp();
