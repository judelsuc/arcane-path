import { BRAWL_FLOOR, BRAWL_MAX_TICKS, BRAWL_WIDTH, INPUT, createBrawl, createBrawlRecorder, stepBrawl } from "./brawl.mjs";

const HEIGHT = 320, STEP_MS = 1000 / 60, PIXEL = 5, PURSUER_PIXEL = 7;
const COPY = {
  fr: {
    title: { street: "Mauvaise rencontre", camp: "Réveil brutal", pursuer: "Il vous a rattrapé" },
    help: "← → se déplacer · ↑ sauter en arrière (évite les coups bas) · ↓ s'accroupir (évite les coups hauts) · Espace : repousser · Espace + ↓ : balayer un adversaire déséquilibré · Espace + ↑ juste avant le coup : parer · Échap : abandonner.",
    goal: "Mettez tous les agresseurs à terre en même temps, ou profitez qu'ils soient à terre ou retenus pour sortir de l'écran.",
    grab: "Il vous tient ! Martelez Espace !",
    dog: "Votre chien en retient un !",
    won: "Ils détalent. Vous êtes libre.",
    escaped: "Vous leur échappez.",
    lost: { street: "Ils vous ont maîtrisé…", camp: "Ils vous ont maîtrisé…", pursuer: "Il ne vous lâche plus…" },
    touch: { left: "←", right: "→", up: "↑", down: "↓", action: "Espace" },
  },
  en: {
    title: { street: "A bad encounter", camp: "Rude awakening", pursuer: "He has caught up with you" },
    help: "← → move · ↑ hop back (avoids low attacks) · ↓ duck (avoids high attacks) · Space: push · Space + ↓: sweep an off-balance attacker · Space + ↑ just before a blow: parry · Esc: give up.",
    goal: "Knock every attacker down at the same time, or leave the screen while they are down or held back.",
    grab: "He has you! Hammer Space!",
    dog: "Your dog is holding one back!",
    won: "They run off. You are free.",
    escaped: "You get away from them.",
    lost: { street: "They overpowered you…", camp: "They overpowered you…", pursuer: "He will not let go…" },
    touch: { left: "←", right: "→", up: "↑", down: "↓", action: "Space" },
  },
};

const KEYS = { ArrowLeft: INPUT.left, KeyA: INPUT.left, KeyQ: INPUT.left, ArrowRight: INPUT.right, KeyD: INPUT.right,
  ArrowUp: INPUT.up, KeyW: INPUT.up, KeyZ: INPUT.up, ArrowDown: INPUT.down, KeyS: INPUT.down, Space: INPUT.action };

// Pixel figures, 8 columns wide, drawn from the feet up; "#" body, "o" head, "x" accent.
const FIGURES = {
  idle: ["..oo....", "..oo....", ".####...", "x####x..", ".####...", ".#..#...", ".#..#...", ".#..#..."],
  walk: ["..oo....", "..oo....", ".####...", "x####x..", ".####...", ".#..#...", "#....#..", "#....#.."],
  duck: ["........", "........", "........", "..oo....", ".####...", "x####x..", ".#..#...", "##..##.."],
  hop: ["..oo....", "..oo....", ".####...", "x####x..", ".####...", ".#..#...", "#....#..", "........"],
  push: ["...oo...", "...oo...", "..####xx", "..#####.", "..####..", "..#..#..", ".#...#..", ".#...#.."],
  sweep: ["........", "........", "........", "..oo....", ".#####..", "x####...", ".#.#####", "##......"],
  parry: ["...oo.xx", "...oo.x.", "..####x.", "..####..", "..####..", "..#..#..", "..#..#..", "..#..#.."],
  windup: ["..oo....", "x.oo....", "x####...", ".####...", ".####...", ".#..#...", ".#..#...", "#...#..."],
  strike: ["...oo...", "...oo...", "..#####x", "..####.x", "..####..", "..#..#..", ".#...#..", ".#...#.."],
  stagger: [".oo.....", ".oo.....", "..####..", ".x####x.", "..####..", "...#..#.", "..#...#.", "..#....#"],
  recover: ["..oo....", "..oo....", ".####...", ".####...", ".####...", ".#..#...", ".#..#...", ".#..#..."],
  grab: ["...oo...", "...oo...", "..######", "..####.x", "..####..", "..#..#..", ".#...#..", ".#...#.."],
  down: ["........", "........", "........", "........", "........", "........", "oo######", "x#..#x.."],
  approach: ["..oo....", "..oo....", ".####...", "x####x..", ".####...", ".#..#...", "#....#..", "#....#.."],
};

