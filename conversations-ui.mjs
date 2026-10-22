import { hospitalityTown } from "./hospitality.mjs";

const TOPICS = {
  shelter: "sleep-travel", food: "eat-travel", work: "open-earn-money",
  transport: "open-journey-world", town: "open-town",
};

export function setupConversations(t, { context }) {
  const $ = id => document.getElementById(id);
  const dialog = $("conversation-dialog");
  const trigger = $("open-conversation");
  let selected = "parent";
  const panes = { parent: "dialogue-parent", clues: "dialogue-directions",
    notebooks: "dialogue-journals", artifacts: "dialogue-artifacts", services: "dialogue-services" };
  function localize() {
    const current = context();
    const town = current && hospitalityTown(current.cell);
    const unavailable = !current || current.blocked || Boolean(current.state.ended) ||
      !current.cell || current.cell.unavailable || current.cell.terrain === "water";
    trigger.disabled = unavailable;
    $("town-conversation").disabled = unavailable;
    $("conversation-context").textContent = t(town ? "conversation.welcome" : "conversation.onRoad",
      { town: town?.name ?? "" });
    $("conversation-reply").hidden = selected !== "artifacts";
    $("conversation-reply").textContent = selected === "artifacts" ? t("conversation.legend") : "";
    for (const [topic, target] of Object.entries(TOPICS)) {
      const source = $(target);
      $(`conversation-${topic}`).disabled = unavailable || !source || source.disabled || source.hidden;
    }
    for (const [topic, pane] of Object.entries(panes)) {
      const button = $(`conversation-${topic}`);
      button.disabled = unavailable;
      button.setAttribute("aria-pressed", String(selected === topic));
      $(pane).hidden = selected !== topic;
    }
  }
  function open() {
    localize();
    if (trigger.disabled || document.querySelector("dialog[open]")) return;
    localize();
    dialog.showModal();
    $("conversation-parent").focus();
  }
  trigger.addEventListener("click", open);
  $("town-conversation").addEventListener("click", () => {
    $("town-dialog").close();
    open();
  });
  for (const [topic, target] of Object.entries(TOPICS)) {
    $(`conversation-${topic}`).addEventListener("click", () => {
      localize();
      if ($(`conversation-${topic}`).disabled) return;
      dialog.close();
      $(target).click();
    });
  }
  for (const topic of Object.keys(panes)) {
    $(`conversation-${topic}`).addEventListener("click", () => {
      if ($(`conversation-${topic}`).disabled) return;
      selected = topic;
      localize();
    });
  }
  $("conversation-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => trigger.focus());
  return { localize, open, reset() { selected = "parent"; dialog.close(); } };
}
