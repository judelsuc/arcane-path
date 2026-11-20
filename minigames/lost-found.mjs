/**
 * Local fictional lost-property puzzle; no travel, persistence or economy effects.
 * Actions: {type:"match", objectId} or {type:"cancel"}. Three mistakes or 15 seconds end a game.
 * Only engine-created immutable states are accepted; time is monotonic milliseconds.
 */
import { resolveResonance, resonanceResult } from "../arcane-resonance.mjs";

const variants = [
  ["umbrella-moon", "Parapluie bleu, poignée lune", "Blue umbrella, moon handle",
    ["Mon parapluie est bleu, avec une lune sur la poignée.", "Je cherche un parapluie bleu marqué d’une lune.", "Il protège de la pluie ; sa poignée porte une lune.", "Mon abri pliant porte le croissant de la nuit sur sa poignée.", "Ni pages ni serrure : mon abri de pluie porte un croissant, pas une étoile."],
    ["My umbrella is blue with a moon on its handle.", "I lost a blue umbrella marked with a moon.", "It keeps rain off; a moon marks its handle.", "My folding shelter bears the night’s crescent on its handle.", "Neither pages nor a lock: my rain shelter bears a crescent, not a star."]],
  ["umbrella-star", "Parapluie bleu, poignée étoile", "Blue umbrella, star handle",
    ["Mon parapluie est bleu, avec une étoile sur la poignée.", "Je cherche un parapluie bleu marqué d’une étoile.", "Il protège de la pluie ; sa poignée porte une étoile.", "Mon abri pliant porte un astre à cinq pointes sur sa poignée.", "Ni pages ni serrure : mon abri de pluie porte cinq pointes, pas un croissant."],
    ["My umbrella is blue with a star on its handle.", "I lost a blue umbrella marked with a star.", "It keeps rain off; a star marks its handle.", "My folding shelter bears a five-pointed light on its handle.", "Neither pages nor a lock: my rain shelter bears five points, not a crescent."]],
  ["notebook-leaf", "Carnet vert, couverture feuille", "Green notebook, leaf cover",
    ["Mon carnet vert a une feuille sur la couverture.", "Je cherche un carnet vert marqué d’une feuille.", "Mes notes sont sous une couverture verte ornée d’une feuille.", "Mon jardin de mots a une feuille, pas une fleur, sur sa couverture.", "Ni tissu ni métal : mes pages sont gardées par ce qui pousse sur une branche, sans pétales."],
    ["My green notebook has a leaf on its cover.", "I lost a green notebook marked with a leaf.", "My notes sit under a green cover decorated with a leaf.", "My garden of words has a leaf, not a flower, on its cover.", "Neither cloth nor metal: my pages are guarded by what grows on a branch, without petals."]],
  ["notebook-flower", "Carnet vert, couverture fleur", "Green notebook, flower cover",
    ["Mon carnet vert a une fleur sur la couverture.", "Je cherche un carnet vert marqué d’une fleur.", "Mes notes sont sous une couverture verte ornée d’une fleur.", "Mon jardin de mots a une fleur, pas une feuille, sur sa couverture.", "Ni tissu ni métal : mes pages sont gardées par des pétales, pas une simple feuille."],
    ["My green notebook has a flower on its cover.", "I lost a green notebook marked with a flower.", "My notes sit under a green cover decorated with a flower.", "My garden of words has a flower, not a leaf, on its cover.", "Neither cloth nor metal: my pages are guarded by petals, not a plain leaf."]],
  ["keys-fish", "Clés, porte-clés poisson rouge", "Keys, red fish keyring",
    ["Mes clés ont un porte-clés poisson rouge.", "Je cherche des clés avec un poisson rouge.", "Pour ouvrir ma porte, je tiens un petit poisson rouge.", "Mon trousseau porte un nageur rouge sans ailes.", "Ni pages ni couture : mon compagnon rouge de serrure a des nageoires, pas des ailes."],
    ["My keys have a red fish keyring.", "I lost keys with a little red fish.", "To open my door, I hold a little red fish.", "My keyring carries a red swimmer without wings.", "Neither pages nor stitching: my red lock companion has fins, not wings."]],
  ["keys-bird", "Clés, porte-clés oiseau rouge", "Keys, red bird keyring",
    ["Mes clés ont un porte-clés oiseau rouge.", "Je cherche des clés avec un oiseau rouge.", "Pour ouvrir ma porte, je tiens un petit oiseau rouge.", "Mon trousseau porte un voyageur rouge à plumes.", "Ni pages ni couture : mon compagnon rouge de serrure a des ailes, pas des nageoires."],
    ["My keys have a red bird keyring.", "I lost keys with a little red bird.", "To open my door, I hold a little red bird.", "My keyring carries a red feathered traveller.", "Neither pages nor stitching: my red lock companion has wings, not fins."]],
  ["pouch-square", "Pochette jaune, pièce carrée", "Yellow pouch, square patch",
    ["Ma pochette jaune a une pièce carrée.", "Je cherche une pochette jaune à pièce carrée.", "Mon petit sac jaune porte une pièce à quatre coins.", "Mon rangement de tissu soleil porte quatre angles droits.", "Ni pluie ni papier : sur mon tissu jaune, la réparation a quatre côtés égaux et quatre coins."],
    ["My yellow pouch has a square patch.", "I lost a yellow pouch with a square patch.", "My small yellow bag has a four-cornered patch.", "My sunshine cloth storage bears four right angles.", "Neither rain nor paper: on my yellow cloth, the repair has four equal sides and four corners."]],
  ["pouch-round", "Pochette jaune, pièce ronde", "Yellow pouch, round patch",
    ["Ma pochette jaune a une pièce ronde.", "Je cherche une pochette jaune à pièce ronde.", "Mon petit sac jaune porte une pièce sans coins.", "Mon rangement de tissu soleil porte un cercle cousu.", "Ni pluie ni papier : sur mon tissu jaune, la réparation tourne sans jamais former de coin."],
    ["My yellow pouch has a round patch.", "I lost a yellow pouch with a round patch.", "My small yellow bag has a patch without corners.", "My sunshine cloth storage bears a stitched circle.", "Neither rain nor paper: on my yellow cloth, the repair curves without ever forming a corner."]],
  ["scarf-stripes", "Écharpe rouge à rayures", "Red scarf with stripes",
    ["Mon écharpe rouge est rayée.", "Je cherche une écharpe rouge à rayures.", "Elle tient chaud au cou ; des rayures la traversent.", "Mon ruban de laine d'hiver porte des lignes parallèles.", "Ni pois ni fleurs : mon tour de cou tissé ne porte que des lignes bien droites."],
    ["My red scarf has stripes.", "I lost a red scarf with stripes.", "It keeps my neck warm; stripes run across it.", "My winter ribbon of wool bears parallel lines.", "Neither dots nor flowers: my woven neck-warmer carries only straight lines."]],
  ["scarf-dots", "Écharpe rouge à pois", "Red scarf with dots",
    ["Mon écharpe rouge est à pois.", "Je cherche une écharpe rouge à pois.", "Elle tient chaud au cou ; des pois la parsèment.", "Mon ruban de laine d'hiver est semé de petits ronds.", "Ni lignes ni fleurs : mon tour de cou tissé ne porte que des ronds dispersés."],
    ["My red scarf has dots.", "I lost a red scarf with dots.", "It keeps my neck warm; dots are scattered across it.", "My winter ribbon of wool is sprinkled with little circles.", "Neither lines nor flowers: my woven neck-warmer carries only scattered circles."]],
  ["bottle-cork", "Gourde bleue, bouchon de liège", "Blue flask, cork stopper",
    ["Ma gourde bleue a un bouchon de liège.", "Je cherche une gourde bleue au bouchon de liège.", "Elle porte l'eau du chemin ; du liège la ferme.", "Ma réserve d'eau bleue se ferme d'un morceau d'écorce.", "Ni métal ni visserie : ce qui scelle mon eau a poussé sur un chêne."],
    ["My blue flask has a cork stopper.", "I lost a blue flask with a cork stopper.", "It carries water for the road; cork seals it.", "My blue water keeper is closed by a piece of bark.", "Neither metal nor screw: what seals my water once grew on an oak."]],
  ["bottle-cup", "Gourde bleue, gobelet de métal", "Blue flask, metal cup",
    ["Ma gourde bleue a un gobelet de métal.", "Je cherche une gourde bleue au gobelet de métal.", "Elle porte l'eau du chemin ; un gobelet la coiffe.", "Ma réserve d'eau bleue porte un chapeau qui sert à boire.", "Ni liège ni écorce : ce qui coiffe mon eau brille et sert de petit verre."],
    ["My blue flask has a metal cup.", "I lost a blue flask with a metal cup.", "It carries water for the road; a cup tops it.", "My blue water keeper wears a hat you can drink from.", "Neither cork nor bark: what tops my water shines and serves as a little glass."]],
  ["hat-ribbon", "Chapeau de paille, ruban", "Straw hat, ribbon",
    ["Mon chapeau de paille a un ruban.", "Je cherche un chapeau de paille au ruban sombre.", "Il protège du soleil ; un ruban l'entoure.", "Mon toit de paille porte une ceinture de tissu.", "Ni plume ni fleur : mon abri de soleil est ceint d'une bande d'étoffe."],
    ["My straw hat has a ribbon.", "I lost a straw hat with a dark ribbon.", "It keeps the sun off; a ribbon circles it.", "My straw roof wears a belt of cloth.", "Neither feather nor flower: my sun shelter is girdled with a band of fabric."]],
  ["hat-feather", "Chapeau de paille, plume", "Straw hat, feather",
    ["Mon chapeau de paille porte une plume.", "Je cherche un chapeau de paille à la plume.", "Il protège du soleil ; une plume le signale.", "Mon toit de paille porte un souvenir d'oiseau.", "Ni ruban ni fleur : mon abri de soleil garde ce qu'un oiseau a laissé tomber."],
    ["My straw hat has a feather.", "I lost a straw hat with a feather.", "It keeps the sun off; a feather marks it.", "My straw roof carries a bird's keepsake.", "Neither ribbon nor flower: my sun shelter keeps what a bird let fall."]],
  ["mitten-snowflake", "Moufle de laine, flocon", "Wool mitten, snowflake",
    ["Ma moufle de laine porte un flocon.", "Je cherche une moufle de laine au flocon.", "Elle garde ma main au chaud ; un flocon la décore.", "Mon étui de laine porte l'étoile froide de l'hiver.", "Ni cœur ni pois : ma chaleur de main est brodée d'une étoile de givre."],
    ["My wool mitten has a snowflake.", "I lost a wool mitten with a snowflake.", "It keeps my hand warm; a snowflake decorates it.", "My woollen hand case bears winter's cold star.", "Neither heart nor dot: my hand-warmth is embroidered with a star of frost."]],
  ["mitten-heart", "Moufle de laine, cœur", "Wool mitten, heart",
    ["Ma moufle de laine porte un cœur.", "Je cherche une moufle de laine au cœur brodé.", "Elle garde ma main au chaud ; un cœur la décore.", "Mon étui de laine porte un petit signe d'affection.", "Ni flocon ni pois : ma chaleur de main est brodée du signe qui bat dans la poitrine."],
    ["My wool mitten has a heart.", "I lost a wool mitten with an embroidered heart.", "It keeps my hand warm; a heart decorates it.", "My woollen hand case bears a small sign of affection.", "Neither snowflake nor dot: my hand-warmth is embroidered with the sign that beats in a chest."]],
];

