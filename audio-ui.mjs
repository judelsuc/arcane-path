import { createMusicPlayer, musicTrack } from "./audio.mjs";
import { createFootstepPlayer } from "./footsteps.mjs";
import { createStreetMusicAudio } from "./street-music-audio.mjs";
import { createCafeAudio } from "./cafe-audio.mjs";
import { createTheftAudio } from "./theft-audio.mjs";
import { setFeedback } from "./feedback.mjs";
import { createHarvestAudio } from "./minigames/harvest-audio.mjs";
import { createMarketAudio } from "./minigames/market-audio.mjs";
import { createBookshopAudio } from "./minigames/bookshop-audio.mjs";
import { createPetanqueAudio } from "./minigames/petanque-audio.mjs";
import { createLanternAudio } from "./minigames/lanterns-audio.mjs";

export function setupAudio(t) {
  const toggle = document.querySelector("#audio-toggle");
  const status = document.querySelector("#audio-status");
  const volume = document.querySelector("#audio-volume");
  let context = {}, playback = { status: "off", enabled: false };
  let footstepError = "";
  let streetMusicError = "";
  let cafeError = "";
  let theftError = "";
  let journeyAudioError = "";
  const theft = createTheftAudio({
    createAudio: url => new Audio(url),
    onError(error) { theftError = error; localize(); },
  });
  const cafe = createCafeAudio({
    createAudio: url => new Audio(url),
    onError(error) { cafeError = error; localize(); },
  });
  const busking = createStreetMusicAudio({
    createAudio: url => new Audio(url),
    onError(error) { streetMusicError = error; localize(); },
  });
  const footsteps = createFootstepPlayer({
    createAudio: url => new Audio(url),
    onError(error) { footstepError = error; localize(); },
  });
  const gameAudioOptions = {
    createAudio: url => new Audio(url),
    createContext() {
      const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (!Context) throw new Error("Web Audio is unavailable.");
      return new Context();
    },
    onError(error) {
      journeyAudioError = error;
      if (error) console.warn("Journey game sound unavailable:", error);
      localize();
    },
  };
  const journeyGames = {
    harvest: createHarvestAudio(gameAudioOptions),
    workshop: theft, deliveries: theft,
    market: createMarketAudio(gameAudioOptions),
    bookshop: createBookshopAudio(gameAudioOptions),
    petanque: createPetanqueAudio(gameAudioOptions),
    lanterns: createLanternAudio(gameAudioOptions),
  };
  const gameSounds = [...new Set(Object.values(journeyGames))];
  function localize() {
    toggle.textContent = t(playback.status === "blocked" ? "audioRetry"
      : playback.enabled ? "audioDisable" : "audioEnable");
    toggle.setAttribute("aria-pressed", String(playback.enabled));
    status.textContent = t(`audio.${playback.status}`, {
      track: playback.track ?? "", requested: playback.requested ?? "",
    });
    setFeedback(status, ["blocked", "unavailable"].includes(playback.status) ? "failure"
      : ["playing", "fallback"].includes(playback.status) ? "success" : "");
    document.querySelector("#footstep-status").textContent =
      footstepError ? t("footstepError", { error: footstepError }) : "";
    setFeedback(document.querySelector("#footstep-status"), footstepError ? "failure" : "");
    setFeedback(document.querySelector("#music-audio-status"), streetMusicError ? "failure" : "");
    document.querySelector("#music-audio-status").textContent = streetMusicError
      ? t("streetMusicAudioError", { error: streetMusicError })
      : t(playback.enabled ? "streetMusicAudioOn" : "streetMusicAudioOff");
    const cafeStatus = document.querySelector("#cafe-audio-status");
    cafeStatus.textContent = cafeError ? t("cafeAudioError", { error: cafeError })
      : t(playback.enabled ? "cafeAudioOn" : "cafeAudioOff");
    setFeedback(cafeStatus, cafeError ? "failure" : "");
    document.querySelector("#theft-audio-status").textContent =
      theftError ? t("theftAudioError", { error: theftError }) : "";
    document.querySelector("#journey-audio-status").textContent =
      journeyAudioError ? t("journeyGameAudioError", { error: journeyAudioError }) : "";
  }
  const player = createMusicPlayer({
    createAudio: url => new Audio(url),
    onChange(next) {
      playback = next;
      footsteps.enable(next.enabled && !document.hidden);
      busking.enable(next.enabled);
      cafe.enable(next.enabled && !document.hidden);
      theft.enable(next.enabled && !document.hidden);
      for (const sound of gameSounds) sound.enable(next.enabled && !document.hidden);
      localize();
    },
  });
  function sync() {
    const dialog = document.querySelector("dialog[open]");
    void player.select(musicTrack({ ...context, dialog: dialog?.id,
      sleeping: dialog?.dataset.activity === "sleep" }));
  }
  toggle.addEventListener("click", () => {
    void player.enable(playback.status === "blocked" || !playback.enabled);
  });
  function unlock(event) {
    if (playback.status !== "blocked" || event.target.closest?.("#audio-toggle")) return;
    void player.enable(true);
  }
  document.addEventListener("click", unlock);
  document.addEventListener("keydown", unlock);
  volume.addEventListener("input", () => {
    const value = Number(volume.value) / 100;
    player.volume(value);
    footsteps.volume(value);
    busking.volume(value);
    cafe.volume(value);
    theft.volume(value);
    for (const sound of gameSounds) sound.volume(value);
  });
  document.addEventListener("visibilitychange", () => {
    footsteps.enable(playback.enabled && !document.hidden);
    if (document.hidden) busking.stop();
    if (document.hidden) cafe.stop();
    if (document.hidden) theft.stop();
    for (const sound of gameSounds) sound.enable(playback.enabled && !document.hidden);
    void player.suspend(document.hidden);
  });
  player.suspend(document.hidden);
  new MutationObserver(sync).observe(document.body, {
    subtree: true, attributes: true, attributeFilter: ["open"],
  });
  sync();
  void player.enable(true);
  localize();
  return { localize, busking, cafe, theft, journeyGames, step(terrain) { void footsteps.play(terrain); },
    update(next) { context = next; sync(); } };
}
