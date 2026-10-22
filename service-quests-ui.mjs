import { QUEST_TEMPLATES, createServiceOffer, acceptServiceQuest, declineServiceQuest,
  advanceServiceQuest, abandonServiceQuest, setServiceQuestWording, chooseTemplate } from "./service-quests.mjs";
import { createQuestDestinationClient } from "./service-quest-client.mjs";
import { followQuest, followedQuest } from "./quest-objectives.mjs";
import { renderQuestMap } from "./quest-map.mjs";

const COPY = {
  fr: {
    scope: "Distance de la mission", template: "Service proposé", prepare: "Écouter une demande",
    local: "Proche · 5–30 km", regional: "Régional · 30–150 km", far: "Lointain · 150–500 km",
    europe: "Très lointain · plus de 500 km", accept: "Accepter", decline: "Pas cette fois",
    empty: "Aucun engagement pour le moment. Les demandes se trouvent dans Dialogue.",
    preparing: "Recherche de lieux compatibles et vérification du trajet…",
    retry: "Réessayer la même demande", active: "En cours", completed: "Terminée", abandoned: "Abandonnée", declined: "Refusée",
    follow: "Suivre", unfollow: "Ne plus suivre", destination: "Voir la destination",
    return: "Revenir au détail", abandon: "Abandonner", confirm: "Abandonner sans récompense finale ?",
    keep: "Garder la quête", step: "Étape", reward: "Récompense", route: "Trajet de référence",
    here: "Action sur place", go: "Rejoindre le POI indiqué pour agir.",
    talk: "Parler à la personne sur place dans Dialogue.", noTown: "Une personne doit être présente pour proposer une mission.",
    saved: "Étape enregistrée.", paid: "Quête terminée ; récompense versée.",
    actions: { talk: "Se renseigner", send: "Envoyer la réponse", collect: "Retirer le document",
      deliver: "Remettre le document", observe: "Relever le repère", candle: "Allumer le cierge" },
    knowledge: "Indications obtenues", noArtifacts: "Aucune piste d'objet acquise dans ce voyage.",
  },
  en: {
    scope: "Quest distance", template: "Proposed service", prepare: "Listen to a request",
    local: "Nearby · 5–30 km", regional: "Regional · 30–150 km", far: "Distant · 150–500 km",
    europe: "Very distant · over 500 km", accept: "Accept", decline: "Not this time",
    empty: "No commitments yet. Requests are available in Dialogue.",
    preparing: "Finding compatible places and verifying the journey…",
    retry: "Retry this request", active: "Active", completed: "Completed", abandoned: "Abandoned", declined: "Declined",
    follow: "Track", unfollow: "Stop tracking", destination: "View destination",
    return: "Back to details", abandon: "Abandon", confirm: "Abandon without the final reward?",
    keep: "Keep quest", step: "Step", reward: "Reward", route: "Reference journey",
    here: "On-site action", go: "Reach the specified POI to act.",
    talk: "Talk to the person on site in Dialogue.", noTown: "Someone must be present to offer a quest.",
    saved: "Step saved.", paid: "Quest completed; reward paid.",
    actions: { talk: "Ask for information", send: "Send the response", collect: "Collect the document",
      deliver: "Hand over the document", observe: "Record the landmark", candle: "Light the candle" },
    knowledge: "Earned directions", noArtifacts: "No artifact lead earned in this journey.",
  },
};

