import test from "node:test";
import assert from "node:assert/strict";
import { diagnosticSnapshot } from "../change-request-snapshot.mjs";
import { setupChangeRequests } from "../change-requests-ui.mjs";
import { translate } from "../i18n.mjs";

class Element {
  events = {};
  value = "";
  disabled = false;
  open = false;
  hidden = false;
  textContent = "";
  isConnected = true;
  addEventListener(type, handler) { this.events[type] = handler; }
  removeAttribute(name) { delete this[name]; }
  showModal() { this.open = true; }
  close() { this.open = false; this.events.close?.(); }
  focus() {}
  getBoundingClientRect() { return { width: 400 }; }
}
const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture(t, { send = async payload => Response.json({ id: payload.id, status: "submitted" }),
  failCapture = false, language = "en" } = {}) {
  const previous = globalThis.document, nodes = new Map(), revoked = [], calls = [], captures = [];
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, new Element());
    return nodes.get(id);
  };
  const doc = { documentElement: { lang: language }, activeElement: get("opener"),
    getElementById: get, querySelectorAll: () => [], addEventListener() {} };
  globalThis.document = doc;
  t.after(() => { globalThis.document = previous; });
  t.mock.method(URL, "createObjectURL", () => "blob:report");
  t.mock.method(URL, "revokeObjectURL", value => revoked.push(value));
  t.mock.method(console, "error", () => {});
  const state = { col: 2, row: 3, health: 80, journalAccess: "secret-capability",
    serverJourney: { id: "a".repeat(32) }, trail: { answers: ["hidden"] }, otherPlayer: { name: "private" } };
  const ui = setupChangeRequests((key, args) => translate(language, key, args), {
    context: () => state, newId: () => "b".repeat(32),
    capture(current, build) {
      captures.push({ open: get("change-request-dialog").open, col: current.col, build });
      if (failCapture) throw new Error("Visible image unavailable");
      const snapshot = diagnosticSnapshot(current, { doc,
        viewport: { innerWidth: 800, innerHeight: 600, devicePixelRatio: 2 }, build });
      return { snapshot, image: async () => new Blob(["png-fixture"], { type: "image/png" }) };
    },
    fetcher: async (url, options) => {
      if (url === "/public/release.json") return Response.json({ commit: "c".repeat(40), version: 1 });
      const payload = JSON.parse(options.body);
      calls.push({ payload, headers: options.headers });
      return send(payload);
    },
  });
  return { ui, get, calls, captures, state, revoked };
}
const event = { preventDefault() {} };

test("diagnostic projection never dumps state, private keys, hidden answers or arbitrary browser storage", () => {
  const state = { col: -2, row: 3, health: 10, fatigue: 50, elapsedMinutes: 45, walletCents: 500,
    journalAccess: "TOP SECRET", trail: { answer: "HIDDEN ANSWER" },
    serverJourney: { id: "PRIVATE ID" }, otherPlayer: { name: "OTHER PRIVATE" },
    localStorage: { password: "PRIVATE PASSWORD" } };
  const doc = { documentElement: { lang: "en" }, querySelectorAll: () => [{ id: "town-dialog" }],
    getElementById: () => null };
  const projection = diagnosticSnapshot(state, { doc,
    viewport: { innerWidth: 375, innerHeight: 812, devicePixelRatio: 3, scrollY: 123 },
    build: { commit: "a".repeat(40), version: 1 } });
  assert.deepEqual(projection.game, { col: -2, row: 3, health: 10, fatigue: 50,
    elapsedMinutes: 45, walletCents: 500 });
  const encoded = JSON.stringify(projection);
  for (const secret of ["TOP SECRET", "HIDDEN ANSWER", "PRIVATE ID", "OTHER PRIVATE", "PRIVATE PASSWORD"]) {
    assert.ok(!encoded.includes(secret));
  }
  assert.deepEqual(projection.visible.dialogs, ["town-dialog"]);
  assert.equal(projection.appearance.tileset, "ascii");
});

