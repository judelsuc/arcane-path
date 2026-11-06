import { QUEST_TEMPLATES, createServiceOffer, acceptServiceQuest, declineServiceQuest,
  advanceServiceQuest, abandonServiceQuest, SERVICE_QUEST_LIMITS } from "./service-quests.mjs";
import { createQuestDestinationClient } from "./service-quest-client.mjs";
import { followQuest, followedQuest } from "./quest-objectives.mjs";
import { renderQuestMap } from "./quest-map.mjs";

const COPY = {
  fr: {
    accept: "Accepter", decline: "Pas cette fois",
    empty: "Aucun engagement pour le moment. Les demandes se trouvent dans Dialogue.",
    preparing: "{name} prépare sa proposition…",
    proposal: "{name} vous propose un service.",
    accepted: "« Merci. Je vous laisse ces indications pour la route. »",
    refused: "« Je comprends. Bonne route à vous. »",
    unavailable: "« Je n’ai pas de mission à vous proposer pour le moment. »",
    failed: "La demande de cette personne n’a pas pu être préparée. Vous pouvez réessayer sans changer de mission.",
    limit: "Consultez vos missions en attente avant d’en écouter une autre.",
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
    accept: "Accept", decline: "Not this time",
    empty: "No commitments yet. Requests are available in Dialogue.",
    preparing: "{name} is preparing their offer…",
    proposal: "{name} offers you a service quest.",
    accepted: "“Thank you. Take these directions with you.”",
    refused: "“I understand. Safe travels.”",
    unavailable: "“I have no quest to offer you at the moment.”",
    failed: "This person's request could not be prepared. You can retry without changing their quest.",
    limit: "Review your pending offers before listening to another one.",
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

export function setupServiceQuests(t, { context, mutate,
  destinations = createQuestDestinationClient(), character = () => null, characters = null }) {
  const $ = id => document.getElementById(id);
  const talk = $("dialogue-services"), book = $("quests-services");
  const form = document.createElement("div");
  const offers = document.createElement("div"), onSite = document.createElement("section");
  const status = document.createElement("p"), diagnostics = document.createElement("p");
  status.role = "status"; diagnostics.role = "alert";
  talk.append(form, status, diagnostics, offers, onSite);
  let working = false, controller, request, owner, mapQuest, confirming, error = "", contractError = "", feedback = "";
  let preparationKey, unavailable = false;
  const syncedContractEvents = new Map();
  const syncingContracts = new Set();
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
  function syncCharacterContract(state, quest) {
    if (!characters?.contract || !quest.characterId || !state?.serverJourney?.id ||
        !state.journalAccess || !Array.isArray(quest.history)) return;
    const key = `${state.serverJourney.id}:${quest.id}`;
    if (syncingContracts.has(key)) return;
    const from = syncedContractEvents.get(key) ?? 0;
    if (from >= quest.history.length) return;
    syncingContracts.add(key);
    void (async () => {
      let success = false;
      try {
        for (let index = from; index < quest.history.length; index++) {
          const entry = quest.history[index];
          let event, step = entry.step;
          if (entry.event === "offer") event = "offered";
          else if (entry.event === "accept") event = "accepted";
          else if (entry.event === "decline") event = "declined";
          else if (entry.event === "abandon") event = "abandoned";
          else if (entry.event === "advance") {
            step++;
            if (step === quest.destinations.length) {
              const next = quest.history[index + 1];
              if (next?.event !== "complete" || next.step !== step) {
                throw new Error("Final service quest advance requires its completion event.");
              }
              syncedContractEvents.set(key, index + 1);
              continue;
            }
            event = "advanced";
          }
          else if (entry.event === "complete") event = "completed";
          else throw new Error("Unknown service quest history event.");
          await characters.contract(state, quest.characterId, {
            id: quest.id, event, step, totalSteps: quest.destinations.length,
          }, event === "offered" ? { location: { col: quest.origin.col, row: quest.origin.row } } : {});
          syncedContractEvents.set(key, index + 1);
        }
        success = true;
        if (context()?.state.serverJourney?.id === state.serverJourney.id) {
          contractError = "";
          diagnostics.textContent = error;
        }
      } catch (reason) {
        console.error("Character quest contract synchronization failed:", reason);
        if (context()?.state.serverJourney?.id === state.serverJourney.id) {
          contractError = t("character.contractFailed", { error: reason.message });
          diagnostics.textContent = error || contractError;
        }
      } finally {
        syncingContracts.delete(key);
        if (success) {
          const latest = context()?.state;
          if (latest?.serverJourney?.id === state.serverJourney.id) {
            const updated = [...(latest.serviceQuests?.offers ?? []),
              ...(latest.serviceQuests?.quests ?? [])].find(item => item.id === quest.id);
            if (updated && updated.history.length > quest.history.length) {
              syncCharacterContract(latest, updated);
            }
          }
        }
      }
    })();
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
      preparationKey = undefined; unavailable = false;
      mapQuest = confirming = undefined; error = feedback = contractError = "";
    }
    const speaker = character();
    const key = speaker && state ? `${nextOwner}:${speaker.id}:${state.col}:${state.row}` : undefined;
    if (preparationKey !== key) {
      controller?.abort(); controller = undefined; working = false; request = undefined;
      preparationKey = key; unavailable = false; error = "";
    }
    const knownQuest = speaker && [...(state?.serviceQuests?.offers ?? []),
      ...(state?.serviceQuests?.quests ?? [])].find(quest => quest.characterId === speaker.id);
    const full = (state?.serviceQuests?.offers?.length ?? 0) >= SERVICE_QUEST_LIMITS.offers ||
      [...(state?.serviceQuests?.offers ?? []), ...(state?.serviceQuests?.quests ?? [])]
        .some(quest => quest.template === speaker?.profile?.quest?.template &&
          ["offered", "active"].includes(quest.status));
    if (speaker?.profile?.quest && !knownQuest && !request && !full &&
        state?.journalAccess && !current.blocked) {
      request = { characterId: speaker.id };
      queueMicrotask(() => { if (preparationKey === key) void prepareOffer(); });
    }
    status.textContent = working ? c.preparing.replace("{name}", speaker?.name ?? "")
      : feedback ? c[feedback] : !speaker ? c.noTown : full && !knownQuest ? c.limit
        : unavailable ? c.unavailable : knownQuest?.status === "offered"
          ? c.proposal.replace("{name}", speaker.name)
          : knownQuest?.status === "active" ? c.accepted
            : knownQuest?.status === "declined" ? c.refused : "";
    diagnostics.textContent = error ? `${c.failed} (${error})` : contractError;
    form.replaceChildren();
    if (error) button(form, c.retry, () => { void prepareOffer(true); }, current?.blocked || working);
    offers.replaceChildren(); onSite.replaceChildren(); book.replaceChildren();
    if (!state) return;
    for (const offer of state.serviceQuests?.offers ?? []) {
      const item = QUEST_TEMPLATES.find(item => item.id === offer.template);
      const section = document.createElement("section");
      section.className = "quest-offer";
      const heading = document.createElement("h3");
      heading.textContent = item.title[lang];
      section.append(heading);
      paragraph(section, item.request[lang]);
      paragraph(section, `${c.route} : ${offer.distanceKm.toFixed(1)} km · ${c.reward} : €${(offer.rewardCents / 100).toFixed(2)}`);
      for (const poi of offer.destinations) paragraph(section, `${poi.town} — ${poi.name}`);
      const controls = document.createElement("div");
      controls.className = "quest-command-block";
      button(controls, c.accept, () => { commit(s => acceptServiceQuest(s, offer.id)); feedback = ""; localize(); }, current.blocked);
      button(controls, c.decline, () => { commit(s => declineServiceQuest(s, offer.id)); localize(); }, current.blocked);
      section.append(controls);
      if (offer.characterId === speaker?.id) offers.append(section);
      else book.append(section);
    }
    const quests = state.serviceQuests?.quests ?? [];
    if (!quests.length && !book.children.length) paragraph(book, c.empty);
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
        if (quest.status === "completed") paragraph(section, item.conclusion[lang]);
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
        !here || current.blocked);
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
        paragraph(exchange, item.request[lang]);
        button(exchange, c.actions[role.action], () => act(quest, true), current.blocked);
        onSite.append(exchange);
      }
    }
    for (const quest of [...(state.serviceQuests?.offers ?? []), ...quests]) {
      syncCharacterContract(state, quest);
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
  async function prepareOffer(retry = false) {
    const current = context();
    const speaker = character();
    if (!current || current.blocked || working || !speaker) return;
    const started = current.state;
    const activeController = new AbortController();
    controller = activeController;
    const stillCurrent = () => controller === activeController &&
      context()?.state.serverJourney?.id === started.serverJourney.id &&
      context()?.state.col === started.col && context()?.state.row === started.row &&
      character()?.id === speaker.id && !context()?.blocked;
    working = true; error = feedback = "";
    try {
      localize();
      const result = await destinations.characterOffer(started, speaker.id, { signal: activeController.signal, retry });
      if (!stillCurrent()) return;
      if (result.status === "unavailable") {
        unavailable = true;
        return;
      }
      if (result.characterId !== speaker.id || result.template !== speaker.profile.quest.template ||
          result.scope !== speaker.profile.quest.scope) throw new Error("Invalid character quest assignment.");
      commit(s => createServiceOffer(s, { id: result.nonce, template: result.template,
        destinations: result.destinations, distanceKm: result.distanceKm, scope: result.scope,
        origin: result.origin, characterId: speaker.id }));
    } catch (reason) {
      if (stillCurrent() && !activeController.signal.aborted) {
        console.error("Character quest preparation failed:", reason);
        error = reason.message;
      }
    } finally {
      if (controller === activeController) {
        working = false;
        if (!stillCurrent()) request = undefined;
        localize();
      }
    }
  }
  return { localize, characterChanged: localize,
    reset() {
      controller?.abort(); controller = undefined; request = undefined; owner = undefined;
      preparationKey = undefined; unavailable = false;
    } };
}
