import { distanceMeters } from "./cell-content.mjs";
import { NEARBY_VENUE_METERS } from "./minigames/venues.mjs";

export function withNearbyMappedPois(cell, info, chunks) {
  const pois = new Map();
  for (const chunk of chunks.values()) {
    for (const row of chunk.rows) for (const candidate of row) {
      if (candidate.unavailable) continue;
      for (const poi of candidate.pois ?? []) {
        if (!poi.osmId || !Number.isFinite(poi.latitude) || !Number.isFinite(poi.longitude)) continue;
        const distance = distanceMeters(info, poi.latitude, poi.longitude);
        if (Number.isFinite(distance) && distance >= 0 && distance <= NEARBY_VENUE_METERS && !pois.has(poi.osmId))
          pois.set(poi.osmId, { ...poi, distance });
      }
    }
  }
  return { ...cell, nearby: { ...cell.nearby, pois: [...pois.values()] } };
}
