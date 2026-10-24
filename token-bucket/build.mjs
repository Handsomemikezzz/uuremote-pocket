import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SKILL = process.env.ANATOMY_SKILL ?? join(homedir(), ".claude/skills/anatomy");
const k = await import(pathToFileURL(join(SKILL, "kit/iso-kit.mjs")).href);
const { kitScript } = await import(pathToFileURL(join(SKILL, "scripts/inline-kit.mjs")).href);

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--dark") ? "dark" : "light";
const OUT = theme === "light" ? "token-bucket.html" : "token-bucket-dark.html";

const WIDTH = 600;
const HEIGHT = 420;

const CAPACITY = 8;
const RATE = 1;
const COIN_R = 10;
const COIN_T = 4;
const BASE = 16;
const GATE_LO = BASE + CAPACITY * COIN_T + 0.8;
const GATE_HI = GATE_LO + 2.4;
const WALL_TOP = 66;
const CAP_TOP = 73;
const STROKE = 22;
const SHUTTER_RUN = 24;
const STOP_X = 84;
const DROP_Z = 2;

const PLATE = { x: -66, y: -30, w: 180, d: 62, r: 7 };
const PLATE_H = 10;
const FOOT_H = 4;
const BODY = { x: -13.5, y: -15, w: 113.5, d: 30, r: 2 };
const HOLE = { x: 72, y: -11, w: 22, d: 22, r: 1 };
const PUSH_BOX = { x: -56, y: -10, w: 42.5, d: 20, r: 2 };
const PUSH_BOX_H = 24;
const GATE_BOX = { x: -52, y: -11, w: 38.5, d: 22, r: 2 };
const GATE_BOX_Z = 44;
const GATE_BOX_H = 11;
const DIAL = [-40, 0];
const DIAL_R = 7.5;
const DIAL_TOP = GATE_BOX_Z + GATE_BOX_H + 3;
const BUTTON = [-37, 0];
const CAP = { x: -15, y: -15, w: 31, d: 31, r: 2.5 };

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), ...k.boxCorners(CAP, WALL_TOP, CAP_TOP + 5), [DIAL[0], DIAL[1] - DIAL_R, DIAL_TOP]],
  WIDTH,
  HEIGHT,
  { pad: 34, azimuth: 40, elevation: 30 },
);

const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const slab = (plan, z, h, steps = 3, bevel = 0.5) => k.slabOf(plan, z, h, P, steps, bevel);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
const quad = (points) => k.pathOf(points.map((point) => at(point)), true);
const prismClip = (id, plan, z0, z1) => `<clipPath id="${id}"><path d="${k.slabOf(plan, z0, z1 - z0, P, 2).fill}"/></clipPath>`;

