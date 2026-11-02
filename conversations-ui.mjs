import { hospitalityTown } from "./hospitality.mjs";
import { skyState } from "./sky.mjs";
import { journeyDate } from "./travel.mjs";

const TOPICS = {
  shelter: "sleep-travel", food: "eat-travel", work: "open-earn-money",
  transport: "open-journey-world", town: "open-town",
};
const PANE_TOPICS = {
  parent: ["parent", "dialogue-parent"], clues: ["clues", "dialogue-directions"],
  notebooks: ["notebooks", "dialogue-journals"], artifacts: ["artifacts", "dialogue-artifacts"],
  services: ["services", "dialogue-services"],
};

export function setupConversations(t, { context, characters, onCharacter = () => {} }) {
  const $ = id => document.getElementById(id);
  const dialog = $("conversation-dialog");
  const selector = $("character-selector-dialog");
  const trigger = $("open-conversation");
  let selected = "parent";
  let currentCharacter;
  let available = [];
  let canCreate = false;
  let limit = 4;
  let loaded = false;
  let busy = false;
  let returningToSelector = false;
  let pendingCreate;
  let exchangeReply;
  const portraitUrls = new Set();
  let portraitGeneration = 0;
  const panes = Object.fromEntries(Object.entries(PANE_TOPICS).map(([topic, [, pane]]) => [topic, pane]));

  function validContext() {
    const current = context();
    return current && current.state?.serverJourney?.id && current.state?.journalAccess &&
      !current.blocked && !current.state.ended && current.cell && !current.cell.unavailable &&
      current.cell.terrain !== "water"
      ? current : null;
  }

  function presence(current) {
    const date = journeyDate(current.state);
    if (!Number.isFinite(date.getTime())) return undefined;
    const { latitude, longitude } = current.info ?? {};
    let phase;
    try {
      phase = skyState(date, latitude, longitude).background;
    } catch {
      const hour = date.getUTCHours();
      phase = hour >= 7 && hour < 20 ? "day" : "night";
    }
    return { phase, hour: Math.floor(date.getTime() / 3_600_000) };
  }

  function locationText(current) {
    const town = current && hospitalityTown(current.cell);
    if (current && !town && current.cell.terrain !== "major_road") return t("conversation.countryside");
    return t(town ? "conversation.inTown" : "conversation.onRoad", { town: town?.name ?? "" });
  }

  function releasePortraits() {
    portraitGeneration++;
    for (const url of portraitUrls) URL.revokeObjectURL?.(url);
    portraitUrls.clear();
  }

  function localize() {
    const current = validContext();
    trigger.disabled = !current;
    $("town-conversation").disabled = !current;
    $("character-selector-context").textContent = locationText(current);
    $("conversation-context").textContent = currentCharacter
      ? t("character.identity", { name: currentCharacter.name,
        role: t(`character.role.${currentCharacter.role}`) })
      : locationText(current);
    $("conversation-intro").textContent = currentCharacter
      ? [t("character.conversationIntro", { name: currentCharacter.name }),
        currentCharacter.familiarity?.known && currentCharacter.familiarity.meetings > 1
          ? t("character.familiar") : ""].filter(Boolean).join(" ")
      : "";
    $("conversation-character-reply").hidden = !currentCharacter;
    $("conversation-reply").hidden = selected !== "artifacts";
    $("conversation-reply").textContent = selected === "artifacts" ? t("conversation.legend") : "";
    for (const [topic, target] of Object.entries(TOPICS)) {
      const source = $(target);
      $(`conversation-${topic}`).disabled = !current || !source || source.disabled || source.hidden;
    }
    for (const [topic, pane] of Object.entries(panes)) {
      const button = $(`conversation-${topic}`);
      button.disabled = !current;
      button.setAttribute("aria-pressed", String(selected === topic));
      const isVisible = selected === topic;
      $(pane).hidden = !isVisible;
    }
    if (currentCharacter) {
      const exchange = exchangeReply?.characterId === currentCharacter.id &&
        exchangeReply.topic === PANE_TOPICS[selected][0] ? exchangeReply : null;
      const response = exchange?.status === "pending"
        ? t("character.exchangePending")
        : exchange?.status === "ready" && exchange.facts.length
          ? exchange.facts.map(fact => t(`character.fact.${fact}`)).join(" ")
          : exchange?.status === "failed" ? t("character.exchangeFailed", { error: exchange.error })
            : selected === "parent" ? t("character.noParentKnowledge") : t("character.noKnowledge");
      const mention = exchange?.status === "ready" && exchange.visitorFacts?.[0]?.type === "met"
        ? t("character.visitorMention", { name: exchange.visitorFacts[0].name }) : "";
      $("conversation-character-reply").textContent = [response, mention,
        selected === "services" ? "" : t("character.toolsNotTestimony")].filter(Boolean).join(" ");
    }
    $("character-create").disabled = !current || !loaded || !canCreate || busy;
    $("character-selector-close").disabled = busy;
    $("character-selector-status").classList?.toggle("is-loading", busy);
    $("conversation-back").disabled = busy;
  }

  function renderCharacters() {
    releasePortraits();
    const generation = portraitGeneration;
    const list = $("character-choices");
    list.replaceChildren();
    for (const character of available) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      const portrait = document.createElement("span");
      const details = document.createElement("span");
      const name = document.createElement("strong");
      const role = document.createElement("span");
      const status = document.createElement("span");
      const portraitStatus = character.portrait?.status ?? "failed";
      button.type = "button";
      button.className = "character-choice";
      portrait.className = "character-portrait-placeholder";
      portrait.setAttribute("role", "img");
      portrait.setAttribute("aria-label", t(`character.portrait.${portraitStatus}`));
      portrait.textContent = "◌";
      details.className = "character-choice-details";
      name.textContent = character.name;
      role.textContent = t(`character.role.${character.role}`);
      status.textContent = t(`character.portrait.${portraitStatus}`);
      details.append(name, role, status);
      button.append(portrait, details);
      button.addEventListener("click", () => choose(character));
      item.append(button);
      list.append(item);
      const current = validContext();
      if (current && characters.portrait &&
          character.portrait?.status === "ready" && character.portrait.ref) {
        const isCurrent = () => generation === portraitGeneration && selector.open &&
          sameJourney(current) && portrait.isConnected !== false;
        const showFailure = error => {
          console.error("Unable to display character portrait:", error);
          if (!isCurrent()) return;
          portrait.replaceChildren();
          portrait.textContent = "◌";
          portrait.setAttribute("aria-label", t("character.portrait.failed"));
          status.textContent = t("character.portrait.failed");
        };
        void characters.portrait(current.state, character.id).then(blob => {
          if (!isCurrent()) return;
          if (typeof URL?.createObjectURL !== "function") {
            throw new Error("Portrait object URLs are unavailable.");
          }
          const image = document.createElement("img");
          const url = URL.createObjectURL(blob);
          portraitUrls.add(url);
          image.src = url;
          image.alt = t("character.portrait.ready");
          image.addEventListener("error", () => {
            URL.revokeObjectURL(url);
            portraitUrls.delete(url);
            showFailure(new Error("Character portrait image could not be decoded."));
          }, { once: true });
          portrait.replaceChildren(image);
          portrait.setAttribute("aria-label", t("character.portrait.ready"));
        }).catch(showFailure);
      }
    }
    $("character-empty").hidden = available.length !== 0;
    $("character-create").hidden = !canCreate;
  }

  function sameJourney(current) {
    const latest = validContext();
    return latest && latest.state.serverJourney.id === current.state.serverJourney.id &&
      latest.state.col === current.state.col && latest.state.row === current.state.row;
  }

  async function refresh() {
    const current = validContext();
    releasePortraits();
    available = [];
    canCreate = false;
    loaded = false;
    $("character-selector-status").textContent = t("character.loading");
    renderCharacters();
    if (!current) return;
    const requestContext = current;
    try {
      const result = await characters.list(current.state, presence(current));
      if (!sameJourney(requestContext)) return;
      if (!Array.isArray(result.characters) || typeof result.canCreate !== "boolean") {
        throw new Error("Invalid character registry response.");
      }
      available = result.characters;
      canCreate = result.canCreate;
      if (Number.isInteger(result.limit)) limit = result.limit;
      loaded = true;
      const arrived = available.find(character => character.id === result.arrived);
      $("character-selector-status").textContent = !available.length &&
        result.unavailableReason === "naming-locale-unavailable" ? t("character.namingUnavailable")
        : result.absent ? t(canCreate ? "character.absentCanCreate" : "character.absent")
        : arrived ? t("character.arrived", { name: arrived.name })
          : !available.length ? t("character.empty")
            : result.location?.kind === "town" ? t("character.available") : t("character.roadside");
    } catch (error) {
      if (!sameJourney(requestContext)) return;
      $("character-selector-status").textContent = t("character.loadFailed", { error: error.message });
    }
    renderCharacters();
    localize();
  }

  async function recordTopic(topic) {
    const current = validContext();
    if (!current || !currentCharacter) return;
    const character = currentCharacter;
    exchangeReply = { characterId: character.id, topic, status: "pending" };
    localize();
    try {
      const result = await characters.exchange(current.state, character.id, topic);
      if (currentCharacter?.id !== character.id || !sameJourney(current)) return;
      if (!Array.isArray(result.factIds) ||
          result.factIds.some(fact => typeof fact !== "string")) {
        throw new Error("Invalid character exchange response.");
      }
      exchangeReply = { characterId: character.id, topic, status: "ready", facts: result.factIds,
        visitorFacts: Array.isArray(result.visitorFacts) ? result.visitorFacts.slice(0, 1)
          .filter(fact => fact?.type === "met" && typeof fact.name === "string") : [] };
      localize();
    } catch (error) {
      if (currentCharacter?.id === character.id) {
        exchangeReply = { characterId: character.id, topic, status: "failed", error: error.message };
        localize();
      }
    }
  }

  async function choose(character) {
    const current = validContext();
    if (!current || busy || !available.some(item => item.id === character.id)) return;
    busy = true;
    $("character-selector-status").textContent = t("character.opening");
    localize();
    try {
      const meeting = await characters.meet(current.state, character.id);
      if (!sameJourney(current)) return;
      currentCharacter = { ...character, familiarity: meeting?.familiarity ?? character.familiarity };
      if (character.profile?.quest) selected = "services";
      exchangeReply = undefined;
      $("conversation-character-status").textContent = "";
      selector.close();
      dialog.showModal();
      onCharacter(currentCharacter);
      localize();
      $(`conversation-${selected}`).focus();
    } catch (error) {
      $("character-selector-status").textContent = t("character.openFailed", { error: error.message });
    } finally {
      busy = false;
      localize();
    }
  }

  async function createCharacter() {
    const current = validContext();
    if (!current || busy || !loaded || !canCreate) return;
    const createKey = `${current.state.serverJourney.id}:${current.state.col}:${current.state.row}`;
    if (pendingCreate?.key !== createKey) {
      pendingCreate = { key: createKey, requestId: characters.newRequestId() };
    }
    busy = true;
    $("character-selector-status").textContent = t("character.creating");
    localize();
    try {
      const character = await characters.create(current.state, pendingCreate.requestId);
      if (!sameJourney(current)) return;
      pendingCreate = undefined;
      available = [...available.filter(item => item.id !== character.id), character];
      canCreate = available.length < limit;
      loaded = true;
      renderCharacters();
      busy = false;
      await choose(character);
    } catch (error) {
      $("character-selector-status").textContent = t("character.createFailed", { error: error.message });
    } finally {
      busy = false;
      localize();
    }
  }

  async function open() {
    const current = validContext();
    localize();
    if (!current || document.querySelector("dialog[open]")) return;
    selector.showModal();
    await refresh();
  }

  trigger.addEventListener("click", open);
  $("town-conversation").addEventListener("click", () => {
    $("town-dialog").close();
    open();
  });
  $("character-create").addEventListener("click", createCharacter);
  $("character-selector-close").addEventListener("click", () => selector.close());
  selector.addEventListener("close", () => {
    releasePortraits();
    if (!dialog.open) trigger.focus();
  });
  $("conversation-back").addEventListener("click", async () => {
    if (!currentCharacter || busy) return;
    returningToSelector = true;
    dialog.close();
    selector.showModal();
    returningToSelector = false;
    await refresh();
  });
  for (const [topic, target] of Object.entries(TOPICS)) {
    $(`conversation-${topic}`).addEventListener("click", () => {
      localize();
      if ($(`conversation-${topic}`).disabled) return;
      dialog.close();
      $(target).click();
    });
  }
  for (const topic of Object.keys(panes)) {
    $(`conversation-${topic}`).addEventListener("click", () => {
      if ($(`conversation-${topic}`).disabled) return;
      selected = topic;
      void recordTopic(topic);
      localize();
    });
  }
  $("conversation-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    if (!selector.open && !returningToSelector) currentCharacter = undefined;
    localize();
    if (!selector.open) trigger.focus();
  });
  return {
    localize, open,
    reset() {
      selected = "parent";
      currentCharacter = undefined;
      exchangeReply = undefined;
      releasePortraits();
      available = [];
      canCreate = loaded = busy = false;
      selector.close();
      dialog.close();
      localize();
    },
    currentCharacter: () => currentCharacter,
  };
}
