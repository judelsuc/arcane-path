import { createJournalClient } from "./abandoned-journals.mjs";
import { setFeedback } from "./feedback.mjs";
import { decodeNotebook } from "./notebook-transfer.mjs";
import { knownNotebookRumours, notebookRumourText, notebookWitnessReports, validateNotebookRumours } from "./notebook-rumours.mjs";

export function setupAbandonedJournals(t, { context, persist, publishNotebook, showNotebook,
  blocked = () => false, canHandover = () => true }) {
  const panel = document.querySelector("#abandoned-journals");
  if (!panel) return { update() {}, localize() {} };
  const status = document.querySelector("#abandoned-status");
  const list = document.querySelector("#abandoned-list");
  const refresh = document.querySelector("#abandoned-refresh");
  const dialog = document.querySelector("#trail-dialog");
  const openButton = document.querySelector("#open-quests");
  const ask = document.createElement("button");
  ask.type = "button";
  ask.id = "abandoned-ask-town";
  const town = document.querySelector("#dialogue-journals");
  (town ?? panel).append(ask);
  const handovers = document.createElement("div");
  const reply = document.createElement("p");
  reply.setAttribute("role", "status");
  (town ?? panel).append(reply, handovers);
  const rumoursList = document.createElement("ul");
  rumoursList.className = "notebook-witness-list";
  const townReport = document.createElement("details");
  townReport.id = "abandoned-town-reports";
  const townSummary = document.createElement("summary"), townIntro = document.createElement("p");
  const townStatus = document.createElement("p");
  townStatus.setAttribute?.("role", "status");
  townReport.append(townSummary, townIntro, townStatus, rumoursList);
  panel.append(townReport);
  const intro = document.createElement("p");
  intro.className = "notebook-witness-intro";
  status.before?.(intro);
  const proximity = document.createElement("p");
  const diagnostics = document.createElement("p");
  diagnostics.className = "technical-text";
  proximity.id = "abandoned-proximity";
  proximity.setAttribute?.("role", "status");
  panel.append(proximity, diagnostics);
  const client = createJournalClient(localStorage);
  let result, error = "", working = false, queued = false, lastKey, conversation = false;
  const idleWaiters = [];
  function localize() {
    const state = context();
    const language = document.documentElement?.lang === "en" ? "en" : "fr";
    panel.hidden = !state;
    if (openButton) {
      openButton.disabled = !state;
    }
    if (!state && dialog?.open) dialog.close();
    ask.textContent = t("abandoned.ask");
    ask.disabled = working || blocked() || !state?.journalAccess || Boolean(state?.ended);
    ask.hidden = !state || Boolean(state?.ended);
    const observations = notebookWitnessReports(result?.rumours ?? (state ? knownNotebookRumours(state) : []));
    const mentioned = new Set(observations.map(item => item.id));
    intro.textContent = t("abandoned.story");
    townIntro.textContent = t("abandoned.witnessIntro");
    townSummary.textContent = t("abandoned.reports", { count: observations.length });
    townReport.hidden = false;
    const expanded = new Set([...rumoursList.children].filter(item => item.children[0]?.open)
      .map(item => item.children[0].dataset.journal));
    rumoursList.replaceChildren();
    for (const rumour of observations) {
      const item = document.createElement("li"), details = document.createElement("details");
      const summary = document.createElement("summary"), text = document.createElement("p");
      details.dataset.journal = rumour.id;
      details.open = expanded.has(rumour.id);
      summary.textContent = t("abandoned.reportTitle", { parent: rumour.parent });
      text.textContent = notebookRumourText(rumour, language);
      const when = document.createElement("p");
      when.className = "notebook-witness-time";
      when.textContent = t("abandoned.reportDay", { day: Math.floor(rumour.observedMinutes / 1440) + 1 });
      details.append(summary, text, when);
      item.append(details);
      rumoursList.append(item);
    }
    diagnostics.textContent = error;
    townStatus.textContent = error ? ""
      : observations.length ? t("abandoned.heard") : t(conversation ? "abandoned.noReport" : "abandoned.notHeard");
    const close = !state?.ended && result?.indications?.some(item => mentioned.has(item.id));
    proximity.hidden = !close;
    proximity.textContent = close ? t("abandoned.close") : "";
    refresh.disabled = working || blocked() || !state?.journalAccess;
    const statusKey = !state?.journalAccess ? "abandoned.legacy" : error
      ? "abandoned.offline" : working ? "abandoned.loading" : state.ended && state.ended !== "reunion"
        ? result?.published ? "abandoned.published" : "abandoned.pending" : "";
    status.textContent = statusKey ? t(statusKey) : "";
    setFeedback(status, error ? "failure" : result?.published ? "success" : "");
    list.replaceChildren();
    handovers.replaceChildren();
    reply.textContent = error || (conversation ? t(observations.length ? "abandoned.heard" : "abandoned.noReport") : "");
    if (!(result?.sidequests ?? state?.sidequests ?? []).length && !(result?.nearby ?? []).some(j => mentioned.has(j.id))) {
      const item = document.createElement("li");
      item.textContent = t("abandoned.emptyHands");
      list.append(item);
    }
    for (const quest of result?.sidequests ?? state?.sidequests ?? []) {
      const item = document.createElement("li");
      const target = quest.stages[quest.step];
      item.textContent = t(quest.delivered ? "abandoned.delivered" : "abandoned.quest", {
        parent: quest.parent, place: target.name, step: quest.step + 1, total: quest.stages.length,
      });
      if (!quest.delivered && !state?.ended) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = t("abandoned.advance");
        button.disabled = working || blocked() || !canHandover(quest);
        button.addEventListener("click", () => sync("advance", quest));
        const handover = document.createElement("p");
        handover.textContent = t("abandoned.quest", {
          parent: quest.parent, place: target.name, step: quest.step + 1, total: quest.stages.length,
        });
        handover.append(button);
        handovers.append(handover);
      }
      list.append(item);
      if (showNotebook) {
        const read = document.createElement("button");
        read.type = "button";
        read.textContent = t("abandoned.read");
        read.disabled = working || blocked();
        read.addEventListener("click", () => sync("read", quest));
        item.append(" ", read);
      }
    }
    if (!state?.ended) for (const journal of result?.nearby ?? []) {
      if (!mentioned.has(journal.id)) continue;
      const item = document.createElement("li"), button = document.createElement("button");
      item.textContent = t("abandoned.found", { parent: journal.parent,
        history: journal.history.join(" → ") || t("abandoned.noHistory") });
      button.type = "button";
      button.textContent = t("abandoned.claim");
      button.disabled = working || blocked();
      button.addEventListener("click", () => sync("claim", journal));
      item.append(" ", button);
      list.append(item);
    }
  }
  async function sync(action = "sync", journal) {
    if (blocked() || action === "advance" && !canHandover(journal)) return;
    if (working) { queued = true; return; }
    const state = context();
    working = true;
    error = "";
    localize();
    try {
      if (publishNotebook) await client.flushNotebooks();
      if (state?.journalAccess) {
        if (publishNotebook && state.ended && state.ended !== "reunion" && !state.journalPublished) {
          await publishNotebook(state);
        }
        const next = await client.sync(state, action, journal);
        if (action === "read") {
          await showNotebook(decodeNotebook(next.notebook.photos), next.notebook.clues);
          return;
        }
        if (context()?.serverJourney?.id === state.serverJourney.id) {
          validateNotebookRumours(next.rumours ?? [], state.elapsedMinutes);
          validateNotebookRumours(next.indications ?? [], state.elapsedMinutes);
          persist(next.sidequests, next.published, next.nearby ?? [], state.elapsedMinutes,
            next.rumours ?? [], next.indications ?? []);
          // Do not show a proximity report from a previous cell after an in-flight move.
          result = { ...next, indications: context()?.col === state.col && context()?.row === state.row
            ? next.indications ?? [] : [] };
          if (action === "rumours") {
            conversation = true;
            townReport.open = true;
          }
        }
      }
    } catch (reason) {
      console.error("Abandoned notebook action failed:", reason);
      error = reason.message;
    } finally {
      working = false;
      localize();
      for (const resolve of idleWaiters.splice(0)) resolve();
      if (queued) { queued = false; void sync(); }
    }
  }
  function update() {
    if (blocked()) { localize(); return; }
    const state = context();
    const key = state ? `${state.serverJourney?.id}:${state.col}:${state.row}:${state.elapsedMinutes}:${state.ended}` : "";
    if (key !== lastKey) {
      if (state?.serverJourney?.id !== lastKey?.split(":")[0]) {
        result = undefined;
        conversation = false;
      } else if (result) result = { ...result, indications: [] };
      lastKey = key;
      void sync();
    }
    localize();
  }
  refresh.addEventListener("click", () => sync());
  ask.addEventListener("click", () => sync("rumours"));
  window.addEventListener("online", () => sync());
  // Retry durable death notices even if the player has already started another run.
  const retry = setInterval(() => { if (error) void sync(); }, 30_000);
  retry.unref?.();
  void sync();
  function open() {
    if (!context() || !dialog) return;
    if (document.querySelector("dialog[open]") && !dialog.open) return;
    localize();
    if (!dialog.open) dialog.showModal();
    openButton?.focus?.();
  }
  dialog?.addEventListener("close", () => openButton?.focus?.());
  return { update, localize, open,
    whenIdle: () => working ? new Promise(resolve => idleWaiters.push(resolve)) : Promise.resolve() };
}
