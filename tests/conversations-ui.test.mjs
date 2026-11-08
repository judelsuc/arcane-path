import test from "node:test";
import assert from "node:assert/strict";
import { setupConversations } from "../conversations-ui.mjs";
import { setupArtifactQuests } from "../artifacts-ui.mjs";
import { translate } from "../i18n.mjs";
import RUMOURS from "../public/artifact-rumours.json" with { type: "json" };

class Element {
  disabled = false;
  hidden = false;
  open = false;
  textContent = "";
  children = [];
  classList = { toggle() {} };
  events = {};
  setAttribute(name, value) { this[name] = value; }
  addEventListener(type, callback) { this.events[type] = callback; }
  click() { if (!this.disabled) return this.events.click?.(); }
  showModal() { this.open = true; }
  close() { this.open = false; this.events.close?.(); }
  focus() { this.focused = true; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
}

function portraitFixture(t, fetchPortrait, { profile, onCharacter, onArtifactRumour,
  role = "artisan", language = "en" } = {}) {
  const previous = globalThis.document, nodes = new Map(), revoked = [], errors = [];
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, new Element());
    return nodes.get(id);
  };
  globalThis.document = { getElementById: get, createElement: () => new Element(),
    querySelector: () => [...nodes.values()].find(node => node.open) ?? null };
  t.after(() => { globalThis.document = previous; });
  let created = 0;
  t.mock.method(URL, "createObjectURL", () => `blob:portrait-${++created}`);
  t.mock.method(URL, "revokeObjectURL", url => revoked.push(url));
  t.mock.method(console, "error", (...args) => errors.push(args));
  const current = { cell: { terrain: "major_road" },
    state: { serverJourney: { id: "a".repeat(32) }, journalAccess: "capability", col: 0, row: 0 },
    blocked: false };
  const character = { id: "b".repeat(32), name: "Camille Aubry", role,
    portrait: { status: "ready", ref: "portrait" }, ...(profile ? { profile } : {}) };
  const characters = {
    async list() { return { characters: [character], canCreate: false }; },
    portrait: fetchPortrait, async meet() {}, async exchange() { return { factIds: [] }; },
  };
  const ui = setupConversations((key, args) => translate(language, key, args),
    { context: () => current, characters, onCharacter, onArtifactRumour });
  return { ui, get, characters, current, revoked, errors, created: () => created,
    portrait: () => get("character-choices").children[0].children[0].children[0],
    status: () => get("character-choices").children[0].children[0].children[1].children[2] };
}

test("meeting a character with a quest opens their proposal and notifies the quest UI", async t => {
  const speakers = [];
  const fixture = portraitFixture(t, async () => new Blob(["portrait"]), {
    profile: { quest: { version: 1, template: "magician.workshop-trial", scope: "local" } },
    onCharacter: character => speakers.push(character.id),
  });

  await fixture.ui.open();
  await fixture.get("character-choices").children[0].children[0].click();
  assert.deepEqual(speakers, ["b".repeat(32)]);
  assert.equal(fixture.get("dialogue-services").hidden, false);
  assert.equal(fixture.get("conversation-character-reply").focused, true);
  assert.equal(fixture.get("conversation-options").open, false);
  assert.equal(fixture.get("conversation-dialog").open, true);
});

test("moving away clears the selected character before another quest can be requested", async t => {
  const f = portraitFixture(t, async () => new Blob(["portrait"]));
  await f.ui.open();
  await f.get("character-choices").children[0].children[0].click();
  assert.ok(f.ui.currentCharacter());
  f.current.state = { ...f.current.state, col: 1 };
  f.ui.localize();
  assert.equal(f.ui.currentCharacter(), undefined);
  assert.equal(f.get("conversation-dialog").open, false);
});

test("conversation replies contain only the character's in-world response", async t => {
  const fixture = portraitFixture(t, async () => new Blob(["portrait"]));
  fixture.characters.exchange = async () => ({ factIds: ["own_workshop"] });
  await fixture.ui.open();
  await fixture.get("character-choices").children[0].children[0].click();
  fixture.get("conversation-parent").click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fixture.get("conversation-character-reply").textContent,
    translate("en", "character.fact.own_workshop"));
  assert.doesNotMatch(fixture.get("conversation-character-reply").textContent,
    /tools below|game rules|not testimony/i);
});