function plate() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 18))) {
    out.push(S(k.cylinder(x, y, 6.4, -PLATE_H - FOOT_H, 1.4, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5, -PLATE_H - FOOT_H + 1.4, FOOT_H - 1.4, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.4), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 4.5), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 9);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));

  const label = { x: -58, y: 16, w: 30, d: 11, r: 1 };
  out.push(S(slab(label, 0, 0.8, 3, 0), { tone: "lo", crease: "none" }));
  out.push(L(k.planOutline(k.insetPlan(label, 1.4), 0.8, P, 3), { tone: "faint" }));
  [[19.6, 18], [22.4, 13], [25, 15.5]].forEach(([y, length]) => out.push(L(k.lineOnTop([label.x + 4, y], [label.x + 4 + length, y], 0.8, P), { tone: "lo", free: true })));
  out.push(D([at([label.x + label.w - 3, label.y + 3, 0.8]), at([label.x + label.w - 3, label.y + label.d - 3, 0.8])], { size: 0.45 }));

  const strip = { x: -22, y: 23, w: 126, d: 6, r: 1 };
  out.push(S(slab(strip, 0, 0.6, 3, 0), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 3, strip.x + strip.w - 3, 4, 5, strip.y + 0.6, 0.6, [1.8, 3.4], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(D([at([strip.x + 1.6, strip.y + 3, 0.6]), at([strip.x + strip.w - 1.6, strip.y + 3, 0.6])], { size: 0.4 }));
  return out.join("");
}

function pushBox() {
  const out = [];
  const seam = k.sideSeam(PUSH_BOX, 7, P, 3);
  out.push(S(slab(PUSH_BOX, 0, PUSH_BOX_H, 3, 0.7), { tone: "mid", inner: L(seam, { tone: "faint" }) }));
  out.push(counter("limited", PUSH_BOX.y + PUSH_BOX.d, -48, -30, 11.5, 18));
  out.push(L(k.planOutline(k.insetPlan(PUSH_BOX, 2.4), PUSH_BOX_H, P, 3), { tone: "faint" }));
  out.push(D(k.corners(PUSH_BOX, 4.4).map(([x, y]) => at([x, y, PUSH_BOX_H])), { size: 0.45 }));
  out.push(S(k.cylinder(BUTTON[0], BUTTON[1], 5, PUSH_BOX_H, 1.2, P, 32, 0.3), { tone: "mid" }));
  return out.join("");
}

function button() {
  const [x, y] = BUTTON;
  const z = PUSH_BOX_H + 1.2;
  const out = [];
  out.push(S(k.cylinder(x, y, 3.6, z, 3.4, P, 32, 0.4), { tone: "hi", crease: "lo" }));
  out.push(L(k.knurl(x, y, 3.6, z + 0.4, z + 3.4, 28, P, 0.3), { tone: "lo" }));
  out.push(L(k.ring(x, y, 2.2, z + 3.4, P, 24), { tone: "faint" }));
  return out.join("");
}

function columns() {
  const out = [];
  for (const [x, y] of byDepth([[-48.5, -5.5], [-48.5, 5.5]])) {
    out.push(S(k.cylinder(x, y, 3.4, PUSH_BOX_H, 1.6, P, 24, 0.3), { tone: "mid" }));
    out.push(S(k.cylinder(x, y, 2.2, PUSH_BOX_H + 1.6, GATE_BOX_Z - PUSH_BOX_H - 1.6, P, 20), { tone: "mid", crease: "none" }));
    out.push(L(k.sideArc(x, y, 2.2, 34, P, 12), { tone: "faint" }));
  }
  return out.join("");
}

function gateBox() {
  const out = [];
  const seam = k.sideSeam(GATE_BOX, GATE_BOX_Z + 5.5, P, 3);
  out.push(S(slab(GATE_BOX, GATE_BOX_Z, GATE_BOX_H, 3, 0.6), { tone: "mid", inner: L(seam, { tone: "faint" }) }));
  const top = GATE_BOX_Z + GATE_BOX_H;
  out.push(D([[-49, -8], [-49, 8], [-17, -8], [-17, 8]].map(([x, y]) => at([x, y, top])), { size: 0.45 }));
  const [x, y] = DIAL;
  out.push(S(k.cylinder(x, y, DIAL_R, top, 3, P, 56, 0.6), { tone: "hi", crease: "lo" }));
  out.push(L(k.sideArc(x, y, DIAL_R, top + 1.2, P, 32), { tone: "faint" }));
  out.push(L(k.ring(x, y, DIAL_R - 1.4, DIAL_TOP, P, 48), { tone: "lo" }));
  const ticks = k.radialTicks(x, y, DIAL_R - 1.9, 20, 5, DIAL_TOP, [0.9, 1.9], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(L(k.ring(x, y, 1, DIAL_TOP, P, 12), { tone: "mid" }));
  out.push(k.faceTextSvg(k.topMatrix([x, y + 3.6], DIAL_TOP, P, "x"), "1 s", { size: 1.6, tone: "lo", anchor: "middle" }));
  return out.join("");
}

const needleAt = (turn) => {
  const angle = turn * Math.PI * 2;
  const [x, y] = DIAL;
  const reach = DIAL_R - 2.6;
  return k.lineOnTop([x - Math.sin(angle) * 1.8, y + Math.cos(angle) * 1.8], [x + Math.sin(angle) * reach, y - Math.cos(angle) * reach], DIAL_TOP + 0.15, P);
};

function counter(name, y, x0, x1, z0, z1) {
  const m = k.sideMatrix([0, y], 0, P, "left");
  const w = x1 - x0;
  const h = z1 - z0;
  const size = h * 0.72;
  const bezel = `M${x0 - 1.2} ${-z1 - 1.2}H${x1 + 1.2}V${-z0 + 1.2}H${x0 - 1.2}Z`;
  const win = `M${x0} ${-z1}H${x1}V${-z0}H${x0}Z`;
  const cells = [1, 2, 3].map((i) => `M${x0 + (w * i) / 4} ${-z1}V${-z0}`).join("");
  return (
    `<g transform="${m}">` +
    `<path class="tk-bezel" d="${bezel}"/><path class="iso-line" data-tone="lo" d="${bezel}"/>` +
    `<path class="tk-window" d="${win}"/>` +
    `<text class="tk-digits" data-count="${name}" x="${x0 + w / 2}" y="${-z0 - h * 0.2}" font-size="${size}" text-anchor="middle" textLength="${w * 0.84}" lengthAdjust="spacing">0000</text>` +
    `<path class="iso-line" data-tone="faint" d="${cells}"/><path class="iso-line" data-tone="mid" d="${win}"/>` +
    `</g>` +
    D([at([x0 - 3, y, (z0 + z1) / 2]), at([x1 + 3, y, (z0 + z1) / 2])], { size: 0.45 })
  );
}

function body() {
  const out = [];
  const seam = k.sideSeam(BODY, 3, P, 3);
  out.push(S(slab(BODY, 0, BASE, 3, 0.7), { tone: "mid", inner: L(seam, { tone: "faint" }) }));
  const drawer = [[66, BODY.y + BODY.d, 5], [96, BODY.y + BODY.d, 5], [96, BODY.y + BODY.d, 13.5], [66, BODY.y + BODY.d, 13.5]];
  out.push(L(quad(drawer), { tone: "lo" }));
  out.push(S(slab({ x: 77, y: BODY.y + BODY.d, w: 8, d: 1.6, r: 0.6 }, 8, 2.2, 2, 0.3), { tone: "mid" }));
  out.push(D([at([68.6, BODY.y + BODY.d, 11.6]), at([93.4, BODY.y + BODY.d, 11.6])], { size: 0.4 }));
  out.push(counter("ok", BODY.y + BODY.d, 24, 46, 6, 12.5));
  const rim = k.onTop(k.ringOf(HOLE, 2), BASE, P, true);
  const deep = BASE - 15;
  out.push(`<clipPath id="tk-hole"><path d="${rim}"/></clipPath>`);
  out.push(`<path class="tk-void" d="${rim}"/>`);
  out.push(
    `<g clip-path="url(#tk-hole)">` +
      `<path class="iso-shade" data-shade="1" d="${quad([[HOLE.x, HOLE.y, BASE], [HOLE.x, HOLE.y + HOLE.d, BASE], [HOLE.x, HOLE.y + HOLE.d, deep], [HOLE.x, HOLE.y, deep]])}"/>` +
      `<path class="iso-shade" data-shade="2" d="${quad([[HOLE.x, HOLE.y, BASE], [HOLE.x + HOLE.w, HOLE.y, BASE], [HOLE.x + HOLE.w, HOLE.y, deep], [HOLE.x, HOLE.y, deep]])}"/>` +
      L(k.segment([HOLE.x, HOLE.y, BASE], [HOLE.x, HOLE.y, deep], P), { tone: "faint" }) +
      `</g>`,
  );
  out.push(L(rim, { tone: "lo" }));
  return out.join("");
}

function backWalls() {
  const pieces = [];
  const xWall = (y0, y1, z0, z1) => pieces.push({ plan: { x: -13.5, y: y0, w: 1.5, d: y1 - y0, r: 0.3 }, z0, z1 });
  xWall(-12, -7, BASE, BASE + COIN_T + 0.5);
  xWall(7, 13.5, BASE, BASE + COIN_T + 0.5);
  xWall(-12, 13.5, BASE + COIN_T + 0.5, GATE_LO);
  xWall(-12, -11, GATE_LO, GATE_HI);
  xWall(11, 13.5, GATE_LO, GATE_HI);
  xWall(-12, 13.5, GATE_HI, WALL_TOP);
  const out = pieces.map(({ plan, z0, z1 }) => S(slab(plan, z0, z1 - z0, 2, 0), { tone: "mid" }));
  const yWall = { x: -13.5, y: -13.5, w: 27, d: 1.5, r: 0.3 };
  out.push(S(slab(yWall, BASE, WALL_TOP - BASE, 2, 0), { tone: "mid", inner: L(k.sideSeam(yWall, GATE_LO - 0.6, P, 2), { tone: "faint" }) }));
  out.push(D([[-6, 24], [6, 24], [-6, 60], [6, 60]].map(([x, z]) => at([x, -12, z])), { size: 0.4, tone: "lo" }));
  out.push(wallTicks());
  return out.join("");
}

function rail(y) {
  const plan = { x: 13.5, y, w: 94 - 13.5, d: 2.5, r: 0.5 };
  return S(slab(plan, BASE, 3, 2, 0.3), { tone: "mid" }) + D([20, 50, 88].map((x) => at([x, y + 1.25, BASE + 3])), { size: 0.4 });
}

function endStop() {
  const plan = { x: 94, y: -13.5, w: 4, d: 27, r: 0.8 };
  return S(slab(plan, BASE, 7, 2, 0.4), { tone: "mid" }) + D([at([96, -9, BASE + 7]), at([96, 9, BASE + 7])], { size: 0.45 });
}

function pusher() {
  const plan = { x: -11 - 40, y: -7, w: 40, d: 14, r: 0.6 };
  return S(slab(plan, BASE, COIN_T, 2, 0.3), { tone: "mid" });
}

function shutter() {
  const plan = { x: -12, y: -11, w: 24, d: 22, r: 0.6 };
  return S(slab(plan, GATE_LO, GATE_HI - GATE_LO, 2, 0.3), { tone: "mid" }) + D([at([8, -7, GATE_HI]), at([8, 7, GATE_HI])], { size: 0.4 });
}

function coin() {
  return S(k.cylinder(0, 0, COIN_R, 0, COIN_T, P, 64, 0.5), {
    tone: "hi",
    crease: "lo",
    lit: true,
    inner: L(k.ring(0, 0, COIN_R - 2.2, COIN_T, P, 56), { tone: "lo" }) + L(k.sideArc(0, 0, COIN_R, COIN_T / 2, P, 40), { tone: "faint" }),
  });
}

function wallTicks() {
  const minor = [];
  const major = [];
  for (let i = 0; i <= CAPACITY * 2; i++) {
    const z = BASE + i * (COIN_T / 2);
    (i % 2 === 0 ? major : minor).push(k.segment([-12, 13.5, z], [-12, 13.5 - (i % 2 === 0 ? 2.4 : 1.2), z], P));
  }
  return L(minor.join(""), { tone: "lo" }) + L(major.join(""), { tone: "mid" });
}

function cap() {
  const out = [];
  out.push(S(slab(CAP, WALL_TOP, CAP_TOP - WALL_TOP, 3, 0.7), { tone: "mid", inner: L(k.sideSeam(CAP, WALL_TOP + 2.4, P, 3), { tone: "faint" }) }));
  out.push(D(k.corners(CAP, 3.6).map(([x, y]) => at([x, y, CAP_TOP])), { size: 0.45 }));
  out.push(S(k.cylinder(0.5, 0.5, 8, CAP_TOP, 1.2, P, 40, 0.3), { tone: "mid" }));
  out.push(S(k.cylinder(0.5, 0.5, 6.4, CAP_TOP + 1.2, 3.6, P, 40, 0.4), { tone: "mid" }));
  out.push(L(k.knurl(0.5, 0.5, 6.4, CAP_TOP + 1.6, CAP_TOP + 4.8, 40, P, 0.3), { tone: "lo" }));
  out.push(L(k.ring(0.5, 0.5, 3.6, CAP_TOP + 4.8, P, 28), { tone: "faint" }));
  return out.join("");
}

const START = 5;
const coinSvg = coin();
const slots = Array.from({ length: CAPACITY }, (_, i) => `<g data-slot="${i}"${i < START ? ` transform="${k.translateAlong(P, [0, 0, BASE + i * COIN_T])}"` : ` style="display:none"`}>${coinSvg}</g>`);
const exits = Array.from({ length: 4 }, (_, i) => `<g data-exit="${i}" style="display:none">${coinSvg}</g>`);
const reservoir = Array.from({ length: 4 }, (_, i) => `<g transform="${k.translateAlong(P, [0, 0, GATE_HI + i * COIN_T])}">${coinSvg}</g>`);
const PHASE = 0.3;

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "A token bucket built as a coin-tube dispenser. A clear tube holds up to eight coins, the tokens. Once a second a clock-driven gate at the top drops one coin from a supply tube into it, unless the tube is already full. Each request presses a button that drives a pusher under the stack: it slides the bottom coin out along a track into a cash drawer and the request goes through. When the tube is empty the pusher strokes through nothing and the request is turned away.",
  body: [
    `<defs>${prismClip("tk-push", { x: -12, y: -10, w: 60, d: 20, r: 0 }, BASE - 2, BASE + 8)}${prismClip("tk-gate", { x: -12, y: -14, w: 40, d: 28, r: 0 }, GATE_LO - 3, GATE_HI + 3)}${prismClip("tk-exit", { x: -13, y: -11, w: 94 + 13, d: 22, r: 0 }, BASE, 400)}</defs>`,
    plate(),
    pushBox(),
    `<g data-part="button">${button()}</g>`,
    columns(),
    gateBox(),
    `<path data-part="needle" class="iso-line" data-tone="hi" data-free="start" d="${needleAt(PHASE)}" style="stroke-width:0.9"/>`,
    body(),
    backWalls(),
    rail(-13.5),
    `<g clip-path="url(#tk-push)"><g data-part="pusher">${pusher()}</g></g>`,
    `<g clip-path="url(#tk-exit)">${exits.join("")}</g>`,
    slots.join(""),
    `<g clip-path="url(#tk-gate)"><g data-part="shutter">${shutter()}</g></g>`,
    `<g data-part="reservoir">${reservoir.join("")}</g>`,
    rail(11),
    endStop(),
    cap(),
  ],
});

