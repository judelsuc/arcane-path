export const LEGEND = Object.freeze({
  id: "last-screening",
  treasure: Object.freeze({
    nature: "film",
    attributes: Object.freeze(["dusk-details", "sepia-skin"]),
    name: Object.freeze({ en: "The Last Light of September", fr: "La dernière lumière de septembre" }),
  }),
  title: Object.freeze({ en: "The last screening", fr: "La dernière séance" }),
  accounts: Object.freeze({
    en: Object.freeze([
      "The cafe owner: The projectionist hid one last reel. The booth's handle broke, but the bicycle repairer kept a spare.",
      "The caretaker: The photograph shows a bell, not a face. Tell me what you see and I will open the archive. Oil the booth handle before turning it.",
      "The repairer: The service passages branch below the cinema. Follow the ladders between doors. Some dead ends still hold supplies; jump the marked broken floor.",
    ]),
    fr: Object.freeze([
      "La patronne du café : Le projectionniste a caché une dernière bobine. La poignée de la cabine est cassée, mais le réparateur de vélos en a gardé une.",
      "La gardienne : La photo montre une cloche, pas un visage. Dites-moi ce que vous voyez et j'ouvrirai les archives. Huilez la poignée avant de la tourner.",
      "Le réparateur : Les passages de service se ramifient sous le cinéma. Suivez les échelles entre les portes. Des réserves restent dans certains culs-de-sac ; sautez le sol brisé signalé.",
    ]),
  }),
});

export const INVESTIGATION_ACTIONS = Object.freeze({
  foyer: Object.freeze(["photo", "bell", "portrait", "handle", "oil"]),
  archive: Object.freeze(["cabinet"]),
  booth: Object.freeze(["mechanism", "reel"]),
});

const states = new WeakSet();
function freeze(state) {
  Object.freeze(state.inventory);
  Object.freeze(state.metrics.roomsVisited);
  Object.freeze(state.metrics);
  Object.freeze(state);
  states.add(state);
  return state;
}

function check(state) {
  if (!states.has(state)) throw new TypeError("Expected an investigation state.");
}

export function createInvestigation() {
  return freeze({ location: "foyer", inspectedPhoto: false, archiveOpen: false,
    boothOpen: false, inventory: [], completed: false, message: "arrival",
    metrics: { roomEntries: 1, roomsVisited: ["foyer"], trapHits: 0 } });
}

export function investigate(state, action) {
  check(state);
  if (!action || typeof action !== "object") throw new TypeError("Expected an investigation action.");
  if (action.type === "travel") {
    if (!Object.hasOwn(INVESTIGATION_ACTIONS, action.location)) throw new RangeError("Unknown investigation location.");
  } else if (action.type !== "act" || !INVESTIGATION_ACTIONS[state.location].includes(action.target)) {
    throw new RangeError("Unknown investigation action.");
  }
  if (state.completed) return state;
  if (action.type === "travel") {
    const changed = state.location !== action.location;
    return freeze({ ...state, location: action.location, message: action.location,
      metrics: changed ? { ...state.metrics, roomEntries: state.metrics.roomEntries + 1,
        roomsVisited: [...new Set([...state.metrics.roomsVisited, action.location])] } : state.metrics });
  }
  const next = { ...state, inventory: [...state.inventory] };
  const has = item => next.inventory.includes(item);
  const take = item => {
    next.message = has(item) ? "already" : item;
    if (!has(item)) next.inventory.push(item);
  };
  switch (action.target) {
    case "photo":
      next.inspectedPhoto = true;
      next.message = "photo";
      break;
    case "bell":
      next.message = state.inspectedPhoto ? "permission" : "inspectFirst";
      if (state.inspectedPhoto) next.archiveOpen = true;
      break;
    case "portrait": next.message = "wrongAnswer"; break;
    case "handle": take("handle"); break;
    case "oil": take("oil"); break;
    case "cabinet":
      if (state.archiveOpen) take("key");
      else next.message = "archiveLocked";
      break;
    case "mechanism":
      if (state.boothOpen) next.message = "already";
      else if (!has("handle") || !has("oil") || !has("key")) next.message = "mechanismLocked";
      else {
        next.boothOpen = true;
        next.message = "mechanism";
      }
      break;
    case "reel":
      next.message = state.boothOpen ? "complete" : "reelLocked";
      next.completed = state.boothOpen;
      break;
  }
  return freeze(next);
}

export function investigationHint(state) {
  check(state);
  if (state.completed) return "complete";
  if (!state.inspectedPhoto) return "photo";
  if (!state.archiveOpen) return "permission";
  if (!state.inventory.includes("key")) return "key";
  if (!state.inventory.includes("handle") || !state.inventory.includes("oil")) return "supplies";
  if (!state.boothOpen) return "mechanism";
  return "reel";
}
