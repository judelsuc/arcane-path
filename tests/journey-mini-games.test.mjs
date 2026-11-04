import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { startEconomy, marketPrice } from "../economy.mjs";
import { startSurvival } from "../survival.mjs";
import * as harvestEngine from "../minigames/harvest.mjs";
import * as workshopEngine from "../minigames/workshop.mjs";
import * as sketchEngine from "../minigames/sketch.mjs";
import * as marketEngine from "../minigames/market.mjs";
import * as bookshopEngine from "../minigames/bookshop.mjs";
import * as deliveriesEngine from "../minigames/deliveries.mjs";
import * as petanqueEngine from "../minigames/petanque.mjs";
import * as lanternsEngine from "../minigames/lanterns.mjs";
import * as lostFoundEngine from "../minigames/lost-found.mjs";
import {
  JOURNEY_MINI_GAMES, journeyMiniGameAvailable, journeyMiniGameDifficulty,
  beginJourneyMiniGame, settleJourneyMiniGame, validateJourneyMiniGames,
  abandonJourneyMiniGame, journeyMiniGameOffer,
} from "../journey-mini-games.mjs";

const json = name => JSON.parse(readFileSync(new URL(name, import.meta.url)));
const data = json("../public/economy.json");
const survival = json("../public/config.json").survival;
const info = { latitude: 44.54, longitude: 2.3, terrain: "place" };
const mapped = (tags, extra = {}) => ({
  osmId: "node/123", name: "Mapped place", tags, ...extra,
});
const cells = {
  harvest: { terrain: "vineyard", countryCodes: ["FR"] },
  workshop: { terrain: "road", countryCodes: ["FR"],
    pois: [mapped({ shop: "bicycle" })] },
  sketch: { terrain: "road", countryCodes: ["FR"], tags: {},
    pois: [mapped({ tourism: "viewpoint" }, { category: "tourism" })] },
  market: { terrain: "place", countryCodes: ["FR"],
    pois: [mapped({ shop: "supermarket" })] },
  bookshop: { terrain: "place", countryCodes: ["FR"],
    pois: [mapped({ shop: "books" })] },
  deliveries: { terrain: "place", countryCodes: ["FR"],
    settlements: [mapped({})], pois: [mapped({ amenity: "post_office" }, { category: "amenity" })] },
  petanque: { terrain: "place", countryCodes: ["FR"],
    pois: [mapped({ leisure: "pitch", sport: "boules" })] },
  lanterns: { terrain: "place", countryCodes: ["FR"],
    pois: [mapped({ amenity: "community_centre" })] },
  "lost-found": { terrain: "place", countryCodes: ["FR"],
    settlements: [mapped({})] },
};
const start = () => startEconomy(startSurvival(
  14, 10, Date.UTC(2026, 9, 17, 12), "balanced", survival,
), data, () => 0);
const context = game => ({ cell: cells[game], info, survival, data });

test("all nine journey activities require their real mapped feature", () => {
  for (const game of JOURNEY_MINI_GAMES) {
    assert.equal(journeyMiniGameAvailable(game, cells[game]), true, game);
    assert.equal(journeyMiniGameAvailable(game, { unavailable: true }), false, game);
    assert.throws(() => beginJourneyMiniGame(start(), game, context(game).cell
      ? { ...context(game), cell: { unavailable: true } } : context(game)), /not available/);
  }
  assert.equal(journeyMiniGameAvailable("unknown", cells.harvest), false);
});

test("activity start charges time and needs once; settlement pays the actual reported score", () => {
  for (const game of JOURNEY_MINI_GAMES) {
    const before = start();
    const pending = beginJourneyMiniGame(before, game, context(game));
    const terms = pending.miniGamePending;
    const minutes = journeyMiniGameDifficulty(before, game).level === 0
      ? ({ harvest: 30, workshop: 30, sketch: 25, market: 45, bookshop: 45,
        deliveries: 30, petanque: 30, lanterns: 20, "lost-found": 20 })[game]
      : terms.minutes;
    assert.equal(terms.game, game);
    assert.equal(pending.elapsedMinutes - before.elapsedMinutes, minutes, game);
    assert.ok(pending.reserveKcal < before.reserveKcal, game);
    assert.ok(pending.fatigue > before.fatigue, game);
    assert.throws(() => beginJourneyMiniGame(pending, game, context(game)), /already active/);

    const result = { completed: true, cancelled: false, score: 7, maxScore: 10 };
    const settled = settleJourneyMiniGame(pending, game, result);
    assert.equal(settled.miniGamePending, null, game);
    assert.ok(settled.walletCents > pending.walletCents, game);
    assert.equal(settled.journeyMiniGameSkills[game], 42, game);
    assert.equal(settled.lastJourneyMiniGame.score, 7, game);
    assert.throws(() => settleJourneyMiniGame(settled, game, result), /No matching/);
  }
});

