// Pixel figures for the brawl: a jointed skeleton posed per action, drawn at
// one pixel per unit with shading and a dark outline, then scaled up crisply.

const OUTLINE = [20, 16, 26];

const BODY_LIST = {
  traveller: { leg: 11, torso: 10, head: 7, limb: 3, chest: 6, arm: 9, palette: {
    skin: "#e6bc8c", skinShade: "#c9966a", hair: "#513e36", top: "#bb624c", topShade: "#8e4334",
    legs: "#30323e", legsShade: "#22232c", shoes: "#2a1f1a", eye: "#292f39",
    scarf: "#e3bb6c", pack: "#8e704c", packHi: "#d2ab6d" }, extras: ["pack", "hair", "scarf"] },
  thug0: { leg: 14, torso: 13, head: 8, limb: 3, chest: 8, arm: 12, palette: {
    skin: "#d9a982", skinShade: "#b58463", hair: "#2b2523", top: "#4b4453", topShade: "#332e3a",
    legs: "#3b4a6b", legsShade: "#2b3650", shoes: "#1c1c1c", eye: "#1a1a1a", hood: "#4b4453" }, extras: ["hood"] },
  thug1: { leg: 14, torso: 12, head: 8, limb: 4, chest: 9, arm: 12, palette: {
    skin: "#c69673", skinShade: "#a07553", hair: "#3a2a1e", top: "#5a6b3c", topShade: "#404d2a",
    legs: "#2f2f35", legsShade: "#202025", shoes: "#4a3424", eye: "#1a1a1a", cap: "#8c2f39" }, extras: ["hair", "cap"] },
  thug2: { leg: 15, torso: 13, head: 8, limb: 3, chest: 8, arm: 12, palette: {
    skin: "#e0b48f", skinShade: "#bd8f6c", hair: "#c9a15a", top: "#6b3e26", topShade: "#4d2b1a",
    legs: "#454545", legsShade: "#303030", shoes: "#1c1c1c", eye: "#1a1a1a" }, extras: ["hair", "stubble"] },
  travellerKnife: null,
  pursuer: { leg: 17, torso: 15, head: 8, limb: 4, chest: 9, arm: 14, palette: {
    skin: "#b5a28a", skinShade: "#8f7e69", hair: "#1b1b20", top: "#2c3442", topShade: "#1d232e",
    legs: "#252d39", legsShade: "#191f28", shoes: "#111111", eye: "#e01e2b",
    coat: "#424e60", coatShade: "#2f3846", collar: "#9099a1", hat: "#303b4b" }, extras: ["coat", "hat", "glint"] },
};
BODY_LIST.travellerKnife = { ...BODY_LIST.traveller, extras: [...BODY_LIST.traveller.extras, "knife"] };
export const BODIES = Object.freeze(BODY_LIST);