const PALETTE = {
  traveller: { "#": "#3f7f8c", o: "#f1c9a5", x: "#e8b04b" },
  thugs: [{ "#": "#4b4453", o: "#d9a982", x: "#8c2f39" }, { "#": "#5a5a3c", o: "#c69673", x: "#2f3e46" },
    { "#": "#6b3e26", o: "#e0b48f", x: "#1f1f1f" }],
  pursuer: { "#": "#151317", o: "#d8d4cc", x: "#7a0f14" },
};

function drawFigure(ctx, pose, x, palette, facing, scale = PIXEL, lift = 0) {
  const rows = FIGURES[pose] ?? FIGURES.idle;
  const width = 8 * scale, top = BRAWL_FLOOR - rows.length * scale - lift;
  rows.forEach((row, r) => [...row].forEach((cell, c) => {
    if (cell === ".") return;
    ctx.fillStyle = palette[cell];
    const column = facing < 0 ? 7 - c : c;
    ctx.fillRect(Math.round(x - width / 2 + column * scale), Math.round(top + r * scale), scale, scale);
  }));
  return top;
}

function drawBackground(ctx, context, phase, tick) {
  const night = phase !== "day";
  const sky = ctx.createLinearGradient(0, 0, 0, BRAWL_FLOOR);
  if (context === "pursuer") { sky.addColorStop(0, "#07060a"); sky.addColorStop(1, "#2a0d10"); }
  else if (night) { sky.addColorStop(0, "#0b1026"); sky.addColorStop(1, "#28304f"); }
  else { sky.addColorStop(0, "#7fb4d9"); sky.addColorStop(1, "#d8e7ef"); }
  ctx.fillStyle = sky; ctx.fillRect(0, 0, BRAWL_WIDTH, HEIGHT);
  if (context === "street") {
    for (let i = 0; i < 9; i++) {
      const x = i * 74 - 10, h = 90 + ((i * 37) % 70);
      ctx.fillStyle = night ? "#1b1d2b" : "#a89a8c"; ctx.fillRect(x, BRAWL_FLOOR - h, 68, h);
      for (let wy = BRAWL_FLOOR - h + 12; wy < BRAWL_FLOOR - 30; wy += 22) for (let wx = x + 8; wx < x + 60; wx += 18) {
        ctx.fillStyle = night ? ((wx + wy + i) % 3 === 0 ? "#e9c46a" : "#2a2d3e") : "#6d8597";
        ctx.fillRect(wx, wy, 8, 10);
      }
    }
    for (const lx of [110, 530]) {
      ctx.fillStyle = "#2b2b2b"; ctx.fillRect(lx, BRAWL_FLOOR - 120, 4, 120);
      if (night) {
        ctx.fillStyle = "rgba(255, 220, 140, 0.12)";
        ctx.beginPath(); ctx.moveTo(lx + 2, BRAWL_FLOOR - 118); ctx.lineTo(lx - 50, BRAWL_FLOOR); ctx.lineTo(lx + 54, BRAWL_FLOOR); ctx.fill();
        ctx.fillStyle = "#ffd98a"; ctx.fillRect(lx - 4, BRAWL_FLOOR - 124, 12, 6);
      }
    }
    ctx.fillStyle = night ? "#2d2d33" : "#8e8e8e"; ctx.fillRect(0, BRAWL_FLOOR, BRAWL_WIDTH, HEIGHT - BRAWL_FLOOR);
  } else if (context === "camp") {
    for (let i = 0; i < 40; i++) { ctx.fillStyle = "#c9d1ff"; ctx.fillRect((i * 97) % BRAWL_WIDTH, (i * 53) % 120, 2, 2); }
    for (let i = 0; i < 12; i++) {
      const x = i * 58, h = 110 + (i * 29) % 60;
      ctx.fillStyle = "#0c1a14";
      ctx.beginPath(); ctx.moveTo(x, BRAWL_FLOOR); ctx.lineTo(x + 28, BRAWL_FLOOR - h); ctx.lineTo(x + 56, BRAWL_FLOOR); ctx.fill();
    }
    ctx.fillStyle = "#4c6b4a"; ctx.beginPath(); ctx.moveTo(470, BRAWL_FLOOR); ctx.lineTo(520, BRAWL_FLOOR - 50); ctx.lineTo(570, BRAWL_FLOOR); ctx.fill();
    const flicker = 6 + (tick >> 2) % 4;
    ctx.fillStyle = "rgba(255, 140, 50, 0.15)"; ctx.beginPath(); ctx.arc(150, BRAWL_FLOOR - 8, 60 + flicker, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ff8c32"; ctx.fillRect(144, BRAWL_FLOOR - 10 - flicker, 12, 10 + flicker);
    ctx.fillStyle = "#1a1410"; ctx.fillRect(0, BRAWL_FLOOR, BRAWL_WIDTH, HEIGHT - BRAWL_FLOOR);
  } else {
    ctx.fillStyle = "#e8e2d0"; ctx.beginPath(); ctx.arc(520, 60, 22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#07060a"; ctx.beginPath(); ctx.arc(530, 54, 20, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 7; i++) {
      const x = i * 100 + 20;
      ctx.fillStyle = "#050405"; ctx.fillRect(x, BRAWL_FLOOR - 150, 6, 150);
      ctx.fillRect(x - 18, BRAWL_FLOOR - 140, 42, 4); ctx.fillRect(x - 10, BRAWL_FLOOR - 120, 26, 3);
    }
    ctx.fillStyle = "#1c1416"; ctx.fillRect(0, BRAWL_FLOOR, BRAWL_WIDTH, HEIGHT - BRAWL_FLOOR);
    ctx.fillStyle = `rgba(140, 120, 130, ${0.10 + 0.04 * Math.sin(tick / 40)})`;
    ctx.fillRect(0, BRAWL_FLOOR - 40, BRAWL_WIDTH, 50);
  }
}

export function drawBrawl(ctx, state, { phase = "night", copy = COPY.en } = {}) {
  drawBackground(ctx, state.context, phase, state.tick);
  state.opponents.forEach((o, index) => {
    if (o.pose === "fled") return;
    const palette = state.context === "pursuer" ? PALETTE.pursuer : PALETTE.thugs[index % 3];
    const facing = Math.sign(state.player.x - o.x) || -1;
    const scale = state.context === "pursuer" ? PURSUER_PIXEL : PIXEL;
    const top = drawFigure(ctx, o.pose, o.x, palette, facing, scale);
    if (o.pose === "windup") {
      const sign = { high: ["▲", "#ffd23f"], low: ["▼", "#4cc9f0"], grab: ["✋", "#ff3b3b"] }[o.attack];
      ctx.font = "bold 18px monospace"; ctx.textAlign = "center"; ctx.fillStyle = sign[1];
      ctx.fillText(sign[0], o.x, top - 8);
    }
    if (o.pose === "down" || o.pose === "stagger") {
      ctx.fillStyle = "#ffe66d"; ctx.font = "12px monospace"; ctx.textAlign = "center";
      ctx.fillText("✦ ✦", o.x, top - 6 + ((state.tick >> 3) % 2) * 2);
    }
    if (o.pinned > 0) {
      ctx.fillStyle = "#8a5a2b"; ctx.fillRect(o.x - 16 * facing - 10, BRAWL_FLOOR - 12, 20, 10);
      ctx.fillRect(o.x - 16 * facing + (facing < 0 ? 8 : -12), BRAWL_FLOOR - 18, 6, 8);
    }
  });
  const p = state.player;
  const blink = p.hurt > 0 && (p.hurt >> 2) % 2 === 0;
  if (!blink) drawFigure(ctx, p.air > 0 ? "hop" : p.pose === "walk" ? (state.tick >> 3) % 2 ? "walk" : "idle" : p.pose,
    p.x, PALETTE.traveller, p.facing, PIXEL, p.air > 0 ? Math.sin(Math.PI * p.air / 34) * 30 : 0);
  if (state.context === "pursuer") {
    const vignette = ctx.createRadialGradient(p.x, BRAWL_FLOOR - 40, 60, p.x, BRAWL_FLOOR - 40, 360);
    vignette.addColorStop(0, "rgba(0,0,0,0)"); vignette.addColorStop(1, "rgba(0,0,0,0.75)");
    ctx.fillStyle = vignette; ctx.fillRect(0, 0, BRAWL_WIDTH, HEIGHT);
  }
  // Breath and clock.
  for (let i = 0; i < state.maxBreath; i++) {
    ctx.fillStyle = i < state.breath ? "#e63946" : "#3a3a3a";
    ctx.fillRect(14 + i * 18, 14, 12, 12);
  }
  ctx.fillStyle = "#f1faee"; ctx.font = "14px monospace"; ctx.textAlign = "right";
  ctx.fillText(String(Math.max(0, Math.ceil((BRAWL_MAX_TICKS - state.tick) / 60))), BRAWL_WIDTH - 14, 26);
  ctx.textAlign = "center";
  if (p.grabbedBy !== null) { ctx.fillStyle = "#ff3b3b"; ctx.font = "bold 18px monospace"; ctx.fillText(copy.grab, BRAWL_WIDTH / 2, 60); }
  else if (state.opponents.some(o => o.pinned > 0)) { ctx.fillStyle = "#e9c46a"; ctx.font = "14px monospace"; ctx.fillText(copy.dog, BRAWL_WIDTH / 2, 60); }
}

export function mountBrawl(host, setup, { language = "en", phase = "night", onFinish = () => {} } = {}) {
  const copy = COPY[language === "fr" ? "fr" : "en"];
  const doc = host.ownerDocument;
  const root = doc.createElement("section"); root.className = "brawl";
  const title = doc.createElement("h3"); title.textContent = copy.title[setup.context ?? "street"];
  const help = doc.createElement("p"); help.className = "game-help-text"; help.textContent = `${copy.goal} ${copy.help}`;
  const canvas = doc.createElement("canvas"); canvas.width = BRAWL_WIDTH; canvas.height = HEIGHT;
  canvas.tabIndex = 0; canvas.style.width = "100%"; canvas.style.imageRendering = "pixelated";
  canvas.setAttribute("aria-label", copy.title[setup.context ?? "street"]);
  const status = doc.createElement("p"); status.setAttribute("role", "status");
  const pad = doc.createElement("div"); pad.className = "brawl-touch";
  root.append(title, help, canvas, status, pad); host.append(root);
  const ctx = canvas.getContext("2d");
  let state = createBrawl(setup), held = 0, touch = 0, frame, last = null, carry = 0, done = false;
  const recorder = createBrawlRecorder();
  for (const [name, bit] of Object.entries({ left: INPUT.left, down: INPUT.down, up: INPUT.up, right: INPUT.right, action: INPUT.action })) {
    const button = doc.createElement("button"); button.type = "button"; button.textContent = copy.touch[name];
    const press = on => event => { event.preventDefault(); touch = on ? touch | bit : touch & ~bit; };
    button.addEventListener("pointerdown", press(true));
    for (const type of ["pointerup", "pointerleave", "pointercancel"]) button.addEventListener(type, press(false));
    pad.append(button);
  }
  function finish(abandoned = false) {
    if (done) return;
    done = true;
    const outcome = abandoned ? "lost" : state.status;
    status.textContent = outcome === "lost" ? copy.lost[state.context] : copy[outcome];
    onFinish({ outcome, breath: state.breath, transcript: recorder.transcript(state.tick, abandoned) });
  }
  const keydown = event => {
    if (event.code === "Escape") { event.preventDefault(); finish(true); return; }
    const bit = KEYS[event.code];
    if (bit) { event.preventDefault(); held |= bit; }
  };
  const keyup = event => { const bit = KEYS[event.code]; if (bit) held &= ~bit; };
  doc.addEventListener("keydown", keydown); doc.addEventListener("keyup", keyup);
  function loop(time) {
    if (done) { drawBrawl(ctx, state, { phase, copy }); return; }
    carry += last === null ? STEP_MS : Math.min(250, time - last);
    last = time;
    while (carry >= STEP_MS && state.status === "fighting") {
      const mask = held | touch;
      recorder.record(state.tick + 1, mask);
      state = stepBrawl(state, mask);
      carry -= STEP_MS;
    }
    drawBrawl(ctx, state, { phase, copy });
    if (state.status !== "fighting") finish();
    frame = requestAnimationFrame(loop);
  }
  canvas.focus();
  frame = requestAnimationFrame(loop);
  return {
    abandon: () => finish(true),
    destroy() {
      cancelAnimationFrame(frame);
      doc.removeEventListener("keydown", keydown); doc.removeEventListener("keyup", keyup);
      root.remove();
    },
  };
}
