import { NARRATIVE_BRIEFS } from "./live-narrative.mjs";
import { hospitalityTown } from "./hospitality.mjs";

const HEADLINES = [0, 1, 2].map(index => `pursuit.news.headline.${index}`);
const REPORT = "pursuit.news.report";
const INHABITANT = "pursuit.inhabitant.report";
const COPY = {
  en: {
    open: "Newspaper", title: "The local newspaper", close: "Close",
    edition: "Day {day} · {town}", ask: "Ask about the pursuer",
    inhabitants: "Inhabitants’ report", authored: "Authored bulletin",
    generated: "Generated bulletin", mixed: "Generated headline or report with authored fallback",
    unavailable: "Text generation is unavailable; authored bulletin shown.",
  },
  fr: {
    open: "Le journal local", title: "Le journal local", close: "Fermer",
    edition: "Jour {day} · {town}", ask: "Se renseigner sur le poursuivant",
    inhabitants: "Rapport des habitants", authored: "Bulletin rédigé",
    generated: "Bulletin généré", mixed: "Titre ou rapport généré avec texte rédigé de secours",
    unavailable: "Génération indisponible ; bulletin rédigé affiché.",
  },
};

// Call update after movement, state changes and localization; reset when leaving a journey.
// Only registered static briefs reach the existing narrative client, never town names or pursuit coordinates.
export function setupPursuitNews(t, { context, narrative } = {}) {
  const hud = document.querySelector("#travel-toolbar");
  const townActions = document.querySelector("#town-conversation")?.parentElement;
  if ((!hud && !townActions) || typeof context !== "function") return { update() {}, reset() {} };
  const make = (tag, id) => {
    const node = document.createElement(tag);
    if (id) node.id = id;
    return node;
  };
  const dialog = make("dialog", "pursuit-news-dialog");
  dialog.setAttribute("aria-labelledby", "pursuit-news-title");
  const heading = make("div"), title = make("h2", "pursuit-news-title");
  heading.className = "drawer-heading";
  const close = make("button");
  close.type = "button";
  heading.append(title, close);
  const edition = make("p", "pursuit-news-edition");
  const headline = make("h3", "pursuit-news-headline");
  const report = make("p", "pursuit-news-report");
  const provenance = make("p", "pursuit-news-status");
  provenance.className = "technical-text";
  provenance.setAttribute("role", "status");
  const ask = make("button", "pursuit-news-ask");
  ask.type = "button";
  const inhabitants = make("section", "pursuit-news-inhabitants");
  const inhabitantsTitle = make("h3"), reply = make("p"), replyStatus = make("p");
  replyStatus.className = "technical-text";
  replyStatus.setAttribute("role", "status");
  inhabitants.append(inhabitantsTitle, reply, replyStatus);
  dialog.append(heading, edition, headline, report, provenance, ask, inhabitants);
  document.body.append(dialog);
  const buttons = [];
  for (const [area, id] of [[hud, "open-pursuit-news"], [townActions, "town-pursuit-news"]]) {
    if (!area) continue;
    const button = make("button", id);
    button.type = "button";
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-controls", dialog.id);
    area.append(button);
    buttons.push(button);
    button.addEventListener("click", () => open(button));
  }
  let openedKey, asked = false, opener;
  const language = () => document.documentElement?.lang === "en" ? "en" : "fr";
  function available() {
    const current = context();
    const state = current?.state;
    const town = hospitalityTown(current?.cell);
    if (!state?.pursuit || state.pursuit.version !== 1 || state.ended || current.blocked || !town) return null;
    const day = Math.max(0, Math.floor((state.elapsedMinutes ?? 0) / 1440));
    if (!Number.isFinite(day)) return null;
    return { state, town, day, key: JSON.stringify([
      state.serverJourney?.id ?? state.startedAt, state.pursuit.startedMinutes,
      state.col, state.row, town.osmId, day,
    ]) };
  }
  function wording(state, id, node, lang) {
    const generated = narrative?.snapshot?.(state, id);
    node.textContent = generated?.[lang] ?? NARRATIVE_BRIEFS[id][lang];
    return Boolean(generated?.[lang]);
  }
  function status(state, ids, generated, lang) {
    const copy = COPY[lang];
    const states = [...new Set(ids.map(id => narrative?.status?.(state, id, lang) ?? copy.unavailable))];
    return `${copy[generated]}. ${states.join(" ")}`;
  }
  function update() {
    const current = available(), lang = language(), copy = COPY[lang];
    for (const button of buttons) {
      button.textContent = copy.open;
      button.hidden = !current;
      button.disabled = !current;
    }
    title.textContent = copy.title;
    close.textContent = copy.close;
    ask.textContent = copy.ask;
    inhabitantsTitle.textContent = copy.inhabitants;
    if (!current || dialog.open && openedKey !== current.key) {
      if (dialog.open) dialog.close();
      openedKey = undefined;
      asked = false;
      headline.textContent = report.textContent = reply.textContent = provenance.textContent = replyStatus.textContent = "";
      inhabitants.hidden = true;
      return;
    }
    if (!dialog.open) return;
    const { state, town, day } = current;
    const id = HEADLINES[day % HEADLINES.length];
    edition.textContent = copy.edition.replace("{day}", String(day + 1)).replace("{town}", town.name.trim());
    const generatedHeadline = wording(state, id, headline, lang);
    const generatedReport = wording(state, REPORT, report, lang);
    provenance.textContent = status(state, [id, REPORT],
      generatedHeadline && generatedReport ? "generated" : generatedHeadline || generatedReport ? "mixed" : "authored", lang);
    inhabitants.hidden = !asked;
    if (asked) {
      const generated = wording(state, INHABITANT, reply, lang);
      replyStatus.textContent = status(state, [INHABITANT], generated ? "generated" : "authored", lang);
    }
  }
  function open(button) {
    const current = available();
    const other = document.querySelector("dialog[open]");
    if (!current || dialog.open || other && other.id !== "town-dialog") return;
    opener = button;
    openedKey = current.key;
    asked = false;
    dialog.showModal();
    update();
    narrative?.prefetch?.(current.state, [HEADLINES[current.day % HEADLINES.length], REPORT]);
    update();
  }
  ask.addEventListener("click", () => {
    const current = available();
    if (!dialog.open || !current || openedKey !== current.key) { update(); return; }
    asked = true;
    narrative?.prefetch?.(current.state, [INHABITANT]);
    update();
  });
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    asked = false;
    openedKey = undefined;
    if (opener && !opener.hidden && !opener.disabled) opener.focus();
  });
  narrative?.subscribe?.(() => { if (dialog.open) update(); });
  function reset() {
    if (dialog.open) dialog.close();
    openedKey = undefined;
    asked = false;
    opener = undefined;
    for (const button of buttons) button.hidden = button.disabled = true;
    headline.textContent = report.textContent = reply.textContent = provenance.textContent = replyStatus.textContent = "";
    inhabitants.hidden = true;
  }
  update();
  return { update, reset };
}
