import test from "node:test";
import assert from "node:assert/strict";
import { setupTheft } from "../theft-ui.mjs";
import { translate } from "../i18n.mjs";

for (const language of ["fr", "en"]) {
  test(`${language} theft supports click and Space, times out, cancels once and clears timers`, t => {
    const original = globalThis.document;
    t.after(() => { globalThis.document = original; });
    let doc;
    class Element {
      handlers = {}; dataset = {}; style = {}; children = []; className = ""; open = false; disabled = false;
      get ownerDocument() { return doc; }
      addEventListener(name, fn) { this.handlers[name] = fn; }
      append(...children) { this.children.push(...children); }
      setAttribute(name, value) { this[name] = value; }
      remove() { this.removed = true; }
      showModal() { this.open = true; }
      close() { this.open = false; this.handlers.close?.(); }
      focus() {}
      click() { if (!this.disabled) this.handlers.click?.(); }
    }
    const elements = new Map(), el = id => {
      if (!elements.has(id)) elements.set(id, new Element());
      return elements.get(id);
    };
    const events = {};
    doc = { hidden: false, documentElement: { lang: language },
      querySelector: id => id === "dialog[open]" ? [...elements.values()].find(e => e.open) : el(id),
      createElement: () => new Element(),
      addEventListener: (name, fn) => { events[name] = fn; } };
    globalThis.document = doc;
    let now = 0, tick, timers = 0, pending = false;
    const outcomes = [];
    const sounds = [];
    let stops = 0;
    t.mock.method(performance, "now", () => now);
    t.mock.method(globalThis, "setInterval", fn => { tick = fn; timers++; return 1; });
    t.mock.method(globalThis, "clearInterval", () => { tick = undefined; timers--; });
    let draw = 0.5, difficulty = "normal", resonance = false;
    t.mock.method(Math, "random", () => draw);
    const ui = setupTheft((key, args) => translate(language, key, args), {
      audio: { play(outcome) { sounds.push(outcome); }, stop() { stops++; } },
      difficulty: () => difficulty,
      resonance: () => resonance,
      available: () => !pending,
      begin() { pending = true; return resonance ? { resonance: true } : true; },
      settle(outcome) { pending = false; outcomes.push(outcome); return {}; },
    });
    el("#earn-money-dialog").open = true;
    ui.open();
    assert.equal(el("#earn-money-dialog").open, false);
    assert.equal(el("#theft-dialog").open, true);
    el("#theft-start").click();
    const target = el("#theft-dialog .theft-target");
    assert.equal(target.hidden, false);
    assert.equal(parseFloat(target.style.left), 40);
    assert.ok(Math.abs(parseFloat(target.style.width) - 20) < 1e-10);
    assert.equal(timers, 1);
    assert.equal(el("#theft-start").disabled, true);
    now = 450; tick();
    assert.equal(el("#theft-marker").style.left, "50%");
    el("#theft-grab").click();
    assert.deepEqual(outcomes, ["success"]);
    assert.equal(timers, 0);
    assert.equal(el("#theft-result").dataset.feedback, "success");
    draw = 0;
    el("#theft-start").click();
    assert.equal(parseFloat(target.style.left), 8);
    assert.ok(Math.abs(parseFloat(target.style.width) - 12) < 1e-10);
    now += 126;
    el("#theft-dialog").handlers.keydown({ code: "Space", repeat: true, preventDefault() {} });
    assert.equal(outcomes.length, 1);
    el("#theft-dialog").handlers.keydown({ code: "Space", repeat: false, preventDefault() {} });
    assert.deepEqual(outcomes, ["success", "success"]);
    el("#theft-start").click();
    now += 9000; tick();
    assert.equal(outcomes.at(-1), "caught");
    assert.equal(el("#theft-result").dataset.feedback, "failure");
    assert.equal(timers, 0);
    el("#theft-start").click();
    globalThis.document.hidden = true;
    events.visibilitychange();
    el("#theft-dialog").close();
    ui.reset();
    assert.deepEqual(outcomes, ["success", "success", "caught", "cancelled"]);
    assert.equal(timers, 0);
    globalThis.document.hidden = false;
    difficulty = "hard";
    draw = 0.5;
    el("#theft-start").click();
    assert.ok(Math.abs(parseFloat(target.style.width) - 11.5) < 1e-10);
    now += 300;
    tick();
    assert.equal(el("#theft-marker").style.left, "50%");
    el("#theft-grab").click();
    assert.equal(outcomes.at(-1), "success");
    assert.deepEqual(sounds, ["success", "success", "caught", "success"]);
    assert.ok(stops > 0);
    assert.equal(timers, 0);
    difficulty = "normal";
    resonance = true;
    draw = 0.5;
    ui.localize();
    assert.match(el("#theft-dialog").className, /arcane-resonance/);
    assert.ok(el("#theft-dialog").children.some(child => child.className === "arcane-backdrop"));
    assert.match(el("#theft-dialog .window-help-text").textContent, /Devil variant|Variante du Diable/);
    el("#theft-start").click();
    assert.match(target.style.backgroundImage, /#e4c45a/);
    assert.match(el("#theft-dialog .window-help-text").textContent, /Devil variant|Variante du Diable/);
    now += 450;
    el("#theft-grab").click();
    assert.equal(outcomes.at(-1), "bonus");
    assert.deepEqual(sounds.at(-1), "success");
  });
}