const live = `
const P = ${JSON.stringify(P)};
const CAPACITY = ${CAPACITY}, RATE = ${RATE}, COIN_T = ${COIN_T}, BASE = ${BASE}, GATE_HI = ${GATE_HI}, STROKE = ${STROKE}, SHUTTER_RUN = ${SHUTTER_RUN}, STOP_X = ${STOP_X}, DROP_Z = ${DROP_Z}, DIAL = ${JSON.stringify(DIAL)}, DIAL_R = ${DIAL_R}, DIAL_TOP = ${DIAL_TOP};
const G = 900, OUT = 0.09, HOLD = 0.02, BACK = 0.13, OPEN = 0.09, SHUT = 0.11, MAX_RATE = 4, SLIDE = 150;
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const readout = document.querySelector("[data-readout]");
const slots = [...svg.querySelectorAll("[data-slot]")];
const pool = [...svg.querySelectorAll("[data-exit]")];
const part = (name) => svg.querySelector('[data-part="' + name + '"]');
const counters = { ok: svg.querySelector('[data-count="ok"]'), limited: svg.querySelector('[data-count="limited"]') };
const show = (el, n) => { const text = String(n % 10000).padStart(4, "0"); if (el.textContent !== text) el.textContent = text; };
const pusherEl = part("pusher"), shutterEl = part("shutter"), reservoirEl = part("reservoir"), buttonEl = part("button"), needle = part("needle");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const ease = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const needleAt = ${needleAt.toString().replace("k.lineOnTop", "lineOnTop")};
const stack = Array.from({ length: ${START} }, (_, i) => ({ z: BASE + i * COIN_T, v: 0 }));
const exits = [];
let phase = ${PHASE}, stroke = null, gate = null, ext = 0, open = 0, resOff = 0, resV = 0, press = 0;
let rate = 0.6, acc = 0.5, queue = 0, ok = 0, limited = 0;
let frame = 0, last = 0, visible = false, touring = !still.matches, tourClock = 0, idleTimer = 0, lastTourStep = -1;
const TOUR = [[6, 0.6], [6, 2.8], [4.5, 0], [0, -5], [5.5, 0.8]];
const TOUR_LEN = TOUR.reduce((sum, [d]) => sum + d, 0);
const settled = (c) => c.z < BASE + 0.05 && Math.abs(c.v) < 1;
function request(n = 1) { queue = Math.min(queue + n, 6); press = 1; }
function tour(dt) {
  tourClock = (tourClock + dt) % TOUR_LEN;
  let t = tourClock, step = 0;
  while (step < TOUR.length - 1 && t >= TOUR[step][0]) { t -= TOUR[step][0]; step++; }
  const [, value] = TOUR[step];
  if (value < 0) { if (lastTourStep !== step) request(-value); }
  else rate = value;
  lastTourStep = step;
}
function startStroke() {
  if (stack.length) {
    const bottom = stack.shift();
    const el = pool.find((node) => !exits.some((e) => e.el === node));
    if (el) exits.push({ el, x: 0, z: bottom.z, vz: 0, mode: "push", alpha: 1, t: 0 });
    ok++;
  } else limited++;
  stroke = { t: 0 };
  queue--;
}
function step(dt) {
  if (touring) tour(dt);
  acc += rate * dt;
  while (acc >= 1) { acc -= 1; request(); }
  press = Math.max(0, press - dt / 0.16);
  if (!stroke && queue > 0 && (stack.length === 0 || settled(stack[0]))) startStroke();
  if (stroke) {
    stroke.t += dt;
    const t = stroke.t;
    ext = t < OUT ? ease(t / OUT) : t < OUT + HOLD ? 1 : 1 - ease((t - OUT - HOLD) / BACK);
    if (t >= OUT + HOLD + BACK) { stroke = null; ext = 0; }
  }
  phase += RATE * dt;
  if (phase >= 1) { phase -= 1; if (stack.length < CAPACITY && !gate) gate = { t: 0, released: false }; }
  if (gate) {
    gate.t += dt;
    const t = gate.t;
    open = t < OPEN ? ease(t / OPEN) : 1 - ease((t - OPEN) / SHUT);
    if (!gate.released && t >= OPEN * 0.85) {
      gate.released = true;
      if (stack.length < CAPACITY) { stack.push({ z: GATE_HI, v: 0 }); resOff = COIN_T; resV = 0; }
    }
    if (t >= OPEN + SHUT) {
      open = 0;
      resV -= G * dt; resOff += resV * dt;
      if (resOff <= 0) { resOff = 0; resV = 0; gate = null; }
    }
  }
  const front = -11 + STROKE * ext;
  for (const e of exits) {
    e.t += dt;
    if (e.mode === "push") { e.x = Math.max(e.x, front + 10); if (stroke && stroke.t >= OUT) e.mode = "slide"; if (!stroke) e.mode = "slide"; }
    else if (e.mode === "slide") { e.x = Math.min(STOP_X, e.x + SLIDE * dt); if (e.x >= STOP_X) { e.mode = "drop"; e.vz = 0; } }
    else if (e.mode === "drop") { e.vz -= G * dt; e.z += e.vz * dt; if (e.z <= DROP_Z) { e.z = DROP_Z; e.mode = "rest"; e.t = 0; } }
    else if (e.mode === "rest") { e.alpha = 1 - ease(e.t / 0.5); }
  }
  for (let i = exits.length - 1; i >= 0; i--) if (exits[i].mode === "rest" && exits[i].alpha <= 0) { exits[i].el.style.display = "none"; exits.splice(i, 1); }
  const held = front > -6 || exits.some((e) => e.x < 14 && e.z >= BASE - 0.1);
  const floor = held ? BASE + COIN_T : BASE;
  const n = 4, h = dt / n;
  for (let s = 0; s < n; s++) {
    for (const c of stack) { c.v -= G * h; c.z += c.v * h; }
    stack.forEach((c, i) => {
      const lo = i === 0 ? floor : stack[i - 1].z + COIN_T;
      if (c.z < lo) { c.z = lo; c.v = i === 0 ? 0 : stack[i - 1].v; }
    });
  }
}
function calm() {
  stack.forEach((c, i) => { c.z = BASE + i * COIN_T; c.v = 0; });
  for (const e of exits) e.el.style.display = "none";
  exits.length = 0; ext = 0; open = 0; resOff = 0; gate = null; stroke = null; press = 0;
}
const say = (text) => { if (readout.textContent !== text) readout.textContent = text; };
function draw() {
  slots.forEach((el, i) => {
    const c = stack[i];
    if (!c) { if (el.style.display !== "none") el.style.display = "none"; return; }
    el.style.display = "";
    el.setAttribute("transform", translateAlong(P, [0, 0, c.z]));
  });
  for (const e of exits) {
    e.el.style.display = "";
    e.el.setAttribute("transform", translateAlong(P, [e.x, 0, e.z]));
    e.el.setAttribute("opacity", e.alpha.toFixed(3));
  }
  pusherEl.setAttribute("transform", translateAlong(P, [STROKE * ext, 0, 0]));
  shutterEl.setAttribute("transform", translateAlong(P, [-SHUTTER_RUN * open, 0, 0]));
  reservoirEl.setAttribute("transform", translateAlong(P, [0, 0, resOff]));
  buttonEl.setAttribute("transform", translateAlong(P, [0, 0, -1.4 * ease(press * 1.6)]));
  needle.setAttribute("d", needleAt(phase));
  show(counters.ok, ok);
  show(counters.limited, limited);
  const tokens = stack.length;
  say(rate.toFixed(1) + " req/s · " + tokens + "/" + CAPACITY + " tokens · " + ok + " ok · " + limited + " limited");
  stage.setAttribute("aria-valuenow", rate.toFixed(1));
  stage.setAttribute("aria-valuetext", rate.toFixed(1) + " requests per second, " + tokens + " of " + CAPACITY + " tokens, " + ok + " allowed, " + limited + " limited");
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  step(dt);
  draw();
  frame = visible && !still.matches ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible && !still.matches) { last = 0; frame = requestAnimationFrame(tick); } };
let hovering = false;
const quiet = () => { touring = false; clearTimeout(idleTimer); idleTimer = setTimeout(() => { if (hovering) return; touring = !still.matches; tourClock = 0; lastTourStep = -1; run(); }, 3600); };
function instant(n) {
  for (let i = 0; i < n; i++) { if (stack.length) { stack.pop(); ok++; } else limited++; }
  calm(); draw();
}
function burst() { quiet(); if (still.matches) instant(5); else request(5); run(); }
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
stage.addEventListener("pointermove", (event) => {
  if (still.matches) return;
  const box = svg.getBoundingClientRect();
  const share = clamp(((event.clientX - box.left) / box.width - 0.15) / 0.7, 0, 1);
  hovering = true;
  quiet();
  rate = Math.round(share * MAX_RATE * 10) / 10;
});
stage.addEventListener("pointerleave", () => { hovering = false; quiet(); });
stage.addEventListener("click", burst);
stage.addEventListener("keydown", (event) => {
  if (event.key === " " || event.key === "Enter") { event.preventDefault(); burst(); return; }
  let next = null;
  if (event.key === "ArrowRight" || event.key === "ArrowUp") next = rate + 0.5;
  if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = rate - 0.5;
  if (event.key === "Home") next = 0;
  if (event.key === "End") next = MAX_RATE;
  if (next === null) return;
  event.preventDefault();
  quiet();
  rate = clamp(Math.round(next * 10) / 10, 0, MAX_RATE);
  if (still.matches) draw();
  run();
});
still.addEventListener("change", () => { if (still.matches) { touring = false; calm(); draw(); } else { touring = true; run(); } });
if (still.matches) { touring = false; rate = 0; }
draw();
`;

