import test from "node:test";
import assert from "node:assert/strict";
import { renderQuestMap } from "../quest-map.mjs";
import { translate } from "../i18n.mjs";

function fixture(t, language = "en") {
  const previous = globalThis.document;
  const labels = [], fills = [], markers = [];
  const context = {
    fillRect(...args) { fills.push({ color: this.fillStyle, args }); },
    fillText(text) { labels.push(text); }, setLineDash() {}, beginPath() {},
    moveTo() {}, lineTo() {}, stroke() {}, fill() {},
    arc(x, y, radius) { markers.push({ x, y, radius }); },
  };
  class Element {
    children = [];
    isConnected = true;
    append(...children) { this.children.push(...children); }
    setAttribute(name, value) { this[name] = value; }
    getContext() { return context; }
  }
  globalThis.document = { createElement: () => new Element() };
  t.after(() => { globalThis.document = previous; });
  return { host: new Element(), labels, fills, markers,
    t: (key, args) => translate(language, key, args),
    state: { col: -100, row: 25 }, map: { cellSizeMeters: 200 },
    targets: [{ col: -97, row: 21, name: "Village library" }] };
}

for (const language of ["en", "fr"]) {
  test(`${language} quest map distinguishes the player and shows exact relative bearing and distance`, t => {
    const f = fixture(t, language);
    renderQuestMap(f.host, f.state, f.targets, f.map, f.t);
    assert.ok(f.labels.includes(f.t("quests.you")));
    assert.ok(f.labels.includes("1"));
    assert.ok(!f.labels.includes("2"));
    assert.equal(f.markers.length, 3);
    assert.ok(f.markers.every(({ x, y }) => x >= 0 && x <= 1200 && y >= 0 && y <= 800));
    assert.equal(f.markers.at(-2).radius, 20, "player halo is drawn after destination markers");
    const text = f.host.children.map(node => node.textContent).join(" ");
    assert.match(text, /1\. Village library/);
    assert.match(text, /1\.00 km/);
    assert.ok(text.includes(f.t("hintCompass.northeast")));
    assert.ok(text.includes(f.t("quests.mapNoTerrain")));
  });
}

test("cached terrain is rendered beneath visible player and destination markers", async t => {
  const f = fixture(t);
  let view;
  await renderQuestMap(f.host, f.state, f.targets, f.map, f.t, async request => {
    view = request;
    return { cells: [{ col: -100, row: 25, terrain: "forest" }],
      stride: 1, missing: false, sampled: false };
  });
  assert.deepEqual(view.stops.map(({ col, row }) => [col, row]), [[-100, 25], [-97, 21]]);
  assert.ok(f.fills.some(fill => fill.color === "#8eab78"));
  assert.equal(f.host.children.at(-1).textContent, f.t("journalMapCached"));
  assert.equal(f.labels.at(-1), f.t("quests.you"));
});

test("rerenders share a terrain request while moving the player refreshes its bounds", async t => {
  const f = fixture(t);
  let calls = 0;
  const load = async () => {
    calls++;
    return { cells: [], stride: 1, missing: true, sampled: false };
  };
  await Promise.all([
    renderQuestMap(f.host, f.state, f.targets, f.map, f.t, load),
    renderQuestMap(f.host, f.state, f.targets, f.map, f.t, load),
  ]);
  assert.equal(calls, 1);
  await renderQuestMap(f.host, { ...f.state, col: -99 }, f.targets, f.map, f.t, load);
  assert.equal(calls, 2);
});

test("terrain failure is visible, logged and retryable without losing navigation", async t => {
  const f = fixture(t);
  const errors = [];
  t.mock.method(console, "error", (...args) => errors.push(args));
  let calls = 0;
  const load = async () => {
    if (++calls === 1) throw new Error("HTTP 503");
    return { cells: [], stride: 1, missing: true, sampled: false };
  };
  await renderQuestMap(f.host, f.state, f.targets, f.map, f.t, load);
  assert.match(f.host.children.at(-1).textContent, /HTTP 503/);
  assert.equal(errors.length, 1);
  assert.ok(f.labels.includes("You"));
  await renderQuestMap(f.host, f.state, f.targets, f.map, f.t, load);
  assert.equal(calls, 2);
  assert.equal(f.host.children.at(-1).textContent, f.t("quests.mapNoTerrain"));
});

test("arrival has an explicit on-cell message rather than an arbitrary north bearing", t => {
  const f = fixture(t);
  renderQuestMap(f.host, f.state, [{ ...f.state, name: "Library" }], f.map, f.t);
  assert.match(f.host.children[2].textContent, /you are on the destination cell/);
});

test("a detached preview is not redrawn by a late terrain response", async t => {
  const f = fixture(t);
  let resolve;
  const request = renderQuestMap(f.host, f.state, f.targets, f.map, f.t,
    () => new Promise(done => { resolve = done; }));
  await Promise.resolve();
  f.host.children[0].isConnected = false;
  const count = f.labels.length;
  resolve({ cells: [], stride: 1, missing: true, sampled: false });
  await request;
  assert.equal(f.labels.length, count);
});
