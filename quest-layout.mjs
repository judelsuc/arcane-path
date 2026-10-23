export function setupQuestLayout(t) {
  const $ = id => document.getElementById(id);
  const quests = $("trail-dialog"), dialogue = $("conversation-dialog");
  quests.setAttribute("data-native-controls", "");
  dialogue.setAttribute("data-native-controls", "");
  const parent = document.createElement("section");
  parent.id = "quests-parent";
  while (quests.firstChild) parent.append(quests.firstChild);
  const header = document.createElement("header"), title = document.createElement("h2");
  title.id = "quests-title";
  title.dataset.i18n = "quests.title";
  const close = document.createElement("button");
  close.type = "button";
  close.dataset.i18n = "windowHelpClose";
  close.addEventListener("click", () => quests.close());
  header.append(title, close);
  quests.setAttribute("aria-labelledby", title.id);
  const tabs = document.createElement("nav");
  tabs.className = "quest-tabs";
  tabs.setAttribute("aria-label", t("quests.title"));
  quests.append(header, tabs, parent);
  parent.querySelector(".trail-heading form")?.remove();
  const services = document.createElement("section");
  services.id = "quests-services";
  const artifacts = document.createElement("section");
  artifacts.id = "quests-artifacts";
  const journals = $("abandoned-journals");
  journals.id = "abandoned-journals";
  const journalPane = document.createElement("section");
  journalPane.id = "quests-journals";
  journalPane.append(journals);
  quests.append(services, journalPane, artifacts);
  $("abandoned-journals-dialog").remove();

  const dialogueBody = document.createElement("section");
  dialogueBody.id = "dialogue-body";
  dialogue.append(dialogueBody);
  const directionPanel = document.createElement("section");
  directionPanel.id = "dialogue-directions";
  const hints = $("hint-dialog");
  for (const child of [...hints.children]) {
    if (child.tagName !== "FORM" && child.tagName !== "H2") directionPanel.append(child);
  }
  hints.remove();
  const parentTalk = document.createElement("section");
  parentTalk.id = "dialogue-parent";
  const serviceTalk = document.createElement("section");
  serviceTalk.id = "dialogue-services";
  const journalTalk = document.createElement("section");
  journalTalk.id = "dialogue-journals";
  const artifactTalk = document.createElement("section");
  artifactTalk.id = "dialogue-artifacts";
  dialogueBody.append(parentTalk, directionPanel, serviceTalk, journalTalk, artifactTalk);
  let selected = "parent";
  const panes = { parent, services, journals: journalPane, artifacts };
  const buttons = {};
  for (const name of Object.keys(panes)) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.i18n = `quests.${name}`;
    button.addEventListener("click", () => select(name));
    tabs.append(button);
    buttons[name] = button;
  }
  function select(name) {
    selected = name;
    for (const [key, pane] of Object.entries(panes)) {
      pane.hidden = key !== name;
      buttons[key].setAttribute("aria-pressed", String(key === name));
    }
  }
  function open() {
    if ($("open-quests").disabled || document.querySelector("dialog[open]")) return;
    select(selected);
    quests.showModal();
    buttons[selected].focus();
  }
  $("open-quests").addEventListener("click", open);
  quests.addEventListener("close", () => $("open-quests").focus());
  select(selected);
  return {
    open, select,
    localize() {
      title.textContent = t("quests.title");
      close.textContent = t("windowHelpClose");
      for (const [name, button] of Object.entries(buttons)) button.textContent = t(`quests.${name}`);
    },
  };
}
