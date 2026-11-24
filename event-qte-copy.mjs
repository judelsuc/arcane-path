import { QTE_PROMPTS } from "./event-qte.mjs";

const SOCIAL = {
  encouragement: {
    en: ["A traveller encourages you. Find the words to answer warmly.",
      "“Thank you. A few kind words make the road feel shorter.”",
      "“Have you come far yourself?”"],
    fr: ["Un voyageur vous encourage. Trouvez les mots pour lui répondre chaleureusement.",
      "« Merci. Quelques mots bienveillants rendent la route moins longue. »",
      "« Vous-même, venez-vous de loin ? »"],
  },
  friendlyAdvice: {
    en: ["A traveller shares some advice. Keep the conversation flowing.",
      "“Thank you for taking the time to tell me.”",
      "“What would you watch out for along this stretch?”"],
    fr: ["Un voyageur vous donne un conseil. Faites vivre la conversation.",
      "« Merci de prendre le temps de me prévenir. »",
      "« À quoi feriez-vous attention sur cette portion du chemin ? »"],
  },
  stranger: {
    en: ["The stranger is about to leave. Find a graceful way to exchange a few words.",
      "“Before you go, thank you for this moment.”",
      "“It is good to meet someone along the way.”"],
    fr: ["L'inconnu s'apprête à repartir. Trouvez les mots pour échanger avec tact.",
      "« Avant de repartir, merci pour ce moment. »",
      "« Il est bon de croiser quelqu'un sur le chemin. »"],
  },
  dogMakesFriend: {
    en: ["Someone greets your dog. Join the encounter without interrupting it.",
      "“It seems my companion has already introduced us.”",
      "“Thank you for such a kind welcome.”"],
    fr: ["Quelqu'un accueille votre chien. Prenez part à la rencontre sans la brusquer.",
      "« Mon compagnon semble avoir déjà fait les présentations. »",
      "« Merci de lui faire si bon accueil. »"],
  },
};

const CONTINUATION = {
  en: [
    "You listen, leaving room for the reply.",
    "“I see what you mean.”",
    "You pick up the conversation without talking over the other person.",
    "“It is a pleasure to exchange a few words on the road.”",
    "You let a comfortable silence settle.",
    "“I shall remember this meeting.”",
    "“Take care, and have a good journey.”",
  ],
  fr: [
    "Vous écoutez, en laissant à l'autre le temps de répondre.",
    "« Je vois ce que vous voulez dire. »",
    "Vous rebondissez sur l'échange sans couper la parole.",
    "« C'est un plaisir d'échanger quelques mots en chemin. »",
    "Vous laissez un silence paisible s'installer.",
    "« Je garderai un bon souvenir de cette rencontre. »",
    "« Prenez soin de vous, et bonne route. »",
  ],
};

export function eventQtePresentation(event, language) {
  const index = language === "en" ? 0 : 1;
  const conversation = SOCIAL[event.kind]?.[language];
  return {
    social: Boolean(conversation),
    action: conversation?.[0] ?? (event.kind === "coins"
      ? ["The passer-by tosses you a few coins. Try to catch them!",
        "Le passant vous lance quelques pièces. Essayez de les rattraper !"][index]
      : QTE_PROMPTS[event.kind][index]),
    lines: conversation ? [...conversation.slice(1), ...CONTINUATION[language]] : [],
  };
}

export function eventQteResult(event, language, outcome = event.qte?.status) {
  const social = Boolean(SOCIAL[event.kind]);
  const index = language === "en" ? 0 : 1;
  if (outcome === "skipped") return [
    "You let the moment pass without reacting.",
    "Vous laissez passer le moment sans réagir.",
  ][index];
  if (outcome === "success") return social ? [
    "The words come naturally. You part with a smile, leaving a warm impression.",
    "Les mots viennent avec naturel. Vous vous quittez sur un sourire, laissant une impression chaleureuse.",
  ][index] : event.kind === "coins" ? [
    "You catch the coins before they hit the ground.",
    "Vous rattrapez les pièces avant qu'elles ne touchent le sol.",
  ][index] : [
    "Your reactions follow the moment without a false move.",
    "Vos gestes accompagnent la scène sans faux mouvement.",
  ][index];
  if (outcome === "failure") return social ? [
    "You stumble over your words and interrupt at the wrong moment. An awkward silence leaves a poor impression.",
    "Vous cherchez vos mots et coupez la parole au mauvais moment. Un silence gêné s'installe : vous avez fait mauvaise impression.",
  ][index] : event.kind === "coins" ? [
    "Your hands close too late; the coins slip past your fingers.",
    "Vos mains se referment trop tard ; les pièces vous échappent.",
  ][index] : [
    "You hesitate at the wrong moment and lose the rhythm of the scene.",
    "Vous hésitez au mauvais moment et perdez le rythme de la scène.",
  ][index];
  return "";
}
