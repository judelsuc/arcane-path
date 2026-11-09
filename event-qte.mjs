const groups = [
  ["timing", ["food", "coins", "bandage", "picnic", "dogFindsFood", "lostCoins", "tornBag", "dogStealsSnack"]],
  ["sequence", ["dogEncounter", "dogTangled", "dogChasesScent", "delay", "strain", "blisters",
    "forestBoar", "forestDogs", "headwind", "chills", "tailwind"]],
  ["observe", ["encouragement", "waterBreak", "catNap", "clearHead", "friendlyAdvice", "dogRestSpot",
    "dogMakesFriend", "dogPlays", "dogKeepsCompany", "restlessThoughts", "whiteDeer", "silentBell",
    "impossibleShadow", "repeatingStone", "stranger", "stars", "ribbon", "reflection"]],
];
export const EVENT_QTES = Object.freeze(Object.fromEntries(groups.flatMap(([type, kinds]) =>
  kinds.map(kind => [kind, type]))));

export const QTE_PROMPTS = Object.freeze({
  food: ["Catch the offered food without spilling it.", "Attrapez la nourriture offerte sans la renverser."],
  coins: ["Catch the rolling coins.", "Rattrapez les pièces qui roulent."],
  bandage: ["Hold the bandage steady while it is fastened.", "Maintenez le pansement pendant sa pose."],
  picnic: ["Catch the picnic basket as it is passed to you.", "Attrapez le panier qu'on vous tend."],
  dogFindsFood: ["Retrieve the food your dog has found.", "Récupérez la nourriture trouvée par votre chien."],
  lostCoins: ["Catch your purse before its coins scatter.", "Rattrapez votre bourse avant qu'elle se vide."],
  tornBag: ["Catch the food slipping out of your bag.", "Rattrapez la nourriture qui glisse du sac."],
  dogStealsSnack: ["Retrieve your snack before your dog takes it.", "Récupérez l'encas avant votre chien."],
  dogEncounter: ["Follow the dog's movements without startling it.", "Suivez les mouvements du chien sans l'effrayer."],
  dogTangled: ["Follow the loops to untangle the lead.", "Suivez les boucles pour démêler la longe."],
  dogChasesScent: ["Guide your dog back along its trail.", "Guidez votre chien sur le chemin du retour."],
  delay: ["Follow a clear passage around the obstruction.", "Suivez un passage autour de l'obstacle."],
  strain: ["Place your feet carefully over the uneven ground.", "Posez les pieds avec soin sur le sol irrégulier."],
  blisters: ["Adjust your footing to avoid rubbing your heel.", "Ajustez vos appuis pour protéger votre talon."],
  forestBoar: ["Sidestep into a clear passage away from the boar.", "Écartez-vous du sanglier par un passage dégagé."],
  forestDogs: ["Back away along the clear passage.", "Reculez en suivant le passage dégagé."],
  headwind: ["Follow the sheltered line through the gusts.", "Suivez la ligne abritée entre les rafales."],
  chills: ["Follow the dry stepping places out of the draught.", "Suivez les appuis secs à l'abri du courant d'air."],
  tailwind: ["Match your steps to the helpful breeze.", "Accordez vos pas à la brise favorable."],
  encouragement: ["Notice the gesture of encouragement.", "Repérez le geste d'encouragement."],
  waterBreak: ["Notice the offered cup among the travellers' gestures.", "Repérez la tasse offerte parmi les gestes."],
  catNap: ["Notice a calm detail before closing your eyes.", "Repérez un détail paisible avant de fermer les yeux."],
  clearHead: ["Focus on one detail to clear your thoughts.", "Fixez un détail pour éclaircir vos pensées."],
  friendlyAdvice: ["Notice the gesture accompanying the advice.", "Repérez le geste qui accompagne le conseil."],
  dogRestSpot: ["Notice the sheltered spot indicated by your dog.", "Repérez l'abri indiqué par votre chien."],
  dogMakesFriend: ["Notice the welcoming gesture towards your dog.", "Repérez le geste accueillant envers votre chien."],
  dogPlays: ["Follow the direction your dog invites you to play.", "Repérez la direction du jeu proposé par votre chien."],
  dogKeepsCompany: ["Notice your companion's reassuring movement.", "Repérez le mouvement rassurant de votre compagnon."],
  restlessThoughts: ["Focus on one detail instead of following the worry.", "Fixez un détail plutôt que de suivre l'inquiétude."],
  whiteDeer: ["Notice which way the white deer turns.", "Repérez de quel côté se tourne le cerf blanc."],
  silentBell: ["Notice the movement of the silent bell.", "Repérez le mouvement de la cloche silencieuse."],
  impossibleShadow: ["Notice which way the strange shadow leans.", "Repérez de quel côté penche l'ombre étrange."],
  repeatingStone: ["Notice the repeated line on the stone.", "Repérez la ligne répétée sur la pierre."],
  stranger: ["Notice the stranger's parting gesture.", "Repérez le geste d'adieu de l'inconnu."],
  stars: ["Follow the direction of a fleeting light.", "Repérez la direction d'une lumière fugitive."],
  ribbon: ["Notice which way the ribbon flutters.", "Repérez de quel côté flotte le ruban."],
  reflection: ["Notice the movement in the reflection.", "Repérez le mouvement dans le reflet."],
});

