import test from "node:test";
import assert from "node:assert/strict";
import { available, difficulty, createGame, input, advance, result } from "../minigames/bookshop.mjs";

test("Priestess personal wish accepts either authored fitting book, preserves shelving and all other exact requests", () => {
  for (const options of [{ resonance: true }, { journeyCard: "priestess" }, { birthCard: "priestess" }, { dailyCard: "priestess" }, { journeyCard: "priestess", dailyCard: "priestess" }]) {
    for (const language of ["fr", "en"]) for (let level = 0; level <= 4; level++) {
      const normal = createGame({ level, language, random: () => .3 });
      const initial = createGame({ level, language, random: () => .3, ...options });
      assert.deepEqual(initial.books, normal.books);
      assert.deepEqual(initial.config, normal.config);
      assert.deepEqual(initial.requests.slice(1), normal.requests.slice(1));
      assert.equal(initial.requests.filter(request => request.acceptedBookIds).length, 1);
      const wish = initial.requests[0];
      assert.equal(wish.bookId, undefined);
      assert.deepEqual(wish.acceptedBookIds, ["book-1", "book-2"]);
      for (const bookId of wish.acceptedBookIds) {
        let game = sorted(initial);
        const wrong = game.books.find(book => !wish.acceptedBookIds.includes(book.id)).id;
        const rejected = input(input(game, { type: "select", bookId: wrong }, 0), { type: "serve" }, 0);
        assert.equal(rejected.mistakes, 1);
        assert.equal(rejected.requestIndex, 0);
        game = input(input(game, { type: "select", bookId }, 0), { type: "serve" }, 0);
        assert.equal(game.reaction[language], wish.reactions[bookId][language]);
        game = served(game);
        assert.equal(game.status, "completed");
        assert.equal(game.mistakes, 0);
        assert.equal(result(game).score, normal.maxScore);
        assert.equal(result(game).earningsMultiplier, 1.1);
      }
      assert.equal(result(advance(initial, initial.deadline)).earningsMultiplier, 1);
      assert.equal(result(input(initial, { type: "cancel" }, 0)).earningsMultiplier, 1);
    }
  }
  assert.deepEqual(createGame({ random: () => .3 }), createGame({ random: () => .3, dailyCard: "moon" }));
});

const seeded = seed => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
function alphabeticalSlot(game, book) {
  return game.books.filter(item => item.genre === book.genre)
    .sort((a, b) => new Intl.Collator(game.language, { sensitivity: "base", ignorePunctuation: true })
      .compare(a.title[game.language], b.title[game.language]))
    .findIndex(item => item.id === book.id);
}
function sorted(game) {
  for (const book of game.books) {
    game = input(game, { type: "select", bookId: book.id }, game.lastNow);
    game = input(game, { type: "place", shelf: game.shelves.indexOf(book.genre), slot: alphabeticalSlot(game, book) }, game.lastNow);
  }
  return game;
}
function served(game) {
  while (game.status === "requests") {
    game = input(game, { type: "select", bookId: game.requests[game.requestIndex].bookId }, game.lastNow);
    game = input(game, { type: "serve" }, game.lastNow);
  }
  return game;
}