const css = `<style>
.tk-void{fill:var(--tk-void)}
.tk-window{fill:var(--tk-window)}
.tk-bezel{fill:var(--anatomy-shade-1)}
.tk-digits{fill:var(--anatomy-hi);font-family:var(--anatomy-mono);font-weight:500}
.iso[data-theme="light"]{--tk-void:#b9b9b4;--tk-window:#f1f1ee}
.iso[data-theme="dark"]{--tk-void:#070707;--tk-window:#0c0c0c}
.iso-stage{cursor:pointer;outline:none}
.iso-stage:focus-visible{box-shadow:0 0 0 1px var(--anatomy-mid)}
</style>`;

const plateBody = k.plateHtml({
  fig: "Fig 1",
  title: "Token bucket",
  hint: "Hover sets the rate · click for a burst",
  readout: `0.6 req/s · ${START}/${CAPACITY} tokens · 0 ok · 0 limited`,
  keys: [
    { mark: "lit", label: "Coins: tokens, at most 8 in the tube" },
    { mark: "raised", label: "Clock gate: adds 1 token every second" },
    { mark: "raised", label: "Pusher: each request takes the bottom token" },
    { mark: "edge", label: "Counters: allowed (front), limited (back)" },
  ],
  caption:
    "A token bucket with a capacity of 8 and a refill rate of 1 token per second. Once a second the clock opens the gate and one coin drops into the tube; if the tube is already full the coin can't fall and that token is lost. Every request presses the button, and the pusher slides the bottom coin out into the drawer: the request is allowed. With the tube empty the pusher strokes through air and the request is limited. Below 1 req/s the tube stays full; above it, a full tube absorbs a burst of 8, then requests pass at exactly 1 per second.",
  body: `<div class="iso-stage" tabindex="0" role="slider" aria-label="Token bucket: arrow keys change the request rate, space sends a burst of 5 requests" aria-valuemin="0" aria-valuemax="4" aria-valuenow="0.6">${svg}</div>`,
});

writeFileSync(join(HERE, OUT), k.pageHtml({ title: "Token bucket", theme, body: css + plateBody, script: kitScript() + live }));
console.log("wrote", OUT);