const states = new WeakSet();
const freeze = value => {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
function state(value) { freeze(value); states.add(value); return value; }
function validate(game) {
  if (!states.has(game)) throw new TypeError("Expected an engine-created game.");
}
function time(now, previous = 0) {
  if (!Number.isSafeInteger(now) || now < previous) throw new RangeError("Invalid or decreasing time.");
}
export function difficulty(level) {
  if (!Number.isInteger(level) || level < 0 || level > 19) throw new RangeError("Level must be 0–19.");
  return Object.freeze({ level, clueStyle: Math.floor(level * 4 / 19),
    objectCount: 4 + Math.floor(level * 4 / 19), maxMistakes: 3, timeLimitMs: 15000 + level * 1000,
    rewardMultiplier: 1 + level / 19 });
}
const open = tags => tags && !["private", "no", "customers", "permit"].includes(tags.access) &&
  !["disused", "abandoned", "demolished", "construction"].some(key =>
    tags[key] && tags[key] !== "no" || Object.keys(tags).some(name => name.startsWith(`${key}:`) && tags[name] !== "no"));
const mapped = item => item && /^(node|way|relation)\/[1-9]\d*$/.test(item.osmId) &&
  typeof item.name === "string" && item.name.trim() && open(item.tags ?? {});

/** Inspect only the supplied current, loaded cell. Never search nearby/remote cells. */
export function available(cell) {
  if (!cell || cell.unavailable || cell.loaded === false || !open(cell.tags ?? {})) return false;
  if (cell.terrain === "place" && Array.isArray(cell.settlements) &&
      cell.settlements.some(item => mapped(item))) return true;
  return Array.isArray(cell.pois) && cell.pois.some(item => mapped(item) &&
    (["library", "community_centre", "bus_station"].includes(item.tags?.amenity) ||
      item.tags?.railway === "station" || item.tags?.public_transport === "station" ||
      item.tags?.amenity === "lost_property"));
}
function shuffle(items, random) {
  const output = [...items];
  for (let i = output.length - 1; i > 0; i--) {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError("Invalid random sample.");
    const j = Math.floor(value * (i + 1));
    [output[i], output[j]] = [output[j], output[i]];
  }
  return output;
}
export function createGame({ level = 0, random = Math.random, now = 0, ...options } = {}) {
  const resonance = resolveResonance("lostfound", options);
  const settings = difficulty(level);
  time(now);
  if (typeof random !== "function") throw new TypeError("Expected a random function.");
  // Confusable pairs are kept together, but the families themselves are drawn
  // at random so repeated games differ. The resonance variant keeps the
  // umbrella pair first, whose medallion details it re-labels.
  const pairs = [];
  for (let index = 0; index < variants.length; index += 2) pairs.push([variants[index], variants[index + 1]]);
  const ordered = resonance ? [pairs[0], ...shuffle(pairs.slice(1), random)] : shuffle(pairs, random);
  const chosen = [];
  for (const family of ordered) for (const variant of family) {
    if (chosen.length < settings.objectCount) chosen.push(variant);
  }
  const objects = chosen.map(([id, fr, en]) => ({ id, label: { fr, en } }));
  const reports = shuffle(chosen, random).map(([objectId, , , fr, en]) =>
    ({ objectId, description: { fr: fr[settings.clueStyle], en: en[settings.clueStyle] } }));
  if (resonance) {
    for (const [index, object] of objects.slice(0, 2).entries()) {
      object.inspectRequired = true;
      object.label = { fr: "Parapluie bleu, médaillon lune", en: "Blue umbrella, moon medallion" };
      object.detail = index === 0
        ? { fr: "Un point gravé sous la lune.", en: "One engraved dot below the moon." }
        : { fr: "Deux points gravés sous la lune.", en: "Two engraved dots below the moon." };
      reports.find(report => report.objectId === object.id).description = index === 0
        ? { fr: "Mon parapluie bleu porte une lune et un seul point gravé en dessous.", en: "My blue umbrella has a moon and just one engraved dot below it." }
        : { fr: "Mon parapluie bleu porte une lune et deux points gravés en dessous.", en: "My blue umbrella has a moon and two engraved dots below it." };
    }
  }
  return state({ level, resonance, inspected: null, objects: shuffle(objects, random), reports, remaining: objects.map(item => item.id),
    index: 0, score: 0, mistakes: 0, status: "playing", error: null, now,
    startedAt: now, timeLimitMs: settings.timeLimitMs });
}
export function advance(game, now) {
  validate(game); time(now, game.now);
  if (game.status !== "playing" || now === game.now) return game;
  return state({ ...game, now,
    ...(now - game.startedAt >= game.timeLimitMs ? { status: "timedOut", error: "timeout" } : {}) });
}
export function input(game, action, now) {
  validate(game); time(now, game.now);
  if (!action || !["match", "inspect", "confirm", "cancel"].includes(action.type) ||
      action.type !== "cancel" && !game.remaining.includes(action.objectId)) throw new TypeError("Invalid action.");
  if (game.status !== "playing") return game;
  if (action.type === "cancel") return state({ ...game, status: "cancelled", score: 0, error: null, now });
  game = advance(game, now);
  if (game.status !== "playing") return game;
  const object = game.objects.find(item => item.id === action.objectId);
  if (action.type === "inspect") return state({ ...game, inspected: action.objectId, error: null });
  if (object.inspectRequired && (action.type !== "confirm" || game.inspected !== action.objectId)) return game;
  if (action.type === "confirm" && game.inspected !== action.objectId) return game;
  if (action.objectId !== game.reports[game.index].objectId) {
    const mistakes = game.mistakes + 1;
    return state({ ...game, mistakes, status: mistakes === 3 ? "failed" : "playing", error: "mismatch", now });
  }
  const index = game.index + 1;
  return state({ ...game, index, inspected: null, score: game.score + 1, error: null, now,
    remaining: game.remaining.filter(id => id !== action.objectId),
    status: index === game.reports.length ? "completed" : "playing" });
}
export function result(game) {
  validate(game);
  return Object.freeze(resonanceResult({ completed: game.status === "completed", score: game.score,
    maxScore: game.objects.length, cancelled: game.status === "cancelled", timedOut: game.status === "timedOut" }, game.resonance));
}
