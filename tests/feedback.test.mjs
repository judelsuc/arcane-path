import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setFeedback } from "../feedback.mjs";

test("feedback is semantic, neutral by default and clears an old success or failure", () => {
  const element = { dataset: {}, textContent: "Une phrase dans une autre langue." };
  setFeedback(element, "success");
  assert.equal(element.dataset.feedback, "success");
  setFeedback(element, "failure");
  assert.equal(element.dataset.feedback, "failure");
  setFeedback(element);
  assert.equal(element.dataset.feedback, "");
  assert.equal(element.textContent, "Une phrase dans une autre langue.");
});

test("success and failure palettes have readable contrast on dark UI and notebook paper", () => {
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  const luminance = hex => {
    const rgb = hex.match(/[a-f0-9]{2}/gi).map(channel => {
      const value = parseInt(channel, 16) / 255;
      return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
    });
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  const contrast = (a, b) => {
    const values = [luminance(a), luminance(b)].sort((a, b) => b - a);
    return (values[0] + .05) / (values[1] + .05);
  };
  for (const [kind, paper] of [["success", "#216232"], ["failure", "#a12727"]]) {
    const color = new RegExp(`--feedback-${kind}: (#[a-f0-9]{6})`).exec(css)[1];
    for (const background of ["#101711", "#18251c", "#39251c"]) {
      assert.ok(contrast(color, background) >= 4.5, `${kind} on ${background}`);
    }
    assert.ok(contrast(paper, "#f5edda") >= 4.5);
    assert.ok(css.includes(`.notebook-page [data-feedback="${kind}"] { color: ${paper}; }`));
  }
});
