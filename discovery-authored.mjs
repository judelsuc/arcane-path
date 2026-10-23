import { discoveryIdentity } from "./discovery.mjs";
import { plainGuidancePermitted } from "./discovery-interpretation.mjs";
import { loreItem } from "./lore-catalogue.mjs";
import { powerCopy, extraPower } from "./lore-copy.mjs";

const COPY = {
  en: {
    explain: "Explain", plain: "Plain guidance", dreams: "Dreams",
    interpret: "Ask a knowledgeable local to interpret",
    interpretationPrice: "{minutes} min · €{price}",
    interpretationStatus: {
      outside: "Plain guidance is locked. Seek a knowledgeable local in a named settlement, or an explicit revealing power.",
      ended: "This journey has ended; new interpretations are unavailable.",
      refused: "No knowledgeable local will help under today's conditions here. Reputation, cards, cleanliness and fatigue matter.",
      unaffordable: "A local can help, but you cannot afford the displayed price.",
      free: "A knowledgeable local offers an interpretation without a fee.",
      paid: "A knowledgeable local offers an interpretation for the displayed fee.",
    },
    interpretation: "This image refers only to the information below. It does not name a more precise destination.",
    artifact: {
      region: "The trail of {artifact} reaches {region}. Explore that region for a town-level clue.",
      town: "Look for {artifact} in {place}. This clue identifies the town, not its marker.",
      marker: "In {place}, seek the fictional marker: {marker}. Approach it for an exact search clue.",
      local: "Search for {artifact} at cell {col}, {row}, by {marker} in {place}. {condition}",
    },
    markers: { hermit: "the thimble sign", chariot: "the red-lace sign", temperance: "the pierced-stopper sign",
      fool: "the unfinished-hem sign", wheel: "the empty-bobbin sign", sun: "the yellow-cloth sign" },
    cache: "a player-deposited virtual cache",
    conditions: { hermit: "No additional discovery prerequisite.",
      chariot: "You must have walked at least 1 km.",
      temperance: "You must have shared two distinct earned inscription copies.",
      fool: "No additional discovery prerequisite.",
      wheel: "Keep a historical location clue from an earlier artifact placement.",
      sun: "Search during day [06:00, 20:00) UTC, with at least one artifact inscription recorded." },
    journal: "A journal concerning {parent} was seen within 200 m of where this clue was received. This is a past observation, not a current map pin. Pickup and delivery are available only in the main journal feature, not this test.",
    journalOrigin: "Your observation cell was {col}, {row}; these are not the journal's coordinates.",
    readings: {
      region: "The message names a broad region, not a town or exact hiding place.",
      town: "The name is a town to investigate, not an exact search location.",
      marker: "The sign is fictional in-game scenery within the named town, not a verified real-world landmark.",
      local: "The numbers identify an earned in-game cell. They are not real-world coordinates.",
      parent: "The quoted fragment belongs to your current parent investigation, not a later stage.",
      journal: "The unfinished book refers to a nearby-journal report, not access to its private contents.",
    },
    verses: {
      artifact: [
        "The map has a missing page. On its torn edge, one message remains: “{focus}”",
        "An ordinary thing casts a longer shadow than it should. Inside that shadow: “{focus}”",
        "Someone folded this message until only its useful words survived: “{focus}”",
        "Beneath a drawing with no author, a small line refuses to fade: “{focus}”",
        "The words appear where the paper should be blank: “{focus}”",
        "A thread runs through the margin and stops at this message: “{focus}”",
      ],
      parent: [
        "The trail has swallowed the rest of the sentence. What remains says: “{focus}”",
        "A familiar absence leaves a message between two lines: “{focus}”",
        "Not an answer, but a piece that fits the missing page: “{focus}”",
        "Someone has crossed out everything except this: “{focus}”",
        "The handwriting breaks off, leaving one usable fragment: “{focus}”",
        "A page turns in a wind you cannot feel. Its last line reads: “{focus}”",
      ],
      journal: [
        "A book without its traveller still has a path to follow: “{focus}”",
        "A stranger's unfinished page brushes against your own story: “{focus}”",
        "Between two journeys, a loose sheet carries this message: “{focus}”",
        "A closed cover cannot keep all its secrets: “{focus}”",
        "Another person's words have not reached their reader: “{focus}”",
        "One journey pauses while another passes nearby: “{focus}”",
      ],
    },
    dream: "In your sleep, {birth} meets {day}. {verse}",
    motifLabel: "Birth-card image: {birth}. Day-card image: {day}.",
    time: "Sleep {start}–{end} journey minutes",
    outcomes: {
      clue: "A dream left a new clue in the shared notebook below.",
      miss: "Images faded on waking. No new clue was learned; this opportunity is settled.",
      empty: "No new eligible clue could enter this dream. Its images are atmosphere, not evidence.",
      interrupted: "Sleep was interrupted. The fragments are not a new clue.",
      unavailable: "The dream concerns information whose availability changed. Treat it as an uncertain past observation.",
      historical: "This dream is retained as history. Its old clue is not a promise about the current target.",
    },
    motifs: ["an open road", "a hand of possibilities", "hidden writing", "a growing garden",
      "a shelter of stone", "an old promise", "two entwined threads", "a moving wheel",
      "a balanced scale", "a solitary light", "a turning circle", "a quiet strength",
      "an upside-down reflection", "a changing threshold", "water passing between cups",
      "a tangled cord", "a broken outline", "a distant light", "a silver reflection",
      "a warm dawn", "a returning voice", "a circle of paths"],
  },
  fr: {
    explain: "Expliquer", plain: "Conseil clair", dreams: "Rêves",
    interpret: "Demander l'interprétation à une personne avertie",
    interpretationPrice: "{minutes} min · €{price}",
    interpretationStatus: {
      outside: "Conseil clair verrouillé. Cherchez une personne avertie dans une localité nommée, ou un pouvoir de révélation explicite.",
      ended: "Ce voyage est terminé ; les nouvelles interprétations sont indisponibles.",
      refused: "Personne d'averti ne vous aide ici dans les conditions du jour. Réputation, cartes, propreté et fatigue comptent.",
      unaffordable: "Une personne peut aider, mais vous ne pouvez pas payer le prix affiché.",
      free: "Une personne avertie propose une interprétation sans frais.",
      paid: "Une personne avertie propose une interprétation au prix affiché.",
    },
    interpretation: "Cette image renvoie uniquement aux informations ci-dessous. Elle ne désigne pas une destination plus précise.",
    artifact: {
      region: "La piste de {artifact} rejoint {region}. Explorez cette région pour obtenir un indice de localité.",
      town: "Cherchez {artifact} à {place}. Cet indice désigne la localité, pas son repère.",
      marker: "À {place}, cherchez le repère fictif : {marker}. Approchez pour obtenir un indice de recherche exact.",
      local: "Cherchez {artifact} à la case {col}, {row}, près de {marker}, à {place}. {condition}",
    },
    markers: { hermit: "l'enseigne du dé à coudre", chariot: "l'enseigne du lacet rouge",
      temperance: "l'enseigne du bouchon percé", fool: "l'enseigne de l'ourlet inachevé",
      wheel: "l'enseigne de la bobine vide", sun: "l'enseigne du tissu jaune" },
    cache: "une cache virtuelle déposée par un joueur",
    conditions: { hermit: "Aucune condition supplémentaire de découverte.",
      chariot: "Vous devez avoir marché au moins 1 km.",
      temperance: "Vous devez avoir partagé deux copies d'inscriptions distinctes et acquises.",
      fool: "Aucune condition supplémentaire de découverte.",
      wheel: "Conservez un indice de position historique d'un ancien emplacement d'objet.",
      sun: "Cherchez de jour [06:00, 20:00) UTC avec au moins une inscription d'objet enregistrée." },
    journal: "Un carnet concernant {parent} a été aperçu à moins de 200 m de l'endroit où cet indice a été reçu. C'est une observation passée, pas un repère actuel. La récupération et la livraison restent dans la fonction carnets du jeu principal, pas dans ce test.",
    journalOrigin: "Votre case d'observation était {col}, {row} ; ce ne sont pas les coordonnées du carnet.",
    readings: {
      region: "Le message nomme une grande région, pas une localité ou une cache exacte.",
      town: "Le nom désigne une localité à explorer, pas un endroit précis où chercher.",
      marker: "L'enseigne est un décor fictif du jeu dans la localité nommée, pas un vrai monument vérifié.",
      local: "Les nombres désignent une case apprise dans le jeu. Ce ne sont pas des coordonnées réelles.",
      parent: "Le fragment cité concerne l'étape actuelle de la piste du parent, pas une étape future.",
      journal: "Le livre inachevé évoque un signalement de carnet proche, pas un accès à son contenu privé.",
    },
    verses: {
      artifact: [
        "Il manque une page à la carte. Sur le bord déchiré, un message demeure : « {focus} »",
        "Un objet ordinaire projette une ombre trop longue. Dans cette ombre : « {focus} »",
        "Quelqu'un a plié ce message jusqu'à ne garder que les mots utiles : « {focus} »",
        "Sous un dessin sans auteur, une petite ligne refuse de s'effacer : « {focus} »",
        "Les mots apparaissent là où le papier devrait être vierge : « {focus} »",
        "Un fil traverse la marge et s'arrête sur ce message : « {focus} »",
      ],
      parent: [
        "La piste a avalé la fin de la phrase. Ce qui reste dit : « {focus} »",
        "Une absence familière laisse un message entre deux lignes : « {focus} »",
        "Pas une réponse, mais une pièce de la page manquante : « {focus} »",
        "Quelqu'un a tout rayé sauf ceci : « {focus} »",
        "L'écriture s'interrompt, laissant un seul fragment utilisable : « {focus} »",
        "Une page tourne dans un vent imperceptible. Sa dernière ligne dit : « {focus} »",
      ],
      journal: [
        "Un livre sans son voyageur garde encore un chemin à suivre : « {focus} »",
        "La page inachevée d'un inconnu frôle votre histoire : « {focus} »",
        "Entre deux voyages, une feuille volante porte ce message : « {focus} »",
        "Une couverture fermée ne garde pas tous ses secrets : « {focus} »",
        "Les mots d'un autre n'ont pas encore atteint leur lecteur : « {focus} »",
        "Un voyage s'interrompt pendant qu'un autre passe à proximité : « {focus} »",
      ],
    },
    dream: "Dans votre sommeil, {birth} rencontre {day}. {verse}",
    motifLabel: "Image de naissance : {birth}. Image du jour : {day}.",
    time: "Sommeil de la minute {start} à {end} du voyage",
    outcomes: {
      clue: "Un rêve a laissé un nouvel indice dans le carnet commun ci-dessous.",
      miss: "Les images se sont effacées au réveil. Aucun nouvel indice ; cette occasion est terminée.",
      empty: "Aucun nouvel indice éligible ne pouvait entrer dans ce rêve. Ses images sont une ambiance, pas une preuve.",
      interrupted: "Le sommeil a été interrompu. Les fragments ne constituent pas un nouvel indice.",
      unavailable: "Le rêve concerne une information dont la disponibilité a changé. C'est une observation passée incertaine.",
      historical: "Ce rêve reste dans l'historique. Son ancien indice ne garantit rien sur la cible actuelle.",
    },
    motifs: ["une route ouverte", "une main pleine de possibles", "une écriture cachée", "un jardin qui pousse",
      "un abri de pierre", "une ancienne promesse", "deux fils entrelacés", "une roue en mouvement",
      "une balance en équilibre", "une lumière solitaire", "un cercle qui tourne", "une force tranquille",
      "un reflet renversé", "un seuil qui change", "de l'eau entre deux coupes",
      "une corde emmêlée", "une silhouette brisée", "une lumière lointaine", "un reflet argenté",
      "une aube chaude", "une voix qui revient", "un cercle de chemins"],
  },
};
const CARDS = ["fool", "magician", "priestess", "empress", "emperor", "hierophant", "lovers",
  "chariot", "justice", "hermit", "wheel", "strength", "hanged", "nameless", "temperance",
  "devil", "tower", "star", "moon", "sun", "judgement", "world"];
