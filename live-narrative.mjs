import briefs from "./public/narrative-briefs.json" with { type: "json" };

export const NARRATIVE_BRIEFS = Object.freeze(briefs);

const messages = {
  en: {
    pending: "Optional OVH wording is being prepared. Authored text remains available.",
    ready: "OVH wording cached. Open dialogue wording stays fixed until the next encounter.",
    failed: "Optional OVH wording failed. Authored text retained; no automatic retry.",
    disabled: "Optional OVH wording is disabled. Authored text is in use.",
    local: "This local journey has no server capability. Authored text is in use.",
  },
  fr: {
    pending: "La formulation OVH facultative est en préparation. Le texte écrit reste disponible.",
    ready: "Formulation OVH en cache. Le dialogue ouvert reste inchangé jusqu'à la prochaine rencontre.",
    failed: "Échec de la formulation OVH facultative. Texte écrit conservé ; aucun nouvel essai automatique.",
    disabled: "La formulation OVH facultative est désactivée. Le texte écrit est utilisé.",
    local: "Ce voyage local n'a pas d'autorisation serveur. Le texte écrit est utilisé.",
  },
};

// Only registry identifiers cross the network, never the save, location, notes or player name.
export function createLiveNarrative({
  fetcher = fetch, schedule = setTimeout, cancel = clearTimeout, pollMs = 5000,
} = {}) {
  let owner, access, epoch = 0, busy = false, disabled = false, timer;
  const records = new Map(), waiting = new Set(), listeners = new Set();
  function activate(state) {
    const next = state?.journalAccess && state?.serverJourney?.id
      ? `${state.serverJourney.id}:${state.journalKeeper ?? state.serverJourney.id}:${state.journalAccess}` : null;
    if (next === owner) return;
    owner = next;
    access = next ? { journey: state.serverJourney.id, token: state.journalAccess,
      ...(state.journalKeeper ? { keeper: state.journalKeeper } : {}) } : null;
    epoch++;
    busy = disabled = false;
    cancel(timer);
    timer = undefined;
    records.clear();
    waiting.clear();
  }
  const emit = () => { for (const listener of listeners) listener(); };
  async function pump() {
    if (busy || !access || disabled || !waiting.size) return;
    busy = true;
    const current = epoch, credentials = access;
    try {
      for (const id of [...waiting]) {
        if (current !== epoch || disabled) return;
        waiting.delete(id);
        try {
          const { token, ...identity } = credentials;
          const response = await fetcher("/api/live-narrative", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Journal-Capability": token },
            body: JSON.stringify({ ...identity, brief: id }), signal: AbortSignal.timeout(20000),
          });
          if (!response.ok) throw new Error(`Live wording HTTP ${response.status}`);
          const result = await response.json();
          if (current !== epoch) return;
          if (typeof result.enabled !== "boolean" || result.brief !== id ||
              !["queued", "running", "ready", "failed", "disabled"].includes(result.status) ||
              result.status === "ready" && (!result.text || ["en", "fr"].some(lang =>
                typeof result.text[lang] !== "string" || result.text[lang].length > 400))) {
            throw new Error("Invalid live wording response.");
          }
          records.set(id, result);
          disabled = !result.enabled;
          if (["queued", "running"].includes(result.status)) waiting.add(id);
          if (result.status === "failed") console.warn("Optional live wording failed:", id, result.error);
          emit();
        } catch (error) {
          if (current !== epoch) return;
          console.error("Optional live wording request failed:", id, error);
          records.set(id, { status: "failed" });
          emit();
        }
      }
    } finally {
      if (current === epoch) {
        busy = false;
        if (waiting.size && !disabled) timer = schedule(() => { timer = undefined; void pump(); }, pollMs);
      }
    }
  }
  return {
    prefetch(state, ids) {
      activate(state);
      if (!access || disabled) return;
      for (const id of ids) {
        if (!Object.hasOwn(briefs, id)) continue;
        if (!records.has(id) && !waiting.has(id)) {
          records.set(id, { status: "queued" });
          waiting.add(id);
        }
      }
      if (!timer) void pump();
    },
    snapshot(state, id) {
      activate(state);
      return records.get(id)?.status === "ready" ? { ...records.get(id).text } : null;
    },
    status(state, id, language) {
      activate(state);
      const status = !access ? "local" : disabled ? "disabled" : records.get(id)?.status ?? "pending";
      return messages[language === "en" ? "en" : "fr"][["queued", "running"].includes(status) ? "pending" : status];
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    reset() { activate(null); },
  };
}
