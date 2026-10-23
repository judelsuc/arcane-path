import { createLoreClient } from "./lore-client.mjs";
import { LORE_ITEMS, loreItem } from "./lore-catalogue.mjs";
import { renderDiscoveryNotebook } from "./discovery-ui.mjs";
import { dreamNotebookEntries } from "./discovery-authored.mjs";
import { translate } from "./i18n.mjs";
import { dimensions } from "./equipment-inventory.mjs";
import { pendingJournalCreation, finishJournalCreation } from "./abandoned-journals.mjs";
import { createServerJourney } from "./server-journey.mjs";
import { powerCopy, extraPower, CARD_NAMES, blockedCopy } from "./lore-copy.mjs";
import { TAROT_CARDS } from "./tarot-cards.mjs";
import { bookshopCopy } from "./minigames/bookshop-ui.mjs";

const COPY = {
  en: {
    title: "Unique artifacts — authoritative playtest", main: "Back to the main game", language: "Language",
    scope: "Separate server-owned test world: 22 unique artifacts. Your main journey is unchanged; a new journey does not reset shared objects. Starting map plus real terrain prepared by the existing server provider, including distant parent routes; 256 prepared chunks per test world. Prepare/refresh freely before moving or using a route power. Failed preparation never charges an activation. Real bookshop work at mapped bookshops/libraries. No live climate provider. Inactive custody returns to public caches after 30 real days.",
    startTitle: "Choose a source journey", journey: "Existing journey", start: "Start / resume test",
    name: "Name for a new Firmi test", create: "Create a separate test", stateTitle: "Journey",
    artifactsTitle: "Artifacts and powers", rarity: "Finding one really changes the rules. Each power displays its 24 h or 72 h shared-world cooldown. Passing an object never resets it.",
    arcana: { hermit: "Hermit", chariot: "Chariot", temperance: "Temperance", fool: "Fool", wheel: "Wheel", sun: "Sun" },
    blocked: { walking: "Locked: walk at least 1 km.", sharing: "Locked: share two distinct inscription copies.",
      historical: "Locked: retain a historical artifact location clue.",
      daylight: "Locked: search during day [06:00, 20:00) UTC.",
      inscription: "Locked: record at least one artifact inscription." },
    destination: "Visited settlement to return to", recall: "Your cached artifact to recall",
    noReturn: "No different visited settlement yet. Walk into a named settlement, then leave it.",
    noRecall: "No eligible cached artifact. Deposit an artifact you carry; another player's claim cancels your recall entitlement.",
    noRecovery: "No health or fatigue to restore.",
    bagTitle: "Shared spatial bag — 6 × 4", bagHelp: "Boots and backpack are worn. Select an artifact, then click a free bag cell; rotate to change its orientation. Repacking is free.",
    rotate: "Rotate selected item", rest: "Rest 30 min", sleep: "Sleep outdoors 8 h",
    meal: "Buy the displayed meal", inquire: "Ask for a new artifact clue · 2 min",
    parent: "Search for a parent clue · 8–60 min", refresh: "Refresh / retry pending command",
    commonInquiry: "Ask for a new clue · artifact 2 min / parent 8–60 min / journal rumour free",
    dreamTitle: "Dreams", dreamEmpty: "No qualifying dream opportunity yet.",
    dreamWait: minutes => `Next eligible sleep can begin in ${Math.ceil(minutes)} journey minutes.`,
    dreamHelp: "After 60 min of deliberate sleep, cards and proximity influence one chance to learn a new clue. At most one opportunity per 24 journey hours; even a miss or an empty dream uses it. Ordinary dreams respect the same precision limits. Fainting is not a dream opportunity. Explain is free. Plain guidance requires a local interpretation or an explicit power; earned precision never increases. Journal rumours use the real journal service; pickup/delivery are outside this test.",
    abandon: "Abandon this test and release its artifacts", confirmAbandon: "End this test permanently and recache its artifacts?",
    travelHelp: "Walk with the buttons or arrow keys. The server computes time, fatigue and food. @ is you; * is an earned exact artifact marker; o a settlement; # a road; ~ water (blocked). Each cell is 250 m.",
    credit: "Real mapped terrain and names: OpenStreetMap contributors, ODbL. All caches and collector contacts are fictional in-game scenery.",
    state: s => `${s.name} · cell ${s.col}, ${s.row} · ${s.elapsedMinutes.toFixed(1)} min · ${(s.distanceMeters / 1000).toFixed(2)} km · health ${s.health.toFixed(1)} · fatigue ${s.fatigue.toFixed(1)} · food ${Math.floor(s.reserveKcal)} kcal · €${(s.walletCents / 100).toFixed(2)}`,
    stride: e => `Seven-league stride: ${(e.remainingMeters / 1000).toFixed(2)} km remaining; expires at journey minute ${e.expiresMinutes.toFixed(1)}.`,
    noEffect: "No timed artifact effect.", busy: "Waiting for the authoritative server…",
    ready: "State saved on the server.", empty: "No eligible saved journey. Create a separate test below.",
    none: "No artifact carried yet.", weight: grams => `${grams} / 5,500 g, including worn equipment.`,
    claim: "Search and claim · 10 min", cache: "Leave a public cache · 10 min", share: "Share inscription copy · 5 min",
    use: "Use power", confirm: "Commit this action with its displayed time and price?",
    cooldown: value => `Cooldown: ${Math.ceil(value)} more shared-world min.`,
    requirements: id => id === "chariot" ? "Discovery requires 1 km walked." :
      id === "temperance" ? "Discovery requires two distinct inscription copies shared." :
      id === "wheel" ? "Discovery requires a historical artifact location clue." :
      id === "sun" ? "Discovery requires day [06:00, 20:00) UTC and one recorded inscription." :
      "No additional discovery prerequisite.",
    price: id => id === "hermit" ? "1 min + 10 fatigue. Reveal the exact marker of the selected unowned artifact, regardless of distance." :
      id === "chariot" ? "1 min + 200 kcal. Next 20 km: 75% less walking time, walking fatigue and walking-effort food; expires after 24 journey hours." :
      id === "temperance" ? "1 min + 500 kcal. Restore up to 40 health and remove up to 40 fatigue immediately." :
      id === "fool" ? "1 min + 10 fatigue. Instantly return with your bag to the selected personally visited settlement on this map; no walking distance gained." :
      id === "wheel" ? "1 min + 10 fatigue. Recall your selected still-unclaimed cached artifact into the bag, without travel. Needs bag space. Cooldown: 72 shared-world hours; the recalled object's cooldown is preserved." :
        "1 min + 500 kcal. Restore full health and zero fatigue. No food refill or sleep-debt reset. Cooldown: 72 shared-world hours.",
    outcome: value => `Last action: ${value}.`,
    outcomes: { started: "started", walk: "walked", rest: "rested", sleep: "slept", meal: "ate",
      "parent-search": "parent search", "interpret-clue": "clue interpreted", inquire: "artifact inquiry", "inquire-clue": "shared clue inquiry", claim: "artifact claimed",
      cache: "artifact cached", share: "inscription shared", pack: "bag rearranged", use: "power used",
      interrupted: "interrupted", abandoned: "test abandoned" },
    error: message => `Action failed: ${message}`,
    parentResult: (result, minutes) => `Last parent search (${minutes} min): ${result}`,
    searchResults: { found: "clue found.", sign: "a sign of the trail was found.", nothing: "nothing found; the attempt's time and needs were spent.",
      fainted: "interrupted by fainting.", placed: "interrupted by a placement.", exhausted: "interrupted by exhaustion." },
    repeatedClue: "already-known evidence; no new knowledge.",
  },
  fr: {
    title: "Objets uniques — test autoritaire", main: "Revenir au jeu principal", language: "Langue",
    scope: "Monde de test séparé simulé par le serveur : 22 objets uniques. Voyage principal inchangé ; un nouveau voyage ne réinitialise pas les objets partagés. Carte initiale et vrai terrain préparé par le fournisseur existant, y compris les étapes lointaines du parent ; 256 tuiles préparées par monde de test. Préparer/actualiser gratuitement avant déplacement ou pouvoir d'itinéraire. Aucun coût d'activation en cas d'échec. Vrai travail dans les librairies/bibliothèques cartographiées. Pas de climat en direct. Caches publiques après 30 jours réels d'inactivité.",
    startTitle: "Choisir un voyage source", journey: "Voyage existant", start: "Commencer / reprendre le test",
    name: "Nom pour un nouveau test à Firmi", create: "Créer un test séparé", stateTitle: "Voyage",
    artifactsTitle: "Objets et pouvoirs", rarity: "Un objet change vraiment les règles. Chaque pouvoir affiche son délai de 24 h ou 72 h du monde partagé. Transmettre l'objet ne le remet pas à zéro.",
    arcana: { hermit: "L'Ermite", chariot: "Le Chariot", temperance: "Tempérance", fool: "Le Mat", wheel: "La Roue", sun: "Le Soleil" },
    blocked: { walking: "Verrouillé : marchez au moins 1 km.", sharing: "Verrouillé : partagez deux copies d'inscriptions distinctes.",
      historical: "Verrouillé : conservez un indice de position d'objet historique.",
      daylight: "Verrouillé : cherchez de jour [06:00, 20:00) UTC.",
      inscription: "Verrouillé : enregistrez au moins une inscription d'objet." },
    destination: "Localité visitée où revenir", recall: "Votre objet en cache à rappeler",
    noReturn: "Aucune autre localité visitée. Entrez à pied dans une localité nommée, puis quittez-la.",
    noRecall: "Aucun objet en cache éligible. Déposez un objet porté ; sa découverte par un autre joueur annule votre droit de rappel.",
    noRecovery: "Aucune santé ni fatigue à restaurer.",
    bagTitle: "Sac spatial commun — 6 × 4", bagHelp: "Bottes et sac à dos sont portés. Sélectionnez un objet puis une case libre ; tournez pour changer son orientation. Réorganiser est gratuit.",
    rotate: "Tourner l'objet sélectionné", rest: "Repos 30 min", sleep: "Dormir dehors 8 h",
    meal: "Acheter le repas affiché", inquire: "Demander un nouvel indice d'objet · 2 min",
    parent: "Chercher un indice du parent · 8–60 min", refresh: "Actualiser / réessayer l'action en attente",
    commonInquiry: "Demander un indice · objet 2 min / parent 8–60 min / rumeur de carnet gratuite",
    dreamTitle: "Rêves", dreamEmpty: "Aucune occasion de rêve éligible pour le moment.",
    dreamWait: minutes => `Le prochain sommeil éligible peut commencer dans ${Math.ceil(minutes)} minutes de voyage.`,
    dreamHelp: "Après 60 min de sommeil volontaire, les cartes et la proximité influencent une chance d'apprendre un indice. Une occasion au maximum par 24 h de voyage ; un échec ou un rêve vide la consomme aussi. Les rêves ordinaires respectent les mêmes limites de précision. Un évanouissement n'est pas une occasion de rêve. Expliquer est gratuit. Conseil clair nécessite une interprétation locale ou un pouvoir explicite, sans augmenter la précision acquise. Les rumeurs de carnets viennent du vrai service ; récupération et livraison restent hors de ce test.",
    abandon: "Abandonner ce test et remettre les objets en cache", confirmAbandon: "Terminer définitivement ce test et remettre les objets en cache ?",
    travelHelp: "Marchez avec les boutons ou les flèches. Le serveur calcule temps, fatigue et faim. @ : vous ; * : repère exact appris ; o : localité ; # : route ; ~ : eau (bloquée). Une case mesure 250 m.",
    credit: "Terrain et noms réels : contributeurs OpenStreetMap, ODbL. Les caches et contacts de collectionneur sont fictifs, dans le jeu uniquement.",
    state: s => `${s.name} · case ${s.col}, ${s.row} · ${s.elapsedMinutes.toFixed(1)} min · ${(s.distanceMeters / 1000).toFixed(2)} km · santé ${s.health.toFixed(1)} · fatigue ${s.fatigue.toFixed(1)} · réserve ${Math.floor(s.reserveKcal)} kcal · ${(s.walletCents / 100).toFixed(2)} €`,
    stride: e => `Pas de sept lieues : ${(e.remainingMeters / 1000).toFixed(2)} km restants ; expiration à la minute ${e.expiresMinutes.toFixed(1)} du voyage.`,
    noEffect: "Aucun effet d'objet temporaire.", busy: "En attente du serveur autoritaire…",
    ready: "État sauvegardé sur le serveur.", empty: "Aucun voyage éligible. Créez un test séparé ci-dessous.",
    none: "Aucun objet transporté pour le moment.", weight: grams => `${grams} / 5 500 g, équipement porté compris.`,
    claim: "Chercher et prendre · 10 min", cache: "Laisser une cache publique · 10 min", share: "Partager une copie d'inscription · 5 min",
    use: "Utiliser le pouvoir", confirm: "Engager cette action avec le temps et le prix affichés ?",
    cooldown: value => `Délai : encore ${Math.ceil(value)} min du monde partagé.`,
    requirements: id => id === "chariot" ? "Découverte : avoir marché 1 km." :
      id === "temperance" ? "Découverte : avoir partagé deux copies d'inscriptions distinctes." :
      id === "wheel" ? "Découverte : conserver un indice de position d'objet historique." :
      id === "sun" ? "Découverte : de jour [06:00, 20:00) UTC avec une inscription enregistrée." :
      "Aucune condition supplémentaire.",
    price: id => id === "hermit" ? "1 min + 10 fatigue. Révèle le repère exact de l'objet libre choisi, quelle que soit sa distance." :
      id === "chariot" ? "1 min + 200 kcal. Prochains 20 km : temps, fatigue de marche et effort alimentaire réduits de 75 % ; expire après 24 h de voyage." :
      id === "temperance" ? "1 min + 500 kcal. Restaure immédiatement jusqu'à 40 santé et retire jusqu'à 40 fatigue." :
      id === "fool" ? "1 min + 10 fatigue. Retour instantané avec le sac vers la localité personnellement visitée choisie sur cette carte ; aucune distance de marche ajoutée." :
      id === "wheel" ? "1 min + 10 fatigue. Rappelle dans le sac votre objet choisi resté en cache, sans voyage. Place nécessaire. Délai : 72 h du monde partagé ; celui de l'objet rappelé est conservé." :
        "1 min + 500 kcal. Santé maximale et fatigue à zéro. Ni réserve remplie ni dette de sommeil annulée. Délai : 72 h du monde partagé.",
    outcome: value => `Dernière action : ${value}.`,
    outcomes: { started: "départ", walk: "marche", rest: "repos", sleep: "sommeil", meal: "repas",
      "parent-search": "recherche du parent", "interpret-clue": "indice interprété", inquire: "demande d'indice", "inquire-clue": "demande d'indice commun", claim: "objet récupéré",
      cache: "objet déposé", share: "inscription partagée", pack: "sac réorganisé", use: "pouvoir utilisé",
      interrupted: "interrompue", abandoned: "test abandonné" },
    error: message => `Action impossible (détail technique) : ${message}`,
    parentResult: (result, minutes) => `Dernière recherche du parent (${minutes} min) : ${result}`,
    searchResults: { found: "indice trouvé.", sign: "un signe de la piste a été trouvé.", nothing: "rien trouvé ; le temps et les besoins de la tentative ont été dépensés.",
      fainted: "interrompue par un évanouissement.", placed: "interrompue par un placement.", exhausted: "interrompue par épuisement." },
    repeatedClue: "information déjà connue ; aucun nouvel indice.",
  },
};
const $ = selector => document.querySelector(selector);
let language = localStorage.getItem("arcane-lore-language") === "fr" ? "fr" : "en";
let source, client, snapshot, map, busy = false, selected, failure = "";
const sources = [];
const SOURCE_KEY = "arcane-lore-source-v1";
function copy() { return COPY[language]; }
function campActive() {
  return snapshot?.state.lore.protections?.emperor?.expiresMinutes > snapshot?.state.elapsedMinutes;
}
function campWarning() {
  return campActive() ? language === "fr" ? "Cette activité met fin au sanctuaire.\n" :
    "This activity ends the sanctuary.\n" : "";
}
const cardName = id => CARD_NAMES[language][TAROT_CARDS.indexOf(id)];
const powerDescription = id => extraPower(id) ? powerCopy(id, language).description : copy().price(id);
function add(tag, text, parent) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  parent.append(node);
  return node;
}
function button(parent, text, action, { free = false, disabled = false } = {}) {
  const node = add("button", text, parent);
  node.type = "button";
  node.disabled = busy || client?.pending() || Boolean(snapshot?.state.ended) || disabled ||
    Boolean(snapshot?.work && !["work-move", "abandon"].includes(action.type));
  node.addEventListener("click", () => {
    const warning = ["rest", "sleep"].includes(action.type) ? "" : campWarning();
    if (free && !warning || confirm(`${warning}${copy().confirm}`)) void commit(action);
  });
  return node;
}
function renderWork(parent) {
  const work = snapshot.work, box = add("section", "", parent), words = bookshopCopy(language);
  box.id = "bookshop-work";
  add("h3", words.title, box);
  add("p", words.instructions, box);
  add("p", `${words[work.status]} · ${words[work.feedback]} · ${words.mistakes}: ${work.mistakes} · ` +
    `UTC ${new Date(work.deadline).toISOString().slice(11, 19)}`, box);
  if (work.request) add("p", work.request[language], box);
  for (const book of work.books) button(box,
    `${book.title[language]} · ${words[book.genre]}${work.selected === book.id ? " ✓" : ""}`,
    { type: "work-move", move: { type: "select", bookId: book.id } }, { free: true });
  if (work.status === "sorting") for (let shelf = 0; shelf < work.shelves.length; shelf++) {
    const row = add("div", "", box);
    row.dataset.shelf = String(shelf);
    add("span", words[work.shelves[shelf]], row);
    const width = work.slots.length / work.shelves.length;
    for (let slot = 0; slot < width; slot++) {
      const placed = work.slots[shelf * width + slot];
      button(row, placed ? work.books.find(book => book.id === placed).title[language] : `${slot + 1}`,
        { type: "work-move", move: { type: "place", shelf, slot } }, { free: true, disabled: Boolean(placed) });
    }
  }
  if (work.status === "requests") button(box, words.serve,
    { type: "work-move", move: { type: "serve" } }, { free: true });
  button(box, words.cancel, { type: "work-move", move: { type: "cancel" } }, { free: true });
}
function render() {
  const c = copy();
  document.documentElement.lang = language;
  $("#language").value = language;
  for (const [id, key] of Object.entries({ title: "title", "main-game": "main", "language-label": "language",
    scope: "scope", "start-title": "startTitle", "journey-label": "journey", start: "start",
    "name-label": "name", create: "create", "state-title": "stateTitle", "artifacts-title": "artifactsTitle",
    rarity: "rarity", "bag-title": "bagTitle", "bag-help": "bagHelp", rotate: "rotate",
    "travel-help": "travelHelp", "map-credit": "credit" })) $(`#${id}`).textContent = c[key];
  $("#feedback").textContent = failure || (busy ? c.busy : snapshot ? c.ready : sources.length ? "" : c.empty);
  $("#feedback").dataset.failure = String(Boolean(failure));
  $("#start").disabled = busy || !sources.length;
  $("#create").disabled = busy;
  $("#journey").disabled = busy;
  $("#game").hidden = !snapshot;
  if (!snapshot) return;
  const s = snapshot.state;
  $("#state").textContent = `${c.state(s)} · ${snapshot.journeyUtc.replace("T", " ").slice(0, 16)} UTC`;
  const timed = Object.values(s.lore.protections ?? {}).some(effect => effect.expiresMinutes > s.elapsedMinutes) ||
    s.lore.moon || snapshot.compass;
  $("#effects").textContent = s.lore.effects ? c.stride(s.lore.effects) : timed ? "" : c.noEffect;
  const effects = $("#effects");
  for (const [id, effect] of Object.entries(s.lore.protections ?? {})) {
    if (effect.expiresMinutes <= s.elapsedMinutes) continue;
    add("p", `${cardName(id)} · ${Math.ceil(effect.expiresMinutes - s.elapsedMinutes)} min · ` +
      `${language === "fr" ? "expiration" : "expires"}: ${effect.expiresMinutes.toFixed(1)}`, effects);
    if (id === "judgement") add("p",
      `${language === "fr" ? "Carte choisie / naturelle" : "Chosen / natural card"}: ` +
      `${cardName(effect.card)} / ${cardName(effect.naturalCard)}`, effects);
  }
  if (s.lore.moon) add("p", `${cardName("moon")} · ${s.lore.moon.domains.length} ` +
    `${language === "fr" ? "indices épinglés" : "pinned clues"} · ${s.lore.moon.expiresMinutes.toFixed(1)} min`, effects);
  if (s.lore.rescueReceipts?.length) {
    const rescue = s.lore.rescueReceipts.at(-1);
    add("p", `${cardName("nameless")} · ${language === "fr" ? "Sauvegarde vitale consommée" : "Life-saving charge consumed"} · ` +
      `${rescue.observedMinutes.toFixed(1)} min · ${rescue.col}, ${rescue.row}`, effects);
  }
  if (snapshot.compass) {
    add("p", `${cardName("lovers")} · ${snapshot.compass.remainingMinutes.toFixed(1)} min · ` +
      `${snapshot.compass.direction ? translate(language, `hintCompass.${snapshot.compass.direction}`) : "—"} · ` +
      ({ warmer: language === "fr" ? "plus chaud" : "warmer",
        colder: language === "fr" ? "plus froid" : "colder",
        unchanged: language === "fr" ? "inchangé" : "unchanged",
        unavailable: language === "fr" ? "comparaison indisponible" : "comparison unavailable" }[snapshot.compass.signal] ?? ""), effects);
  } else if (s.lore.compassReceipts?.at(-1)?.signal) {
    const signal = s.lore.compassReceipts.at(-1).signal;
    add("p", `${cardName("lovers")} · ${language === "fr" ? "dernier signal" : "last signal"}: ` +
      ({ warmer: language === "fr" ? "plus chaud" : "warmer", colder: language === "fr" ? "plus froid" : "colder",
        unchanged: language === "fr" ? "inchangé" : "unchanged",
        unavailable: language === "fr" ? "indisponible" : "unavailable" }[signal]), effects);
  }
  if (snapshot.route) add("p", `${cardName("star")} · ${(snapshot.route.distanceMeters / 1000).toFixed(2)} km · ` +
    `${snapshot.route.walkingMinutes.toFixed(1)} min · ${snapshot.route.points.map(point => point.join(",")).join(" → ")}`, effects);
  const outcome = s.ended ?? s.lore.outcome;
  $("#outcome").textContent = c.outcome(c.outcomes[outcome] ?? outcome);
  $("#parent-search-result").textContent = snapshot.parentSearch
    ? c.parentResult(snapshot.parentSearch.repeated ? c.repeatedClue :
      c.searchResults[snapshot.parentSearch.outcome], snapshot.parentSearch.minutes) : "";
  const actions = $("#actions");
  actions.replaceChildren();
  const refresh = add("button", c.refresh, actions);
  refresh.disabled = busy;
  refresh.addEventListener("click", () => void load());
  const terrain = add("button", language === "fr" ? "Préparer les cases voisines · gratuit" :
    "Prepare nearby terrain · free", actions);
  terrain.disabled = busy || client.pending() || Boolean(s.ended);
  terrain.addEventListener("click", () => void work(async () => { snapshot = await client.terrain(); }));
  if (snapshot.owned.some(item => ["star", "lovers"].includes(item.id))) {
    const route = add("button", language === "fr" ? "Préparer / actualiser le chemin magique · gratuit" :
      "Prepare / refresh magical route · free", actions);
    route.disabled = busy || client.pending() || Boolean(s.ended);
    route.addEventListener("click", () => void work(async () => {
      snapshot = await client.route(snapshot.routing?.status === "error");
    }));
  }
  if (snapshot.routing) {
    const status = snapshot.routing;
    add("p", `${language === "fr" ? "Préparation" : "Preparation"}: ${status.status}` +
      (status.error ? ` · ${status.error}` : status.status === "loading"
        ? language === "fr" ? " · Patientez puis actualisez la préparation, sans coût." :
          " · Wait, then refresh preparation; no journey cost." : ""), actions);
  }
  button(actions, c.inquire, { type: "inquire" });
  button(actions, c.commonInquiry, { type: "inquire-clue" });
  button(actions, c.parent, { type: "parent-search" });
  button(actions, language === "fr" ? "Demander la direction du parent · 10 min + 2 fatigue" :
    "Ask about the parent · 10 min + 2 fatigue", { type: "parent-inquiry" });
  if (s.lore.lastTestimony) add("p", `${language === "fr" ? "Dernier témoignage" : "Last testimony"}: ` +
    s.lore.lastTestimony.outcome, actions);
  button(actions, c.rest, { type: "rest" });
  button(actions, campActive() ? language === "fr" ? "Dormir 8 h · sanctuaire jusqu'à son expiration" :
    "Sleep 8 h · sanctuary until its expiry" : c.sleep, { type: "sleep" });
  button(actions, language === "fr" ? "Archive du collectionneur · 10 min / 24 h" : "Collector archive · 10 min / 24 h",
    { type: "archive" }, { disabled: s.lore.archiveUntil > s.elapsedMinutes });
  if (snapshot.compass) button(actions, language === "fr" ? "Fermer la boussole" : "Dismiss compass", { type: "dismiss-compass" });
  if (snapshot.workOffer) button(actions,
    `${language === "fr" ? "Travailler en librairie" : "Bookshop work"} · ${snapshot.workOffer.minutes} min · ` +
    `€${(snapshot.workOffer.maxRewardCents / 100).toFixed(2)} max`, { type: "work-start", language });
  if (snapshot.work) renderWork(actions);
  if (snapshot.workResult) {
    const result = snapshot.workResult, words = bookshopCopy(language);
    add("p", `${words.title} · ${words[result.completed ? "completed" : result.cancelled ? "cancelled" : "failed"]} · ` +
      `€${(result.rewardCents / 100).toFixed(2)} · XP +${result.xpGained}`, actions);
  }
  const credit = s.lore.workCredits?.at(-1);
  if (credit) add("p", `${language === "fr" ? "Gain magique" : "Magical earnings"} · ` +
    `€${(credit.cents / 100).toFixed(2)} · ${credit.observedMinutes.toFixed(1)} min`, actions);
  const meal = snapshot.meals[0];
  if (meal) button(actions, `${c.meal} · €${(meal.cents / 100).toFixed(2)} · ${meal.reserveKcal} kcal`,
    { type: "meal" });
  const abandon = add("button", c.abandon, actions);
  abandon.disabled = busy || client.pending() || Boolean(s.ended);
  abandon.addEventListener("click", () => {
    if (confirm(c.confirmAbandon)) void commit({ type: "abandon" });
  });
  $("#movement").replaceChildren();
  for (const [label, dc, dr] of [["↑", 0, -1], ["←", -1, 0], ["↓", 0, 1], ["→", 1, 0]]) {
    button($("#movement"), label, { type: "walk", dc, dr }, { free: true });
  }
  if (map) {
    const pins = s.discovery.entries.filter(e => e.targetType === "artifact" &&
      e.kind === "location" && e.precision === "local" && e.availability === "current");
    $("#map").textContent = snapshot.viewport ? snapshot.viewport.rows.join("\n") : map.rows.map((row, y) => row.map((cell, x) => {
      if (x === s.col && y === s.row) return "@";
      if (pins.some(e => e.facts.col === x && e.facts.row === y)) return "*";
      return cell.terrain === "water" ? "~" : cell.terrain === "place" ? "o" :
        ["road", "major_road"].includes(cell.terrain) ? "#" : ".";
    }).join("")).join("\n");
    $("#map").setAttribute("aria-label", `${map.name} · ${s.col}, ${s.row}`);
  }
  $("#offers").replaceChildren();
  for (const offer of snapshot.offers) {
    const item = loreItem(offer.id);
    const box = add("section", "", $("#offers"));
    add("h3", `${item[language]} — ${cardName(item.id)}`, box);
    add("p", `${item.footprint.join(" × ")} · ${item.grams} g · ` +
      (extraPower(item.id) ? powerCopy(item.id, language).requirement : c.requirements(item.id)), box);
    if (offer.blocked) add("p", c.blocked[offer.blocked] ?? blockedCopy(offer.blocked, language), box);
    button(box, c.claim, { type: "claim", id: item.id }, { disabled: Boolean(offer.blocked) });
  }
  $("#artifacts").replaceChildren();
  add("p", `${language === "fr" ? "Inscriptions / fils narratifs" : "Inscriptions / story threads"}: ` +
    `${snapshot.mystery.inscriptions} / ${snapshot.mystery.threads} · ` +
    (language === "fr" ? "Le Monde nécessite 6 inscriptions et 3 fils." : "World requires 6 inscriptions and 3 threads."),
    $("#artifacts"));
  if (!snapshot.owned.length) add("p", c.none, $("#artifacts"));
  for (const owned of snapshot.owned) {
    const item = loreItem(owned.id), section = add("section", "", $("#artifacts"));
    section.className = "artifact";
    const image = add("img", "", section);
    image.src = `/public/tarot/${item.id}.jpg`;
    image.alt = item[language];
    add("h3", `${item[language]} — ${cardName(item.id)}`, section);
    add("p", item.inscription[language], section);
    add("p", powerDescription(item.id), section);
    if (owned.blocked) add("p", blockedCopy(owned.blocked, language), section);
    if (item.id === "justice") add("p",
      `${language === "fr" ? "Remboursement exact" : "Exact refund"}: €${(snapshot.refundCents / 100).toFixed(2)}`, section);
    const remaining = owned.cooldownUntil - snapshot.worldMinutes;
    if (remaining > 0) add("p", c.cooldown(remaining), section);
    const targetOptions = item.id === "hermit"
      ? snapshot.visionTargets.filter(id => id !== item.id).map(id => ({ id, label: loreItem(id)[language] }))
      : item.id === "wheel" ? snapshot.recallTargets.map(id => ({ id, label: loreItem(id)[language] }))
      : ["fool", "world"].includes(item.id) ? (item.id === "fool" ? snapshot.returnTargets : snapshot.worldTargets)
        .map(place => ({ id: place.id, label: `${place.town} · ${place.col}, ${place.row}` }))
      : item.id === "priestess" ? snapshot.truthTargets.map(target =>
        ({ id: target.id, label: target.domain === "parent-trail" ? language === "fr" ? "Parent actuel" : "Current parent" : target.label }))
      : item.id === "judgement" ? TAROT_CARDS.map(id => ({ id, label: cardName(id) }))
      : item.id === "magician" ? snapshot.earningOffers.map(offer =>
        ({ id: offer.id, label: `${offer.id} · €${(offer.maxRewardCents / 100).toFixed(2)}` })) : null;
    const select = targetOptions ? add("select", "", section) : null;
    if (select) {
      const label = {
        magician: language === "fr" ? "Offre rémunérée" : "Earning offer",
        priestess: language === "fr" ? "Vérité à révéler" : "Truth to reveal",
        judgement: language === "fr" ? "Carte du jour à choisir" : "Daily card to choose",
        world: language === "fr" ? "Localité connue où apparaître" : "Known settlement to land in",
      }[item.id];
      select.setAttribute("aria-label", item.id === "fool" ? c.destination : item.id === "wheel" ? c.recall :
        label ?? (language === "fr" ? "Objet à révéler" : "Artifact to reveal"));
      for (const { id, label } of targetOptions) {
        const option = add("option", label, select);
        option.value = id;
      }
      if (!targetOptions.length && ["fool", "wheel"].includes(item.id)) {
        add("p", item.id === "fool" ? c.noReturn : c.noRecall, section);
      }
    }
    const checks = [];
    if (item.id === "hierophant") for (const fragment of snapshot.fragments) {
      const label = add("label", "", section), check = document.createElement("input");
      check.type = "checkbox";
      check.value = fragment.id;
      checks.push(check);
      label.append(check, document.createTextNode(`${loreItem(fragment.source)[language]} · ` +
        (language === "fr" ? "verso illisible" : "unread reverse rubbing")));
    }
    const noRecovery = ["sun", "temperance"].includes(item.id) && s.health >= 100 && s.fatigue <= 0;
    if (noRecovery) add("p", c.noRecovery, section);
    const use = add("button", c.use, section);
    use.disabled = busy || client.pending() || Boolean(s.ended) || remaining > 0 ||
      noRecovery || Boolean(owned.blocked) || Boolean(snapshot.work) || Boolean(select && !select.options.length);
    use.addEventListener("click", () => {
      const targets = checks.filter(check => check.checked).map(check => check.value);
      if (item.id === "hierophant" && (!targets.length || targets.length > 3)) {
        failure = language === "fr" ? "Choisissez 1 à 3 fragments." : "Choose 1–3 fragments.";
        render();
        return;
      }
      const target = select ? `\n${select.selectedOptions[0].textContent}` : "";
      const preview = item.id === "justice" ? `\n€${(snapshot.refundCents / 100).toFixed(2)}` :
        item.id === "hierophant" ? `\n${targets.join("\n")}` : "";
      if (confirm(`${campWarning()}${powerDescription(item.id)}${target}${preview}\n${c.confirm}`)) void commit({
        type: "use", id: item.id, ...(select ? { target: select.value } : {}),
        ...(item.id === "hierophant" ? { targets } : {}),
      });
    });
    button(section, c.cache, { type: "cache", id: item.id });
  }
  for (const entry of s.discovery.entries.filter(e => e.kind === "inscription" &&
    e.targetType === "artifact" && !s.lore.shared.includes(e.targetId))) {
    button($("#artifacts"), `${c.share} · ${loreItem(entry.targetId)[language]}`,
      { type: "share", id: entry.targetId });
  }
  renderBag();
  for (const fragment of s.lore.fragments ?? []) add("p",
    `${loreItem(fragment.target)[language]} · ${fragment[language]} · ` +
    `${fragment.source === "collector" ? language === "fr" ? "Archive" : "Archive" : loreItem(fragment.source)[language]}`,
    $("#artifacts"));
  renderDiscoveryNotebook($("#journal-discovery"), s, (key, args) => translate(language, key, args),
    { authored: true, interpretationOffer: snapshot.interpretation,
      busy: busy || Boolean(client.pending()) || Boolean(s.ended),
      onInterpret: evidence => {
        const offer = snapshot.interpretation;
        if (confirm(`${campWarning()}${offer.minutes} min · €${(offer.cents / 100).toFixed(2)}\n${c.confirm}`)) {
          void commit({ type: "interpret-clue", evidence });
        }
      } });
  $("#dream-title").textContent = c.dreamTitle;
  $("#dream-help").textContent = c.dreamHelp;
  $("#dream-history").replaceChildren();
  const dreams = dreamNotebookEntries(s, language);
  const lastDream = s.lore.dreams?.episodes.at(-1);
  if (lastDream && lastDream.startedMinutes + 1440 > s.elapsedMinutes) {
    add("p", c.dreamWait(lastDream.startedMinutes + 1440 - s.elapsedMinutes), $("#dream-history"));
  }
  if (!dreams.length) add("p", c.dreamEmpty, $("#dream-history"));
  for (const receipt of [...(s.lore.moonReceipts ?? [])].reverse()) {
    const entry = add("article", "", $("#dream-history"));
    add("h3", `${cardName("moon")} · ${receipt.observedMinutes.toFixed(1)} min`, entry);
    for (const clue of receipt.clues) {
      const domain = JSON.parse(clue.evidence)[0];
      add("p", `${translate(language, `discovery.domain.${domain}`)} · ` +
        translate(language, `discovery.status.${clue.availability}`), entry);
    }
  }
  for (const dream of dreams) {
    const entry = add("article", "", $("#dream-history"));
    add("h3", dream.title, entry);
    add("p", dream.text, entry);
  }
}
function renderBag() {
  const bag = $("#bag"), c = copy();
  bag.replaceChildren();
  $("#bag-weight").textContent = c.weight(snapshot.bag.grams);
  const placements = snapshot.bag.placements;
  const active = placements.find(p => p.id === selected);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 6; x++) {
    const node = button(bag, "·", { type: "pack", id: selected, x, y, rotated: active?.rotated ?? false },
      { free: true, disabled: !active });
    node.className = "bag-cell";
    node.style.gridColumn = String(x + 1);
    node.style.gridRow = String(y + 1);
    node.setAttribute("aria-label", `${x + 1}, ${y + 1}`);
  }
  for (const p of placements) {
    const item = loreItem(p.id), size = dimensions(item, p.rotated);
    const node = add("button", `${item[language]} · ${size.width}×${size.height}`, bag);
    node.className = "bag-item";
    node.style.gridColumn = `${p.x + 1} / span ${size.width}`;
    node.style.gridRow = `${p.y + 1} / span ${size.height}`;
    node.setAttribute("aria-pressed", String(p.id === selected));
    node.disabled = busy;
    node.addEventListener("click", () => { selected = p.id; render(); });
  }
  $("#rotate").disabled = busy || client.pending() || Boolean(snapshot.state.ended) || Boolean(snapshot.work) || !active;
}
async function work(operation) {
  if (busy) return;
  busy = true;
  failure = "";
  render();
  try { await operation(); }
  catch (error) {
    console.error("Artifact playtest action failed:", error);
    failure = copy().error(error.message);
  } finally { busy = false; render(); }
}
async function load() {
  await work(async () => {
    snapshot = await client.sync();
    ({ map } = await client.map());
  });
}
async function commit(action) {
  await work(async () => { snapshot = await client.act(snapshot.revision, action); });
}
function selectSource(value) {
  source = value;
  client = createLoreClient(source, localStorage);
  snapshot = map = undefined;
  selected = undefined;
}
function discoverSources() {
  const separate = JSON.parse(localStorage.getItem(SOURCE_KEY) ?? "null");
  if (separate) sources.push(separate);
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (!key.startsWith("arcane-journey-v1:")) continue;
    const saved = JSON.parse(localStorage.getItem(key));
    const state = saved?.state;
    if (state?.serverJourney?.id && state.journalAccess && !state.journalKeeper &&
        !sources.some(source => source.id === state.serverJourney.id)) {
      sources.push({ id: state.serverJourney.id, capability: state.journalAccess, name: state.name ?? saved.region });
    }
  }
  renderSources();
}
function renderSources() {
  $("#journey").replaceChildren();
  for (const [index, value] of sources.entries()) {
    const option = add("option", value.name, $("#journey"));
    option.value = String(index);
  }
}
$("#start").addEventListener("click", () => {
  selectSource(sources[Number($("#journey").value)]);
  void load();
});
$("#create").addEventListener("click", () => void work(async () => {
  const response = await fetch("/public/map.json");
  if (!response.ok) throw new Error(`Map: HTTP ${response.status}`);
  const base = await response.json();
  const name = $("#name").value;
  const pending = pendingJournalCreation(localStorage, "lore-firmi", name);
  const record = await createServerJourney("firmi", base, name, pending.requestId,
    new AbortController().signal, fetch, pending.capability);
  const created = { id: record.state.serverJourney.id, capability: pending.capability, name: record.state.name };
  localStorage.setItem(SOURCE_KEY, JSON.stringify(created));
  finishJournalCreation(localStorage, "lore-firmi");
  sources.push(created);
  renderSources();
  $("#journey").value = String(sources.length - 1);
  selectSource(created);
  snapshot = await client.sync();
  ({ map } = await client.map());
}));
$("#language").addEventListener("change", () => {
  language = $("#language").value;
  localStorage.setItem("arcane-lore-language", language);
  render();
});
$("#rotate").addEventListener("click", () => {
  const p = snapshot.bag.placements.find(p => p.id === selected);
  if (p && (!campActive() || confirm(`${campWarning()}${copy().confirm}`))) {
    void commit({ type: "pack", id: p.id, x: p.x, y: p.y, rotated: !p.rotated });
  }
});
document.addEventListener("keydown", event => {
  if (event.defaultPrevented || event.repeat || !snapshot || busy || snapshot.state.ended || snapshot.work ||
      client.pending() || event.altKey || event.ctrlKey || event.metaKey ||
      ["INPUT", "SELECT", "TEXTAREA"].includes(event.target.tagName)) return;
  const delta = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[event.key];
  if (delta) {
    event.preventDefault();
    if (!campActive() || confirm(`${campWarning()}${copy().confirm}`)) {
      void commit({ type: "walk", dc: delta[0], dr: delta[1] });
    }
  }
});
try { discoverSources(); }
catch (error) {
  console.error("Unable to read playtest source journeys:", error);
  failure = copy().error(error.message);
}
render();
