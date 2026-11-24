import test from "node:test";
import assert from "node:assert/strict";
import { CORE_TOPICS, conversationTopics, registerConversationTopics,
  unregisterConversationTopics, characterVariant } from "../conversation-topics.mjs";
import { pursuitStatus, beginPursuit } from "../pursuit.mjs";
import { translate } from "../i18n.mjs";

test("core topics cover the historical conversation choices in a stable order", () => {
  const ids = conversationTopics({}).map(topic => topic.id);
  assert.deepEqual(ids, ["parent", "clues", "notebooks", "artifacts", "legends", "services",
    "shelter", "food", "work", "transport", "town"]);
  assert.ok(CORE_TOPICS.every(topic => topic.kind !== "local"));
});

test("layers feed availability-gated topics and can withdraw them", t => {
  t.after(() => unregisterConversationTopics("test-layer"));
  registerConversationTopics("test-layer", [{
    id: "weather-smalltalk", kind: "local", order: 55,
    available: current => Boolean(current.raining),
    reply: () => "It never stops raining here.",
  }]);
  assert.ok(!conversationTopics({ raining: false }).some(topic => topic.id === "weather-smalltalk"));
  const rainy = conversationTopics({ raining: true });
  const topic = rainy.find(entry => entry.id === "weather-smalltalk");
  assert.ok(topic);
  assert.equal(topic.layer, "test-layer");
  assert.equal(rainy.findIndex(entry => entry.id === "weather-smalltalk"),
    rainy.findIndex(entry => entry.id === "services") - 1, "order slots layer topics between core ones");
  unregisterConversationTopics("test-layer");
  assert.ok(!conversationTopics({ raining: true }).some(entry => entry.id === "weather-smalltalk"));
});

test("a failing availability check removes the topic instead of breaking the list", t => {
  t.after(() => unregisterConversationTopics("broken"));
  registerConversationTopics("broken", [{
    id: "broken-topic", kind: "local", reply: () => "", available: () => { throw new Error("boom"); },
  }]);
  assert.ok(!conversationTopics({}).some(topic => topic.id === "broken-topic"));
});

test("invalid topic registrations are rejected", () => {
  assert.throws(() => registerConversationTopics("", [{ id: "x", kind: "local", reply: () => "" }]), TypeError);
  assert.throws(() => registerConversationTopics("layer", [{ id: "x", kind: "nonsense" }]), TypeError);
  assert.throws(() => registerConversationTopics("layer", [{ id: "x", kind: "local" }]), TypeError,
    "local topics without a reply are invalid");
});

for (const language of ["fr", "en"]) {
  test(`${language} pursuit rumours offer distinct diegetic phrasings for every stage`, () => {
    const state = beginPursuit({ elapsedMinutes: 0, col: 0, row: 0, ended: null }, 250);
    assert.equal(pursuitStatus(state).stage, "grace");
    for (const name of ["grace", "distant", "near", "danger"]) {
      const variants = [0, 1, 2].map(index => translate(language, `pursuitRumour.${name}.${index}`));
      assert.equal(new Set(variants).size, 3, `${name} variants are all different`);
      for (const text of variants) {
        assert.ok(text.length > 10, name);
        assert.doesNotMatch(text, /\d\s*km|heures de jeu|game hours/i,
          "rumours stay diegetic, without mechanical units");
      }
    }
    assert.ok(translate(language, "conversation.rumours").length > 3);
  });
}

test("the variant picker is stable per character and spreads across characters", () => {
  const alice = { id: "a".repeat(32) }, basile = { id: "b".repeat(32) };
  assert.equal(characterVariant(alice, 3), characterVariant(alice, 3), "same character, same phrasing");
  const spread = new Set(["a", "b", "c", "d", "e", "f", "g", "h"]
    .map(seed => characterVariant({ id: seed.repeat(32) }, 3)));
  assert.ok(spread.size > 1, "different characters get different phrasings");
  assert.ok([0, 1, 2].includes(characterVariant(basile, 3)));
  assert.equal(characterVariant(undefined, 3), characterVariant(undefined, 3));
  assert.throws(() => characterVariant(alice, 0), RangeError);
});
