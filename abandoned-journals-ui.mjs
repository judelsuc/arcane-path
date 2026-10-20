import { createJournalClient } from "./abandoned-journals.mjs";
import { setFeedback } from "./feedback.mjs";
import { decodeNotebook } from "./notebook-transfer.mjs";
import { knownNotebookRumours, notebookRumourText, validateNotebookRumours } from "./notebook-rumours.mjs";

export function setupAbandonedJournals(t, { context, persist, publishNotebook, showNotebook }) {
  const panel = document.querySelector("#abandoned-journals");
  if (!panel) return { update() {}, localize() {} };
  const status = document.querySelector("#abandoned-status");
  const list = document.querySelector("#abandoned-list");
  const refresh = document.querySelector("#abandoned-refresh");
  const ask = document.createElement("button");
  ask.type = "button";
  ask.id = "abandoned-ask-town";
  const town = document.querySelector("#town-dialog");
  (town ?? panel).append(ask);
  const rumoursList = document.createElement("ul");
  panel.append(rumoursList);
  const townReport = document.createElement("div");
  townReport.setAttribute?.("role", "status");
  town?.append(townReport);
  const proximity = document.createElement("p");
  proximity.id = "abandoned-proximity";
  proximity.setAttribute?.("role", "status");
  panel.insertAdjacentElement?.("beforebegin", proximity);
  const client = createJournalClient(localStorage);
  let result, error = "", working = false, queued = false, lastKey, conversation = false;
  function localize() {
    const state = context();
    const language = document.documentElement?.lang === "en" ? "en" : "fr", en = language === "en";
    panel.hidden = !state;
    ask.textContent = en ? "Ask locals about abandoned notebooks" : "Parler des carnets abandonnés";
    ask.disabled = working || !state?.journalAccess || Boolean(state?.ended);
    ask.hidden = !state || Boolean(state?.ended);
    const observations = result ? [...new Map([...(result.rumours ?? []), ...(result.indications ?? [])]
      .map(item => [item.evidenceKey, item])).values()]
      : state ? knownNotebookRumours(state) : [];
    rumoursList.replaceChildren();
    for (const rumour of observations) {
      const item = document.createElement("li");
      item.textContent = notebookRumourText(rumour, language);
      rumoursList.append(item);
    }
    townReport.textContent = error ? (en ? `Notebook report unavailable: ${error}` : `Témoignage indisponible : ${error}`) : observations
      .map(item => notebookRumourText(item, language)).join("\n");
    if (conversation && !observations.length && !error) {
      const item = document.createElement("li");
      item.textContent = en ? "No notebook report here today. That does not prove there are none."
        : "Aucun témoignage sur un carnet ici aujourd’hui. Cela ne prouve pas leur absence.";
      rumoursList.append(item);
      townReport.textContent = item.textContent;
    }
    const close = !state?.ended && result?.indications?.length;
    proximity.hidden = !close;
    proximity.textContent = close ? (en
      ? "An abandoned notebook was reported within 1 km. Pickup requires getting within 200 m; someone else may get there first."
      : "Un carnet abandonné a été signalé à moins de 1 km. Approchez à moins de 200 m pour le ramasser ; quelqu’un peut vous devancer.") : "";
    refresh.disabled = working || !state?.journalAccess;
    status.textContent = t(!state?.journalAccess ? "abandoned.legacy" : error
      ? "abandoned.offline" : working ? "abandoned.loading" : state.ended && state.ended !== "reunion"
        ? result?.published ? "abandoned.published" : "abandoned.pending" : "abandoned.help",
      { error });
    setFeedback(status, error ? "failure" : result?.published ? "success" : "");
    list.replaceChildren();
    for (const quest of result?.sidequests ?? state?.sidequests ?? []) {
      const item = document.createElement("li");
      const target = quest.stages[quest.step];
      item.textContent = t(quest.delivered ? "abandoned.delivered" : "abandoned.quest", {
        parent: quest.parent, place: target.name, latitude: target.latitude.toFixed(3),
        longitude: target.longitude.toFixed(3), step: quest.step + 1, total: quest.stages.length,
      });
      if (!quest.delivered && !state?.ended) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = t("abandoned.advance");
        button.disabled = working;
        button.addEventListener("click", () => sync("advance", quest));
        item.append(" ", button);
      }
      list.append(item);
      if (showNotebook) {
        const read = document.createElement("button");
        read.type = "button";
        read.textContent = t("abandoned.read");
        read.disabled = working;
        read.addEventListener("click", () => sync("read", quest));
        item.append(" ", read);
      }
    }
    if (!state?.ended) for (const journal of result?.nearby ?? []) {
      const item = document.createElement("li"), button = document.createElement("button");
      item.textContent = t("abandoned.found", { parent: journal.parent,
        history: journal.history.join(" → ") || t("abandoned.noHistory") });
      button.type = "button";
      button.textContent = t("abandoned.claim");
      button.disabled = working;
      button.addEventListener("click", () => sync("claim", journal));
      item.append(" ", button);
      list.append(item);
    }
  }
  async function sync(action = "sync", journal) {
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
          if (action === "rumours") conversation = true;
        }
      }
    } catch (reason) {
      console.error("Abandoned notebook action failed:", reason);
      error = reason.message;
    } finally {
      working = false;
      localize();
      if (queued) { queued = false; void sync(); }
    }
  }
  function update() {
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
  return { update, localize };
}
