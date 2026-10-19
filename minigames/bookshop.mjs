// Standalone, in-memory game. Callers must gate entry with available(currentCell).
// Clocks use monotonic milliseconds. States are opaque, frozen and not save data.
// Only completed && !cancelled results are eligible for host-managed rewards;
// difficulty(level).rewardMultiplier is metadata, not an economy transaction.
import { resolveResonance, resonanceResult } from "../arcane-resonance.mjs";

const states = new WeakSet();
const genres = ["voyages", "nature", "mystery", "poetry"];
const titles = [
  ["Le Tour du monde en quatre-vingts jours", "Around the World in Eighty Days", "Jules Verne",
    "Un pari, des escales et un départ autour du globe.", "A wager, faraway stops and a race around the globe."],
  ["L’Île au trésor", "Treasure Island", "Robert Louis Stevenson",
    "Une carte, une goélette et des pirates à l’horizon.", "A map, a schooner and pirates on the horizon."],
  ["Les Voyages de Gulliver", "Gulliver’s Travels", "Jonathan Swift",
    "Des traversées vers des contrées aux habitants extraordinaires.", "Sea crossings to lands with extraordinary inhabitants."],
  ["L’Odyssée", "The Odyssey", "Homère / Homer",
    "Une longue traversée maritime pour retrouver Ithaque.", "A long sea voyage home to Ithaca."],
  ["Le Livre de la jungle", "The Jungle Book", "Rudyard Kipling",
    "Mowgli grandit parmi les loups, les ours et les panthères.", "Mowgli grows up among wolves, bears and panthers."],
  ["L’Appel de la forêt", "The Call of the Wild", "Jack London",
    "Buck découvre la neige et la vie sauvage du Grand Nord.", "Buck discovers snow and the wild life of the far North."],
  ["Le Jardin secret", "The Secret Garden", "Frances Hodgson Burnett",
    "Derrière un mur, des enfants redonnent vie à un jardin.", "Behind a wall, children bring a garden back to life."],
  ["Walden ou la Vie dans les bois", "Walden", "Henry David Thoreau",
    "Une cabane au bord d’un étang, au rythme des saisons.", "A cabin beside a pond, living with the seasons."],
  ["Les Aventures de Sherlock Holmes", "The Adventures of Sherlock Holmes", "Arthur Conan Doyle",
    "À Baker Street, un détective rassemble des indices.", "At Baker Street, a detective pieces together clues."],
  ["Le Chien des Baskerville", "The Hound of the Baskervilles", "Arthur Conan Doyle",
    "Une lande, une famille menacée et un chien énigmatique.", "A moor, a threatened family and an enigmatic hound."],
  ["La Pierre de lune", "The Moonstone", "Wilkie Collins",
    "Un diamant disparaît ; plusieurs témoins livrent leur récit.", "A diamond vanishes; several witnesses tell their stories."],
  ["Double Assassinat dans la rue Morgue", "The Murders in the Rue Morgue", "Edgar Allan Poe",
    "Dupin cherche à expliquer un crime dans une chambre fermée.", "Dupin investigates a crime in a locked room."],
  ["Les Fleurs du mal", "The Flowers of Evil", "Charles Baudelaire",
    "Beauté, spleen et idéal se répondent en images et en rythmes.", "Beauty, melancholy and ideals meet in imagery and rhythm."],
  ["Feuilles d’herbe", "Leaves of Grass", "Walt Whitman",
    "Une voix libre célèbre le corps et la foule dans de longs vers.", "A free voice celebrates bodies and crowds in long lines of verse."],
  ["Les Contemplations", "The Contemplations", "Victor Hugo",
    "Des vers intimes sur le souvenir, l’amour et le deuil.", "Intimate verse about memory, love and grief."],
  ["Fables", "Fables", "Jean de La Fontaine",
    "Cigale, fourmi, corbeau et renard portent des leçons en vers.", "A grasshopper, ant, crow and fox carry lessons in verse."],
];
// Original clues and summaries, not quotations from the books or publisher copy.
const clues = [
  ["Je voudrais suivre Phileas Fogg dans son pari autour du monde.", "I'd like to follow Phileas Fogg on his wager around the world."],
  ["Je cherche Jim Hawkins, des pirates et leur trésor.", "I'm looking for Jim Hawkins, pirates and their treasure."],
  ["Je veux découvrir les terres des petits habitants de Lilliput.", "I'd like to discover the land of the tiny people of Lilliput."],
  ["Le retour d’Ulysse vers Ithaque, s’il vous plaît.", "The return of Odysseus to Ithaca, please."],
  ["L’histoire de Mowgli et de Baloo, s’il vous plaît.", "The story of Mowgli and Baloo, please."],
  ["Je cherche Buck, le chien qui rejoint la vie sauvage.", "I'm looking for Buck, the dog drawn to the wild."],
  ["Je voudrais le jardin caché que Mary fait revivre.", "I'd like the hidden garden that Mary brings back to life."],
  ["La cabane de Thoreau près de son étang m’intéresse.", "I'm interested in Thoreau's cabin beside his pond."],
  ["Les enquêtes de Holmes racontées par Watson, pas le chien de la lande.", "Holmes's cases told by Watson, not the hound on the moor."],
  ["Le chien inquiétant et la famille Baskerville, s’il vous plaît.", "The frightening hound and the Baskerville family, please."],
  ["Le diamant volé dans le roman de Wilkie Collins.", "The stolen diamond in Wilkie Collins's novel."],
  ["Je cherche l’enquête de Dupin dans la rue Morgue.", "I'm looking for Dupin's investigation in the Rue Morgue."],
  ["Le recueil de Baudelaire, entre spleen et idéal.", "Baudelaire's collection, between melancholy and ideals."],
  ["Les longs vers libres de Walt Whitman, s’il vous plaît.", "Walt Whitman's long lines of free verse, please."],
  ["Les souvenirs et le deuil dans le recueil de Victor Hugo.", "Memories and grief in Victor Hugo's collection."],
  ["La cigale, la fourmi et les leçons de La Fontaine.", "The grasshopper, the ant and La Fontaine's lessons."],
];

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

