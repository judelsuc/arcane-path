import { mount } from "./minigames/workshop-ui.mjs";
import { createTheftAudio } from "./theft-audio.mjs";
import { setupPreviewHelp } from "./preview-help.mjs";
import { setupPreviewResonance } from "./arcane-resonance.mjs";

const language = new URLSearchParams(location.search).get("lang") === "fr" ? "fr" : "en";
const french = language === "fr";
document.documentElement.lang = language;
document.querySelector("#preview-title").textContent = french ? "Atelier velo - jeu 6" : "Bicycle workshop - game 6";
document.querySelector("#preview-note").textContent = french
  ? "Reconstituez le velo modele avec les bonnes pieces, couleurs et tailles avant la fin du temps. Bac a sable fictif : aucun acces a votre sauvegarde ni gain applique au voyage."
  : "Rebuild the model bicycle with matching parts, colours and sizes before time runs out. Fictional sandbox: no save access or journey earnings.";
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
document.addEventListener("visibilitychange", () => { if (document.hidden) audio.stop(); });
window.addEventListener("pagehide", () => audio.stop());
updateSound();
let ui;
const resonance = setupPreviewResonance("workshop", { language, onChange: restart });
function restart() {
  try {
    ui?.destroy();
    status.textContent = "";
    document.querySelector("#preview-error").textContent = "";
    ui = mount(document.querySelector("#workshop-board"), {
      language, level: Number(document.querySelector("#preview-level").value), audio, ...resonance.options,
      onFinish(result) {
        status.textContent = result.cancelled ? (french ? "Partie annulee." : "Round cancelled.")
          : `Score: ${result.score}/${result.maxScore}`;
      },
    });
  } catch (reason) {
    console.error("Unable to prepare workshop playtest:", reason);
    document.querySelector("#preview-error").textContent = `Error: ${reason.message}`;
  }
}
reset.addEventListener("click", restart);
document.querySelector("#preview-level").addEventListener("change", restart);
restart();
setupPreviewHelp();
