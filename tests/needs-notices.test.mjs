import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createNeedsNotices } from "../needs-notices.mjs";
import { startSurvival, restSurvival } from "../survival.mjs";

const config = JSON.parse(readFileSync(new URL("../public/config.json", import.meta.url))).survival;
const state = hunger => ({ reserveKcal: config.reserve_kcal * (1 - hunger / 100), ended: null });

test("hunger warning starts at exactly 75%, waits until shown, and rearms only after feeding", () => {
  const notices = createNeedsNotices();
  assert.equal(notices.pending(state(74.9), config), null);
  const hungry = state(75);
  const snapshot = structuredClone(hungry);
  assert.equal(notices.pending(hungry, config), "warning");
  assert.equal(notices.pending(hungry, config), "warning");
  notices.shown("warning");
  assert.equal(notices.pending(state(90), config), null);
  assert.equal(notices.pending(state(50), config), null);
  assert.equal(notices.pending(state(75), config), "warning");
  assert.deepEqual(hungry, snapshot);
});

test("terminal notice replaces hunger warning, supports ended saves, and does not repeat", () => {
  for (const ended of ["hunger", "fatigue", "sleep"]) {
    const notices = createNeedsNotices();
    assert.equal(notices.pending({ ...state(100), ended }, config), ended);
    notices.shown(ended);
    assert.equal(notices.pending({ ...state(100), ended }, config), null);
  }
  assert.equal(createNeedsNotices().pending({ ...state(100), ended: "reunion" }, config), null);
});

test("zero food energy remains game over and cannot be undone by resting", () => {
  const exhausted = restSurvival({ ...startSurvival(0, 0, 0, "balanced", config),
    reserveKcal: 1 }, config);
  assert.equal(exhausted.reserveKcal, 0);
  assert.equal(exhausted.ended, "hunger");
  assert.throws(() => restSurvival(exhausted, config), /journey has ended/);
});
