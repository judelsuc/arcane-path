import { importTimetable, transportOffers, bookTransit, advanceTransit,
  validateTransportSave, transportRouteView } from "./transport.mjs";
import { demoTimetable, demoJourney } from "./demo-fixture.mjs";

const feed = importTimetable(demoTimetable(), { allowDemo: true });
const $ = id => document.getElementById(id);
const messages = {
  fr: {
    title: "Cars et trains — aperçu indépendant",
    warning: "DÉMONSTRATION SYNTHÉTIQUE : arrêts, horaires et tarifs imaginaires. Aucun service réel ni activation dans le voyage. Métabolisme simplifié pour cet aperçu uniquement : 1 kcal/minute, aucune récupération de fatigue.",
    cancelLabel: "Annuler le car", delayLabel: "Retarder le car de 3 minutes",
    reset: "Recommencer", hungry: "Voyageur affamé (4 kcal)", step: "Avancer d'une minute",
    finish: "Simuler jusqu'à l'issue", save: "Sauvegarder l'aperçu", resume: "Reprendre l'aperçu",
    offersLabel: "Départs depuis cette case", routeLabel: "Trajet en véhicule (non marché)",
    legend: "Bleu pointillé : arrêts effectivement atteints en véhicule. La distance marchée n'augmente pas.",
    empty: "Aucun départ disponible.", book: "Réserver", wait: "attente", ride: "trajet",
    bus: "Car", train: "Train", wallet: "Argent", fatigue: "Fatigue", hunger: "Fin : faim",
    active: "En cours", arrived: "Arrivé", cancelled: "Annulé avant paiement", interrupted: "Interrompu",
    ready: "À l'arrêt", saved: "Aperçu sauvegardé.", restored: "Aperçu repris.", error: "Erreur",
    missing: "Aucune sauvegarde d'aperçu.", position: "Case",
  },
  en: {
    title: "Buses and trains — standalone preview",
    warning: "SYNTHETIC DEMO: imaginary stops, schedules and fares. No real service or live journey activation. Simplified preview-only metabolism: 1 kcal/minute, no fatigue recovery.",
    cancelLabel: "Cancel the bus", delayLabel: "Delay the bus by 3 minutes",
    reset: "Reset", hungry: "Hungry traveller (4 kcal)", step: "Advance one minute",
    finish: "Simulate to outcome", save: "Save preview", resume: "Resume preview",
    offersLabel: "Departures from this cell", routeLabel: "Vehicle route (not walked)",
    legend: "Dashed blue: stops actually reached by vehicle. Walked distance does not increase.",
    empty: "No departures available.", book: "Book", wait: "wait", ride: "ride",
    bus: "Bus", train: "Train", wallet: "Money", fatigue: "Fatigue", hunger: "Ended: hunger",
    active: "In progress", arrived: "Arrived", cancelled: "Cancelled before payment", interrupted: "Interrupted",
    ready: "At the stop", saved: "Preview saved.", restored: "Preview resumed.", error: "Error",
    missing: "No saved preview.", position: "Cell",
  },
};
let state = demoJourney(), lang = "fr", notice = "";
const m = () => messages[lang];
function disruptions() {
  const at = Date.parse("2026-10-18T10:02:00+02:00");
  const base = { startsAt: at, endsAt: at + 60000, tripId: "demo-bus" };
  return [...($("cancel").checked ? [{ ...base, id: "demo-cancel", cancelled: true }] : []),
    ...($("delay").checked ? [{ ...base, id: "demo-delay", delayMinutes: 3 }] : [])];
}
const options = () => ({ gridId: feed.gridId, disruptions: disruptions() });
const active = () => state.transport?.booking?.status === "active" && !state.ended;
const time = at => new Intl.DateTimeFormat(lang, { timeZone: feed.timeZone,
  dateStyle: "short", timeStyle: "short" }).format(new Date(at));
