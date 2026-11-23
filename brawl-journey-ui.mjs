import { mountBrawl } from "./minigames/brawl-ui.mjs";
import { mountStreetChase } from "./minigames/street-chase-ui.mjs";
import { brawlSetup } from "./brawl-journey.mjs";

const COPY = {
  fr: {
    title: { street: "Mauvaise rencontre", camp: "Réveil brutal", pursuer: "Il vous a rattrapé" },
    intro: {
      pursuer: () => "L'homme qui vous traque depuis des jours vous tient presque. Pas de fuite possible : c'est lui ou vous.",
      street: n => n === 1 ? "Une silhouette se détache d'une porte cochère et vous barre la route."
        : `${n} silhouettes sortent de l'ombre et vous encerclent. Pas moyen de passer sans se défendre.`,
      camp: n => n === 1 ? "Un craquement vous tire du sommeil : quelqu'un fouille votre sac."
        : `Des voix, des pas autour du bivouac : ${n} rôdeurs veulent votre sac. Vous êtes à peine réveillé.`,
    },
    stakes: "Si vous perdez, ils vous dépouillent d'une partie de votre argent et vous laissent blessé — mais en vie.",
    stakesPursuer: "Si vous perdez, votre voyage s'arrête ici. Si vous gagnez, vous reprenez 30 km d'avance.",
    flee: "Fuir",
    fleeHint: "Fuir lance une course dans les rues : semez-les et vous gardez tout ; s'ils vous rattrapent, vous devrez vous battre essoufflé.",
    caught: "Ils vous ont rattrapé, à bout de souffle. Il faut se battre.",
    facts: (item, cents) => [`Niveau ${item.level}/10`, `Souffle ${item.breath}`,
      ...(item.knife ? ["Couteau en main"] : []), ...(item.dog ? ["Votre chien est là"] : []),
      `Bourse : ${(cents / 100).toFixed(2)} €`].join(" · "),
    fight: "Se défendre",
    interrupted: "Le combat a été interrompu : il compte comme perdu.",
    acknowledge: "Constater",
    result: {
      won: "Ils détalent dans la nuit. Vous gardez vos affaires.",
      escaped: "Vous leur filez entre les doigts et vous éloignez. Vous gardez vos affaires.",
      lost: (cents, health) => `Ils vous ont dépouillé : ${(cents / 100).toFixed(2)} € envolés, et vous êtes blessé (−${health} santé).`,
      fled: "Vous les avez semés dans les ruelles. Vous gardez vos affaires, un peu plus fatigué.",
      pursuerWon: "Il s'effondre. Vous détalez sans vous retourner : 30 km d'avance reprise.",
      pursuerLost: "Il ne vous lâche plus. Votre voyage s'arrête ici.",
    },
    close: "Reprendre la route",
  },
  en: {
    title: { street: "A bad encounter", camp: "Rude awakening", pursuer: "He has caught up with you" },
    intro: {
      pursuer: () => "The man who has been hunting you for days almost has you. There is no running now: it is him or you.",
      street: n => n === 1 ? "A figure steps out of a doorway and blocks your way."
        : `${n} figures come out of the shadows and surround you. There is no way past without defending yourself.`,
      camp: n => n === 1 ? "A crack wakes you: someone is going through your bag."
        : `Voices and footsteps around your camp: ${n} prowlers want your bag. You are barely awake.`,
    },
    stakes: "If you lose, they take part of your money and leave you hurt — but alive.",
    stakesPursuer: "If you lose, your journey ends here. If you win, you regain a 30 km lead.",
    flee: "Run away",
    fleeHint: "Running starts a chase through the streets: lose them and you keep everything; if they catch you, you will have to fight out of breath.",
    caught: "They caught you, out of breath. You have to fight.",
    facts: (item, cents) => [`Level ${item.level}/10`, `Breath ${item.breath}`,
      ...(item.knife ? ["Knife in hand"] : []), ...(item.dog ? ["Your dog is with you"] : []),
      `Purse: €${(cents / 100).toFixed(2)}`].join(" · "),
    fight: "Defend yourself",
    interrupted: "The fight was interrupted: it counts as lost.",
    acknowledge: "Accept",
    result: {
      won: "They run off into the night. You keep your belongings.",
      escaped: "You slip through their fingers and get away. You keep your belongings.",
      lost: (cents, health) => `They robbed you: €${(cents / 100).toFixed(2)} gone, and you are hurt (−${health} health).`,
      fled: "You lost them in the back streets. You keep your belongings, a little more tired.",
      pursuerWon: "He collapses. You run without looking back: a 30 km lead regained.",
      pursuerLost: "He will not let go. Your journey ends here.",
    },
    close: "Back on the road",
  },
};