// Facing right. crouch: share of the leg the hip drops; lean: neck offset in torso
// units; feet: [front, back] offsets in leg units (y < 0 lifted); hands: [front,
// back] offsets from the shoulder in arm units (y > 0 down).
export const POSES = Object.freeze({
  guard: { crouch: 0.06, lean: 0.08, feet: [[0.28, 0], [-0.3, 0]], hands: [[0.55, -0.15], [0.35, 0.1]] },
  walk1: { crouch: 0.05, lean: 0.1, feet: [[0.42, 0], [-0.4, 0]], hands: [[0.5, -0.1], [0.1, 0.25]] },
  walk2: { crouch: 0.08, lean: 0.1, feet: [[0.05, -0.12], [-0.12, 0]], hands: [[0.6, -0.05], [0.3, 0.15]] },
  duck: { crouch: 0.48, lean: 0.35, feet: [[0.42, 0], [-0.38, 0]], hands: [[0.45, -0.55], [0.25, -0.45]] },
  hop: { crouch: 0.2, lean: -0.05, feet: [[0.25, -0.32], [-0.3, -0.2]], hands: [[0.3, -0.5], [-0.35, -0.3]] },
  push: { crouch: 0.12, lean: 0.4, feet: [[0.5, 0], [-0.6, 0]], hands: [[1.0, -0.05], [0.9, 0.1]] },
  sweep: { crouch: 0.62, lean: -0.15, feet: [[1.25, 0], [-0.35, 0]], hands: [[-0.25, 0.85], [-0.6, 0.7]] },
  parry: { crouch: 0.1, lean: -0.05, feet: [[0.3, 0], [-0.35, 0]], hands: [[0.45, -0.75], [0.35, -0.5]] },
  hurt: { crouch: 0.1, lean: -0.4, feet: [[0.2, 0], [-0.4, 0]], hands: [[-0.2, -0.7], [-0.6, -0.3]] },
  windupHigh: { crouch: 0.05, lean: -0.25, feet: [[0.35, 0], [-0.45, 0]], hands: [[-0.35, -1.0], [0.4, 0.05]] },
  windupLow: { crouch: 0.12, lean: -0.2, feet: [[-0.15, -0.45], [-0.25, 0]], hands: [[0.45, -0.25], [-0.4, 0.15]] },
  windupGrab: { crouch: 0.22, lean: 0.15, feet: [[0.4, 0], [-0.5, 0]], hands: [[0.7, -0.3], [0.55, -0.15]] },
  strikeHigh: { crouch: 0.08, lean: 0.4, feet: [[0.55, 0], [-0.55, 0]], hands: [[1.05, -0.2], [0.1, 0.2]] },
  strikeLow: { crouch: 0.05, lean: -0.3, feet: [[1.05, -0.2], [-0.25, 0]], hands: [[0.3, -0.35], [-0.5, 0.1]] },
  grab: { crouch: 0.15, lean: 0.35, feet: [[0.5, 0], [-0.55, 0]], hands: [[1.0, -0.15], [0.95, 0.05]] },
  stagger: { crouch: 0.15, lean: -0.5, feet: [[0.1, 0], [-0.45, 0]], hands: [[-0.1, -0.85], [-0.65, -0.45]] },
  limp: { crouch: 0, lean: 0, feet: [[0.12, 0], [-0.12, 0]], hands: [[0.15, 0.9], [-0.15, 0.9]] },
  kick: { crouch: 0.05, lean: -0.3, feet: [[1.0, -0.85], [-0.15, 0]], hands: [[0.3, -0.45], [-0.5, 0.1]] },
  split: { crouch: 0.88, lean: 0, feet: [[1.0, 0], [-1.0, 0]], hands: [[0.65, -0.55], [-0.65, -0.55]] },
  flykick: { crouch: 0.2, lean: -0.25, feet: [[1.1, -0.55], [-0.35, -0.45]], hands: [[-0.2, -0.6], [-0.6, -0.2]] },
  jump: { crouch: 0.25, lean: 0.2, feet: [[0.3, -0.35], [-0.35, -0.25]], hands: [[0.5, -0.5], [-0.3, -0.4]] },
  land: { crouch: 0.4, lean: 0.25, feet: [[0.45, 0], [-0.45, 0]], hands: [[0.5, 0.1], [-0.3, 0.2]] },
});

function joint(from, to, length, bend) {
  const dx = to.x - from.x, dy = to.y - from.y, distance = Math.hypot(dx, dy) || 1;
  const half = Math.min(distance, length * 2) / 2;
  const rise = Math.sqrt(Math.max(0, length * length - half * half));
  return { x: (from.x + to.x) / 2 + (-dy / distance) * rise * bend, y: (from.y + to.y) / 2 + (dx / distance) * rise * bend };
}

function line(ctx, a, b, width, color) {
  ctx.fillStyle = color;
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
  for (let i = 0; i <= steps; i++) {
    const x = a.x + (b.x - a.x) * i / steps, y = a.y + (b.y - a.y) * i / steps;
    ctx.fillRect(Math.round(x - width / 2), Math.round(y - width / 2), width, width);
  }
}

function skeleton(body, pose, size) {
  const ground = size.height - 3, cx = Math.round(size.width / 2);
  const hip = { x: cx, y: ground - body.leg * (1 - pose.crouch) };
  const neck = { x: hip.x + pose.lean * body.torso, y: hip.y - body.torso };
  const feet = pose.feet.map(([x, y]) => ({ x: hip.x + x * body.leg, y: ground + y * body.leg }));
  const hands = pose.hands.map(([x, y], index) => ({ x: neck.x + 1 + x * body.arm - index, y: neck.y + 2 + y * body.arm }));
  const shoulder = { x: neck.x, y: neck.y + 2 };
  return {
    hip, neck, shoulder, feet, hands,
    // Knees bend forward (toward the facing side), elbows bend downward.
    knees: feet.map(foot => joint(hip, foot, body.leg / 2 + 0.5, -1)),
    elbows: hands.map(hand => joint(shoulder, hand, body.arm / 2 + 0.5, 1)),
    head: { x: neck.x + 1, y: neck.y - body.head / 2 - 1 },
  };
}

function outline(ctx, width, height) {
  const image = ctx.getImageData(0, 0, width, height), data = image.data;
  const solid = index => data[index * 4 + 3] > 0;
  const edge = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = y * width + x;
    if (solid(index)) continue;
    if (x > 0 && solid(index - 1) || x < width - 1 && solid(index + 1) ||
        y > 0 && solid(index - width) || y < height - 1 && solid(index + width)) edge.push(index);
  }
  for (const index of edge) data.set([...OUTLINE, 255], index * 4);
  ctx.putImageData(image, 0, 0);
}

