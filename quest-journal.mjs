import { QUEST_TEMPLATES } from "./service-quests.mjs";
import { translate } from "./i18n.mjs";

export function questJournalEntries(state, language = "fr") {
  const lang = language === "en" ? "en" : "fr";
  const entries = [];
  for (const quest of state.serviceQuests?.quests ?? []) {
    const template = QUEST_TEMPLATES.find(item => item.id === quest.template);
    const path = quest.destinations.map((poi, index) =>
      `${index + 1}. ${poi.town} — ${poi.name}${index < quest.step ? " ✓" : ""}`).join(" → ");
    entries.push(`${template.title[lang]} — ${quest.wording?.offer?.[lang] ?? template.request[lang]} — ${path} — ${
      translate(lang, `quests.status.${quest.status}`)} · €${(quest.rewardCents / 100).toFixed(2)}${quest.status === "completed"
      ? ` — ${quest.wording?.conclusion?.[lang] ?? template.conclusion[lang]}` : ""}`);
  }
  for (const entry of state.questDirections ?? []) entries.push(`${entry.name} — ${entry.text}`);
  return entries;
}