for (let level = 0; level <= 4; level++) {
  test(`level ${level}: perfect spatial sorting and all customer requests`, () => {
    const initial = createGame({ level, now: 100, random: seeded(20 + level) });
    const game = served(sorted(initial));
    assert.equal(initial.slots.every(slot => slot === null), true);
    assert.equal(initial.status, "sorting");
    assert.equal(game.status, "completed");
    assert.equal(game.mistakes, 0);
    assert.deepEqual(result(game), { completed: true, score: game.maxScore, maxScore: game.books.length + game.config.requests, cancelled: false, earningsMultiplier: 1 });
    assert.equal(game.slots.length, game.books.length);
    game.slots.forEach((id, position) => {
      const book = game.books.find(book => book.id === id);
      assert.equal(book.genre, game.shelves[Math.floor(position / game.config.slots)]);
      assert.equal(alphabeticalSlot(game, book), position % game.config.slots);
    });
    assert.equal(input(game, { type: "cancel" }, 101), game);
    assert.equal(advance(game, game.deadline), game);
  });

  test(`level ${level}: bounded wrong placements, requests and timeouts never complete`, () => {
    let game = createGame({ level, random: seeded(3) });
    game = input(game, { type: "select", bookId: game.books[0].id }, 0);
    const book = game.books[0];
    const wrongShelf = (game.shelves.indexOf(book.genre) + 1) % game.config.shelves;
    for (let i = 0; i < game.config.mistakeLimit; i++) {
      game = input(game, { type: "place", shelf: wrongShelf, slot: 0 }, i);
      assert.equal(game.mistakes, i + 1);
      assert.ok(game.score >= 0 && game.score <= game.maxScore);
    }
    assert.equal(game.status, "failed");
    assert.equal(input(game, { type: "serve" }, game.lastNow), game);
    assert.deepEqual(result(game), { completed: false, score: 0, maxScore: game.maxScore, cancelled: false, earningsMultiplier: 1 });

    game = sorted(createGame({ level, random: seeded(4) }));
    const wrongBook = game.books.find(book => book.id !== game.requests[0].bookId);
    game = input(game, { type: "select", bookId: wrongBook.id }, 0);
    const before = game;
    game = input(game, { type: "serve" }, 0);
    assert.equal(game.feedback, "wrongRequest");
    assert.equal(game.requestIndex, 0);
    assert.equal(game.score, before.score);
    assert.equal(game.mistakes, 1);
    assert.equal(served(game).status, "completed");
    const timed = advance(before, before.deadline);
    assert.equal(timed.feedback, "timeout");
    assert.equal(result(timed).score, 0);
    assert.equal(result(timed).completed, false);
  });
}

test("difficulty and board/request complexity strictly increase, with bounded content", () => {
  let previous;
  for (let level = 0; level <= 4; level++) {
    const config = difficulty(level);
    if (previous) {
      assert.ok(config.shelves * config.slots > previous.shelves * previous.slots);
      assert.ok(config.requests > previous.requests);
      assert.ok(config.rewardMultiplier > previous.rewardMultiplier);
    }
    previous = config;
    assert.ok(Object.isFrozen(config));
    assert.ok(config.shelves * config.slots <= 16);
  }
});

test("real classics sort by displayed title within each theme, including articles, in both languages", () => {
  const expected = {
    fr: [[3, 1, 2, 4], [6, 7, 5, 8], [12, 11, 10, 9], [16, 14, 15, 13]],
    en: [[1, 3, 4, 2], [6, 5, 7, 8], [9, 10, 11, 12], [16, 14, 15, 13]],
  };
  for (const language of ["fr", "en"]) {
    let game = createGame({ level: 4, language, random: seeded(17) });
    for (const [shelf, ids] of expected[language].entries()) {
      for (const [slot, id] of ids.entries()) {
        game = input(game, { type: "select", bookId: `book-${id}` }, game.lastNow);
        game = input(game, { type: "place", shelf, slot }, game.lastNow);
        assert.equal(game.mistakes, 0, `${language}, ${shelf}, ${slot}, book-${id}`);
      }
    }
    assert.equal(game.status, "requests");
    assert.ok(game.books.every(book => book.author && book.summary.fr && book.summary.en));
    assert.ok(game.books.every(book => !Object.hasOwn(book, "spine")), "no printed position numbers");
    assert.equal(game.books.find(book => book.id === "book-1").author, "Jules Verne");
    assert.equal(game.books.find(book => book.id === "book-2").title.en, "Treasure Island");
    assert.equal(game.books.find(book => book.id === "book-13").title.fr, "Les Fleurs du mal");
    assert.equal(served(game).status, "completed");
  }
  assert.throws(() => createGame({ language: "de" }), RangeError);
});

test("a right theme in the wrong alphabetical position is rejected, and placement changes with language", () => {
  for (const language of ["fr", "en"]) {
    let game = createGame({ level: 4, language, random: seeded(5) });
    game = input(game, { type: "select", bookId: "book-1" }, 0);
    const correct = language === "fr" ? 1 : 0;
    game = input(game, { type: "place", shelf: 0, slot: 1 - correct }, 0);
    assert.equal(game.feedback, "wrongSlot");
    assert.equal(game.score, 0);
    game = input(game, { type: "place", shelf: 0, slot: correct }, 0);
    assert.equal(game.feedback, "placed");
    assert.equal(game.score, 1);
  }
});

