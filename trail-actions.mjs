import { atTrailTarget, witnessFacts } from "./trail.mjs";
import { restSurvival } from "./survival.mjs";
import { finishAction, marketPrice, didFaint } from "./economy.mjs";

export const CLUE_ACTIONS = Object.freeze({
  discuss: { minutes: 15, fatigue: 1, kcal: 10 },
  photo: { minutes: 30, fatigue: 3, kcal: 30 },
  letter: { minutes: 20, fatigue: 2, kcal: 15 },
  search: { minutes: 40, fatigue: 5, kcal: 50 },
  buy: { minutes: 10, fatigue: 1, kcal: 5, mealUnits: 0.25 },
  guestbook: { minutes: 25, fatigue: 2, kcal: 20 },
  ticket: { minutes: 30, fatigue: 3, kcal: 25 },
  directions: { minutes: 15, fatigue: 1, kcal: 10 },
});

export function clueActions(state) {
  if (state.trail?.version !== 2 || !atTrailTarget(state) || state.ended) return [];
  if (state.trail.discovery?.pending) return ["directions"];
  const variants = [
    ["discuss", "photo", "letter", "buy"],
    ["search", "letter", "guestbook", "discuss"],
    ["ticket", "photo", "buy", "search"],
  ];
  return variants[state.trail.index % variants.length];
}

export function searchClueOptions(state, cell, info, economy) {
  return clueActions(state).filter(kind => !["directions", "rumor"].includes(kind) &&
    (!CLUE_ACTIONS[kind].mealUnits ||
      state.walletCents >= marketPrice(cell, CLUE_ACTIONS[kind].mealUnits, economy, info).cents));
}

export async function prepareClueSearch(state, cell, info, economy, resolvePhoto, random = Math.random) {
  const options = searchClueOptions(state, cell, info, economy);
  if (!options.length) throw new Error("No affordable clue search available here.");
  const choose = values => {
    const roll = random();
    if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new Error("Invalid clue search draw.");
    return values[Math.floor(roll * values.length)];
  };
  let kind = choose(options);
  if (kind !== "photo") return { kind, photoUnavailable: false };
  const content = await resolvePhoto(state, state.trail.index);
  if (content) return { kind, content, photoUnavailable: false };
  kind = choose(options.filter(option => option !== "photo"));
  return { kind, photoUnavailable: true };
}

export function trailClue(state, kind, cell, info, survival, economy) {
  if (!clueActions(state).includes(kind)) throw new Error("This clue action is unavailable here.");
  const rule = CLUE_ACTIONS[kind];
  const cents = rule.mealUnits ? marketPrice(cell, rule.mealUnits, economy, info).cents : 0;
  if (state.walletCents < cents) throw new Error("Insufficient funds.");
  const rested = restSurvival({ ...state, walletCents: state.walletCents - cents,
    lastExpenseCents: cents }, { ...survival, rest_minutes: rule.minutes, rest_fatigue_recovery: 0 });
  const reserveKcal = Math.max(0, rested.reserveKcal - rule.kcal);
  const fatigue = Math.min(100, rested.fatigue + rule.fatigue);
  let next = finishAction(state, { ...rested, reserveKcal, fatigue,
    energyKcal: rested.energyKcal + rule.kcal,
    ended: rested.ended ?? (reserveKcal <= 0 ? "hunger" : null) }, info, economy, { survival });
  if (next.ended || didFaint(state, next)) return next;
  const facts = witnessFacts(state);
  const target = facts.next;
  const pending = kind !== "directions" && Boolean(target?.venue);
  const discovery = { kind: kind === "directions" ? state.trail.discovery.kind : kind,
    step: state.trail.index, pending, place: state.trail.stages[state.trail.index].name,
    nextName: target?.name ?? null, venue: target?.venue?.name ?? null };
  if (pending) return { ...next, trail: { ...state.trail, discovery } };
  const index = state.trail.index + 1;
  const completed = index === state.trail.stages.length;
  return { ...next, ended: completed ? "reunion" : null, trail: { ...state.trail,
    index, completed, discovery, history: [...state.trail.history, {
      ...facts, clueKind: discovery.kind, usedDirections: kind === "directions",
    }] } };
}
