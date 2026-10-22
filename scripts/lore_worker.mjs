import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createLoreState, applyLoreAction, loreView } from "../lore-engine.mjs";
import { mainArtifactRequest } from "../main-artifacts.mjs";

const input = JSON.parse(readFileSync(0, "utf8"));
let counter = 0;
// Replayable host randomness belongs to the action receipt, not the browser.
Math.random = () => {
  const bytes = createHash("sha256").update(`${input.seed}:${counter++}`).digest();
  return bytes.readUInt32BE(0) / 2 ** 32;
};
try {
  if (input.operation === "main-artifacts") {
    process.stdout.write(JSON.stringify(await mainArtifactRequest(input)));
    process.exit(0);
  }
  let runtime = input.runtime, instances = input.instances;
  if (input.operation === "start") {
    runtime = { state: createLoreState(input.genesis.state, input.map, input.genesis.economy),
      survival: input.genesis.survival, economy: input.genesis.economy,
      revision: 1, worldMinutes: input.worldMinutes };
  } else if (input.operation === "action") {
    ({ runtime, instances } = await applyLoreAction(runtime, instances, input.journey, input.map, input.action,
      { journalContext: input.journalContext, nowMillis: input.nowMillis }));
  } else if (input.operation !== "view") throw new Error("Unknown lore worker operation.");
  const view = loreView(runtime, instances, input.journey, input.map,
    { nowMillis: input.nowMillis, journalContext: input.journalContext });
  process.stdout.write(JSON.stringify({ runtime, instances, view }));
} catch (error) {
  if (error instanceof Error && error.constructor === Error) {
    process.stdout.write(JSON.stringify({ error: error.message }));
    process.exitCode = 2;
  } else {
    console.error("Unexpected lore worker failure:", error);
    process.exitCode = 1;
  }
}
