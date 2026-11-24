import { buildingSleepEvent, buildingSleepPending, BUILDING_SEARCH_MINUTES } from "./building-sleep.mjs";
import { mountEventChallenge, trackEventQteKeys } from "./event-qte-ui.mjs";

export function setupBuildingSleep(t, { context, act, illustrations }) {
  const heldKeys = trackEventQteKeys(document);
  const dialog = document.createElement("dialog");
  dialog.className = "window-dialog";
  dialog.setAttribute("data-native-controls", "");
  dialog.setAttribute("aria-labelledby", "building-sleep-title");
  const title = document.createElement("h2");
  title.id = "building-sleep-title";
  const host = document.createElement("div");
  const receipt = document.createElement("dialog");
  receipt.className = "event-qte-receipt";
  receipt.setAttribute("aria-label", t("buildingSleepAsk"));
  const result = document.createElement("p");
  result.setAttribute("role", "status");
  const illustration = illustrations ? document.createElement("figure") : null;
  const challengeIllustration = illustrations ? document.createElement("figure") : null;
  if (illustration) {
    illustration.hidden = true;
    receipt.append(illustration);
  }
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.setAttribute("data-shortcut-skip", "");
  dismiss.addEventListener("click", () => receipt.close());
  receipt.append(result, dismiss);
  const close = document.createElement("button");
  close.type = "button";
  close.addEventListener("click", () => dialog.close());
  dialog.append(title, host, close);
  document.body.append(dialog, receipt);
  let mounted, key, receiptKey, requested = false;
  receipt.addEventListener("close", () => { if (dialog.open) close.focus({ preventScroll: true }); });
  dialog.addEventListener("cancel", event => {
    event.preventDefault();
    if (!buildingSleepPending(context()?.state)) dialog.close();
  });
  dialog.addEventListener("close", () => {
    if (dialog.open) return;
    if (receipt.open) receipt.close();
    mounted?.destroy();
    mounted = undefined;
    key = undefined;
    requested = false;
    document.querySelector("#ascii-map")?.focus({ preventScroll: true });
  });
  function update() {
    const current = context();
    if (!current) { reset(); return; }
    const { state } = current;
    const attempt = state.buildingSleepAttempts?.at(-1);
    if (!attempt) { reset(); return; }
    title.textContent = t("buildingSleepAsk");
    close.textContent = t("buildingSleepClose");
    dismiss.textContent = document.documentElement.lang === "en" ? "Close" : "Fermer";
    receipt.setAttribute("aria-label", t("buildingSleepAsk"));
    close.disabled = buildingSleepPending(state);
    if (attempt.outcome !== "searching") {
      if (requested && !dialog.open && !document.querySelector("dialog[open]")) dialog.showModal();
      if (dialog.open) {
        if (illustration) {
          illustration.hidden = attempt.outcome !== "slept";
          if (attempt.outcome === "slept") illustrations.render(illustration, state,
            "shelter.building.slept", `building-sleep:${attempt.startedMinutes}`, t);
        }
        result.textContent = t(attempt.outcome === "slept"
          ? "buildingSleepSuccess" : attempt.outcome === "outside"
          ? "buildingSleepFailure" : "buildingSleepInterrupted");
        const nextReceipt = `${state.startedAt}:${attempt.startedMinutes}:${attempt.col}:${attempt.row}`;
        if (receiptKey !== nextReceipt) {
          receiptKey = nextReceipt;
          receipt.showModal();
        }
      }
      return;
    }
    const nextKey = `${state.startedAt}:${attempt.startedMinutes}:${attempt.col}:${attempt.row}`;
    if (key === nextKey) { refreshChallenge(current, attempt); return; }
    // Let the sleep menu close before opening the challenge.
    if (document.querySelector("dialog[open]")) return;
    mounted?.destroy();
    key = nextKey;
    if (receipt.open) receipt.close();
    dialog.showModal();
    const event = buildingSleepEvent(attempt, state.buildingSleepAttempts.length - 1);
    mounted = mountEventChallenge(host, {
      event, language: document.documentElement.lang === "en" ? "en" : "fr",
      illustration: challengeIllustration,
      heldKeys,
      backdrop: "   /---------\\\n  /___________\\\n  |  []   []  |\n  |     __    |\n  |____|__|___|",
      presentation: { action: t("buildingSleepAction"), social: false },
      outcomeText: () => "",
      begin: () => act({ kind: "building-sleep-begin" }),
      settle: result => act({ kind: "building-sleep-settle", result }),
    });
    refreshChallenge(current, attempt);
  }
  function refreshChallenge(current, attempt) {
    const imageReady = challengeIllustration && illustrations.render(challengeIllustration, current.state,
      "shelter.building.search", `building-search:${attempt.startedMinutes}`, t);
    mounted?.updatePresentation({ text: "", imageReady: Boolean(imageReady), helpText: t("buildingSleepNote", {
      minutes: BUILDING_SEARCH_MINUTES, hours: current.survival.sleep_hours,
    }) });
  }
  function reset() {
    mounted?.destroy();
    mounted = undefined;
    key = undefined;
    requested = false;
    receiptKey = undefined;
    if (illustration) illustration.hidden = true;
    if (receipt.open) receipt.close();
    if (dialog.open) dialog.close();
  }
  illustrations?.subscribe(() => { if (dialog.open) update(); });
  return { update, reset, show() { requested = true; update(); } };
}