for (const source of ["meeting", "topic"]) {
  test(`artifact story from a ${source} keeps the real conversation open during synchronization`, async t => {
    let artifacts, resolve;
    let pending = false;
    const rumour = { characterId: "b".repeat(32), artifactId: "hermit",
      eventId: "00000000-0000-4000-8000-000000000001" };
    const f = portraitFixture(t, async () => new Blob(["portrait"]), {
      onArtifactRumour: (message, character) => artifacts.hear(message, character),
    });
    document.documentElement = { lang: "en" };
    document.createTextNode = textContent => Object.assign(new Element(), { textContent });
    artifacts = setupArtifactQuests((key, args) => translate("en", key, args), {
      context: () => f.current,
      character: f.ui.currentCharacter,
      mutate: transform => { f.current.state = transform(f.current.state); return true; },
      lock(value) { f.current.blocked = value; f.ui.localize(); },
      client: {
        pending: () => pending,
        acknowledge() { pending = false; },
        async request(state, action) {
          assert.equal(action.type, "character-rumour");
          pending = true;
          await new Promise(done => { resolve = done; });
          return {
            state: { ...state, artifactRevision: 1, discovery: { version: 1, entries: [{
              targetType: "artifact", targetId: "hermit", targetRevision: "legend:1",
              evidenceKey: "legend", kind: "legend", precision: "text",
              facts: { artifact: "hermit", ...RUMOURS.hermit }, source: "character-artifact-legend",
              observedMinutes: 0, channels: ["npc"], availability: "current", contentVersion: "template-v1",
            }] } },
            revision: 1, offers: [], owned: [],
            conversationRumour: { ...rumour, clueRevision: null },
          };
        },
      },
    });
    if (source === "meeting") f.characters.meet = async () => ({ artifactRumour: rumour });
    f.characters.exchange = async (_state, _id, topic) => ({
      factIds: ["own_workshop"],
      ...(source === "topic" && topic === "artifacts" ? { artifactRumour: rumour } : {}),
    });
    await f.ui.open();
    await f.get("character-choices").children[0].children[0].click();
    if (source === "topic") f.get("conversation-artifacts").click();
    await new Promise(done => setImmediate(done));
    assert.equal(f.current.blocked, true);
    assert.equal(f.get("conversation-dialog").open, true);
    assert.equal(f.ui.currentCharacter()?.id, rumour.characterId);
    assert.equal(f.get("conversation-parent").disabled, true);
    assert.equal(f.get("conversation-character-status").textContent, translate("en", "conversation.wait"));
    f.get("conversation-options").open = true;
    f.ui.localize();
    assert.equal(f.get("conversation-dialog").open, true);
    resolve();
    await new Promise(done => setImmediate(done));
    assert.equal(f.current.blocked, false);
    assert.equal(f.get("conversation-dialog").open, true);
    assert.equal(f.get("conversation-options").open, true);
    assert.equal(f.get("conversation-parent").disabled, false);
    assert.equal(f.get("conversation-character-status").textContent, "");
    assert.equal(f.get("conversation-artifact-rumour").hidden, false);
    assert.equal(f.get("conversation-artifact-rumour").children[0].textContent, RUMOURS.hermit.en);
    assert.equal(f.errors.length, 0);
  });
}

test("temporary locks retain the selector and in-flight meeting, but prevent new actions", async t => {
  const f = portraitFixture(t, async () => new Blob(["portrait"]));
  let resolve;
  f.characters.meet = async () => new Promise(done => { resolve = done; });
  await f.ui.open();
  f.current.blocked = true;
  f.ui.localize();
  assert.equal(f.get("character-selector-dialog").open, true);
  await f.get("character-choices").children[0].children[0].click();
  assert.equal(resolve, undefined);
  f.current.blocked = false;
  f.ui.localize();
  const choosing = f.get("character-choices").children[0].children[0].click();
  f.current.blocked = true;
  f.ui.localize();
  resolve();
  await choosing;
  assert.equal(f.get("conversation-dialog").open, true);
  assert.ok(f.ui.currentCharacter());
  f.get("conversation-close").click();
  assert.equal(f.get("conversation-dialog").open, false);
});