test("requests consistently identify an existing unique title, handwritten and bilingual across seeds/levels", () => {
  const all = createGame({ level: 4, random: seeded(15) }).books;
  assert.equal(new Set(all.map(book => book.title.fr)).size, 16);
  assert.equal(new Set(all.map(book => book.title.en)).size, 16);
  assert.equal(new Set(all.map(book => book.request.fr)).size, 16);
  assert.equal(new Set(all.map(book => book.request.en)).size, 16);
  // Independent expected clues catch target/text mismatches, rather than trusting the request generator.
  const tokens = [
    ["fogg", "fogg"], ["hawkins", "hawkins"], ["lilliput", "lilliput"], ["ulysse", "odysseus"],
    ["mowgli", "mowgli"], ["buck", "buck"], ["mary", "mary"], ["thoreau", "thoreau"],
    ["watson", "watson"], ["baskerville", "baskerville"], ["collins", "collins"], ["dupin", "dupin"],
    ["baudelaire", "baudelaire"], ["whitman", "whitman"], ["hugo", "hugo"], ["fontaine", "fontaine"],
  ];
  const seen = new Set();
  for (let level = 0; level <= 4; level++) {
    for (let seed = 0; seed < 50; seed++) {
      const game = createGame({ level, random: seeded(seed) });
      assert.equal(new Set(game.requests.map(request => request.bookId)).size, game.config.requests);
      for (const request of game.requests) {
        const book = game.books.find(book => book.id === request.bookId);
        assert.ok(book);
        const index = Number(book.id.split("-")[1]) - 1;
        for (const [language, offset] of [["fr", 0], ["en", 1]]) {
          const token = tokens[index][offset];
          assert.ok(request.text[language].toLowerCase().includes(token));
          assert.equal(game.books.filter(item => item.request[language].toLowerCase().includes(token)).length, 1);
        }
        seen.add(book.id);
      }
    }
  }
  assert.equal(seen.size, 16);
});

test("immutability, deterministic randomness and state provenance", () => {
  const game = createGame({ level: 4, random: seeded(42) });
  assert.deepEqual(game, createGame({ level: 4, random: seeded(42) }));
  assert.notDeepEqual(game.books, createGame({ level: 4, random: seeded(43) }).books);
  for (const value of [game, game.books, game.books[0], game.books[0].title, game.requests, game.requests[0], game.slots, result(game)]) {
    assert.ok(Object.isFrozen(value));
  }
  assert.throws(() => { game.slots[0] = "cheat"; }, TypeError);
  assert.throws(() => { game.books[0].author = "cheat"; }, TypeError);
  for (const forged of [null, {}, { ...game }, JSON.parse(JSON.stringify(game))]) {
    assert.throws(() => input(forged, { type: "serve" }, 0), TypeError);
    assert.throws(() => advance(forged, 0), TypeError);
    assert.throws(() => result(forged), TypeError);
  }
});

test("invalid levels, randoms, clocks and actions reject without changing state", () => {
  for (const level of [-1, 5, 1.5, NaN, Infinity, "1", null]) {
    assert.throws(() => difficulty(level), RangeError);
    assert.throws(() => createGame({ level }), RangeError);
  }
  for (const now of [-1, NaN, Infinity, "0", null, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => createGame({ now }), RangeError);
  }
  for (const roll of [-0.1, 1, Infinity, NaN, "0", null]) {
    assert.throws(() => createGame({ random: () => roll }), RangeError);
  }
  assert.throws(() => createGame({ random: 2 }), TypeError);
  const game = createGame({ now: 10, random: seeded(5) });
  for (const now of [9, -2, NaN, Infinity, "10", null]) {
    assert.throws(() => advance(game, now), RangeError);
    assert.throws(() => input(game, { type: "cancel" }, now), RangeError);
  }
  for (const action of [null, {}, { type: "hack" }, { type: "select" }, { type: "select", bookId: "unknown" },
    ...[-1, 2, 0.5, NaN, "0"].map(shelf => ({ type: "place", shelf, slot: 0 })),
    ...[-1, 2, Infinity, null].map(slot => ({ type: "place", shelf: 0, slot }))]) {
    assert.throws(() => input(game, action, 10));
  }
  assert.equal(game.mistakes, 0);
  assert.equal(game.lastNow, 10);
  assert.equal(advance(game, 10), game);
  assert.equal(advance(game, 10.5).lastNow, 10.5);
});

