import { followQuest, followedQuest, questObjectives } from "./quest-objectives.mjs";
import { loreItem } from "./lore-catalogue.mjs";
import { renderQuestMap } from "./quest-map.mjs";

export function setupQuestTracking(t, { context, mutate }) {
  const host = document.createElement("section"), label = document.createElement("label");
  const select = document.createElement("select"), status = document.createElement("p");
  select.id = "quest-follow-objective"; label.htmlFor = select.id; status.setAttribute("role", "status");
  const preview = document.createElement("section");
  host.className = "quest-command-block"; host.append(label, select, status, preview);
  document.getElementById("trail-dialog").querySelector("nav").after(host);
  select.addEventListener("change", () => {
    if (!mutate(state => followQuest(state, select.value || null))) status.textContent = t("quests.trackingSaveError");
    else { status.textContent = ""; localize(); }
  });
  function localize() {
    const current = context(), state = current?.state;
    const summary = document.getElementById("quest-followed-target");
    preview.replaceChildren();
    label.textContent = t("quests.follow");
    select.replaceChildren();
    const none = document.createElement("option"); none.value = ""; none.textContent = t("quests.unfollow"); select.append(none);
    if (!state) { select.disabled = true; summary.hidden = true; return; }
    for (const objective of questObjectives(state)) {
      const option = document.createElement("option"); option.value = objective.id;
      const name = objective.category === "artifacts"
        ? loreItem(objective.name)[document.documentElement.lang === "en" ? "en" : "fr"] : objective.name;
      option.textContent = `${t(`quests.${objective.category}`)} — ${name}${objective.destination ? ` · ${objective.destination}` : ""}`;
      select.append(option);
    }
    const followed = followedQuest(state);
    select.value = followed?.id ?? ""; select.disabled = current.blocked;
    summary.hidden = !followed;
    if (followed) {
      const option = [...select.options].find(item => item.value === followed.id);
      summary.textContent = `${t("quests.follow")} : ${option.textContent}${followed.target ? "" : ` · ${t("quests.noExactTarget")}`}`;
      if (current.map && followed.target) renderQuestMap(preview, state,
        [{ ...followed.target, name: followed.destination ?? followed.name }], current.map, t);
    }
  }
  return { localize };
}
