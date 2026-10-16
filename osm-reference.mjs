export function osmReferenceUrls(bounds, marker) {
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
  if (marker) {
    if (!Number.isFinite(marker.latitude) || !Number.isFinite(marker.longitude) ||
        marker.latitude < south || marker.latitude > north ||
        marker.longitude < west || marker.longitude > east) {
      throw new Error("Invalid player marker for OSM comparison.");
    }
    embed.searchParams.set("marker", `${marker.latitude},${marker.longitude}`);
    full.searchParams.set("mlat", marker.latitude);
    full.searchParams.set("mlon", marker.longitude);
  }
  return { embed: embed.href, full: full.href };
}
