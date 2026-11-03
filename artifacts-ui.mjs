import { createArtifactsClient } from "./artifacts-client.mjs";
import { loreItem } from "./lore-catalogue.mjs";
import { extraPower, powerCopy, blockedCopy, CARD_NAMES } from "./lore-copy.mjs";
import { TAROT_CARDS } from "./tarot-cards.mjs";
import { discoveryClueText, discoveryNotebookEntries } from "./discovery-ui.mjs";

const WORDS = {
  fr: { refresh: "Actualiser les objets", retry: "Réessayer la commande en attente",
    claim: "Chercher et recueillir",
    use: "Utiliser le pouvoir", cache: "Déposer dans une cache", share: "Partager l'inscription",
    archive: "Consulter les archives du collectionneur", empty: "Aucune piste d'objet acquise.",
    loading: "Échange avec le monde des objets…", saved: "Action enregistrée.",
    stale: "Actualisez les objets à votre position pour consulter les actions disponibles.",
    confirm: "Confirmer l'utilisation et son coût ?", target: "Cible du pouvoir",
    fragments: "Fragments à reconstituer (1 à 3)", cooldown: "Délai restant",
    pack: "Ranger l'objet dans le sac", rotate: "Tourner", route: "Préparer le trajet magique",
    routeKnown: "Trajet de l'Étoile (repères dorés sur la carte)",
    basics: {
      hermit: "1 min, 10 fatigue : révéler le repère exact d'un objet libre choisi.",
      chariot: "1 min, 200 kcal : foulée magique pendant 20 km, au plus 24 h.",
      temperance: "1 min, 500 kcal : récupérer 40 santé et réduire la fatigue de 40.",
      fool: "1 min, 10 fatigue : revenir dans une localité personnellement visitée.",
      wheel: "1 min, 10 fatigue : rappeler un objet déposé par vous et encore libre.",
      sun: "1 min, 500 kcal : restaurer entièrement santé et fatigue.",
    } },
  en: { refresh: "Refresh artifacts", retry: "Retry pending command",
    claim: "Search and collect",
    use: "Use power", cache: "Leave in a cache", share: "Share inscription",
    archive: "Consult the collector's archives", empty: "No artifact leads earned.",
    loading: "Contacting the artifact world…", saved: "Action saved.",
    stale: "Refresh artifacts at your position to see available actions.",
    confirm: "Confirm activation and its cost?", target: "Power target",
    fragments: "Fragments to reconstruct (1–3)", cooldown: "Remaining cooldown",
    pack: "Pack artifact", rotate: "Rotate", route: "Prepare magical route",
    routeKnown: "Star route (gold markers on the map)",
    basics: {
      hermit: "1 min, 10 fatigue: reveal the exact marker of a selected unowned artifact.",
      chariot: "1 min, 200 kcal: magical stride for 20 km, at most 24 h.",
      temperance: "1 min, 500 kcal: restore 40 health and reduce fatigue by 40.",
      fool: "1 min, 10 fatigue: return to a personally visited settlement.",
      wheel: "1 min, 10 fatigue: recall your still-unclaimed cached artifact.",
      sun: "1 min, 500 kcal: fully restore health and fatigue.",
    } },
};

