import { mount } from "./minigames/deliveries-ui.mjs";
import { createTheftAudio } from "./theft-audio.mjs";
import { setupPreviewHelp } from "./preview-help.mjs";
import { resolveResonance, setupPreviewResonance } from "./arcane-resonance.mjs";

const language = new URLSearchParams(location.search).get("lang") === "fr" ? "fr" : "en";
const french = language === "fr";
let ui;
const resonanceMode = setupPreviewResonance("deliveries", { language, onChange: restart });
document.documentElement.lang = language;
document.querySelector("#preview-title").textContent = french ? "Livraisons au village - jeu 4" : "Village deliveries - game 4";
document.querySelector("#preview-note").textContent = french
  ? "Bac a sable fictif, sans acces a votre sauvegarde. Seul le puzzle est teste ici : aucun gain ni cout n'est applique au voyage."
  : "Fictional sandbox, with no access to your save. This tests the puzzle only: no earnings or costs are applied to the journey.";
document.querySelector("#preview-level-label").textContent = french ? "Niveau de test" : "Test level";
const reset = document.querySelector("#preview-reset");
reset.textContent = french ? "Nouvelle partie" : "New round";
const status = document.querySelector("#preview-result");
const sound = document.querySelector("#preview-sound");
let soundEnabled = true;
const audio = createTheftAudio({
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
updateSound();
function restart() {
  try {
    ui?.destroy();
    status.textContent = "";
    document.querySelector("#preview-error").textContent = "";
    ui = mount(document.querySelector("#delivery-board"), {
      language,
      audio,
      resonance: resolveResonance("deliveries", resonanceMode.options),
      level: Number(document.querySelector("#preview-level").value),
      onFinish(result) {
        status.textContent = result.cancelled ? (french ? "Partie annulee." : "Round cancelled.")
          : `${french ? "Score" : "Score"}: ${result.score}/${result.maxScore}${
            result.earningsMultiplier > 1 ? ` · ${french ? "Gain réel" : "Actual earnings"} ×${result.earningsMultiplier}` : ""}`;
      },
    });
  } catch (reason) {
    console.error("Unable to prepare delivery playtest:", reason);
    document.querySelector("#preview-error").textContent = `${french ? "Erreur" : "Error"}: ${reason.message}`;
  }
}
reset.addEventListener("click", restart);
document.querySelector("#preview-level").addEventListener("change", restart);
restart();
setupPreviewHelp();
