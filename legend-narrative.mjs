const BRIEF = "legend.town";
const text = value => value && ["en", "fr"].every(language =>
  typeof value[language] === "string" && value[language].trim() === value[language] &&
  value[language].length >= 40 && value[language].length <= 700);

export function createTownLegendNarratives({ fetcher = fetch, schedule = setTimeout,
  cancel = clearTimeout, pollMs = 5000 } = {}) {
  let owner, controller, timer, epoch = 0;
  const records = new Map(), waiting = new Map(), listeners = new Set();
  const emit = () => { for (const listener of listeners) listener(); };
  function activate(state) {
    const next = state?.serverJourney?.id && state.journalAccess
      ? `${state.serverJourney.id}:${state.journalAccess}` : null;
    if (next === owner) return;
    controller?.abort();
    cancel(timer);
    controller = timer = undefined;
    owner = next;
    epoch++;
    waiting.clear();
    records.clear();
  }
  async function pump() {
    if (controller || !waiting.size) return;
    const current = new AbortController(), generation = epoch;
    controller = current;
    try {
      for (const [townId, state] of [...waiting]) {
        waiting.delete(townId);
        try {
          const response = await fetcher("/api/live-narrative", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Journal-Capability": state.journalAccess },
            body: JSON.stringify({ journey: state.serverJourney.id, brief: BRIEF, townId }),
            signal: AbortSignal.any([current.signal, AbortSignal.timeout(20000)]),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error ?? `Town legend narrative HTTP ${response.status}`);
          if (current.signal.aborted || generation !== epoch) return;
          if (result.brief !== BRIEF || typeof result.enabled !== "boolean" ||
              !["queued", "running", "ready", "failed", "disabled"].includes(result.status) ||
              result.status === "ready" && (!text(result.text) || !Array.isArray(result.alternatives) ||
                result.alternatives.length !== 3 || !result.alternatives.every(text)) ||
              result.treasureName !== undefined && (!result.treasureName ||
                !["en", "fr"].every(language => typeof result.treasureName[language] === "string" &&
                  result.treasureName[language].trim() && result.treasureName[language].length <= 100))) {
            throw new Error("Invalid generated town legend.");
          }
          records.set(townId, result);
          if (["queued", "running"].includes(result.status)) waiting.set(townId, state);
          if (result.status === "failed") console.warn("Town legend wording failed:", result.error);
          emit();
        } catch (error) {
          if (current.signal.aborted || generation !== epoch) return;
          console.error("Town legend wording unavailable:", error);
          records.set(townId, { status: "failed", error: error.message });
          emit();
        }
      }
    } finally {
      if (generation === epoch) {
        controller = undefined;
        if (waiting.size) timer = schedule(() => { timer = undefined; void pump(); }, pollMs);
      }
    }
  }
  return {
    request(state, townId) {
      activate(state);
      if (!owner || records.has(townId)) return;
      records.set(townId, { status: "queued" });
      waiting.set(townId, state);
      emit();
      if (!timer) void pump();
    },
    get(state, townId) { activate(state); return records.get(townId); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    reset() { activate(null); },
  };
}