for (const [reason, invalidate] of [
  ["journey ended", current => { current.state.ended = "death"; }],
  ["water", current => { current.cell.terrain = "water"; }],
  ["unavailable cell", current => { current.cell.unavailable = true; }],
  ["missing access", current => { current.state.journalAccess = null; }],
]) {
  test(`${reason} still closes the dialog during a temporary lock`, async t => {
    const f = portraitFixture(t, async () => new Blob(["portrait"]));
    await f.ui.open();
    await f.get("character-choices").children[0].children[0].click();
    f.current.blocked = true;
    invalidate(f.current);
    f.ui.localize();
    assert.equal(f.get("conversation-dialog").open, false);
    assert.equal(f.ui.currentCharacter(), undefined);
  });
}

test("choosing a person starts a template exchange without a topic click", async t => {
  const f = portraitFixture(t, async () => new Blob(["portrait"]));
  const calls = [];
  let resolve;
  f.characters.exchange = async (_state, id, topic) => {
    calls.push({ id, topic });
    return new Promise(done => { resolve = done; });
  };
  await f.ui.open();
  await f.get("character-choices").children[0].children[0].click();
  assert.deepEqual(calls, [{ id: "b".repeat(32), topic: "services" }]);
  assert.equal(f.get("conversation-character-reply").textContent,
    translate("en", "character.opening.artisan"));
  assert.doesNotMatch(f.get("conversation-intro").textContent, /what would you like/i);
  resolve({ factIds: ["own_workshop"] });
  await new Promise(done => setImmediate(done));
  assert.equal(f.get("conversation-character-reply").textContent,
    translate("en", "character.fact.own_workshop"));
});

const occupationalFacts = {
  artisan: "own_workshop", gardener: "own_garden", bookseller: "own_bookstall",
  traveller: "familiar_local_roads", baker: "own_bakery", innkeeper: "own_inn",
  farmer: "own_farm", courier: "own_deliveries", musician: "own_music",
  herbalist: "own_herbs", carpenter: "own_carpentry", teacher: "own_school",
  beekeeper: "own_hives", shepherd: "own_flock", potter: "own_pottery",
  weaver: "own_weaving", tailor: "own_tailoring", cobbler: "own_shoe_repairs",
  blacksmith: "own_forge", miller: "own_mill", cook: "own_kitchen",
  grocer: "own_grocery", florist: "own_flowers", guide: "own_guiding",
  fisher: "own_fishing", cheesemaker: "own_cheese", orchardist: "own_orchard",
  vintner: "own_vineyard", brewer: "own_brewery", barista: "own_cafe",
  painter: "own_painting", sculptor: "own_sculpture", photographer: "own_photography",
  storyteller: "own_stories", librarian: "own_library", archivist: "own_archives",
  clockmaker: "own_clocks", locksmith: "own_locks", mason: "own_masonry",
  roofer: "own_roofing", cooper: "own_barrels", wheelwright: "own_wheels",
  basketmaker: "own_baskets", leatherworker: "own_leatherwork", soapmaker: "own_soap",
  candlemaker: "own_candles", ferryman: "own_ferry", stationmaster: "own_station",
};
for (const language of ["en", "fr"]) {
  for (const [role, fact] of Object.entries(occupationalFacts)) {
    test(`${language} ${role} has a localized job, opening and automatic factual reply`, async t => {
      const f = portraitFixture(t, async () => new Blob(["portrait"]), { role, language });
      f.characters.exchange = async () => ({ factIds: [fact] });
      for (const key of [`character.role.${role}`, `character.opening.${role}`, `character.fact.${fact}`]) {
        assert.notEqual(translate(language, key), key);
      }
      await f.ui.open();
      await f.get("character-choices").children[0].children[0].click();
      await new Promise(done => setImmediate(done));
      assert.equal(f.get("conversation-context").textContent,
        translate(language, "character.identity", { name: "Camille Aubry",
          role: translate(language, `character.role.${role}`) }));
      assert.equal(f.get("conversation-character-reply").textContent,
        translate(language, `character.fact.${fact}`));
    });
  }
}