function paint(ctx, body, pose, size) {
  const c = body.palette, s = skeleton(body, pose, size), w = body.limb;
  // Back limbs in shade first, then torso, front leg, head and front arm.
  line(ctx, s.shoulder, s.elbows[1], w, c.topShade); line(ctx, s.elbows[1], s.hands[1], w, c.skinShade);
  line(ctx, s.hip, s.knees[1], w + 1, c.legsShade); line(ctx, s.knees[1], s.feet[1], w, c.legsShade);
  ctx.fillStyle = c.shoes; ctx.fillRect(Math.round(s.feet[1].x - 1), Math.round(s.feet[1].y - 1), w + 2, 2);
  if (body.extras.includes("pack")) {
    ctx.fillStyle = c.pack;
    ctx.fillRect(Math.round(s.neck.x - body.chest / 2 - 4), Math.round(s.neck.y + 2), 5, body.torso - 3);
    ctx.fillStyle = c.packHi; ctx.fillRect(Math.round(s.neck.x - body.chest / 2 - 3), Math.round(s.neck.y + 4), 2, 3);
  }
  line(ctx, s.hip, s.neck, body.chest, c.top);
  line(ctx, { x: s.hip.x + body.chest / 2 - 1, y: s.hip.y - 1 }, { x: s.neck.x + body.chest / 2 - 1, y: s.neck.y + 1 }, 1, c.topShade);
  if (body.extras.includes("coat")) {
    const knee = s.knees[0];
    ctx.fillStyle = c.coat;
    ctx.beginPath();
    ctx.moveTo(s.neck.x - body.chest / 2 - 1, s.neck.y);
    ctx.lineTo(s.neck.x + body.chest / 2 + 1, s.neck.y);
    ctx.lineTo(Math.max(knee.x, s.hip.x) + 5, knee.y + 3);
    ctx.lineTo(Math.min(s.knees[1].x, s.hip.x) - 5, s.knees[1].y + 3);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = c.coatShade; ctx.fillRect(Math.round(s.hip.x - 1), Math.round(s.hip.y - 2), 2, 8);
    ctx.fillStyle = c.collar; ctx.fillRect(Math.round(s.neck.x - 3), Math.round(s.neck.y - 1), 7, 2);
  }
  line(ctx, s.hip, s.knees[0], w + 1, c.legs); line(ctx, s.knees[0], s.feet[0], w, c.legs);
  ctx.fillStyle = c.shoes; ctx.fillRect(Math.round(s.feet[0].x - 1), Math.round(s.feet[0].y - 1), w + 3, 2);
  // Head.
  const h = body.head, hx = Math.round(s.head.x - h / 2), hy = Math.round(s.head.y - h / 2);
  ctx.fillStyle = c.skin; ctx.fillRect(hx, hy, h, h);
  ctx.fillStyle = c.skinShade; ctx.fillRect(hx, hy + h - 2, h, 2);
  if (body.extras.includes("hair")) { ctx.fillStyle = c.hair; ctx.fillRect(hx, hy, h, 2); ctx.fillRect(hx, hy, 2, h - 2); }
  if (body.extras.includes("hood")) {
    ctx.fillStyle = c.hood; ctx.fillRect(hx - 1, hy - 1, h + 1, 3); ctx.fillRect(hx - 1, hy - 1, 3, h + 1);
  }
  if (body.extras.includes("cap")) {
    ctx.fillStyle = c.cap; ctx.fillRect(hx, hy - 1, h, 3); ctx.fillRect(hx + h - 1, hy + 1, 3, 1);
  }
  if (body.extras.includes("stubble")) { ctx.fillStyle = c.skinShade; ctx.fillRect(hx + h - 3, hy + h - 3, 3, 2); }
  if (body.extras.includes("hat")) {
    ctx.fillStyle = c.hat; ctx.fillRect(hx - 2, hy - 1, h + 4, 2); ctx.fillRect(hx, hy - 5, h, 4);
    ctx.fillStyle = c.hair; ctx.fillRect(hx, hy + 1, h, 2);
  }
  ctx.fillStyle = c.eye; ctx.fillRect(hx + h - 2, hy + 3, 1, body.extras.includes("glint") ? 1 : 2);
  if (body.extras.includes("scarf")) {
    ctx.fillStyle = c.scarf; ctx.fillRect(Math.round(s.neck.x - 3), Math.round(s.neck.y), 7, 2);
    ctx.fillRect(Math.round(s.neck.x - 6), Math.round(s.neck.y + 1), 3, 2);
  }
  line(ctx, s.shoulder, s.elbows[0], w, c.top); line(ctx, s.elbows[0], s.hands[0], w, c.skin);
  ctx.fillStyle = c.skinShade; ctx.fillRect(Math.round(s.hands[0].x - 1), Math.round(s.hands[0].y - 1), 3, 3);
  if (body.extras.includes("knife")) {
    const hand = s.hands[0];
    ctx.fillStyle = "#7a5034"; ctx.fillRect(Math.round(hand.x), Math.round(hand.y - 1), 3, 3);
    ctx.fillStyle = "#eef1f3"; ctx.fillRect(Math.round(hand.x + 3), Math.round(hand.y - 2), 7, 2);
    ctx.fillStyle = "#9aa3a8"; ctx.fillRect(Math.round(hand.x + 3), Math.round(hand.y), 6, 1);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(Math.round(hand.x + 9), Math.round(hand.y - 2), 1, 1);
  }
}

