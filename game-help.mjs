import { setupWindowHelp } from "./window-help.mjs";

export const GAME_HELP_HOSTS = [
  "#title-screen", "#journey-setup", "#game-content", "dialog",
].join(", ");

export function setupGameHelp(t, doc = globalThis.document) {
  return setupWindowHelp(doc, {
    sources: ".window-help-text", hosts: GAME_HELP_HOSTS,
    words: () => ({ help: t("windowHelpTitle"), close: t("windowHelpClose"), timing: t("windowHelpTiming") }),
    description: host => t(`windowHelp.${host.id}`),
  });
}
