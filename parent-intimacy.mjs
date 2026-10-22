import profiles from "./public/parent-intimacy.json" with { type: "json" };

export const PARENT_INTIMACY_VERSION = 1;
export const PARENT_PROFILES = Object.freeze(profiles);

export function parentIntimacy(state) {
  const intimacy = state.trail?.story?.intimacy;
  return intimacy ? PARENT_PROFILES[intimacy.card] : null;
}

export function intimacyPhase(stage) {
  return stage < 3 ? 0 : stage < 7 ? 1 : 2;
}

export function intimateBiography(state, language) {
  const profile = parentIntimacy(state);
  if (!profile) return null;
  const parent = state.trail.parentName, desire = profile.desire[language], memory = profile.memory[language];
  const object = profile.object[language];
  return language === "fr"
    ? `Vous connaissez ${parent} dans les gestes de la maison, bien avant de connaître les routes. Il y avait ${memory}. Ce souvenir vous appartient à tous les deux.\n\nVotre parent voulait ${desire}. Une cartomancienne de passage a présenté une lame, puis demandé un objet personnel auquel elle faisait penser : ${object}. Un pouvoir s'est manifesté un instant. La cartomancienne a ensuite caché l'objet ; pour le retrouver, disait-elle, il fallait le mériter. ${parent} pensait ne partir que quelques jours et revenir pour vous. Mais chaque nouvelle piste a repoussé le retour.\n\nAu départ, il vous reste une lettre de ${parent}. Vous prenez la route pour retrouver votre parent, pas pour mériter un objet à votre tour. Votre propre carte de naissance vous accompagne ; elle ne désigne ni la lame reçue par ${parent}, ni une destination.`
    : `You knew ${parent} through the small routines of home long before you knew the roads. There was ${memory}. That memory belongs to both of you.\n\nYour parent wanted ${desire}. A travelling cartomancer presented a tarot card, then asked for a personal object it brought to mind: ${object}. A power briefly appeared. The cartomancer then hid the object; to recover it, she said, one had to deserve it. ${parent} expected to leave for only a few days and return to you. But each new lead postponed coming home.\n\nAt the beginning, you have a letter left by ${parent}. You set out to find your parent, not to earn an object yourself. Your own birth card travels with you; it identifies neither the card ${parent} received nor a destination.`;
}

export function parentWordingKey(evidence) {
  return evidence.type === "witness" ? `witness:${evidence.stage}` :
    `riddle:${evidence.stage}:${evidence.kind}:${evidence.precision}:${evidence.col}:${evidence.row}`;
}

export function savedParentWording(state, evidence, language) {
  return state.parentWording?.find(entry => entry.key === parentWordingKey(evidence))?.text[language];
}

export function intimateWitness(state, stage, t) {
  const profile = parentIntimacy(state);
  if (!profile) return "";
  const language = t("languageCode");
  return savedParentWording(state, { type: "witness", stage }, language) ??
    profile.witness[intimacyPhase(stage)][language];
}

export function earnedParentEvidence(state) {
  if (!parentIntimacy(state)) return [];
  return [
    ...state.trail.history.flatMap((record, stage) =>
      ["discuss", "buy"].includes(record.clueKind) ? [{ type: "witness", stage }] : []),
    ...(state.trail.exploration?.hints ?? []).map(({ stage, kind, precision, col, row }) =>
      ({ type: "riddle", stage, kind, precision, col, row })),
  ];
}

export function rememberParentWording(state, evidence, text) {
  const key = parentWordingKey(evidence);
  if (!earnedParentEvidence(state).some(item => parentWordingKey(item) === key)) {
    throw new Error("This parent evidence has not been earned.");
  }
  const next = { ...state, parentWording: [...(state.parentWording ?? []).filter(item => item.key !== key), { key, text }] };
  validateParentWording(next);
  return next;
}

export function validateParentWording(state) {
  if (state?.parentWording === undefined) return;
  const earned = new Set(earnedParentEvidence(state).map(parentWordingKey));
  if (!Array.isArray(state.parentWording) || state.parentWording.length > 200 ||
      new Set(state.parentWording.map(entry => entry?.key)).size !== state.parentWording.length ||
      state.parentWording.some(entry => !entry || !earned.has(entry.key) ||
        !entry.text || Object.keys(entry.text).length !== 2 ||
        !["fr", "en"].every(language => typeof entry.text[language] === "string" &&
          entry.text[language].length >= 5 && entry.text[language].length <= 400 &&
          !/[<>\u0000-\u001f]/.test(entry.text[language])))) throw new Error("Invalid parent evidence wording.");
}