export function setupArtifactQuests(t, { context, mutate, lock, beforeRequest, character = () => null,
  client = createArtifactsClient() }) {
  const talk = document.getElementById("dialogue-artifacts"), book = document.getElementById("quests-artifacts");
  const recovery = document.getElementById("artifact-recovery");
  let snapshot, working = false, retrying = false, error = "", feedback = "", owner, endingAttempt;
  let automaticAttempt, observedDistance, observedSleeps;
  let queuedRumours = [], scheduledRumour, speech, rumourError;
  const spoken = document.getElementById("conversation-artifact-rumour");
  const language = () => document.documentElement.lang === "en" ? "en" : "fr";
  function text(host, content, tag = "p") {
    const element = document.createElement(tag); element.textContent = content; host.append(element); return element;
  }
  function button(host, label, action, disabled = false) {
    const element = text(host, label, "button");
    element.type = "button"; element.disabled = disabled;
    element.addEventListener("click", action);
    return element;
  }
  async function request(action = null, allowEnded = false) {
    let current = context();
    if (!current || working || current.blocked && !client.pending(current.state) && !(allowEnded && current.state.ended)) return;
    working = true; error = feedback = ""; lock(true); localize();
    try {
      await beforeRequest?.();
      const latest = context();
      if (latest?.state.serverJourney?.id !== current.state.serverJourney.id) throw new Error("The journey changed.");
      current = latest;
      const result = await client.request(current.state, action);
      if (context()?.state.serverJourney?.id !== current.state.serverJourney.id) throw new Error("The journey changed.");
      let nextSpeech;
      if (result.conversationRumour) {
        const { artifactId, characterId, clueRevision, cluePrecision } = result.conversationRumour;
        const entries = result.state.discovery?.entries ?? [];
        const legend = entries.find(entry => entry.targetType === "artifact" &&
          entry.targetId === artifactId && entry.kind === "legend");
        const clue = entries.find(entry => entry.targetType === "artifact" &&
          entry.targetId === artifactId && entry.kind === "location" &&
          entry.targetRevision === clueRevision && entry.precision === cluePrecision);
        if (!legend || typeof characterId !== "string" || clueRevision !== null && !clue) {
          throw new Error("Missing earned character artifact knowledge.");
        }
        nextSpeech = { characterId, legend, clue };
      }
      if (!mutate(latest => ({ ...result.state,
        serviceQuests: latest.serviceQuests, questTracking: latest.questTracking,
        questDirections: latest.questDirections,
        parentWording: latest.parentWording,
      }))) throw new Error("Artifact action could not be saved; retry the pending command.");
      client.acknowledge(result.state);
      snapshot = result;
      if (nextSpeech) {
        speech = nextSpeech;
        rumourError = undefined;
      }
      observedDistance = result.state.distanceMeters;
      observedSleeps = result.state.sleeps;
      feedback = "saved";
    } catch (reason) {
      console.error("Main artifact action failed:", reason); error = reason.message;
      if (action?.type === "character-rumour" || rumourError) {
        rumourError = { characterId: action?.characterId ?? rumourError.characterId, message: reason.message };
      }
    } finally { working = retrying = false; lock(false); localize(); }
  }
  function targets(id, lang) {
    const named = ids => ids.map(value => ({ id: value, label: loreItem(value)[lang] }));
    if (id === "hermit") return named(snapshot.visionTargets.filter(value => value !== id));
    if (id === "wheel") return named(snapshot.recallTargets);
    if (id === "fool" || id === "world") return (id === "fool" ? snapshot.returnTargets : snapshot.worldTargets)
      .map(place => ({ id: place.id, label: `${place.town} · ${place.col}, ${place.row}` }));
    if (id === "priestess") return snapshot.truthTargets.map(target => ({ id: target.id,
      label: target.domain === "parent-trail" ? t("quests.parent") : target.label }));
    if (id === "judgement") return TAROT_CARDS.map((value, index) => ({ id: value, label: CARD_NAMES[lang][index] }));
    if (id === "magician") return snapshot.earningOffers.map(offer => ({ id: offer.id,
      label: `${offer.id} · €${(offer.maxRewardCents / 100).toFixed(2)}` }));
    return null;
  }
  function localize() {
    const current = context(), state = current?.state, lang = language(), c = WORDS[lang];
    recovery.replaceChildren();
    const pending = client.pending(state);
    // Routine in-flight syncs are also stored as pending; only a stuck command or explicit retry needs the banner.
    recovery.hidden = !state || !pending || working && !retrying;
    recovery.setAttribute("aria-label", t("quests.artifacts"));
    if (!recovery.hidden) {
      const status = text(recovery, error || (working ? c.loading : t("travelBlocked.artifact")));
      status.setAttribute("role", error ? "alert" : "status");
      button(recovery, c.retry, () => {
        if (working) return;
        retrying = true;
        void request();
      }, working);
    }
    if (owner !== state?.serverJourney?.id) {
      snapshot = undefined; owner = state?.serverJourney?.id; endingAttempt = automaticAttempt = undefined;
      observedDistance = state?.distanceMeters; error = feedback = "";
      observedSleeps = state?.sleeps;
      queuedRumours = []; scheduledRumour = undefined; speech = undefined; rumourError = undefined;
    }
    talk.replaceChildren(); book.replaceChildren();
    spoken.replaceChildren();
    const speaker = character();
    const speechError = rumourError?.characterId === speaker?.id ? rumourError?.message : "";
    spoken.hidden = !speaker || (!speechError && speech?.characterId !== speaker.id);
    if (!spoken.hidden) {
      if (speechError) {
        text(spoken, speechError);
        button(spoken, c.retry, () => void request(), working || current?.blocked);
      } else {
        text(spoken, discoveryClueText(speech.legend, state, t));
        const clue = speech.clue && state?.discovery?.entries.find(entry =>
          entry.targetType === "artifact" && entry.targetId === speech.clue.targetId &&
          entry.targetRevision === speech.clue.targetRevision && entry.precision === speech.clue.precision &&
          entry.evidenceKey === speech.clue.evidenceKey);
        if (clue) text(spoken,
          `${t(clue.availability === "current" ? "character.artifactLead" : "character.artifactOldLead")} ${
            discoveryClueText(clue, state, t)}`);
      }
    }
    if (!state) return;
    if (queuedRumours.length && !scheduledRumour && !working && !current.blocked && !client.pending(state)) {
      const queued = queuedRumours[0];
      scheduledRumour = queued;
      queueMicrotask(() => {
        if (scheduledRumour !== queued) return;
        scheduledRumour = undefined;
        const latest = context();
        if (working || latest?.blocked) return;
        queuedRumours.shift();
        if (latest?.state.serverJourney?.id === queued.journey && character()?.id === queued.characterId &&
            latest.state.col === queued.col && latest.state.row === queued.row) {
          void request({ type: "character-rumour", characterId: queued.characterId, eventId: queued.eventId });
        } else localize();
      });
    }
    if ((state.lore?.compass && observedDistance < state.distanceMeters ||
         state.lore?.moon && observedSleeps < state.sleeps) &&
        !working && !current.blocked && automaticAttempt !== `${state.col},${state.row}:${state.elapsedMinutes}`) {
      automaticAttempt = `${state.col},${state.row}:${state.elapsedMinutes}`;
      queueMicrotask(() => void request());
    }
    if (state.ended && state.lore?.inventory?.length && endingAttempt !== state.artifactRevision && !working) {
      endingAttempt = state.artifactRevision;
      queueMicrotask(() => void request(null, true));
    }
    const blocked = working || current.blocked || pending;
    const fresh = snapshot?.state.col === state.col && snapshot?.state.row === state.row &&
      snapshot?.state.elapsedMinutes === state.elapsedMinutes && snapshot?.revision === state.artifactRevision;
    for (const host of [talk, book]) {
      button(host, pending ? c.retry : c.refresh, () => void request(), working || current.blocked && !pending);
      const status = text(host, error || (working ? c.loading : feedback ? c[feedback] : "")); status.setAttribute("role", error ? "alert" : "status");
    }
    button(talk, c.archive, () => void request({ type: "archive" }), blocked);
    const entries = discoveryNotebookEntries(state, t).filter(entry => entry.id.includes('"artifact"'));
    if (!entries.length) text(book, c.empty);
    for (const entry of entries) text(book, entry.text);
    if (!fresh) {
      text(book, c.stale);
      for (const owned of state.lore?.inventory ?? []) text(book, loreItem(owned.id)[lang], "h3");
      return;
    }
    if (snapshot.compass) text(book, `${snapshot.compass.direction
      ? t("hintCompass." + snapshot.compass.direction) : t("quests.compass.unavailable")} · ${
      snapshot.compass.signal ? t(`quests.compass.${snapshot.compass.signal}`) : ""} · ${
      Math.ceil(snapshot.compass.remainingMinutes)} min`);
    for (const offer of snapshot.offers) {
      const section = document.createElement("section"); book.append(section);
      text(section, loreItem(offer.id)[lang], "h3");
      if (offer.blocked) text(section, blockedCopy(offer.blocked, lang));
      button(section, c.claim, () => void request({ type: "claim", id: offer.id }), blocked || Boolean(offer.blocked));
    }
    if (snapshot.route) text(book, `${c.routeKnown} · ${(snapshot.route.distanceMeters / 1000).toFixed(2)} km · ${
      Math.ceil(snapshot.route.walkingMinutes)} min`);
    for (const owned of snapshot.owned) {
      const item = loreItem(owned.id), section = document.createElement("section"); book.append(section);
      text(section, item[lang], "h3"); text(section, item.inscription[lang]);
      const description = extraPower(item.id) ? powerCopy(item.id, lang).description : c.basics[item.id];
      text(section, `${description} · ${item.grams} g · ${item.footprint.join(" × ")}`);
      if (owned.blocked) text(section, blockedCopy(owned.blocked, lang));
      if (["star", "lovers"].includes(item.id)) button(section, c.route,
        () => void request({ type: "prepare-route" }), blocked);
      const cooldown = Math.max(0, owned.cooldownUntil - snapshot.worldMinutes);
      if (cooldown) text(section, `${c.cooldown} : ${Math.ceil(cooldown)} min`);
      const options = targets(item.id, lang), select = options ? document.createElement("select") : null;
      if (select) {
        select.setAttribute("aria-label", c.target);
        for (const option of options) text(select, option.label, "option").value = option.id;
        section.append(select);
      }
      const checks = [];
      if (item.id === "hierophant") {
        text(section, c.fragments);
        for (const fragment of snapshot.fragments) {
          const label = document.createElement("label"), input = document.createElement("input");
          input.type = "checkbox"; input.value = fragment.id;
          label.append(input, document.createTextNode(loreItem(fragment.source)[lang])); section.append(label); checks.push(input);
        }
      }
      button(section, c.use, () => {
        const chosen = checks.filter(check => check.checked).map(check => check.value);
        if (item.id === "hierophant" && (chosen.length < 1 || chosen.length > 3)) {
          error = c.fragments; localize(); return;
        }
        if (confirm(`${description}\n${select?.selectedOptions[0]?.textContent ?? ""}\n${c.confirm}`)) {
          void request({ type: "use", id: item.id, ...(select ? { target: select.value } : {}),
            ...(item.id === "hierophant" ? { targets: chosen } : {}) });
        }
      }, blocked || cooldown > 0 || Boolean(owned.blocked) || options?.length === 0);
      button(section, c.cache, () => void request({ type: "cache", id: item.id }), blocked);
      const packing = document.createElement("details"); section.append(packing);
      text(packing, c.pack, "summary");
      const placement = state.lore.inventory.find(entry => entry.id === item.id).placement;
      const positions = ["x", "y"].map(axis => {
        const label = document.createElement("label"), input = document.createElement("input");
        label.textContent = axis.toUpperCase();
        input.type = "number"; input.min = "1"; input.max = axis === "x" ? "6" : "4";
        input.value = String(placement[axis] + 1); label.append(input); packing.append(label); return input;
      });
      const rotatedLabel = document.createElement("label"), rotated = document.createElement("input");
      rotated.type = "checkbox"; rotated.checked = placement.rotated;
      rotatedLabel.append(rotated, document.createTextNode(c.rotate)); packing.append(rotatedLabel);
      button(packing, c.pack, () => void request({ type: "pack", id: item.id,
        x: Number(positions[0].value) - 1, y: Number(positions[1].value) - 1, rotated: rotated.checked }), blocked);
    }
    for (const entry of state.discovery?.entries ?? []) {
      if (entry.targetType === "artifact" && entry.kind === "inscription" && !state.lore.shared.includes(entry.targetId)) {
        button(talk, `${c.share} · ${loreItem(entry.targetId)[lang]}`,
          () => void request({ type: "share", id: entry.targetId }), blocked);
      }
    }
  }
  return { localize, pending: state => client.pending(state),
    hear(rumour, speaker) {
      localize();
      const state = context()?.state;
      if (!state || rumour.characterId !== speaker.id || character()?.id !== speaker.id) return;
      queuedRumours.push({ ...rumour, journey: state.serverJourney.id, col: state.col, row: state.row });
      localize();
    },
    reset() {
      snapshot = undefined; owner = undefined; error = feedback = "";
      queuedRumours = []; speech = undefined; rumourError = undefined;
      scheduledRumour = undefined;
    } };
}
