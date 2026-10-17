import { createMusicPlayer, musicTrack } from "./audio.mjs";

export function setupAudio(t) {
  const toggle = document.querySelector("#audio-toggle");
  const status = document.querySelector("#audio-status");
  const volume = document.querySelector("#audio-volume");
  let context = {}, playback = { status: "off", enabled: false };
  function localize() {
    toggle.textContent = t(playback.status === "blocked" ? "audioRetry"
      : playback.enabled ? "audioDisable" : "audioEnable");
    toggle.setAttribute("aria-pressed", String(playback.enabled));
    status.textContent = t(`audio.${playback.status}`, {
      track: playback.track ?? "", requested: playback.requested ?? "",
    });
  }
  const player = createMusicPlayer({
    createAudio: url => new Audio(url),
    onChange(next) { playback = next; localize(); },
  });
  function sync() {
    const dialog = document.querySelector("dialog[open]");
    void player.select(musicTrack({ ...context, dialog: dialog?.id,
      sleeping: dialog?.dataset.activity === "sleep" }));
  }
  toggle.addEventListener("click", () => {
    void player.enable(playback.status === "blocked" || !playback.enabled);
  });
  volume.addEventListener("input", () => player.volume(Number(volume.value) / 100));
  document.addEventListener("visibilitychange", () => { void player.suspend(document.hidden); });
  player.suspend(document.hidden);
  new MutationObserver(sync).observe(document.body, {
    subtree: true, attributes: true, attributeFilter: ["open"],
  });
  sync();
  localize();
  return { localize, update(next) { context = next; sync(); } };
}
