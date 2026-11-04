import { mount } from "./minigames/market-ui.mjs";
import { difficulty } from "./minigames/market.mjs";
import { createMarketAudio } from "./minigames/market-audio.mjs";
import { setupPreviewHelp } from "./preview-help.mjs";
import { setupPreviewResonance } from "./arcane-resonance.mjs";

const language = new URLSearchParams(location.search).get("lang") === "fr" ? "fr" : "en";
const french = language === "fr";
document.documentElement.lang = language;
document.title = french ? "Étal du marché - jeu 12" : "Market stall - game 12";
document.querySelector("#preview-title").textContent = document.title;
document.querySelector("#preview-note").textContent = french
  ? "Préparez le panier demandé, puis rendez la monnaie avec le fond de caisse limité : il dure tout le service et les paiements le remplissent. Choisissez vos pièces ou composez un montant en euros (5,05 par exemple). Demandez un appoint au client pour faciliter la monnaie ; sa bourse est limitée et il peut refuser. Trois erreurs ou le temps écoulé terminent le service. Exercice fictif, sans achat réel ni accès à votre sauvegarde."
  : "Pack the requested basket, then give change from a limited drawer that lasts the whole shift and receives customer payments. Choose your coins or compose an amount in euros (for example 5.05). Ask the customer for extra coins to simplify change; their purse is limited and they may refuse. Three mistakes or the deadline end the shift. Fictional exercise with no real purchases or save access.";
document.querySelector("#preview-level-label").textContent = french ? "Niveau de test" : "Test level";
const reset = document.querySelector("#preview-reset");
reset.textContent = french ? "Nouveau service" : "New shift";
const levels = document.querySelector("#preview-level");
const status = document.querySelector("#preview-result");
const sound = document.querySelector("#preview-sound");
const audio = createMarketAudio({
  createContext: () => new AudioContext(),
  onError: message => { document.querySelector("#preview-audio-error").textContent = message; },
});
let enabled = true;
function updateSound() {
  audio.enable(enabled);
  sound.textContent = french ? `Son : ${enabled ? "activé" : "coupé"}` : `Sound: ${enabled ? "on" : "off"}`;
  sound.setAttribute("aria-pressed", String(enabled));
}
sound.addEventListener("click", () => { enabled = !enabled; updateSound(); });
document.addEventListener("visibilitychange", () => { if (document.hidden) audio.stop(); });
window.addEventListener("pagehide", () => audio.stop());
updateSound();
let ui;
const resonanceMode = setupPreviewResonance("market", { language, onChange: restart });
function restart() {
  try {
    ui?.destroy();
    status.textContent = "";
    document.querySelector("#preview-error").textContent = "";
    const level = Number(levels.value);
    const rules = difficulty(level);
    document.querySelector("#preview-difficulty").textContent = french
      ? `${rules.orders} clients · ${rules.lines} produits par commande · quantités de 0 à ${rules.maxQuantity} · ${rules.durationMs / 1000} secondes · ${rules.maxMistakes} erreurs maximum.`
      : `${rules.orders} customers · ${rules.lines} products per order · quantities from 0 to ${rules.maxQuantity} · ${rules.durationMs / 1000} seconds · ${rules.maxMistakes} mistakes maximum.`;
    ui = mount(document.querySelector("#market-board"), {
      level, language, audio, ...resonanceMode.options,
      onFinish(result) {
        status.textContent = result.cancelled ? (french ? "Service annulé." : "Shift cancelled.")
          : result.completed ? (french ? `Service réussi : ${result.score}/${result.maxScore}. Gains ×${result.earningsMultiplier}.` : `Shift complete: ${result.score}/${result.maxScore}. Gains ×${result.earningsMultiplier}.`)
            : (french ? "Service interrompu, aucun gain." : "Shift ended, no earnings.");
      },
    });
  } catch (error) {
    console.error("Unable to prepare market playtest:", error);
    document.querySelector("#preview-error").textContent = `${french ? "Erreur" : "Error"}: ${error.message}`;
  }
}
reset.addEventListener("click", restart);
levels.addEventListener("change", restart);
restart();
setupPreviewHelp();