test("a late opening exchange cannot replace a newer topic's reply", async t => {
  const f = portraitFixture(t, async () => new Blob(["portrait"]));
  let resolveOpening;
  f.characters.exchange = async (_state, _id, topic) => topic === "services"
    ? new Promise(done => { resolveOpening = done; }) : { factIds: ["own_garden"] };
  await f.ui.open();
  await f.get("character-choices").children[0].children[0].click();
  f.get("conversation-notebooks").click();
  await new Promise(done => setImmediate(done));
  resolveOpening({ factIds: ["own_workshop"] });
  await new Promise(done => setImmediate(done));
  assert.equal(f.get("conversation-character-reply").textContent,
    translate("en", "character.fact.own_garden"));
});

test("reopening the same person ignores an earlier meeting's unfinished exchange", async t => {
  const f = portraitFixture(t, async () => new Blob(["portrait"]));
  const replies = [];
  f.characters.exchange = async () => new Promise(done => replies.push(done));
  await f.ui.open();
  await f.get("character-choices").children[0].children[0].click();
  await f.get("conversation-back").click();
  await f.get("character-choices").children[0].children[0].click();
  replies[1]({ factIds: ["own_garden"] });
  await new Promise(done => setImmediate(done));
  replies[0]({ factIds: ["own_workshop"] });
  await new Promise(done => setImmediate(done));
  assert.equal(f.get("conversation-character-reply").textContent,
    translate("en", "character.fact.own_garden"));
});

test("conversation localization does not hide investigation groups while the hub is open", t => {
  const f = portraitFixture(t, async () => new Blob(["portrait"]));
  const panels = ["dialogue-parent", "dialogue-directions", "dialogue-services",
    "dialogue-journals", "dialogue-artifacts"].map(id => f.get(id));
  for (const panel of panels) panel.hidden = false;
  f.get("investigation-dialog").showModal();
  f.ui.localize();
  assert.ok(panels.every(panel => panel.hidden === false));
});

test("spontaneous artifact speech is forwarded on meetings and ordinary topics, without asking for an object", async t => {
  const heard = [], rumour = { characterId: "b".repeat(32),
    eventId: "00000000-0000-4000-8000-000000000001", artifactId: "hermit" };
  const f = portraitFixture(t, async () => new Blob(["portrait"]), {
    onArtifactRumour: (message, character) => heard.push([message, character.id]),
  });
  f.characters.meet = async () => ({ artifactRumour: rumour });
  f.characters.exchange = async () => ({ factIds: [], artifactRumour: { ...rumour,
    eventId: "00000000-0000-4000-8000-000000000002" } });
  await f.ui.open();
  await f.get("character-choices").children[0].children[0].click();
  assert.deepEqual(heard[0], [rumour, rumour.characterId]);
  assert.equal(heard.length, 2);
  f.get("conversation-notebooks").click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(heard.length, 3);
  assert.equal(heard[1][0].eventId, "00000000-0000-4000-8000-000000000002");
  assert.equal(f.get("dialogue-journals").hidden, false);
});
test("portrait fetch failure is labelled visibly and reported without blocking dialogue", async t => {
  const fixture = portraitFixture(t, async () => { throw new Error("storage unavailable"); });
  await fixture.ui.open();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fixture.status().textContent, translate("en", "character.portrait.failed"));
  assert.equal(fixture.portrait()["aria-label"], translate("en", "character.portrait.failed"));
  assert.equal(fixture.errors.length, 1);
  await fixture.get("character-choices").children[0].children[0].click();
  assert.equal(fixture.get("conversation-dialog").open, true);
});

test("portrait decode failure revokes URL and replaces both ready labels", async t => {
  const fixture = portraitFixture(t, async () => new Blob(["image"]));
  await fixture.ui.open();
  await new Promise(resolve => setImmediate(resolve));
  const image = fixture.portrait().children[0];
  image.events.error();
  assert.deepEqual(fixture.revoked, ["blob:portrait-1"]);
  assert.equal(fixture.status().textContent, translate("en", "character.portrait.failed"));
  assert.equal(fixture.portrait()["aria-label"], translate("en", "character.portrait.failed"));
  assert.equal(fixture.errors.length, 1);
});

