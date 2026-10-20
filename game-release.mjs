const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const COMMIT_PATTERN = /^[0-9a-f]{7,40}$/i;

async function fetchJson(fetcher, url, validate, { timeoutMs, optional, logger }) {
  const controller = new AbortController();
  let timer;
  let phase = "network";
  const failure = (code, status) => {
    const error = { code, ...(status === undefined ? {} : { status }) };
    if (!(optional && code === "missing")) {
      logger.error("Game release metadata unavailable", { url, ...error });
    }
    return { data: null, error };
  };
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error("Release metadata timeout"));
      }, timeoutMs);
    });
    return await Promise.race([timeout, (async () => {
      const response = await fetcher(url, { cache: "no-store", signal: controller.signal });
      if (!response?.ok) {
        return failure(response?.status === 404 ? "missing" : "http", response?.status);
      }
      phase = "parse";
      const data = await response.json();
      if (!validate(data)) return failure("malformed");
      return { data, error: null };
    })()]);
  } catch {
    return failure(controller.signal.aborted ? "timeout" : phase);
  } finally {
    clearTimeout(timer);
  }
}

function validChangelog(value) {
  return Boolean(value && typeof value === "object" &&
    typeof value.version === "string" && VERSION_PATTERN.test(value.version) &&
    Array.isArray(value.entries) && value.entries.length > 0 &&
    value.entries.some(entry => entry?.version === value.version) &&
    value.entries.every(entry =>
      entry && typeof entry.version === "string" && VERSION_PATTERN.test(entry.version) &&
      ["fr", "en"].every(language => typeof entry[language] === "string" &&
        entry[language].trim().length > 0)));
}

function validDeployment(value) {
  return Boolean(value && value.version === 1 &&
    typeof value.commit === "string" && COMMIT_PATTERN.test(value.commit) &&
    typeof value.packagedAt === "string" && Number.isFinite(Date.parse(value.packagedAt)));
}

export async function loadGameRelease({
  fetcher = globalThis.fetch?.bind(globalThis),
  changelogUrl = "./public/changelog.json",
  releaseUrl = "./public/release.json",
  timeoutMs = 15_000,
  logger = console,
} = {}) {
  const [changelog, deployment] = await Promise.all([
    fetchJson(fetcher, changelogUrl, validChangelog, { timeoutMs, logger }),
    fetchJson(fetcher, releaseUrl, validDeployment, { timeoutMs, logger, optional: true }),
  ]);
  return {
    version: changelog.data?.version ?? null,
    entries: changelog.data?.entries ?? [],
    deployment: deployment.data,
    errors: { changelog: changelog.error, deployment: deployment.error },
  };
}
