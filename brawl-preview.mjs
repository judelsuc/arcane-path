import { mountBrawl } from "./minigames/brawl-ui.mjs";
import { replayBrawl } from "./minigames/brawl.mjs";
import { createBrawlAudio } from "./minigames/brawl-audio.mjs";
import { musicCandidates } from "./audio.mjs";

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
$("label-knife").textContent = fr ? "Couteau dans l'inventaire" : "Knife in the inventory";
let soundOn = true;
const audio = createBrawlAudio({ createContext: () => new AudioContext(),
  onError: message => { if (message) $("preview-error").textContent = message; } });
// The fight music, if a "18 - music-fight" file has been added; silence otherwise.
const music = new Audio(); music.loop = true; music.volume = 0.3;
const tracks = musicCandidates("music-fight");
let trackIndex = 0;
music.addEventListener("error", () => { if (++trackIndex < tracks.length) { music.src = tracks[trackIndex]; if (soundOn) void music.play().catch(() => {}); } });
music.src = tracks[0];
const startMusic = () => { if (soundOn && trackIndex < tracks.length && music.paused) void music.play().catch(() => {}); };
document.addEventListener("keydown", startMusic); document.addEventListener("pointerdown", startMusic);
function updateSound() {
  $("preview-sound").textContent = fr ? (soundOn ? "Son : actif" : "Son : coupé") : (soundOn ? "Sound: on" : "Sound: off");
  $("preview-sound").setAttribute("aria-pressed", String(soundOn));
  audio.enable(soundOn);
  if (!soundOn) music.pause(); else startMusic();
}
$("preview-sound").addEventListener("click", () => { soundOn = !soundOn; updateSound(); });
updateSound();
$("preview-reset").textContent = fr ? "Nouveau combat" : "New fight";
const params = new URLSearchParams(location.search);
for (const [key, id] of [["context", "preview-context"], ["opponents", "preview-opponents"], ["level", "preview-level"]]) {
  if ([...$(id).options].some(option => option.value === params.get(key))) $(id).value = params.get(key);
}
if (params.get("dog") === "1") $("preview-dog").checked = true;
if (params.get("knife") === "1") $("preview-knife").checked = true;
if (params.get("day") === "1") $("preview-night").checked = false;
let ui, seed = Number(params.get("seed")) >>> 0 || Date.now() >>> 0;
function restart() {
  ui?.destroy();
  $("preview-result").textContent = ""; $("preview-error").textContent = "";
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  const context = $("preview-context").value;
  $("preview-opponents").disabled = context === "pursuer";
  const setup = { seed, context, level: Number($("preview-level").value), opponents: Number($("preview-opponents").value),
    breath: 4, dog: $("preview-dog").checked, drowsy: context === "camp", knife: $("preview-knife").checked };
  try {
    ui = mountBrawl($("brawl-board"), setup, { language, audio, phase: $("preview-night").checked ? "night" : "day",
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
for (const id of ["preview-context", "preview-opponents", "preview-level", "preview-dog", "preview-knife", "preview-night"]) $(id).addEventListener("change", restart);
restart();
