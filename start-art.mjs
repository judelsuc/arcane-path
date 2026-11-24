export function setupStartArt(t, { doc = document, fetcher = fetch, logger = console } = {}) {
  const figure = doc.querySelector("#title-daily-art");
  const image = doc.querySelector("#title-daily-image");
  const fallback = doc.querySelector(".title-art");
  const status = doc.querySelector("#title-art-status");
  let state = null, day = "", loading = false, refreshFailed = false;

  function localize() {
    image.alt = t("titleDailyArtAlt");
    doc.querySelector("#title-art-credit").textContent = t("titleDailyArtCredit", { day });
    status.textContent = state ? t(state) : "";
    status.hidden = !state;
  }

  image.addEventListener("load", () => {
    figure.hidden = false;
    fallback.hidden = true;
    state = refreshFailed ? "titleDailyArtRefreshFailed" : null;
    localize();
  });
  image.addEventListener("error", () => {
    logger.error("Daily start-page illustration could not be loaded.");
    figure.hidden = true;
    fallback.hidden = false;
    state = "titleDailyArtUnavailable";
    localize();
  });

  async function load() {
    if (loading) return;
    loading = true;
    try {
      const response = await fetcher("/api/start-art", { cache: "no-store" });
      if (!response.ok) throw new Error(`Daily start-page illustration: HTTP ${response.status}`);
      const result = await response.json();
      if (result.version !== 1 || !Object.hasOwn(result, "image")) {
        throw new Error("Invalid daily start-page illustration status.");
      }
      refreshFailed = ["failed", "running"].includes(result.lastAttempt?.status);
      if (result.image === null) {
        state = refreshFailed ? "titleDailyArtRefreshFailed" : "titleDailyArtNotReady";
        localize();
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(result.image.day)) {
        throw new Error("Invalid daily start-page illustration date.");
      }
      day = result.image.day;
      const source = `/api/start-art/image?day=${encodeURIComponent(day)}`;
      if (image.getAttribute("src") !== source) image.src = source;
      else if (!figure.hidden) {
        state = refreshFailed ? "titleDailyArtRefreshFailed" : null;
      }
      localize();
    } catch (error) {
      logger.error("Daily start-page illustration unavailable:", error);
      state = "titleDailyArtUnavailable";
      localize();
    } finally {
      loading = false;
    }
  }
  return { load, localize };
}
