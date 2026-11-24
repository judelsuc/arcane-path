import { loreItem } from "./lore-catalogue.mjs";

const RULES = {
  magician: [
    "Complete an ordinary earning mini-game.", "Terminer un mini-jeu rémunéré ordinaire.",
    "Instant best legal success on the selected available earning offer, up to €20. Consumes that offer, not the next ordinary round; no practice XP.",
    "Réussite maximale immédiate de l'offre rémunérée disponible choisie, jusqu'à 20 €. Consomme cette offre, pas la prochaine partie ordinaire ; aucune expérience.",
  ],
  priestess: [
    "Share one inscription.", "Partager une inscription.",
    "Reveal the selected current parent destination or accessible journal's exact next search marker and solution. Contradict provably wrong reports. No movement or future stage.",
    "Révéler la destination actuelle du parent ou le prochain repère et la solution du carnet accessible choisi. Contredire les faux témoignages prouvés. Aucun déplacement ni étape future.",
  ],
  empress: [
    "Finish a normally paid settlement meal.", "Terminer un repas normalement payé en localité.",
    "Fill food reserve, then reduce ordinary food consumption by 75% for 12 h. Direct artifact prices remain full; no healing.",
    "Remplir la réserve alimentaire, puis réduire sa consommation ordinaire de 75 % pendant 12 h. Prix magiques payés intégralement ; aucun soin.",
  ],
  emperor: [
    "Remain in one locality for 30 consecutive minutes.", "Rester dans une localité 30 minutes consécutives.",
    "Sanctuary on this cell for 8 h of rest/sleep: zero vigilance, no weather or theft, best normal shelter recovery. Other activities end it; hunger remains.",
    "Sanctuaire sur cette case pendant 8 h de repos/sommeil : vigilance nulle, sans intempéries ni vol, récupération d'abri normale maximale. Toute autre activité l'arrête ; la faim demeure.",
  ],
  hierophant: [
    "Record two distinct inscriptions.", "Consigner deux inscriptions distinctes.",
    "Reconstruct 1–3 selected unread reverse-rubbing fragments after 10 exposed concentration minutes. Interruption spends activation and cooldown without revealing the bundle.",
    "Reconstituer 1 à 3 fragments illisibles choisis au verso des estampages après 10 minutes de concentration exposée. Une interruption consomme l'activation et le délai sans révéler le lot.",
  ],
  lovers: [
    "Earn parent testimony in two distinct localities.", "Obtenir des témoignages sur le parent dans deux localités distinctes.",
    "180 actual walking minutes of next-waypoint compass and warmer/colder feedback using a real traversable path. No future target or automatic completion.",
    "180 minutes de marche réelle de boussole vers le prochain point traversable et d'indications chaud/froid sur un vrai chemin. Aucune cible future ni réussite automatique.",
  ],
  justice: [
    "Finish a normally paid action and an earning activity.", "Terminer une action normalement payée et une activité rémunérée.",
    "Reclaim up to €30 of unreimbursed ordinary expenses in the preceding 24 h. Most recent first. Magical prices excluded; each cent can return only once.",
    "Récupérer jusqu'à 30 € de dépenses ordinaires non remboursées des dernières 24 h, les plus récentes d'abord. Prix magiques exclus ; chaque centime ne revient qu'une fois.",
  ],
  strength: [
    "A prior recorded faint or recoverable placement.", "Un évanouissement ou placement récupérable déjà consigné.",
    "Zero fatigue, then no ordinary fatigue gain for 3 h. Independent sleep debt, hunger, health and vigilance remain; direct magical fatigue prices remain full.",
    "Fatigue nulle, puis aucun gain ordinaire de fatigue pendant 3 h. Dette de sommeil, faim, santé et vigilance demeurent ; prix magiques de fatigue payés intégralement.",
  ],
  hanged: [
    "Search in the evening [18:00, 20:00) UTC.", "Chercher le soir [18:00, 20:00) UTC.",
    "120 minutes of personal stasis: no ordinary food loss, fatigue/vigilance gain, health damage or sleep debt. Positive recovery and world clocks continue; magical prices remain full.",
    "120 minutes de stase personnelle : aucune perte alimentaire, fatigue/vigilance, blessure ou dette de sommeil ordinaire. Récupération et temps mondial continuent ; prix magiques intacts.",
  ],
  nameless: [
    "Keep a closed or obsolete optional artifact lead.", "Conserver une piste facultative d'objet close ou obsolète.",
    "One life-saving charge for 24 h: prevent an ordinary fatal health/exhaustion outcome, restore at least 50 health and half food, fatigue ≤30 and vigilance zero; return to the last validated settlement. No resurrection or abandonment reversal.",
    "Une sauvegarde vitale pendant 24 h : empêcher une fin ordinaire par santé/épuisement, au moins 50 de santé et demi-réserve, fatigue ≤30 et vigilance nulle ; retour à la dernière localité validée. Ni résurrection ni annulation d'abandon.",
  ],
  devil: [
    "Voluntarily cache an artifact once.", "Déposer volontairement un objet dans une cache.",
    "24 h without load-derived walking penalties or ordinary equipment wear. No repairs; the 5,500 g limit and bag layout still apply.",
    "24 h sans pénalités de marche dues à la charge ni usure ordinaire. Aucune réparation ; limite de 5 500 g et rangement du sac inchangés.",
  ],
  tower: [
    "Search by day [06:00, 20:00) UTC.", "Chercher de jour [06:00, 20:00) UTC.",
    "Vigilance zero and no ordinary vigilance increase or vigilance-triggered placement for 24 h. Other needs and existing placement counts remain.",
    "Vigilance nulle et aucune hausse ordinaire ni placement dû à la vigilance pendant 24 h. Autres besoins et placements antérieurs inchangés.",
  ],
  star: [
    "Search at dawn [06:00, 08:00) UTC.", "Chercher à l'aube [06:00, 08:00) UTC.",
    "Reveal the current parent destination and prepare a real traversable route with distance/time. Prepare distant terrain privately with the free route button first. No charge on provider failure; no straight-line fallback.",
    "Révéler la destination actuelle du parent et préparer un chemin traversable avec distance/durée. Préparer gratuitement le terrain distant en privé avec le bouton d'itinéraire. Aucun coût en cas d'échec du fournisseur, ni substitut à vol d'oiseau.",
  ],
  moon: [
    "Search at night [20:00, 06:00) UTC.", "Chercher de nuit [20:00, 06:00) UTC.",
    "Activate at night. Pin up to three new clues, one per domain, for the next deliberate sleep ≥60 min begun within 24 h. Guaranteed, separate from ordinary dreams; changed targets become historical, never rerolled.",
    "Activer de nuit. Épingler jusqu'à trois nouveaux indices, un par domaine, pour le prochain sommeil volontaire ≥60 min dans les 24 h. Garantis, séparés des rêves ordinaires ; cibles modifiées conservées comme historiques, jamais relancées.",
  ],
  judgement: [
    "Finish a normal sleep segment of at least 60 minutes.", "Terminer un sommeil normal d'au moins 60 minutes.",
    "Choose any daily card's real modifiers for 24 h. Birth stays unchanged; natural daily draws continue underneath and resume at expiry.",
    "Choisir les vrais modificateurs d'une carte du jour pendant 24 h. Naissance inchangée ; tirages naturels maintenus en dessous et restaurés à l'expiration.",
  ],
  world: [
    "Record six distinct inscriptions spanning three story threads.", "Consigner six inscriptions distinctes couvrant trois fils narratifs.",
    "Teleport with belongings and companion to any different already-named validated settlement on the pinned map, even unvisited. No walking credit or intermediate stages.",
    "Téléporter bagage et compagnon dans une autre localité déjà nommée et validée sur la carte épinglée, même non visitée. Aucun crédit de marche ni étape intermédiaire.",
  ],
};

