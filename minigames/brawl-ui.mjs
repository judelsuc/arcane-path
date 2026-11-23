import { BRAWL_FLOOR, BRAWL_MAX_TICKS, BRAWL_WIDTH, INPUT, brawlRules, createBrawl, createBrawlRecorder, stepBrawl } from "./brawl.mjs";
import { dogSprite, drawSprite, spriteCanvas } from "./brawl-sprites.mjs";
import { brawlSound } from "./brawl-audio.mjs";

const HEIGHT = 320, STEP_MS = 1000 / 60, SCALE = 3, TUTORIAL_TICKS = 420;
const COPY = {
  fr: {
    title: { street: "Mauvaise rencontre", camp: "Réveil brutal", pursuer: "Il vous a rattrapé" },
    steps: [
      "Lisez le signe au-dessus de l'agresseur : ▲ jaune → ↓ se baisser · ▼ bleu → ↑ sauter en arrière.",
      "Espace le repousse (ou Espace + ↑ juste avant son coup pour parer) : il vacille ✦.",
      "Pendant qu'il vacille : Espace + ↓ glisse vers lui et le met à terre.",
      "Coups de pied (X) : X frappe loin · X + ↓ grand écart, frappe des deux côtés quand vous êtes encerclé · ↑ + → saute en avant, puis X en l'air : coup de pied sauté qui met à terre.",
      "Victoire : tous les agresseurs à terre en même temps (la barre sous chacun montre quand il se relève). Ou fuyez par un bord quand aucun ne peut vous suivre. Échap : abandonner.",
    ],
    knife: "Votre couteau rend vos coups plus efficaces : ils vacillent plus longtemps et restent à terre plus longtemps.",
    tutorial: ["▲ jaune : ↓   ▼ bleu : ↑", "Espace ou X : il vacille ✦", "puis Espace + ↓ : à terre !", "Encerclé ? X + ↓ : grand écart"],
    goal: (down, total) => `À terre : ${down}/${total} — tous en même temps pour gagner`,
    hint: { high: "↓ se baisser", low: "↑ sauter", grab: "↑ reculer !", sweep: "Espace + ↓", near: "approchez" },
    grab: (n, total) => `Il vous tient ! Martelez Espace ! ${n}/${total}`,
    pop: { parried: "PARÉ !", down: "À TERRE !", hit: "Aïe !", shoved: "Il vacille !", break: "Libéré !",
      dog: "Wouf !", getup: "Il se relève…" },
    won: "Ils détalent. Vous êtes libre.",
    escaped: "Vous leur échappez.",
    lost: { street: "Ils vous ont maîtrisé…", camp: "Ils vous ont maîtrisé…", pursuer: "Il ne vous lâche plus…" },
    touch: { left: "←", right: "→", up: "↑", down: "↓", action: "Espace", kick: "Pied (X)" },
  },
  en: {
    title: { street: "A bad encounter", camp: "Rude awakening", pursuer: "He has caught up with you" },
    steps: [
      "Read the sign above the attacker: yellow ▲ → ↓ duck · blue ▼ → ↑ hop back.",
      "Space pushes him (or Space + ↑ just before his blow to parry): he staggers ✦.",
      "While he staggers: Space + ↓ slides in and sweeps him to the ground.",
      "Kicks (X): X strikes far · X + ↓ split kick hits both sides when you are surrounded · ↑ + → jumps forward, then X in the air: a flying kick that floors him.",
      "Victory: every attacker down at the same time (the bar under each shows when he gets up). Or flee through an edge when none can follow. Esc: give up.",
    ],
    knife: "Your knife makes your blows count: attackers stagger longer and stay down longer.",
    tutorial: ["yellow ▲: ↓   blue ▼: ↑", "Space or X: he staggers ✦", "then Space + ↓: down!", "Surrounded? X + ↓: split kick"],
    goal: (down, total) => `Down: ${down}/${total} — all at once to win`,
    hint: { high: "↓ duck", low: "↑ hop", grab: "↑ back off!", sweep: "Space + ↓", near: "get closer" },
    grab: (n, total) => `He has you! Hammer Space! ${n}/${total}`,
    pop: { parried: "PARRIED!", down: "DOWN!", hit: "Ouch!", shoved: "He staggers!", break: "Free!",
      dog: "Woof!", getup: "He gets up…" },
    won: "They run off. You are free.",
    escaped: "You get away from them.",
    lost: { street: "They overpowered you…", camp: "They overpowered you…", pursuer: "He will not let go…" },
    touch: { left: "←", right: "→", up: "↑", down: "↓", action: "Space", kick: "Kick (X)" },
  },
};