test("portrait URLs are revoked on refresh and close", async t => {
  const fixture = portraitFixture(t, async () => new Blob(["image"]));
  await fixture.ui.open();
  await new Promise(resolve => setImmediate(resolve));
  await fixture.get("character-choices").children[0].children[0].click();
  assert.deepEqual(fixture.revoked, ["blob:portrait-1"]);
  await fixture.get("conversation-back").click();
  await new Promise(resolve => setImmediate(resolve));
  fixture.get("character-selector-close").click();
  assert.deepEqual(fixture.revoked, ["blob:portrait-1", "blob:portrait-2"]);
});

test("stale selector or conversation dialogs are closed if the travel context disappears", async t => {
  const previous = globalThis.document, nodes = new Map();
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, new Element());
    return nodes.get(id);
  };
  globalThis.document = { getElementById: get, createElement: () => new Element(),
    querySelector: () => [...nodes.values()].find(node => node.open) ?? null };
  t.after(() => { globalThis.document = previous; });
  let current = { cell: { terrain: "major_road" },
    state: { serverJourney: { id: "a".repeat(32) }, journalAccess: "capability", col: 0, row: 0 },
    blocked: false };
  const ui = setupConversations((key, args) => translate("en", key, args), {
    context: () => current,
    characters: { async list() { return { characters: [], canCreate: false }; } },
  });
  await ui.open();
  get("character-selector-dialog").showModal();
  get("conversation-dialog").showModal();
  current = null;
  ui.localize();
  assert.equal(get("character-selector-dialog").open, false);
  assert.equal(get("conversation-dialog").open, false);
});

test("portrait responses arriving after close or refresh cannot leak object URLs", async t => {
  const pending = [];
  const fixture = portraitFixture(t, () => new Promise(resolve => pending.push(resolve)));
  await fixture.ui.open();
  fixture.get("character-selector-close").click();
  pending[0](new Blob(["image"]));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fixture.created(), 0);
  await fixture.ui.open();
  await fixture.get("character-choices").children[0].children[0].click();
  await fixture.get("conversation-back").click();
  pending[1](new Blob(["stale-image"]));
  pending[2](new Blob(["current-image"]));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fixture.created(), 1);
  fixture.get("character-selector-close").click();
  assert.deepEqual(fixture.revoked, ["blob:portrait-1"]);
});

test("the first meeting is not greeted as a returning visitor", async t => {
  const fixture = portraitFixture(t, async () => new Blob(["image"]));
  let meetings = 0;
  fixture.characters.meet = async () => ({
    familiarity: { known: true, meetings: ++meetings },
  });
  await fixture.ui.open();
  await fixture.get("character-choices").children[0].children[0].click();
  assert.doesNotMatch(fixture.get("conversation-intro").textContent, /remembers you/);
  await fixture.get("conversation-back").click();
  await fixture.get("character-choices").children[0].children[0].click();
  assert.match(fixture.get("conversation-intro").textContent, /remembers you/);
  fixture.get("conversation-close").click();
});

for (const language of ["fr", "en"]) {
  test(`${language} returning-player familiarity and factual visitor mention are visible`, async t => {
    const previous = globalThis.document, nodes = new Map();
    const get = id => {
      if (!nodes.has(id)) nodes.set(id, new Element());
      return nodes.get(id);
    };
    globalThis.document = { getElementById: get, createElement: () => new Element(),
      querySelector: () => [...nodes.values()].find(node => node.open) ?? null };
    t.after(() => { globalThis.document = previous; });
    const character = { id: "b".repeat(32), name: "Zoé Vidal", role: "artisan",
      portrait: { status: "failed" }, familiarity: { known: true, meetings: 1002 } };
    const ui = setupConversations((key, args) => translate(language, key, args), {
      context: () => ({ state: { serverJourney: { id: "a".repeat(32) }, journalAccess: "private" },
        cell: { terrain: "major_road" }, blocked: false }),
      characters: {
        async list() { return { characters: [character], canCreate: false }; },
        async meet() { return { familiarity: { known: true, meetings: 1003 } }; },
        async exchange() { return { factIds: ["own_workshop"],
          visitorFacts: [{ type: "met", name: "Camille" }] }; },
      },
    });
    await ui.open();
    await get("character-choices").children[0].children[0].click();
    assert.match(get("conversation-intro").textContent,
      language === "fr" ? /se souvient de vous/ : /remembers you/);
    get("conversation-services").click();
    await new Promise(resolve => setImmediate(resolve));
    const reply = get("conversation-character-reply").textContent;
    assert.match(reply, /Camille/);
    assert.match(reply, language === "fr" ? /aussi venu me parler/ : /came to speak with me, too/);
    assert.doesNotMatch(reply, /1003|quest|private/);
    assert.match(translate(language, "character.publicNamesNotice"),
      language === "fr" ? /automatiquement/ : /automatically/);
  });
}

