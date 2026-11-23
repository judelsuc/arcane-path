// Fleeing street attackers: the pursuit escape run (same engine and replay) drawn
// as a night chase through town, with the attackers gaining after each stumble.
import { createEscape, escapeCourse, escapeObstacles, stepEscape } from "./pursuit-escape.mjs";
import { drawSprite, spriteCanvas } from "./brawl-sprites.mjs";

const WIDTH = 640, HEIGHT = 320, FLOOR = 270, STEP_MS = 1000 / 60, COUNTDOWN = 90;
const COPY = {
  fr: { go: "Fuyez ! Espace ou ↑ pour sauter", jump: "Sauter", escaped: "Vous les semez dans les ruelles.",
    caught: "Ils vous rattrapent, essoufflé… Il faut se battre." },
  en: { go: "Run! Space or ↑ to jump", jump: "Jump", escaped: "You lose them in the back streets.",
    caught: "They catch up with you, out of breath… You have to fight." },
};

function scenery(ctx, camera, phase) {
  const night = phase !== "day";
  const sky = ctx.createLinearGradient(0, 0, 0, FLOOR);
  sky.addColorStop(0, night ? "#0b1026" : "#7fb4d9"); sky.addColorStop(1, night ? "#28304f" : "#d8e7ef");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const far = camera * 0.3;
  for (let i = -1; i < 12; i++) {
    const index = Math.floor(far / 70) + i, x = index * 70 - far, h = 90 + ((index * 37) % 70 + 70) % 70;
    ctx.fillStyle = night ? "#1b1d2b" : "#a89a8c"; ctx.fillRect(Math.round(x), FLOOR - h, 66, h);
    for (let wy = FLOOR - h + 12; wy < FLOOR - 30; wy += 20) for (let wx = 8; wx < 58; wx += 18) {
      ctx.fillStyle = night ? ((index * 7 + wy + wx) % 3 === 0 ? "#e9c46a" : "#2a2d3e") : "#6d8597";
      ctx.fillRect(Math.round(x + wx), wy, 7, 9);
    }
  }
  const near = camera * 0.7;
  for (let i = -1; i < 6; i++) {
    const lx = Math.floor(near / 160) * 160 + i * 160 - near + 40;
    ctx.fillStyle = "#2b2b2b"; ctx.fillRect(Math.round(lx), FLOOR - 110, 4, 110);
    if (night) { ctx.fillStyle = "#ffd98a"; ctx.fillRect(Math.round(lx) - 4, FLOOR - 113, 12, 5); }
  }
  ctx.fillStyle = night ? "#3a3a42" : "#9c9c9c"; ctx.fillRect(0, FLOOR, WIDTH, 6);
  ctx.fillStyle = night ? "#2d2d33" : "#8e8e8e"; ctx.fillRect(0, FLOOR + 6, WIDTH, HEIGHT - FLOOR);
}

function obstacleShape(ctx, o, camera) {
  const x = Math.round(o.x - camera), top = o.bottom - o.height;
  if (x > WIDTH || x + o.width < 0) return;
  if (o.kind === "gap") {
    ctx.fillStyle = "#07070b"; ctx.fillRect(x, FLOOR, o.width, HEIGHT - FLOOR);
    ctx.fillStyle = "#4a4a52"; ctx.fillRect(x - 2, FLOOR, 2, 10); ctx.fillRect(x + o.width, FLOOR, 2, 10);
    return;
  }
  if (o.kind === "overhead") {
    // A low shop sign on two poles: stay on the ground beneath it.
    ctx.fillStyle = "#6b5a46"; ctx.fillRect(x + 4, top - 40, 3, 40); ctx.fillRect(x + o.width - 7, top - 40, 3, 40);
    ctx.fillStyle = "#a6452e"; ctx.fillRect(x, top, o.width, o.height);
    ctx.fillStyle = "#e9c46a"; ctx.fillRect(x + 6, top + 5, o.width - 12, 3);
    return;
  }
  if (o.kind === "platform") {
    ctx.fillStyle = "#827a73"; ctx.fillRect(x, top, o.width, o.height);
    ctx.fillStyle = "#a9a39a"; ctx.fillRect(x, top, o.width, 3);
    for (let j = 24; j < o.width; j += 32) { ctx.fillStyle = "#5e5852"; ctx.fillRect(x + j, top + 5, 2, o.height - 5); }
    return;
  }
  if (o.kind === "pair" || o.kind === "low" || o.kind === "steps") {
    // Hurdles: bins and barriers.
    ctx.fillStyle = "#3f5a4a"; ctx.fillRect(x, top, o.width, o.height);
    ctx.fillStyle = "#6f9a7f"; ctx.fillRect(x, top, o.width, 3);
    ctx.fillStyle = "#2b3d33"; ctx.fillRect(x + 3, top + 6, o.width - 6, 2);
    return;
  }
  ctx.fillStyle = "#755038"; ctx.fillRect(x, top, o.width, o.height);
  ctx.fillStyle = "#be9563"; ctx.fillRect(x + 2, top + 2, o.width - 4, o.height - 4);
  ctx.fillStyle = "#816044"; ctx.fillRect(x + 5, top + 3, 2, o.height - 6); ctx.fillRect(x + o.width - 7, top + 3, 2, o.height - 6);
}

