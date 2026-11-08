export const NEARBY_VENUE_METERS = 2000;

export function mappedGameVenues(cell) {
  if (!cell || cell.unavailable) return [];
  const local = Array.isArray(cell.pois) ? cell.pois : [];
  const nearby = Array.isArray(cell.nearby?.pois) ? cell.nearby.pois.filter(poi =>
    Number.isFinite(poi?.distance) && poi.distance >= 0 && poi.distance <= NEARBY_VENUE_METERS) : [];
  return [...local, ...nearby];
}
