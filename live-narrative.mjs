import briefs from "./public/narrative-briefs.json" with { type: "json" };
import { CLOSING_STORY, closingSummary } from "./closing-story.mjs";

export const NARRATIVE_BRIEFS = Object.freeze(briefs);
export const OPENING_STORY = "story.opening";
export const LOST_PLAYER_DREAM = "dream.lost-player";
export const JOURNAL_SUBTITLE = "journal.subtitle";

const messages = {
  en: {
    pending: "Optional OVH wording is being prepared. Authored text remains available.",
    ready: "Generated OVH wording is cached.",
    usingGenerated: "AI-generated introduction (OVH), version {number}/{total}. Game effects are unchanged.",
    authoredPending: "Authored introduction shown. Generated wording is still being prepared for later encounters.",
    authoredReady: "Authored introduction shown for this encounter. Generated wording is ready for the next encounter.",
    failed: "Optional OVH wording failed. Authored text retained; no automatic retry.",
    disabled: "Optional OVH wording is disabled. Authored text is in use.",
    local: "This local journey has no server capability. Authored text is in use.",
  },
  fr: {
    pending: "La formulation OVH facultative est en préparation. Le texte écrit reste disponible.",
    ready: "La formulation générée OVH est en cache.",
    usingGenerated: "Introduction générée par IA (OVH), version {number}/{total}. Les effets du jeu sont inchangés.",
    authoredPending: "Introduction écrite affichée. La formulation générée est en préparation pour de prochaines rencontres.",
    authoredReady: "Introduction écrite affichée pour cette rencontre. La formulation générée est prête pour la prochaine rencontre.",
    failed: "Échec de la formulation OVH facultative. Texte écrit conservé ; aucun nouvel essai automatique.",
    disabled: "La formulation OVH facultative est désactivée. Le texte écrit est utilisé.",
    local: "Ce voyage local n'a pas d'autorisation serveur. Le texte écrit est utilisé.",
  },
};

// Closing stories additionally accept bounded counters, never free-form journal content.
export function createLiveNarrative({
  fetcher = fetch, schedule = setTimeout, cancel = clearTimeout, pollMs = 5000,
} = {}) {
  let owner, access, epoch = 0, busy = false, disabled = false, timer;
  const records = new Map(), waiting = new Set(), listeners = new Set();
  let endingSummary;
  function activate(state) {
    const next = state?.journalAccess && state?.serverJourney?.id
      ? `${state.serverJourney.id}:${state.journalKeeper ?? state.serverJourney.id}:${state.journalAccess}` : null;
    if (next === owner) return;
    owner = next;
    access = next ? { journey: state.serverJourney.id, token: state.journalAccess,
      nameFlavour: state.storyNameFlavour === true,
      ...(state.journalKeeper ? { keeper: state.journalKeeper } : {}) } : null;
    epoch++;
    busy = disabled = false;
    cancel(timer);
    timer = undefined;
    records.clear();
    waiting.clear();
    endingSummary = undefined;
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
          const { token, nameFlavour, ...identity } = credentials;
          const response = await fetcher("/api/live-narrative", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Journal-Capability": token },
            body: JSON.stringify({ ...identity, brief: id,
              ...(id === CLOSING_STORY ? { summary: endingSummary } : {}),
              ...(id === OPENING_STORY && nameFlavour ? { nameFlavour: true } : {}) }),
            signal: AbortSignal.timeout(20000),
          });
          if (!response.ok) throw new Error(`Live wording HTTP ${response.status}`);
          const result = await response.json();
          if (current !== epoch) return;
          const validText = text => text && ["en", "fr"].every(lang =>
            typeof text[lang] === "string" && text[lang].length >= (id === CLOSING_STORY ? 600 : id === OPENING_STORY ? 500 : 5) &&
            text[lang].length <= (id === CLOSING_STORY ? 3000 : id === OPENING_STORY ? 1800 : id === JOURNAL_SUBTITLE ? 160 : 400));
          if (typeof result.enabled !== "boolean" || result.brief !== id ||
              !["queued", "running", "ready", "failed", "disabled"].includes(result.status) ||
              result.status === "ready" && (!validText(result.text) ||
                id === LOST_PLAYER_DREAM && (!Array.isArray(result.alternatives) || result.alternatives.length !== 2) ||
                result.alternatives !== undefined && (!Array.isArray(result.alternatives) ||
                  ![0, 2].includes(result.alternatives.length) ||
                  !id.startsWith("event.") && id !== LOST_PLAYER_DREAM && result.alternatives.length !== 0 ||
                  !result.alternatives.every(validText)))) {
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
        if (!Object.hasOwn(briefs, id) && id !== OPENING_STORY && id !== CLOSING_STORY && id !== JOURNAL_SUBTITLE) continue;
        if (id === CLOSING_STORY && !endingSummary) {
          endingSummary = closingSummary(state);
          if (!endingSummary) continue;
        }
        if (!records.has(id) && !waiting.has(id)) {
          records.set(id, { status: "queued" });
          waiting.add(id);
        }
      }
      if (!timer) void pump();
    },
    snapshot(state, id, variant = 0) {
      activate(state);
      const record = records.get(id);
      if (record?.status !== "ready") return null;
      const versions = [record.text, ...(record.alternatives ?? [])];
      return { ...versions[variant % versions.length] };
    },
    introductionStatus(state, id, language, generated, variant = 0) {
      activate(state);
      const copy = messages[language === "en" ? "en" : "fr"];
      const record = records.get(id);
      if (generated) {
        const total = 1 + (record?.alternatives?.length ?? 0);
        return copy.usingGenerated.replace("{number}", String(variant % total + 1)).replace("{total}", String(total));
      }
      if (record?.status === "ready") return copy.authoredReady;
      if (access && !disabled && (!record || ["queued", "running"].includes(record.status))) return copy.authoredPending;
      return this.status(state, id, language);
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
