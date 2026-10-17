import { naturePhotos } from "./nature-photos.mjs";

const COMMONS = "https://commons.wikimedia.org/w/api.php";
const OSM_LICENSE = "https://opendatacommons.org/licenses/odbl/1-0/";
const WIKI_LICENSE = "https://creativecommons.org/licenses/by-sa/4.0/";
export const MAX_CELL_PHOTOS = 5;
const PHOTO_LIMIT = 20;

export function insideCell(info, latitude, longitude) {
  const b = info.bounds;
  return latitude >= b.south && latitude <= b.north && longitude >= b.west && longitude <= b.east;
}

export function distanceMeters(info, latitude, longitude) {
  const radians = Math.PI / 180;
  const a = Math.sin((latitude - info.latitude) * radians / 2) ** 2 +
    Math.cos(info.latitude * radians) * Math.cos(latitude * radians) *
    Math.sin((longitude - info.longitude) * radians / 2) ** 2;
  return Math.round(6_371_008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, a))));
}

function plain(text = "") {
  return text.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

function commonsTitle(value) {
  if (!value) return null;
  if (value.startsWith("File:")) return value;
  if (!value.startsWith("https://commons.wikimedia.org/wiki/File:")) return null;
  const url = new URL(value);
  return decodeURIComponent(url.pathname.slice("/wiki/".length));
}

export async function contentKey(info, locale, kind) {
  const identity = JSON.stringify([info.bounds, info.meters, info.contentSources]);
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity));
  return `${kind === "photo" ? "v3" : "v1"}:${kind}:${locale}:${Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("")}`;
}

