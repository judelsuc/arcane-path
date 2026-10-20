import briefs from "./public/narrative-briefs.json" with { type: "json" };
import { CLOSING_STORY, closingSummary } from "./closing-story.mjs";

export const NARRATIVE_BRIEFS = Object.freeze(briefs);
export const OPENING_STORY = "story.opening";
export const LOST_PLAYER_DREAM = "dream.lost-player";
export const JOURNAL_SUBTITLE = "journal.subtitle";

export function eventWordingContext(state) {
  if (!Number.isFinite(state?.elapsedMinutes)) return null;
  return { day: Math.floor(state.elapsedMinutes / 1440),
    walkingKm: Math.floor((state.distanceMeters ?? 0) / 1000),
    sleeps: state.sleeps ?? 0, encounters: state.events?.count ?? 0, daily: state.dailyCard };
}

const messages = {
  en: {
    pending: "Writing the text—please wait. The existing text remains available.",
    ready: "Your generated text is ready.",
    usingGenerated: "AI-generated introduction, version {number}/{total}. Game effects are unchanged.",
    authoredPending: "Authored introduction shown. Generated wording is still being prepared for later encounters.",
    authoredReady: "Authored introduction shown for this encounter. Generated wording is ready for the next encounter.",
    failed: "The text could not be written. The original text is still available.",
    disabled: "Text generation is unavailable. The original text is shown.",
    local: "Generated text is unavailable for this saved journey. The original text is shown.",
  },
  fr: {
    pending: "Écriture du texte en cours — veuillez patienter. Le texte existant reste disponible.",
    ready: "Votre texte généré est prêt.",
    usingGenerated: "Introduction générée par IA, version {number}/{total}. Les effets du jeu sont inchangés.",
    authoredPending: "Introduction écrite affichée. La formulation générée est en préparation pour de prochaines rencontres.",
    authoredReady: "Introduction écrite affichée pour cette rencontre. La formulation générée est prête pour la prochaine rencontre.",
    failed: "L'écriture du texte a échoué. Le texte d'origine reste disponible.",
    disabled: "La génération du texte est indisponible. Le texte d'origine est affiché.",
    local: "Le texte généré n'est pas disponible pour cette sauvegarde. Le texte d'origine est affiché.",
  },
};

// Closing stories additionally accept bounded counters, never free-form journal content.
export function createLiveNarrative({
  fetcher = fetch, schedule = setTimeout, cancel = clearTimeout, pollMs = 5000,
} = {}) {
  let owner, access, epoch = 0, busy = false, disabled = false, timer;
  const records = new Map(), waiting = new Set(), listeners = new Set(), requests = new Map();
  let endingSummary;
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
    requests.clear();
    waiting.clear();
    endingSummary = undefined;
  }
  const emit = () => { for (const listener of listeners) listener(); };
  const keyFor = (state, id) => id.startsWith("event.") && Number.isFinite(state?.elapsedMinutes)
    ? `${id}:day:${Math.floor(state.elapsedMinutes / 1440)}:named:${state.storyNameFlavour === true}` : id;
  async function pump() {
    if (busy || !access || disabled || !waiting.size) return;
    busy = true;
    const current = epoch, credentials = access;
    try {
      for (const key of [...waiting]) {
        if (current !== epoch || disabled) return;
        waiting.delete(key);
        const { id, ...extra } = requests.get(key);
        try {
          const { token, ...identity } = credentials;
          const response = await fetcher("/api/live-narrative", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Journal-Capability": token },
            body: JSON.stringify({ ...identity, brief: id,
              ...(id === CLOSING_STORY ? { summary: endingSummary } : {}),
              ...extra }),
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
          if (result.previousText !== undefined && !validText(result.previousText)) {
            throw new Error("Invalid preserved opening story.");
          }
          records.set(key, result);
          disabled = !result.enabled;
          if (["queued", "running"].includes(result.status)) waiting.add(key);
          if (result.status === "failed") console.warn("Optional live wording failed:", id, result.error);
          emit();
        } catch (error) {
          if (current !== epoch) return;
          console.error("Optional live wording request failed:", id, error);
          const previous = records.get(key);
          records.set(key, { status: "failed", previousText: previous?.text ?? previous?.previousText });
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
        const key = keyFor(state, id);
        if (!records.has(key) && !waiting.has(key)) {
          const context = id.startsWith("event.") ? eventWordingContext(state) : null;
          requests.set(key, { id, ...(context ? { context } : {}),
            ...(id === OPENING_STORY || context && state.storyNameFlavour === true ? { nameFlavour: true } : {}) });
          records.set(key, { status: "queued" });
          waiting.add(key);
        }
      }
      if (!timer) void pump();
    },
    snapshot(state, id, variant = 0) {
      activate(state);
      const record = records.get(keyFor(state, id));
      if (record?.status !== "ready") return record?.previousText ? { ...record.previousText } : null;
      const versions = [record.text, ...(record.alternatives ?? [])];
      return { ...versions[variant % versions.length] };
    },
    introductionStatus(state, id, language, generated, variant = 0) {
      activate(state);
      const copy = messages[language === "en" ? "en" : "fr"];
      const record = records.get(keyFor(state, id));
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
      const status = !access ? "local" : disabled ? "disabled" : records.get(keyFor(state, id))?.status ?? "pending";
      return messages[language === "en" ? "en" : "fr"][["queued", "running"].includes(status) ? "pending" : status];
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    regenerateOpening(state, requestId = crypto.randomUUID().replaceAll("-", "")) {
      activate(state);
      if (!access || state.storyNameFlavour !== true) throw new Error("Fictional-name consent and server access are required.");
      if (waiting.has(OPENING_STORY)) throw new Error("A biography is still being prepared.");
      const previous = records.get(OPENING_STORY);
      records.set(OPENING_STORY, { status: "queued", previousText: previous?.text ?? previous?.previousText });
      requests.set(OPENING_STORY, { id: OPENING_STORY, regenerate: requestId, nameFlavour: true });
      waiting.add(OPENING_STORY);
      disabled = false;
      if (timer) cancel(timer);
      timer = undefined;
      void pump();
      emit();
    },
    regenerateClosing(state, requestId = crypto.randomUUID().replaceAll("-", "")) {
      activate(state);
      const summary = closingSummary(state);
      if (!access || !summary) throw new Error("A completed journey and server access are required.");
      if (["queued", "running"].includes(records.get(CLOSING_STORY)?.status)) {
        throw new Error("A chronicle is still being written.");
      }
      endingSummary ??= summary;
      const previous = records.get(CLOSING_STORY);
      records.set(CLOSING_STORY, { status: "queued", previousText: previous?.text ?? previous?.previousText });
      requests.set(CLOSING_STORY, { id: CLOSING_STORY, regenerate: requestId });
      waiting.add(CLOSING_STORY);
      disabled = false;
      if (timer) cancel(timer);
      timer = undefined;
      void pump();
      emit();
    },
    pending(state, id) {
      activate(state);
      return ["queued", "running"].includes(records.get(keyFor(state, id))?.status);
    },
    reset() { activate(null); },
  };
}
