import { hospitalityTown } from "./hospitality.mjs";

const TOPICS = {
  parent: "open-trail", clues: "open-hint", notebooks: "abandoned-ask-town",
  shelter: "sleep-travel", food: "eat-travel", work: "open-earn-money",
  transport: "open-journey-world", town: "open-town",
};

export function setupConversations(t, { context }) {
  const $ = id => document.getElementById(id);
  const dialog = $("conversation-dialog");
  const trigger = $("open-conversation");
  let legend = false;
  function localize() {
    const current = context();
    const town = current && hospitalityTown(current.cell);
    const unavailable = !town || current.blocked || Boolean(current.state.ended);
    trigger.disabled = unavailable;
    $("town-conversation").disabled = unavailable;
    $("conversation-context").textContent = t(town ? "conversation.welcome" : "conversation.noTown",
      { town: town?.name ?? "" });
    $("conversation-reply").hidden = !legend;
    $("conversation-reply").textContent = legend ? t("conversation.legend") : "";
    for (const [topic, target] of Object.entries(TOPICS)) {
      const source = $(target);
      $(`conversation-${topic}`).disabled = unavailable || !source || source.disabled || source.hidden;
    }
    $("conversation-artifacts").disabled = unavailable;
  }
  function open() {
    localize();
    if (trigger.disabled || document.querySelector("dialog[open]")) return;
    legend = false;
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
  $("conversation-artifacts").addEventListener("click", () => {
    localize();
    if ($("conversation-artifacts").disabled) return;
    legend = true;
    localize();
    $("conversation-reply").focus();
  });
  $("conversation-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => trigger.focus());
  return { localize, reset() { legend = false; dialog.close(); } };
}
