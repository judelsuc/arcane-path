import { IMAGE_LICENSE } from "./journal-art.mjs";

const ROOT = "/public/legend-art/last-screening/";

async function decode(image, signal) {
  const timeout = AbortSignal.timeout(10000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  combined.throwIfAborted();
  await new Promise((resolve, reject) => {
    const abort = () => { image.src = ""; reject(combined.reason); };
    combined.addEventListener("abort", abort, { once: true });
    image.decode().then(resolve, reject).finally(() => combined.removeEventListener("abort", abort));
  });
}

export async function loadLegendBackgrounds({ fetcher = fetch, createImage = () => new Image(),
  signal, onStatus = () => {} } = {}) {
  const response = await fetcher(`${ROOT}manifest.json`, {
    cache: "no-cache", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Legend background manifest HTTP ${response.status}`);
  const manifest = await response.json();
  if (manifest?.version !== 1 || manifest.adventure !== "last-screening" ||
      manifest.model !== "stable-diffusion-xl-base-v10" || manifest.license !== IMAGE_LICENSE ||
      !Array.isArray(manifest.entries) || manifest.entries.length !== 2 ||
      new Set(manifest.entries.map(entry => entry?.scene)).size !== 2 ||
      manifest.entries.some(entry => !entry || !["passage", "interior"].includes(entry.scene) ||
        !["ready", "pending", "failed", "not-generated"].includes(entry.status) ||
        (entry.status === "ready" && entry.file !== `${entry.scene}.webp`))) {
    throw new Error("Invalid legend background manifest.");
  }
  const images = {};
  const failures = [];
  await Promise.all(manifest.entries.map(async entry => {
    if (entry.status !== "ready") { onStatus(entry.scene, entry.status); return; }
    const image = createImage();
    image.src = ROOT + entry.file;
    try {
      await decode(image, signal);
      if (signal?.aborted) return;
      if (image.naturalWidth !== 1024 || image.naturalHeight !== 1024) throw new Error("Invalid legend background dimensions.");
      images[entry.scene] = image;
      onStatus(entry.scene, "ready");
    } catch (error) {
      if (signal?.aborted) return;
      onStatus(entry.scene, "error");
      failures.push(error);
    }
  }));
  if (signal?.aborted) return { images: {}, failures: [] };
  return { images, failures };
}
