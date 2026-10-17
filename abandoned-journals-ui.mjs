import { createJournalClient } from "./abandoned-journals.mjs";
import { setFeedback } from "./feedback.mjs";
import { decodeNotebook } from "./notebook-transfer.mjs";

export function setupAbandonedJournals(t, { context, persist, publishNotebook, showNotebook }) {
  const panel = document.querySelector("#abandoned-journals");
  if (!panel) return { update() {}, localize() {} };
  const status = document.querySelector("#abandoned-status");
  const list = document.querySelector("#abandoned-list");
  const refresh = document.querySelector("#abandoned-refresh");
  const client = createJournalClient(localStorage);
  let result, error = "", working = false, queued = false, lastKey;
  function localize() {
    const state = context();
    panel.hidden = !state;
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
          result = next;
          persist(next.sidequests, next.published);
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
    const key = state ? `${state.serverJourney?.id}:${state.elapsedMinutes}:${state.ended}` : "";
    if (key !== lastKey) {
      if (state?.serverJourney?.id !== lastKey?.split(":")[0]) result = undefined;
      lastKey = key;
      void sync();
    }
    localize();
  }
  refresh.addEventListener("click", () => sync());
  window.addEventListener("online", () => sync());
  // Retry durable death notices even if the player has already started another run.
  const retry = setInterval(() => { if (error) void sync(); }, 30_000);
  retry.unref?.();
  void sync();
  return { update, localize };
}