export function setupBrawlJourney({ context, act, audio = null, doc = document }) {
  const language = () => doc.documentElement.lang === "en" ? "en" : "fr";
  const dialog = doc.createElement("dialog");
  dialog.id = "brawl-dialog";
  dialog.className = "brawl-dialog";
  dialog.setAttribute("data-native-controls", "");
  dialog.setAttribute("aria-labelledby", "brawl-title");
  const title = doc.createElement("h2"); title.id = "brawl-title";
  const intro = doc.createElement("p"), stakes = doc.createElement("p"), facts = doc.createElement("p");
  facts.className = "brawl-facts";
  const start = doc.createElement("button"); start.type = "button";
  const flee = doc.createElement("button"); flee.type = "button";
  const fleeHint = doc.createElement("p"); fleeHint.className = "brawl-facts";
  const board = doc.createElement("div"); board.className = "brawl-board";
  const result = doc.createElement("p"); result.setAttribute("role", "status");
  const close = doc.createElement("button"); close.type = "button"; close.hidden = true;
  dialog.append(title, intro, stakes, facts, fleeHint, start, flee, board, result, close);
  doc.body.append(dialog);
  let game = null, finished = false;

  function settle(transcript) {
    const before = context()?.state;
    if (!act({ type: "settle", transcript })) return;
    const record = context()?.state.brawl?.history.at(-1);
    const c = COPY[language()];
    game?.destroy(); game = null;
    board.replaceChildren();
    finished = true;
    start.hidden = true; flee.hidden = true; fleeHint.hidden = true;
    result.textContent = !record || !before ? ""
      : record.kind === "pursuer" ? c.result[record.outcome === "lost" ? "pursuerLost" : "pursuerWon"]
      : record.outcome === "lost" ? c.result.lost(record.stolenCents, record.healthLost) : c.result[record.outcome];
    close.textContent = c.close; close.hidden = false;
    close.focus();
  }

  start.addEventListener("click", () => {
    const item = context()?.state.brawl?.pending;
    if (!item) return;
    if (item.flight?.status === "active") { settleFlight({ jumps: [], ticks: 0, abandoned: true }); return; }
    if (item.status === "active") { settle({ changes: [], ticks: 0, abandoned: true }); return; }
    if (!act({ type: "begin" })) return;
    start.hidden = true; flee.hidden = true; fleeHint.hidden = true;
    void audio?.unlock?.();
    game = mountBrawl(board, brawlSetup(item), { language: language(), phase: item.phase, audio,
      onFinish({ transcript }) { queueMicrotask(() => settle(transcript)); } });
  });
  function settleFlight(transcript) {
    if (!act({ type: "flight", transcript })) return;
    game?.destroy(); game = null;
    board.replaceChildren();
    const item = context()?.state.brawl?.pending;
    if (item) {
      // Caught: the fight follows, one breath short.
      render(item);
      result.textContent = COPY[language()].caught;
      return;
    }
    const record = context()?.state.brawl?.history.at(-1);
    finished = true;
    start.hidden = true; flee.hidden = true; fleeHint.hidden = true;
    result.textContent = record?.outcome === "fled" ? COPY[language()].result.fled : "";
    close.textContent = COPY[language()].close; close.hidden = false;
    close.focus();
  }
  flee.addEventListener("click", () => {
    const item = context()?.state.brawl?.pending;
    if (!item || !act({ type: "flee" })) return;
    start.hidden = true; flee.hidden = true; fleeHint.hidden = true;
    const flight = context().state.brawl.pending.flight;
    game = mountStreetChase(board, flight, { language: language(), phase: item.phase, opponents: item.opponents,
      onFinish({ transcript }) { queueMicrotask(() => settleFlight(transcript)); } });
  });
  close.addEventListener("click", () => { finished = false; dialog.close(); update(); });
  dialog.addEventListener("cancel", event => { event.preventDefault(); });
  doc.addEventListener("visibilitychange", () => { if (doc.hidden) game?.abandon(); });

  function render(item) {
    const c = COPY[language()];
    title.textContent = c.title[item.kind];
    intro.textContent = c.intro[item.kind](item.opponents);
    stakes.textContent = item.kind === "pursuer" ? c.stakesPursuer : c.stakes;
    facts.textContent = c.facts(item, context()?.state.walletCents ?? 0);
    const interrupted = item.status === "active" || item.flight?.status === "active";
    result.textContent = interrupted ? c.interrupted : "";
    start.textContent = interrupted ? c.acknowledge : c.fight;
    const canFlee = item.kind === "street" && item.status === "ready" && item.flight === null;
    flee.textContent = c.flee; flee.hidden = !canFlee;
    fleeHint.textContent = c.fleeHint; fleeHint.hidden = !canFlee;
    start.hidden = false; close.hidden = true;
  }

  function update() {
    if (finished || game) return;
    const item = context()?.state.brawl?.pending;
    if (!item) { if (dialog.open) dialog.close(); return; }
    render(item);
    if (!dialog.open) dialog.showModal();
  }
  return { update, reset() { game?.destroy(); game = null; finished = false; if (dialog.open) dialog.close(); } };
}