const catalogue = freeze(titles.map(([fr, en, author, summaryFr, summaryEn], index) => ({
  id: `book-${index + 1}`, genre: genres[Math.floor(index / 4)],
  author, title: { fr, en }, summary: { fr: summaryFr, en: summaryEn },
  request: { fr: clues[index][0], en: clues[index][1] },
})));
const settings = freeze([
  { shelves: 2, slots: 2, requests: 2, durationMs: 120000, mistakeLimit: 5, rewardMultiplier: 1 },
  { shelves: 2, slots: 3, requests: 3, durationMs: 140000, mistakeLimit: 5, rewardMultiplier: 1.25 },
  { shelves: 3, slots: 3, requests: 4, durationMs: 160000, mistakeLimit: 4, rewardMultiplier: 1.5 },
  { shelves: 4, slots: 3, requests: 5, durationMs: 180000, mistakeLimit: 4, rewardMultiplier: 1.8 },
  { shelves: 4, slots: 4, requests: 6, durationMs: 200000, mistakeLimit: 3, rewardMultiplier: 2.2 },
]);

/** Only POIs on the supplied current cell; no town-wide/remote lookup. */
export function available(cell) {
  if (!cell || cell.unavailable || !Array.isArray(cell.pois)) return false;
  return cell.pois.some(poi => {
    if (!poi || typeof poi !== "object" || !/^(node|way|relation)\/[1-9]\d*$/.test(poi.osmId)) return false;
    const tags = poi.tags;
    if (!tags || (tags.shop !== "books" && tags.amenity !== "library")) return false;
    if (poi.active === false || poi.closed === true || poi.unavailable) return false;
    if (tags.access && !["yes", "public", "permissive", "customers"].includes(tags.access)) return false;
    if (tags.library && ["private", "school", "university", "research"].includes(tags.library)) return false;
    return !["disused", "abandoned", "demolished", "destroyed", "removed", "construction", "proposed", "closed"]
      .some(key => tags[key] && tags[key] !== "no");
  });
}

export function difficulty(level) {
  if (!Number.isInteger(level) || level < 0 || level > 4) throw new RangeError("Level must be 0–4.");
  return settings[level];
}

function time(now, previous = 0) {
  if (!Number.isFinite(now) || now < previous || now > Number.MAX_SAFE_INTEGER)
    throw new RangeError("Expected a finite, nonnegative, monotonic clock.");
}

function check(game) {
  if (!game || !states.has(game)) throw new TypeError("Expected an original bookshop state.");
}

function state(value) {
  freeze(value);
  states.add(value);
  return value;
}

