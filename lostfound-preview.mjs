import { mount } from "./minigames/lost-found-ui.mjs";
import { difficulty } from "./minigames/lost-found.mjs";
import { setupPreviewHelp } from "./preview-help.mjs";
import { setupPreviewResonance } from "./arcane-resonance.mjs";

const language = new URLSearchParams(location.search).get("lang") === "fr" ? "fr" : "en";
const french = language === "fr";
document.documentElement.lang = language;
document.title = french ? "Objets trouvés - jeu 9" : "Lost and found - game 9";
document.querySelector("#preview-title").textContent = document.title;
document.querySelector("#preview-note").textContent = french
  ? "Cliquez sur Commencer, lisez la déclaration puis choisissez l’objet dessiné correspondant. Retrouvez tout en 15 secondes ; trois erreurs terminent l’enquête. Bac à sable fictif sans accès à votre sauvegarde ni récompense appliquée au voyage."
  : "Click Start, read the report, then choose the matching illustrated object. Find them all in 15 seconds; three mistakes end the investigation. Fictional sandbox with no save access or journey rewards.";
document.querySelector("#preview-level-label").textContent = french ? "Niveau de test" : "Test level";
const reset = document.querySelector("#preview-reset");
reset.textContent = french ? "Nouvelle enquête" : "New investigation";
const status = document.querySelector("#preview-result");
const levelSelect = document.querySelector("#preview-level");
const clueStyles = french
  ? ["descriptions directes", "descriptions reformulées", "indices indirects", "indices imagés", "énigmes avec exclusions"]
  : ["direct descriptions", "rephrased descriptions", "indirect clues", "figurative clues", "riddles with exclusions"];
let ui;
const resonance = setupPreviewResonance("lostfound", { language, onChange: restart });
function restart() {
  try {
    ui?.destroy();
    status.textContent = "";
    document.querySelector("#preview-error").textContent = "";
    const level = Number(levelSelect.value);
    const settings = difficulty(level);
    document.querySelector("#preview-difficulty").textContent = french
      ? `${settings.objectCount} objets · ${clueStyles[level]} · ${settings.timeLimitMs / 1000} secondes · ${settings.maxMistakes} erreurs maximum.`
      : `${settings.objectCount} objects · ${clueStyles[level]} · ${settings.timeLimitMs / 1000} seconds · ${settings.maxMistakes} mistakes maximum.`;
    ui = mount(document.querySelector("#lostfound-board"), {
      language, level, ...resonance.options,
      onFinish(result) {
        status.textContent = result.cancelled ? (french ? "Enquête annulée." : "Investigation cancelled.")
          : result.timedOut ? (french ? `Temps écoulé : ${result.score}/${result.maxScore} retrouvés.` : `Time is up: ${result.score}/${result.maxScore} found.`)
            : result.completed ? (french ? `Enquête réussie : ${result.score}/${result.maxScore}.` : `Investigation complete: ${result.score}/${result.maxScore}.`)
            : (french ? `Enquête terminée : ${result.score}/${result.maxScore}.` : `Investigation ended: ${result.score}/${result.maxScore}.`);
        if (result.completed) status.textContent += french
          ? ` Gains fictifs : ×${result.earningsMultiplier}.` : ` Fictional gains: ×${result.earningsMultiplier}.`;
      },
    });
  } catch (reason) {
    console.error("Unable to prepare lost-and-found playtest:", reason);
    document.querySelector("#preview-error").textContent = `${french ? "Erreur" : "Error"}: ${reason.message}`;
  }
}
reset.addEventListener("click", restart);
levelSelect.addEventListener("change", restart);
restart();
setupPreviewHelp();