export function mountStreetChase(host, flight, { language = "fr", phase = "night", opponents = 2, onFinish = () => {} } = {}) {
  const copy = COPY[language === "en" ? "en" : "fr"];
  const doc = host.ownerDocument;
  const canvas = doc.createElement("canvas"); canvas.width = WIDTH; canvas.height = HEIGHT;
  canvas.style.width = "100%"; canvas.style.imageRendering = "pixelated"; canvas.tabIndex = 0;
  const pad = doc.createElement("div"); pad.className = "brawl-touch";
  const jumpButton = doc.createElement("button"); jumpButton.type = "button"; jumpButton.textContent = copy.jump;
  pad.append(jumpButton);
  const status = doc.createElement("p"); status.setAttribute("role", "status");
  host.append(canvas, pad, status);
  const ctx = canvas.getContext("2d"); ctx.imageSmoothingEnabled = false;
  const length = escapeCourse(flight.version, flight.difficulty).length;
  let engine = createEscape(flight.seed, flight.version, flight.difficulty);
  let requested = false, countdown = COUNTDOWN, carry = 0, last = null, frame, done = false;
  const jumps = [];
  const press = () => { requested = true; };
  jumpButton.addEventListener("pointerdown", event => { event.preventDefault(); press(); });
  const keydown = event => {
    if (event.code === "Escape") { event.preventDefault(); finish(true); return; }
    if (["Space", "ArrowUp", "KeyW", "KeyZ"].includes(event.code)) { event.preventDefault(); if (!event.repeat) press(); }
  };
  doc.addEventListener("keydown", keydown);
  function finish(abandoned = false) {
    if (done) return;
    done = true;
    const outcome = abandoned ? "captured" : engine.status;
    status.textContent = outcome === "escaped" ? copy.escaped : copy.caught;
    onFinish({ outcome, transcript: { jumps: [...jumps], ticks: engine.tick, abandoned } });
  }
  function draw() {
    const camera = Math.max(0, engine.x - 170);
    scenery(ctx, camera, phase);
    for (const o of escapeObstacles(flight.seed, flight.version, flight.difficulty, engine.tick)) obstacleShape(ctx, o, camera);
    ctx.fillStyle = "#dfd5af"; ctx.fillRect(Math.round(length - camera), FLOOR - 100, 4, 100);
    const running = (engine.tick >> 3) % 2 ? "walk1" : "walk2";
    // Attackers run behind, closer after each stumble.
    const behind = Math.max(30, 150 - engine.hits * 45);
    for (let i = 0; i < Math.min(3, opponents); i++) {
      drawSprite(ctx, spriteCanvas(doc, `thug${i}`, running), engine.x - camera - behind - i * 26, FLOOR, { scale: 1.5 });
    }
    const pose = !engine.grounded ? "jump" : running;
    const blink = engine.tick < engine.invulnerableUntil && (engine.tick >> 2) % 2;
    if (!blink) drawSprite(ctx, spriteCanvas(doc, "traveller", pose), engine.x - camera + 9,
      engine.y + 26 + 2, { scale: 1.5 });
    ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(14, 12, 160, 8);
    ctx.fillStyle = "#9be564"; ctx.fillRect(15, 13, Math.round(158 * Math.min(1, engine.x / length)), 6);
    for (let i = 0; i < 3; i++) { ctx.fillStyle = i < 3 - engine.hits ? "#e63946" : "#4a4a4a"; ctx.fillRect(190 + i * 16, 12, 10, 10); }
    if (countdown > 0) {
      ctx.font = "bold 18px monospace"; ctx.textAlign = "center"; ctx.lineWidth = 3;
      ctx.strokeStyle = "#000"; ctx.strokeText(copy.go, WIDTH / 2, 90); ctx.fillStyle = "#ffe66d"; ctx.fillText(copy.go, WIDTH / 2, 90);
    }
  }
  function loop(time) {
    carry += last === null ? STEP_MS : Math.min(250, time - last);
    last = time;
    while (!done && carry >= STEP_MS) {
      carry -= STEP_MS;
      if (countdown > 0) { countdown--; requested = false; continue; }
      const jump = requested && engine.grounded && jumps.length < 100;
      if (jump) jumps.push(engine.tick + 1);
      requested = false;
      engine = stepEscape(engine, jump);
      if (engine.status !== "running") { finish(); break; }
    }
    draw();
    if (!done) frame = requestAnimationFrame(loop);
  }
  canvas.focus();
  frame = requestAnimationFrame(loop);
  return {
    abandon: () => finish(true),
    destroy() { cancelAnimationFrame(frame); doc.removeEventListener("keydown", keydown); canvas.remove(); pad.remove(); status.remove(); },
  };
}
