import { createTownLegendsClient, townLegendIdentity } from "./town-legends.mjs";
import { DECOY_PLATFORM_VERSION, DECOY_INVESTIGATION_VERSION, CATALOGUE_DUNGEON_VERSION } from "./legend-session.mjs";
import { treasureId, treasureItem, treasureEquipment } from "./legend-rewards.mjs";
import { createTownLegendNarratives } from "./legend-narrative.mjs";

const WORDS = {
  en: {
    title: "Town legends", loading: "Recording this town's legend status…",
    empty: "No town discoveries recorded yet.", none: "No treasure legend recorded for this town.",
    pending: "This town holds a treasure legend. Its adventure is not prepared yet.",
    ready: "A story of hidden treasure is told here.",
    untold: "People hint that an old story is told here. Ask the inhabitants.",
    firstTelling: "There is indeed a story told around here… let me remember it properly.",
    searchPending: "The search area is not prepared yet. Explore nearby terrain, return and retry discovery.",
    search: "What people remember",
    found: "Entrance discovered.",
    notes: "Observed search details", retrySearch: "Prepare the search area",
    story: "Hear the local legend",
    storyPending: "The local legend is being written. The entrance clues remain available.",
    storyFailed: "The local legend could not be written. No automatic retry; the entrance clues remain available.",
    storyDisabled: "Story generation is unavailable. The entrance clues remain available.",
    noStory: "I do not know any treasure legend from this place.",
    private: "Town legend history requires a private server journey.",
    retry: "Retry discovery", history: "Load discovery history", more: "Load more towns",
    error: "Town legend discovery failed:",
    discovered: "Discovered towns",
    recover: "Recover the treasure",
    rewardTerms: "Eight rooms. Base room entry: 3 minutes, 1 fatigue, 1 dirt. Trap: +2 minutes, +3 fatigue, -5 health, +4 dirt. Creature hit: +1 minute, +1 fatigue, -2 health, +1 dirt. Equipped jewellery modifies these cumulative costs as described in Inventory. Normal journey survival applies. Only the first successful explorer recovers the original treasure. The object takes space and weight in your bag; if your bag is full, it stays at the entrance. Any appearance works only while carried; equipment effects require equipping it. Money and charts are consumed when used. Confirm entry?",
    localTerms: " Wrong puzzle attempts cost +2 minutes and +1 fatigue. Secret stashes grant €1 or 150 kcal each, only on the first successful recovery; leaving, interruption and restarting grant none. Gameplay runs locally; costs settle on completion or leaving. Reload discards unfinished damage, progress and food, but retains the entry cost. Restarting charges entry again.",
  },
  fr: {
    title: "Légendes locales", loading: "Enregistrement de la légende de cette ville…",
    empty: "Aucune découverte de ville enregistrée.", none: "Aucune légende de trésor enregistrée pour cette ville.",
    pending: "Cette ville possède une légende de trésor. Son aventure n'est pas encore préparée.",
    ready: "On raconte ici l'histoire d'un trésor caché.",
    untold: "On murmure qu'une vieille histoire circule ici. Interrogez les habitants.",
    firstTelling: "Il se raconte bien une histoire par ici… laissez-moi m'en souvenir.",
    searchPending: "La zone de recherche n'est pas encore préparée. Explorez les environs, revenez et réessayez.",
    search: "Ce qu'on raconte",
    found: "Entrée découverte.",
    notes: "Détails observés", retrySearch: "Préparer la zone de recherche",
    story: "Écouter la légende locale",
    storyPending: "La légende locale est en cours d'écriture. Les indices d'entrée restent disponibles.",
    storyFailed: "La légende n'a pas pu être écrite. Aucun nouvel essai automatique ; les indices restent disponibles.",
    storyDisabled: "La génération du récit est indisponible. Les indices d'entrée restent disponibles.",
    noStory: "Je ne connais pas de légende de trésor en ce lieu.",
    private: "L'historique des légendes nécessite un voyage privé sur le serveur.",
    retry: "Réessayer la découverte", history: "Charger l'historique", more: "Charger d'autres villes",
    error: "Échec de découverte de légende :",
    discovered: "Villes découvertes",
    recover: "Retrouver le trésor",
    rewardTerms: "Huit salles. Entrée de base : 3 minutes, 1 fatigue, 1 saleté. Piège : +2 minutes, +3 fatigue, -5 santé, +4 saleté. Créature : +1 minute, +1 fatigue, -2 santé, +1 saleté. Les bijoux équipés modifient ces coûts cumulés comme indiqué dans l'inventaire. Survie habituelle du voyage. Seul le premier explorateur qui réussit recueille le trésor original. L'objet prend de la place et du poids dans le sac ; si le sac est plein, il reste à l'entrée. Une apparence fonctionne uniquement tant qu'il est porté ; les effets d'équipement nécessitent de l'équiper. Argent et cartes se consomment à l'utilisation. Confirmer l'entrée ?",
    localTerms: " Une erreur d'énigme coûte +2 minutes et +1 fatigue. Les caches rapportent 1 € ou 150 kcal chacune, uniquement lors de la première récupération réussie ; quitter, être interrompu ou recommencer ne rapporte rien. Jeu local ; coûts validés en terminant ou en quittant. Recharger abandonne dégâts, progression et nourriture non validés, mais conserve le coût d'entrée. Recommencer facture une nouvelle entrée.",
  },
};

