import { cellInfo } from "./cell-info.mjs";
import { distanceMeters } from "./cell-content.mjs";

const PUBLIC_AMENITIES = new Set([
  "cafe", "restaurant", "fast_food", "food_court", "pub", "bar", "marketplace",
  "place_of_worship", "library", "community_centre", "theatre", "cinema",
  "arts_centre", "public_bath", "bus_station", "ferry_terminal",
]);
const PUBLIC_TOURISM = new Set([
  "museum", "gallery", "attraction", "zoo", "theme_park", "hotel", "hostel",
  "guest_house", "camp_site", "viewpoint", "information", "picnic_site",
]);

function publicPlace(poi) {
  const tags = poi.tags;
  if (!poi.name?.trim() || !/^(node|way)\/\d+$/.test(poi.osmId) || !tags ||
      ["no", "private"].includes(tags.access) ||
      (tags.disused && tags.disused !== "no") || (tags.abandoned && tags.abandoned !== "no")) return false;
  if (poi.category === "station" || poi.category === "cable_station") return true;
  if (poi.category === "shop") return tags.shop !== "vacant" && tags.shop !== "no";
  if (poi.category === "amenity") return PUBLIC_AMENITIES.has(tags.amenity);
  if (poi.category === "tourism") return PUBLIC_TOURISM.has(tags.tourism);
  return false;
}

export function settlementView(map, row, col) {
  const cell = map.rows[row]?.[col];
  if (cell?.terrain !== "place" || !cell.settlements?.length) return null;
  const info = cellInfo(map, row, col);
  const settlements = [...cell.settlements].sort((a, b) => a.osmId.localeCompare(b.osmId));
  const settlement = settlements[0];
  const candidates = new Map();
  for (const cells of map.rows) {
    for (const current of cells) {
      if (current.unavailable) continue;
      for (const poi of current.pois ?? []) {
        if (!publicPlace(poi) || !Number.isFinite(poi.latitude) || !Number.isFinite(poi.longitude)) continue;
        const distance = distanceMeters(info, poi.latitude, poi.longitude);
        if (distance > 2000 || candidates.has(poi.osmId)) continue;
        candidates.set(poi.osmId, { ...poi, distance });
      }
    }
  }
  const counts = new Map();
  const places = [...candidates.values()].sort((a, b) => a.distance - b.distance ||
    a.osmId.localeCompare(b.osmId)).filter(poi => {
    const count = counts.get(poi.category) ?? 0;
    counts.set(poi.category, count + 1);
    return count < 5;
  });
  return { ...info, settlement, settlements, places,
    identity: settlements.map(item => item.osmId).join(",") };
}