function format(text, facts) {
  if (typeof text !== "string") throw new Error("Unsupported authored clue template.");
  return text.replace(/\{(\w+)\}/g, (_, key) => {
    if (facts[key] === undefined) throw new Error(`Missing authored clue fact: ${key}`);
    return String(facts[key]);
  });
}
export function authoredCopy(locale) {
  if (!Object.hasOwn(COPY, locale)) throw new Error("Unsupported authored clue locale.");
  return COPY[locale];
}
function motifs(episode, copy) {
  const birth = copy.motifs[CARDS.indexOf(episode.birthCard)];
  const day = copy.motifs[CARDS.indexOf(episode.dailyCard)];
  if (!birth || !day) throw new Error("Unsupported dream card motif.");
  return { birth, day };
}
export function authoredHint(entry, state, t, plain, order) {
  const copy = authoredCopy(t("discovery.inscriptionLanguage"));
  if (entry.kind === "inscription") return null;
  const family = entry.targetType === "artifact" ? "artifact" :
    entry.targetType === "parent-trail" ? "parent" : "journal";
  let guidance = plain;
  let focus = plain;
  let reading = copy.readings[family];
  if (entry.targetType === "artifact" && entry.kind === "location") {
    const locale = t("discovery.inscriptionLanguage"), item = loreItem(entry.targetId);
    const marker = entry.facts.marker?.startsWith("cache:") ? copy.cache :
      copy.markers[entry.targetId] ?? `${locale === "fr" ? "repère virtuel" : "virtual sign"}: ${item[locale]}`;
    guidance = format(copy.artifact[entry.precision], { ...entry.facts, marker,
      artifact: t(`discovery.artifactName.${entry.targetId}`), condition: copy.conditions[entry.targetId] ??
        (extraPower(entry.targetId) ? powerCopy(entry.targetId, locale).requirement : "") });
    focus = [t(`discovery.artifactName.${entry.targetId}`), entry.facts.region, entry.facts.place,
      ["marker", "local"].includes(entry.precision) ? marker : null,
      entry.precision === "local" ? `${entry.facts.col}, ${entry.facts.row}` : null].filter(Boolean).join(" · ");
    reading = copy.readings[entry.precision];
  } else if (entry.targetType === "abandoned-journal" && entry.kind === "rumour") {
    guidance = format(copy.journal, entry.facts);
    if (entry.facts.observedCol !== undefined && entry.facts.observedRow !== undefined) {
      guidance += ` ${format(copy.journalOrigin, { col: entry.facts.observedCol, row: entry.facts.observedRow })}`;
    }
  }
  const variants = copy.verses[family];
  const verse = format(variants[order % variants.length], { focus });
  const episode = state.lore?.dreams?.episodes.find(episode => episode.clue === discoveryIdentity(entry) &&
    ["clue", "unavailable"].includes(episode.outcome));
  return { evocative: episode ? format(copy.dream, { ...motifs(episode, copy), verse }) : verse,
    explanation: `${reading} ${copy.interpretation}`,
    plain: plainGuidancePermitted(state, entry) ? guidance : null };
}
export function dreamNotebookEntries(state, locale) {
  const copy = authoredCopy(locale);
  return [...(state.lore?.dreams?.episodes ?? [])].reverse().map(episode => {
    if (!Object.hasOwn(copy.outcomes, episode.outcome)) throw new Error("Unsupported dream outcome.");
    const entry = state.discovery?.entries.find(entry => discoveryIdentity(entry) === episode.clue);
    const outcome = episode.outcome === "clue" && entry && entry.availability !== "current"
      ? entry.availability : episode.outcome;
    return {
      title: format(copy.time, { start: Math.round(episode.startedMinutes), end: Math.round(episode.wokeMinutes) }),
      text: `${format(copy.motifLabel, motifs(episode, copy))} ${copy.outcomes[outcome]}`,
    };
  });
}