export function createContentService({ cache, fetcher = fetch, maxPhotos = MAX_CELL_PHOTOS }) {
  if (!Number.isInteger(maxPhotos) || maxPhotos < 1 || maxPhotos > PHOTO_LIMIT) {
    throw new Error(`Photo limit must be between 1 and ${PHOTO_LIMIT}.`);
  }
  async function json(endpoint, parameters) {
    const url = new URL(endpoint);
    url.search = new URLSearchParams({ action: "query", format: "json", origin: "*", ...parameters });
    const response = await fetcher(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`${url.hostname}: HTTP ${response.status}`);
    const result = await response.json();
    if (result.error) throw new Error(`${url.hostname}: ${result.error.info}`);
    return Object.values(result.query?.pages ?? {});
  }

  async function wikipedia(info, locale) {
    const pages = await json(`https://${locale}.wikipedia.org/w/api.php`, {
      generator: "geosearch", ggscoord: `${info.latitude}|${info.longitude}`,
      ggsradius: "2000", ggslimit: "10", ggsnamespace: "0",
      prop: "extracts|coordinates|pageimages|info", exintro: "1", explaintext: "1",
      exsentences: "2", exlimit: "max", piprop: "name", inprop: "url", colimit: "max",
    });
    return pages.filter(p => p.coordinates?.length &&
      Number.isFinite(p.coordinates[0].lat) && Number.isFinite(p.coordinates[0].lon) &&
      distanceMeters(info, p.coordinates[0].lat, p.coordinates[0].lon) <= 2000).sort((a, b) => {
      const ca = a.coordinates[0], cb = b.coordinates[0];
      const insideA = insideCell(info, ca.lat, ca.lon), insideB = insideCell(info, cb.lat, cb.lon);
      return Number(insideB) - Number(insideA) ||
        distanceMeters(info, ca.lat, ca.lon) - distanceMeters(info, cb.lat, cb.lon);
    });
  }

  function photoMetadata(page, info, association = null) {
    const image = page.imageinfo?.[0], metadata = image?.extmetadata;
    if (!image || !metadata || !image.thumburl || !image.descriptionurl) return null;
    const author = plain(metadata.Artist?.value), license = plain(metadata.LicenseShortName?.value);
    const licenseUrl = metadata.LicenseUrl?.value;
    if (!author || !license || !/^https?:\/\//.test(licenseUrl ?? "")) return null;
    if (!/^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(image.thumburl) ||
        !/^https:\/\/commons\.wikimedia\.org\//.test(image.descriptionurl)) return null;
    const coords = page.coordinates?.[0];
    if (!association && !coords) return null;
    if (coords && (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lon))) return null;
    return {
      title: page.title, url: image.thumburl, sourceUrl: image.descriptionurl,
      attribution: author, license, licenseUrl,
      nearby: coords ? !insideCell(info, coords.lat, coords.lon) : false,
      distance: coords ? distanceMeters(info, coords.lat, coords.lon) : null,
      association: association ?? "coordinates",
      coordinates: coords ? { latitude: coords.lat, longitude: coords.lon } : null,
    };
  }

  async function commonsTitles(titles, info, association = null) {
    if (!titles.length) return [];
    const pages = await json(COMMONS, {
      titles: titles.slice(0, 20).join("|"), prop: "imageinfo|coordinates",
      iiprop: "url|extmetadata", iiurlwidth: "1000", colimit: "max",
    });
    return pages.map(page => photoMetadata(page, info, association)).filter(Boolean);
  }

  async function resolve(info, locale, kind, refresh = false, onProgress = () => {}) {
    const key = `${await contentKey(info, locale, kind)}${kind === "photo" ? `:${maxPhotos}` : ""}`;
    const cached = await cache.get(key);
    if (cached && !refresh) return { ...cached, cached: true };
    const previous = kind === "photo" && !refresh
      ? await cache.get(key.replace(/^v3:/, "v2:")) : undefined;
    const legacy = kind === "photo" && !refresh
      ? await cache.get(key.replace(/^v3:/, "v1:").replace(/:\d+$/, "")) : undefined;
    const savedPhotos = previous?.photos ?? (legacy?.content ? [legacy.content] : []);
    const errors = [];
    async function attempt(source, work) {
      try { return await work(); }
      catch (error) {
        console.error(`Cell content source failed (${source}):`, error);
        errors.push(`${source}: ${error.message}`);
        return null;
      }
    }
    let content;
    const photos = [];
    const sources = info.contentSources;
    if (kind === "description") {
      const source = sources.find(s => s.tags[`description:${locale}`]?.trim()) ??
        sources.find(s => s.tags.description?.trim());
      if (source) {
        content = {
          text: (source.tags[`description:${locale}`]?.trim() || source.tags.description.trim()).slice(0, 600),
          title: source.tags.name ?? source.osmId,
          sourceUrl: `https://www.openstreetmap.org/${source.osmId}`,
          attribution: "OpenStreetMap contributors", license: "ODbL 1.0",
          licenseUrl: OSM_LICENSE, nearby: false, distance: null,
          language: source.tags[`description:${locale}`] ? locale : "unspecified",
        };
      } else {
        const pages = await attempt("Wikipedia", () => wikipedia(info, locale));
        const page = pages?.find(p => p.extract?.trim());
        if (page) {
          const coords = page.coordinates[0];
          content = {
            text: page.extract.slice(0, 600), title: page.title,
            sourceUrl: page.fullurl, attribution: `Wikipedia (${locale}) contributors`,
            license: "CC BY-SA 4.0", licenseUrl: WIKI_LICENSE, language: locale,
            nearby: !insideCell(info, coords.lat, coords.lon),
            distance: distanceMeters(info, coords.lat, coords.lon),
          };
        }
      }
    } else if (kind === "photo") {
      const tried = new Set();
      async function download(candidates) {
        for (const candidate of candidates ?? []) {
          if (photos.length >= maxPhotos) break;
          const identity = candidate.dedupKey ?? candidate.sourceUrl;
          if (tried.has(identity)) continue;
          tried.add(identity);
          const blob = savedPhotos.find(photo => photo.sourceUrl === candidate.sourceUrl)?.blob ??
            await attempt("Photo download", async () => {
            const response = await fetcher(candidate.url, { signal: AbortSignal.timeout(20000) });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const bytes = await response.blob();
            if (!bytes.type.startsWith("image/") || !bytes.size || bytes.size > 12_000_000) {
              throw new Error("Invalid or oversized image (maximum 12 MB).");
            }
            return bytes;
          });
          if (blob) {
            photos.push({ ...candidate, blob });
            onProgress({
              photos: [...photos], content: photos[0], errors: [...errors],
              loading: true, retrievedAt: new Date().toISOString(), cached: false,
            });
          }
        }
      }
      const titles = sources.flatMap(s => [s.tags.wikimedia_commons, s.tags.image])
        .map(commonsTitle).filter(Boolean);
      let candidates = await attempt("OSM → Commons", () => commonsTitles(titles, info, "osm"));
      await download(candidates?.filter(p => !p.nearby));
      const nearby = candidates?.filter(p => p.nearby) ?? [];
      if (photos.length < maxPhotos) {
        candidates = await attempt("Commons geosearch", async () => {
          const pages = await json(COMMONS, {
            generator: "geosearch", ggscoord: `${info.latitude}|${info.longitude}`,
            ggsradius: "2000", ggsnamespace: "6", ggslimit: "20",
            prop: "imageinfo|coordinates", iiprop: "url|extmetadata",
            iiurlwidth: "1000", colimit: "max",
          });
          return pages.map(p => photoMetadata(p, info)).filter(Boolean)
            .sort((a, b) => a.distance - b.distance);
        });
        await download(candidates?.filter(p => !p.nearby));
        nearby.push(...(candidates?.filter(p => p.nearby) ?? []));
      }
      if (photos.length < maxPhotos) {
        const pages = await attempt("Wikipedia image", () => wikipedia(info, locale));
        const local = pages?.filter(p => insideCell(info, p.coordinates[0].lat, p.coordinates[0].lon));
        const images = await attempt("Wikipedia → Commons", () =>
          commonsTitles((local ?? []).filter(p => p.pageimage).map(p => `File:${p.pageimage}`), info, "wikipedia"));
        for (const image of images ?? []) {
          const article = local.find(p => `File:${p.pageimage}` === image.title);
          if (article) {
            image.associationUrl = article.fullurl;
            if (!image.coordinates) {
              const { lat, lon } = article.coordinates[0];
              image.coordinates = { latitude: lat, longitude: lon };
              image.distance = distanceMeters(info, lat, lon);
            }
          }
        }
        await download(images?.filter(p => !p.nearby));
      }
      await download(nearby.filter(p => p.distance <= 2000));
      for (const provider of ["iNaturalist", "GBIF"]) {
        if (photos.length >= maxPhotos) break;
        const nature = await attempt(provider, () => naturePhotos(provider, info, {
          fetcher, insideCell, distanceMeters,
        }));
        await download(nature);
      }
      if (!photos.length) {
        photos.push(...savedPhotos.filter(photo => photo.blob).slice(0, maxPhotos));
      }
      content = photos[0];
    } else {
      throw new Error(`Unknown content kind: ${kind}`);
    }
    const result = {
      version: kind === "photo" ? 3 : 1,
      ...(kind === "photo" ? { photos, maxPhotos } : {}),
      bounds: info.bounds, cellSizeMeters: info.meters, language: locale,
      content: content ?? null, errors, retrievedAt: new Date().toISOString(),
    };
    // Do not persist an outage as a definitive absence of geographic content.
    if (content || !errors.length) await cache.put(key, result);
    return { ...result, cached: false };
  }
  return { resolve };
}
