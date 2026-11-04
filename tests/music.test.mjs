import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MUSIC, rhythm, beatTime, rhythmEnd, tapRhythm, beginBusking, settleBusking,
  musicMistakeLimit, musicDifficulty, holdDuration, releaseRhythm, advanceRhythm } from "../music.mjs";
import { startEconomy, buyMeal, sleepEconomy, restEconomy } from "../economy.mjs";
import { startSurvival } from "../survival.mjs";

const data = JSON.parse(readFileSync(new URL("../public/economy.json", import.meta.url)));
const survival = JSON.parse(readFileSync(new URL("../public/config.json", import.meta.url))).survival;
const start = () => startEconomy(startSurvival(0, 0, Date.UTC(2026, 9, 17, 12),
  "balanced", survival), data, () => 0);
const cell = { terrain: "place", countryCodes: ["FR"] };
const info = { latitude: 44.54, longitude: 2.3 };

test("practice adds notes and potential earnings at every level and snapshots scoring terms", () => {
  for (let level = 0; level <= 4; level++) {
    const state = { ...start(), skills: { music: level * 60 } };
    const difficulty = musicDifficulty(state);
    assert.equal(difficulty.beats, 24 + level * 3);
    let game = rhythm(0, () => 0.4, musicMistakeLimit(state), difficulty.beats, difficulty);
    assert.equal(game.pattern.filter(note => note > 0).length, 8 + level);
    assert.equal(game.pattern.length, difficulty.slots);
    assert.ok(game.pattern.filter(note => note === 0).length >= 2);
    assert.equal(game.intervalMs, 400 - level * 35);
    assert.deepEqual(game.pattern.filter(note => note > 1).sort(), [...difficulty.holdLengths].sort());
    for (let i = 0; i < game.hits.length; i++) {
      game = tapRhythm(game, beatTime(game, i));
      if (holdDuration(game, i)) game = releaseRhythm(game, beatTime(game, i) + holdDuration(game, i));
    }
    assert.equal(game.hits.filter(Boolean).length, difficulty.beats);
    const pending = beginBusking(state, cell, info, survival, data);
    assert.equal(pending.performancePending.beats, difficulty.beats);
    const base = beginBusking(start(), cell, info, survival, data).performancePending.maxRewardCents;
    assert.equal(pending.performancePending.maxRewardCents, Math.round(base * (1 + level / 4)));
    const done = settleBusking(pending, difficulty.beats, 0);
    assert.equal(done.walletCents - pending.walletCents, pending.performancePending.maxRewardCents);
    assert.equal(done.skills.music, Math.min(300, level * 60 + difficulty.beats));
    const failed = settleBusking(pending, difficulty.beats, musicMistakeLimit(state));
    assert.equal(failed.skills.music, level * 60);
    assert.equal(failed.lastEarningsCents, 0);
  }
  for (const beats of [23, 25, 37, NaN]) assert.throws(() => rhythm(0, Math.random, 3, beats), /note count/);
  const pending = beginBusking({ ...start(), skills: { music: 59 } }, cell, info, survival, data);
  const done = settleBusking(pending, 24);
  assert.equal(musicDifficulty(done).level, 1);
  assert.equal(done.lastEarningsCents, pending.performancePending.maxRewardCents);
});

test("Judgement snapshots birth/daily matches and multiplies only completed earnings once", () => {
  const matching = beginBusking({ ...start(), birthCard: "fool", dailyCard: "judgement" },
    cell, info, survival, data);
  assert.equal(matching.performancePending.resonance, true);
  const paid = settleBusking(matching, 24, 0);
  assert.equal(paid.walletCents - matching.walletCents,
    Math.round(matching.performancePending.maxRewardCents * 1.1));
  assert.equal(paid.lastEarningsCents, Math.round(matching.performancePending.maxRewardCents * 1.1));
  const cancelled = settleBusking(matching, 24, 0, true);
  assert.equal(cancelled.walletCents, matching.walletCents);
  const failed = settleBusking(matching, 24, musicMistakeLimit({ birthCard: "fool" }));
  assert.equal(failed.walletCents, matching.walletCents);
  const normal = beginBusking({ ...start(), birthCard: "fool", dailyCard: "fool" },
    cell, info, survival, data);
  assert.equal(normal.performancePending.resonance, false);
  assert.equal(settleBusking(normal, 24).walletCents - normal.walletCents,
    normal.performancePending.maxRewardCents);
  const journeyMatch = beginBusking({ ...start(), birthCard: "fool", dailyCard: "fool" },
    cell, info, survival, data, { journeyCard: "judgement" });
  assert.equal(journeyMatch.performancePending.resonance, true);
  const doubleMatch = beginBusking({ ...start(), birthCard: "judgement", dailyCard: "judgement" },
    cell, info, survival, data);
  assert.equal(settleBusking(doubleMatch, 24).walletCents - doubleMatch.walletCents,
    Math.round(doubleMatch.performancePending.maxRewardCents * 1.1));
});

