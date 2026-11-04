import { TAROT_CARDS, tarotArtwork } from "./tarot-cards.mjs";

export const PATRONS = Object.freeze({
  cafe: "temperance", music: "judgement", theft: "devil", deliveries: "chariot",
  harvest: "empress", workshop: "magician", sketch: "star", petanque: "strength",
  lostfound: "moon", lanterns: "hermit", bookshop: "priestess", market: "justice",
});

export function resolveResonance(game, { journeyCard = null, birthCard = null, dailyCard = null, resonance = false } = {}) {
  if (!Object.hasOwn(PATRONS, game)) throw new RangeError(`Unknown resonance game: ${game}`);
  if (typeof resonance !== "boolean") throw new TypeError("Resonance must be boolean.");
  for (const card of [journeyCard, birthCard, dailyCard]) {
    if (card !== null && !TAROT_CARDS.includes(card)) throw new RangeError(`Unknown resonance card: ${card}`);
  }
  const patron = PATRONS[game];
  return resonance || [journeyCard, birthCard, dailyCard].includes(patron);
}

export function resonanceGain(cents, active) {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new RangeError("Expected nonnegative integer reward cents.");
  if (typeof active !== "boolean") throw new TypeError("Resonance must be boolean.");
  const gain = active ? Number((BigInt(cents) * 11n + 5n) / 10n) : cents;
  if (!Number.isSafeInteger(gain)) throw new RangeError("Reward exceeds currency precision.");
  return gain;
}

export function resonanceResult(result, active) {
  return { ...result, earningsMultiplier: active && result.completed && !result.cancelled ? 1.1 : 1 };
}

export function decorateResonance(root, game, active, language = "fr") {
  if (!active) return;
  if (!Object.hasOwn(PATRONS, game)) throw new RangeError(`Unknown resonance game: ${game}`);
  const doc = root.ownerDocument;
  const style = doc.createElement("style");
  style.textContent = ".arcane-resonance{position:relative;isolation:isolate}.arcane-resonance>.arcane-backdrop{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:-1}.arcane-backdrop>.arcane-watermark{display:block;width:100%;height:100%;max-width:none;object-fit:cover;object-position:center;transform:scale(1.25);filter:blur(14px);opacity:.16;pointer-events:none}.arcane-resonance>.arcane-banner{font-weight:bold;color:#e9ca84}";
  const backdrop = doc.createElement("div");
  backdrop.className = "arcane-backdrop";
  backdrop.setAttribute("aria-hidden", "true");
  const image = doc.createElement("img");
  image.src = tarotArtwork(PATRONS[game]).url;
  image.alt = "";
  image.className = "arcane-watermark";
  image.setAttribute("aria-hidden", "true");
  backdrop.append(image);
  const banner = doc.createElement("p");
  banner.className = "arcane-banner";
  banner.textContent = language === "en" ? "Arcane resonance · gains ×1.1" : "Résonance d’arcane · gains ×1,1";
  image.addEventListener("error", () => {
    const error = doc.createElement("p");
    error.setAttribute("role", "alert");
    error.textContent = language === "en" ? "Unable to load the patron card." : "Impossible de charger la carte tutélaire.";
    root.append(error);
  }, { once: true });
  root.className = `${root.className || ""} arcane-resonance`.trim();
  root.append(style, backdrop, banner);
}

export function setupPreviewResonance(game, { language = "fr", onChange } = {}) {
  if (!Object.hasOwn(PATRONS, game)) throw new RangeError(`Unknown resonance game: ${game}`);
  const doc = document;
  if (onChange !== undefined && typeof onChange !== "function") throw new TypeError("Invalid resonance change handler.");
  const label = doc.createElement("label");
  const select = doc.createElement("select");
  select.id = "preview-resonance";
  label.htmlFor = select.id;
  label.textContent = language === "en" ? "Arcane mode " : "Mode arcane ";
  for (const [value, en, fr] of [
    ["normal", "Normal", "Normal"], ["journey", "Journey card matches", "Carte du voyage concordante"],
    ["daily", "Daily card matches", "Carte du jour concordante"], ["both", "Both cards match", "Les deux cartes concordent"],
  ]) {
    const option = doc.createElement("option");
    option.value = value;
    option.textContent = language === "en" ? en : fr;
    select.append(option);
  }
  const initial = new URLSearchParams(location.search).get("resonance");
  select.value = ["journey", "daily", "both"].includes(initial) ? initial : "normal";
  label.append(select);
  const host = doc.querySelector("main") ?? doc.body;
  const result = doc.querySelector("#preview-result");
  host.insertBefore(label, result?.parentElement === host ? result : null);
  select.addEventListener("change", () => onChange?.());
  return {
    get options() {
      return {
        journeyCard: ["journey", "both"].includes(select.value) ? PATRONS[game] : null,
        dailyCard: ["daily", "both"].includes(select.value) ? PATRONS[game] : null,
      };
    },
    get active() { return select.value !== "normal"; },
  };
}
