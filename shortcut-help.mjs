import { buttonBindings } from "./button-shortcuts.mjs";

const ACTIONS = [
  ["look-travel", "look"], ["open-survival-choices", "actions"],
  ["eat-travel", "eat"], ["rest-travel", "rest"], ["sleep-travel", "sleep"],
  ["open-music", "music"], ["open-trail", "trail"], ["open-town", "town"],
  ["show-photo", "photo"], ["open-hint", "hint"], ["copy-coordinates", "coordinates"],
  ["save-travel", "save"], ["retry-travel", "retry"], ["open-osm", "osm"],
  ["stop-travel", "stop"], ["start-travel", "new"], ["resume-travel", "resume"],
  ["open-options", "options"], ["open-controls", "help"],
];

export function shortcutHelpRows(t) {
  const directions = buttonBindings(["0,-1", "-1,0", "0,1", "1,0"].map(move => ({ move })));
  return [
    { key: directions.map(({ key }) => t(`shortcutKey.${key}`)).join(" "), usage: t("controls.move") },
    ...buttonBindings(ACTIONS.map(([id]) => ({ id }))).map(({ key }, index) =>
      ({ key, usage: t(`controls.${ACTIONS[index][1]}`) })),
  ];
}

export function setupShortcutHelp(t) {
  const dialog = document.querySelector("#controls-dialog");
  const list = document.querySelector("#controls-list");
  let shown = false;
  function localize() {
    list.replaceChildren();
    for (const { key, usage } of shortcutHelpRows(t)) {
      const row = document.createElement("tr");
      const heading = document.createElement("th");
      heading.scope = "row";
      const label = document.createElement("kbd");
      label.textContent = key;
      heading.append(label);
      const description = document.createElement("td");
      description.textContent = usage;
      row.append(heading, description);
      list.append(row);
    }
  }
  function open() {
    if (document.querySelector("dialog[open]")) return;
    localize();
    dialog.showModal();
    shown = true;
  }
  document.querySelector("#open-controls").addEventListener("click", open);
  return { localize, welcome() { if (!shown) open(); } };
}