for (const language of ["fr", "en"]) {
  test(`${language} character selector preserves topics and forwards existing actions`, async t => {
    const previous = globalThis.document, nodes = new Map();
    const get = id => {
      if (!nodes.has(id)) nodes.set(id, new Element());
      return nodes.get(id);
    };
    globalThis.document = { getElementById: get, createElement: () => new Element(),
      querySelector: () => [...nodes.values()].find(node => node.open) ?? null };
    t.after(() => { globalThis.document = previous; });
    const current = { cell: { terrain: "place", settlements: [{ osmId: "node/123", name: "Firmi" }] },
      state: { elapsedMinutes: 60, walletCents: 1000, ended: null,
        serverJourney: { id: "a".repeat(32) }, journalAccess: "capability" }, blocked: false };
    const before = structuredClone(current);
    let listCalls = 0, createCalls = 0, meetCalls = 0, idCalls = 0;
    const submittedRequestIds = [];
    const people = [{ id: "b".repeat(32), name: "Camille Aubry", role: "artisan",
      location: { kind: "town" }, portrait: { status: "failed" },
      knowledge: { topics: ["parent", "clues", "notebooks", "artifacts", "services"],
        parentWitnesses: ["stage-0"] } }];
    const createdPerson = { ...people[0], id: "c".repeat(32), name: "Zoé Vidal" };
    const characters = {
      newRequestId: () => `request-${++idCalls}`,
      async list() { listCalls++; return { characters: people, canCreate: true }; },
      async create(state, id) {
        createCalls++;
        submittedRequestIds.push(id);
        if (createCalls === 1) throw new Error("retryable");
        return createdPerson;
      },
      async meet() { meetCalls++; },
      async exchange(state, characterId, topic) {
        return { factIds: topic === "services" ? ["own_workshop"] : [] };
      },
    };
    const ui = setupConversations((key, args) => translate(language, key, args),
      { context: () => current, characters });
    ui.localize();
    assert.equal(translate(language, "conversation.clues"),
      language === "fr" ? "Demander son chemin" : "Ask for directions");
    await get("open-conversation").click();
    assert.equal(get("character-selector-dialog").open, true);
    assert.equal(listCalls, 1);
    assert.equal(createCalls, 0);
    assert.equal(get("character-choices").children.length, 1);
    await get("character-choices").children[0].children[0].click();
    assert.equal(get("conversation-dialog").open, true);
    assert.match(get("conversation-context").textContent, /Camille Aubry/);
    assert.equal(meetCalls, 1);
    await get("conversation-back").click();
    assert.equal(get("character-selector-dialog").open, true);
    await get("character-create").click();
    assert.equal(createCalls, 1);
    assert.equal(idCalls, 1);
    await get("character-create").click();
    assert.equal(submittedRequestIds[0], submittedRequestIds[1]);
    assert.equal(meetCalls, 2);
    assert.equal(get("conversation-dialog").open, true);
    assert.match(get("conversation-context").textContent, /Zoé Vidal/);
    await get("conversation-back").click();
    await get("character-choices").children[0].children[0].click();
    get("conversation-artifacts").click();
    assert.equal(get("conversation-reply").hidden, true);
    assert.equal(get("conversation-reply").textContent, "");
    assert.deepEqual(current, before);
    for (const [topic, pane] of Object.entries({ parent: "dialogue-parent",
      notebooks: "dialogue-journals", artifacts: "dialogue-artifacts", services: "dialogue-services" })) {
      get(`conversation-${topic}`).click();
      assert.equal(get("conversation-dialog").open, true);
      assert.equal(get(pane).hidden, false);
      if (topic === "services") {
        await Promise.resolve();
        assert.match(get("conversation-character-reply").textContent,
          language === "fr" ? /atelier de réparation/ : /repair workshop/);
      }
    }

    for (const [topic, target] of Object.entries({
      shelter: "sleep-travel", food: "eat-travel", work: "open-earn-money",
      transport: "open-journey-world", town: "open-town", clues: "open-investigation",
    })) {
      let invoked = false;
      get(target).events.click = () => {
        assert.equal(get("conversation-dialog").open, false);
        invoked = true;
      };
      get(`conversation-${topic}`).click();
      assert.equal(invoked, true, topic);
      await get("open-conversation").click();
      await get("character-choices").children[0].children[0].click();
    }
    get("conversation-parent").click();
    assert.equal(get("conversation-reply").hidden, true);
    get("conversation-close").click();
    assert.equal(get("open-conversation").focused, true);
    get("town-dialog").showModal();
    await get("town-conversation").click();
    assert.equal(get("character-selector-dialog").open, true);
    assert.equal(get("town-dialog").open, false);
    assert.equal(get("conversation-dialog").open, false);
    ui.reset();
    current.cell = { terrain: "forest" };
    ui.localize();
    assert.equal(get("open-conversation").disabled, false);
    assert.equal(get("character-selector-context").textContent,
      translate(language, "conversation.countryside"));
    current.cell = { terrain: "water" };
    ui.localize();
    assert.equal(get("open-conversation").disabled, true);
    assert.equal(get("town-conversation").disabled, true);
    await get("open-conversation").click();
    assert.equal(get("character-selector-dialog").open, false);
    current.cell = before.cell;
    current.blocked = true;
    ui.localize();
    assert.equal(get("conversation-transport").disabled, true);
  });
}

