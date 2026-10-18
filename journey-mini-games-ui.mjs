import { JOURNEY_MINI_GAMES, journeyMiniGameAvailable } from "./journey-mini-games.mjs";
import { mount as mountHarvest } from "./minigames/harvest-ui.mjs";
import { mount as mountWorkshop } from "./minigames/workshop-ui.mjs";
import { mount as mountSketch } from "./minigames/sketch-ui.mjs";
import { mount as mountMarket } from "./minigames/market-ui.mjs";
import { mount as mountBookshop } from "./minigames/bookshop-ui.mjs";
import { mount as mountDeliveries } from "./minigames/deliveries-ui.mjs";
import { mount as mountPetanque } from "./minigames/petanque-ui.mjs";
import { mount as mountLanterns } from "./minigames/lanterns-ui.mjs";
import { mount as mountLostFound } from "./minigames/lost-found-ui.mjs";
import { createHarvestAudio } from "./minigames/harvest-audio.mjs";
import { createTheftAudio } from "./theft-audio.mjs";
import { createMarketAudio } from "./minigames/market-audio.mjs";
import { createBookshopAudio } from "./minigames/bookshop-audio.mjs";
import { createPetanqueAudio } from "./minigames/petanque-audio.mjs";
import { createLanternAudio } from "./minigames/lanterns-audio.mjs";

const MOUNTS = Object.freeze({
  harvest: mountHarvest, workshop: mountWorkshop, sketch: mountSketch,
  market: mountMarket, bookshop: mountBookshop, deliveries: mountDeliveries,
  petanque: mountPetanque, lanterns: mountLanterns, "lost-found": mountLostFound,
});

const TITLES = Object.freeze({
  en: {
    harvest: "Vineyard harvest", workshop: "Bicycle workshop", sketch: "Landscape sketch",
    market: "Market shift", bookshop: "Bookshop shift", deliveries: "Local deliveries",
    petanque: "Pétanque", lanterns: "Lantern rehearsal", "lost-found": "Lost and found",
    close: "Close game", closeResult: "Close", retry: "Retry settlement",
    settlementError: "The result could not be recorded. Your activity remains pending.",
    earned: "Earned", spent: "Time spent",
    minutes: "min", points: "points", gameMoney: "€",
  },
  fr: {
    harvest: "Vendanges", workshop: "Atelier vélo", sketch: "Croquis du paysage",
    market: "Service au marché", bookshop: "Service en librairie", deliveries: "Livraisons locales",
    petanque: "Pétanque", lanterns: "Répétition des lanternes", "lost-found": "Objets trouvés",
    close: "Fermer le jeu", closeResult: "Fermer", retry: "Réessayer l’enregistrement",
    settlementError: "Le résultat n’a pas pu être enregistré. L’activité reste en attente.",
    earned: "Gagné", spent: "Temps écoulé",
    minutes: "min", points: "points", gameMoney: "€",
  },
});

const styles = `
  dialog.journey-mini-game {
    box-sizing: border-box; width: min(96vw, 68rem); max-width: 96vw;
    max-height: 94dvh; padding: 0; border: 1px solid #8a7959;
    border-radius: .75rem; color: inherit; background: #171913;
  }
  dialog.journey-mini-game::backdrop { background: rgb(0 0 0 / .78); }
  dialog.journey-mini-game .journey-mini-game__frame { max-height: 94dvh; overflow: auto; padding: 1rem; }
  dialog.journey-mini-game .journey-mini-game__header {
    display: flex; align-items: center; justify-content: space-between; gap: 1rem;
    position: sticky; top: -1rem; z-index: 5; padding: .5rem 0;
    background: #171913; border-bottom: 1px solid #655b45;
  }
  dialog.journey-mini-game .journey-mini-game__header h2 { margin: 0; font-size: 1.15rem; }
  dialog.journey-mini-game .journey-mini-game__close { min-width: 2.75rem; min-height: 2.75rem; }
  dialog.journey-mini-game .journey-mini-game__content { padding-top: .5rem; }
  dialog.journey-mini-game .journey-mini-game__content > * { max-width: 100%; }
  dialog.journey-mini-game .journey-mini-game__receipt {
    padding: .75rem; margin-top: .75rem; border: 1px solid #8a7959; border-radius: .5rem;
  }
  @media (max-width: 40rem) {
    dialog.journey-mini-game .journey-mini-game__frame { padding: .65rem; }
    dialog.journey-mini-game { width: 100vw; max-width: 100vw; max-height: 100dvh; border-radius: 0; }
    dialog.journey-mini-game .journey-mini-game__frame { max-height: 100dvh; }
  }
`;

