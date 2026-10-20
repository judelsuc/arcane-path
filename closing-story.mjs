import { isDeath } from "./death.mjs";

export const CLOSING_STORY = "story.closing";

export function closingSummary(state, { includePlacement = false } = {}) {
  if (!isDeath(state) && state?.ended !== "reunion" &&
      !(includePlacement && state?.ended === "placement")) return null;
  const exploration = state.trail?.exploration;
  const reachedStages = (state.trail?.stages ?? []).flatMap((_, stage) => {
    const history = state.trail.history?.[stage];
    const arrival = state.trail.arrivals?.find(entry => entry.stage === stage);
    if (!history && !arrival) return [];
    const minutes = arrival?.elapsedMinutes ?? history?.elapsedMinutes;
    return [{ stage, elapsedMinutes: Number.isFinite(minutes) ? Math.round(minutes) : null }];
  });
  const events = (state.events?.history ?? []).map(event => ({
    kind: event.kind, elapsedMinutes: Math.round(event.elapsedMinutes),
  }));
  return {
    outcome: state.ended,
    walkingMeters: Math.round(state.distanceMeters),
    elapsedMinutes: Math.round(state.elapsedMinutes),
    ascentMeters: Math.round(state.ascentMeters),
    stagesReached: reachedStages.length,
    meals: state.meals,
    sleeps: state.sleeps,
    performances: state.performances ?? 0,
    cafeShifts: state.cafeShifts ?? 0,
    recordedClues: (exploration?.hints?.length ?? 0) + (exploration?.signs?.length ?? 0) +
      (exploration?.reports?.filter(report => report.outcome === "suggestion").length ?? 0),
    recordedDreams: state.trail?.dreams?.checks?.filter(check => check.outcome === "guidance").length ?? 0,
    recordedEncounters: state.events?.history?.length ?? 0,
    reachedStages,
    events,
  };
}

export function closingStoryText(state, t, generated, language = "fr",
  { milestones = true, includePlacement = false } = {}) {
  const summary = closingSummary(state, { includePlacement });
  if (!summary) return "";
  return generated?.[language === "en" ? "en" : "fr"] ?? [
    t(state.ended === "reunion" ? "closingStoryReunion" :
      state.ended === "placement" ? "closingStoryPlacement" : "closingStoryDeath"),
    t("closingStoryStats", {
      km: (summary.walkingMeters / 1000).toFixed(2),
      days: Math.floor(summary.elapsedMinutes / 1440),
      hours: Math.floor(summary.elapsedMinutes % 1440 / 60),
      stages: summary.stagesReached, meals: summary.meals, sleeps: summary.sleeps,
    }),
    ...(milestones && summary.reachedStages.length ? [t("closingStoryStages", {
      places: summary.reachedStages.map(entry => state.trail.stages[entry.stage].name).join(" → "),
    })] : []),
    ...(milestones && summary.events.length ? [t("closingStoryEvents", {
      events: summary.events.map(event => t(`journeyEvent.${event.kind}`)).join(" "),
    })] : []),
    t("closingStoryEnd"),
  ].join("\n\n");
}
