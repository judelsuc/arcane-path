import catalogue from "./public/quest-templates.json" with { type: "json" };

const freeze = value => {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

export const QUEST_TEMPLATES = freeze(catalogue);
export const SERVICE_QUEST_KINDS = freeze([
  "hotel", "drinking_water", "workshop", "hardware", "market", "townhall",
  "library", "post_office", "garden", "park", "bakery", "community_centre",
  "church", "station", "cafe", "administrative", "tourism", "alpine_hut",
  "viewpoint", "school", "cemetery", "restaurant", "shop", "museum",
]);
export const SERVICE_QUEST_LIMITS = freeze({ offers: 3, active: 3, history: 1000, wording: 2000 });
export const SERVICE_QUEST_SCOPES = freeze(["local", "regional", "far", "europe"]);

const templates = new Map(QUEST_TEMPLATES.map(template => [template.id, template]));
const phases = ["offer", "arrival", "conclusion"];
const questKeys = ["id", "template", "destinations", "distanceKm", "scope", "origin",
  "rewardCents", "step", "status", "createdMinutes", "acceptedMinutes",
  "completedMinutes", "closedMinutes", "history", "wording"];
const destinationKeys = ["id", "name", "latitude", "longitude", "col", "row", "town", "kind", "sourceUrl"];
const empty = () => ({ version: 1, offers: [], quests: [], tracked: null });
const data = state => state.serviceQuests ?? empty();
const fail = () => { throw new Error("Invalid service quest data."); };
const plain = value => value !== null && typeof value === "object" &&
  !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const keys = (value, allowed) => plain(value) &&
  Object.keys(value).length === allowed.length && allowed.every(key => Object.hasOwn(value, key));
const integer = Number.isSafeInteger;
const minutes = value => Number.isFinite(value) && value >= 0;
const text = (value, limit = 240) => typeof value === "string" &&
  value.trim().length > 0 && value.length <= limit && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
const pair = value => keys(value, ["fr", "en"]) &&
  text(value.fr, SERVICE_QUEST_LIMITS.wording) && text(value.en, SERVICE_QUEST_LIMITS.wording);
const coordinates = point => Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90 &&
  Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180;
const cell = point => integer(point.col) && integer(point.row);
const sameCell = (a, b) => a.col === b.col && a.row === b.row;
const instanceId = id => typeof id === "string" && /^[a-f0-9]{32}$/u.test(id);

function sourceUrl(value) {
  if (!text(value, 1000)) return false;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}

function geographicKm(a, b) {
  const radians = Math.PI / 180;
  const lat = (b.latitude - a.latitude) * radians / 2;
  const lon = (b.longitude - a.longitude) * radians / 2;
  const h = Math.sin(lat) ** 2 + Math.cos(a.latitude * radians) *
    Math.cos(b.latitude * radians) * Math.sin(lon) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

/** Frozen monetary contract, in cents; no rounding of the distance before ceil. */
export function serviceQuestReward(distanceKm, steps) {
  if (!(Number.isFinite(distanceKm) && distanceKm > 0) || !integer(steps) || steps < 1) fail();
  const reward = 500 + Math.ceil(20 * distanceKm) + 300 * (steps - 1);
  if (!integer(reward)) fail();
  return reward;
}

function validateContract(quest) {
  const template = templates.get(quest.template);
  if (!instanceId(quest.id) || !template || !SERVICE_QUEST_SCOPES.includes(quest.scope) ||
      !plain(quest.origin) || !cell(quest.origin) ||
      !(keys(quest.origin, ["col", "row"]) ||
        (keys(quest.origin, ["col", "row", "latitude", "longitude"]) && coordinates(quest.origin))) ||
      !Array.isArray(quest.destinations) || quest.destinations.length !== template.roles.length ||
      quest.rewardCents !== serviceQuestReward(quest.distanceKm, template.roles.length)) fail();
  const ids = new Set(), cells = new Set();
  for (const [index, destination] of quest.destinations.entries()) {
    if (!keys(destination, destinationKeys) || !text(destination.id, 160) ||
        !text(destination.name) || !text(destination.town) || !coordinates(destination) ||
        !cell(destination) || destination.kind !== template.roles[index].kind ||
        !sourceUrl(destination.sourceUrl) || ids.has(destination.id) ||
        cells.has(`${destination.col},${destination.row}`)) fail();
    ids.add(destination.id);
    cells.add(`${destination.col},${destination.row}`);
  }
  if (sameCell(quest.origin, quest.destinations[0])) fail();
  const points = coordinates(quest.origin) ? [quest.origin, ...quest.destinations] : quest.destinations;
  const lowerBound = points.slice(1).reduce((sum, point, i) => sum + geographicKm(points[i], point), 0);
  // The provider verifies actual route reachability; this only rejects impossible distances.
  if (quest.distanceKm + 1e-6 < lowerBound) fail();
}

function validateQuest(quest, offered, now) {
  if (!keys(quest, questKeys)) fail();
  validateContract(quest);
  const total = quest.destinations.length;
  if (!integer(quest.step) || quest.step < 0 || quest.step > total ||
      !minutes(quest.createdMinutes) || quest.createdMinutes > now ||
      !["offered", "active", "completed", "declined", "abandoned"].includes(quest.status) ||
      offered !== (quest.status === "offered") || !plain(quest.wording) ||
      Object.keys(quest.wording).some(phase => !phases.includes(phase) || !pair(quest.wording[phase]))) fail();
  const accepted = ["active", "completed", "abandoned"].includes(quest.status);
  const closed = ["completed", "declined", "abandoned"].includes(quest.status);
  if (accepted ? !minutes(quest.acceptedMinutes) || quest.acceptedMinutes < quest.createdMinutes ||
      quest.acceptedMinutes > now : quest.acceptedMinutes !== null || quest.step !== 0) fail();
  if (closed ? !minutes(quest.closedMinutes) || quest.closedMinutes <
      (quest.acceptedMinutes ?? quest.createdMinutes) || quest.closedMinutes > now :
      quest.closedMinutes !== null) fail();
  if (quest.status === "completed" ? quest.step !== total ||
      quest.completedMinutes !== quest.closedMinutes : quest.completedMinutes !== null ||
      quest.step === total) fail();
  const expected = [{ event: "offer", step: 0, action: null, time: quest.createdMinutes }];
  if (accepted) expected.push({ event: "accept", step: 0, action: null, time: quest.acceptedMinutes });
  for (let i = 0; i < quest.step; i++) {
    expected.push({ event: "advance", step: i, action: templates.get(quest.template).roles[i].action });
  }
  if (closed) expected.push({ event: { completed: "complete", declined: "decline", abandoned: "abandon" }[quest.status],
    step: quest.step, action: null, time: quest.closedMinutes });
  if (!Array.isArray(quest.history) || quest.history.length !== expected.length ||
      quest.history.length > SERVICE_QUEST_LIMITS.history) fail();
  let previous = quest.createdMinutes;
  for (const [index, entry] of quest.history.entries()) {
    const wanted = expected[index];
    if (!keys(entry, ["event", "minutes", "step", "action", "col", "row"]) ||
        entry.event !== wanted.event || entry.step !== wanted.step || entry.action !== wanted.action ||
        !minutes(entry.minutes) || entry.minutes < previous || entry.minutes > now || !cell(entry) ||
        (wanted.time !== undefined && entry.minutes !== wanted.time) ||
        (entry.event === "offer" && !sameCell(entry, quest.origin)) ||
        (entry.event === "advance" && !sameCell(entry, quest.destinations[entry.step]))) fail();
    if (entry.event === "complete" && (entry.minutes !== previous ||
        !sameCell(entry, quest.destinations.at(-1)))) fail();
    previous = entry.minutes;
  }
}

/** Returns the input unchanged or throws. Missing branch is valid for legacy journeys. */
export function validateServiceQuests(state) {
  if (state.serviceQuests === undefined) return state;
  const services = state.serviceQuests;
  if (!keys(services, ["version", "offers", "quests", "tracked"]) || services.version !== 1 ||
      !Array.isArray(services.offers) || !Array.isArray(services.quests) ||
      services.offers.length > SERVICE_QUEST_LIMITS.offers ||
      services.offers.length + services.quests.length > SERVICE_QUEST_LIMITS.history ||
      !minutes(state.elapsedMinutes)) fail();
  const ids = new Set(), activeTemplates = new Set();
  let activeCount = 0;
  for (const [list, offered] of [[services.offers, true], [services.quests, false]]) {
    for (const quest of list) {
      validateQuest(quest, offered, state.elapsedMinutes);
      if (ids.has(quest.id)) fail();
      ids.add(quest.id);
      if (quest.status === "active") activeCount++;
      if (["offered", "active"].includes(quest.status)) {
        if (activeTemplates.has(quest.template)) fail();
        activeTemplates.add(quest.template);
      }
    }
  }
  if (activeCount > SERVICE_QUEST_LIMITS.active ||
      (services.tracked !== null && !services.quests.some(quest =>
        quest.id === services.tracked && quest.status === "active"))) fail();
  return state;
}

function ready(state) {
  validateServiceQuests(state);
  if (!cell(state) || !minutes(state.elapsedMinutes) || state.ended ||
      state.actionPending || state.pendingAction || state.events?.pending ||
      state.transport?.booking?.status === "active" || state.equipment?.dogEncounter === "pending" ||
      state.performancePending || state.cafePending || state.theftPending || state.miniGamePending) {
    throw new Error("A service quest action is not available now.");
  }
}

const event = (state, name, step = 0, action = null) => ({
  event: name, minutes: state.elapsedMinutes, step, action, col: state.col, row: state.row,
});
const find = (state, id) => [...data(state).offers, ...data(state).quests].find(quest => quest.id === id);
const replace = (state, quest) => ({
  ...state, serviceQuests: {
    ...data(state),
    offers: data(state).offers.map(item => item.id === quest.id ? quest : item),
    quests: data(state).quests.map(item => item.id === quest.id ? quest : item),
  },
});

/**
 * Provider destinations are already ordered and route-verified. First appearance
 * freezes the nonce: later calls with that id return the original state, never reroll.
 * Optional root latitude/longitude are snapshotted for the first-leg lower bound.
 */
export function createServiceOffer(state, options) {
  ready(state);
  if (!plain(options) || !instanceId(options.id)) fail();
  if (find(state, options.id)) return state;
  if (!keys(options, ["id", "template", "destinations", "distanceKm", "scope"])) fail();
  const services = data(state);
  if (services.offers.length >= SERVICE_QUEST_LIMITS.offers ||
      services.offers.length + services.quests.length >= SERVICE_QUEST_LIMITS.history ||
      [...services.offers, ...services.quests].some(quest =>
        quest.template === options.template && ["offered", "active"].includes(quest.status))) {
    throw new Error("Service quest limit or duplicate active template.");
  }
  const template = templates.get(options.template);
  if (!template || !Array.isArray(options.destinations)) fail();
  const origin = { col: state.col, row: state.row };
  if (Object.hasOwn(state, "latitude") || Object.hasOwn(state, "longitude")) {
    if (!coordinates(state)) fail();
    origin.latitude = state.latitude;
    origin.longitude = state.longitude;
  }
  const quest = {
    id: options.id, template: options.template,
    destinations: options.destinations.map(destination => ({ ...destination })),
    distanceKm: options.distanceKm, scope: options.scope, origin,
    rewardCents: serviceQuestReward(options.distanceKm, template.roles.length),
    step: 0, status: "offered", createdMinutes: state.elapsedMinutes,
    acceptedMinutes: null, completedMinutes: null, closedMinutes: null,
    history: [event(state, "offer")], wording: {},
  };
  validateQuest(quest, true, state.elapsedMinutes);
  return { ...state, serviceQuests: { ...services, offers: [...services.offers, quest] } };
}

export function acceptServiceQuest(state, id) {
  ready(state);
  const services = data(state), quest = find(state, id);
  if (!quest || quest.status !== "offered" ||
      services.quests.filter(item => item.status === "active").length >= SERVICE_QUEST_LIMITS.active) {
    throw new Error("Service quest cannot be accepted.");
  }
  return { ...state, serviceQuests: { ...services,
    offers: services.offers.filter(item => item.id !== id),
    quests: [...services.quests, { ...quest, status: "active", acceptedMinutes: state.elapsedMinutes,
      history: [...quest.history, event(state, "accept")] }],
    tracked: services.tracked ?? id,
  } };
}

function close(state, id, status, expected) {
  ready(state);
  const services = data(state), quest = find(state, id);
  if (!quest || quest.status !== expected) throw new Error("Service quest cannot be closed.");
  const next = { ...quest, status, closedMinutes: state.elapsedMinutes,
    history: [...quest.history, event(state, status === "declined" ? "decline" : "abandon", quest.step)] };
  return { ...state, serviceQuests: { ...services,
    offers: services.offers.filter(item => item.id !== id),
    quests: expected === "offered" ? [...services.quests, next] :
      services.quests.map(item => item.id === id ? next : item),
    tracked: services.tracked === id ? null : services.tracked,
  } };
}

export const declineServiceQuest = (state, id) => close(state, id, "declined", "offered");
export const abandonServiceQuest = (state, id) => close(state, id, "abandoned", "active");

/** One explicit in-game action; arrival/inspection alone never advances or pays. */
export function advanceServiceQuest(state, id, options) {
  ready(state);
  const quest = find(state, id);
  if (!quest) throw new Error("Unknown service quest.");
  if (quest.status === "completed") return state;
  if (quest.status !== "active" || !keys(options, ["social"])) fail();
  const role = templates.get(quest.template).roles[quest.step];
  if (options.social !== role.social || !sameCell(state, quest.destinations[quest.step])) {
    throw new Error("The exact destination and its explicit action are required.");
  }
  const step = quest.step + 1, complete = step === quest.destinations.length;
  const next = { ...quest, step,
    history: [...quest.history, event(state, "advance", quest.step, role.action)] };
  if (complete) {
    if (!integer(state.walletCents) || state.walletCents < 0 ||
        !integer(state.walletCents + quest.rewardCents)) fail();
    Object.assign(next, { status: "completed", completedMinutes: state.elapsedMinutes,
      closedMinutes: state.elapsedMinutes,
      history: [...next.history, event(state, "complete", step)] });
  }
  const result = replace(state, next);
  return complete ? { ...result, walletCents: state.walletCents + quest.rewardCents,
    serviceQuests: { ...result.serviceQuests,
      tracked: result.serviceQuests.tracked === id ? null : result.serviceQuests.tracked } } : result;
}

/** Pure consultation metadata: this never starts a quest, advances a step or charges time. */
export function trackServiceQuest(state, id) {
  validateServiceQuests(state);
  if (id !== null && !data(state).quests.some(quest => quest.id === id && quest.status === "active")) fail();
  if (data(state).tracked === id) return state;
  return { ...state, serviceQuests: { ...data(state), tracked: id } };
}

/**
 * Bounded prose only. Both languages are saved together, independently per phase;
 * no objectives, generation controls or mechanical fields are accepted.
 */
export function setServiceQuestWording(state, id, phase, value) {
  validateServiceQuests(state);
  const quest = find(state, id);
  if (!quest || !phases.includes(phase) || !pair(value)) fail();
  return replace(state, { ...quest, wording: { ...quest.wording, [phase]: { fr: value.fr, en: value.en } } });
}

/** Deterministic, read-only rotation; finished/declined templates become reusable. */
export function chooseTemplate(state, scope = "local") {
  validateServiceQuests(state);
  if (!SERVICE_QUEST_SCOPES.includes(scope)) fail();
  const services = data(state), entries = [...services.quests, ...services.offers];
  const unavailable = new Set(entries.filter(quest =>
    ["offered", "active"].includes(quest.status)).map(quest => quest.template));
  const start = (entries.length + SERVICE_QUEST_SCOPES.indexOf(scope) * 11) % QUEST_TEMPLATES.length;
  for (let i = 0; i < QUEST_TEMPLATES.length; i++) {
    const candidate = QUEST_TEMPLATES[(start + i) % QUEST_TEMPLATES.length];
    if (!unavailable.has(candidate.id)) return candidate;
  }
  return null;
}

/**
 * Fresh flattened POIs for the CURRENT step of every active quest:
 * {...destination, questId, template, step, action, social, tracked}.
 * Zero-based cells, original POI id preserved; parent adapts these to directions.
 */
export function serviceQuestDestinations(state) {
  validateServiceQuests(state);
  return data(state).quests.filter(quest => quest.status === "active").map(quest => ({
    ...quest.destinations[quest.step], questId: quest.id, template: quest.template, step: quest.step,
    ...templates.get(quest.template).roles[quest.step], tracked: data(state).tracked === quest.id,
  }));
}
