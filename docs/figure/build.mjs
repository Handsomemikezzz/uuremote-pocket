import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SKILL = process.env.ANATOMY_SKILL ?? join(homedir(), ".claude/skills/anatomy");
const k = await import(pathToFileURL(join(SKILL, "kit/iso-kit.mjs")).href);
const { kitScript } = await import(pathToFileURL(join(SKILL, "scripts/inline-kit.mjs")).href);

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--dark") ? "dark" : "light";
const OUT = theme === "light" ? "pocket-mac.html" : "pocket-mac-dark.html";

const WIDTH = 600;
const HEIGHT = 420;

const PT = 0.045;
const BUILT_IN = { w: 1512, h: 982 };
const PRESETS = {
  large: { id: "large", title: "大字", w: 660, h: 1434 },
  standard: { id: "standard", title: "标准", w: 800, h: 1738 },
};
const MIN_LIFETIME = 2.5;

const PW = BUILT_IN.w * PT;
const PH = BUILT_IN.h * PT;
const VX = PW + 1;
const WELL_W = PRESETS.standard.w * PT;
const WELL_H = PRESETS.standard.h * PT;
const SHIFT = VX;

const BOARD = { x: -84, y: -16, w: 204, d: 124, r: 8 };
const BOARD_H = 8;
const FOOT_H = 4;
const RAIL_H = 2;
const TRAY = { x: -4, y: -4, w: VX + WELL_W + 5, d: WELL_H + 8, r: 2.5 };
const TRAY_Z = RAIL_H;
const TRAY_TOP = TRAY_Z + 8;
const TILE_T = 3;
const DOWN = TRAY_Z + 1;
const UP = TRAY_TOP;
const WELL = { x: VX - 0.5, y: -0.5, w: WELL_W + 1, d: WELL_H + 1, r: 1.6 };
const POST = [0, -10];
const POST_TOP = 24;
const BLOCK = { x: 82, y: 90, w: 34, d: 14, r: 2 };
const BLOCK_H = 9;
const DIAL = [92, 97];
const DIAL_R = 5.6;
const DIAL_TOP = BLOCK_H + 2.4;
const LAMP = [103, 94.5];
const KNOB = [109.5, 98.5];

const P = k.fitProjection(
  [...k.boxCorners(BOARD, -BOARD_H - FOOT_H, 0), [POST[0], POST[1], POST_TOP + 2], [BOARD.x + BOARD.w, BOARD.y, 14]],
  WIDTH,
  HEIGHT,
  { pad: 30, azimuth: 38, elevation: 34 },
);

const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const slab = (plan, z, h, steps = 3, bevel = 0.5) => k.slabOf(plan, z, h, P, steps, bevel);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));