export function setupTownLegends({ context, host = document.getElementById("quests-legend-discovery"),
  client = createTownLegendsClient(), startTrial, confirmTrial = message => confirm(message),
  narrative = createTownLegendNarratives(), onNarrative = () => {}, onDiscovery = () => {} } = {}) {
  let owner, position, current, error = "", loading = false, historyLoading = false;
  let controller, historyController, cursor = null, historyLoaded = false;
  const entries = new Map();
  const doc = host.ownerDocument;
  function node(tag, value) {
    const element = doc.createElement(tag);
    element.textContent = value;
    host.append(element);
    return element;
  }
  function button(value, callback, disabled) {
    const element = node("button", value);
    element.type = "button";
    element.disabled = disabled;
    element.addEventListener("click", callback);
  }
  function render() {
    const language = doc.documentElement.lang === "en" ? "en" : "fr";
    const c = WORDS[language];
    host.replaceChildren();
    node("h3", c.title);
    if (!owner) { node("p", c.private).className = "window-help-text"; return; }
    if (loading) node("p", c.loading).setAttribute("role", "status");
    if (error) node("p", `${c.error} ${error}`).setAttribute("role", "alert");
    if (position && !current && !loading) button(c.retry, () => { void discover(); }, !!context()?.blocked);
    const status = entry => !entry.eligible ? c.none
      : entry.exploration?.status === "untold" ? c.untold
      : entry.exploration?.clues ? c.ready : c.pending;
    if (current) node("p", `${current.town}: ${status(current)}`).setAttribute("role", "status");
    if (current?.exploration?.status === "pending") {
      node("p", c.searchPending).className = "window-help-text";
      button(c.retrySearch, () => { void discover(); }, loading || !!context()?.blocked);
    }
    const entrance = [...entries.values()].find(entry => atEntrance(entry));
    if (entrance && startTrial) {
      node("h4", `${entrance.town} — ${c.found}`);
      const reward = treasureItem(treasureId(entrance.townId, entrance.seed, !!entrance.reward), entrance.reward);
      node("p", reward[language]);
      if (reward.effect) node("p", reward.effect[language]);
      button(c.recover, () => { startEntrance(); }, !!context()?.blocked);
    }
    if (entries.size) {
      node("h4", c.discovered);
      const list = node("ul", "");
      for (const entry of [...entries.values()].sort((a, b) => a.town.localeCompare(b.town))) {
        const item = doc.createElement("li");
        item.textContent = `${entry.town} — ${status(entry)}`;
        if (entry.exploration?.clues) {
          const story = narrative.get(context()?.state, entry.townId);
          const paragraph = doc.createElement("p");
          if (story?.status === "ready") {
            const name = story.treasureName?.[language];
            paragraph.textContent = [name && !story.text[language].includes(name) ? name : "", story.text[language]]
              .filter(Boolean).join(" — ");
          } else if (story) paragraph.textContent = storyStatus(story, c);
          else {
            const requestedOwner = owner;
            const hear = doc.createElement("button");
            hear.type = "button";
            hear.textContent = c.story;
            hear.disabled = !!context()?.blocked;
            hear.addEventListener("click", () => {
              const captured = context();
              if (!captured?.blocked && requestedOwner ===
                  `${captured?.state?.serverJourney?.id}:${captured?.state?.journalAccess}`) {
                narrative.request(captured.state, entry.townId);
              }
            });
            item.append(hear);
          }
          if (story) {
            paragraph.setAttribute("role", "status");
            item.append(paragraph);
          }
          const intro = doc.createElement("p");
          intro.textContent = c.search;
          item.append(intro);
          for (const clue of entry.exploration.clues[language]) {
            const text = doc.createElement("p");
            text.textContent = clue;
            item.append(text);
          }
          if (entry.exploration.status === "found") {
            const found = doc.createElement("p");
            found.textContent = c.found;
            item.append(found);
          }
          const notes = doc.createElement("details");
          const summary = doc.createElement("summary");
          summary.textContent = `${c.notes} (${entry.exploration.observations.length})`;
          notes.append(summary);
          for (const observation of entry.exploration.observations) {
            const text = doc.createElement("p");
            text.textContent = `(${observation.col}, ${observation.row}) — ${observation.description[language]}`;
            notes.append(text);
          }
          item.append(notes);
        }
        list.append(item);
      }
    } else if (historyLoaded) node("p", c.empty);
    if (!historyLoaded || cursor) button(historyLoaded ? c.more : c.history,
      () => { void history(); }, historyLoading);
  }
  function atEntrance(entry) {
    const state = context()?.state;
    return state && owner === `${state.serverJourney?.id}:${state.journalAccess}` &&
      entry.exploration?.status === "found" && entry.exploration.observations.some(item =>
        item.found && item.col === state.col && item.row === state.row);
  }
  // Starts the treasure trial at the current entrance. Shared between the
  // legends page and the direct map action.
  function startEntrance() {
    const language = doc.documentElement.lang === "en" ? "en" : "fr", c = WORDS[language];
    const entrance = [...entries.values()].find(entry => atEntrance(entry));
    if (!entrance || !startTrial || context()?.blocked) return false;
    const effect = treasureEquipment(context()?.state).jewel?.effect;
    const modifiers = effect ? ` ${effect[language]}` : "";
    const version = { platform: DECOY_PLATFORM_VERSION, investigation: DECOY_INVESTIGATION_VERSION,
      dungeon: CATALOGUE_DUNGEON_VERSION }[entrance.format];
    if (!confirmTrial(c.rewardTerms + modifiers + c.localTerms)) return true;
    startTrial({ type: "legend-start", townId: entrance.townId, contentVersion: version });
    return true;
  }
  function storyStatus(story, c) {
    return story.status === "disabled" ? c.storyDisabled : story.status === "failed" ? c.storyFailed : c.storyPending;
  }
  narrative.subscribe(() => { render(); onNarrative(); });
  // An inhabitant telling the legend is what unlocks its clues: triggered by
  // the conversation topic, spontaneously on first contact in a legend town.
  let disclosing;
  async function discloseEntry(state, townId) {
    if (disclosing) return;
    disclosing = townId;
    try {
      const result = await client.disclose(state);
      if (result.entry.townId !== townId) throw new Error("Disclosed legend belongs to a different town.");
      retainEntry(result.entry);
      const captured = context();
      if (captured && !captured.blocked) narrative.request(captured.state, townId);
      render();
      onDiscovery();
      onNarrative();
    } catch (reason) {
      console.error("Legend disclosure failed:", reason);
    } finally {
      disclosing = undefined;
    }
  }
  function retainEntry(entry) {
    const previous = entries.get(entry.townId)?.exploration, incoming = entry.exploration;
    if (previous?.clues) {
      const notes = new Map(previous.observations.map(item => [`${item.col},${item.row}`, item]));
      for (const item of incoming?.observations ?? []) {
        const key = `${item.col},${item.row}`;
        notes.set(key, { ...item, found: item.found || notes.get(key)?.found || false });
      }
      entry = { ...entry, exploration: { ...(incoming?.clues ? incoming : previous),
        observations: [...notes.values()], status: [...notes.values()].some(item => item.found) ? "found" : "searching" } };
    }
    entries.set(entry.townId, entry);
    if (current?.townId === entry.townId) current = entry;
    return entry;
  }
  async function discover() {
    const captured = context();
    if (!captured || captured.blocked || !owner || !position || loading) return;
    controller?.abort();
    const request = new AbortController();
    controller = request;
    const requestedPosition = position;
    loading = true;
    error = "";
    render();
    try {
      const result = await client.discover(captured.state, request.signal);
      if (request.signal.aborted || position !== requestedPosition) return;
      if (result.entry.townId !== townLegendIdentity(captured.cell)) throw new Error("Town legend response belongs to a different town.");
      current = retainEntry(result.entry);
      onDiscovery();
    } catch (reason) {
      if (request.signal.aborted) return;
      console.error("Town legend discovery unavailable:", reason);
      error = reason.message;
    } finally {
      if (!request.signal.aborted) { loading = false; render(); }
    }
  }
  async function history() {
    const captured = context();
    if (!captured || !owner || historyLoading) return;
    historyController?.abort();
    const request = new AbortController();
    historyController = request;
    historyLoading = true;
    error = "";
    render();
    try {
      const result = await client.list(captured.state, cursor, request.signal);
      if (request.signal.aborted) return;
      for (const entry of result.entries) retainEntry(entry);
      cursor = result.cursor;
      historyLoaded = true;
    } catch (reason) {
      if (request.signal.aborted) return;
      console.error("Town legend history unavailable:", reason);
      error = reason.message;
    } finally {
      if (!request.signal.aborted) { historyLoading = false; render(); }
    }
  }
  function reset() {
    narrative.reset();
    controller?.abort();
    historyController?.abort();
    owner = position = current = undefined;
    loading = historyLoading = historyLoaded = false;
    cursor = null;
    error = "";
    entries.clear();
  }
  return {
    reset,
    startEntrance,
    telling(character, request = false) {
      const captured = context(), language = doc.documentElement.lang === "en" ? "en" : "fr", c = WORDS[language];
      const entry = entries.get(townLegendIdentity(captured?.cell));
      if (!character || owner !== `${captured?.state?.serverJourney?.id}:${captured?.state?.journalAccess}`) {
        return { text: c.noStory, status: "" };
      }
      if (entry?.exploration?.status === "untold") {
        if (request && !captured.blocked) void discloseEntry(captured.state, entry.townId);
        return { text: c.firstTelling, status: "", untold: true };
      }
      if (!entry?.exploration?.clues) return { text: c.noStory, status: "" };
      if (request && !captured.blocked) narrative.request(captured.state, entry.townId);
      const story = narrative.get(captured.state, entry.townId);
      let hash = 0;
      for (const letter of `${character.id}:${character.role}`) hash = (Math.imul(hash, 31) + letter.charCodeAt(0)) >>> 0;
      const prose = story?.status === "ready" ? story.alternatives[hash % 3][language] : "";
      const name = story?.treasureName?.[language];
      const retainedName = name ?? entry.reward?.name?.[language];
      return { text: [retainedName && !prose.includes(retainedName) ? retainedName : "", prose,
        ...entry.exploration.clues[language]].filter(Boolean).join(" "),
        status: story && story.status !== "ready" ? storyStatus(story, c) : "" };
    },
    acceptEntry(entry) {
      retainEntry(entry);
      render();
    },
    observe(observation) {
      const entry = entries.get(observation.townId);
      if (!entry) { if (!historyLoaded && !historyLoading) void history(); return; }
      if (!entry.exploration?.clues) return;
      const search = entry.exploration;
      const notes = search.observations.filter(item =>
        item.col !== observation.location.col || item.row !== observation.location.row);
      notes.push({ ...observation.location, description: observation.description, found: observation.found });
      entry.exploration = { ...search, observations: notes, status: observation.found ? "found" : search.status };
      render();
    },
    localize() {
      const captured = context();
      const state = captured?.state;
      const nextOwner = state?.serverJourney?.id && state.journalAccess
        ? `${state.serverJourney.id}:${state.journalAccess}` : null;
      if (nextOwner !== owner) { reset(); owner = nextOwner; }
      const identity = townLegendIdentity(captured?.cell);
      const nextPosition = nextOwner && identity ? `${identity}:${state.col},${state.row}` : null;
      if (nextPosition !== position) {
        controller?.abort();
        loading = false;
        current = undefined;
        error = "";
        position = nextPosition;
        if (position && !captured.blocked) void discover();
      } else if (position && !current && !loading && !error && !captured.blocked) {
        void discover();
      }
      render();
    },
  };
}
