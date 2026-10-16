export function osmReferenceUrls(bounds) {
  const { minLongitude: west, minLatitude: south, maxLongitude: east, maxLatitude: north } = bounds;
  if (
    ![west, south, east, north].every(Number.isFinite) ||
    !(-180 <= west && west < east && east <= 180) ||
    !(-90 <= south && south < north && north <= 90)
  ) {
    throw new Error("Invalid geographic bounds for OSM comparison.");
  }

  const bbox = [west, south, east, north].join(",");
  const embed = new URL("https://www.openstreetmap.org/export/embed.html");
  embed.searchParams.set("bbox", bbox);
  embed.searchParams.set("layer", "mapnik");
  const full = new URL("https://www.openstreetmap.org/");
  full.searchParams.set("bbox", bbox);
  return { embed: embed.href, full: full.href };
}