function board() {
  const out = [`<path class="iso-halo" d="${k.haloOf(BOARD, -BOARD_H - FOOT_H, BOARD_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(BOARD, 18))) {
    out.push(S(k.cylinder(x, y, 6.4, -BOARD_H - FOOT_H, 1.4, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5, -BOARD_H - FOOT_H + 1.4, FOOT_H - 1.4, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(BOARD, -BOARD_H, BOARD_H, P, 8, 1.4), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(BOARD, 4.5), 0, P), { tone: "lo" }));
  const screws = k.corners(BOARD, 9);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));

  const strip = { x: -76, y: 96, w: 152, d: 6, r: 1 };
  out.push(S(slab(strip, 0, 0.6, 3, 0), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(-67.5, 72, 100 * PT, 5, strip.y + 0.6, 0.6, [1.6, 3.2], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(L(k.lineOnTop([0, strip.y + 0.6], [0, strip.y + 3.8], 0.6, P), { tone: "hi" }));
  out.push(D([at([strip.x + 1.8, strip.y + 3, 0.6]), at([strip.x + strip.w - 1.8, strip.y + 3, 0.6])], { size: 0.4 }));

  const label = { x: -78, y: 76, w: 28, d: 11, r: 1 };
  out.push(S(slab(label, 0, 0.8, 3, 0), { tone: "lo", crease: "none" }));
  out.push(L(k.planOutline(k.insetPlan(label, 1.4), 0.8, P, 3), { tone: "faint" }));
  [[79.6, 17], [82.4, 12], [85, 15]].forEach(([y, length]) => out.push(L(k.lineOnTop([label.x + 4, y], [label.x + 4 + length, y], 0.8, P), { tone: "lo", free: true })));
  out.push(D([at([label.x + label.w - 3, label.y + 3, 0.8]), at([label.x + label.w - 3, label.y + label.d - 3, 0.8])], { size: 0.45 }));
  return out.join("");
}

function rails() {
  const out = [];
  for (const y of [10, 66]) {
    out.push(S(slab({ x: -80, y, w: 196, d: 4, r: 1 }, 0, RAIL_H, 3, 0.3), { tone: "mid" }));
    out.push(D([-74, -30, 30, 74, 110].map((x) => at([x, y + 2, RAIL_H])), { size: 0.4 }));
  }
  for (const x of [-82, 116]) out.push(S(slab({ x, y: 6, w: 3, d: 68, r: 1 }, 0, 5, 3, 0.4), { tone: "mid" }));
  return out.join("");
}

function post() {
  const [x, y] = POST;
  const out = [];
  out.push(S(k.cylinder(x, y, 5, 0, 1.6, P, 32, 0.3), { tone: "mid" }));
  out.push(S(k.cylinder(x, y, 3, 1.6, POST_TOP - 1.6, P, 28), { tone: "mid", crease: "none" }));
  out.push(L([7, 14, 20].map((z) => k.sideArc(x, y, 3, z, P, 16)).join(""), { tone: "faint" }));
  return out.join("");
}

function arm() {
  const [x, y] = POST;
  const out = [];
  const plan = { x: x - 2, y: y - 2, w: 4, d: -y + 0.6, r: 1 };
  out.push(S(slab(plan, POST_TOP, 2.2, 2, 0.4), { tone: "mid" }));
  out.push(S(k.cylinder(x, -1.4, 1.5, POST_TOP - 2.4, 2.4, P, 20, 0.3), { tone: "mid" }));
  out.push(S(k.cylinder(x, -1.4, 0.8, UP + TILE_T + 0.5, POST_TOP - 2.4 - UP - TILE_T - 0.5, P, 16), { tone: "hi", lit: true }));
  out.push(S(k.cylinder(x, y, 3.6, POST_TOP + 2.2, 1.4, P, 28, 0.3), { tone: "mid" }));
  out.push(k.faceTextSvg(k.topMatrix([x + 0.1, y + 6.2], POST_TOP + 2.2, P, "y"), "0,0", { size: 2.2, tone: "mid", anchor: "middle" }));
  return out.join("");
}

function screenOn(plan, z, { bezel, menu, windows, notchless }) {
  const scr = k.insetPlan(plan, bezel);
  const out = [];
  out.push(`<path class="pm-screen" d="${k.planOutline(scr, z, P, 2)}"/>`);
  out.push(L(k.planOutline(scr, z, P, 2), { tone: "lo" }));
  out.push(L(k.lineOnTop([scr.x, scr.y + menu], [scr.x + scr.w, scr.y + menu], z, P), { tone: "faint" }));
  for (const win of windows) out.push(L(k.planOutline(win, z, P, 2), { tone: "lo" }));
  if (!notchless) out.push(D([at([plan.x + plan.w / 2, plan.y + bezel / 2, z])], { size: 0.45, tone: "mid" }));
  return out.join("");
}

function builtIn() {
  const plan = { x: 0, y: 0, w: PW, d: PH, r: 1.6 };
  const z = UP + TILE_T;
  const out = [S(slab(plan, UP, TILE_T, 3, 0.5), { tone: "mid" })];
  out.push(
    screenOn(plan, z, {
      bezel: 1.8,
      menu: 1.3,
      windows: [
        { x: 6, y: 6, w: 30, d: 20, r: 0.8 },
        { x: 26, y: 13, w: 34, d: 22, r: 0.8 },
        { x: PW / 2 - 12, y: PH - 6.2, w: 24, d: 2.6, r: 1 },
      ],
    }),
  );
  return out.join("");
}

function virtual(preset) {
  const w = preset.w * PT;
  const h = preset.h * PT;
  const plan = { x: VX, y: 0, w, d: h, r: 2.4 };
  const z = TILE_T;
  const local = { ...plan };
  const out = [S(k.slabOf(local, 0, TILE_T, P, 4, 0.5), { tone: "hi", crease: "lo", lit: true })];
  out.push(
    screenOn(local, z, {
      bezel: 1.3,
      menu: 1.1,
      notchless: true,
      windows: [
        { x: VX + 3, y: 6, w: w - 6, d: h * 0.34, r: 0.8 },
        { x: VX + 3, y: 8 + h * 0.34, w: w - 6, d: h * 0.4, r: 0.8 },
      ],
    }),
  );
  const pill = { x: VX + w - 8.6, y: 3.4, w: 6, d: 2.2, r: 1.1 };
  out.push(S(k.slabOf(pill, z, 0.5, P, 3), { tone: "hi", crease: "none", className: "pm-exit" }));
  return out.join("");
}

function carriage() {
  const out = [];
  out.push(`<path class="iso-halo" d="${k.haloOf(k.insetPlan(TRAY, 2), TRAY_Z, 0.1, P)}" style="filter:blur(5px)"/>`);
  out.push(S(slab(TRAY, TRAY_Z, TRAY_TOP - TRAY_Z, 3, 0.7), { tone: "mid", inner: L(k.sideSeam(TRAY, TRAY_Z + 3, P, 3), { tone: "faint" }) }));
  const groove = k.insetPlan(TRAY, 1.6);
  out.push(L(k.planOutline(groove, TRAY_TOP, P, 3), { tone: "faint" }));
  const grid = [];
  for (let x = 500 * PT; x < groove.x + groove.w; x += 500 * PT) grid.push(k.lineOnTop([x, groove.y], [x, groove.y + groove.d], TRAY_TOP, P));
  for (let y = 500 * PT; y < groove.y + groove.d; y += 500 * PT) grid.push(k.lineOnTop([groove.x, y], [groove.x + groove.w, y], TRAY_TOP, P));
  out.push(L(grid.join(""), { tone: "faint" }));
  out.push(D([[-1.6, -1.6], [-1.6, TRAY.y + TRAY.d - 2.4], [TRAY.x + TRAY.w - 2.4, -1.6], [TRAY.x + TRAY.w - 2.4, TRAY.y + TRAY.d - 2.4]].map(([x, y]) => at([x, y, TRAY_TOP])), { size: 0.45 }));
  const rim = k.onTop(k.ringOf(WELL, 2), TRAY_TOP, P, true);
  const deep = TRAY_Z + 0.6;
  out.push(`<clipPath id="pm-well"><path d="${rim}"/></clipPath>`);
  out.push(`<path class="pm-void" d="${rim}"/>`);
  const quad = (points) => k.pathOf(points.map(at), true);
  out.push(
    `<g clip-path="url(#pm-well)">` +
      `<path class="iso-shade" data-shade="1" d="${quad([[WELL.x, WELL.y, TRAY_TOP], [WELL.x, WELL.y + WELL.d, TRAY_TOP], [WELL.x, WELL.y + WELL.d, deep], [WELL.x, WELL.y, deep]])}"/>` +
      `<path class="iso-shade" data-shade="2" d="${quad([[WELL.x, WELL.y, TRAY_TOP], [WELL.x + WELL.w, WELL.y, TRAY_TOP], [WELL.x + WELL.w, WELL.y, deep], [WELL.x, WELL.y, deep]])}"/>` +
      `</g>`,
  );
  out.push(L(rim, { tone: "lo" }));
  out.push(builtIn());
  const lift = (preset) =>
    `<g data-virtual="${preset.id}"${preset.id === "large" ? "" : ` style="display:none"`}>${virtual(preset)}</g>`;
  out.push(`<g clip-path="url(#pm-lift)"><g data-part="lift" transform="${k.translateAlong(P, [0, 0, DOWN])}">${lift(PRESETS.large)}${lift(PRESETS.standard)}</g></g>`);
  return out.join("");
}

function instrument() {
  const out = [];
  out.push(S(slab(BLOCK, 0, BLOCK_H, 3, 0.6), { tone: "mid", inner: L(k.sideSeam(BLOCK, 3, P, 3), { tone: "faint" }) }));
  out.push(D(k.corners(BLOCK, 2.4).map(([x, y]) => at([x, y, BLOCK_H])), { size: 0.45 }));
  const [x, y] = DIAL;
  out.push(S(k.cylinder(x, y, DIAL_R, BLOCK_H, 2.4, P, 48, 0.5), { tone: "hi", crease: "lo" }));
  out.push(L(k.ring(x, y, DIAL_R - 1, DIAL_TOP, P, 40), { tone: "lo" }));
  const ticks = k.radialTicks(x, y, DIAL_R - 1.4, 25, 5, DIAL_TOP, [0.7, 1.5], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(L(k.ring(x, y, 0.7, DIAL_TOP, P, 12), { tone: "mid" }));
  out.push(k.faceTextSvg(k.topMatrix([x, y + 2.6], DIAL_TOP, P, "x"), "2.5 s", { size: 1.1, tone: "lo", anchor: "middle" }));
  out.push(S(k.cylinder(LAMP[0], LAMP[1], 2.6, BLOCK_H, 0.8, P, 28, 0.2), { tone: "mid" }));
  out.push(`<g data-part="lamp">${S(k.cylinder(LAMP[0], LAMP[1], 1.7, BLOCK_H + 0.8, 1.4, P, 24, 0.3), { tone: "hi", crease: "lo", lit: true })}</g>`);
  out.push(S(k.cylinder(KNOB[0], KNOB[1], 3.4, BLOCK_H, 0.8, P, 28, 0.2), { tone: "mid" }));
  out.push(S(k.cylinder(KNOB[0], KNOB[1], 2.6, BLOCK_H + 0.8, 2.6, P, 28, 0.3), { tone: "mid" }));
  out.push(L(k.knurl(KNOB[0], KNOB[1], 2.6, BLOCK_H + 1.2, BLOCK_H + 3.4, 22, P, 0.3), { tone: "lo" }));
  for (const side of [-1, 1]) {
    const a = (side * 50 * Math.PI) / 180;
    out.push(D([at([KNOB[0] + Math.sin(a) * 3.0, KNOB[1] - Math.cos(a) * 3.0, BLOCK_H + 0.8])], { size: 0.4, tone: "mid" }));
  }
  return out.join("");
}

const needleAt = (turn) => {
  const a = turn * Math.PI * 2;
  const [x, y] = DIAL;
  const reach = DIAL_R - 2;
  return k.lineOnTop([x - Math.sin(a) * 1.2, y + Math.cos(a) * 1.2], [x + Math.sin(a) * reach, y - Math.cos(a) * reach], DIAL_TOP + 0.15, P);
};
const knobAt = (side) => {
  const a = (side * 50 * Math.PI) / 180;
  const [x, y] = KNOB;
  const top = BLOCK_H + 3.4;
  return k.lineOnTop([x, y], [x + Math.sin(a) * 2.2, y - Math.cos(a) * 2.2], top, P);
};

const liftClip = `<clipPath id="pm-lift"><path d="${k.slabOf(WELL, TRAY_TOP, 60, P, 2).fill}"/></clipPath>`;

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "Pocket Mac 的显示器排布台。台面代表 macOS 的全局显示坐标，后方立柱的针尖标出原点 (0,0)，压在原点上的那块屏就是主屏。滑台上平放着内建屏；进入手机模式时，一块竖向的 HiDPI 虚拟屏从滑台的井口升起，接着整块滑台左移，把虚拟屏的角送到原点上，内建屏保持相对位置跟着移开。退出时虚拟屏要存活满 2.5 秒才会降下，滑台随后弹回；进程被强杀时虚拟屏立即消失。",
  body: [
    `<defs>${liftClip}</defs>`,
    board(),
    rails(),
    post(),
    `<g data-part="carriage">${carriage()}</g>`,
    arm(),
    instrument(),
    `<path data-part="needle" class="iso-line" data-tone="hi" data-free="start" d="${needleAt(0)}" style="stroke-width:0.8"/>`,
    `<path data-part="knob" class="iso-line" data-tone="hi" data-free="end" d="${knobAt(-1)}" style="stroke-width:0.9"/>`,
  ],
});

const live = `
const P = ${JSON.stringify(P)};
const PRESETS = ${JSON.stringify(PRESETS)};
const SHIFT = ${SHIFT}, DOWN = ${DOWN}, UP = ${UP}, MIN_LIFETIME = ${MIN_LIFETIME}, DIAL = ${JSON.stringify(DIAL)}, DIAL_R = ${DIAL_R}, DIAL_TOP = ${DIAL_TOP}, KNOB = ${JSON.stringify(KNOB)}, BLOCK_H = ${BLOCK_H};
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const readout = document.querySelector("[data-readout]");
const part = (name) => svg.querySelector('[data-part="' + name + '"]');
const carriageEl = part("carriage"), liftEl = part("lift"), needle = part("needle"), knob = part("knob"), lampEl = part("lamp").firstElementChild;
const tiles = { large: svg.querySelector('[data-virtual="large"]'), standard: svg.querySelector('[data-virtual="standard"]') };
const still = matchMedia("(prefers-reduced-motion: reduce)");
const needleAt = ${needleAt.toString().replace("k.lineOnTop", "lineOnTop")};
const knobAt = ${knobAt.toString().replace("k.lineOnTop", "lineOnTop")};
const follow = (v, target, dt, tau) => { const n = v + (target - v) * (1 - Math.exp(-dt / tau)); return Math.abs(target - n) < 0.002 ? target : n; };
const size = (p) => p.w + "×" + p.h + " pt";

const S = { selected: "large", desired: null, vd: null, mainSet: false, saved: false, bornAt: 0, busyUntil: 0, alive: true, killedAt: 0, now: 0, note: "" };
let lift = 0, liftTarget = 0, shift = 0, shiftTarget = 0, liftTau = 0.16;
let frame = 0, last = 0, visible = false, touring = !still.matches, tourClock = 0, tourIndex = 0, idleTimer = 0;

function advance() {
  const t = S.now;
  if (t < S.busyUntil) return;
  if (!S.alive) {
    if (t - S.killedAt < 2.2) return;
    S.alive = true;
    S.note = S.saved ? "重启 · 读回上次的布局记录并还原" : "重启 · 无残留，手机模式未开启";
    S.saved = false;
    S.busyUntil = t + 1.2;
    return;
  }
  const want = S.desired;
  const age = t - S.bornAt;
  const release = (why) => {
    if (age < MIN_LIFETIME) { S.note = "退出中 · 虚拟屏存活未满 2.5 s，等待释放"; S.busyUntil = t + 0.1; return; }
    S.vd = null; S.mainSet = false;
    liftTarget = 0; liftTau = 0.12; shiftTarget = 0;
    S.note = why;
    S.busyUntil = t + 1.5;
  };
  if (want && S.vd && S.vd !== want) return release("切换预设 · 先释放旧虚拟屏");
  if (want && !S.vd) {
    S.saved = true;
    S.vd = want; S.bornAt = t; S.mainSet = false;
    liftTarget = 1; liftTau = 0.16;
    show(want);
    S.note = "进入中 · 记录布局，创建虚拟屏 " + size(PRESETS[want]);
    S.busyUntil = t + 1.0;
    return;
  }
  if (want && !S.mainSet) {
    shiftTarget = 1;
    S.mainSet = true;
    S.note = "进入中 · 移到 (0,0) 设为主屏，切到 HiDPI @2x";
    S.busyUntil = t + 0.8;
    return;
  }
  if (want) { S.note = "已开启 · 主屏 = Pocket Mac " + PRESETS[want].title + " " + size(PRESETS[want]); return; }
  if (S.vd) return release("退出中 · 释放虚拟屏，主屏回到内建屏");
  if (S.saved) { S.saved = false; S.note = "退出中 · 还原布局（已与进入前一致）"; S.busyUntil = t + 0.5; return; }
  S.note = "未开启 · 主屏 = 内建屏 " + BUILT + " pt";
}
const BUILT = "${BUILT_IN.w}×${BUILT_IN.h}";
function show(id) { for (const key in tiles) tiles[key].style.display = key === id ? "" : "none"; }
function kill() {
  if (!S.alive) return;
  S.alive = false; S.killedAt = S.now;
  S.desired = null; S.vd = null; S.mainSet = false; S.busyUntil = 0;
  liftTarget = 0; liftTau = 0.06; shiftTarget = 0;
  S.note = "kill -9 · 进程结束，系统回收虚拟屏，主屏回到内建屏";
}
function toggle() {
  if (!S.alive) return;
  S.desired = S.desired ? null : S.selected;
}
function pick(id) {
  S.selected = id;
  if (S.desired) S.desired = id;
}
const TOUR = [[0.5, () => { pick("large"); toggle(); }], [5.5, toggle], [9.5, () => { pick("standard"); toggle(); }], [14, kill], [19.5, () => pick("large")], [21, null]];
function tour(dt) {
  tourClock += dt;
  while (tourIndex < TOUR.length && tourClock >= TOUR[tourIndex][0]) { const action = TOUR[tourIndex][1]; if (action) action(); tourIndex++; }
  if (tourIndex >= TOUR.length) { tourClock = 0; tourIndex = 0; }
}
function step(dt) {
  S.now += dt;
  if (touring) tour(dt);
  advance();
  lift = follow(lift, liftTarget, dt, liftTau);
  shift = follow(shift, shiftTarget, dt, 0.18);
}
function snap() { lift = liftTarget; shift = shiftTarget; }
const say = (text) => { if (readout.textContent !== text) readout.textContent = text; };
function draw() {
  carriageEl.setAttribute("transform", translateAlong(P, [-SHIFT * shift, 0, 0]));
  liftEl.setAttribute("transform", translateAlong(P, [0, 0, DOWN + (UP - DOWN) * lift]));
  const age = S.vd ? Math.min(S.now - S.bornAt, MIN_LIFETIME) : 0;
  needle.setAttribute("d", needleAt(age / MIN_LIFETIME));
  knob.setAttribute("d", knobAt(S.selected === "large" ? -1 : 1));
  lampEl.toggleAttribute("data-lit", S.alive);
  say(S.note);
  stage.setAttribute("aria-valuetext", S.note);
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  step(dt);
  draw();
  frame = visible && !still.matches ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible && !still.matches) { last = 0; frame = requestAnimationFrame(tick); } };
const quiet = () => { touring = false; clearTimeout(idleTimer); idleTimer = setTimeout(() => { touring = !still.matches; tourClock = 0; tourIndex = 0; run(); }, 9000); };
function settleNow() { for (let i = 0; i < 400; i++) { S.now += 0.05; advance(); } snap(); draw(); }
function act(fn) { quiet(); fn(); if (still.matches) settleNow(); else run(); }
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
stage.addEventListener("click", () => act(toggle));
stage.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  let fn = null;
  if (key === " " || key === "enter") fn = toggle;
  if (key === "1" || key === "arrowleft") fn = () => pick("large");
  if (key === "2" || key === "arrowright") fn = () => pick("standard");
  if (key === "k") fn = kill;
  if (key === "escape") fn = () => { S.desired = null; };
  if (!fn) return;
  event.preventDefault();
  act(fn);
});
still.addEventListener("change", () => { if (still.matches) { touring = false; settleNow(); } else { touring = true; run(); } });
if (still.matches) touring = false;
advance();
draw();
`;

const css = `<style>
.pm-void{fill:var(--pm-void)}
.pm-screen{fill:var(--pm-screen)}
.pm-exit .iso-top{fill:var(--anatomy-red)}
.iso[data-theme="light"]{--pm-void:#b9b9b4;--pm-screen:#f3f3f0}
.iso[data-theme="dark"]{--pm-void:#070707;--pm-screen:#101010}
.iso-stage{cursor:pointer;outline:none}
.iso-stage:focus-visible{box-shadow:0 0 0 1px var(--anatomy-mid)}
</style>`;

const plateBody = k.plateHtml({
  fig: "Fig 1",
  title: "Pocket Mac",
  hint: "点击开关 · 1/2 预设 · K 强杀",
  readout: `未开启 · 主屏 = 内建屏 ${BUILT_IN.w}×${BUILT_IN.h} pt`,
  keys: [
    { mark: "lit", label: "虚拟屏：大字 660×1434 pt / 标准 800×1738 pt，HiDPI @2x" },
    { mark: "raised", label: "内建屏：以 14 英寸 MacBook Pro 默认 1512×982 pt 为例" },
    { mark: "raised", label: "立柱针尖：坐标原点 (0,0)，压在上面的就是主屏" },
    { mark: "raised", label: "表盘：虚拟屏存活时间，满 2.5 s 才允许释放" },
  ],
  caption:
    "台面是 macOS 的全局显示坐标。进入手机模式时，Pocket Mac 先记下各屏原点，再创建一块 iPhone 比例的虚拟屏（从井口升起），等它上线后在一次配置事务里把它移到 (0,0) 设为主屏，其余屏整体平移、保持相对布局（滑台左移）。退出时虚拟屏必须已存活 2.5 s 才释放，避免 WindowServer 卡死；释放后主屏回到内建屏，再按记录还原布局。物理屏从不被禁用；进程被 kill -9 时，系统随进程回收虚拟屏，排布自动复原，下次启动再读回记录兜底。",
  body: `<div class="iso-stage" tabindex="0" role="button" aria-label="Pocket Mac：空格或点击开关手机模式，1 和 2 切换预设，K 模拟强杀进程">${svg}</div>`,
});

writeFileSync(join(HERE, OUT), k.pageHtml({ title: "Pocket Mac", theme, body: css + plateBody, script: kitScript() + live }));
console.log("wrote", OUT);
