const $ = id => document.getElementById(id);
const messages = {
  fr: {
    languageLabel: "Langue", title: "Transports reels : sources europeennes",
    warning: "Catalogue de sources, pas une couverture complete de l'Europe. Les exemples utilisent de vrais horaires dates, pas du temps reel. Aucun transport n'est encore active dans le voyage en ligne. Tous les prix sont des estimations fictives pour le jeu, pas des billets operateur.",
    catalogTitle: "Trouver un fournisseur", countryLabel: "Pays", filterLabel: "Operateur ou identifiant",
    operatorHeading: "Operateur", sourceHeading: "Source GTFS", statusHeading: "Etat du catalogue",
    licenseHeading: "Licence a examiner", verifiedTitle: "Premiers imports reels verifies",
    sampleWarning: "Trois trajets complets au maximum par fournisseur sont conserves ici. Les compteurs portent sur l'import du jour entier ; les noms de lignes proviennent de cet import. Une sequence d'arrets ne represente pas le trace exact des rails ou des routes.",
    catalogLink: "Catalogue JSON", documentationLink: "Sources, licences et commandes",
    entries: "entrees", countries: "pays avec des entrees", retrieved: "Catalogue recupere le",
    shown: "affichees sur", gap: "Aucune source cataloguee pour ce pays ; cela ne signifie pas qu'il n'y a pas de transports.",
    credentials: "Authentification requise", licenseMissing: "Licence absente du catalogue",
    license: "Conditions de reutilisation", unavailable: "Miroir non disponible", unlocated: "Emprise absente ou invalide",
    date: "Date de service", routes: "lignes", stops: "arrets", trips: "trajets dates",
    approximate: "Heures approximatives fournies par la source", exact: "Heures de passage fournies par la source",
    gameFare: "Prix fictif estime pour le jeu", operatorFare: "aucun tarif operateur importe",
    proof: "Donnees echantillonnees et provenance", failed: "Chargement impossible",
  },
  en: {
    languageLabel: "Language", title: "Real transport: European sources",
    warning: "Source catalogue, not complete European coverage. Examples use real dated schedules, not live operations. Transport is not yet activated in the online journey. All prices are fictional game estimates, not operator tickets.",
    catalogTitle: "Find a provider", countryLabel: "Country", filterLabel: "Operator or feed ID",
    operatorHeading: "Operator", sourceHeading: "GTFS source", statusHeading: "Catalogue status",
    licenseHeading: "Licence to review", verifiedTitle: "First verified real imports",
    sampleWarning: "At most three complete trips per provider are retained here. Counts describe the whole service-day import; route names come from that import. Stop sequences are not exact track or road geometry.",
    catalogLink: "Catalogue JSON", documentationLink: "Sources, licences and commands",
    entries: "entries", countries: "countries with entries", retrieved: "Catalogue retrieved",
    shown: "shown of", gap: "No catalogued source for this country; this does not mean there is no public transport.",
    credentials: "Authentication required", licenseMissing: "Licence missing from catalogue",
    license: "Reuse conditions", unavailable: "Mirror unavailable", unlocated: "Missing or invalid bounding box",
    date: "Service date", routes: "routes", stops: "stops", trips: "dated trips",
    approximate: "Source-supplied approximate times", exact: "Source-supplied timepoints",
    gameFare: "Estimated fictional game fare", operatorFare: "no operator fare imported",
    proof: "Sampled data and provenance", failed: "Unable to load",
  },
};
let catalog, samples, lang = "fr";
const text = (tag, value) => {
  const node = document.createElement(tag);
  node.textContent = value;
  return node;
};
function link(label, url) {
  const node = text("a", label);
  node.href = url;
  return node;
}
function renderFeeds() {
  const m = messages[lang], country = $("country").value;
  const query = $("filter").value.trim().toLocaleLowerCase(lang);
  const matching = catalog.feeds.filter(feed => feed.country === country &&
    `${feed.provider} ${feed.name} ${feed.id}`.toLocaleLowerCase(lang).includes(query));
  $("count").textContent = catalog.coverage[country].catalogEntries ?
    `${Math.min(50, matching.length)} ${m.shown} ${matching.length} ${m.entries}.` : m.gap;
  $("feeds").replaceChildren();
  for (const feed of matching.slice(0, 50)) {
    const row = document.createElement("tr");
    row.append(text("td", feed.provider || feed.name));
    const source = document.createElement("td");
    source.append(feed.mirrorUrl ? link(feed.id, feed.mirrorUrl) : text("span", `${feed.id}: ${m.unavailable}`));
    row.append(source);
    row.append(text("td", [feed.status, feed.authenticationRequired ? m.credentials : "",
      feed.bounds ? "" : m.unlocated].filter(Boolean).join(" · ")));
    const licence = document.createElement("td");
    licence.append(feed.licenseUrl ? link(m.license, feed.licenseUrl) : text("span", m.licenseMissing));
    row.append(licence);
    $("feeds").append(row);
  }
}
function render() {
  const m = messages[lang], selected = $("country").value || "FR";
  document.documentElement.lang = lang;
  document.title = m.title;
  for (const id of ["languageLabel", "title", "warning", "catalogTitle", "countryLabel", "filterLabel",
    "operatorHeading", "sourceHeading", "statusHeading", "licenseHeading", "verifiedTitle",
    "sampleWarning", "catalogLink", "documentationLink"]) $(id).textContent = m[id];
  const countries = Object.entries(catalog.coverage);
  $("summary").textContent = `${catalog.feeds.length} ${m.entries} · ${countries.filter(([, c]) =>
    c.catalogEntries).length} ${m.countries} · ${m.retrieved}: ${catalog.retrievedAt}`;
  const names = new Intl.DisplayNames([lang], { type: "region" });
  $("country").replaceChildren(...countries.map(([code, coverage]) => {
    const option = text("option", `${names.of(code)} (${code}) — ${coverage.catalogEntries}`);
    option.value = code;
    return option;
  }));
  $("country").value = selected;
  renderFeeds();
  $("verified").replaceChildren();
  for (const sample of samples) {
    const section = document.createElement("article");
    section.append(text("h3", `${sample.source.provider} (${sample.source.country})`));
    section.append(text("p", `${m.date}: ${sample.serviceDate} · ${sample.routes.length} ${m.routes} · ${sample.sampling.totalStops} ${m.stops} · ${sample.sampling.totalTrips} ${m.trips}`));
    section.append(link(m.license, sample.source.licenseUrl));
    const stops = new Map(sample.stops.map(stop => [stop.id, stop]));
    for (const trip of sample.trips) {
      const route = sample.routes.find(route => route.id === trip.routeId);
      const first = trip.calls[0], last = trip.calls.at(-1);
      const quality = trip.timingQuality === "source-approximate" ? m.approximate : m.exact;
      section.append(text("p", `${route.shortName || route.id} ${route.longName} · ${stops.get(first.stopId).name} ${first.departure} → ${stops.get(last.stopId).name} ${last.arrival} · ${quality}. ${m.gameFare}: ${new Intl.NumberFormat(lang, { style: "currency", currency: "EUR" }).format(trip.fare.cents / 100)} (${m.operatorFare}).`));
    }
    section.append(link(m.proof, `../../data/transport/samples/${sample.source.id}.json`));
    const hash = text("p", `GTFS SHA-256: ${sample.sha256}`);
    hash.className = "hash";
    section.append(hash);
    $("verified").append(section);
  }
}
async function load(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return response.json();
}
try {
  const [index, manifest] = await Promise.all([
    load("../../data/transport/europe-catalog.json"), load("../../data/transport/verified-feeds.json"),
  ]);
  catalog = index;
  samples = await Promise.all(manifest.feeds.map(feed => load(`../../data/transport/${feed.sampleFile}`)));
  render();
  $("country").disabled = $("filter").disabled = false;
} catch (error) {
  $("error").textContent = `${messages[lang].failed}: ${error.message}`;
}
$("language").addEventListener("change", () => {
  lang = $("language").value;
  if (catalog && samples) render();
});
$("country").addEventListener("change", renderFeeds);
$("filter").addEventListener("input", renderFeeds);