test("resonant rhythm carries its phrase preview duration without changing the playable note count", () => {
  const profile = musicDifficulty({ skills: { music: 120 } });
  const normal = rhythm(10, () => 0.5, 4, profile.beats, profile);
  const resonant = rhythm(10, () => 0.5, 4, profile.beats, { ...profile, resonance: true });
  assert.equal(normal.resonance, false);
  assert.equal(normal.previewMs, 0);
  assert.equal(resonant.previewMs, MUSIC.leadMs + resonant.pattern.length * resonant.intervalMs);
  assert.equal(resonant.hits.length, normal.hits.length);
  assert.deepEqual(resonant.pattern, normal.pattern);
});

test("two-, three- and four-beat holds accept 300 ms early/late releases, count once and never retry", () => {
  const profile = musicDifficulty({ skills: { music: 240 } });
  const initial = rhythm(100, () => 0.99, 8, profile.beats, profile);
  for (const length of [2, 3, 4]) {
  const index = initial.pattern.filter(note => note > 0).indexOf(length);
  const at = beatTime(initial, index), duration = holdDuration(initial, index);
  assert.equal(duration, length * 260);
  for (const offset of [-MUSIC.releaseWindowMs, -200, 0, 200, MUSIC.releaseWindowMs]) {
    const holding = tapRhythm(initial, at);
    assert.equal(holding.activeHold, index);
    assert.equal(holding.hits[index], false);
    const played = releaseRhythm(holding, at + duration + offset);
    assert.equal(played.hits[index], true);
    assert.equal(played.mistakes, 0);
    assert.equal(played.activeHold, null);
    assert.equal(releaseRhythm(played, at + duration), played);
  }
  for (const time of [at, at + duration - MUSIC.releaseWindowMs - 1, at + duration + MUSIC.releaseWindowMs + 1]) {
    const failed = releaseRhythm(tapRhythm(initial, at), time);
    assert.equal(failed.hits[index], false);
    assert.equal(failed.mistakes, 1);
    assert.equal(tapRhythm(failed, at).mistakes, 2);
    assert.equal(tapRhythm(failed, at).activeHold, null);
  }
  const holding = tapRhythm(initial, at);
  assert.equal(advanceRhythm(holding, at + duration + MUSIC.releaseWindowMs), holding);
  const expired = advanceRhythm(holding, at + duration + MUSIC.releaseWindowMs + 1);
  assert.equal(expired.mistakes, 1);
  assert.equal(expired.activeHold, null);
  assert.equal(advanceRhythm(expired, at + duration + 1000), expired);
  assert.equal(releaseRhythm(holding, at + duration, true).mistakes, 1);
  assert.equal(initial.activeHold, null);
  assert.deepEqual(initial.attemptedHolds, []);
  assert.throws(() => releaseRhythm(holding, NaN), /clock/);
  assert.throws(() => advanceRhythm(holding, NaN), /clock/);
  }
});

test("final held note extends the performance clock through its release window", () => {
  const profile = musicDifficulty({ skills: { music: 240 } });
  const game = rhythm(0, () => 0, 8, profile.beats, profile);
  const last = game.hits.length - 1;
  const duration = holdDuration(game, last);
  assert.equal(rhythmEnd(game), beatTime(game, last) + duration +
    (duration ? MUSIC.releaseWindowMs : MUSIC.windowMs));
  for (const timing of [{ intervalMs: 0 }, { slots: 99 }, { holdNotes: -1 }, { holdNotes: 4 }]) {
    assert.throws(() => rhythm(0, () => 0, 3, 24, timing), /timing/);
  }
  for (const holdLengths of [[1], [5], [2.5], null, [2, 3]]) {
    assert.throws(() => rhythm(0, () => 0, 3, 24, { holdNotes: 1, holdLengths }), /hold lengths/);
  }
});
test("rhythm counts each note once, including exact tolerance endpoints", () => {
  const initial = rhythm(1000);
  let game = tapRhythm(initial, beatTime(initial, 0) - MUSIC.windowMs);
  assert.equal(game.hits[0], true);
  assert.equal(initial.hits[0], false);
  game = tapRhythm(game, beatTime(game, 0));
  assert.equal(game.mistakes, 1);
  game = tapRhythm(game, beatTime(game, 1) + MUSIC.windowMs);
  assert.equal(game.hits[1], true);
  game = tapRhythm(game, beatTime(game, 2) + MUSIC.windowMs + 0.01);
  assert.equal(game.mistakes, 2);
  game = tapRhythm(game, 0);
  assert.equal(game.mistakes, 3);
  assert.equal(tapRhythm(game, beatTime(game, 3)), game);
  assert.equal(tapRhythm(game, rhythmEnd(game) + 1), game);
  assert.throws(() => tapRhythm(game, NaN));
});