const money = cents => new Intl.NumberFormat(lang, { style: "currency", currency: "EUR" }).format(cents / 100);
function advance() {
  state = advanceTransit(feed, state, state.transport.booking.id, { ...options(),
    settle(previous, proposed, { minutes }) {
      const reserveKcal = Math.max(0, previous.reserveKcal - minutes);
      return { ...proposed, reserveKcal, energyKcal: previous.energyKcal + minutes,
        awakeHours: previous.awakeHours + minutes / 60, ended: reserveKcal <= 0 ? "hunger" : null };
    } });
}
function act(fn) {
  try { notice = ""; fn(); render(); } catch (error) { $("error").textContent = `${m().error}: ${error.code ?? error.message}`; }
}
function render() {
  document.documentElement.lang = lang;
  for (const id of ["title", "warning", "cancelLabel", "delayLabel", "reset", "hungry", "step",
    "finish", "save", "resume", "offersLabel", "routeLabel", "legend"]) $(id).textContent = m()[id];
  $("state").textContent = `${time(state.startedAt + state.elapsedMinutes * 60000)} · ${m().position} ${state.col},${state.row} · ${m().wallet}: ${money(state.walletCents)} · ${state.reserveKcal} kcal · ${m().fatigue}: ${state.fatigue} · ${state.ended ? m().hunger : m()[state.transport?.booking?.status ?? "ready"]}`;
  $("error").textContent = notice;
  $("step").disabled = $("finish").disabled = !active();
  $("offers").replaceChildren();
  let offers = [];
  if (!active() && !state.ended) offers = transportOffers(feed, state, options());
  for (const offer of offers) {
    const li = document.createElement("li"), button = document.createElement("button");
    li.textContent = `${m()[offer.mode]} → ${offer.to.name} · ${time(offer.departureAt)} · ${money(offer.fareCents)} · ${m().wait}: ${offer.waitMinutes} min · ${m().ride}: ${offer.rideMinutes} min `;
    button.textContent = m().book;
    button.addEventListener("click", () => act(() => { state = bookTransit(feed, state, offer.id, options()); }));
    li.append(button); $("offers").append(li);
  }
  if (!offers.length) { const li = document.createElement("li"); li.textContent = m().empty; $("offers").append(li); }
  $("route").replaceChildren();
  for (const ride of transportRouteView(state).rides) {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    line.setAttribute("points", ride.points.map(p => `${50 + p.col * 95},${45 + p.row * 40}`).join(" "));
    line.setAttribute("fill", "none"); line.setAttribute("stroke", "#24648b");
    line.setAttribute("stroke-width", "6"); line.setAttribute("stroke-dasharray", "10 6");
    $("route").append(line);
  }
  for (const stop of feed.stops) {
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", 50 + stop.col * 95); label.setAttribute("y", 30 + stop.row * 40);
    label.textContent = `${stop.name} (${stop.col},${stop.row})`; $("route").append(label);
  }
  $("details").textContent = state.transport ? JSON.stringify(state.transport.booking, null, 2) : "";
}
$("language").addEventListener("change", () => act(() => { lang = $("language").value; }));
for (const id of ["cancel", "delay"]) $(id).addEventListener("change", () => act(() => {}));
$("reset").addEventListener("click", () => act(() => { state = demoJourney(); }));
$("hungry").addEventListener("click", () => act(() => { state = { ...demoJourney(), reserveKcal: 4 }; }));
$("step").addEventListener("click", () => act(advance));
$("finish").addEventListener("click", () => act(() => { for (let i = 0; i < 60 && active(); i++) advance(); }));
$("save").addEventListener("click", () => act(() => {
  localStorage.setItem("arcane-transport-synthetic-preview-v1", JSON.stringify({
    state, cancelled: $("cancel").checked, delayed: $("delay").checked,
  })); notice = m().saved;
}));
$("resume").addEventListener("click", () => act(() => {
  const raw = localStorage.getItem("arcane-transport-synthetic-preview-v1");
  if (!raw) throw new Error(m().missing);
  const saved = JSON.parse(raw); validateTransportSave(saved.state);
  state = saved.state; $("cancel").checked = saved.cancelled; $("delay").checked = saved.delayed;
  notice = m().restored;
}));
render();
