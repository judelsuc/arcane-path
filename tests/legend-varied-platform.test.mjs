import test from "node:test";
import assert from "node:assert/strict";
import { generatePlatformLevel, PLATFORM_ARCHETYPES } from "../minigames/legend-layout.mjs";
import { platformLadders, createPlatformer, stepPlatformer } from "../minigames/legend-platformer.mjs";
import { VARIED_PLATFORM_VERSION, TREASURE_PLATFORM_VERSION, replayLegendSession } from "../legend-session.mjs";
import { variedPlatformRoute } from "./helpers/legend-varied-platform-route.mjs";

test("varied platforms use eight different room architectures per main path, including ladder-free routes", () => {
  const seen = new Set();
  for (let seed = 0; seed < 100; seed++) {
    const tier = ["modest", "notable", "exceptional"][seed % 3];
    const level = generatePlatformLevel({ seed, tier, paced: true, varied: true });
    assert.deepEqual(level, generatePlatformLevel({ seed, tier, paced: true, varied: true }));
    assert.equal(new Set(level.rooms.slice(0, 8).map(room => room.archetype)).size, 8);
    for (let start = 0; start < level.mainRooms; start += 8) {
      assert.equal(new Set(level.rooms.slice(start, start + 8).map(room => room.archetype)).size, 8);
    }
    assert.ok(level.rooms.every((room, index) => !index || room.archetype !== level.rooms[index - 1].archetype));
    assert.equal(level.version, 4);
    assert.ok(level.rooms.some(room => platformLadders(room).length === 0));
    assert.ok(level.rooms.some(room => platformLadders(room).length > 1));
    assert.ok(level.rooms.every(room => !platformLadders(room).some(ladder => ladder.x === 320 && ladder.top === 96)));
    for (const room of level.rooms) {
      seen.add(`${room.archetype}:${room.mirrored}`);
      for (const door of room.connections) {
        const back = level.rooms[door.target].connections.find(item => item.target === room.id);
        assert.deepEqual([door.arrivalX, door.arrivalY], [back.x, back.y]);
        for (const hazard of room.hazards) {
          if (door.y !== 262) continue;
          assert.ok(door.x + 18 <= hazard.x || door.x >= hazard.x + hazard.width,
            `trap overlaps ${room.archetype} doorway`);
        }
      }
    }
  }
  assert.equal(seen.size, PLATFORM_ARCHETYPES.length * 2);
});

test("short ladders stop at their actual lower landing rather than extending invisibly to the floor", () => {
  const { level, actions } = variedPlatformRoute(4);
  let state = createPlatformer({ level, healthMode: "journey" });
  let checked = false;
  for (const packet of actions) {
    for (let tick = 0; tick < packet.ticks; tick++) {
      state = stepPlatformer(state, packet.controls);
      const room = level.rooms[state.room];
      const ladder = platformLadders(room).find(ladder => ladder.bottom < 288 &&
        state.x + 18 > ladder.x - 12 && state.x < ladder.x + 12 &&
        state.y + 26 >= ladder.top && state.y + 26 < ladder.bottom);
      if (!ladder) continue;
      let descending = state;
      for (let i = 0; i < 100; i++) descending = stepPlatformer(descending, { down: true });
      assert.equal(descending.y, ladder.bottom - 26);
      checked = true;
      break;
    }
    if (checked) break;
  }
  assert.equal(checked, true);
});

test("real physics reaches mechanisms and treasure across varied layouts without damage", () => {
  for (const tier of ["modest", "notable", "exceptional"]) {
    for (let seed = 0; seed < (tier === "modest" ? 256 : 16); seed++) {
      const { actions, state } = variedPlatformRoute(seed, { tier, visitBranches: true, branches: seed % 5 });
      assert.equal(state.metrics.roomsVisited.length, state.level.rooms.length);
      if (tier === "modest" && seed % 5 === 2) {
        const replay = replayLegendSession({ contentVersion: VARIED_PLATFORM_VERSION, seed, actions });
        assert.deepEqual(replay, state);
        assert.equal(replay.completed, true);
      }
    }
  }
});

test("old treasure platform transcripts keep their exact layout and physics", () => {
  const old = replayLegendSession({ contentVersion: TREASURE_PLATFORM_VERSION, seed: 1, actions: [] });
  const varied = replayLegendSession({ contentVersion: VARIED_PLATFORM_VERSION, seed: 1, actions: [] });
  assert.equal(old.level.version, 3);
  assert.equal(old.level.rooms[0].ladder.x, 320);
  assert.equal(varied.level.version, 4);
  assert.notDeepEqual(varied.level, old.level);
});