const KEYS = { ArrowLeft: INPUT.left, KeyA: INPUT.left, KeyQ: INPUT.left, ArrowRight: INPUT.right, KeyD: INPUT.right,
  ArrowUp: INPUT.up, KeyW: INPUT.up, KeyZ: INPUT.up, ArrowDown: INPUT.down, KeyS: INPUT.down, Space: INPUT.action,
  KeyX: INPUT.kick };
const SIGNS = { high: ["▲", "#ffd23f"], low: ["▼", "#4cc9f0"], grab: ["✋", "#ff3b3b"] };
const POP_COLORS = { parried: "#a8f0ff", down: "#9be564", hit: "#ff5d5d", shoved: "#ffe66d", break: "#9be564",
  dog: "#e9c46a", getup: "#ffb4a2" };

function background(ctx, context, phase, tick) {
  const night = phase !== "day";
  const sky = ctx.createLinearGradient(0, 0, 0, BRAWL_FLOOR);
  if (context === "pursuer") { sky.addColorStop(0, "#07060a"); sky.addColorStop(1, "#2a0d10"); }
  else if (night) { sky.addColorStop(0, "#0b1026"); sky.addColorStop(1, "#28304f"); }
  else { sky.addColorStop(0, "#7fb4d9"); sky.addColorStop(1, "#d8e7ef"); }
  ctx.fillStyle = sky; ctx.fillRect(0, 0, BRAWL_WIDTH, HEIGHT);
  if (context === "street") {
    for (let i = 0; i < 9; i++) {
      const x = i * 74 - 10, h = 100 + ((i * 37) % 80);
      ctx.fillStyle = night ? "#1b1d2b" : "#a89a8c"; ctx.fillRect(x, BRAWL_FLOOR - h, 68, h);
      ctx.fillStyle = night ? "#23263a" : "#968878"; ctx.fillRect(x, BRAWL_FLOOR - h, 68, 4);
      for (let wy = BRAWL_FLOOR - h + 14; wy < BRAWL_FLOOR - 40; wy += 22) for (let wx = x + 8; wx < x + 60; wx += 18) {
        ctx.fillStyle = night ? ((wx + wy + i) % 3 === 0 ? "#e9c46a" : "#2a2d3e") : "#6d8597";
        ctx.fillRect(wx, wy, 8, 10);
      }
      ctx.fillStyle = night ? "#121420" : "#7d6f62"; ctx.fillRect(x + 26, BRAWL_FLOOR - 26, 16, 26);
    }
    for (const lx of [110, 530]) {
      ctx.fillStyle = "#2b2b2b"; ctx.fillRect(lx, BRAWL_FLOOR - 130, 4, 130); ctx.fillRect(lx - 6, BRAWL_FLOOR - 132, 16, 3);
      if (night) {
        ctx.fillStyle = "rgba(255, 220, 140, 0.10)";
        ctx.beginPath(); ctx.moveTo(lx + 2, BRAWL_FLOOR - 126); ctx.lineTo(lx - 60, BRAWL_FLOOR); ctx.lineTo(lx + 64, BRAWL_FLOOR); ctx.fill();
        ctx.fillStyle = "#ffd98a"; ctx.fillRect(lx - 4, BRAWL_FLOOR - 129, 12, 5);
      }
    }
    ctx.fillStyle = night ? "#3a3a42" : "#9c9c9c"; ctx.fillRect(0, BRAWL_FLOOR, BRAWL_WIDTH, 6);
    ctx.fillStyle = night ? "#2d2d33" : "#8e8e8e"; ctx.fillRect(0, BRAWL_FLOOR + 6, BRAWL_WIDTH, HEIGHT - BRAWL_FLOOR);
    ctx.fillStyle = night ? "#26262c" : "#7d7d7d";
    for (let x = 0; x < BRAWL_WIDTH; x += 40) ctx.fillRect(x, BRAWL_FLOOR, 2, 6);
  } else if (context === "camp") {
    for (let i = 0; i < 46; i++) { ctx.fillStyle = i % 5 ? "#c9d1ff" : "#fff6d5"; ctx.fillRect((i * 97) % BRAWL_WIDTH, (i * 53) % 130, 2, 2); }
    for (let i = 0; i < 13; i++) {
      const x = i * 54 - 10, h = 120 + (i * 29) % 70;
      ctx.fillStyle = i % 2 ? "#0c1a14" : "#10241b";
      ctx.beginPath(); ctx.moveTo(x, BRAWL_FLOOR); ctx.lineTo(x + 30, BRAWL_FLOOR - h); ctx.lineTo(x + 60, BRAWL_FLOOR); ctx.fill();
    }
    ctx.fillStyle = "#4c6b4a"; ctx.beginPath(); ctx.moveTo(470, BRAWL_FLOOR); ctx.lineTo(522, BRAWL_FLOOR - 56); ctx.lineTo(574, BRAWL_FLOOR); ctx.fill();
    ctx.fillStyle = "#2f4530"; ctx.beginPath(); ctx.moveTo(512, BRAWL_FLOOR); ctx.lineTo(522, BRAWL_FLOOR - 30); ctx.lineTo(532, BRAWL_FLOOR); ctx.fill();
    const flicker = 6 + (tick >> 2) % 4;
    ctx.fillStyle = "rgba(255, 140, 50, 0.14)"; ctx.beginPath(); ctx.arc(150, BRAWL_FLOOR - 8, 70 + flicker, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#5a3a22"; ctx.fillRect(132, BRAWL_FLOOR - 4, 36, 4);
    ctx.fillStyle = "#ff8c32"; ctx.fillRect(142, BRAWL_FLOOR - 12 - flicker, 16, 8 + flicker);
    ctx.fillStyle = "#ffd166"; ctx.fillRect(146, BRAWL_FLOOR - 8 - flicker / 2, 8, 4 + flicker / 2);
    ctx.fillStyle = "#1a1410"; ctx.fillRect(0, BRAWL_FLOOR, BRAWL_WIDTH, HEIGHT - BRAWL_FLOOR);
  } else {
    ctx.fillStyle = "#e8e2d0"; ctx.beginPath(); ctx.arc(520, 60, 22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#07060a"; ctx.beginPath(); ctx.arc(530, 54, 20, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 7; i++) {
      const x = i * 100 + 20;
      ctx.fillStyle = "#050405"; ctx.fillRect(x, BRAWL_FLOOR - 160, 6, 160);
      ctx.fillRect(x - 18, BRAWL_FLOOR - 150, 42, 4); ctx.fillRect(x - 10, BRAWL_FLOOR - 130, 26, 3);
    }
    ctx.fillStyle = "#1c1416"; ctx.fillRect(0, BRAWL_FLOOR, BRAWL_WIDTH, HEIGHT - BRAWL_FLOOR);
    ctx.fillStyle = `rgba(140, 120, 130, ${0.10 + 0.04 * Math.sin(tick / 40)})`;
    ctx.fillRect(0, BRAWL_FLOOR - 40, BRAWL_WIDTH, 50);
  }
}

function playerPose(p, tick) {
  if (p.grabbedBy !== null || p.hurt > 36) return "hurt";
  if (p.flying) return "flykick";
  if (p.air > 0) return p.pose === "jump" ? "jump" : "hop";
  if (["duck", "push", "sweep", "parry", "kick", "split", "land"].includes(p.pose)) return p.pose;
  if (p.pose === "walk") return (tick >> 3) % 2 ? "walk1" : "walk2";
  return "guard";
}

function opponentPose(o, p, tick) {
  if (o.pinned > 0) return "stagger";
  if (o.pose === "windup") return { high: "windupHigh", low: "windupLow", grab: "windupGrab" }[o.attack];
  if (o.pose === "strike") return { high: "strikeHigh", low: "strikeLow", grab: "grab" }[o.attack] ?? "guard";
  if (["stagger", "down", "grab"].includes(o.pose)) return o.pose;
  if (o.pose === "approach" && Math.abs(o.x - p.x) > 48) return (tick >> 3) % 2 ? "walk1" : "walk2";
  return "guard";
}

function label(ctx, text, x, y, color, size = 14) {
  ctx.font = `bold ${size}px monospace`; ctx.textAlign = "center";
  ctx.lineWidth = 3; ctx.lineJoin = "round"; ctx.strokeStyle = "rgba(0,0,0,0.85)"; ctx.strokeText(text, x, y);
  ctx.fillStyle = color; ctx.fillText(text, x, y);
}

export function drawBrawl(ctx, state, { phase = "night", copy = COPY.en, pops = [], shake = 0, dog = null,
  doc = globalThis.document } = {}) {
  const rules = brawlRules(state.level, state.context);
  const downMax = Math.round(rules.downTicks * (state.knife ? 1.5 : 1));
  ctx.save();
  if (shake > 0) ctx.translate(((shake * 7) % 5) - 2, ((shake * 3) % 5) - 2);
  background(ctx, state.context, phase, state.tick);
  const p = state.player;
  for (const figure of [p, ...state.opponents.filter(o => o.pose !== "fled")]) {
    ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(Math.round(figure.x - 18), BRAWL_FLOOR - 1, 36, 4);
  }
  state.opponents.forEach((o, index) => {
    if (o.pose === "fled") return;
    const body = state.context === "pursuer" ? "pursuer" : `thug${index % 3}`;
    const facing = Math.sign(p.x - o.x) || -1;
    const top = drawSprite(ctx, spriteCanvas(doc, body, opponentPose(o, p, state.tick)), o.x, BRAWL_FLOOR, { facing, scale: SCALE });
    const head = Math.max(top + 30, 70);
    const gap = Math.abs(o.x - p.x);
    if (o.pose === "windup") {
      const [sign, color] = SIGNS[o.attack];
      label(ctx, sign, o.x, head - 22, color, 24);
      label(ctx, copy.hint[o.attack], o.x, head - 4, color, 12);
    } else if (o.pose === "stagger" || o.pinned > 0) {
      label(ctx, "✦ ✦ ✦", o.x, head - 4 + ((state.tick >> 3) % 2) * 3, "#ffe66d", 13);
      if ((state.tick >> 4) % 2 === 0) label(ctx, gap < 72 ? copy.hint.sweep : copy.hint.near, o.x, head - 22, "#9be564", 13);
    } else if (o.pose === "down") {
      const share = Math.max(0, o.timer / downMax);
      ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(Math.round(o.x - 26), BRAWL_FLOOR + 12, 52, 7);
      ctx.fillStyle = share > 0.3 ? "#9be564" : "#ff9f43"; ctx.fillRect(Math.round(o.x - 25), BRAWL_FLOOR + 13, Math.round(50 * share), 5);
    }
  });
  if (dog) drawSprite(ctx, dogSprite(doc, dog.frame), dog.x, BRAWL_FLOOR, { facing: dog.facing, scale: SCALE });
  const blink = p.hurt > 0 && p.hurt <= 36 && (p.hurt >> 2) % 2 === 0;
  drawSprite(ctx, spriteCanvas(doc, state.knife ? "travellerKnife" : "traveller", playerPose(p, state.tick)),
    p.x, BRAWL_FLOOR, { facing: p.facing, scale: SCALE, alpha: blink ? 0.45 : 1,
      lift: p.air > 0 ? Math.sin(Math.PI * p.air / 34) * 30 : 0 });
  ctx.restore();
  if (state.context === "pursuer") {
    const vignette = ctx.createRadialGradient(p.x, BRAWL_FLOOR - 40, 60, p.x, BRAWL_FLOOR - 40, 360);
    vignette.addColorStop(0, "rgba(0,0,0,0)"); vignette.addColorStop(1, "rgba(0,0,0,0.72)");
    ctx.fillStyle = vignette; ctx.fillRect(0, 0, BRAWL_WIDTH, HEIGHT);
  }
  if (p.hurt > 40 && state.status === "fighting") { ctx.fillStyle = `rgba(255,0,0,${(p.hurt - 40) / 40})`; ctx.fillRect(0, 0, BRAWL_WIDTH, HEIGHT); }
  for (let i = 0; i < state.maxBreath; i++) {
    const x = 14 + i * 20;
    ctx.fillStyle = "#1a1a1a"; ctx.fillRect(x - 1, 13, 16, 14);
    ctx.fillStyle = i < state.breath ? "#e63946" : "#4a4a4a";
    ctx.fillRect(x + 1, 15, 5, 5); ctx.fillRect(x + 8, 15, 5, 5); ctx.fillRect(x + 1, 19, 12, 4); ctx.fillRect(x + 4, 23, 6, 2);
  }
  const active = state.opponents.filter(o => o.pose !== "fled");
  if (state.status === "fighting") {
    label(ctx, copy.goal(active.filter(o => o.pose === "down").length, active.length), BRAWL_WIDTH / 2, 26, "#f1faee", 13);
  }
  ctx.textAlign = "right"; ctx.font = "bold 14px monospace"; ctx.fillStyle = "#f1faee";
  ctx.fillText(String(Math.max(0, Math.ceil((BRAWL_MAX_TICKS - state.tick) / 60))), BRAWL_WIDTH - 14, 26);
  if (p.grabbedBy !== null) {
    label(ctx, copy.grab(p.breaks, rules.grabBreaks), BRAWL_WIDTH / 2, 58, "#ff3b3b", 16);
    const holder = state.opponents[p.grabbedBy];
    ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(BRAWL_WIDTH / 2 - 80, 66, 160, 8);
    ctx.fillStyle = "#ff3b3b"; ctx.fillRect(BRAWL_WIDTH / 2 - 79, 67, Math.round(158 * holder.timer / rules.grabTicks), 6);
  }
  if (state.tick < TUTORIAL_TICKS && state.status === "fighting") {
    ctx.fillStyle = "rgba(10, 12, 20, 0.78)"; ctx.fillRect(BRAWL_WIDTH / 2 - 150, 40, 300, 66);
    ctx.fillStyle = "rgba(10, 12, 20, 0.78)"; ctx.fillRect(BRAWL_WIDTH / 2 - 150, 106, 300, 18);
    copy.tutorial.forEach((line, index) => label(ctx, line, BRAWL_WIDTH / 2, 60 + index * 19, "#f1faee", 13));
  }
  for (const pop of pops) label(ctx, pop.text, pop.x, BRAWL_FLOOR - 150 - pop.age * 0.6, pop.color, 15);
}

export function mountBrawl(host, setup, { language = "en", phase = "night", audio = null, onFinish = () => {} } = {}) {
  const copy = COPY[language === "fr" ? "fr" : "en"];
  const doc = host.ownerDocument;
  const root = doc.createElement("section"); root.className = "brawl";
  const title = doc.createElement("h3"); title.textContent = copy.title[setup.context ?? "street"];
  const help = doc.createElement("ol"); help.className = "game-help-text brawl-steps";
  for (const step of [...copy.steps, ...(setup.knife ? [copy.knife] : [])]) {
    const item = doc.createElement("li"); item.textContent = step; help.append(item);
  }
  const canvas = doc.createElement("canvas"); canvas.width = BRAWL_WIDTH; canvas.height = HEIGHT;
  canvas.tabIndex = 0; canvas.style.width = "100%"; canvas.style.imageRendering = "pixelated";
  canvas.setAttribute("aria-label", copy.title[setup.context ?? "street"]);
  const status = doc.createElement("p"); status.setAttribute("role", "status");
  const pad = doc.createElement("div"); pad.className = "brawl-touch";
  root.append(title, canvas, status, pad, help); host.append(root);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  let state = createBrawl(setup), held = 0, touch = 0, frame, last = null, carry = 0, done = false, shake = 0;
  let pops = [];
  // The dog is presentation only: it trots behind the traveller and runs to the attacker it holds.
  const dog = setup.dog ? { x: state.player.x - 50, facing: 1, frame: "a" } : null;
  function moveDog() {
    if (!dog) return;
    const p = state.player, held = state.opponents.find(o => o.pinned > 0);
    const target = held ? held.x - Math.sign(p.x - held.x || 1) * 22 : p.x - p.facing * 48;
    const step = target - dog.x;
    dog.x += Math.sign(step) * Math.min(Math.abs(step), held ? 9 : 4);
    if (Math.abs(step) > 1) dog.facing = Math.sign(step);
    else dog.facing = held ? Math.sign(held.x - dog.x) || 1 : p.facing;
    dog.frame = held && Math.abs(step) < 4 ? "pull" : Math.abs(step) > 1 ? ((state.tick >> 3) % 2 ? "a" : "b") : "a";
  }
  const recorder = createBrawlRecorder();
  const unlock = () => { void audio?.unlock?.(); };
  for (const [name, bit] of Object.entries({ left: INPUT.left, down: INPUT.down, up: INPUT.up, right: INPUT.right,
    action: INPUT.action, kick: INPUT.kick })) {
    const button = doc.createElement("button"); button.type = "button"; button.textContent = copy.touch[name];
    const press = on => event => { event.preventDefault(); if (on) unlock(); touch = on ? touch | bit : touch & ~bit; };
    button.addEventListener("pointerdown", press(true));
    for (const type of ["pointerup", "pointerleave", "pointercancel"]) button.addEventListener(type, press(false));
    pad.append(button);
  }
  function react(events) {
    for (const event of events) {
      const sound = brawlSound(event);
      if (sound) audio?.play(sound);
      if (event.type === "hit") shake = 10;
      if (event.type === "down") shake = Math.max(shake, 5);
      const text = copy.pop[event.type];
      if (text) pops.push({ text, x: event.x, age: 0, color: POP_COLORS[event.type] });
    }
  }
  function finish(abandoned = false) {
    if (done) return;
    done = true;
    const outcome = abandoned ? "lost" : state.status;
    audio?.play(outcome);
    status.textContent = outcome === "lost" ? copy.lost[state.context] : copy[outcome];
    onFinish({ outcome, breath: state.breath, transcript: recorder.transcript(state.tick, abandoned) });
  }
  const keydown = event => {
    unlock();
    if (event.code === "Escape") { event.preventDefault(); finish(true); return; }
    const bit = KEYS[event.code];
    if (bit) { event.preventDefault(); held |= bit; }
  };
  const keyup = event => { const bit = KEYS[event.code]; if (bit) held &= ~bit; };
  doc.addEventListener("keydown", keydown); doc.addEventListener("keyup", keyup);
  function loop(time) {
    carry += last === null ? STEP_MS : Math.min(250, time - last);
    last = time;
    while (!done && carry >= STEP_MS && state.status === "fighting") {
      const mask = held | touch;
      recorder.record(state.tick + 1, mask);
      state = stepBrawl(state, mask);
      react(state.events);
      carry -= STEP_MS;
    }
    pops = pops.map(pop => ({ ...pop, age: pop.age + 1 })).filter(pop => pop.age < 50);
    if (shake > 0) shake--;
    moveDog();
    drawBrawl(ctx, state, { phase, copy, pops, shake, dog, doc });
    if (!done && state.status !== "fighting") finish();
    frame = requestAnimationFrame(loop);
  }
  canvas.focus();
  frame = requestAnimationFrame(loop);
  return {
    abandon: () => finish(true),
    destroy() {
      cancelAnimationFrame(frame);
      audio?.stop();
      doc.removeEventListener("keydown", keydown); doc.removeEventListener("keyup", keyup);
      root.remove();
    },
  };
}
