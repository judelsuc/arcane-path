import { createGame, difficulty, input, advance, result } from "./bookshop.mjs";
import { bookCoverArt } from "./bookshop-art.mjs";
import { resolveResonance, decorateResonance } from "../arcane-resonance.mjs";

const words = {
  fr: {
    title: "Livres en place", start: "Commencer", cancel: "Annuler", serve: "Servir le client",
    instructions: "Déduisez le rayon de chaque livre grâce à son thème. Dans chaque rayon, rangez les titres par ordre alphabétique de gauche à droite, en comptant les articles (Le, La, Les, L’). Accents et majuscules ne changent pas l’ordre. Puis choisissez le livre demandé et servez le client. Les livres restent consultables après le service. Titres et auteurs réels ; couvertures originales créées pour ce jeu, pas des éditions commerciales.",
    keys: "Clavier : Tab / Entrée pour les boutons ; S commencer, B choisir le livre suivant, flèches déplacer la case, P ranger, R servir, Échap annuler.",
    sorting: "Rangement", requests: "Demandes", shelf: "Rayon", slot: "Case", books: "Livres",
    voyages: "Voyages", nature: "Nature", mystery: "Mystères", poetry: "Poésie",
    score: "Score", mistakes: "Erreurs", seconds: "secondes", request: "Client",
    selected: "Livre choisi.", ready: "À vous de ranger !", chooseBook: "Choisissez un livre d'abord.",
    serveInstead: "Les rayons sont prêts : servez le client.", alreadyPlaced: "Ce livre est déjà rangé.",
    wrongSlot: "Mauvaise case : vérifiez le thème et l’ordre alphabétique du titre.", shelvesReady: "Rayons prêts ! Lisez la demande du client.",
    placed: "Bien rangé !", sortFirst: "Rangez tous les livres avant de servir.", wrongRequest: "Ce livre ne répond pas à la demande. Relisez-la.",
    served: "Le client a trouvé son livre !", completed: "Service terminé !", failed: "Service interrompu : trop d'erreurs. Aucune récompense.",
    timeout: "Temps écoulé. Aucune récompense.", cancelled: "Annulé : aucune récompense.", multiplier: "Multiplicateur de réussite",
  },
  en: {
    title: "Books in Place", start: "Start", cancel: "Cancel", serve: "Serve customer",
    instructions: "Infer each book’s shelf from its theme. Within each shelf, sort displayed titles alphabetically from left to right, including initial articles (The, A). Ignore case and accents. Then select the requested book and serve the customer. Books remain available after serving. Real titles and authors; original covers made for this game, not commercial editions.",
    keys: "Keyboard: Tab / Enter for buttons; S start, B select next book, arrows move shelf cursor, P place, R serve, Escape cancel.",
    sorting: "Sorting", requests: "Requests", shelf: "Shelf", slot: "Slot", books: "Books",
    voyages: "Travel", nature: "Nature", mystery: "Mystery", poetry: "Poetry",
    score: "Score", mistakes: "Mistakes", seconds: "seconds", request: "Customer",
    selected: "Book selected.", ready: "Time to sort!", chooseBook: "Select a book first.",
    serveInstead: "Shelves are ready: serve the customer.", alreadyPlaced: "That book is already shelved.",
    wrongSlot: "Wrong slot: check the theme and alphabetical title order.", shelvesReady: "Shelves ready! Read the customer's request.",
    placed: "Correctly shelved!", sortFirst: "Shelve all books before serving.", wrongRequest: "That book doesn't answer the request. Read it again.",
    served: "The customer found their book!", completed: "Service complete!", failed: "Service stopped: too many mistakes. No reward.",
    timeout: "Time is up. No reward.", cancelled: "Cancelled: no reward.", multiplier: "Success multiplier",
  },
};

export function bookshopCopy(language) {
  return words[language === "en" ? "en" : "fr"];
}

/**
 * Standalone preparation only: the host must check available(currentCell) before mounting.
 * Call destroy() when closing/removing the view; document visibility loss also cancels.
 * onFinish receives the engine result once, including cancellation before Start.
 */
