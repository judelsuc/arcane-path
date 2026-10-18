import test from "node:test";
import assert from "node:assert/strict";
import { mount, terrainPixels } from "../minigames/petanque-ui.mjs";
import { PETANQUE, advance, input, simulateThrow, createGame, groundHeight } from "../minigames/petanque.mjs";

function fakeDom() {
  const doc = { hidden: false, handlers: {},
    addEventListener(name, fn) { this.handlers[name] = fn; },
    removeEventListener(name, fn) { if (this.handlers[name] === fn) delete this.handlers[name]; },
    createElement(tagName) {
      return { ownerDocument: doc, tagName: tagName.toUpperCase(), children: [], attributes: {}, handlers: {}, style: {}, parent: null,
        append(...nodes) { for (const n of nodes) { if (typeof n === "object") n.parent = this; this.children.push(n); } },
        replaceChildren() { this.children = []; },
        setAttribute(name, value) { this.attributes[name] = String(value); },
        addEventListener(name, fn) { this.handlers[name] = fn; },
        removeEventListener(name, fn) { if (this.handlers[name] === fn) delete this.handlers[name]; },
        focus() { doc.focused = this; },
        getContext() {
          if (this.tagName !== "CANVAS") return null;
          return {
            createImageData: (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
            putImageData: image => { this.image = image; },
          };
        },
        remove() { const list = this.parent?.children; if (list) list.splice(list.indexOf(this), 1); this.parent = null; },
      };
    },
  };
  const container = doc.createElement("div");
  container.ownerDocument = doc;
  const all = node => [node, ...node.children.filter(c => typeof c === "object").flatMap(all)];
  const find = cls => all(container).find(n => String(n.className ?? "").split(" ").includes(cls));
  const inputs = () => all(container).filter(n => n.tagName === "INPUT");
  return { doc, container, find, inputs, all };
}

function setup(t, options = {}) {
  const dom = fakeDom();
  let tick = null, cleared = [];
  t.mock.method(globalThis, "setInterval", fn => { tick = fn; return 77; });
  t.mock.method(globalThis, "clearInterval", id => { cleared.push(id); });
  const clock = { now: 0 };
  const finishes = [];
  const ui = mount(dom.container, { random: () => 0.5, clock: () => clock.now, onFinish: r => finishes.push(r), ...options });
  return { ...dom, ui, clock, finishes, tick: () => tick(), cleared, key: (key, extra = {}) => {
    let prevented = false;
    dom.find("petanque-game").handlers.keydown({ key, target: dom.find("petanque-game"), preventDefault() { prevented = true; }, stopPropagation() {}, ...extra });
    return prevented;
  } };
}

function bestAim(jack, terrain) {
  let best = null;
  for (let angle = PETANQUE.angle.min; angle <= PETANQUE.angle.max; angle += PETANQUE.angle.step)
    for (let power = 0; power <= 100; power += PETANQUE.power.step) {
      const s = simulateThrow({ angle, power, terrain });
      if (s.out) continue;
      const d = Math.hypot(s.end.x - jack.x, s.end.y - jack.y);
      if (!best || d < best.d) best = { angle, power, d };
    }
  return best;
}

const cancelledResult = { completed: false, score: 0, opponentScore: 0, winner: null, maxScore: 3, cancelled: true, timedOut: false, earningsMultiplier: 1 };

test("Strength UI targets a settled boule for a once-only carreau at full power", t => {
  const s = setup(t, { language: "en", journeyCard: "strength", dailyCard: "strength" });
  assert.match(s.find("arcane-banner").textContent, /×1.1/);
  s.find("petanque-start").handlers.click();
  const steady = s.find("petanque-steady");
  assert.equal(steady.disabled, true);
  const power = s.inputs()[1];
  s.find("petanque-throw").handlers.click();
  waitForTurnOrCount(s);
  assert.equal(steady.disabled, false);
  power.value = "100"; power.handlers.input();
  steady.handlers.click();
  assert.equal(steady.attributes["aria-pressed"], "true");
  assert.match(s.find("petanque-status").textContent, /Choose a target.*75%.*Any power/);
  const target = s.find("petanque-played").children.find(node => node.className.includes("petanque-computer"));
  assert.ok(target);
  assert.equal(target.tabIndex, 0);
  assert.equal(target.attributes["aria-hidden"], "false");
  assert.equal(target.attributes.role, "button");
  target.handlers.click();
  assert.equal(steady.disabled, true);
  waitForTurnOrCount(s);
  assert.equal(target.style.display, "none");
  assert.equal(steady.disabled, true);
  assert.match(s.find("petanque-feedback").textContent, /Carreau|Computer/);
  s.doc.hidden = true; s.doc.handlers.visibilitychange();
  assert.equal(s.finishes[0].earningsMultiplier, 1);
  assert.ok(s.cleared.includes(77));
  s.ui.destroy();
  assert.equal(s.finishes.length, 1);
});

test("Strength canvas failure settles once without multiplier or lingering aid", t => {
  const s = setup(t, { dailyCard: "strength", random: () => NaN });
  s.find("petanque-start").handlers.click();
  assert.equal(s.finishes.length, 1);
  assert.equal(s.finishes[0].earningsMultiplier, 1);
  assert.equal(s.find("petanque-steady").disabled, true);
  assert.match(s.find("petanque-error").textContent, /random/);
  s.ui.destroy();
  assert.equal(s.finishes.length, 1);
});

test("Strength runtime failure clears target selection, timer and result exactly once", t => {
  const s = setup(t, { resonance: true });
  s.find("petanque-start").handlers.click();
  s.find("petanque-throw").handlers.click();
  waitForTurnOrCount(s);
  s.find("petanque-steady").handlers.click();
  assert.equal(s.find("petanque-steady").attributes["aria-pressed"], "true");
  s.clock.now = NaN;
  s.tick();
  assert.equal(s.find("petanque-steady").attributes["aria-pressed"], "false");
  assert.equal(s.finishes.length, 1);
  assert.equal(s.finishes[0].earningsMultiplier, 1);
  assert.ok(s.cleared.includes(77));
  s.ui.destroy();
  assert.equal(s.finishes.length, 1);
});

test("carreau targets support keyboard selection and a failed attempt leaves the target in place", t => {
  const s = setup(t, { level: 4, language: "en", resonance: true });
  s.find("petanque-start").handlers.click();
  s.find("petanque-throw").handlers.click();
  waitForTurnOrCount(s);
  const steady = s.find("petanque-steady");
  assert.equal(steady.disabled, false);
  steady.handlers.click();
  assert.match(s.find("petanque-status").textContent, /35%/);
  const target = s.find("petanque-played").children.find(node => node.style.display !== "none");
  const position = { left: target.style.left, top: target.style.top };
  let prevented = false, stopped = false;
  target.handlers.keydown({ key: "Enter", preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });
  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.equal(steady.disabled, true);
  for (let i = 0; i < 25; i++) { s.clock.now += 50; s.tick(); }
  assert.match(s.find("petanque-feedback").textContent, /Carreau missed/);
  assert.equal(target.style.display, "block");
  assert.deepEqual({ left: target.style.left, top: target.style.top }, position);
  s.ui.destroy();
});

function waitForTurnOrCount(s) {
  for (let i = 0; i < 200 && s.find("petanque-throw").disabled && !s.finishes.length; i++) {
    if (/Comptage|Counting|Égalité|Equal best/.test(s.find("petanque-status").textContent)) return;
    s.clock.now += 50;
    s.tick();
  }
}

function playEnd(s, aim) {
  const [angle, power] = s.inputs();
  for (let i = 0; i < 3; i++) {
    const shot = Array.isArray(aim) ? aim[i] : aim;
    angle.value = String(shot.angle); angle.handlers.input();
    power.value = String(shot.power); power.handlers.input();
    s.find("petanque-throw").handlers.click();
    waitForTurnOrCount(s);
  }
}

test("UI needs explicit start, plays six boules, then highlights and counts each winning boule", t => {
  const s = setup(t, { random: () => 0.8 });
  const root = s.find("petanque-game");
  assert.equal(root.attributes["aria-label"], "Pétanque au village");
  assert.match(s.find("petanque-rules").textContent, /cochonnet.*Aucune mise/s);
  assert.match(s.find("petanque-keys").textContent, /Échap/);
  assert.equal(s.find("petanque-throw").disabled, true);
  s.find("petanque-throw").handlers.click();
  assert.equal(s.finishes.length, 0);
  s.find("petanque-start").handlers.click();
  assert.equal(s.find("petanque-start").disabled, true);
  assert.equal(s.find("petanque-throw").disabled, false);
  assert.equal(s.find("petanque-status").attributes.role, "status");
  assert.match(s.find("petanque-status").textContent, /boule 1\/3/);
  assert.equal(s.find("petanque-jack").style.display, "block");
  assert.match(s.find("petanque-pitch").attributes["aria-label"], /cochonnet/);

  s.find("petanque-right").handlers.click();
  assert.match(s.find("petanque-status").textContent, /direction 0,5°/);
  s.find("petanque-left").handlers.click();
  // Three separate placements around the jack; reusing one spot now knocks earlier boules away.
  playEnd(s, [{ angle: -2, power: 58 }, { angle: 1, power: 55.5 }, { angle: 4.5, power: 58 }]);
  assert.match(s.find("petanque-status").textContent, /Comptage/);
  assert.equal(s.find("petanque-played").children.length, 6);
  assert.equal(s.find("petanque-played").children.filter(node => node.className.includes("petanque-computer")).length, 3);
  assert.equal(s.finishes.length, 0);
  assert.equal(s.find("petanque-throw").disabled, true);
  const dots = [...s.find("petanque-played").children];
  for (let point = 1; point <= 3; point++) {
    s.clock.now += PETANQUE.countMs;
    s.tick();
    assert.match(s.find("petanque-score").textContent, new RegExp(`Vous : ${point} · Ordinateur : 0`));
    assert.match(s.find("petanque-feedback").textContent, new RegExp(`Point ${point} : Vous`));
    assert.equal(s.find("petanque-played").children.filter(node => node.className.includes("petanque-counted")).length, point);
    assert.equal(s.find("petanque-played").children.filter(node => node.className.includes("petanque-highlight")).length, 1);
    assert.deepEqual(s.find("petanque-played").children, dots, "boule nodes stay stable across animation frames");
    s.tick();
    assert.equal(s.finishes.length, 0, "completion waits until the last highlight has been visible");
  }
  s.clock.now += PETANQUE.countMs;
  s.tick();
  assert.deepEqual(s.finishes, [{ completed: true, score: 3, opponentScore: 0, winner: "player", maxScore: 3, cancelled: false, timedOut: false, earningsMultiplier: 1 }]);
  assert.match(s.find("petanque-status").textContent, /Vous : 3 · Ordinateur : 0/);
  assert.deepEqual(s.cleared, [77]);
  s.ui.destroy();
  s.ui.destroy();
  assert.equal(s.finishes.length, 1);
  assert.equal(s.container.children.length, 0);
  assert.equal(s.doc.handlers.visibilitychange, undefined);
});

test("keyboard controls aim, throw and quit; English dictionary", t => {
  const s = setup(t, { language: "en", level: 2 });
  assert.match(s.find("petanque-rules").textContent, /jack.*No stake/s);
  assert.equal(s.key("Enter"), true);
  assert.match(s.find("petanque-status").textContent, /boule 1\/3 — direction 0°, power 50%/);
  s.key("ArrowRight");
  s.key("ArrowRight", { shiftKey: true });
  s.key("ArrowUp");
  s.key("ArrowDown", { shiftKey: true });
  assert.match(s.find("petanque-status").textContent, /direction 5\.5°, power 45\.5%/);
  assert.equal(s.key("x"), false);
  assert.equal(s.key("ArrowLeft", { target: { tagName: "INPUT" } }), false);
  s.key(" ");
  assert.match(s.find("petanque-status").textContent, /rolling/);
  s.key("Escape");
  assert.deepEqual(s.finishes, [cancelledResult]);
  assert.match(s.find("petanque-status").textContent, /no reward/);
  s.key("Enter");
  s.ui.destroy();
  assert.equal(s.finishes.length, 1);
});

test("hidden page and destroy cancel without reward, exactly once, even before start", t => {
  const hidden = setup(t);
  hidden.find("petanque-start").handlers.click();
  hidden.doc.hidden = true;
  hidden.doc.handlers.visibilitychange();
  assert.deepEqual(hidden.finishes, [cancelledResult]);
  assert.equal(hidden.find("petanque-throw").disabled, true);
  hidden.ui.destroy();
  assert.equal(hidden.finishes.length, 1);

  const early = setup(t);
  early.ui.destroy();
  assert.deepEqual(early.finishes, [cancelledResult]);
  assert.equal(early.container.children.length, 0);
  early.ui.destroy();
  assert.equal(early.finishes.length, 1);
});

test("engine errors are shown accessibly instead of crashing", t => {
  const s = setup(t, { random: () => 2 });
  s.find("petanque-start").handlers.click();
  assert.equal(s.find("petanque-error").attributes.role, "alert");
  assert.match(s.find("petanque-error").textContent, /Action impossible/);
  assert.equal(s.finishes.length, 0);
  assert.throws(() => mount(null), TypeError);
  assert.throws(() => mount(fakeDom().container, { level: 7 }), RangeError);
});

test("ground raster maps actual local height to pixels, without bump/hollow overlay badges", t => {
  const s = setup(t, { level: 4, language: "en" });
  s.find("petanque-start").handlers.click();
  const terrain = createGame({ level: 4, random: () => 0.5 }).terrain;
  const canvas = s.find("petanque-relief");
  assert.equal(canvas.tagName, "CANVAS");
  assert.equal(canvas.style.imageRendering, "pixelated");
  assert.equal(canvas.children.length, 0);
  const { width, height, data } = terrainPixels(terrain);
  assert.deepEqual(canvas.image.data, data);
  assert.equal(data.length, 80 * 300 * 4);
  const local = { ...terrain, slope: { x: 0, y: 0 } };
  for (const [row, col] of [[0, 0], [230, 40], [206, 40]]) {
    const altitude = groundHeight(local, ((col + 0.5) / width - 0.5) * 4, (1 - (row + 0.5) / height) * 15);
    const red = data[(row * width + col) * 4];
    const expected = Math.min(255, Math.max(0, 195 + Math.max(-1, Math.min(1, altitude / 0.025)) * 85));
    assert.ok(Math.abs(red - expected) <= 0.5);
  }
  const reds = Array.from(data).filter((_, index) => index % 4 === 0);
  assert.ok(Math.max(...reds) > 195, "bumps brighten the ground");
  assert.ok(Math.min(...reds) < 195, "hollows darken it");
  assert.match(s.find("petanque-relief-rules").textContent, /light = bump, dark = hollow \(11 features\)/);
  const image = canvas.image;
  s.clock.now = 100;
  s.tick();
  assert.equal(canvas.image, image, "static ground raster is not regenerated on every tick");
  assert.throws(() => terrainPixels(terrain, 0, 2), RangeError);
  s.ui.destroy();
});

test("throw, rolling and landing sounds play only on phase transitions; cancel stops audio", t => {
  const sounds = [];
  let stops = 0;
  const s = setup(t, { audio: { play: kind => sounds.push(kind), stop: () => stops++ } });
  s.find("petanque-start").handlers.click();
  s.key("ArrowRight");
  assert.deepEqual(sounds, []);
  s.key(" ");
  s.key(" ");
  assert.deepEqual(sounds, ["throw"]);
  s.clock.now = 599;
  s.tick();
  assert.deepEqual(sounds, ["throw"]);
  s.clock.now = 600;
  s.tick();
  s.clock.now = 650;
  s.tick();
  assert.deepEqual(sounds, ["throw", "roll"]);
  const sim = simulateThrow({ angle: 0.5, power: 50, terrain: createGame({ random: () => 0.5 }).terrain });
  s.clock.now = PETANQUE.flightMs + sim.rollMs;
  s.tick();
  s.tick();
  assert.deepEqual(sounds, ["throw", "roll", "land"]);
  assert.match(s.find("petanque-status").textContent, /ordinateur/);
  s.key(" ");
  assert.deepEqual(sounds, ["throw", "roll", "land"], "player cannot throw in the opponent's turn");
  s.clock.now += PETANQUE.computerThinkMs;
  s.tick();
  assert.deepEqual(sounds, ["throw", "roll", "land", "throw"]);
  assert.match(s.find("petanque-status").textContent, /Ordinateur.*roule/);
  s.key("Escape");
  assert.equal(stops > 0, true);
  assert.deepEqual(sounds, ["throw", "roll", "land", "throw"]);
  s.ui.destroy();
});

test("computer points animate on its side, while cancelling during counting clears all rewards and timers", t => {
  const s = setup(t, { language: "en", random: () => 0.8 });
  s.find("petanque-start").handlers.click();
  playEnd(s, { angle: 0, power: 0 });
  assert.match(s.find("petanque-status").textContent, /Counting — Computer: 0/);
  s.clock.now += PETANQUE.countMs;
  s.tick();
  assert.equal(s.find("petanque-score").textContent, "You: 0 · Computer: 1");
  assert.match(s.find("petanque-highlight").className, /petanque-computer/);
  assert.equal(s.finishes.length, 0);
  s.key("Escape");
  assert.deepEqual(s.finishes, [cancelledResult]);
  assert.deepEqual(s.cleared, [77]);
  s.clock.now += 10000;
  s.tick();
  assert.equal(s.finishes.length, 1);
  assert.equal(s.find("petanque-highlight"), undefined);
  s.ui.destroy();
});

test("expiry does not award a partial end; unavailable canvas reports an explicit error", t => {
  const s = setup(t, { language: "en" });
  s.find("petanque-start").handlers.click();
  s.clock.now = PETANQUE.timeLimitMs;
  s.tick();
  assert.equal(s.finishes.length, 1);
  assert.equal(s.finishes[0].timedOut, true);
  assert.match(s.find("petanque-status").textContent, /incomplete end, no points/);
  s.ui.destroy();
  const broken = setup(t);
  broken.find("petanque-relief").getContext = () => null;
  broken.find("petanque-start").handlers.click();
  assert.match(broken.find("petanque-error").textContent, /Canvas rendering is unavailable/);
  assert.equal(broken.find("petanque-start").disabled, false);
  assert.equal(broken.finishes.length, 0);
  broken.ui.destroy();
});

test("hidden state without a visibility event cancels the roll and its audio", t => {
  let stops = 0;
  const s = setup(t, { audio: { play() {}, stop: () => stops++ } });
  s.find("petanque-start").handlers.click();
  s.key(" ");
  s.doc.hidden = true;
  s.clock.now = 100;
  s.tick();
  assert.equal(s.finishes[0].cancelled, true);
  assert.ok(stops > 0);
  s.ui.destroy();
});

test("struck boule markers animate in place, match collision size, and impacts sound once", t => {
  const sounds = [];
  const s = setup(t, { audio: { play: kind => sounds.push(kind), stop() {} } });
  let reference = createGame({ random: () => 0.5 });
  const aim = bestAim(reference.jack, reference.terrain);
  s.find("petanque-start").handlers.click();
  const [angle, power] = s.inputs();
  angle.value = String(aim.angle); angle.handlers.input();
  power.value = String(aim.power); power.handlers.input();
  s.find("petanque-throw").handlers.click();
  reference = input(reference, { type: "setAngle", value: aim.angle }, 0);
  reference = input(reference, { type: "setPower", value: aim.power }, 0);
  reference = input(reference, "throw", 0);
  s.clock.now = reference.rolling.until;
  reference = advance(reference, s.clock.now);
  s.tick();
  const dot = s.find("petanque-played").children[0];
  const original = { left: dot.style.left, top: dot.style.top };
  assert.equal(dot.style.width, `${PETANQUE.bouleRadius * 2 / PETANQUE.pitch.width * 100}%`);
  assert.equal(dot.style.height, `${PETANQUE.bouleRadius * 2 / PETANQUE.pitch.length * 100}%`);
  assert.equal(s.find("petanque-pitch").style.aspectRatio, "4 / 15");
  s.clock.now = reference.computerAt;
  reference = advance(reference, s.clock.now);
  s.tick();
  const impact = reference.rolling.impacts[0];
  assert.ok(impact);
  s.clock.now = reference.rolling.startedAt + PETANQUE.flightMs;
  s.tick();
  assert.deepEqual({ left: dot.style.left, top: dot.style.top }, original, "resting marker waits for the collision");
  const before = sounds.filter(kind => kind === "hit").length;
  s.clock.now += impact.timeMs + 50;
  s.tick();
  assert.notDeepEqual({ left: dot.style.left, top: dot.style.top }, original, "contact moves the old boule during the animation");
  assert.equal(s.find("petanque-played").children[0], dot, "no replacement or teleport-on-settlement");
  assert.equal(sounds.filter(kind => kind === "hit").length, before + 1);
  s.tick();
  assert.equal(sounds.filter(kind => kind === "hit").length, before + 1);
  s.clock.now = reference.rolling.until;
  const settled = advance(reference, s.clock.now);
  s.tick();
  const { x, y } = settled.throws[0].end;
  assert.equal(dot.style.left, `${(x + 2) / 4 * 100}%`);
  assert.equal(dot.style.top, `${(1 - y / 15) * 100}%`);
  s.ui.destroy();
});