export function setupServiceQuests(t, { context, mutate, narrative, storage = localStorage,
  destinations = createQuestDestinationClient() }) {
  const $ = id => document.getElementById(id);
  const talk = $("dialogue-services"), book = $("quests-services");
  const form = document.createElement("div"), scopeLabel = document.createElement("label");
  const scope = document.createElement("select"), prepare = document.createElement("button");
  const offers = document.createElement("div"), onSite = document.createElement("section");
  const status = document.createElement("p"), diagnostics = document.createElement("p");
  scope.id = "quest-scope";
  scopeLabel.htmlFor = scope.id;
  for (const name of ["local", "regional", "far", "europe"]) {
    const option = document.createElement("option");
    option.value = name;
    scope.append(option);
  }
  status.role = "status"; diagnostics.role = "alert";
  prepare.type = "button";
  form.append(scopeLabel, scope, prepare);
  talk.append(form, status, diagnostics, offers, onSite);
  let working = false, controller, request, owner, mapQuest, confirming, error = "", feedback = "";
  let consuming = false;
  const pendingWording = new Set();
  const failedWording = new Set();
  const language = () => document.documentElement.lang === "en" ? "en" : "fr";
  function button(host, text, action, disabled = false) {
    const node = document.createElement("button");
    node.type = "button"; node.textContent = text; node.disabled = disabled;
    node.addEventListener("click", () => {
      try { action(); } catch (reason) {
        console.error("Quest action failed:", reason); error = reason.message; localize();
      }
    });
    host.append(node);
    return node;
  }
  function paragraph(host, text) {
    const node = document.createElement("p"); node.textContent = text; host.append(node);
    return node;
  }
  function commit(transform) {
    if (!mutate(transform)) throw new Error(language() === "fr" ? "La quête n'a pas pu être enregistrée." : "Quest could not be saved.");
  }
  function wording(state, quest, phase, fallback) {
    const saved = quest.wording?.[phase];
    if (saved) return saved[language()];
    const generated = narrative.questSnapshot(state, quest.id, phase);
    if (generated && !pendingWording.has(`${quest.id}:${phase}`) && !failedWording.has(`${quest.id}:${phase}`)) {
      const key = `${quest.id}:${phase}`, journey = state.serverJourney.id;
      pendingWording.add(key);
      queueMicrotask(() => {
        consuming = true;
        try {
          if (context()?.state.serverJourney?.id === journey) commit(current =>
            setServiceQuestWording(current, quest.id, phase, generated));
        } catch (reason) {
          console.error("Unable to preserve quest wording:", reason);
          failedWording.add(key);
          error = reason.message;
        } finally { consuming = false; pendingWording.delete(key); }
      });
      return fallback;
    }
    narrative.prefetchQuest(state, { template: quest.template, instance: quest.id, phase, reason: "money" });
    return fallback;
  }
  function act(quest, social) {
    error = "";
    commit(state => advanceServiceQuest(state, quest.id, { social }));
    const next = context().state.serviceQuests.quests.find(item => item.id === quest.id);
    feedback = next.status === "completed" ? "paid" : "saved";
    localize();
  }
  function localize() {
    const current = context(), lang = language(), c = COPY[lang];
    const state = current?.state;
    const nextOwner = state?.serverJourney?.id;
    if (owner !== nextOwner) {
      controller?.abort(); owner = nextOwner; request = undefined; working = false;
      mapQuest = confirming = undefined; error = feedback = "";
    }
    scopeLabel.textContent = c.scope;
    for (const option of scope.options) option.textContent = c[option.value];
    prepare.textContent = working ? c.preparing : request ? c.retry : c.prepare;
    const town = current?.cell?.settlements?.some(place => place.name) || current?.cell?.pois?.length;
    prepare.disabled = working || !state?.journalAccess || current?.blocked || !town;
    scope.disabled = working;
    status.textContent = working ? c.preparing : feedback ? c[feedback] : !town ? c.noTown : "";
    diagnostics.textContent = error;
    offers.replaceChildren(); onSite.replaceChildren(); book.replaceChildren();
    if (!state) return;
    for (const offer of state.serviceQuests?.offers ?? []) {
      const item = QUEST_TEMPLATES.find(item => item.id === offer.template);
      const section = document.createElement("section");
      paragraph(section, item.title[lang]);
      paragraph(section, wording(state, offer, "offer", item.request[lang]));
      paragraph(section, `${c.route} : ${offer.distanceKm.toFixed(1)} km · ${c.reward} : €${(offer.rewardCents / 100).toFixed(2)}`);
      for (const poi of offer.destinations) paragraph(section, `${poi.town} — ${poi.name}`);
      paragraph(section, narrative.questStatus(state, offer.id, "offer", lang));
      button(section, c.accept, () => { commit(s => acceptServiceQuest(s, offer.id)); feedback = ""; localize(); }, current.blocked || working);
      button(section, c.decline, () => { commit(s => declineServiceQuest(s, offer.id)); localize(); }, current.blocked || working);
      offers.append(section);
    }
    const quests = state.serviceQuests?.quests ?? [];
    if (!quests.length) paragraph(book, c.empty);
    for (const quest of quests) {
      const item = QUEST_TEMPLATES.find(item => item.id === quest.template);
      const section = document.createElement("section"), heading = document.createElement("h3");
      heading.textContent = `${item.title[lang]} · ${c[quest.status]}`;
      section.append(heading);
      paragraph(section, `${c.reward} : €${(quest.rewardCents / 100).toFixed(2)} · ${c.route} : ${quest.distanceKm.toFixed(1)} km`);
      if (mapQuest === quest.id) {
        const poi = quest.destinations[quest.step] ?? quest.destinations.at(-1);
        if (current.map) renderQuestMap(section, state, quest.destinations.slice(quest.step), current.map, t);
        paragraph(section, `${poi.town} — ${poi.name} · ${poi.latitude.toFixed(5)}, ${poi.longitude.toFixed(5)}`);
        const link = document.createElement("a");
        link.href = `https://www.openstreetmap.org/?mlat=${poi.latitude}&mlon=${poi.longitude}#map=12/${poi.latitude}/${poi.longitude}`;
        link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = "OpenStreetMap";
        section.append(link);
        button(section, c.return, () => { mapQuest = undefined; localize(); });
      }
      for (const [index, poi] of quest.destinations.entries()) {
        paragraph(section, `${index < quest.step ? "✓ " : ""}${c.step} ${index + 1}/${quest.destinations.length} : ${poi.town} — ${poi.name} · ${c.actions[item.roles[index].action]}`);
      }
      if (quest.status !== "active") {
        if (quest.status === "completed") paragraph(section, wording(state, quest, "conclusion", item.conclusion[lang]));
        book.append(section);
        continue;
      }
      const poi = quest.destinations[quest.step], role = item.roles[quest.step];
      const here = state.col === poi.col && state.row === poi.row;
      const controls = document.createElement("div"); controls.className = "quest-command-block";
      button(controls, followedQuest(state)?.id === `service:${quest.id}` ? c.unfollow : c.follow,
        () => { commit(s => followQuest(s, followedQuest(s)?.id === `service:${quest.id}` ? null : `service:${quest.id}`)); localize(); });
      button(controls, c.destination, () => { mapQuest = quest.id; localize(); });
      if (!role.social) button(controls, `${c.here} : ${c.actions[role.action]}`, () => act(quest, false),
        !here || current.blocked || working);
      paragraph(controls, role.social ? c.talk : here ? "" : c.go);
      if (confirming === quest.id) {
        paragraph(controls, c.confirm);
        const keep = button(controls, c.keep, () => { confirming = undefined; localize(); });
        button(controls, c.abandon, () => { commit(s => abandonServiceQuest(s, quest.id)); confirming = undefined; localize(); }, current.blocked);
        queueMicrotask(() => { if (keep.isConnected) keep.focus(); });
      } else button(controls, c.abandon, () => { confirming = quest.id; localize(); }, current.blocked);
      section.append(controls); book.append(section);
      if (role.social && here) {
        const exchange = document.createElement("section");
        paragraph(exchange, `${item.title[lang]} — ${poi.name}`);
        paragraph(exchange, wording(state, quest, "arrival", item.request[lang]));
        button(exchange, c.actions[role.action], () => act(quest, true), current.blocked || working);
        onSite.append(exchange);
      }
    }
    renderKnowledge(state, lang);
  }
  function renderKnowledge(state, lang) {
    let directions = $("quest-earned-directions");
    if (!directions) {
      directions = document.createElement("section");
      directions.id = "quest-earned-directions";
      $("trail-dialog").append(directions);
    }
    directions.replaceChildren();
    if (state.questDirections?.length) {
      const heading = document.createElement("h3"); heading.textContent = COPY[lang].knowledge; directions.append(heading);
      for (const entry of state.questDirections) paragraph(directions, `${entry.name} — ${entry.text}`);
    }
  }
  prepare.addEventListener("click", async () => {
    const current = context();
    if (!current || current.blocked || working) return;
    const started = current.state, lang = language();
    working = true; error = feedback = "";
    try {
      const chosen = request?.template ?? chooseTemplate(started, scope.value).id;
      const key = `arcane-quest-request-v1:${started.serverJourney.id}:${started.col}:${started.row}:${chosen}:${scope.value}`;
      const nonce = storage.getItem(key) ?? crypto.randomUUID().replaceAll("-", "");
      storage.setItem(key, nonce);
      request = { nonce, template: chosen, scope: scope.value };
      controller = new AbortController();
      localize();
      const result = await destinations.prepare(started, request, controller.signal);
      const latest = context();
      if (!latest || latest.state.serverJourney?.id !== started.serverJourney.id ||
          latest.state.col !== started.col || latest.state.row !== started.row || latest.blocked) {
        throw new Error(lang === "fr" ? "La rencontre a changé ; revenez sur place." : "The encounter changed; return to the meeting place.");
      }
      commit(s => createServiceOffer(s, { id: nonce, template: request.template,
        destinations: result.destinations, distanceKm: result.distanceKm, scope: request.scope }));
      storage.removeItem(key);
      request = undefined;
    } catch (reason) {
      if (!controller?.signal.aborted) { console.error("Quest preparation failed:", reason); error = reason.message; }
    } finally {
      working = false; localize();
    }
  });
  scope.addEventListener("change", () => { if (!working) request = undefined; });
  narrative.subscribe(() => { if (!consuming) localize(); });
  return { localize, reset() { controller?.abort(); request = undefined; owner = undefined; failedWording.clear(); } };
}