test("perfect sequence hits all 24 notes over three irregular loops; rests never score", () => {
  let game = rhythm(0);
  for (let i = 0; i < MUSIC.beats; i++) game = tapRhythm(game, beatTime(game, i));
  assert.equal(game.hits.filter(Boolean).length, 24);
  const empty = rhythm(0);
  for (let loop = 0; loop < 3; loop++) {
    for (const slot of empty.pattern.flatMap((note, slot) => note ? [] : [slot])) {
      const now = MUSIC.leadMs + (loop * 12 + slot) * MUSIC.intervalMs;
      const missed = tapRhythm(empty, now);
      assert.equal(missed.hits, empty.hits);
      assert.equal(missed.mistakes, now <= rhythmEnd(empty) ? 1 : 0);
      assert.equal(empty.mistakes, 0);
    }
    assert.equal(beatTime(empty, loop * 8), MUSIC.leadMs +
      (loop * 12 + empty.pattern.indexOf(1)) * MUSIC.intervalMs);
  }
  let spam = rhythm(0);
  const first = beatTime(spam, 0);
  for (let i = 0; i < 50; i++) spam = tapRhythm(spam, first + i);
  assert.equal(spam.hits.filter(Boolean).length, 1);
  assert.equal(spam.mistakes, MUSIC.minMistakes);
});

test("third wrong tap ends scoring; success never erases earlier mistakes", () => {
  let game = rhythm(0, () => 0.99);
  const rest = MUSIC.leadMs + game.pattern.indexOf(0) * MUSIC.intervalMs;
  game = tapRhythm(game, rest);
  game = tapRhythm(game, beatTime(game, 0));
  assert.equal(game.mistakes, 1);
  assert.equal(game.hits.filter(Boolean).length, 1);
  game = tapRhythm(game, beatTime(game, 1) - MUSIC.windowMs - .01);
  assert.equal(game.mistakes, 2);
  game = tapRhythm(game, rest);
  assert.equal(game.mistakes, 3);
  assert.equal(tapRhythm(game, beatTime(game, 2)), game);
});

test("each performance draws its own eight-note four-rest phrase and retains it throughout all loops", () => {
  const first = rhythm(0, () => 0), second = rhythm(0, () => 0.99);
  assert.notDeepEqual(first.pattern, second.pattern);
  for (const game of [first, second]) {
    assert.equal(game.pattern.length, 12);
    assert.equal(game.pattern.filter(Boolean).length, 8);
    assert.equal(game.pattern.filter(note => !note).length, 4);
    let played = game;
    for (let i = 0; i < MUSIC.beats; i++) played = tapRhythm(played, beatTime(played, i));
    assert.equal(played.pattern, game.pattern);
    assert.equal(played.hits.filter(Boolean).length, 24);
    for (let i = 0; i < 8; i++) {
      assert.equal(beatTime(game, i + 8) - beatTime(game, i), 12 * MUSIC.intervalMs);
    }
  }
  for (const roll of [-1, 1, NaN]) assert.throws(() => rhythm(0, () => roll), /draw/);
});

test("performances cost time, energy and fatigue up front, even with no money", () => {
  const state = { ...start(), walletCents: 0 };
  const next = beginBusking(state, cell, info, survival, data);
  assert.equal(next.elapsedMinutes, 30);
  assert.equal(next.fatigue, 4);
  assert.equal(next.reserveKcal, state.reserveKcal - 20);
  assert.equal(next.walletCents, 0);
  assert.ok(next.performancePending);
  assert.throws(() => beginBusking(next, cell, info, survival, data), /already active/);
});

