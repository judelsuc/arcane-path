import { LIMITS, importAgenda, calendar, encounterAgenda, acknowledgeEncounter } from "./agenda.mjs";
import { syntheticAgenda } from "./demo.mjs";
import { createContentService } from "../../cell-content.mjs";

const copy = {
  fr: {
    heading: "Monde vivant — aperçu autonome",
    intro: "Agenda public connecté et démonstration fictive séparée. Le voyage commence maintenant ; attendre ne fait pas avancer le temps.",
    connect: "Chercher les événements publics", "latitude-label": "Latitude", "longitude-label": "Longitude",
    "connected-note": "OpenAgenda : recherche à 20 km, sur sept jours. Couverture inégale selon les agendas contributeurs, pas toute l'Europe. Les coordonnées saisies, arrondies à 0,01°, sont transmises au fournisseur ; aucun nom ni sauvegarde. Titres d'origine, sans traduction automatique. Le rayon de rencontre de 1 km est un choix d'aperçu, pas l'emprise réelle de l'événement.",
    "transport-link": "Explorer les sources européennes de transport et le trajet déjà implémenté",
    loading: "Recherche en cours…", failed: "Source indisponible : ", upcoming: "Horaire publié, pas une rencontre active ici.",
    photo: "Chercher une photo libre à proximité", photoNone: "Aucune photo libre attribuée trouvée à proximité.",
    photoFailed: "Recherche photo impossible : ", illustration: "Photo illustrative des environs — ne documente pas cet événement.",
    coverage: "lignes examinées / correspondances du fournisseur", omitted: "lignes écartées", limited: "Résultat limité : couverture partielle.",
    observedSchedule: "Horaires publiés ; vérifier auprès de l'organisateur. Fraîcheur bornée, pas une garantie de tenue.",
    queryArea: "Centre de recherche", listed: "occurrences affichées",
    "clock-heading": "Calendrier du voyage (UTC)", advance: "Avancer de 30 minutes",
    away: "Changer de zone", "data-heading": "Source d’agenda",
    "import-label": "Importer un agenda public JSON vérifié :",
    demo: "Charger la démonstration fictive", empty: "Vider l’agenda",
    "agenda-heading": "Agenda publié et rencontres actives",
    boundary: "Aucun effet sur la santé, le hasard ou les tarifs. Les données expirées ou hors zone ne créent pas de rencontre active. Cet aperçu ne modifie pas la sauvegarde du jeu.",
    none: "Aucune donnée d’agenda active dans cette zone. Cela ne signifie pas qu’il ne s’y passe rien.",
    public: "Données publiques importées — vérifiez leur source.",
    synthetic: "DÉMONSTRATION FICTIVE — aucun événement réel.",
    unloaded: "Aucune source importée.", acknowledge: "Noter dans le carnet",
    acknowledged: "Déjà noté dans le carnet", source: "Source", observed: "Source consultée le",
    until: "Source valable jusqu’au", area: "Zone", radius: "rayon",
    loaded: "Agenda importé.", rejected: "Import refusé : vérifiez le schéma, les bornes et la provenance.",
    position: "Position du joueur", event: "Événement local", disruption: "Perturbation de transport",
    full: "Carnet plein : les nouvelles rencontres ne sont pas enregistrées.",
  },
  en: {
    heading: "Living world — standalone preview",
    intro: "Connected public agenda and a separate fictional demonstration. The journey starts now; waiting does not advance time.",
    connect: "Find public events", "latitude-label": "Latitude", "longitude-label": "Longitude",
    "connected-note": "OpenAgenda: search within 20 km for seven days. Coverage depends on contributing agendas, not all Europe. Entered coordinates, rounded to 0.01°, are sent to the provider; no name or save is sent. Original titles, without automatic translation. The 1 km encounter radius is a preview choice, not the event's actual footprint.",
    "transport-link": "Explore European transport sources and the already implemented journey",
    loading: "Searching…", failed: "Source unavailable: ", upcoming: "Published schedule, not an active encounter here.",
    photo: "Find a nearby openly licensed photo", photoNone: "No attributed openly licensed photo found nearby.",
    photoFailed: "Photo search failed: ", illustration: "Illustrative nearby photo — does not document this event.",
    coverage: "rows checked / provider matches", omitted: "omitted rows", limited: "Limited result: partial coverage.",
    observedSchedule: "Published schedules; check with the organiser. Bounded freshness, not a guarantee the event will take place.",
    queryArea: "Search centre", listed: "listed occurrences",
    "clock-heading": "Journey calendar (UTC)", advance: "Advance 30 minutes",
    away: "Change area", "data-heading": "Agenda source",
    "import-label": "Import a verified public JSON agenda:",
    demo: "Load fictional demonstration", empty: "Clear agenda",
    "agenda-heading": "Published agenda and active encounters",
    boundary: "No health, randomness or fare effects. Expired and out-of-area records cannot create active encounters. This preview does not modify the game's save.",
    none: "No active agenda data for this area. This does not mean nothing is happening here.",
    public: "Imported public data — check its source.",
    synthetic: "FICTIONAL DEMONSTRATION — no real events.",
    unloaded: "No source imported.", acknowledge: "Note in notebook",
    acknowledged: "Already noted in notebook", source: "Source", observed: "Source retrieved at",
    until: "Source valid until", area: "Area", radius: "radius",
    loaded: "Agenda imported.", rejected: "Import rejected: check schema, bounds and provenance.",
    position: "Player position", event: "Local event", disruption: "Transport disruption",
    full: "Notebook full: new encounters are not recorded.",
  },
};
const $ = id => document.getElementById(id);
let locale = "fr", mode = "unloaded", status = "";
// Wall time is sampled once, just like initialJourney. No interval or idle catch-up.
const journey = { startedAt: Date.now(), elapsedMinutes: 0 };
let position = { lat: 45.19, lon: 5.72 };
let agenda = importAgenda({ version: 1, importedAt: journey.startedAt, records: [] });
let saved;
let coverage, loading = false, controller, generation = 0;
const photoCache = new Map();
const photos = createContentService({ cache: {
  get: async key => photoCache.get(key), put: async (key, value) => photoCache.set(key, value),
} });
function cancelRequest() {
  generation++;
  controller?.abort();
  loading = false;
}
async function loadPhoto(record, button, container) {
  const language = locale, t = copy[language];
  button.disabled = true;
  try {
    const { lat, lon } = record.area;
    const candidates = await photos.commonsNearby({
      latitude: lat, longitude: lon, bounds: { south: lat - .001, north: lat + .001,
        west: lon - .001, east: lon + .001 },
    });
    const image = candidates.find(p => /^https?:\/\/creativecommons\.org\/(?:licenses\/(?:by|by-sa)\/(?:1\.0|2\.0|2\.5|3\.0|4\.0)(?:\/[a-z]{2})?|publicdomain\/(?:zero|mark)\/1\.0)\/?$/u.test(p.licenseUrl));
    if (!image) { button.textContent = t.photoNone; return; }
    const img = document.createElement("img");
    img.src = image.url; img.alt = image.title; img.loading = "lazy";
    img.onerror = () => {
      img.remove(); caption.remove(); button.textContent = t.photoFailed;
      button.disabled = false; button.hidden = false;
      console.error("Living-world illustrative image failed to load.");
    };
    const caption = document.createElement("p");
    caption.textContent = `${t.illustration} ${image.attribution} · ${image.license} · ${image.distance} m. `;
    for (const [label, href] of [[t.source, image.sourceUrl], [image.license, image.licenseUrl]]) {
      const link = document.createElement("a"); link.textContent = label; link.href = href; link.rel = "noreferrer";
      caption.append(link, " ");
    }
    container.append(img, caption);
    button.hidden = true;
  } catch (error) {
    console.error("Living-world photo source failed:", error);
    button.textContent = t.photoFailed + error.message;
    button.disabled = false;
  }
}
function render() {
  const t = copy[locale];
  document.documentElement.lang = locale;
  for (const key of ["heading", "intro", "clock-heading", "advance", "away", "data-heading",
    "import-label", "demo", "empty", "agenda-heading", "boundary", "connect",
    "latitude-label", "longitude-label", "connected-note", "transport-link"]) $(key).textContent = t[key];
  $("connect").disabled = loading;
  $("mode").textContent = t[mode];
  $("status").textContent = t[status] ?? status;
  $("coverage").textContent = coverage
    ? `${coverage.provider} · ${coverage.sourceRows}/${coverage.matchingRows} ${t.coverage} · ${coverage.rejectedRows} ${t.omitted} · ${agenda.records.length} ${t.listed}. ${t.queryArea}: ${coverage.latitude}, ${coverage.longitude} · ${coverage.radiusMeters / 1000} km. ${coverage.truncated ? t.limited : ""} ${t.observedSchedule}`
    : "";
  if (coverage) {
    const license = document.createElement("a");
    license.href = coverage.license.url; license.textContent = coverage.license.name; license.rel = "noreferrer";
    $("coverage").append(" ", license);
  }
  const date = calendar(journey, locale);
  $("clock").textContent = date.full;
  $("clock").dateTime = date.iso;
  $("position").textContent = `${t.position} : ${position.lat}, ${position.lon}`;
  const result = encounterAgenda(agenda, { journey, position }, saved);
  saved = result.state;
  $("events").replaceChildren();
  const records = mode === "public" ? agenda.records : result.encounters.map(e => e.record);
  if (!records.length) $("events").textContent = t.none;
  for (const record of records) {
    const encounter = result.encounters.find(e => e.record.key === record.key);
    const article = document.createElement("article");
    const line = (tag, text) => {
      const element = document.createElement(tag);
      element.textContent = text;
      article.append(element);
      return element;
    };
    if (record.reality === "synthetic") line("p", t.synthetic).className = "badge";
    line("h3", record.title[locale]);
    line("p", t[record.kind]);
    if (!encounter) line("p", t.upcoming);
    const format = value => new Intl.DateTimeFormat(locale, {
      timeZone: "UTC", dateStyle: "short", timeStyle: "short", hourCycle: "h23",
    }).format(value);
    line("p", `${format(record.startsAt)} → ${format(record.endsAt)} UTC`);
    const link = line("a", `${t.source} : ${record.source.name}`);
    link.href = record.source.url;
    link.rel = "noreferrer";
    line("small", `${t.observed} : ${format(record.source.observedAt)} UTC`);
    line("small", `${t.until} : ${format(record.source.validUntil)} UTC`);
    line("small", `${t.area} : ${record.area.lat}, ${record.area.lon} · ${t.radius} ${record.area.radiusMeters} m`);
    if (encounter) {
      const button = line("button", encounter.acknowledged ? t.acknowledged : t.acknowledge);
      button.disabled = encounter.acknowledged;
      button.onclick = () => {
        saved = acknowledgeEncounter(agenda, { journey, position }, saved, record.key);
        render();
      };
    }
    if (record.reality === "public") {
      const button = line("button", t.photo);
      button.onclick = () => loadPhoto(record, button, article);
    }
    $("events").append(article);
  }
  if (result.saturated) $("status").textContent = t.full;
}
$("language").onchange = event => { locale = event.target.value; render(); };
$("advance").onclick = () => { journey.elapsedMinutes += 30; render(); };
$("away").onclick = () => {
  position = position.lat === 45.19 ? { lat: 46.19, lon: 5.72 } : { lat: 45.19, lon: 5.72 };
  render();
};
$("demo").onclick = () => {
  cancelRequest(); coverage = undefined; saved = undefined;
  agenda = importAgenda(syntheticAgenda(journey.startedAt), { allowSynthetic: true });
  mode = "synthetic"; status = ""; render();
};
$("empty").onclick = () => {
  cancelRequest(); coverage = undefined; saved = undefined;
  agenda = importAgenda({ version: 1, importedAt: journey.startedAt, records: [] });
  mode = "unloaded"; status = ""; render();
};
$("import").onchange = async event => {
  const file = event.target.files[0];
  if (!file) return;
  cancelRequest(); coverage = undefined;
  try {
    if (file.size > LIMITS.bytes) throw new Error("oversize");
    const candidate = importAgenda(JSON.parse(await file.text()));
    agenda = candidate; saved = undefined; mode = "public"; status = "loaded";
  } catch (error) { console.error("Living-world import failed:", error); status = "rejected"; }
  event.target.value = "";
  render();
};
$("connected-form").onsubmit = async event => {
  event.preventDefault();
  cancelRequest();
  const current = generation;
  controller = new AbortController();
  const signal = controller.signal;
  const lat = Number($("latitude").value), lon = Number($("longitude").value);
  loading = true; status = "loading"; render();
  try {
    const deadline = Date.now() + 120000;
    while (!signal.aborted) {
      const response = await fetch(`/api/living-world?${new URLSearchParams({ lat, lon })}`, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(25000)]),
      });
      if (current !== generation) return;
      if (response.status === 202 || response.status === 429) {
        if (Date.now() >= deadline) throw new Error("Timed out; no fictional substitute.");
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      const data = await response.json();
      const candidate = importAgenda(data);
      if (current !== generation) return;
      agenda = candidate; coverage = data.coverage; saved = undefined;
      journey.startedAt = Math.max(Date.now(), data.importedAt); journey.elapsedMinutes = 0;
      position = { lat, lon }; mode = "public"; status = "loaded";
      break;
    }
  } catch (error) {
    if (current !== generation) return;
    console.error("Connected living-world source failed:", error);
    status = copy[locale].failed + error.message;
  } finally {
    if (current === generation) { loading = false; render(); }
  }
};
render();
