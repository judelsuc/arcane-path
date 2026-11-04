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
