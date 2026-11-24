import { LORE_ITEMS, loreItem } from "./lore-catalogue.mjs";
import { discoveryIdentity, learnDiscovery } from "./discovery.mjs";
import { grantInterpretation } from "./discovery-interpretation.mjs";
import { clueDirection } from "./trail-search.mjs";
import { travelCost } from "./travel.mjs";
import { loreCell, loreCells } from "./lore-map.mjs";

export const inscriptionEntries = state => state.discovery.entries.filter(entry =>
  entry.targetType === "artifact" && entry.kind === "inscription");

export const thread = id => {
  const groups = [
    ["fool", "empress", "chariot", "justice", "sun"],
    ["magician", "hierophant", "hanged", "tower", "judgement"],
    ["priestess", "emperor", "lovers", "wheel", "moon"],
    ["hermit", "strength", "nameless", "temperance", "devil", "star", "world"],
  ];
  return groups.findIndex(group => group.includes(id));
};

export const FRAGMENT_CATALOGUE = Object.freeze([
  ["fool", "chariot"], ["chariot", "justice"], ["justice", "sun"], ["sun", "empress"], ["empress", "fool"],
  ["magician", "hierophant"], ["hierophant", "hanged"], ["hanged", "tower"],
  ["tower", "judgement"], ["judgement", "magician"],
  ["priestess", "emperor"], ["emperor", "lovers"], ["lovers", "wheel"], ["wheel", "moon"], ["moon", "priestess"],
  ["hermit", "strength"], ["strength", "nameless"], ["nameless", "temperance"],
  ["temperance", "devil"], ["devil", "star"], ["star", "world"], ["world", "hermit"],
].map(([source, target]) => Object.freeze({ id: `reverse-rubbing:${source}:1`, source, target })));

export function inscriptionClue(state, id, source = "artifact-inscription") {
  const item = loreItem(id);
  return { targetType: "artifact", targetId: id, targetRevision: "inscription:1",
    evidenceKey: "inscription", kind: "inscription", precision: "text",
    facts: { artifact: id, ...item.inscription }, observedMinutes: state.elapsedMinutes,
    channels: ["notebook"], source, availability: "current", contentVersion: "authored-v1" };
}

export function fragmentOptions(state) {
  const known = new Set(inscriptionEntries(state).map(entry => entry.targetId));
  const read = new Set((state.lore.fragments ?? []).map(fragment => fragment.id));
  return FRAGMENT_CATALOGUE.filter(fragment => known.has(fragment.source) && !known.has(fragment.target) &&
    !read.has(fragment.id)).map(fragment => ({ ...fragment, qualifies: true, ...loreItem(fragment.target).inscription }));
}

export function learnFragments(state, fragments) {
  const records = fragments.map(fragment => ({ ...fragment, observedMinutes: state.elapsedMinutes }));
  let next = { ...state, lore: { ...state.lore, fragments: [...(state.lore.fragments ?? []), ...records] } };
  next = learnDiscovery(next, fragments.filter(fragment => fragment.qualifies)
    .map(fragment => inscriptionClue(next, fragment.target, "hierophant-missing-fragment")));
  return next;
}

export function parentTruth(state) {
  const trail = state.trail;
  if (!trail || trail.completed || state.ended) return null;
  const target = trail.stages[trail.index];
  const clue = { targetType: "parent-trail", targetId: `stage:${trail.index}`,
    targetRevision: `trail:${trail.version}`, evidenceKey: "destination", kind: "place", precision: "precise",
    facts: { place: target.name }, observedMinutes: state.elapsedMinutes, channels: ["collector"],
    source: "priestess-truth", availability: "current", contentVersion: "authored-v1" };
  return state.discovery.entries.some(entry => discoveryIdentity(entry) === discoveryIdentity(clue)) ? null : clue;
}

export function revealTruth(state, clue) {
  let next = learnDiscovery(state, [{ ...clue, observedMinutes: state.elapsedMinutes }]);
  next = grantInterpretation(next, clue, clue.source === "hermit-revelation" ? "hermit" : "power");
  if (clue.targetType === "parent-trail" && next.trail.exploration && clue.availability === "current") {
    next = { ...next, trail: { ...next.trail, exploration: { ...next.trail.exploration,
      knownStage: next.trail.index,
      reports: (next.trail.exploration.reports ?? []).map(report => ({
        ...report, ...(report.stage === next.trail.index && report.outcome === "suggestion" &&
          report.town.name !== clue.facts.place ? { contradicted: true } : {}),
      })),
    } } };
    next.lore.contradictedReports = next.discovery.entries.filter(entry =>
      entry.targetType === "parent-trail" && entry.targetId === clue.targetId && entry.kind === "suggestion" &&
      entry.facts.place !== clue.facts.place).map(discoveryIdentity);
  }
  return next;
}

