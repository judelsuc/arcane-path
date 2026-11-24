import { loadGameRelease } from "./game-release.mjs";

function formatDeployment(deployment, language, t) {
  if (!deployment) return t("releaseLocal");
  const date = new Intl.DateTimeFormat(language, { dateStyle: "medium", timeZone: "UTC" })
    .format(new Date(deployment.packagedAt));
  return t("releaseDeployment", { commit: deployment.commit.slice(0, 12), date });
}

export function setupGameRelease({
  versionElement,
  deploymentElement,
  entriesElement,
  statusElement,
  t,
  language,
  fetcher,
  logger,
  timeoutMs,
} = {}) {
  let currentLanguage = language;
  let release;

  function localize(nextLanguage = currentLanguage) {
    currentLanguage = nextLanguage;
    if (!release) {
      versionElement.textContent = t("releaseLoading");
      statusElement.textContent = "";
      return;
    }
    versionElement.textContent = release.version
      ? t("releaseVersion", { version: release.version })
      : t("releaseVersionUnavailable");
    deploymentElement.textContent = formatDeployment(release.deployment, currentLanguage, t);
    const errors = Object.entries(release.errors).filter(([, error]) => error);
    statusElement.textContent = errors.length ? errors.map(([file, error]) => {
      const detail = t(`releaseError.${error.code}`, { status: error.status ?? "?" });
      return t("releaseFileError", { file: t(`releaseFile.${file}`), detail });
    }).join(" ") : release.version
      ? (release.deployment ? t("releaseAvailable") : t("releaseLocalStatus"))
      : t("releaseUnavailable");

    entriesElement.replaceChildren();
    for (const entry of release.entries) {
      const item = entriesElement.ownerDocument.createElement("li");
      item.lang = currentLanguage;
      item.textContent = `${t("releaseVersion", { version: entry.version })} — ${entry[currentLanguage]}`;
      entriesElement.append(item);
    }
  }

  const loaded = loadGameRelease({ fetcher, logger, timeoutMs }).then(result => {
    release = result;
    localize();
    return result;
  });

  return { localize, loaded };
}

const UPDATE_WORDS = {
  fr: { text: "Une nouvelle version du jeu est en ligne. Rechargez la page pour en profiter : votre partie est sauvegardée.",
    reload: "Recharger", later: "Plus tard" },
  en: { text: "A new version of the game is online. Reload the page to get it: your journey is saved.",
    reload: "Reload", later: "Later" },
};

// A page left open keeps running the code it loaded: compare the deployed commit
// every few minutes and when the tab comes back, and offer (never force) a reload.
export function watchGameUpdates({ loaded, doc = globalThis.document, fetcher = globalThis.fetch?.bind(globalThis),
  intervalMs = 5 * 60_000, logger = console, reload = () => doc.defaultView.location.reload() } = {}) {
  let initial, banner, timer, checking = false;
  async function check() {
    if (checking || banner || !initial) return;
    checking = true;
    try {
      const latest = (await loadGameRelease({ fetcher, logger, timeoutMs: 10_000 })).deployment?.commit;
      if (latest && latest !== initial) show();
    } catch (error) {
      logger.warn?.("Release check failed:", error);
    } finally {
      checking = false;
    }
  }
  function show() {
    const words = UPDATE_WORDS[doc.documentElement.lang === "en" ? "en" : "fr"];
    banner = doc.createElement("div");
    banner.className = "release-update";
    banner.setAttribute("role", "status");
    const text = doc.createElement("span"); text.textContent = words.text;
    const now = doc.createElement("button"); now.type = "button"; now.textContent = words.reload;
    now.addEventListener("click", () => reload());
    const later = doc.createElement("button"); later.type = "button"; later.textContent = words.later;
    later.addEventListener("click", () => { banner.hidden = true; });
    banner.append(text, now, later);
    doc.body.append(banner);
  }
  const visible = () => { if (doc.visibilityState === "visible") void check(); };
  void Promise.resolve(loaded).then(result => {
    initial = result?.deployment?.commit ?? null;
    if (!initial) return;
    timer = doc.defaultView?.setInterval(() => void check(), intervalMs);
    doc.addEventListener("visibilitychange", visible);
  });
  return { check, stop() { doc.defaultView?.clearInterval(timer); doc.removeEventListener("visibilitychange", visible); } };
}
