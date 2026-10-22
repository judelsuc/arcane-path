import { createArtifactsClient } from "./artifacts-client.mjs";
import { loreItem, LORE_ITEMS } from "./lore-catalogue.mjs";
import { extraPower, powerCopy, blockedCopy, CARD_NAMES } from "./lore-copy.mjs";
import { TAROT_CARDS } from "./tarot-cards.mjs";
import { discoveryNotebookEntries } from "./discovery-ui.mjs";

const WORDS = {
  fr: { refresh: "Actualiser les objets", retry: "Réessayer la commande en attente",
    inquire: "Demander des nouvelles d'un objet", claim: "Chercher et recueillir",
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
    inquire: "Ask for news of an artifact", claim: "Search and collect",
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

export function setupArtifactQuests(t, { context, mutate, lock, beforeRequest, client = createArtifactsClient() }) {
  const talk = document.getElementById("dialogue-artifacts"), book = document.getElementById("quests-artifacts");
  let snapshot, working = false, error = "", feedback = "", owner, endingAttempt;
  let automaticAttempt, observedDistance, observedSleeps;
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
      if (!mutate(latest => ({ ...result.state,
        serviceQuests: latest.serviceQuests, questTracking: latest.questTracking,
        questDirections: latest.questDirections,
        parentWording: latest.parentWording,
      }))) throw new Error("Artifact action could not be saved; retry the pending command.");
      client.acknowledge(result.state);
      snapshot = result;
      observedDistance = result.state.distanceMeters;
      observedSleeps = result.state.sleeps;
      feedback = "saved";
    } catch (reason) {
      console.error("Main artifact action failed:", reason); error = reason.message;
    } finally { working = false; lock(false); localize(); }
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
    if (owner !== state?.serverJourney?.id) {
      snapshot = undefined; owner = state?.serverJourney?.id; endingAttempt = automaticAttempt = undefined;
      observedDistance = state?.distanceMeters; error = feedback = "";
      observedSleeps = state?.sleeps;
    }
    talk.replaceChildren(); book.replaceChildren();
    if (!state) return;
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
    const pending = client.pending(state), blocked = working || current.blocked || pending;
    const fresh = snapshot?.state.col === state.col && snapshot?.state.row === state.row &&
      snapshot?.state.elapsedMinutes === state.elapsedMinutes && snapshot?.revision === state.artifactRevision;
    for (const host of [talk, book]) {
      button(host, pending ? c.retry : c.refresh, () => void request(), working || current.blocked && !pending);
      const status = text(host, error || (working ? c.loading : feedback ? c[feedback] : "")); status.setAttribute("role", error ? "alert" : "status");
    }
    const selection = document.createElement("select"); selection.setAttribute("aria-label", c.target);
    for (const item of LORE_ITEMS) {
      const option = text(selection, item[lang], "option"); option.value = item.id;
    }
    talk.append(selection);
    button(talk, c.inquire, () => void request({ type: "inquire", id: selection.value }), blocked);
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
    reset() { snapshot = undefined; owner = undefined; error = feedback = ""; } };
}