export function powerCopy(id, language) {
  const rule = RULES[id];
  if (!rule || !["en", "fr"].includes(language)) throw new Error("Missing artifact power translation.");
  const item = loreItem(id), french = language === "fr";
  const cost = [`1 min`, ...(item.kcal ? [`${item.kcal} kcal`] : []),
    ...(item.fatigue ? [`${item.fatigue} ${french ? "fatigue" : "fatigue"}`] : []),
    ...(item.cents ? [`€${(item.cents / 100).toFixed(2)}`] : [])].join(" + ");
  return { requirement: rule[french ? 1 : 0],
    description: `${cost}. ${rule[french ? 3 : 2]} ${french ? "Délai mondial" : "World cooldown"}: ${item.cooldown / 60} h.` };
}

export function extraPower(id) { return Object.hasOwn(RULES, id); }

export const CARD_NAMES = {
  en: ["Fool", "Magician", "High Priestess", "Empress", "Emperor", "Hierophant", "Lovers", "Chariot",
    "Justice", "Hermit", "Wheel", "Strength", "Hanged Man", "Nameless", "Temperance", "Devil", "Tower",
    "Star", "Moon", "Sun", "Judgement", "World"],
  fr: ["Le Mat", "Le Bateleur", "La Papesse", "L'Impératrice", "L'Empereur", "Le Pape", "L'Amoureux",
    "Le Chariot", "La Justice", "L'Hermite", "La Roue", "La Force", "Le Pendu", "Sans nom",
    "Tempérance", "Le Diable", "La Maison Dieu", "L'Étoile", "La Lune", "Le Soleil", "Le Jugement", "Le Monde"],
};

