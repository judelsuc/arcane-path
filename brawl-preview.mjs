import { mountBrawl } from "./minigames/brawl-ui.mjs";
import { replayBrawl } from "./minigames/brawl.mjs";

const language = new URLSearchParams(location.search).get("lang") === "fr" ? "fr" : "en";
const fr = language === "fr";
document.documentElement.lang = language;
const $ = id => document.getElementById(id);
$("preview-title").textContent = fr ? "Garde haute - aperçu" : "Garde haute (self-defence) - preview";
$("preview-note").textContent = fr
  ? "Bac à sable fictif, sans sauvegarde ni effet sur le voyage. Chaque combat est rejoué pour vérifier son issue."
  : "Fictional sandbox with no save access or journey effect. Each fight is replayed to check its outcome.";
$("label-context").textContent = fr ? "Situation" : "Situation";
const contexts = $("preview-context").options;
[contexts[0].textContent, contexts[1].textContent, contexts[2].textContent] = fr
  ? ["Rue", "Bivouac (réveil)", "Le poursuivant"] : ["Street", "Camp (woken up)", "The pursuer"];
$("label-opponents").textContent = fr ? "Agresseurs" : "Attackers";
$("preview-level-label").textContent = fr ? "Niveau" : "Level";
$("label-dog").textContent = fr ? "Chien présent" : "Dog present";
$("label-night").textContent = fr ? "Nuit" : "Night";
$("preview-reset").textContent = fr ? "Nouveau combat" : "New fight";
const params = new URLSearchParams(location.search);
for (const [key, id] of [["context", "preview-context"], ["opponents", "preview-opponents"], ["level", "preview-level"]]) {
  if ([...$(id).options].some(option => option.value === params.get(key))) $(id).value = params.get(key);
}
if (params.get("dog") === "1") $("preview-dog").checked = true;
if (params.get("day") === "1") $("preview-night").checked = false;
let ui, seed = Number(params.get("seed")) >>> 0 || Date.now() >>> 0;
function restart() {
  ui?.destroy();
  $("preview-result").textContent = ""; $("preview-error").textContent = "";
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  const context = $("preview-context").value;
  $("preview-opponents").disabled = context === "pursuer";
  const setup = { seed, context, level: Number($("preview-level").value), opponents: Number($("preview-opponents").value),
    breath: 4, dog: $("preview-dog").checked, drowsy: context === "camp" };
  try {
    ui = mountBrawl($("brawl-board"), setup, { language, phase: $("preview-night").checked ? "night" : "day",
      onFinish({ outcome, transcript }) {
        const replayed = replayBrawl(setup, transcript);
        $("preview-result").textContent = `${fr ? "Issue" : "Outcome"}: ${outcome} · ${fr ? "rejeu" : "replay"}: ${replayed === outcome ? "OK" : replayed}`;
      } });
  } catch (reason) {
    console.error("Unable to prepare the brawl preview:", reason);
    $("preview-error").textContent = `Error: ${reason.message}`;
  }
}
for (const id of ["preview-reset"]) $(id).addEventListener("click", restart);
for (const id of ["preview-context", "preview-opponents", "preview-level", "preview-dog", "preview-night"]) $(id).addEventListener("change", restart);
restart();
