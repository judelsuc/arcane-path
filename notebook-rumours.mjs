import { discoveryEntries, learnDiscovery, reconcileDiscoveryAvailability } from "./discovery.mjs";

const bearings = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
const bands = ["within-1km", "1-5km", "5-10km", "10-20km"];

export function validateNotebookRumours(items, elapsedMinutes) {
  if (!Array.isArray(items) || items.length > 100) throw new Error("Invalid notebook rumours.");
  const seen = new Set();
  for (const item of items) {
    if (!item || !/^[a-f0-9]{32}$/.test(item.id) || typeof item.parent !== "string" ||
        !item.parent.trim() || item.parent.length > 200 || !bearings.includes(item.bearing) ||
        !bands.includes(item.distanceBand) ||
        !["current", "historical", "unavailable"].includes(item.availability) ||
        !Number.isFinite(item.observedMinutes) || item.observedMinutes < 0 ||
        item.observedMinutes > elapsedMinutes ||
        !/^(town|near):[a-f0-9]{32}$/.test(item.evidenceKey) || seen.has(item.evidenceKey)) {
      throw new Error("Invalid notebook rumours.");
    }
    seen.add(item.evidenceKey);
  }
}

export function applyNotebookRumours(state, rumours = [], indications = []) {
  validateNotebookRumours(rumours, state.elapsedMinutes);
  validateNotebookRumours(indications, state.elapsedMinutes);
  const observations = [...rumours, ...indications];
  const clues = observations.map(item => ({
    targetType: "abandoned-journal", targetId: item.id,
    targetRevision: `rumour:${item.evidenceKey}`, evidenceKey: item.evidenceKey,
    kind: "rumour", precision: "local",
    facts: { parent: item.parent, bearing: item.bearing, distanceBand: item.distanceBand },
    observedMinutes: item.observedMinutes, channels: [item.evidenceKey.startsWith("town:") ? "npc" : "news"],
    source: "journal-service", availability: item.availability, contentVersion: "template-v1",
  }));
  return reconcileDiscoveryAvailability(learnDiscovery(state, clues), clues);
}

export function knownNotebookRumours(state) {
  const entries = discoveryEntries(state, { targetType: "abandoned-journal" });
  const mentioned = new Set(entries.filter(entry => entry.evidenceKey.startsWith("town:"))
    .map(entry => entry.targetId));
  return entries
    .filter(entry => entry.targetRevision.startsWith("rumour:"))
    .filter(entry => mentioned.has(entry.targetId))
    .map(entry => ({ id: entry.targetId, ...entry.facts, availability: entry.availability,
      observedMinutes: entry.observedMinutes, evidenceKey: entry.evidenceKey }));
}

export function notebookRumourText(item, language = "fr") {
  const en = language === "en";
  const direction = en ? item.bearing : ["nord", "nord-est", "est", "sud-est", "sud",
    "sud-ouest", "ouest", "nord-ouest"][bearings.indexOf(item.bearing)];
  const band = item.distanceBand === "within-1km" ? en ? "within 1 km" : "à moins de 1 km"
    : item.distanceBand.replaceAll("-", "–").replace("km", " km");
  const status = item.availability === "current"
    ? en ? "An old report, not a guarantee: someone may collect it first."
      : "Un témoignage, pas une garantie : quelqu’un peut le ramasser avant vous."
    : item.availability === "historical"
      ? en ? "Already collected or delivered; this is an old report."
        : "Déjà ramassé ou remis ; ce témoignage est ancien."
      : en ? "Gone or claimed by someone else; do not rely on its presence."
        : "Disparu ou emporté par quelqu’un ; sa présence n’est plus confirmée.";
  return en ? `“A traveller left a notebook meant for ${item.parent}. I last heard it was ${direction}, ${band} from here.” ${status}`
    : `« Un voyageur a laissé un carnet destiné à ${item.parent}. Aux dernières nouvelles, il se trouvait vers le ${direction}, ${band} d’ici. » ${status}`;
}

export function notebookWitnessReports(items) {
  const latest = new Map();
  for (const item of items) {
    if (!item.evidenceKey.startsWith("town:")) continue;
    const previous = latest.get(item.id);
    if (!previous || item.observedMinutes > previous.observedMinutes) latest.set(item.id, item);
  }
  return [...latest.values()].sort((a, b) => b.observedMinutes - a.observedMinutes);
}