test("unknown character knowledge does not remove player-authorized dialogue tools", async t => {
  const previous = globalThis.document, nodes = new Map();
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, new Element());
    return nodes.get(id);
  };
  globalThis.document = { getElementById: get, createElement: () => new Element(),
    querySelector: () => [...nodes.values()].find(node => node.open) ?? null };
  t.after(() => { globalThis.document = previous; });
  const current = { cell: { terrain: "place", settlements: [{ osmId: "node/123", name: "Firmi" }] },
    state: { serverJourney: { id: "a".repeat(32) }, journalAccess: "capability" }, blocked: false };
  const existingQuestTool = new Element();
  existingQuestTool.textContent = "Previously authorized clue search";
  get("dialogue-directions").append(existingQuestTool);
  const calls = [];
  const character = { id: "b".repeat(32), name: "Camille Aubry", role: "artisan",
    portrait: { status: "failed" }, knowledge: { topics: [], parentWitnesses: [] } };
  const characters = {
    newRequestId: () => "00000000-0000-4000-8000-000000000001",
    async list() { return { characters: [character], canCreate: false }; },
    async meet() {},
    async exchange(state, characterId, topic) {
      calls.push({ characterId, topic });
      return { factIds: [] };
    },
  };
  let directionsOpened = 0;
  const ui = setupConversations((key, args) => translate("en", key, args),
    { context: () => current, characters, onDirections: () => {
      assert.equal(get("conversation-dialog").open, false);
      directionsOpened++;
      get("investigation-dialog").showModal();
      get("dialogue-directions").hidden = false;
    } });
  await ui.open();
  await get("character-choices").children[0].children[0].click();
  get("conversation-clues").click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(get("dialogue-directions").hidden, false);
  assert.equal(get("dialogue-directions").children[0], existingQuestTool);
  assert.equal(directionsOpened, 1);
  assert.deepEqual(calls.map(call => call.topic), ["services"]);
  get("investigation-dialog").close();
  await ui.open();
  await get("character-choices").children[0].children[0].click();
  get("conversation-parent").click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(get("dialogue-parent").hidden, false);
  assert.match(get("conversation-character-reply").textContent, /don't know your parent well enough/);
  get("conversation-artifacts").click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(get("dialogue-artifacts").hidden, false);
  assert.equal(get("conversation-reply").hidden, true);
  assert.match(get("conversation-character-reply").textContent, /don't know enough about that/);
  assert.equal(get("conversation-reply").textContent, "");
  ui.reset();
});