test("rewards are score-proportional integer cents and settle exactly once", () => {
  const state = beginBusking(start(), cell, info, survival, data);
  for (const hits of [0, 12, 24]) {
    const next = settleBusking(state, hits);
    assert.equal(next.walletCents - state.walletCents, Math.round(1120 * hits / MUSIC.beats));
    assert.equal(next.elapsedMinutes, 30);
    assert.equal(next.performancePending, null);
    assert.throws(() => settleBusking(next, hits), /No active/);
  }
  for (const score of [-1, 25, 2.5]) assert.throws(() => settleBusking(state, score));
  const limit = musicMistakeLimit(state);
  const failed = settleBusking(state, 24, limit);
  assert.equal(failed.walletCents, state.walletCents);
  assert.equal(failed.lastEarningsCents, 0);
  assert.equal(failed.performancePending, null);
  assert.equal(failed.elapsedMinutes, state.elapsedMinutes);
  assert.equal(failed.fatigue, state.fatigue);
  assert.equal(settleBusking(state, 24, 2).lastEarningsCents, 1120);
  for (const mistakes of [-1, limit + 1, 2.5, NaN]) {
    assert.throws(() => settleBusking(state, 24, mistakes), /mistake/);
  }
});

test("all 22 starting cards grant 3–8 mistakes based on charisma, never on the daily card", () => {
  const limits = new Set();
  for (const card of data.tarot) {
    const state = { ...start(), birthCard: card.id };
    const limit = musicMistakeLimit(state);
    assert.ok(Number.isInteger(limit) && limit >= 3 && limit <= 8);
    limits.add(limit);
    for (const daily of data.tarot) {
      assert.equal(musicMistakeLimit({ ...state, dailyCard: daily.id }), limit);
    }
    let game = rhythm(0, () => .99, limit);
    const rest = MUSIC.leadMs + game.pattern.indexOf(0) * MUSIC.intervalMs;
    const pending = beginBusking(state, cell, info, survival, data);
    game = tapRhythm(game, beatTime(game, 0));
    for (let errors = 1; errors <= limit; errors++) {
      game = tapRhythm(game, rest);
      assert.equal(game.mistakes, errors);
      const paid = settleBusking(pending, 1, errors);
      assert.equal(paid.lastEarningsCents > 0, errors < limit);
    }
    assert.equal(tapRhythm(game, beatTime(game, 1)), game);
    assert.equal(game.hits.filter(Boolean).length, 1);
  }
  assert.deepEqual([...limits].sort(), [3, 4, 5, 6, 7, 8]);
  assert.equal(musicMistakeLimit({ birthCard: "hermit" }), 3);
  assert.equal(musicMistakeLimit({ birthCard: "magician" }), 8);
  assert.throws(() => musicMistakeLimit({ birthCard: "unknown" }), /starting card/);
  assert.throws(() => musicMistakeLimit({ birthCard: "constructor" }), /starting card/);
  for (const limit of [2, 9, 3.5, NaN]) {
    assert.throws(() => rhythm(0, Math.random, limit), /mistake limit/);
  }
});

test("cancelled performance costs remain and exhausted or remote characters cannot earn", () => {
  const next = settleBusking(beginBusking(start(), cell, info, survival, data), 0);
  assert.equal(next.walletCents, start().walletCents);
  assert.equal(next.elapsedMinutes, 30);
  assert.throws(() => beginBusking(start(), { terrain: "forest" }, info, survival, data), /settlement/);
  const exhausted = beginBusking({ ...start(), fatigue: 98 }, cell, info, survival, data);
  assert.equal(exhausted.ended, null);
  assert.equal(exhausted.fatigue, 40);
  assert.equal(exhausted.faints, 1);
  assert.equal(exhausted.performancePending, null);
  assert.throws(() => beginBusking({ ...start(), ended: "hunger" }, cell, info, survival, data), /ended/);
});

test("earning, meals and shelter support three full simulated days without free resources", () => {
  let state = startEconomy(startSurvival(0, 0, Date.UTC(2026, 9, 17, 8),
    "balanced", survival), data, () => 0);
  const hostel = { ...cell, pois: [{ osmId: "node/1", tags: { tourism: "hostel" } }] };
  for (let day = 0; day < 3; day++) {
    for (let i = 0; i < 4; i++) state = settleBusking(beginBusking(state, cell, info, survival, data), MUSIC.beats);
    for (let i = 0; i < 40; i++) state = restEconomy(state, info, { ...survival, rest_minutes: 20 }, data);
    for (let i = 0; i < 2; i++) state = buyMeal(state, cell, info, "aligot", survival, data);
    state = sleepEconomy(state, hostel, info, "node/1", survival, data);
    assert.equal(state.ended, null);
    assert.ok(state.walletCents >= 0);
  }
  assert.equal(state.elapsedMinutes, 3 * 24 * 60);
  assert.equal(state.performances, 12);
  assert.equal(state.meals, 12);
  assert.equal(state.sleeps, 3);
});