test("phase rules, duplicate placement, missing selection and successful recovery", () => {
  let game = createGame({ random: seeded(8) });
  game = input(game, { type: "place", shelf: 0, slot: 0 }, 0);
  assert.equal(game.feedback, "chooseBook");
  const book = game.books[0];
  game = input(game, { type: "select", bookId: book.id }, 0);
  game = input(game, { type: "serve" }, 0);
  assert.equal(game.feedback, "sortFirst");
  game = input(game, { type: "place", shelf: game.shelves.indexOf(book.genre), slot: alphabeticalSlot(game, book) }, 0);
  assert.equal(game.score, 1);
  game = input(game, { type: "select", bookId: book.id }, 0);
  game = input(game, { type: "place", shelf: game.shelves.indexOf(book.genre), slot: alphabeticalSlot(game, book) }, 0);
  assert.equal(game.feedback, "alreadyPlaced");
  assert.equal(game.score, 1);
  for (const remaining of game.books.filter(item => item.id !== book.id)) {
    game = input(game, { type: "select", bookId: remaining.id }, 0);
    game = input(game, { type: "place", shelf: game.shelves.indexOf(remaining.genre), slot: alphabeticalSlot(game, remaining) }, 0);
  }
  assert.equal(game.status, "requests");
  game = input(game, { type: "select", bookId: book.id }, 0);
  game = input(game, { type: "place", shelf: 0, slot: 0 }, 0);
  assert.equal(game.feedback, "serveInstead");
  assert.equal(served(game).status, "completed");
});

test("cancel during either phase or after an unticked deadline is terminal and forfeits points", () => {
  for (const game of [createGame(), sorted(createGame())]) {
    for (const now of [0, game.deadline + 100]) {
      const cancelled = input(game, { type: "cancel" }, now);
      assert.deepEqual(result(cancelled), { completed: false, score: 0, maxScore: game.maxScore, cancelled: true, earningsMultiplier: 1 });
      assert.equal(input(cancelled, { type: "serve" }, now), cancelled);
      assert.equal(advance(cancelled, now + 500), cancelled);
      assert.notEqual(game.status, "cancelled");
    }
  }
});

test("only active mapped public books/library POIs on the supplied current cell qualify", () => {
  const poi = tags => ({ osmId: "node/123", tags });
  for (const tags of [{ shop: "books" }, { amenity: "library" }, { shop: "books", access: "customers" },
    { amenity: "library", access: "public", disused: "no" }]) {
    assert.equal(available({ pois: [poi(tags)] }), true);
  }
  for (const cell of [null, {}, { pois: null }, { pois: {} }, { pois: [null, {}, "books"] },
    { unavailable: true, pois: [poi({ shop: "books" })] },
    { shops: [poi({ shop: "books" })] }, { nearby: [poi({ amenity: "library" })] },
    { pois: [{ tags: { shop: "books" } }] }, { pois: [{ osmId: "fictional-shop", tags: { shop: "books" } }] },
    { pois: [{ osmId: "node/0", tags: { shop: "books" } }] },
    ...["cafe", "supermarket", "vacant", "no"].map(shop => ({ pois: [poi({ shop })] })),
    ...["private", "no", "staff", "permit", "members"].map(access => ({ pois: [poi({ shop: "books", access })] })),
    ...["disused", "abandoned", "demolished", "destroyed", "removed", "construction", "proposed", "closed"]
      .map(key => ({ pois: [poi({ amenity: "library", [key]: "yes" })] })),
    ...["private", "school", "university", "research"].map(library => ({ pois: [poi({ amenity: "library", library })] })),
    ...[{ active: false }, { closed: true }, { unavailable: true }].map(flags => ({ pois: [{ ...poi({ shop: "books" }), ...flags }] })),
  ]) assert.equal(available(cell), false, JSON.stringify(cell));
  assert.equal(available({ pois: [poi({ shop: "books", access: "private" }), { ...poi({ amenity: "library" }), osmId: "way/9" }] }), true);
  assert.equal(available({ pois: [{ ...poi({ shop: "books" }), osmId: "relation/9" }] }), true);
});