export function mount(container, { level = 0, language = "fr", onFinish, audio, ...options } = {}) {
  const resonance = resolveResonance("bookshop", options);
  const config = difficulty(level);
  if (!container?.ownerDocument || typeof container.append !== "function") throw new TypeError("Expected a DOM container.");
  if (onFinish !== undefined && typeof onFinish !== "function") throw new TypeError("onFinish must be a function.");
  const doc = container.ownerDocument;
  const lang = language === "en" ? "en" : "fr";
  const t = bookshopCopy(lang);
  const root = doc.createElement("section");
  root.lang = lang;
  root.tabIndex = 0;
  root.setAttribute("aria-label", t.title);
  let game = null, timer = null, countdown = null, finished = false, destroyed = false, cursor = 0, shownSecond = -1;
  const clock = () => performance.now();
  const node = (tag, text) => {
    const element = doc.createElement(tag);
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const button = (text, command, value, disabled = false) => {
    const element = node("button", text);
    element.type = "button";
    element.dataset.command = command;
    element.dataset.value = String(value ?? "");
    element.disabled = disabled;
    return element;
  };
  function cleanup() {
    if (timer !== null) clearInterval(timer);
    timer = null;
    audio?.stop();
    root.removeEventListener("click", click);
    root.removeEventListener("keydown", key);
    doc.removeEventListener("visibilitychange", visibility);
  }
  function finish() {
    if (finished) return;
    finished = true;
    cleanup();
    render();
    if (game.status !== "cancelled") void audio?.play(game.status === "completed" ? "complete" : "failed");
    onFinish?.(result(game));
  }
  function render() {
    if (destroyed) return;
    const active = doc.activeElement;
    const focus = active && root.contains(active)
      ? { command: active.dataset?.command, value: active.dataset?.value } : null;
    root.replaceChildren();
    root.className = "";
    const explanations = [t.instructions, t.keys, `${t.multiplier}: ×${config.rewardMultiplier}`].map(text => {
      const paragraph = node("p", text);
      paragraph.className = "game-help-text";
      return paragraph;
    });
    root.append(node("h2", t.title), ...explanations);
    if (resonance) {
      const help = node("p", lang === "en"
        ? "High Priestess: shelving stays thematic and alphabetical. One customer shares a personal wish rather than an exact title; several books fit. Read the summaries, choose one and serve. Their reaction explains why it fits. Other customers still want one specific book."
        : "La Papesse : le rangement reste thématique et alphabétique. Un client exprime une envie personnelle plutôt qu’un titre précis ; plusieurs livres conviennent. Lisez les résumés, choisissez et servez. Sa réaction explique ce choix. Les autres clients demandent toujours un livre précis.");
      help.className = "game-help-text";
      root.append(help);
    }
    decorateResonance(root, "bookshop", resonance, lang);
    if (!game) {
      root.append(button(t.start, "start"), button(t.cancel, "cancel"));
      return;
    }
    const live = node("p", `${t.score}: ${finished ? result(game).score : game.score}/${game.maxScore} · ${t.mistakes}: ${game.mistakes}/${config.mistakeLimit}`);
    live.setAttribute("role", "status");
    root.append(live);
    shownSecond = Math.max(0, Math.ceil((game.deadline - game.lastNow) / 1000));
    countdown = node("p", `${shownSecond} ${t.seconds}`);
    countdown.setAttribute("role", "timer");
    root.append(countdown);
    const feedback = node("p", t[game.status === "failed" && game.feedback !== "timeout" ? "failed"
      : ["completed", "cancelled"].includes(game.status) ? game.status : game.feedback]);
    feedback.setAttribute("role", "status");
    feedback.setAttribute("aria-live", "polite");
    root.append(feedback);
    if (game.reaction) {
      const reaction = node("p", game.reaction[lang]);
      reaction.setAttribute("role", "status");
      reaction.dataset.customerReaction = "true";
      root.append(reaction);
    }
    if (finished) return;
    root.append(node("h3", t[game.status]));
    if (game.status === "requests") root.append(node("p",
      `${t.request} ${game.requestIndex + 1}/${game.requests.length}: ${game.requests[game.requestIndex].text[lang]}`));
    const books = node("div");
    books.setAttribute("role", "group");
    books.setAttribute("aria-label", t.books);
    for (const book of game.books) {
      const item = button(undefined, "select", book.id,
        game.status === "sorting" && game.slots.includes(book.id));
      const cover = node("span");
      cover.className = "book-cover";
      const title = node("span", book.title[lang]);
      title.className = "book-cover-title";
      const author = node("span", book.author);
      author.className = "book-cover-author";
      cover.append(title, bookCoverArt(doc, book.id), author);
      const summary = node("span", book.summary[lang]);
      summary.className = "book-summary";
      item.append(cover, summary);
      item.setAttribute("aria-label", `${book.title[lang]} — ${book.author}. ${book.summary[lang]}`);
      item.setAttribute("aria-pressed", String(game.selected === book.id));
      books.append(item);
    }
    root.append(books);
    game.shelves.forEach((genre, row) => {
      const shelf = node("fieldset");
      shelf.append(node("legend", `${t.shelf} ${row + 1}: ${t[genre]}`));
      for (let col = 0; col < config.slots; col++) {
        const index = row * config.slots + col;
        const book = game.books.find(item => item.id === game.slots[index]);
        const item = button(`${cursor === index ? "▸ " : ""}${t.slot} ${col + 1}: ${book ? book.title[lang] : "—"}`,
          "place", index, game.status !== "sorting" || Boolean(book));
        item.setAttribute("aria-label", `${t[genre]}, ${t.slot} ${col + 1}: ${book ? book.title[lang] : "—"}`);
        if (cursor === index) item.setAttribute("aria-current", "true");
        shelf.append(item);
      }
      root.append(shelf);
    });
    root.append(button(t.serve, "serve", "", game.status !== "requests"), button(t.cancel, "cancel"));
    if (focus) {
      const replacement = [...root.querySelectorAll("button")].find(item =>
        item.dataset.command === focus.command && item.dataset.value === focus.value && !item.disabled);
      (replacement ?? root).focus();
    }
  }
  function dispatch(command, value) {
    if (finished || destroyed) return;
    const now = clock();
    const previousMistakes = game?.mistakes ?? 0, previousScore = game?.score ?? 0;
    if (command === "start") {
      if (game) return;
      game = createGame({ level, language: lang, now, resonance });
      void audio?.unlock();
      timer = setInterval(() => {
        game = advance(game, clock());
        if (game.status === "failed") finish();
        else if (Math.ceil((game.deadline - game.lastNow) / 1000) !== shownSecond) {
          shownSecond = Math.max(0, Math.ceil((game.deadline - game.lastNow) / 1000));
          countdown.textContent = `${shownSecond} ${t.seconds}`;
        }
      }, 250);
    } else if (command === "cancel") {
      game ??= createGame({ level, language: lang, now, resonance });
      game = input(game, { type: "cancel" }, now);
    } else {
      if (!game) return;
      const action = command === "select" ? { type: command, bookId: value }
        : command === "place" ? { type: command, shelf: Math.floor(Number(value) / config.slots), slot: Number(value) % config.slots }
          : { type: command };
      game = input(game, action, now);
    }
    if (["completed", "failed", "cancelled"].includes(game.status)) finish();
    else {
      render();
      if (game.mistakes > previousMistakes) void audio?.play("mistake");
      else if (command === "select") void audio?.play("select");
      else if (game.score > previousScore) void audio?.play(command === "serve" ? "serve" : "place");
    }
  }
  function click(event) {
    const target = event.target.closest?.("button");
    if (target && root.contains(target) && !target.disabled) dispatch(target.dataset.command, target.dataset.value);
  }
  function key(event) {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    const name = event.key.toLowerCase();
    if (!["s", "b", "p", "r", "escape", "arrowleft", "arrowright", "arrowup", "arrowdown"].includes(name)) return;
    event.preventDefault();
    if (name === "s") dispatch("start");
    else if (name === "escape") dispatch("cancel");
    else if (game && !finished) {
      if (name === "b") {
        const candidates = game.books.filter(book => game.status !== "sorting" || !game.slots.includes(book.id));
        if (candidates.length) dispatch("select", candidates[(candidates.findIndex(book => book.id === game.selected) + 1) % candidates.length].id);
      } else if (name === "p") dispatch("place", cursor);
      else if (name === "r") dispatch("serve");
      else {
        const row = Math.floor(cursor / config.slots), col = cursor % config.slots;
        cursor = (Math.max(0, Math.min(config.shelves - 1, row + (name === "arrowdown" ? 1 : name === "arrowup" ? -1 : 0)))) * config.slots
          + Math.max(0, Math.min(config.slots - 1, col + (name === "arrowright" ? 1 : name === "arrowleft" ? -1 : 0)));
        render();
      }
    }
  }
  function visibility() {
    if (doc.hidden) dispatch("cancel");
  }
  root.addEventListener("click", click);
  root.addEventListener("keydown", key);
  doc.addEventListener("visibilitychange", visibility);
  container.append(root);
  render();
  visibility();
  return {
    destroy() {
      if (destroyed) return;
      try { dispatch("cancel"); }
      finally {
        destroyed = true;
        cleanup();
        root.remove();
      }
    },
  };
}