test("selector sends journey presence and explains absence or a newly met character", async t => {
  const previous = globalThis.document, nodes = new Map();
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, new Element());
    return nodes.get(id);
  };
  globalThis.document = { getElementById: get, createElement: () => new Element(),
    querySelector: () => null };
  t.after(() => { globalThis.document = previous; });
  const startedAt = Date.UTC(2026, 5, 21, 12, 0);
  const current = { cell: { terrain: "grass" }, info: { latitude: 44.5, longitude: 2.2 },
    state: { serverJourney: { id: "a".repeat(32) }, journalAccess: "capability", col: 0, row: 0,
      startedAt, elapsedMinutes: 0 }, blocked: false };
  const person = { id: "b".repeat(32), name: "Camille Aubry", role: "artisan", portrait: { status: "failed" } };
  const presences = [];
  let reply = { characters: [], canCreate: true, absent: true, location: { kind: "countryside" } };
  const characters = { async list(state, presence) { presences.push(presence); return reply; } };
  const ui = setupConversations((key, args) => translate("en", key, args), { context: () => current, characters });
  await ui.open();
  assert.deepEqual(presences[0], { phase: "day", hour: Math.floor(startedAt / 3_600_000) });
  assert.equal(get("character-selector-status").textContent, translate("en", "character.absentCanCreate"));
  assert.equal(get("character-create").hidden, false);
  get("character-selector-dialog").close();
  current.state.elapsedMinutes = 12 * 60;
  reply = { characters: [person], canCreate: false, arrived: person.id, limit: 1,
    location: { kind: "countryside" } };
  await ui.open();
  assert.equal(presences[1].phase, "night");
  assert.equal(presences[1].hour, presences[0].hour + 12);
  assert.equal(get("character-selector-status").textContent,
    translate("en", "character.arrived", { name: "Camille Aubry" }));
  assert.equal(get("character-choices").children.length, 1);
});

test("empty towns never claim someone is available and explain blocked creation", async t => {
  const previous = globalThis.document, nodes = new Map();
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, new Element());
    return nodes.get(id);
  };
  globalThis.document = { getElementById: get, createElement: () => new Element(),
    querySelector: () => null };
  t.after(() => { globalThis.document = previous; });
  const current = { cell: { terrain: "place", settlements: [{ osmId: "node/123", name: "Schengen" }] },
    state: { serverJourney: { id: "a".repeat(32) }, journalAccess: "capability", col: 24, row: -9 },
    blocked: false };
  let reply = { characters: [], canCreate: false, location: { kind: "town" },
    unavailableReason: "naming-locale-unavailable" };
  for (const language of ["fr", "en"]) {
    const ui = setupConversations((key, args) => translate(language, key, args), {
      context: () => current, characters: { async list() { return reply; } },
    });
    await ui.open();
    assert.equal(get("character-selector-context").textContent,
      translate(language, "conversation.inTown", { town: "Schengen" }));
    assert.equal(get("character-selector-status").textContent, translate(language, "character.namingUnavailable"));
    assert.equal(get("character-create").hidden, true);
    ui.reset();
  }
  reply = { characters: [], canCreate: false, absent: true, location: { kind: "town" } };
  const ui = setupConversations((key, args) => translate("en", key, args), {
    context: () => current, characters: { async list() { return reply; } },
  });
  await ui.open();
  assert.equal(get("character-selector-status").textContent, translate("en", "character.absent"));
  assert.equal(get("character-create").hidden, true);
  get("character-selector-dialog").close();
  reply = { characters: [], canCreate: true, location: { kind: "town" } };
  await ui.open();
  assert.equal(get("character-selector-status").textContent, translate("en", "character.empty"));
  assert.equal(get("character-create").hidden, false);
});