// Prepared land is the routing graph; never invent missing terrain or an air-line bearing.
export function parentPath(state, map) {
  const target = state.trail?.completed ? null : state.trail?.stages[state.trail.index];
  if (!target) return null;
  const valid = (col, row) => {
    const cell = loreCell(map, col, row);
    return cell && !cell.unavailable && cell.terrain !== "water";
  };
  if (!valid(target.col, target.row) || !valid(state.col, state.row)) return null;
  const start = `${state.col},${state.row}`, goal = `${target.col},${target.row}`;
  const queue = [[state.col, state.row]], parents = new Map([[start, null]]);
  for (let index = 0; index < queue.length; index++) {
    const [col, row] = queue[index], key = `${col},${row}`;
    if (key === goal) {
      const points = [];
      for (let cursor = key; cursor !== null; cursor = parents.get(cursor)) points.push(cursor.split(",").map(Number));
      points.reverse();
      let minutes = 0;
      for (let i = 1; i < points.length; i++) {
        const [c, r] = points[i], [pc, pr] = points[i - 1];
        minutes += travelCost(loreCell(map, pc, pr), loreCell(map, c, r), map.cellSizeMeters, 0).minutes;
      }
      return { stage: state.trail.index, points, distanceMeters: (points.length - 1) * map.cellSizeMeters,
        walkingMinutes: minutes,
        direction: points.length > 1 ? clueDirection(state, { col: points[1][0], row: points[1][1] }) : "arrived" };
    }
    for (const [dc, dr] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      const c = col + dc, r = row + dr, next = `${c},${r}`;
      if (valid(c, r) && !parents.has(next)) { parents.set(next, key); queue.push([c, r]); }
    }
  }
  return null;
}

export function knownParentLanding(state, col, row) {
  const names = new Set(state.discovery.entries.filter(entry => entry.targetType === "parent-trail" &&
    entry.kind === "place").map(entry => entry.facts.place));
  return state.trail?.stages.slice(0, state.trail.index + 1).find(stage => stage.col === col && stage.row === row &&
    names.has(stage.name) && (Number.isSafeInteger(stage.geonameId) && stage.geonameId > 0 ||
      /^node\/[1-9]\d*$/.test(stage.osmId)));
}

export function worldTargets(state, map) {
  const names = new Set(state.discovery.entries.flatMap(entry => entry.facts.place &&
    entry.facts.confirmed !== false && !(state.lore.contradictedReports ?? []).includes(discoveryIdentity(entry))
    ? [entry.facts.place] : []));
  for (const visit of state.lore.visitedSettlements ?? []) names.add(visit.town);
  const targets = [];
  for (const { cell, col, row } of loreCells(map)) {
    const place = cell.terrain === "place" &&
      cell.settlements?.find(place => names.has(place.name));
    if (place && !cell.unavailable && (col !== state.col || row !== state.row)) {
      targets.push({ id: JSON.stringify([col, row]), col, row, town: place.name });
    }
  }
  for (const stage of state.trail?.stages.slice(0, state.trail.index + 1) ?? []) {
    const cell = loreCell(map, stage.col, stage.row);
    if (cell && !cell.unavailable && cell.terrain !== "water" &&
        knownParentLanding(state, stage.col, stage.row) && (stage.col !== state.col || stage.row !== state.row) &&
        !targets.some(target => target.col === stage.col && target.row === stage.row)) {
      targets.push({ id: JSON.stringify([stage.col, stage.row]), col: stage.col, row: stage.row, town: stage.name });
    }
  }
  return targets;
}

export function refundableDebits(state) {
  let remaining = 3000;
  return [...(state.lore.debits ?? [])].filter(debit => debit.observedMinutes >= state.elapsedMinutes - 1440 &&
    debit.observedMinutes <= state.elapsedMinutes && debit.cents > debit.reclaimedCents)
    .sort((a, b) => b.observedMinutes - a.observedMinutes || a.id.localeCompare(b.id))
    .flatMap(debit => {
      const cents = Math.min(remaining, debit.cents - debit.reclaimedCents);
      remaining -= cents;
      return cents > 0 ? [{ id: debit.id, cents }] : [];
    });
}
