import test from "node:test";
import assert from "node:assert/strict";
import { attemptStatus, tokenSummary } from "../content-workshop.mjs";

test("content workshop never presents pending, interrupted or failed generation as success", () => {
  assert.match(attemptStatus({ status: "pending" }), /outcome unknown/);
  assert.equal(attemptStatus({ status: "failed", error: "OVH unavailable" }), "OVH unavailable");
  assert.match(attemptStatus({ status: "draft", acceptedAt: null }), /review required/);
  assert.match(attemptStatus({ status: "draft", acceptedAt: "2026-10-19" }), /Accepted locally/);
});

test("content workshop does not invent token usage or currency costs", () => {
  assert.match(tokenSummary(null), /unavailable/);
  assert.match(tokenSummary({ usage: null }), /unavailable/);
  assert.equal(tokenSummary({ usage: { prompt_tokens: 300, completion_tokens: 150, total_tokens: 450 } }),
    "300 input + 150 output = 450 tokens");
});
