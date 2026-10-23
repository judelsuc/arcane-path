import { mount } from "./minigames/bookshop-ui.mjs";
import { difficulty } from "./minigames/bookshop.mjs";
import { setupPreviewHelp } from "./preview-help.mjs";
import { setupPreviewResonance } from "./arcane-resonance.mjs";
import { createBookshopAudio } from "./minigames/bookshop-audio.mjs";

const language = new URLSearchParams(location.search).get("lang") === "fr" ? "fr" : "en";
const french = language === "fr";
document.documentElement.lang = language;
document.title = french ? "Livres en place - jeu 11" : "Bookshop sorting - game 11";
document.querySelector("#preview-title").textContent = document.title;
document.querySelector("#preview-note").textContent = french
  ? "Déduisez le rayon grâce au thème et rangez les titres par ordre alphabétique, articles inclus. Répondez ensuite aux clients. Classiques réels et couvertures originales, sans images d’éditeurs téléchargées. Aucun accès à votre sauvegarde ni récompense appliquée au voyage."
  : "Infer the shelf from the theme and sort titles alphabetically, including articles. Then answer customers’ requests. Real classics with original covers, not downloaded publisher images. No save access or journey rewards.";
document.querySelector("#preview-level-label").textContent = french ? "Niveau de test" : "Test level";
const reset = document.querySelector("#preview-reset");
reset.textContent = french ? "Nouveau service" : "New shift";
const levelSelect = document.querySelector("#preview-level");
const status = document.querySelector("#preview-result");
const sound = document.querySelector("#preview-sound");
const audio = createBookshopAudio({
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
document.addEventListener("visibilitychange", () => { if (document.hidden) audio.stop(); });
window.addEventListener("pagehide", () => audio.stop());
updateSound();
let ui;
const resonance = setupPreviewResonance("bookshop", { language, onChange: restart });
function restart() {
  try {
    ui?.destroy();
    status.textContent = "";
    document.querySelector("#preview-error").textContent = "";
    const level = Number(levelSelect.value);
    const rules = difficulty(level);
    document.querySelector("#preview-difficulty").textContent = french
      ? `${rules.shelves * rules.slots} livres · ${rules.requests} clients · ${rules.durationMs / 1000} secondes · ${rules.mistakeLimit} erreurs maximum.`
      : `${rules.shelves * rules.slots} books · ${rules.requests} customers · ${rules.durationMs / 1000} seconds · ${rules.mistakeLimit} mistakes maximum.`;
    ui = mount(document.querySelector("#bookshop-board"), {
      language, level, audio, ...resonance.options,
      onFinish(result) {
        status.textContent = result.cancelled ? (french ? "Service annulé." : "Shift cancelled.")
          : result.completed ? (french ? `Service terminé : ${result.score}/${result.maxScore}.` : `Shift complete: ${result.score}/${result.maxScore}.`)
            : (french ? "Service interrompu, aucune récompense." : "Shift ended, no reward.");
        if (result.completed) status.textContent += french
          ? ` Gains fictifs : ×${result.earningsMultiplier}.` : ` Fictional gains: ×${result.earningsMultiplier}.`;
      },
    });
  } catch (reason) {
    console.error("Unable to prepare bookshop playtest:", reason);
    document.querySelector("#preview-error").textContent = `${french ? "Erreur" : "Error"}: ${reason.message}`;
  }
}
reset.addEventListener("click", restart);
levelSelect.addEventListener("change", restart);
restart();
setupPreviewHelp();