const REASONS = {
  earning: ["Complete a normal earning mini-game.", "Terminez un mini-jeu rémunéré normal."],
  "one-sharing": ["Share one earned inscription.", "Partagez une inscription acquise."],
  "paid-meal": ["Finish a normally paid meal.", "Terminez un repas normalement payé."],
  locality: ["Remain in one locality 30 consecutive minutes.", "Restez 30 minutes consécutives dans une localité."],
  "two-inscriptions": ["Record two inscriptions.", "Consignez deux inscriptions."],
  testimony: ["Earn testimony in two localities.", "Obtenez des témoignages dans deux localités."],
  "paid-earned": ["Finish a paid action and an earning activity.", "Terminez une action payée et une activité rémunérée."],
  collapse: ["Requires a prior recorded faint or recoverable placement.", "Nécessite un évanouissement ou placement récupérable antérieur consigné."],
  evening: ["Search [18:00, 20:00) UTC.", "Cherchez entre 18 h et 20 h UTC."],
  closed: ["Retain a closed optional lead.", "Conservez une piste facultative close."],
  deposit: ["Voluntarily cache an artifact first.", "Déposez d'abord volontairement un objet."],
  dawn: ["Search [06:00, 08:00) UTC.", "Cherchez entre 6 h et 8 h UTC."],
  night: ["Available only at night [20:00, 06:00) UTC.", "Disponible seulement de nuit entre 20 h et 6 h UTC."],
  sleep: ["Finish a normally settled sleep ≥60 min.", "Terminez un sommeil normal d'au moins 60 minutes."],
  threads: ["Six inscriptions spanning three story threads.", "Six inscriptions couvrant trois fils narratifs."],
  "already-active": ["This power is already active.", "Ce pouvoir est déjà actif."],
  "no-work": ["No available earning offer on this cell.", "Aucune offre rémunérée disponible sur cette case."],
  "no-truth": ["No new eligible current target.", "Aucune nouvelle cible actuelle admissible."],
  "no-fragments": ["No genuinely unread fragment behind earned sources.", "Aucun fragment inédit derrière les sources acquises."],
  "no-path": ["Prepare or refresh the real magical route with the free button. No activation charge until traversability is verified; no guessed bearing.", "Préparez ou actualisez gratuitement le vrai chemin magique. Aucun coût d'activation avant vérification du passage ; aucune direction inventée."],
  "no-refund": ["No unreimbursed eligible expense in the last 24 h.", "Aucune dépense admissible non remboursée dans les dernières 24 h."],
  "no-destination": ["No different earned named settlement on this map.", "Aucune autre localité nommée acquise sur cette carte."],
};

export function blockedCopy(reason, language) {
  const text = REASONS[reason];
  if (!text) throw new Error(`Missing artifact requirement translation: ${reason}.`);
  return text[language === "fr" ? 1 : 0];
}
