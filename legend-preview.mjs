import { LEGEND } from "./legend-adventure.mjs";
import { COPY } from "./legend-adventure-copy.mjs";
import { mount } from "./minigames/legend-adventure-ui.mjs";
import { loadLegendBackgrounds } from "./legend-backgrounds.mjs";
import { DUNGEON_PROFILES } from "./minigames/legend-dungeon.mjs";
import { PLATFORM_PROFILES } from "./minigames/legend-layout.mjs";
import { INVESTIGATION_PROFILES } from "./minigames/legend-investigation.mjs";
import { INVESTIGATION_COPY } from "./minigames/legend-investigation-copy.mjs";

const params = new URLSearchParams(location.search);
const language = params.get("lang") === "fr" ? "fr" : "en";
const copy = COPY[language];
document.documentElement.lang = language;
document.title = copy.title;
const text = (selector, value) => { document.querySelector(selector).textContent = value; };
text("#preview-title", copy.title);
text("#preview-note", copy.note);
text("#legend-story", copy.legend);
text("#legend-accounts-title", copy.accounts);
text("#treasure-title", copy.treasure);
text("#treasure-name", LEGEND.treasure.name[language]);
text("#treasure-effects", copy.effects);
text("#preview-reset", copy.restart);
text("#preview-art-credit a", language === "fr" ? "Licence du modèle SDXL" : "SDXL model license");
document.querySelector("#preview-formats").setAttribute("aria-label", copy.title);
const formats = ["platform", "investigation", "dungeon"];
const profiles = { platform: PLATFORM_PROFILES, investigation: INVESTIGATION_PROFILES, dungeon: DUNGEON_PROFILES };
let format = formats.includes(params.get("format")) ? params.get("format") : "platform";
let tier = Object.hasOwn(profiles[format], params.get("tier")) ? params.get("tier") : "modest";
let weapon = ["none", "knife", "sword"].includes(params.get("weapon")) ? params.get("weapon") : "none";
let seed = params.has("seed") ? Number(params.get("seed")) : 1;
let backgrounds = {};
let artRequest;
let ui;
function showError(error) {
  console.error("Unable to run town legend playtest:", error);
  text("#preview-error", `${language === "fr" ? "Erreur" : "Error"}: ${error.message}`);
}
function restart() {
  ui?.destroy();
  ui = null;
  text("#preview-error", "");
  document.querySelector("#preview-layout").hidden = false;
  document.querySelector("#preview-dungeon-settings").hidden = false;
  document.querySelector("#preview-weapon").parentElement.hidden = format !== "dungeon";
  const accounts = format === "investigation" ? INVESTIGATION_COPY[language].accounts : LEGEND.accounts[language];
  document.querySelector("#legend-accounts").replaceChildren(...accounts.map(account => {
    const item = document.createElement("li");
    item.textContent = account;
    return item;
  }));
  for (const option of document.querySelector("#preview-tier").options) {
    const profile = profiles[format][option.value];
    option.textContent = `${copy.tiers[option.value]} (${profile.rooms} ${copy.rooms}, ${copy.rewardBudget} ${profile.rewardBudget}/3)`;
  }
  const url = new URL(location.href);
  for (const [key, value] of Object.entries({ format, tier, weapon, seed })) url.searchParams.set(key, String(value));
  history.replaceState(null, "", url);
  for (const name of formats) {
    document.querySelector(`#format-${name}`).setAttribute("aria-pressed", String(name === format));
  }
  try {
    ui = mount(document.querySelector("#legend-board"), { format, language, seed, tier, weapon, backgrounds,
      generatedInvestigation: format === "investigation", paced: true, onError: showError });
  } catch (error) {
    showError(error);
  }
}
for (const name of formats) {
  const button = document.querySelector(`#format-${name}`);
  button.textContent = copy[name];
  button.addEventListener("click", () => { format = name; restart(); });
}
text("#preview-tier-label", copy.tierLabel);
text("#preview-weapon-label", copy.weaponLabel);
for (const [selector, labels, selected] of [
  ["#preview-tier", copy.tiers, tier], ["#preview-weapon", copy.weapons, weapon],
]) {
  const select = document.querySelector(selector);
  for (const [value, label] of Object.entries(labels)) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.append(option);
  }
  select.value = selected;
  select.addEventListener("change", () => {
    tier = document.querySelector("#preview-tier").value;
    weapon = document.querySelector("#preview-weapon").value;
    restart();
  });
}
document.querySelector("#preview-reset").addEventListener("click", restart);
const layoutButton = document.querySelector("#preview-layout");
layoutButton.textContent = copy.newLayout;
layoutButton.addEventListener("click", () => {
  seed = crypto.getRandomValues(new Uint32Array(1))[0];
  const url = new URL(location.href);
  url.searchParams.set("seed", String(seed));
  history.replaceState(null, "", url);
  restart();
});
const refreshArt = document.querySelector("#preview-art-refresh");
refreshArt.textContent = language === "fr" ? "Actualiser les illustrations" : "Refresh artwork";
async function refreshBackgrounds() {
  artRequest?.abort();
  const controller = new AbortController();
  artRequest = controller;
  refreshArt.disabled = true;
  text("#preview-art-error", "");
  const statuses = new Map();
  try {
    const result = await loadLegendBackgrounds({ signal: controller.signal, onStatus(scene, status) {
      if (controller.signal.aborted) return;
      statuses.set(scene, status);
      text("#preview-art-status", [...new Set(statuses.values())].map(value => copy.art[value]).join(" "));
    } });
    if (controller.signal.aborted) return;
    backgrounds = result.images;
    document.querySelector("#preview-art-credit").hidden = !Object.keys(backgrounds).length;
    ui?.setBackgrounds(backgrounds);
    if (result.failures.length) {
      for (const error of result.failures) console.error("Legend background unavailable:", error);
      text("#preview-art-error", copy.art.error);
    }
  } catch (error) {
    if (controller.signal.aborted) return;
    console.error("Legend backgrounds unavailable:", error);
    text("#preview-art-error", `${copy.art.error} ${error.message}`);
  } finally {
    if (!controller.signal.aborted) refreshArt.disabled = false;
  }
}
refreshArt.addEventListener("click", () => { void refreshBackgrounds(); });
for (const link of document.querySelectorAll("a[href^='?lang=']")) {
  link.addEventListener("click", () => {
    const target = new URL(link.href);
    target.searchParams.set("format", format);
    target.searchParams.set("seed", String(seed));
    target.searchParams.set("tier", tier);
    target.searchParams.set("weapon", weapon);
    link.href = target.href;
  });
}
window.addEventListener("pagehide", () => { artRequest?.abort(); ui?.destroy(); ui = null; });
window.addEventListener("pageshow", event => { if (event.persisted) { restart(); void refreshBackgrounds(); } });
restart();
void refreshBackgrounds();
