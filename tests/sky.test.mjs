import assert from "node:assert/strict";
import test from "node:test";
import { skyState } from "../sky.mjs";
import { initialJourney, journeyDate, moveJourney, restJourney } from "../travel.mjs";

test("Paris solstice sunrise and sunset match approximate UTC reference times within ten minutes", () => {
  const sky = skyState(new Date("2026-06-21T12:00:00Z"), 48.8566, 2.3522);
  assert.equal(sky.phase, "day");
  assert.ok(Math.abs(sky.sunrise - Date.parse("2026-06-21T03:47:00Z")) < 600_000);
  assert.ok(Math.abs(sky.sunset - Date.parse("2026-06-21T19:58:00Z")) < 600_000);
  assert.ok(sky.progress > 0.45 && sky.progress < 0.6);
});

test("sun travels left to right with morning, noon and evening on the upper circle", () => {
  const morning = skyState(new Date("2026-06-21T05:00:00Z"), 48.8566, 2.3522);
  const noon = skyState(new Date("2026-06-21T12:00:00Z"), 48.8566, 2.3522);
  const evening = skyState(new Date("2026-06-21T19:00:00Z"), 48.8566, 2.3522);
  assert.ok(morning.x < noon.x && noon.x < evening.x);
  assert.ok(noon.y < morning.y && noon.y < evening.y);
  for (const sky of [morning, noon, evening]) {
    assert.ok(Math.abs((sky.x - 100) ** 2 + (sky.y - 100) ** 2 - 76 ** 2) < 1e-8);
  }
});

test("night spans midnight and transitions exactly at local sunrise and sunset", () => {
  const day = skyState(new Date("2026-10-17T12:00:00Z"), 44.54, 2.3);
  const at = timestamp => skyState(new Date(timestamp), 44.54, 2.3);
  assert.equal(at(day.sunrise - 1).phase, "night");
  assert.equal(at(day.sunrise).phase, "day");
  assert.ok(at(day.sunrise).progress < 0.001);
  assert.equal(at(day.sunset - 1).phase, "day");
  assert.equal(at(day.sunset).phase, "night");
  assert.ok(at(day.sunset).progress < 0.001);
  const late = at(Date.parse("2026-10-17T23:59:00Z"));
  const early = at(Date.parse("2026-10-18T00:01:00Z"));
  assert.equal(late.phase, "night");
  assert.equal(early.phase, "night");
  assert.ok(early.progress > late.progress && early.progress - late.progress < 0.01);
});

test("season, longitude, polar regions, leap day and year boundaries give finite sky positions", () => {
  const summer = skyState(new Date("2026-06-21T12:00:00Z"), 48.85, 2.35);
  const winter = skyState(new Date("2026-12-21T12:00:00Z"), 48.85, 2.35);
  assert.ok(summer.sunset - summer.sunrise > winter.sunset - winter.sunrise);
  const east = skyState(new Date("2026-06-21T12:00:00Z"), 48.85, 22.35);
  assert.ok(east.sunrise < summer.sunrise);
  assert.equal(skyState(new Date("2026-06-21T12:00:00Z"), 89, 0).polar, "day");
  assert.equal(skyState(new Date("2026-12-21T12:00:00Z"), 89, 0).polar, "night");
  for (const iso of ["2028-02-29T23:59:00Z", "2026-12-31T23:59:00Z"]) {
    for (const longitude of [-180, 180]) {
      const sky = skyState(new Date(iso), 44.54, longitude);
      assert.ok(Number.isFinite(sky.x) && Number.isFinite(sky.y));
      assert.ok(sky.progress >= 0 && sky.progress <= 1);
    }
  }
});

test("walking and resting advance the sky through sunset without fixed-speed regression", () => {
  const coordinates = [44.54, 2.3];
  const sky = skyState(new Date("2026-10-17T12:00:00Z"), ...coordinates);
  const state = initialJourney(0, 0, sky.sunset - 60_000);
  assert.equal(skyState(journeyDate(state), ...coordinates).phase, "day");
  const road = { terrain: "road", elevationMeters: 100 };
  const walking = moveJourney(state, 1, 0, road, road);
  assert.equal(skyState(journeyDate(walking), ...coordinates).phase, "night");
  assert.equal(skyState(journeyDate(restJourney(state)), ...coordinates).phase, "night");
  assert.equal(state.elapsedMinutes, 0);
});

test("invalid dates and coordinates fail explicitly", () => {
  for (const args of [[new Date(NaN), 0, 0], [new Date(), 91, 0], [new Date(), 0, NaN]]) {
    assert.throws(() => skyState(...args), /Invalid sky/);
  }
});
