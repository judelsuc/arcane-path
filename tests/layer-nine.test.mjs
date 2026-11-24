import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { validateServerJourney } from "../server-journey.mjs";
import { createJourneyStore, mapIdentity } from "../journey-save.mjs";
import { clueActions, trailClue } from "../trail-actions.mjs";
import { parentStage } from "../parent-story.mjs";
import { beginExploration } from "../trail-search.mjs";

const root = new URL("../", import.meta.url);
const python = existsSync(new URL(".venv/bin/python", root)) ? ".venv/bin/python" : "python3";
const map = JSON.parse(readFileSync(new URL("../public/map.json", import.meta.url)));
const records = JSON.parse(execFileSync(python, ["-c", `
import json,sys,tempfile,uuid
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,"scripts")
from journeys import JourneyStore
from parent_story import story_profile
from travel_server import ChunkStore,atomic_write
results=[]
with tempfile.TemporaryDirectory() as directory:
    chunks=ChunkStore(cache=Path(directory))
    store=JourneyStore(chunks,atomic_write)
    for final in ("stationary","mobile"):
        def profile(seed,card):
            return {**story_profile(seed,card),"finalState":final}
        with patch("journeys.story_profile",side_effect=profile), \\
             patch("journeys.secrets.token_hex",return_value="00000042"), \\
             patch("urllib.request.urlopen",side_effect=AssertionError("Network forbidden")):
            record,_=store.create({"requestId":str(uuid.uuid4()),"region":"firmi","name":"Layer nine check"})
        assert store.read(record["state"]["serverJourney"]["id"])==record
        results.append(record)
print(json.dumps(results))
`], { cwd: root, encoding: "utf8" }));

for (const record of records) {
  const speeds = record.state.trail.story.finalState === "mobile" ? [false, true] : [false];
  for (const [slow, exploring] of speeds.flatMap(slow => [[slow, false], [slow, true]])) {
    test(`real offline genesis → clues → save/reload → ${slow ? "slow" : "early"} ${record.state.trail.story.finalState} reunion (${exploring ? "vague leads" : "legacy"})`, () => {
      validateServerJourney(record, "firmi", map, "Layer nine check");
      let state = structuredClone(record.state);
      if (exploring) state = beginExploration(state);
      const values = new Map();
      const storage = { getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value) };
      let store = createJourneyStore(storage);
      store.read("firmi");
      const checkpoint = () => {
        store.write({ region: "firmi", map, state, survival: record.survival, economy: record.economy });
        store = createJourneyStore(storage);
        const resumed = store.read("firmi");
        assert.deepEqual(resumed.state, state);
        assert.equal(resumed.mapIdentity, mapIdentity(map));
        assert.deepEqual(resumed.state.trail.story, record.state.trail.story);
        state = resumed.state;
      };
      checkpoint();
      if (slow) {
        state.elapsedMinutes = 21 * 1440;
        const day = new Date(state.startedAt + state.elapsedMinutes * 60_000).toISOString().slice(0, 10);
        state.tarotDay = state.dailyTarotSeenDay = day;
      }
      const total = slow ? 13 : 10;
      for (let index = 0; index < total; index++) {
        const target = state.trail.stages[index];
        // Arrival is supplied by the fixture; whole-route survival is deferred.
        state = { ...state, col: target.col, row: target.row, reserveKcal: record.survival.reserve_kcal,
          fatigue: 0, awakeHours: 0, walletCents: 0 };
        const info = { latitude: target.latitude, longitude: target.longitude, terrain: "place" };
        const cell = { terrain: "place", countryCodes: ["FR"] };
        if (clueActions(state).includes("rumor")) {
          state = trailClue(state, "rumor", cell, info, record.survival, record.economy);
          assert.equal(state.trail.index, index);
          checkpoint();
        }
        const options = clueActions(state);
        const kind = options.find(kind => !["photo", "buy", "rumor"].includes(kind));
        assert.ok(kind, `A free provider-independent clue is required at ${index}`);
        state = trailClue(state, kind, cell, info, record.survival, record.economy);
        if (state.trail.discovery.pending) {
          checkpoint();
          state = trailClue(state, "directions", cell, info, record.survival, record.economy);
        }
        assert.equal(state.trail.index, index + 1);
        assert.equal(state.ended, index === total - 1 ? "reunion" : null);
        checkpoint();
      }
      assert.equal(state.trail.completed, true);
      assert.equal(state.trail.index - 1, parentStage(state));
      assert.equal(state.trail.history.at(-1).next, null);
      assert.ok(state.trail.rumors.length >= 1);
    });
  }
}