test("cancellation clears pending without payment or practice and resonance is snapshotted", () => {
  const state = { ...start(), birthCard: "empress" };
  const pending = beginJourneyMiniGame(state, "harvest", context("harvest"));
  assert.equal(pending.miniGamePending.resonance, true);
  const cancelled = settleJourneyMiniGame(pending, "harvest", {
    completed: false, cancelled: true, score: 0, maxScore: 1,
  });
  assert.equal(cancelled.walletCents, pending.walletCents);
  assert.equal(cancelled.journeyMiniGameSkills.harvest, 0);
  assert.equal(cancelled.miniGamePending, null);
});

test("settlement rejects forged, mismatched, and out-of-range results", () => {
  const pending = beginJourneyMiniGame(start(), "market", context("market"));
  for (const result of [
    null,
    { completed: true, cancelled: false, score: -1, maxScore: 10 },
    { completed: true, cancelled: false, score: 11, maxScore: 10 },
    { completed: true, cancelled: true, score: 1, maxScore: 10 },
    { completed: true, cancelled: false, score: 1, maxScore: 0 },
  ]) assert.throws(() => settleJourneyMiniGame(pending, "market", result), /Invalid/);
  assert.throws(() => settleJourneyMiniGame(pending, "bookshop", {
    completed: true, cancelled: false, score: 1, maxScore: 1,
  }), /No matching/);
  assert.throws(() => beginJourneyMiniGame({ ...start(), cafePending: {} }, "market",
    context("market")), /already active/);
  assert.throws(() => journeyMiniGameDifficulty({ journeyMiniGameSkills: { market: -1 } }, "market"),
    /experience/);
});

test("fractional engine score ratios settle proportionally and persist as finite numbers", () => {
  const pending = beginJourneyMiniGame(start(), "market", context("market"));
  const settled = settleJourneyMiniGame(pending, "market", {
    completed: true, cancelled: false, score: 1.5, maxScore: 2.5,
  });
  assert.equal(settled.lastJourneyMiniGame.score, 1.5);
  assert.equal(settled.lastJourneyMiniGame.maxScore, 2.5);
  assert.equal(settled.lastJourneyMiniGame.xpGained, 36);
  assert.equal(validateJourneyMiniGames(settled), settled);
});

test("all nine engine-emitted cancelled results settle without fabricated result fields", () => {
  const engines = {
    harvest: harvestEngine,
    workshop: workshopEngine,
    sketch: sketchEngine,
    market: marketEngine,
    bookshop: bookshopEngine,
    deliveries: deliveriesEngine,
    petanque: petanqueEngine,
    lanterns: lanternsEngine,
    "lost-found": lostFoundEngine,
  };
  for (const game of JOURNEY_MINI_GAMES) {
    const engine = engines[game];
    const gameState = engine.createGame({
      ...(game === "bookshop" ? { language: "en" } : {}),
      random: () => 0.3, now: 0,
    });
    const cancelledGame = game === "harvest"
      ? engine.input(gameState, "cancel", 1)
      : engine.input(gameState, { type: "cancel" }, 1);
    const actualResult = engine.result(cancelledGame);
    const pending = beginJourneyMiniGame(start(), game, context(game));
    const settled = settleJourneyMiniGame(pending, game, actualResult);
    assert.equal(settled.lastJourneyMiniGame.cancelled, true, game);
    assert.equal(settled.lastJourneyMiniGame.score, 0, game);
    assert.equal(settled.walletCents, pending.walletCents, game);
  }
});

test("journey mini-game offers expose pre-start time, fatigue, and resonance-aware reward cap", () => {
  const state = { ...start(), birthCard: "empress" };
  const offer = journeyMiniGameOffer(state, "harvest", cells.harvest, info, data);
  assert.deepEqual({
    minutes: offer.minutes,
    fatigue: offer.fatigue,
    maxRewardCents: offer.maxRewardCents,
    pointRewardCents: offer.pointRewardCents,
  }, { minutes: 30, fatigue: 5, maxRewardCents: null,
    pointRewardCents: Math.floor(
    marketPrice(cells.harvest, 1, data, info).cents / 20,
    ) });
  assert.equal(journeyMiniGameOffer(state, "harvest", { unavailable: true }, info, data), null);
});

