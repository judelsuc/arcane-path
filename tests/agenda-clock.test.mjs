import test from "node:test";
import assert from "node:assert/strict";
import { agendaClock } from "../agenda-clock.mjs";

test("agenda page and 24-hour clock agree with game UTC, including the requested 19:04 example", () => {
  const date = new Date("2026-10-18T19:04:00Z");
  const fr = agendaClock(date, "fr"), en = agendaClock(date, "en");
  assert.equal(fr.day, "18");
  assert.equal(fr.weekday, "dimanche");
  assert.equal(fr.month, "octobre");
  assert.equal(fr.year, "2026");
  assert.equal(fr.time, "19:04");
  assert.equal(en.weekday, "Sunday");
  assert.equal(en.month, "October");
  assert.equal(en.time, "19:04");
  assert.equal(fr.iso, date.toISOString());
  assert.equal(fr.hourDegrees, 212);
  assert.equal(fr.minuteDegrees, 24);
});

test("midnight, noon and UTC year rollover keep calendar, digits and hands aligned", () => {
  const midnight = agendaClock(new Date("2026-12-31T23:00:00-01:00"), "en");
  assert.equal(midnight.time, "00:00");
  assert.equal(midnight.year, "2027");
  assert.equal(midnight.month, "January");
  assert.equal(midnight.day, "01");
  assert.equal(midnight.hourDegrees, 0);
  assert.equal(midnight.minuteDegrees, 0);
  const noon = agendaClock(new Date("2026-10-18T12:30:00Z"), "en");
  assert.equal(noon.hourDegrees, 15);
  assert.equal(noon.minuteDegrees, 180);
  assert.throws(() => agendaClock(new Date("invalid"), "fr"), /Invalid game/);
});
