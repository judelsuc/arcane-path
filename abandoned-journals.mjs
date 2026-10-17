const CREATION = "arcane-journal-creation-v1:";
const OUTBOX = "arcane-journal-deaths-v1";

export function ensureJournalAccess(state) {
  if (state.journalAccess) return state;
  if (!state.serverJourney) throw new Error("A server-created journey is required to leave a notebook.");
  return { ...state, journalKeeper: crypto.randomUUID().replaceAll("-", ""),
    journalAccess: [...crypto.getRandomValues(new Uint8Array(32))]
      .map(n => n.toString(16).padStart(2, "0")).join("") };
}

export function pendingJournalCreation(storage, region, name) {
  const key = CREATION + region;
  let pending = JSON.parse(storage.getItem(key) ?? "null");
  if (!pending || pending.name !== name) {
    pending = { region, name, requestId: crypto.randomUUID(),
      capability: [...crypto.getRandomValues(new Uint8Array(32))]
        .map(n => n.toString(16).padStart(2, "0")).join("") };
    // Persist before sending: lost responses and reloads must reuse both secrets.
    storage.setItem(key, JSON.stringify(pending));
  }
  return pending;
}

export function finishJournalCreation(storage, region) {
  storage.removeItem(CREATION + region);
}

export function journalRequest(state) {
  return { journey: state.serverJourney.id, col: state.col, row: state.row,
    ended: state.ended, index: Math.min(state.trail.index, (state.trail.stages?.length ?? Infinity) - 1),
    ...(Number.isFinite(state.elapsedMinutes) ? { elapsedMinutes: state.elapsedMinutes } : {}),
    ...(state.journalKeeper ? { keeper: state.journalKeeper } : {}) };
}

export function createNotebookOutbox(index = globalThis.indexedDB) {
  let database;
  async function transaction(mode, operation) {
    database ??= new Promise((resolve, reject) => {
      if (!index) { reject(new Error("Notebook storage is unavailable.")); return; }
      const request = index.open("arcane-notebook-outbox", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("pending", { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => { database = undefined; reject(request.error); };
      request.onblocked = () => { database = undefined; reject(new Error("Notebook outbox is blocked.")); };
    });
    const db = await database;
    return new Promise((resolve, reject) => {
      const tx = db.transaction("pending", mode);
      const request = operation(tx.objectStore("pending"));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error ?? new Error("Notebook outbox write failed."));
      tx.onerror = () => reject(tx.error ?? new Error("Notebook outbox access failed."));
    });
  }
  return {
    put: entry => transaction("readwrite", store => store.put(entry)),
    list: () => transaction("readonly", store => store.getAll()),
    remove: id => transaction("readwrite", store => store.delete(id)),
  };
}

export function createJournalClient(storage, fetcher = fetch, { outbox = createNotebookOutbox() } = {}) {
  async function request(body, capability) {
    const response = await fetcher("/api/abandoned-journals", {
      method: "POST", headers: { "Content-Type": "application/json",
        "X-Journal-Capability": capability },
      body: JSON.stringify(body), signal: AbortSignal.timeout(90_000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
    return result;
  }
  function queueDeath(state) {
    if (!state?.journalAccess || state.journalPublished ||
        !["hunger", "fatigue", "sleep"].includes(state.ended)) return;
    const outbox = JSON.parse(storage.getItem(OUTBOX) ?? "{}");
    outbox[state.serverJourney.id] ??= { body: journalRequest(state), capability: state.journalAccess };
    storage.setItem(OUTBOX, JSON.stringify(outbox));
  }
  async function flush() {
    const outbox = JSON.parse(storage.getItem(OUTBOX) ?? "{}");
    for (const [id, entry] of Object.entries(outbox)) {
      await request(entry.body, entry.capability);
      // Re-read so concurrently queued deaths are never discarded.
      const current = JSON.parse(storage.getItem(OUTBOX) ?? "{}");
      delete current[id];
      storage.setItem(OUTBOX, JSON.stringify(current));
    }
  }
  async function register(state) {
    if (state.journalKeeper) await request({
      ...journalRequest(state), action: "register",
    }, state.journalAccess);
  }
  let flushing;
  async function flushNotebooks() {
    if (flushing) return flushing;
    flushing = (async () => {
      for (const entry of await outbox.list()) {
        if (entry.body.keeper) await request({ ...entry.body, action: "register",
          notebook: undefined, clues: undefined }, entry.capability);
        await request(entry.body, entry.capability);
        await outbox.remove(entry.id);
      }
    })();
    try { await flushing; }
    finally { flushing = undefined; }
  }
  return { queueDeath, flush, register,
    async publish(state, notebook, clues) {
      await outbox.put({ id: state.journalKeeper ?? state.serverJourney.id,
        body: { ...journalRequest(state), action: "publish", notebook, clues },
        capability: state.journalAccess });
      await flushNotebooks();
    },
    flushNotebooks,
    async sync(state, action = "sync", journal) {
      await register(state);
      return request({
      ...journalRequest(state), action, ...(journal ? { journal: journal.id, step: journal.step } : {}),
      }, state.journalAccess);
    } };
}
