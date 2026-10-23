export const TAROT_CARDS = ["fool", "magician", "priestess", "empress", "emperor",
  "hierophant", "lovers", "chariot", "justice", "hermit", "wheel", "strength",
  "hanged", "nameless", "temperance", "devil", "tower", "star", "moon", "sun",
  "judgement", "world"];

export function tarotArtwork(id = null) {
  const number = TAROT_CARDS.indexOf(id);
  if (id !== null && number === -1) throw new Error(`Unknown tarot artwork: ${id}`);
  const file = id === null ? "Jean Dodal Tarot reverse.jpg"
    : `Jean Dodal Tarot trump ${number === 0 ? "Fool" : String(number).padStart(2, "0")}.jpg`;
  return { url: `/public/tarot/${id ?? "back"}.jpg`,
    sourceUrl: `https://commons.wikimedia.org/wiki/File:${file.replaceAll(" ", "_")}`,
    attribution: "Jean Dodal, Lyon, ca. 1701 · Wikimedia Commons",
    license: "Public domain", licenseUrl: "https://commons.wikimedia.org/wiki/Commons:Public_domain" };
}

export function renderTarotCard(container, id, name, t) {
  const artwork = tarotArtwork(id);
  if (container.dataset.card === (id ?? "back")) {
    container.querySelector("img").alt = name || t("tarotCardBack");
    return;
  }
  container.dataset.card = id ?? "back";
  const image = document.createElement("img");
  image.src = artwork.url;
  image.alt = name || t("tarotCardBack");
  image.className = "tarot-card-image";
  const credit = document.createElement("figcaption");
  const source = document.createElement("a");
  source.href = artwork.sourceUrl;
  source.textContent = t("tarotArtworkCredit");
  source.target = "_blank";
  source.rel = "noopener noreferrer";
  credit.append(source);
  image.addEventListener("error", () => {
    credit.textContent = t("tarotImageError");
    credit.dataset.feedback = "failure";
  });
  container.replaceChildren(image, credit);
}

export function tarotJournalEntry(state, role, data, t, language) {
  if (!["birth", "daily"].includes(role)) throw new Error("Invalid tarot draw role.");
  const card = data.tarot.find(c => c.id === (role === "birth" ? state.birthCard : state.dailyCard));
  if (!card) throw new Error("Unknown drawn tarot card.");
  const date = role === "birth" ? new Date(state.startedAt).toISOString().slice(0, 10) : state.tarotDay;
  const identity = state.serverJourney?.id ?? `${state.startedAt}:${state.trail?.origin?.col}:${state.trail?.origin?.row}`;
  return { ...tarotArtwork(card.id),
    id: `tarot:${identity}:${role}:${date}`,
    title: t(role === "birth" ? "journalBirthCard" : "journalDailyCard", { card: card[language], date }),
    note: t(`tarotMeaning.${card.id}`) };
}

export function createTarotJournalPinner(store, fetcher = fetch) {
  return async function pin(entry) {
    if (await store.get(entry.id)) return false;
    const response = await fetcher(entry.url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Tarot image: HTTP ${response.status}`);
    const blob = await response.blob();
    return store.pin({ ...entry, blob }, { id: entry.id, caption: entry.title, note: entry.note });
  };
}
