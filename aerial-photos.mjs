export async function aerialPhoto(info, fetcher = fetch) {
  const { west, south, east, north } = info.bounds;
  if (![west, south, east, north].every(Number.isFinite) ||
      west >= east || south >= north) throw new Error("Invalid aerial photo bounds.");
  if (south < 41.3 || north > 51.2 || west < -5.2 || east > 9.7) return null;
  let countries = info.countryCodes;
  if (!countries?.length) {
    const query = new URLSearchParams({ latitude: info.latitude, longitude: info.longitude });
    const response = await fetcher(`/api/pricing-country?${query}`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Aerial coverage lookup: HTTP ${response.status}`);
    const result = await response.json();
    if (!/^[A-Z]{2}$/.test(result.countryCode)) throw new Error("Invalid aerial coverage country.");
    countries = [result.countryCode];
  }
  if (countries.length !== 1 || countries[0] !== "FR") return null;
  const url = new URL("https://data.geopf.fr/wms-r");
  url.search = new URLSearchParams({
    SERVICE: "WMS", VERSION: "1.3.0", REQUEST: "GetMap",
    LAYERS: "ORTHOIMAGERY.ORTHOPHOTOS", STYLES: "", CRS: "EPSG:4326",
    BBOX: `${south},${west},${north},${east}`,
    WIDTH: "512", HEIGHT: "512", FORMAT: "image/jpeg",
  });
  return {
    title: "IGN · Orthophotographie", url: url.href, sourceUrl: url.href,
    attribution: "IGN · Géoplateforme", license: "Licence Ouverte 2.0",
    licenseUrl: "https://www.etalab.gouv.fr/licence-ouverte-open-licence/",
    nearby: false, distance: 0, aerial: true, provider: "IGN",
    coordinates: { latitude: info.latitude, longitude: info.longitude },
    association: "aerial",
  };
}