// Knocked down: the standing figure turned a quarter, head away from the traveller.
function lying(doc, standing) {
  const source = standing.getContext("2d", { willReadFrequently: true })
    .getImageData(0, 0, standing.width, standing.height);
  let u0 = Infinity, u1 = -1, v0 = Infinity, v1 = -1;
  for (let v = 0; v < standing.height; v++) for (let u = 0; u < standing.width; u++) {
    if (source.data[(v * standing.width + u) * 4 + 3] === 0) continue;
    u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
  }
  const canvas = doc.createElement("canvas");
  canvas.width = v1 - v0 + 1; canvas.height = u1 - u0 + 3;
  const ctx = canvas.getContext("2d");
  const target = ctx.createImageData(canvas.width, canvas.height);
  for (let v = v0; v <= v1; v++) for (let u = u0; u <= u1; u++) {
    const from = (v * standing.width + u) * 4, to = ((u1 - u) * canvas.width + (v - v0)) * 4;
    target.data.set(source.data.subarray(from, from + 4), to);
  }
  ctx.putImageData(target, 0, 0);
  return canvas;
}

const cache = new Map();

export function spriteCanvas(doc, bodyName, poseName) {
  const key = `${bodyName}:${poseName}`;
  if (cache.has(key)) return cache.get(key);
  const body = BODIES[bodyName], size = { width: 44, height: body.leg + body.torso + body.head + 12 };
  const draw = pose => {
    const canvas = doc.createElement("canvas"); canvas.width = size.width; canvas.height = size.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    paint(ctx, body, pose, size);
    outline(ctx, size.width, size.height);
    return canvas;
  };
  const sprite = poseName === "down" ? lying(doc, draw(POSES.limp)) : draw(POSES[poseName]);
  cache.set(key, sprite);
  return sprite;
}

export function drawSprite(ctx, sprite, x, floor, { facing = 1, scale = 3, lift = 0, alpha = 1 } = {}) {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = alpha;
  ctx.translate(Math.round(x), Math.round(floor - lift));
  ctx.scale(facing * scale, scale);
  ctx.drawImage(sprite, -sprite.width / 2, -sprite.height + 2);
  ctx.restore();
  return floor - lift - (sprite.height - 2) * scale;
}

// The traveller's dog, side view, two trotting frames and a sitting/pulling frame.
export function dogSprite(doc, frame) {
  const key = `dog:${frame}`;
  if (cache.has(key)) return cache.get(key);
  const canvas = doc.createElement("canvas"); canvas.width = 24; canvas.height = 16;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const fill = (color, x, y, w, h) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };
  const coat = "#a8743f", dark = "#6b4423", light = "#d9b27c";
  const pull = frame === "pull";
  fill(coat, 5, 6, 11, 5);                      // body
  fill(light, 7, 9, 8, 2);                      // belly
  fill(coat, 15, pull ? 5 : 3, 5, 5);           // head
  fill(dark, 15, pull ? 4 : 2, 2, 3);           // ear
  fill(light, 19, pull ? 7 : 5, 3, 2);          // snout
  fill("#1a1410", 21, pull ? 7 : 5, 1, 1);      // nose
  fill("#1a1410", 18, pull ? 6 : 4, 1, 1);      // eye
  fill(dark, 2, pull ? 6 : 4, 3, 2); fill(dark, 1, pull ? 5 : 3, 2, 2);   // tail
  const legs = frame === "a" ? [[6, 0], [9, 2], [13, 0], [15, 2]]
    : frame === "b" ? [[6, 2], [9, 0], [13, 2], [15, 0]] : [[5, 1], [8, 1], [14, 0], [16, 0]];
  for (const [x, lift] of legs) fill(dark, x, 11, 2, 4 - lift);
  outline(ctx, canvas.width, canvas.height);
  cache.set(key, canvas);
  return canvas;
}
