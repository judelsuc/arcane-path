export const translations = {
  fr: {
    pageTitle: "Les Arcanes du Chemin — Carte",
    description: "Prototype de cartographie ASCII pour Les Arcanes du Chemin.",
    prototype: "Les Arcanes du Chemin · Prototype 01",
    headline: "La route commence quelque part.",
    intro: "Une carte, un enfant, et toute l'Europe devant soi.",
    layer: "Couche 01 · Cartographie",
    loading: "Chargement de la région...",
    loadErrorTitle: "Carte indisponible",
    mapLabel: "Carte fixe de la région",
    asciiTitle: "Grille ASCII",
    cellHint: "Survolez, touchez ou sélectionnez une case au clavier pour l'inspecter.",
    cellDetails: "{terrain} · Ligne {row}, colonne {col} · Centre : {latitude}, {longitude} · {meters} m par case",
    cellPois: "Points d'intérêt : {points}",
    "poi.amenity": "Service",
    "poi.shop": "Commerce",
    "poi.tourism": "Tourisme",
    "poi.historic": "Patrimoine",
    "poi.station": "Gare",
    "poi.cable_station": "Station de téléphérique",
    "poi.summit": "Sommet",
    referenceTitle: "Carte OpenStreetMap",
    referenceFrame: "Carte OpenStreetMap de comparaison : {name}",
    referenceNote: "Vue en ligne de comparaison. Les extraits sont préparés automatiquement pour une vue de 518 × 360 pixels ; déplacer, zoomer ou redimensionner cette vue ne télécharge pas de nouvelles données.",
    referenceLink: "Ouvrir sur OpenStreetMap (ou si la vue ne se charge pas)",
    legendTitle: "Signes de la carte",
    status: "Carte fixe — le déplacement arrive à la couche 02.",
    language: "Langue",
    region: "Région",
    "region.alps": "Alpes (Chamonix)",
    attribution: "© les contributeurs OpenStreetMap",
    scale: "{meters} m par case",
    size: "{width} × {height} cases",
    source: "Source : {source}",
    demoSource: "Source : {source} · maquette illustrative",
    demoRegion: "{name} (maquette)",
    loadError: "Impossible de charger la carte. Vérifiez le fichier public/map.json et rechargez la page.",
    "terrain.plain": "Terrain non cartographié",
    "terrain.water": "Eau",
    "terrain.road": "Route",
    "terrain.major_road": "Route principale",
    "terrain.rail": "Voie ferrée",
    "terrain.cable": "Téléphérique",
    "terrain.cable_station": "Station de téléphérique",
    "terrain.mountain": "Montagne",
    "terrain.hill": "Colline",
    "terrain.building": "Bâtiment",
    "terrain.forest": "Forêt",
    "terrain.grass": "Prairie",
    "terrain.field": "Champ",
    "terrain.vineyard": "Vigne",
    "terrain.park": "Parc",
    "terrain.church": "Lieu de culte",
    "terrain.station": "Gare",
    "terrain.place": "Localité",
  },
  en: {
    pageTitle: "Les Arcanes du Chemin — Map",
    description: "ASCII mapping prototype for Les Arcanes du Chemin.",
    prototype: "Les Arcanes du Chemin · Prototype 01",
    headline: "The road begins somewhere.",
    intro: "A map, a child, and all of Europe ahead.",
    layer: "Layer 01 · Cartography",
    loading: "Loading the region...",
    loadErrorTitle: "Map unavailable",
    mapLabel: "Fixed map of the region",
    asciiTitle: "ASCII grid",
    cellHint: "Hover, tap, or focus a cell with the keyboard to inspect it.",
    cellDetails: "{terrain} · Row {row}, column {col} · Center: {latitude}, {longitude} · {meters} m per cell",
    cellPois: "Points of interest: {points}",
    "poi.amenity": "Service",
    "poi.shop": "Shop",
    "poi.tourism": "Tourism",
    "poi.historic": "Heritage",
    "poi.station": "Station",
    "poi.cable_station": "Cable-car station",
    "poi.summit": "Summit",
    referenceTitle: "OpenStreetMap reference",
    referenceFrame: "OpenStreetMap comparison map: {name}",
    referenceNote: "Online reference view. Extracts are prepared automatically for a 518 × 360 pixel viewport; panning, zooming, or resizing this view does not download new data.",
    referenceLink: "Open in OpenStreetMap (or if the embedded view fails to load)",
    legendTitle: "Map symbols",
    status: "Fixed map — movement arrives in layer 02.",
    language: "Language",
    region: "Region",
    "region.alps": "Alps (Chamonix)",
    attribution: "© OpenStreetMap contributors",
    scale: "{meters} m per cell",
    size: "{width} × {height} cells",
    source: "Source: {source}",
    demoSource: "Source: {source} · illustrative demo",
    demoRegion: "{name} (demo)",
    loadError: "Unable to load the map. Check public/map.json and reload the page.",
    "terrain.plain": "Unmapped terrain",
    "terrain.water": "Water",
    "terrain.road": "Road",
    "terrain.major_road": "Main road",
    "terrain.rail": "Railway",
    "terrain.cable": "Cable car",
    "terrain.cable_station": "Cable-car station",
    "terrain.mountain": "Mountain",
    "terrain.hill": "Hill",
    "terrain.building": "Building",
    "terrain.forest": "Forest",
    "terrain.grass": "Meadow",
    "terrain.field": "Field",
    "terrain.vineyard": "Vineyard",
    "terrain.park": "Park",
    "terrain.church": "Place of worship",
    "terrain.station": "Station",
    "terrain.place": "Settlement",
  },
};

export function resolveLocale(preferences) {
  for (const preference of preferences) {
    const language = preference.toLowerCase().split("-")[0];
    if (Object.hasOwn(translations, language)) {
      return language;
    }
  }
  return "fr";
}

export function translate(locale, key, parameters = {}) {
  const catalog = translations[locale];
  if (!catalog || !Object.hasOwn(catalog, key)) {
    throw new Error(`Missing translation: ${locale}.${key}`);
  }
  return catalog[key].replace(/\{(\w+)\}/g, (_, parameter) => {
    if (!Object.hasOwn(parameters, parameter)) {
      throw new Error(`Missing parameter: ${locale}.${key}.${parameter}`);
    }
    return String(parameters[parameter]);
  });
}
