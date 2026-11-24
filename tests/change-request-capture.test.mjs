import test from "node:test";
import assert from "node:assert/strict";
import { freezeEvidence } from "../change-request-capture.mjs";

test("unsupported viewport fails before cloning or mounting any screenshot DOM", () => {
  const previous = {
    innerWidth: globalThis.innerWidth, innerHeight: globalThis.innerHeight,
    devicePixelRatio: globalThis.devicePixelRatio,
  };
  Object.assign(globalThis, { innerWidth: 0, innerHeight: 812, devicePixelRatio: 2 });
  try {
    const doc = { documentElement: { lang: "en" }, querySelectorAll: () => [], getElementById: () => null,
      createElement: () => assert.fail("Invalid viewport must never create a screenshot host") };
    assert.throws(() => freezeEvidence({ col: 2, row: 3 }, { commit: "development", version: 1 }, { doc }),
      /Unsupported game viewport dimensions/);
  } finally {
    for (const key of Object.keys(previous)) {
      if (previous[key] === undefined) delete globalThis[key];
      else globalThis[key] = previous[key];
    }
  }
});