export const QTE_KEYS = Object.freeze(["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"]);
export const QTE_DURATION_MS = 6000;

export function eventChallenge(event, mode = "normal") {
  if (!event || !Object.hasOwn(EVENT_QTES, event.kind) || !["normal", "relaxed"].includes(mode) ||
      !Number.isSafeInteger(event.id) || event.id < 1 ||
      !Number.isSafeInteger(event.opportunity) || event.opportunity < 1) throw new Error("Invalid event challenge.");
  let seed = 2166136261;
  for (const char of `${event.kind}:${event.id}:${event.opportunity}`) {
    seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  }
  const type = EVENT_QTES[event.kind] === "timing" && mode === "relaxed" ? "observe" : EVENT_QTES[event.kind];
  return { type, mode, durationMs: mode === "relaxed" ? null : QTE_DURATION_MS,
    keys: Array.from({ length: type === "sequence" ? 3 : 1 }, (_, index) => QTE_KEYS[(seed >>> (index * 4)) % 4]) };
}

export function challengeOutcome(event, mode, trace, elapsedMs, skipped = false) {
  const challenge = eventChallenge(event, mode);
  if (!Array.isArray(trace) || trace.length > 3 || !Number.isFinite(elapsedMs) || elapsedMs < 0 ||
      elapsedMs > 86400000 || typeof skipped !== "boolean" ||
      trace.some((input, index) => !input || Object.keys(input).sort().join() !== "atMs,key" ||
        !["Space", ...QTE_KEYS].includes(input.key) || !Number.isFinite(input.atMs) ||
        input.atMs < 0 || input.atMs > elapsedMs || index > 0 && input.atMs < trace[index - 1].atMs)) {
    throw new Error("Invalid event challenge inputs.");
  }
  if (skipped) return "skipped";
  if (challenge.durationMs !== null && elapsedMs >= challenge.durationMs) return "failure";
  if (challenge.type === "timing") {
    const position = (trace[0]?.atMs ?? 0) % 2000 / 2000;
    return trace.length === 1 && trace[0].key === "Space" && position >= 0.35 && position <= 0.65
      ? "success" : "failure";
  }
  return trace.length === challenge.keys.length && trace.every((input, index) => input.key === challenge.keys[index])
    ? "success" : "failure";
}

export function validateEventChallenge(event) {
  const qte = event.qte;
  if (!qte || qte.version !== 1 || !["ready", "active", "success", "failure", "skipped"].includes(qte.status)) {
    throw new Error("Invalid saved event challenge.");
  }
  const expected = ["version", "status", ...(qte.status !== "ready" ? ["mode"] : []),
    ...(["success", "failure", "skipped"].includes(qte.status) ? ["trace", "elapsedMs"] : [])].sort().join();
  if (Object.keys(qte).sort().join() !== expected) throw new Error("Invalid saved event challenge fields.");
  eventChallenge(event, qte.mode ?? "normal");
  if (["success", "failure", "skipped"].includes(qte.status) &&
      challengeOutcome(event, qte.mode, qte.trace, qte.elapsedMs, qte.status === "skipped") !== qte.status) {
    throw new Error("Invalid saved event challenge result.");
  }
}