const record = value => value !== null && typeof value === "object" && !Array.isArray(value);

function createDefaultAudio(game) {
  const createAudio = source => typeof Audio === "function" ? new Audio(source) : null;
  const createContext = () => {
    const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!Context) throw new Error("Web Audio is unavailable.");
    return new Context();
  };
  const options = { createAudio };
  switch (game) {
    case "harvest": return createHarvestAudio(options);
    case "workshop":
    case "deliveries": return createTheftAudio(options);
    case "market": return createMarketAudio({ createContext });
    case "bookshop": return createBookshopAudio({ createContext });
    case "petanque": return createPetanqueAudio(options);
    case "lanterns": return createLanternAudio({ createContext });
    default: return undefined;
  }
}

function scopeResonanceStyles(dialog) {
  for (const style of dialog.querySelectorAll("style")) {
    style.textContent = style.textContent
      .replaceAll(".arcane-resonance{", "dialog.journey-mini-game .arcane-resonance{")
      .replaceAll(".arcane-resonance>.", "dialog.journey-mini-game .arcane-resonance>.")
      .replaceAll(".arcane-backdrop>.", "dialog.journey-mini-game .arcane-backdrop>.");
  }
}

export function setupJourneyMiniGames(t, { context, act, audio = {} } = {}) {
  if (typeof context !== "function" || typeof act !== "function") {
    throw new TypeError("Journey mini-games require context and act callbacks.");
  }
  const doc = globalThis.document;
  if (!doc?.body || typeof doc.createElement !== "function") {
    throw new TypeError("Journey mini-games require a document.");
  }
  const activeGames = new Set();
  const audioByGame = new Map();

  function available(game) {
    if (!JOURNEY_MINI_GAMES.includes(game)) return false;
    const current = context();
    return Boolean(record(current) && record(current.state) && !current.blocked &&
      journeyMiniGameAvailable(game, current.cell));
  }

  function open(game) {
    if (!available(game)) return false;
    const current = context();
    if (!record(current) || !record(current.state) || current.blocked) return false;
    const started = act({ type: "begin", game, context: current });
    const pending = started?.miniGamePending ?? started;
    if (!pending || pending.game !== game) return false;

    const language = doc.documentElement?.lang === "en" ? "en" : "fr";
    const words = TITLES[language];
    const dialog = doc.createElement("dialog");
    dialog.className = "journey-mini-game";
    dialog.id = "journey-mini-game-dialog";
    dialog.setAttribute("data-native-controls", "");
    dialog.setAttribute("aria-label", words[game]);
    const frame = doc.createElement("div");
    frame.className = "journey-mini-game__frame";
    const header = doc.createElement("header");
    header.className = "journey-mini-game__header";
    const title = doc.createElement("h2");
    title.textContent = words[game];
    const close = doc.createElement("button");
    close.type = "button";
    close.className = "journey-mini-game__close";
    close.textContent = "×";
    close.setAttribute("aria-label", words.close);
    const content = doc.createElement("div");
    content.className = "journey-mini-game__content";
    const receipt = doc.createElement("section");
    receipt.className = "journey-mini-game__receipt";
    receipt.setAttribute("aria-live", "polite");
    receipt.hidden = true;
    const receiptText = doc.createElement("p");
    const errorText = doc.createElement("p");
    errorText.setAttribute("role", "alert");
    const retry = doc.createElement("button");
    retry.type = "button";
    retry.textContent = words.retry;
    retry.hidden = true;
    receipt.append(receiptText, errorText, retry);
    const style = doc.createElement("style");
    style.textContent = styles;
    header.append(title, close);
    frame.append(header, content, receipt);
    dialog.append(style, frame);
    doc.body.append(dialog);

    let mounted;
    let finalResult = null;
    let settled = false;
    let closing = false;
    const cleanup = () => {
      if (mounted) {
        const gameUI = mounted;
        mounted = null;
        gameUI.destroy();
      }
      activeGames.delete(gameRecord);
      dialog.remove();
    };
    const closeDialog = () => {
      closing = true;
      if (dialog.open) dialog.close();
      cleanup();
    };
    const displayReceipt = (result, updated) => {
      const details = updated?.lastJourneyMiniGame;
      const money = `${new Intl.NumberFormat(language, {
        minimumFractionDigits: 2, maximumFractionDigits: 2,
      }).format((details?.rewardCents ?? 0) / 100)} ${words.gameMoney}`;
      receiptText.textContent = result.cancelled
        ? language === "en" ? "Game cancelled." : "Jeu annulé."
        : `${result.score}/${result.maxScore} ${words.points} · ${words.earned} : ${money} · ${words.spent} : ${pending.minutes} ${words.minutes}.`;
      receipt.hidden = false;
      if (result.cancelled) {
        closeDialog();
        return;
      }
      errorText.textContent = "";
      retry.hidden = true;
      close.textContent = words.closeResult;
      close.setAttribute("aria-label", words.closeResult);
      close.disabled = false;
      close.focus?.({ preventScroll: true });
    };
    const attemptSettlement = result => {
      if (settled) return;
      try {
        const updated = act({ type: "settle", game, result });
        const details = updated?.lastJourneyMiniGame;
        if (!details || details.game !== game || !Number.isSafeInteger(details.rewardCents) ||
            details.rewardCents < 0) throw new Error("The host returned no valid settlement receipt.");
        settled = true;
        displayReceipt(result, updated);
      } catch (error) {
        console.error("Journey mini-game settlement failed.", error);
        receipt.hidden = false;
        errorText.textContent = words.settlementError;
        retry.hidden = false;
        close.disabled = true;
      }
    };
    const finish = result => {
      if (finalResult) return;
      finalResult = result;
      receipt.hidden = false;
      close.disabled = true;
      attemptSettlement(finalResult);
    };
    const cancel = () => {
      if (finalResult) {
        if (settled) closeDialog();
        else attemptSettlement(finalResult);
        return;
      }
      finish({ completed: false, cancelled: true, score: 0, maxScore: 1 });
    };
    const onCancel = event => {
      event.preventDefault();
      cancel();
    };
    const onClose = () => {
      if (!closing && !settled) cancel();
    };
    const gameRecord = { dialog, cancel };
    activeGames.add(gameRecord);
    close.addEventListener("click", cancel);
    retry.addEventListener("click", () => {
      if (finalResult && !settled) attemptSettlement(finalResult);
    });
    dialog.addEventListener("cancel", onCancel);
    dialog.addEventListener("close", onClose);

    try {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      if (!audioByGame.has(game)) audioByGame.set(game, audio[game] ?? createDefaultAudio(game));
      mounted = MOUNTS[game](content, {
        level: pending.level,
        language,
        onFinish: finish,
        audio: audioByGame.get(game),
        resonance: pending.resonance,
        journey: true,
      });
      if (closing) {
        mounted.destroy();
        mounted = null;
        return true;
      }
      scopeResonanceStyles(dialog);
      if (!content.contains(doc.activeElement)) {
        content.querySelector("button:not([disabled]), input:not([disabled]), [tabindex='0']")
          ?.focus?.({ preventScroll: true });
      }
    } catch (error) {
      cancel();
      throw error;
    }
    return true;
  }

  function destroy() {
    for (const game of [...activeGames]) game.cancel();
    for (const audio of audioByGame.values()) audio?.stop?.();
    audioByGame.clear();
  }

  return Object.freeze({ open, available, destroy });
}
