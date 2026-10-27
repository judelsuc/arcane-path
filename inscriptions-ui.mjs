import { CARVE_MINUTES, MAX_INSCRIPTION, carvingBlocker, createInscriptionsClient,
  inscriptionSurface, inscriptionText } from "./inscriptions.mjs";

const POLL_MS = 2000;
const MAX_POLLS = 60;

export function setupInscriptions(t, { context, carve, request = createInscriptionsClient(), wait = POLL_MS } = {}) {
  const $ = id => document.getElementById(id);
  const dialog = $("inscriptions-dialog");
  const trigger = $("open-inscriptions");
  const input = $("inscriptions-text");
  let view = null, generation = 0, timer = null, busy = false;

  function status(message, failure = false) {
    $("inscriptions-error").textContent = failure ? message : "";
    $("inscriptions-error").hidden = !failure;
    $("inscriptions-status").textContent = failure ? "" : message;
  }

  function stopPolling() {
    clearTimeout(timer);
    timer = null;
  }

  function ownText(own) {
    if (!own) return "";
    const reason = own.reason ? t(`inscriptions.reason.${own.reason}`) : "";
    return t(`inscriptions.own.${own.status}`, { text: own.text, reason });
  }

  function render() {
    const current = context();
    const surface = view?.surface ?? inscriptionSurface(current?.cell);
    $("inscriptions-context").textContent = surface ? t(`inscriptions.surface.${surface}`) : "";
    const list = $("inscriptions-list");
    list.replaceChildren();
    for (const item of view?.inscriptions ?? []) {
      const entry = document.createElement("li");
      const text = document.createElement("q");
      text.textContent = item.text;
      entry.append(text);
      if (item.own) {
        entry.append(" ", t("inscriptions.yours"));
      } else {
        const report = document.createElement("button");
        report.type = "button";
        report.textContent = t(item.reported ? "inscriptions.reported" : "inscriptions.report");
        report.disabled = item.reported || busy;
        report.addEventListener("click", () => act("report", { inscription: item.id }, "inscriptions.reportDone"));
        entry.append(" ", report);
      }
      list.append(entry);
    }
    $("inscriptions-empty").hidden = !view || view.inscriptions.length > 0;
    const own = $("inscriptions-own");
    own.textContent = ownText(view?.own);
    own.hidden = !view?.own;
    $("inscriptions-retry").hidden = !view?.own?.retryable;
    $("inscriptions-retry").disabled = busy;
    const blocker = current ? carvingBlocker(current.state, current.cell) : "surface";
    const locked = view?.own && ["pending", "approved", "hidden"].includes(view.own.status);
    $("inscriptions-rules").textContent = t("inscriptions.rules", {
      minutes: CARVE_MINUTES, max: MAX_INSCRIPTION, remaining: view?.remainingToday ?? "—" });
    $("inscriptions-blocker").textContent = blocker && blocker !== "offline" ? t(`inscriptions.blocker.${blocker}`) : "";
    $("inscriptions-blocker").hidden = !blocker || blocker === "offline";
    $("inscriptions-carve").disabled = busy || Boolean(blocker) || current?.blocked || Boolean(locked) ||
      !view || view.remainingToday < 1 || !input.value.trim();
    input.disabled = busy || Boolean(locked);
  }

  function schedule(token, polls) {
    stopPolling();
    if (view?.own?.status !== "pending" || polls >= MAX_POLLS) return;
    timer = setTimeout(async () => {
      if (token !== generation || !dialog.open) return;
      try {
        view = await request(context().state, "list");
        if (token !== generation) return;
        render();
        schedule(token, polls + 1);
      } catch (error) {
        if (token === generation) status(error.message, true);
      }
    }, wait);
  }

  async function act(action, details = {}, success = null, before = null) {
    const current = context();
    if (!current || busy) return;
    const token = generation;
    busy = true;
    status(t("inscriptions.loading"));
    render();
    try {
      const result = await request(current.state, action, details);
      if (token !== generation) return;
      view = result;
      before?.();
      status(success ? t(success) : "");
      schedule(token, 0);
    } catch (error) {
      if (token === generation) status(error.message, true);
    } finally {
      if (token === generation) {
        busy = false;
        render();
      }
    }
  }

  function open() {
    const current = context();
    if (!current || current.blocked || document.querySelector("dialog[open]") ||
        !inscriptionSurface(current.cell)) return;
    generation++;
    view = null;
    input.value = "";
    status("");
    dialog.showModal();
    render();
    act("list");
  }

  function close() {
    generation++;
    stopPolling();
    busy = false;
    if (dialog.open) dialog.close();
  }

  input.maxLength = MAX_INSCRIPTION;
  input.addEventListener("input", render);
  trigger.addEventListener("click", open);
  $("inscriptions-close").addEventListener("click", close);
  $("inscriptions-retry").addEventListener("click", () => act("retry", {}, "inscriptions.retryDone"));
  $("inscriptions-form").addEventListener("submit", event => {
    event.preventDefault();
    const current = context();
    if (!current || current.blocked || carvingBlocker(current.state, current.cell)) return render();
    let text;
    try {
      text = inscriptionText(input.value);
    } catch (error) {
      return status(error.message, true);
    }
    act("carve", { text }, "inscriptions.carved", () => {
      carve();
      input.value = "";
    });
  });
  dialog.addEventListener("cancel", event => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener("close", () => { generation++; stopPolling(); });

  function localize() {
    const current = context();
    trigger.disabled = !current || current.blocked || !inscriptionSurface(current.cell) ||
      !current.state?.serverJourney?.id;
    if (dialog.open) render();
  }
  return { localize, open, reset: close };
}
