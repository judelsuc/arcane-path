import { setupWindowHelp } from "./window-help.mjs";

export const GAME_HELP_HOSTS = [
  "#title-screen", "#journey-setup", "#game-content", "dialog",
].join(", ");

export const GAME_HELP_SOURCES = [
  ".window-help-text", ".game-help-text",
  ...["washHelp", "pressureHelp", "weatherTemperatureNote", "weatherAverage", "skyNote",
    "cellActionsDisabled", "conversation.rules", "journalStorage", "journalStatsNote",
    "hintWarning", "trailCost", "musicCost", "theftCost", "cafeCost", "townVisitNote",
    "journeyEventIllustration", "storyNameFlavour", "placeChoose", "noLocalMeal", "layer",
  ].map(key => `[data-i18n="${key}"]`),
  ...["travel-toolbar-help", "needs-speed-effect", "rest-effect", "meal-location", "look-status",
    "weather-effects", "birth-tarot-events", "daily-tarot-events", "pressure-tarot", "ascii-title",
    "choice-forage-note", "choice-beg-note", "choice-steal-note",
    "music-card-effect", "music-skill", "cafe-skill", "trail-evidence-summary",
  ].map(id => `#${id}`),
].join(", ");

export const GAME_TECHNICAL_SOURCES = [
  ".technical-text", ".journal-cover-wording-status",
  ...["travel-streaming", "journey-path-status", "map-size", "map-source",
    "cell-info", "content-position", "cache-status", "copy-coordinates-status",
    "copy-coordinates", "refresh-content", "clear-content",
    "economy-pricing", "economy-price-source", "trail-catalogue-credit", "journal-status",
    "journey-world-error", "survival-choice-error", "earn-money-error", "economy-action-error",
    "hint-action-error", "trail-action-error",
    "audio-status", "footstep-status", "journey-audio-status", "music-audio-status",
    "theft-audio-status", "cafe-audio-status",
    "opening-story-status", "closing-story-status", "journey-event-wording-status",
    "trail-dream-wording-status", "economy-npc-wording-status",
  ].map(id => `#${id}`),
].join(", ");

export function setupGameHelp(t, doc = globalThis.document) {
  return setupWindowHelp(doc, {
    sources: GAME_HELP_SOURCES, foldedSources: GAME_TECHNICAL_SOURCES, hosts: GAME_HELP_HOSTS,
    words: () => ({ help: t("windowHelpTitle"), close: t("windowHelpClose"), timing: t("windowHelpTiming"),
      details: t("technicalDetails"), failure: t("technicalFailure") }),
    description: host => t(`windowHelp.${host.id}`),
  });
}
