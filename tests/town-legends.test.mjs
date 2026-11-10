import test from "node:test";
import assert from "node:assert/strict";
import { createTownLegendsClient, townLegendIdentity } from "../town-legends.mjs";
import { composedReward } from "../legend-rewards.mjs";

const state = { col: 3, row: 4, serverJourney: { id: "a".repeat(32) }, journalAccess: "b".repeat(64) };
const entry = { townId: "node/42", town: "Firmi", eligible: true, seed: 1, format: "platform", contentStatus: "unprepared" };

test("town identity requires a prepared named OSM town and uses stable primary ordering", () => {
  const place = { terrain: "place", settlements: [{ osmId: "way/7", name: "Other" }, { osmId: "node/42", name: "Firmi" }] };
  assert.equal(townLegendIdentity(place), "node/42");
  for (const cell of [null, { ...place, unavailable: true }, { ...place, terrain: "forest" },
    { terrain: "place", settlements: [{ osmId: "invented", name: "Town" }] }]) assert.equal(townLegendIdentity(cell), null);
});

test("client submits current location with private authorization, never eligibility or a seed", async () => {
  let sent;
  const client = createTownLegendsClient({ fetcher: async (url, options) => {
    sent = { url, options };
    return { ok: true, json: async () => ({ version: 1, entry }) };
  } });
  assert.deepEqual(await client.discover(state), { version: 1, entry });
  assert.equal(sent.url, "/api/town-legends");
  assert.equal(sent.options.headers["X-Journal-Capability"], state.journalAccess);
  assert.deepEqual(JSON.parse(sent.options.body), { journey: state.serverJourney.id, action: "discover", location: { col: 3, row: 4 } });
  await assert.rejects(client.discover({}), /private server journey/);
});

test("invalid decisions, history pages and HTTP failures are surfaced", async () => {
  for (const bad of [{ ...entry, seed: -1 }, { ...entry, eligible: false }, { ...entry, format: "unknown" },
    { ...entry, contentStatus: "ready" }, { ...entry, town: "" }]) {
    const client = createTownLegendsClient({ fetcher: async () => ({ ok: true, json: async () => ({ version: 1, entry: bad }) }) });
    await assert.rejects(client.discover(state), /Invalid retained/);
  }
  const client = createTownLegendsClient({ fetcher: async () => ({
    ok: true, json: async () => ({ version: 1, entries: [entry, entry], cursor: null }),
  }) });
  await assert.rejects(client.list(state), /Invalid town legend history/);
  const failed = createTownLegendsClient({ fetcher: async () => ({ ok: false, status: 503,
    json: async () => ({ error: "Database unavailable" }) }) });
  await assert.rejects(failed.discover(state), /Database unavailable/);
});

test("negative decisions and valid paginated history remain explicit", async () => {
  const negative = { ...entry, eligible: false, seed: null, format: null, contentStatus: "none" };
  const client = createTownLegendsClient({ fetcher: async (_url, options) => {
    const body = JSON.parse(options.body);
    return { ok: true, json: async () => body.action === "discover"
      ? { version: 1, entry: negative } : { version: 1, entries: [entry], cursor: entry.townId } };
  } });
  assert.equal((await client.discover(state)).entry.eligible, false);
  assert.equal((await client.list(state)).cursor, entry.townId);
});

test("permanently assigned dungeon discoveries are valid retained legend entries", async () => {
  const dungeon = { ...entry, format: "dungeon" };
  const client = createTownLegendsClient({ fetcher: async () => ({
    ok: true, json: async () => ({ version: 1, entry: dungeon }),
  }) });
  assert.deepEqual((await client.discover(state)).entry, dungeon);
});
test("composed discoveries retain exact names and reject forged mechanics or rewards on ineligible towns", async () => {
  const named = { ...entry, reward: { ...composedReward(entry.seed),
    name: { en: "Copper Vigil", fr: "Veille de cuivre" } } };
  const clientFor = value => createTownLegendsClient({ fetcher: async () => ({
    ok: true, json: async () => ({ version: 1, entry: value }),
  }) });
  assert.deepEqual((await clientFor(named).discover(state)).entry, named);
  await assert.rejects(clientFor({ ...named, reward: { ...named.reward, effect: "coins" } }).discover(state),
    /Invalid retained treasure composition/);
  await assert.rejects(clientFor({ ...named, eligible: false, seed: null, format: null,
    contentStatus: "none" }).discover(state), /ineligible town/);
});

test("Look and inspect send only positions/identity and validate retained bilingual evidence", async () => {
  const search = { status: "found", clues: { en: ["North.", "Slate disc.", "Bell and four dots."],
    fr: ["Nord.", "Rondelle en ardoise.", "Cloche et quatre points."] },
  observations: [{ col: 3, row: 4, description: { en: "A slate disc.", fr: "Une rondelle en ardoise." }, found: true }] };
  const foundEntry = { ...entry, exploration: search };
  const observation = { townId: entry.townId, town: entry.town, location: { col: 3, row: 4 },
    description: search.observations[0].description, matches: true, found: true, entry: foundEntry };
  const sent = [];
  const client = createTownLegendsClient({ fetcher: async (_url, options) => {
    const body = JSON.parse(options.body);
    sent.push(body);
    return { ok: true, json: async () => body.action === "look" ? { version: 1, observations: [observation] }
      : { version: 1, entry: foundEntry } };
  } });
  assert.deepEqual((await client.look(state, { col: 3, row: 4 })).observations, [observation]);
  assert.deepEqual((await client.inspect(state, entry.townId)).entry, foundEntry);
  assert.deepEqual(sent, [
    { journey: state.serverJourney.id, action: "look", location: { col: 3, row: 4 }, target: { col: 3, row: 4 } },
    { journey: state.serverJourney.id, action: "inspect", location: { col: 3, row: 4 }, townId: entry.townId },
  ]);
  for (const bad of [{ ...observation, description: { en: "Missing French." } },
    { ...observation, location: { col: 9, row: 9 } }, { ...observation, matches: false },
    { ...observation, entry: { ...foundEntry, townId: "node/43" } }]) {
    const forged = createTownLegendsClient({ fetcher: async () => ({
      ok: true, json: async () => ({ version: 1, observations: [bad] }),
    }) });
    await assert.rejects(forged.look(state, { col: 3, row: 4 }), /Invalid/);
  }
  for (const bad of [{ ...search, status: "unprepared" },
    { ...search, observations: [...search.observations, ...search.observations] },
    { ...search, clues: { en: ["Only one."], fr: ["Une seule."] } }]) {
    const forged = createTownLegendsClient({ fetcher: async () => ({
      ok: true, json: async () => ({ version: 1, entry: { ...entry, exploration: bad } }),
    }) });
    await assert.rejects(forged.inspect(state, entry.townId), /Invalid retained adventure/);
  }
});

test("arrival guidance validates as context only and cannot claim to be an entrance", async () => {
  const observation = { townId: entry.townId, town: entry.town, location: { col: 3, row: 4 },
    description: { en: "Look north of town.", fr: "Regardez au nord du bourg." },
    contextual: true, matches: false, found: false };
  const clientFor = value => createTownLegendsClient({ fetcher: async () => ({
    ok: true, json: async () => ({ version: 1, observations: [value] }),
  }) });
  assert.deepEqual((await clientFor(observation).look(state, observation.location)).observations, [observation]);
  for (const extra of [{ contextual: "yes" }, { matches: true }, { found: true }]) {
    await assert.rejects(clientFor({ ...observation, ...extra }).look(state, observation.location),
      /Invalid adventure look/);
  }
});
