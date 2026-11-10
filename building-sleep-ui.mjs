import { buildingSleepEvent, buildingSleepPending, BUILDING_SEARCH_MINUTES } from "./building-sleep.mjs";
import { mountEventChallenge, trackEventQteKeys } from "./event-qte-ui.mjs";

export function setupBuildingSleep(t, { context, act }) {
  const heldKeys = trackEventQteKeys(document);
  const dialog = document.createElement("dialog");
  dialog.className = "window-dialog";
  dialog.setAttribute("data-native-controls", "");
  dialog.setAttribute("aria-labelledby", "building-sleep-title");
  const title = document.createElement("h2");
  title.id = "building-sleep-title";
  const host = document.createElement("div");
  const receipt = document.createElement("p");
  receipt.setAttribute("role", "status");
  const close = document.createElement("button");
  close.type = "button";
  close.addEventListener("click", () => dialog.close());
  dialog.append(title, host, receipt, close);
  document.body.append(dialog);
  let mounted, key, requested = false;
  dialog.addEventListener("cancel", event => {
    event.preventDefault();
    if (!buildingSleepPending(context()?.state)) dialog.close();
  });
  dialog.addEventListener("close", () => {
    if (dialog.open) return;
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
    close.disabled = buildingSleepPending(state);
    if (attempt.outcome !== "searching") {
      if (requested && !dialog.open && !document.querySelector("dialog[open]")) dialog.showModal();
      if (dialog.open) receipt.textContent = t(attempt.outcome === "slept"
        ? "buildingSleepSuccess" : attempt.outcome === "outside"
        ? "buildingSleepFailure" : "buildingSleepInterrupted");
      return;
    }
    const nextKey = `${state.startedAt}:${attempt.startedMinutes}:${attempt.col}:${attempt.row}`;
    if (key === nextKey) return;
    // Let the sleep menu close before opening the challenge.
    if (document.querySelector("dialog[open]")) return;
    mounted?.destroy();
    key = nextKey;
    receipt.textContent = "";
    dialog.showModal();
    const event = buildingSleepEvent(attempt, state.buildingSleepAttempts.length - 1);
    mounted = mountEventChallenge(host, {
      event, language: document.documentElement.lang === "en" ? "en" : "fr",
      heldKeys,
      backdrop: "   /---------\\\n  /___________\\\n  |  []   []  |\n  |     __    |\n  |____|__|___|",
      presentation: { action: t("buildingSleepAction"), social: false },
      outcomeText: () => "",
      begin: () => act({ kind: "building-sleep-begin" }),
      settle: result => act({ kind: "building-sleep-settle", result }),
    });
    mounted.updatePresentation({ text: "", helpText: t("buildingSleepNote", {
      minutes: BUILDING_SEARCH_MINUTES, hours: current.survival.sleep_hours,
    }) });
  }
  function reset() {
    mounted?.destroy();
    mounted = undefined;
    key = undefined;
    requested = false;
    if (dialog.open) dialog.close();
  }
  return { update, reset, show() { requested = true; update(); } };
}
