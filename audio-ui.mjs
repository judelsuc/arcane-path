import { createMusicPlayer, musicTrack } from "./audio.mjs";
import { createFootstepPlayer } from "./footsteps.mjs";

export function setupAudio(t) {
  const toggle = document.querySelector("#audio-toggle");
  const status = document.querySelector("#audio-status");
  const volume = document.querySelector("#audio-volume");
  let context = {}, playback = { status: "off", enabled: false };
  let footstepError = "";
  const footsteps = createFootstepPlayer({
    createAudio: url => new Audio(url),
    onError(error) { footstepError = error; localize(); },
  });
  function localize() {
    toggle.textContent = t(playback.status === "blocked" ? "audioRetry"
      : playback.enabled ? "audioDisable" : "audioEnable");
    toggle.setAttribute("aria-pressed", String(playback.enabled));
    status.textContent = t(`audio.${playback.status}`, {
      track: playback.track ?? "", requested: playback.requested ?? "",
    });
    document.querySelector("#footstep-status").textContent =
      footstepError ? t("footstepError", { error: footstepError }) : "";
  }
  const player = createMusicPlayer({
    createAudio: url => new Audio(url),
    onChange(next) {
      playback = next;
      footsteps.enable(next.enabled && !document.hidden);
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
  });
  document.addEventListener("visibilitychange", () => {
    footsteps.enable(playback.enabled && !document.hidden);
    void player.suspend(document.hidden);
  });
  player.suspend(document.hidden);
  new MutationObserver(sync).observe(document.body, {
    subtree: true, attributes: true, attributeFilter: ["open"],
  });
  sync();
  void player.enable(true);
  localize();
  return { localize, step(terrain) { void footsteps.play(terrain); },
    update(next) { context = next; sync(); } };
}
