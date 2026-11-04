import { mount } from "./minigames/sketch-ui.mjs";
import { setupPreviewHelp } from "./preview-help.mjs";
import { setupPreviewResonance } from "./arcane-resonance.mjs";

const language = new URLSearchParams(location.search).get("lang") === "fr" ? "fr" : "en";
const french = language === "fr";
document.documentElement.lang = language;
document.querySelector("#preview-title").textContent = french ? "Croquis de carte postale - jeu 7" : "Postcard sketch - game 7";
document.querySelector("#preview-note").textContent = french
  ? "Memorisez un petit motif, puis reproduisez-le sur la grille. Bac a sable fictif sans acces a votre sauvegarde ni gain applique au voyage."
  : "Memorize a small pattern, then reproduce it on the grid. Fictional sandbox with no save access or journey earnings.";
document.querySelector("#preview-level-label").textContent = french ? "Niveau de test" : "Test level";
const reset = document.querySelector("#preview-reset");
reset.textContent = french ? "Nouvelle partie" : "New round";
const status = document.querySelector("#preview-result");
let ui;
const resonance = setupPreviewResonance("sketch", { language, onChange: restart });
function restart() {
  try {
    ui?.destroy();
    status.textContent = "";
    document.querySelector("#preview-error").textContent = "";
    ui = mount(document.querySelector("#sketch-board"), {
      language, level: Number(document.querySelector("#preview-level").value), ...resonance.options,
      onFinish(result) {
        status.textContent = result.cancelled ? (french ? "Partie annulee." : "Round cancelled.")
          : `Score: ${result.score}/${result.maxScore}`;
      },
    });
  } catch (reason) {
    console.error("Unable to prepare sketch playtest:", reason);
    document.querySelector("#preview-error").textContent = `Error: ${reason.message}`;
  }
}
reset.addEventListener("click", restart);
document.querySelector("#preview-level").addEventListener("change", restart);
restart();
setupPreviewHelp();