for (const language of ["en", "fr"]) {
  test(`${language} evidence freezes before form, cancellation publishes nothing and releases preview`, async t => {
    const f = fixture(t, { language });
    await settle();
    await f.ui.open();
    assert.equal(f.captures[0].open, false);
    assert.equal(f.get("change-request-dialog").open, true);
    assert.equal(f.get("change-request-confirm").disabled, true);
    assert.equal(f.get("change-request-image").src, "blob:report");
    f.state.col = 9;
    assert.equal(JSON.parse(f.get("change-request-snapshot").textContent).game.col, 2);
    assert.doesNotMatch(f.get("change-request-snapshot").textContent, /secret-capability|hidden|otherPlayer/);
    f.get("change-request-cancel").events.click();
    assert.equal(f.get("change-request-dialog").open, false);
    assert.equal(f.calls.length, 0);
    assert.deepEqual(f.revoked, ["blob:report"]);
    assert.match(translate(language, "changeRequest.privacy"), /90/);
  });
}

test("explicit confirmation persists one immutable draft, ignores double click and acknowledges only server receipt", async t => {
  let release;
  const f = fixture(t, { send: payload => new Promise(resolve => {
    release = () => resolve(Response.json({ id: payload.id, status: "submitted" }));
  }) });
  await f.ui.open();
  f.get("change-request-comment").value = "Small buttons";
  f.get("change-request-comment").events.input();
  const first = f.get("change-request-form").events.submit(event);
  const duplicate = f.get("change-request-form").events.submit(event);
  await settle();
  assert.equal(f.calls.length, 1);
  assert.doesNotMatch(f.get("change-request-status").textContent, /recorded/);
  assert.equal(f.get("change-request-cancel").disabled, true);
  assert.equal(f.calls[0].headers["X-Journal-Capability"], "secret-capability");
  assert.doesNotMatch(JSON.stringify(f.calls[0].payload), /secret-capability|hidden/);
  release();
  await Promise.all([first, duplicate]);
  assert.match(f.get("change-request-status").textContent, /Request recorded: b{32}/);
  assert.equal(f.get("change-request-confirm").disabled, true);
  f.get("change-request-cancel").events.click();
});

test("network failure retains identical attachments, comment and ID for retry even if journey changes", async t => {
  let attempts = 0;
  const f = fixture(t, { send: async payload => {
    if (++attempts === 1) throw new Error("Network disconnected after upload");
    return Response.json({ id: payload.id, status: "submitted" });
  } });
  await f.ui.open();
  f.get("change-request-comment").value = "A proposed change";
  await f.get("change-request-form").events.submit(event);
  assert.match(f.get("change-request-status").textContent, /not confirmed/);
  assert.equal(f.get("change-request-comment").disabled, true);
  assert.equal(f.get("change-request-confirm").disabled, false);
  f.state.serverJourney.id = "d".repeat(32);
  f.state.journalAccess = "changed";
  await f.get("change-request-form").events.submit(event);
  assert.deepEqual(f.calls[0], f.calls[1]);
  assert.equal(f.calls[1].payload.comment, "A proposed change");
  f.get("change-request-cancel").events.click();
});

test("capture failure is explicit and cannot send an incomplete report", async t => {
  const f = fixture(t, { failCapture: true });
  await f.ui.open();
  assert.match(f.get("change-request-status").textContent, /Capture failed.*Visible image unavailable/);
  assert.equal(f.get("change-request-confirm").disabled, true);
  f.get("change-request-comment").value = "cannot capture";
  await f.get("change-request-form").events.submit(event);
  assert.equal(f.calls.length, 0);
  f.get("change-request-cancel").events.click();
});

test("disabled collection retains draft without claiming success", async t => {
  const f = fixture(t, { send: async () =>
    Response.json({ error: "Automatic deletion is not configured" }, { status: 503 }) });
  await f.ui.open();
  f.get("change-request-comment").value = "Useful idea";
  await f.get("change-request-form").events.submit(event);
  assert.match(f.get("change-request-status").textContent, /Automatic deletion is not configured/);
  assert.doesNotMatch(f.get("change-request-status").textContent, /Request recorded/);
  f.get("change-request-cancel").events.click();
});

test("mismatched server receipt cannot be shown as successful persistence", async t => {
  const f = fixture(t, { send: async () =>
    Response.json({ id: "c".repeat(32), status: "submitted" }) });
  await f.ui.open();
  f.get("change-request-comment").value = "A proposed change";
  await f.get("change-request-form").events.submit(event);
  assert.match(f.get("change-request-status").textContent, /Invalid submission acknowledgement/);
  assert.doesNotMatch(f.get("change-request-status").textContent, /Request recorded/);
  assert.equal(f.get("change-request-confirm").disabled, false);
  assert.equal(f.get("change-request-image").src, "blob:report");
  f.get("change-request-cancel").events.click();
});