test("harvest earnings are per correct grape: 20 points pay twice as much as 10", () => {
  const state = start();
  const tenPending = beginJourneyMiniGame(state, "harvest", context("harvest"));
  const twentyPending = beginJourneyMiniGame(state, "harvest", context("harvest"));
  assert.equal(tenPending.miniGamePending.maxRewardCents, null);
  assert.ok(Number.isSafeInteger(tenPending.miniGamePending.pointRewardCents));
  const ten = settleJourneyMiniGame(tenPending, "harvest", {
    completed: true, cancelled: false, score: 10, maxScore: 10,
  });
  const twenty = settleJourneyMiniGame(twentyPending, "harvest", {
    completed: true, cancelled: false, score: 20, maxScore: 20,
  });
  assert.equal(ten.walletCents - tenPending.walletCents,
    10 * tenPending.miniGamePending.pointRewardCents);
  assert.equal(twenty.walletCents - twentyPending.walletCents,
    20 * twentyPending.miniGamePending.pointRewardCents);
  assert.equal(twenty.walletCents - twentyPending.walletCents,
    2 * (ten.walletCents - tenPending.walletCents));
});

test("fractional elapsed clocks remain valid pending snapshots and experience stays capped", () => {
  for (const game of JOURNEY_MINI_GAMES) {
    const fractional = { ...start(), elapsedMinutes: 332.85414018015604 };
    const pending = beginJourneyMiniGame(fractional, game, context(game));
    assert.equal(pending.miniGamePending.startedAt, pending.elapsedMinutes);
    assert.doesNotThrow(() => settleJourneyMiniGame(pending, game, {
      completed: true, cancelled: false, score: 1, maxScore: 3,
    }), game);
  }
  const capped = { ...start(), journeyMiniGameSkills: { harvest: 300 } };
  const pending = beginJourneyMiniGame(capped, "harvest", context("harvest"));
  const settled = settleJourneyMiniGame(pending, "harvest", {
    completed: true, cancelled: false, score: 1, maxScore: 1,
  });
  assert.equal(settled.journeyMiniGameSkills.harvest, 300);
  assert.equal(settled.lastJourneyMiniGame.levelUps, 0);
});

test("an unacknowledged journey event or pending companion encounter blocks mini-game start", () => {
  for (const state of [
    { ...start(), events: { pending: 1 } },
    { ...start(), equipment: { dogEncounter: "pending" } },
  ]) assert.throws(() => beginJourneyMiniGame(state, "harvest", context("harvest")),
    /already active/);
});

test("saved mini-game fields use strict schemas and reject replayable pending activity", () => {
  const valid = {
    journeyMiniGameSkills: { harvest: 60, "lost-found": 300 },
    journeyMiniGamesPlayed: 12,
    miniGamePending: null,
    lastJourneyMiniGame: {
      game: "harvest", completed: true, cancelled: false,
      score: 8, maxScore: 10, rewardCents: 300, level: 1, xpGained: 48, levelUps: 1,
    },
  };
  assert.equal(validateJourneyMiniGames(valid), valid);
  for (const state of [
    { ...valid, journeyMiniGameSkills: { harvest: 301 } },
    { ...valid, journeyMiniGameSkills: { harvest: 0, typo: 1 } },
    { ...valid, journeyMiniGameSkills: [] },
    { ...valid, journeyMiniGamesPlayed: -1 },
    { ...valid, journeyMiniGamesPlayed: 1.5 },
    { ...valid, miniGamePending: { game: "harvest" } },
    { ...valid, lastJourneyMiniGame: { ...valid.lastJourneyMiniGame, extra: true } },
    { ...valid, lastJourneyMiniGame: { ...valid.lastJourneyMiniGame, game: "fake" } },
    { ...valid, lastJourneyMiniGame: { ...valid.lastJourneyMiniGame, score: 11 } },
  ]) assert.throws(() => validateJourneyMiniGames(state), /Invalid|cannot be saved/);
  const legacy = {};
  assert.equal(validateJourneyMiniGames(legacy), legacy);
});

test("abandoning an active game clears only its pending snapshot without reward or time rollback", () => {
  const live = beginJourneyMiniGame(start(), "harvest", context("harvest"));
  const serialized = abandonJourneyMiniGame(live);
  assert.notEqual(serialized, live);
  assert.equal(live.miniGamePending.game, "harvest");
  assert.equal(serialized.miniGamePending, null);
  assert.equal(serialized.walletCents, live.walletCents);
  assert.equal(serialized.elapsedMinutes, live.elapsedMinutes);
  assert.equal(serialized.reserveKcal, live.reserveKcal);
  assert.equal(serialized.fatigue, live.fatigue);
  assert.equal(serialized.journeyMiniGameSkills, live.journeyMiniGameSkills);
  assert.equal(validateJourneyMiniGames(serialized), serialized);
});
