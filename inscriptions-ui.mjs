import { CARVE_MINUTES, MAX_INSCRIPTION, carvingBlocker, createInscriptionsClient,
  inscriptionSurface, inscriptionText } from "./inscriptions.mjs";

const POLL_MS = 2000;
const MAX_POLLS = 60;
const CELL_CACHE_MS = 60_000;

export function setupInscriptions(t, { context, carve, request = createInscriptionsClient(), onUpdate = () => {},
  wait = POLL_MS } = {}) {
  const $ = id => document.getElementById(id);
  const dialog = $("inscriptions-dialog");
  const trigger = $("open-inscriptions");
  const input = $("inscriptions-text");
  let view = null, generation = 0, timer = null, busy = false;
  const cellCache = new Map(), cellRequests = new Map();
  let cellKey = null, cellGeneration = 0, cellEpoch = 0, cellView = null;

  function keyFor(state, cell) {
    if (!state?.serverJourney?.id || !state.journalAccess || !Number.isSafeInteger(state.col) ||
        !Number.isSafeInteger(state.row) || state.ended ||
        !inscriptionSurface(cell)) return null;
    return `${state.serverJourney.id}:${state.col}:${state.row}`;
  }

  function publicView(result) {
    return { surface: result.surface,
      inscriptions: result.inscriptions.map(item => ({ text: item.text })) };
  }

  function updateCellView(key, result) {
    const next = publicView(result);
    const previous = cellCache.get(key);
    const changed = !previous || JSON.stringify(previous.view) !== JSON.stringify(next);
    cellCache.set(key, { view: next, cachedAt: Date.now() });
    if (cellKey === key) {
      const displayedChanged = JSON.stringify(cellView) !== JSON.stringify(next);
      cellView = next;
      if (changed || displayedChanged) onUpdate();
    }
  }

  function enterCell(state, cell) {
    const key = keyFor(state, cell);
    if (key === cellKey) return;
    cellKey = key;
    const token = ++cellGeneration;
    const cached = key && cellCache.get(key);
    cellView = cached?.view ?? null;
    if (!key || (cached && Date.now() - cached.cachedAt < CELL_CACHE_MS)) return;
    if (cellRequests.has(key)) {
      cellRequests.get(key).then(result => {
        if (token === cellGeneration && cellKey === key) updateCellView(key, result);
      }).catch(() => {});
      return;
    }
    const epoch = cellEpoch;
    const pending = Promise.resolve().then(() => request(state, "list"));
    cellRequests.set(key, pending);
    pending.then(result => {
      if (cellRequests.get(key) === pending) cellRequests.delete(key);
      if (epoch !== cellEpoch) return;
      if (token === cellGeneration && cellKey === key) updateCellView(key, result);
      else cellCache.set(key, { view: publicView(result), cachedAt: Date.now() });
    }).catch(() => {
      if (cellRequests.get(key) === pending) cellRequests.delete(key);
    });
  }

  function currentCellView() {
    return cellView;
  }

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
        const current = context();
        const currentKey = current && keyFor(current.state, current.cell);
        if (currentKey) updateCellView(currentKey, view);
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
      const currentKey = keyFor(current.state, current.cell);
      if (currentKey) updateCellView(currentKey, result);
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
  function reset() {
    close();
    cellEpoch++;
    cellGeneration++;
    cellKey = null;
    cellView = null;
    cellCache.clear();
    cellRequests.clear();
    onUpdate();
  }
  return { localize, open, enter: enterCell, current: currentCellView, reset };
}
