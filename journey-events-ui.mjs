import { dailyTarotPending } from "./economy.mjs";
import { journeyEventTextParts, journeyEventEffectParts, eventPlaytestEnabled, JOURNEY_EVENTS } from "./journey-events.mjs";
import { journeyEventArt } from "./journey-event-art.mjs";
import { NARRATIVE_BRIEFS, LOST_PLAYER_DREAM } from "./live-narrative.mjs";
import { setGenerating } from "./feedback.mjs";
import { mountEventChallenge } from "./event-qte-ui.mjs";
import { eventQteResult } from "./event-qte-copy.mjs";

export function setupJourneyEvents(t, { context, acknowledge, pinEvent, narrative, rememberWording, illustrations,
  beginChallenge, settleChallenge }) {
  const dialog = document.querySelector("#journey-event-dialog");
  const proceed = document.querySelector("#journey-event-continue");
  const illustration = illustrations ? document.createElement("figure") : null;
  if (illustration) proceed.before(illustration);
  const testMode = eventPlaytestEnabled();
  const banner = testMode ? document.createElement("p") : null;
  if (banner) {
    banner.id = "event-playtest-banner";
    banner.setAttribute("role", "status");
    banner.style.cssText = "position:sticky;top:0;z-index:10;padding:12px;background:#493a20;color:#fff0c4;text-align:center";
    document.body.prepend(banner);
  }
  let queued = false;
  let challenge, challengeKey, challengeHost, challengeLanguage, receiptKey;
  const receipt = document.createElement("dialog");
  receipt.className = "event-qte-receipt";
  receipt.setAttribute("aria-label", t("journeyEventTitle"));
  receipt.addEventListener("close", () => { if (!proceed.disabled) proceed.focus(); });
  receipt.hidden = true;
  proceed.before(receipt);
  const identity = state => `${state?.serverJourney?.id ?? state?.startedAt}`;
  let wordingId, wording;
  const wordingStatus = narrative ? document.createElement("p") : null;
  if (wordingStatus) {
    wordingStatus.id = "journey-event-wording-status";
    wordingStatus.setAttribute("role", "status");
    proceed.before(wordingStatus);
  }
  function localize() {
    if (banner) {
      banner.textContent = document.documentElement.lang === "en"
        ? "LOCAL EVENT PLAYTEST — event opportunity every 5 walking minutes (18× normal frequency). Tarot probabilities unchanged. Separate test save; your normal journey is untouched."
        : "TEST LOCAL DES ÉVÉNEMENTS — une occasion toutes les 5 minutes de marche (fréquence ×18). Probabilités du tarot inchangées. Sauvegarde de test séparée ; votre voyage normal reste intact.";
      const rules = dialog.querySelector(".window-help-text");
      if (rules) rules.textContent = t("journeyEventRules").replace("90", String(JOURNEY_EVENTS.intervalMinutes));
    }
    const current = context();
    const event = current?.state.events?.history.at(-1);
    if (!dialog.open || !event) return;
    const language = document.documentElement.lang === "en" ? "en" : "fr";
    const owner = identity(current.state);
    const unresolved = ["ready", "active"].includes(event.qte?.status);
    const previousPin = pinEvent ? dialog.querySelector("#journey-event-pin") : null;
    if (previousPin) previousPin.hidden = unresolved;
    proceed.disabled = unresolved;
    receipt.hidden = !event.qte || unresolved;
    if (receipt.hidden && receipt.open) receipt.close();
    const nextReceipt = receipt.hidden ? null : `${owner}:${event.id}:${language}:${event.qte.status}`;
    if (!receipt.hidden && receiptKey !== nextReceipt) {
      receipt.setAttribute("aria-label", t("journeyEventTitle"));
      receipt.replaceChildren(eventQteResult(event, language), " ", ...journeyEventEffectParts(event, t).map(part => {
        if (typeof part === "string") return part;
        const number = document.createElement("strong");
        number.textContent = part.text;
        if (part.feedback) number.dataset.feedback = part.feedback;
        return number;
      }));
      const dismiss = document.createElement("button");
      dismiss.type = "button";
      dismiss.textContent = language === "en" ? "Close" : "Fermer";
      dismiss.setAttribute("data-shortcut-skip", "");
      dismiss.addEventListener("click", () => receipt.close());
      receipt.append(dismiss);
      if (challengeKey && !receipt.open) receipt.showModal();
    }
    receiptKey = nextReceipt;
    const nextChallenge = unresolved ? `${owner}:${event.id}` : null;
    if (challengeKey !== nextChallenge || unresolved && event.qte.status === "ready" && challengeLanguage !== language) {
      if (challengeKey && !nextChallenge && !receipt.open) proceed.focus();
      if (illustration) proceed.before(illustration);
      challenge?.destroy(); challenge = undefined;
      challengeKey = nextChallenge;
      challengeLanguage = language;
      if (unresolved) {
        challengeHost ??= document.createElement("div");
        proceed.before(challengeHost);
        dialog.setAttribute("data-native-controls", "");
        challenge = mountEventChallenge(challengeHost, { event, language, illustration,
          begin: mode => {
            if (identity(context()?.state) !== owner) throw new Error(t("eventQte.unavailable"));
            return beginChallenge(event.id, mode);
          },
          settle: result => {
            if (identity(context()?.state) !== owner) throw new Error(t("eventQte.unavailable"));
            return settleChallenge(event.id, result);
          },
          onError: reason => console.error("Event challenge failed:", reason),
        });
      } else dialog.removeAttribute?.("data-native-controls");
    }
    const brief = `event.${event.kind}`;
    const imageReady = illustration &&
      illustrations.render(illustration, current.state, brief, `event:${event.id}`, t);
    if (wordingId !== event.id) {
      wordingId = event.id;
      wording = Object.hasOwn(event, "wording") ? event.wording
        : narrative?.snapshot(current.state, brief, event.wordingVariant ?? 0) ?? null;
      if (!Object.hasOwn(event, "wording")) rememberWording?.(event.id, wording);
    }
    if (wordingStatus) {
      wordingStatus.hidden = !Object.hasOwn(NARRATIVE_BRIEFS, brief);
      wordingStatus.textContent = wordingStatus.hidden ? "" : narrative.introductionStatus(
        current.state, brief, language, Boolean(wording), event.wordingVariant ?? 0);
      setGenerating(wordingStatus, !wordingStatus.hidden && !wording && narrative.pending?.(current.state, brief));
    }
    const card = id => current.economy.tarot.find(c => c.id === id)[language];
    const parts = journeyEventTextParts(event, t, { includeEffects: !event.qte });
    if (wording && Object.hasOwn(NARRATIVE_BRIEFS, brief)) parts[0] = `${wording[language]} `;
    document.querySelector("#journey-event-text").replaceChildren(...parts.map(part => {
      if (typeof part === "string") return part;
      const number = document.createElement("span");
      number.textContent = part.text;
      if (part.feedback) {
        number.dataset.feedback = part.feedback;
        number.style.fontWeight = "bold";
      }
      return number;
    }));
    document.querySelector("#journey-event-text").hidden = unresolved;
    const ascii = document.querySelector("#journey-event-art");
    ascii.textContent = journeyEventArt(event.kind);
    ascii.hidden = unresolved || Boolean(imageReady);
    const fallbackFigure = ascii.parentElement;
    if (fallbackFigure) fallbackFigure.hidden = unresolved;
    document.querySelector("#journey-event-cards").textContent = t("journeyEventCards", {
      birth: card(event.birthCard), daily: card(event.dailyCard),
      chance: Math.round(event.occurrence * 100), positive: Math.round(event.positive * 100),
    });
    document.querySelector("#journey-event-cards").hidden = unresolved;
    const rules = dialog.querySelector(".window-help-text");
    if (rules) rules.hidden = Boolean(event.qte);
    challenge?.updatePresentation({
      text: parts[0], imageReady: Boolean(imageReady),
      helpText: `${rules?.textContent ?? t("journeyEventRules")} ${document.querySelector("#journey-event-cards").textContent}`,
    });
    document.querySelector("#journey-event-save").textContent = current.saveStatus;
    if (pinEvent && !unresolved) {
      let pinned = dialog.querySelector("#journey-event-pin");
      if (!pinned) {
        pinned = document.createElement("div");
        pinned.id = "journey-event-pin";
        proceed.before(pinned);
      }
      pinEvent(pinned, current.state, current.economy, wording);
    }
  }
  function update() {
    const state = context()?.state;
    if (state && !state.ended) narrative?.prefetch(state,
      Object.keys(NARRATIVE_BRIEFS).filter(id => id !== LOST_PLAYER_DREAM));
    localize();
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      const current = context();
      if (!current || current.busy || !current.state.events?.pending ||
          dailyTarotPending(current.state) || document.querySelector("dialog[open]")) return;
      dialog.showModal();
      localize();
      if (!proceed.disabled) proceed.focus();
    });
  }
  proceed.addEventListener("click", () => {
    if (proceed.disabled || !context()?.state.events?.pending) return;
    try {
      acknowledge();
      if (receipt.open) receipt.close();
      dialog.close();
      wordingId = undefined;
      challenge?.destroy(); challenge = undefined; challengeKey = undefined;
      dialog.removeAttribute?.("data-native-controls");
      document.querySelector("#ascii-map").focus({ preventScroll: true });
    } catch (reason) {
      console.error("Unable to acknowledge journey event:", reason);
      document.querySelector("#journey-event-save").textContent = t("journeyEventError", { error: reason.message });
    }
  });
  dialog.addEventListener("cancel", event => event.preventDefault());
  new MutationObserver(update).observe(document.body, {
    subtree: true, attributes: true, attributeFilter: ["open"],
  });
  narrative?.subscribe(localize);
  illustrations?.subscribe(localize);
  return { update, reset() {
    if (receipt.open) receipt.close();
    challenge?.destroy(); challenge = undefined; challengeKey = undefined;
    challengeHost?.remove(); challengeHost = undefined;
    dialog.removeAttribute?.("data-native-controls");
    wordingId = undefined; wording = null; dialog.close();
  } };
}
