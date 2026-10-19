import { importTimetable, bookTransit, advanceTransit, validateTransportSave, transportRouteView } from "./transport.mjs";
import { hybridTransportOffers } from "./hybrid.mjs";

const $ = id => document.getElementById(id);
const folder = "../../data/transport/examples/grenoble-lyon/";
const storageKey = "arcane-hybrid-transport-preview-v1";
const messages = {
  fr: {
    title: "Transport hybride : Grenoble, Lyon et liens fictifs",
    warning: "Apercu independant, pas une activation dans le voyage en ligne. Horaires SNCF reels du 19 octobre 2026, sans garantie temps reel. Les cars fictifs sont des liens abstraits entre vrais lieux, pas des itineraires routiers verifies. Tous les tarifs sont des prix fictifs de jeu. Metabolisme de test : 1 kcal/minute, pas de recuperation de fatigue.",
    scope: "Donnees chargees : ligne SNCF K6 uniquement. Grenoble vers Lyon utilise le vrai TER. Chambery illustre une lacune de CET import, pas une absence reelle de trains. Le fallback fictif ne remplace pas un train manque ou annule. Contient des informations SNCF Voyageurs disponibles sous ODbL.",
    sourceLink: "Source complete importee", docsLink: "Documentation et licences",
    destinationLabel: "Destination : ", reset: "Recommencer a Grenoble, 11 h",
    finish: "Simuler le trajet reserve", save: "Sauvegarder l'apercu", resume: "Reprendre l'apercu",
    connectionsLabel: "27 trains directs Grenoble vers Lyon importes",
    trainHeading: "Train", departureHeading: "Depart", arrivalHeading: "Arrivee", durationHeading: "Minutes",
    real: "HORAIRE REEL SNCF", fictional: "CAR FICTIF DE JEU", fare: "Prix fictif estime",
    book: "Reserver dans l'apercu", empty: "Aucun depart pour cette destination depuis cette case.",
    active: "Trajet reserve", arrived: "Arrive", cancelled: "Annule", interrupted: "Interrompu",
    ready: "A l'arret", position: "Case", wallet: "Argent", walked: "Distance marchee inchangee",
    route: "Arrets atteints", abstract: "Lien abstrait, pas une route reelle", saved: "Apercu sauvegarde.",
    restored: "Apercu repris.", missing: "Aucune sauvegarde de cet apercu.", stale: "Sources hors date",
    failed: "Erreur",
  },
  en: {
    title: "Hybrid transport: Grenoble, Lyon and fictional links",
    warning: "Standalone preview, not online journey activation. Real SNCF schedules for 19 October 2026, without live guarantees. Fictional coaches are abstract links between real places, not verified road itineraries. All fares are fictional game prices. Test metabolism: 1 kcal/minute, no fatigue recovery.",
    scope: "Loaded data: SNCF K6 only. Grenoble to Lyon uses the real TER. Chambery illustrates a gap in THIS import, not an actual absence of trains. Fictional fallback does not replace a missed or cancelled train. Contains SNCF Voyageurs information available under ODbL.",
    sourceLink: "Complete imported source", docsLink: "Documentation and licences",
    destinationLabel: "Destination: ", reset: "Reset to Grenoble, 11 am",
    finish: "Simulate booked journey", save: "Save preview", resume: "Resume preview",
    connectionsLabel: "27 imported direct Grenoble to Lyon trains",
    trainHeading: "Train", departureHeading: "Departure", arrivalHeading: "Arrival", durationHeading: "Minutes",
    real: "REAL SNCF SCHEDULE", fictional: "FICTIONAL GAME COACH", fare: "Estimated fictional fare",
    book: "Book in preview", empty: "No departure for this destination from this cell.",
    active: "Booked journey", arrived: "Arrived", cancelled: "Cancelled", interrupted: "Interrupted",
    ready: "At the stop", position: "Cell", wallet: "Money", walked: "Walked distance unchanged",
    route: "Reached stops", abstract: "Abstract link, not a real road route", saved: "Preview saved.",
    restored: "Preview resumed.", missing: "No saved preview.", stale: "Out-of-date sources",
    failed: "Error",
  },
};
let real, fictional, report, state, lang = "fr", notice = "";
const m = () => messages[lang];
const options = { gridId: "grenoble-lyon-example-v1" };
const active = () => state?.transport?.booking?.status === "active";
const formatTime = instant => new Intl.DateTimeFormat(lang, {
  timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
}).format(new Date(instant));
const money = cents => new Intl.NumberFormat(lang, { style: "currency", currency: "EUR" }).format(cents / 100);
function initial() {
  const stop = real.stops.find(stop => stop.id === report.from.id);
  return { col: stop.col, row: stop.row, startedAt: Date.parse("2026-10-19T11:00:00+02:00"),
    elapsedMinutes: 0, walletCents: 10000, reserveKcal: 1000, fatigue: 20, distanceMeters: 0, ended: null };
}
function text(tag, value) {
  const node = document.createElement(tag); node.textContent = value; return node;
}
function selectedFeed() {
  const id = state.transport.booking.feedId;
  if (id === real.id) return real;
  if (id === fictional.id) return fictional;
  throw new Error("Unknown saved timetable.");
}
function act(callback) {
  try { notice = ""; callback(); render(); }
  catch (error) { $("error").textContent = `${m().failed}: ${error.code ?? error.message}`; }
}
function render() {
  document.documentElement.lang = lang;
  document.title = m().title;
  for (const id of ["title", "warning", "scope", "sourceLink", "docsLink", "destinationLabel", "reset",
    "finish", "save", "resume", "connectionsLabel", "trainHeading", "departureHeading", "arrivalHeading",
    "durationHeading"]) $(id).textContent = m()[id];
  $("error").textContent = notice;
  $("state").textContent = `${formatTime(state.startedAt + state.elapsedMinutes * 60000)} · ${m().position} ${state.col},${state.row} · ${m().wallet}: ${money(state.walletCents)} · ${state.reserveKcal} kcal · ${m()[state.transport?.booking?.status ?? "ready"]}`;
  $("finish").disabled = !active();
  $("offers").replaceChildren();
  if (!active() && !state.ended) {
    const result = hybridTransportOffers({ realFeeds: [real], fictionalFeed: fictional }, state, options);
    if (result.staleFeedIds.length) $("error").textContent = `${m().stale}: ${result.staleFeedIds.join(", ")}`;
    for (const offer of result.offers.filter(offer => offer.to.name === $("destination").value).slice(0, 5)) {
      const isFictional = offer.serviceKind === "fictional-service", li = document.createElement("li");
      li.className = isFictional ? "fictional" : "real";
      li.append(text("strong", isFictional ? m().fictional : m().real));
      li.append(text("p", `${offer.from.name} ${formatTime(offer.departureAt)} → ${offer.to.name} ${formatTime(offer.arrivalAt)} · ${offer.rideMinutes} min · ${m().fare}: ${money(offer.fareCents)}`));
      if (isFictional) li.append(text("p", m().abstract));
      const button = text("button", m().book);
      button.addEventListener("click", () => act(() => {
        state = bookTransit(isFictional ? fictional : real, state, offer.id, options);
      }));
      li.append(button); $("offers").append(li);
    }
    if (!$("offers").children.length) $("offers").append(text("li", m().empty));
  }
  const rides = transportRouteView(state).rides;
  const current = rides.at(-1);
  $("route").textContent = current ? `${m().route}: ${current.points.map(point => `${point.col},${point.row}`).join(" → ")}. ${m().walked}: ${state.distanceMeters} m.${current.serviceKind === "fictional-service" ? ` ${m().fictional}: ${m().abstract}.` : ""}` : "";
  $("serviceDate").textContent = `${report.serviceDate} · Europe/Paris · Grenoble → Lyon Part Dieu`;
  $("connections").replaceChildren(...report.connections.map(connection => {
    const row = document.createElement("tr");
    row.append(...[connection.headsign, formatTime(connection.departure), formatTime(connection.arrival),
      connection.durationMinutes].map(value => text("td", value)));
    return row;
  }));
}
async function load(name) {
  const response = await fetch(`${folder}${name}.json`);
  if (!response.ok) throw new Error(`${response.status}: ${name}`);
  return response.json();
}
try {
  const [realData, fictionalData, connections] = await Promise.all([
    load("real-timetable"), load("fictional-timetable"), load("connections"),
  ]);
  real = importTimetable(realData);
  fictional = importTimetable(fictionalData, { allowFictional: true });
  report = connections;
  state = initial();
  for (const name of [report.to.name, fictional.stops.find(stop => stop.id === "StopArea:OCE87741009").name]) {
    const option = text("option", name); option.value = name; $("destination").append(option);
  }
  $("destination").value = report.to.name;
  for (const id of ["destination", "reset", "save", "resume"]) $(id).disabled = false;
  render();
} catch (error) {
  $("error").textContent = `${m().failed}: ${error.code ?? error.message}`;
}
$("language").addEventListener("change", () => { lang = $("language").value; if (state) act(() => {}); });
$("destination").addEventListener("change", () => act(() => {}));
$("reset").addEventListener("click", () => act(() => { state = initial(); }));
$("finish").addEventListener("click", () => act(() => {
  const feed = selectedFeed();
  for (let index = 0; index < 600 && active(); index++) {
    state = advanceTransit(feed, state, state.transport.booking.id, { ...options,
      settle: (previous, proposed, { minutes }) => ({ ...proposed, reserveKcal: previous.reserveKcal - minutes }),
    });
  }
  if (active()) throw new Error("Preview simulation bound exceeded.");
}));
$("save").addEventListener("click", () => act(() => {
  localStorage.setItem(storageKey, JSON.stringify({ state, realRevision: real.revision, fictionalRevision: fictional.revision }));
  notice = m().saved;
}));
$("resume").addEventListener("click", () => act(() => {
  const raw = localStorage.getItem(storageKey);
  if (!raw) throw new Error(m().missing);
  const saved = JSON.parse(raw);
  validateTransportSave(saved.state);
  if (saved.realRevision !== real.revision || saved.fictionalRevision !== fictional.revision) throw new Error("STALE_TIMETABLE");
  state = saved.state;
  notice = m().restored;
}));
