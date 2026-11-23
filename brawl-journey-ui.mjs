import { mountBrawl } from "./minigames/brawl-ui.mjs";
import { brawlSetup } from "./brawl-journey.mjs";

const COPY = {
  fr: {
    title: { street: "Mauvaise rencontre", camp: "Réveil brutal" },
    intro: {
      street: n => n === 1 ? "Une silhouette se détache d'une porte cochère et vous barre la route."
        : `${n} silhouettes sortent de l'ombre et vous encerclent. Pas moyen de passer sans se défendre.`,
      camp: n => n === 1 ? "Un craquement vous tire du sommeil : quelqu'un fouille votre sac."
        : `Des voix, des pas autour du bivouac : ${n} rôdeurs veulent votre sac. Vous êtes à peine réveillé.`,
    },
    stakes: "Si vous perdez, ils vous dépouillent d'une partie de votre argent et vous laissent blessé — mais en vie.",
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
    },
    close: "Reprendre la route",
  },
  en: {
    title: { street: "A bad encounter", camp: "Rude awakening" },
    intro: {
      street: n => n === 1 ? "A figure steps out of a doorway and blocks your way."
        : `${n} figures come out of the shadows and surround you. There is no way past without defending yourself.`,
      camp: n => n === 1 ? "A crack wakes you: someone is going through your bag."
        : `Voices and footsteps around your camp: ${n} prowlers want your bag. You are barely awake.`,
    },
    stakes: "If you lose, they take part of your money and leave you hurt — but alive.",
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
  const board = doc.createElement("div"); board.className = "brawl-board";
  const result = doc.createElement("p"); result.setAttribute("role", "status");
  const close = doc.createElement("button"); close.type = "button"; close.hidden = true;
  dialog.append(title, intro, stakes, facts, start, board, result, close);
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
    start.hidden = true;
    result.textContent = record && before ? record.outcome === "lost"
      ? c.result.lost(record.stolenCents, record.healthLost) : c.result[record.outcome] : "";
    close.textContent = c.close; close.hidden = false;
    close.focus();
  }

  start.addEventListener("click", () => {
    const item = context()?.state.brawl?.pending;
    if (!item) return;
    if (item.status === "active") { settle({ changes: [], ticks: 0, abandoned: true }); return; }
    if (!act({ type: "begin" })) return;
    start.hidden = true;
    void audio?.unlock?.();
    game = mountBrawl(board, brawlSetup(item), { language: language(), phase: item.phase, audio,
      onFinish({ transcript }) { queueMicrotask(() => settle(transcript)); } });
  });
  close.addEventListener("click", () => { finished = false; dialog.close(); update(); });
  dialog.addEventListener("cancel", event => { event.preventDefault(); });
  doc.addEventListener("visibilitychange", () => { if (doc.hidden) game?.abandon(); });

  function render(item) {
    const c = COPY[language()];
    title.textContent = c.title[item.kind];
    intro.textContent = c.intro[item.kind](item.opponents);
    stakes.textContent = c.stakes;
    facts.textContent = c.facts(item, context()?.state.walletCents ?? 0);
    result.textContent = item.status === "active" ? c.interrupted : "";
    start.textContent = item.status === "active" ? c.acknowledge : c.fight;
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
