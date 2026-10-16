const IMAGE_HOSTS = new Set([
  "inaturalist-open-data.s3.amazonaws.com", "static.inaturalist.org",
  "images.naturalis.nl", "observation.org",
]);

function imageUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password &&
      IMAGE_HOSTS.has(url.hostname) ? url.href : null;
  } catch {
    return null;
  }
}

function license(value) {
  const codes = {
    cc0: ["CC0 1.0", "https://creativecommons.org/publicdomain/zero/1.0/"],
    "cc-by": ["CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/"],
    "cc-by-sa": ["CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/"],
  };
  if (codes[value]) return codes[value];
  const match = /^https?:\/\/creativecommons\.org\/(licenses\/(by|by-sa)\/(1\.0|2\.0|2\.5|3\.0|4\.0)|publicdomain\/zero\/1\.0)\/?$/.exec(value ?? "");
  if (!match) return null;
  return [match[2] ? `CC ${match[2].toUpperCase()} ${match[3]}` : "CC0 1.0",
    value.replace(/^http:/, "https:")];
}

async function query(endpoint, parameters, fetcher) {
  const url = new URL(endpoint);
  url.search = new URLSearchParams(parameters);
  const response = await fetcher(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`${url.hostname}: HTTP ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data.results)) throw new Error(`${url.hostname}: Invalid photo results.`);
  return data.results;
}

export async function naturePhotos(provider, info, { fetcher, insideCell, distanceMeters }) {
  const candidates = [];
  function add(photo, latitude, longitude, accuracy) {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 || Math.abs(longitude) > 180 ||
        !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 250 ||
        distanceMeters(info, latitude, longitude) > 2000) return;
    const rights = license(photo.license);
    const url = imageUrl(photo.url);
    if (!rights || !url || typeof photo.author !== "string" || !photo.author.trim()) return;
    const id = /\/photos\/(\d+)\//.exec(url)?.[1];
    candidates.push({
      title: photo.title, url, sourceUrl: photo.sourceUrl,
      dedupKey: id ? `inaturalist:${id}` : url,
      attribution: photo.author, license: rights[0], licenseUrl: rights[1],
      nearby: !insideCell(info, latitude, longitude), distance: distanceMeters(info, latitude, longitude),
      coordinates: { latitude, longitude }, association: "coordinates",
      nature: true, provider, observationUrl: photo.observationUrl,
    });
  }
  if (provider === "iNaturalist") {
    const rows = await query("https://api.inaturalist.org/v1/observations", {
      lat: info.latitude, lng: info.longitude, radius: "2", photos: "true",
      photo_license: "cc0,cc-by,cc-by-sa", per_page: "20",
      order_by: "observed_on", geoprivacy: "open",
    }, fetcher);
    for (const row of rows) {
      if (row.obscured || row.geoprivacy || row.taxon_geoprivacy ||
          row.geojson?.type !== "Point" || !Number.isSafeInteger(row.id)) continue;
      const [longitude, latitude] = row.geojson.coordinates ?? [];
      for (const photo of row.photos ?? []) {
        if (!Number.isSafeInteger(photo.id)) continue;
        add({
          title: row.taxon?.preferred_common_name ?? row.taxon?.name ?? "iNaturalist",
          url: photo.url?.replace(/\/square\.(jpg|jpeg|png)$/i, "/medium.$1"),
          sourceUrl: `https://www.inaturalist.org/photos/${photo.id}`,
          observationUrl: `https://www.inaturalist.org/observations/${row.id}`,
          author: photo.attribution, license: photo.license_code,
        }, latitude, longitude, row.public_positional_accuracy);
      }
    }
  } else if (provider === "GBIF") {
    const latRadius = 2000 / 111_000;
    const lonRadius = Math.min(180, latRadius / Math.max(0.001, Math.cos(info.latitude * Math.PI / 180)));
    const rows = await query("https://api.gbif.org/v1/occurrence/search", {
      decimalLatitude: `${Math.max(-90, info.latitude - latRadius)},${Math.min(90, info.latitude + latRadius)}`,
      decimalLongitude: `${Math.max(-180, info.longitude - lonRadius)},${Math.min(180, info.longitude + lonRadius)}`,
      mediaType: "StillImage", limit: "20", hasGeospatialIssue: "false",
    }, fetcher);
    for (const row of rows) {
      if (!Number.isSafeInteger(row.key) || row.informationWithheld || row.dataGeneralizations) continue;
      for (const media of row.media ?? []) {
        if (media.type !== "StillImage") continue;
        add({
          title: row.vernacularName ?? row.species ?? row.scientificName ?? "GBIF",
          url: media.identifier, sourceUrl: `https://www.gbif.org/occurrence/${row.key}`,
          author: media.creator ?? media.rightsHolder, license: media.license,
        }, row.decimalLatitude, row.decimalLongitude, row.coordinateUncertaintyInMeters);
      }
    }
  } else {
    throw new Error(`Unknown nature photo provider: ${provider}`);
  }
  return candidates.sort((a, b) => Number(a.nearby) - Number(b.nearby) || a.distance - b.distance);
}