function shuffle(items, random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const roll = random();
    if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new RangeError("Random must return [0, 1).");
    const j = Math.floor(roll * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function createGame({ level = 0, language = "fr", random = Math.random, now = 0, ...options } = {}) {
  const resonance = resolveResonance("bookshop", options);
  const config = difficulty(level);
  if (!["fr", "en"].includes(language)) throw new RangeError("Language must be fr or en.");
  time(now);
  if (typeof random !== "function") throw new TypeError("Random must be a function.");
  if (now > Number.MAX_SAFE_INTEGER - config.durationMs) throw new RangeError("Clock overflow.");
  const books = catalogue.filter((book, index) => genres.indexOf(book.genre) < config.shelves && index % 4 < config.slots);
  const requests = shuffle(books, random).slice(0, config.requests)
    .map(book => ({ bookId: book.id, text: book.request }));
  if (resonance) requests[0] = {
    acceptedBookIds: ["book-1", "book-2"],
    text: {
      fr: "J’ai besoin de m’évader loin du quotidien : un départ vers des escales lointaines ou une aventure de pirates me ferait du bien.",
      en: "I need an escape from everyday life: a journey to faraway stops or a pirate adventure would lift my spirits.",
    },
    reactions: {
      "book-1": { fr: "Ce pari autour du globe m’offre les escales et l’évasion dont j’avais besoin. Merci !", en: "This wager around the globe gives me the faraway stops and escape I needed. Thank you!" },
      "book-2": { fr: "Cette aventure de pirates m’emporte loin du quotidien. C’est exactement mon envie, merci !", en: "This pirate adventure takes me far from everyday life. Just the escape I wanted, thank you!" },
    },
  };
  return state({
    level, language, resonance, reaction: null, config, books: shuffle(books, random), shelves: genres.slice(0, config.shelves),
    slots: Array(config.shelves * config.slots).fill(null), requests, requestIndex: 0,
    selected: null, status: "sorting", score: 0, maxScore: books.length + requests.length,
    mistakes: 0, feedback: "ready", startedAt: now, lastNow: now, deadline: now + config.durationMs,
  });
}

function terminal(game) {
  return !["sorting", "requests"].includes(game.status);
}

export function advance(game, now) {
  check(game);
  time(now, game.lastNow);
  if (terminal(game)) return game;
  if (now >= game.deadline) return state({ ...game, lastNow: now, status: "failed", feedback: "timeout" });
  return now === game.lastNow ? game : state({ ...game, lastNow: now });
}

function mistake(game, feedback) {
  const mistakes = game.mistakes + 1;
  return state({ ...game, mistakes, feedback,
    status: mistakes >= game.config.mistakeLimit ? "failed" : game.status });
}

/**
 * Actions: select {bookId}, place {shelf,slot} (zero-based), serve, cancel.
 * Invalid API inputs throw without mutation; legal but incorrect moves consume a mistake.
 */
export function input(game, action, now) {
  check(game);
  if (!action || !["select", "place", "serve", "cancel"].includes(action.type)) throw new TypeError("Invalid action.");
  if (action.type === "select" && !game.books.some(book => book.id === action.bookId)) throw new RangeError("Unknown book.");
  if (action.type === "place" && (!Number.isInteger(action.shelf) || !Number.isInteger(action.slot) ||
      action.shelf < 0 || action.shelf >= game.config.shelves || action.slot < 0 || action.slot >= game.config.slots))
    throw new RangeError("Invalid shelf position.");
  time(now, game.lastNow);
  if (!terminal(game) && action.type === "cancel")
    return state({ ...game, lastNow: now, status: "cancelled", feedback: "cancelled" });
  const next = advance(game, now);
  if (terminal(next)) return next;
  if (action.type === "select") return state({ ...next, selected: action.bookId, feedback: "selected" });
  if (!next.selected) return mistake(next, "chooseBook");
  if (action.type === "place") {
    if (next.status !== "sorting") return mistake(next, "serveInstead");
    const book = next.books.find(book => book.id === next.selected);
    const position = action.shelf * next.config.slots + action.slot;
    if (next.slots.includes(book.id)) return mistake(next, "alreadyPlaced");
    const alphabetical = next.books.filter(item => item.genre === book.genre)
      .sort((a, b) => a.title[next.language].localeCompare(b.title[next.language], next.language, {
        sensitivity: "base", ignorePunctuation: true,
      }));
    if (next.slots[position] || book.genre !== next.shelves[action.shelf] || alphabetical[action.slot].id !== book.id)
      return mistake(next, "wrongSlot");
    const slots = [...next.slots];
    slots[position] = book.id;
    return state({ ...next, slots, selected: null, score: next.score + 1,
      status: slots.every(Boolean) ? "requests" : "sorting",
      feedback: slots.every(Boolean) ? "shelvesReady" : "placed" });
  }
  if (next.status !== "requests") return mistake(next, "sortFirst");
  const request = next.requests[next.requestIndex];
  if (!(request.acceptedBookIds ?? [request.bookId]).includes(next.selected)) return mistake(next, "wrongRequest");
  const requestIndex = next.requestIndex + 1;
  return state({ ...next, selected: null, requestIndex, score: next.score + 1,
    reaction: request.reactions?.[next.selected] ?? null,
    status: requestIndex === next.requests.length ? "completed" : "requests", feedback: "served" });
}

export function result(game) {
  check(game);
  return freeze(resonanceResult({
    completed: game.status === "completed", score: ["failed", "cancelled"].includes(game.status) ? 0 : game.score,
    maxScore: game.maxScore, cancelled: game.status === "cancelled",
  }, game.resonance));
}
