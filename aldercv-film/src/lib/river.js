'use strict';
// The river of résumés.
//
// ---------------------------------------------------------------- GLOBAL TIME (shared by S2, S3, S4, S6)
// All functions take T = GLOBAL seconds (info.T, i.e. frame / 30), never shot-local t, so the river
// flows continuously across cuts.
//   flowPhase(T) -> metres travelled by the flow (closed-form integral of speed):
//                   speed 1.2 m/s until T=12.0, eases (cosine) to 0.1 m/s by T=14.5, 0.1 m/s after.
//                   Pass it as `phase` to drawWater / drawPages.
//   calmAt(T)    -> 0 until 12.0; 12.0->16.0 rises 0->0.3 (river slows, a few pages sink);
//                   0.3 until 22.4; 22.4->24.0 rises 0.3->1.0 (quiet starry sea); 1 after.
//                   Pass it as `calm` to drawWater / drawPages.
//   warmthAt(T)  -> sky warmth for sky.drawSky: 1 until 12.0; 12.0->16.0 -> 0.75; 22.4->24.0 -> 0.
//   flowSpeed(T) -> m/s (derivative of flowPhase), handy for foam/wake intensity.
// Typical use:
//   const R = require('../lib/river'); const river = R.createRiver(env, {});
//   river.drawWater(ctx, { phase: R.flowPhase(T), calm: R.calmAt(T), t: T });
//   river.drawPages(ctx, { phase: R.flowPhase(T), calm: R.calmAt(T), t: T });
//   drawSky(ctx, env, { warmth: R.warmthAt(T), ... });
// ----------------------------------------------------------------
// Geometry is a real plan view projected through a pinhole camera:
//   sx = vpX + F * X / Z,   sy = horizonY + F * CAM_H / Z      (X lateral metres, Z depth metres)
// The centreline runs straight away from camera, bends left on an arc, then runs left forever,
// so far lanes become horizontal ribbons stacked toward the horizon (ref4 grammar).
// Lanes alternate between painted water ribbons and dense streams of paper pages.
// Pages move along their lane by arc length sigma; `phase` (metres) is supplied by the shot so
// any frame can be rendered independently (integrate speed analytically in the shot).

const C = require('./core');
const PAL = require('./palette');

// ---------------------------------------------------------------- global time functions
const V_FAST = 1.2, V_SLOW = 0.1, T_SLOW0 = 12.0, T_SLOW1 = 14.5;
function flowSpeed(T) {
  if (T <= T_SLOW0) return V_FAST;
  if (T >= T_SLOW1) return V_SLOW;
  const u = (T - T_SLOW0) / (T_SLOW1 - T_SLOW0);
  return V_SLOW + (V_FAST - V_SLOW) * (0.5 + 0.5 * Math.cos(Math.PI * u));
}
function flowPhase(T) {
  if (T <= T_SLOW0) return V_FAST * T;
  const D = T_SLOW1 - T_SLOW0, dv = V_FAST - V_SLOW;
  const u = Math.min(T, T_SLOW1) - T_SLOW0;
  let s = V_FAST * T_SLOW0 + V_SLOW * u + dv * (0.5 * u + (0.5 * D / Math.PI) * Math.sin((Math.PI * u) / D));
  if (T > T_SLOW1) s += V_SLOW * (T - T_SLOW1);
  return s;
}
const ramp = (T, a, b, v0, v1) => C.lerp(v0, v1, C.ease.inOutSine(C.invLerp(a, b, T)));
function calmAt(T) {
  if (T <= 12.0) return 0;
  if (T <= 16.0) return ramp(T, 12.0, 16.0, 0, 0.3);
  if (T <= 22.4) return 0.3;
  if (T <= 24.0) return ramp(T, 22.4, 24.0, 0.3, 1);
  return 1;
}
function warmthAt(T) {
  if (T <= 12.0) return 1;
  if (T <= 16.0) return ramp(T, 12.0, 16.0, 1, 0.75);
  if (T <= 22.4) return 0.75;
  if (T <= 24.0) return ramp(T, 22.4, 24.0, 0.75, 0);
  return 0;
}

const F = 1000, CAM_H = 1.6;

function createRiver(env, o = {}) {
  const key = `river:${JSON.stringify(o)}`;
  return env.once(key, () => buildRiver(env, o));
}

function buildRiver(env, o) {
  const horizonY = o.horizonY ?? 470;
  const vpX = o.vpX ?? 900;
  const X0 = o.X0 ?? 0.9;        // centreline start (lateral)
  const Z0 = o.Z0 ?? 1.6;        // start depth (below frame bottom)
  const L1 = o.L1 ?? 5.0;        // straight run
  const R = o.R ?? 12.0;          // bend radius
  const HW = o.halfWidth ?? 7.5; // half width of the river (must be < R)
  const seed = o.seed ?? 5;
  const LANES = o.lanes ?? 11;
  const arcLen = (Math.PI / 2) * R;
  const L3 = 60;
  const total = L1 + arcLen + L3;

  // centreline point + unit direction at arc length s
  function centre(s) {
    if (s <= L1) return { X: X0, Z: Z0 + s, dx: 0, dz: 1 };
    if (s <= L1 + arcLen) {
      const a = (s - L1) / R; // 0..pi/2, turning left (toward -X)
      const cx = X0 - R, cz = Z0 + L1;
      return { X: cx + R * Math.cos(a), Z: cz + R * Math.sin(a), dx: -Math.sin(a), dz: Math.cos(a) };
    }
    const u = s - L1 - arcLen;
    return { X: X0 - R - u, Z: Z0 + L1 + R, dx: -1, dz: 0 };
  }
  // point on lane offset `off` metres to the right of travel
  function lanePoint(s, off) {
    const c = centre(s);
    // right normal of (dx,dz) is (dz,-dx)
    return { X: c.X + c.dz * off, Z: c.Z - c.dx * off, dx: c.dx, dz: c.dz };
  }
  const project = (X, Z) => ({ x: vpX + (F * X) / Z, y: horizonY + (F * CAM_H) / Z, k: F / Z });

  // lane definitions: boundaries across [-HW, HW] with jitter; kind alternates paper/water
  const r = C.rng(seed);
  const bounds = [];
  for (let i = 0; i <= LANES; i++) bounds.push(-HW + (2 * HW * i) / LANES + (i > 0 && i < LANES ? (r() - 0.5) * (HW / LANES) * 0.8 : 0));
  const waterKinds = ['red', 'blue', 'dark', 'white', 'blue', 'red', 'dark'];
  const lanes = [];
  for (let i = 0; i < LANES; i++) {
    const paper = i % 2 === 1 || (i === 0 && r() < 0.3);
    lanes.push({ i, a: bounds[i], b: bounds[i + 1], paper, kind: paper ? 'paper' : waterKinds[i % waterKinds.length], wob: r() * 6.28, wf: 0.25 + r() * 0.3 });
  }
  // wobble of a lane boundary (ribbons twist slowly along the flow)
  const wobble = (lane, s, side, phase) => Math.sin(s * lane.wf + lane.wob + side * 1.7 - phase * 0.05) * 0.38 + Math.sin(s * lane.wf * 2.7 + lane.wob * 3 + side) * 0.16;

  // ---------------------------------------------------------------- sprites
  const sprites = env.once('river:sprites', () => makePageSprites(env));

  // ---------------------------------------------------------------- page field
  const pages = [];
  const pr = C.rng(seed + 100);
  for (const lane of lanes) {
    const width = lane.b - lane.a;
    const density = lane.paper ? 6.5 : 0.25; // pages per metre of lane length per metre width
    const n = Math.floor(total * Math.min(L1 + arcLen + 25, total) / total * width * density);
    for (let k = 0; k < n; k++) {
      pages.push({
        lane, off: C.lerp(lane.a, lane.b, 0.08 + pr() * 0.84),
        s0: pr() * (L1 + arcLen + 25), m: 0.85 + pr() * 0.3,
        rot: (pr() - 0.5) * 1.6, spin: (pr() - 0.5) * 0.25,
        sprite: Math.floor(pr() * 10), bob: pr() * 6.28,
        sink: pr(), // order in which pages sink when the river calms
        id: pages.length,
      });
    }
  }
  const loopLen = L1 + arcLen + 25;
  const PAGE_W = 0.36, PAGE_H = 0.5;

  // current state of a page at flow phase (metres)
  function pageState(p, phase) {
    let s = (p.s0 + phase * p.m) % loopLen; if (s < 0) s += loopLen;
    const lp = lanePoint(s, p.off + wobble(p.lane, s, 0.5, phase) * 0.5);
    return { s, X: lp.X, Z: lp.Z, dx: lp.dx, dz: lp.dz, rot: p.rot + p.spin * s };
  }

  // ---------------------------------------------------------------- drawing
  // Base water: banded reflection of the sky from the horizon down to the frame bottom.
  function drawWater(ctx, d = {}) {
    const { phase = 0, calm = 0, t = 0, x0 = -240, x1 = 2160 } = d;
    const yb = 1200;
    const base = env.once(`river:base:${horizonY}`, () => C.layer(x1 - x0, yb - horizonY, env.res * 0.75, (x) => {
      x.translate(-x0, -horizonY);
      const g = x.createLinearGradient(0, horizonY, 0, yb);
      g.addColorStop(0, PAL.ember2); g.addColorStop(0.03, PAL.ember1); g.addColorStop(0.1, '#6a3a5a');
      g.addColorStop(0.25, PAL.night2); g.addColorStop(0.6, PAL.night1); g.addColorStop(1, PAL.night0);
      x.fillStyle = g; x.fillRect(x0, horizonY, x1 - x0, yb - horizonY);
      const rr = C.rng(77);
      for (let n = 0; n < 700; n++) { // horizontal painted drags, thinner near the horizon
        const y = horizonY + Math.pow(rr(), 2.2) * (yb - horizonY);
        const k = (y - horizonY) / (yb - horizonY);
        const col = rr() < 0.3 ? PAL.ember2 : rr() < 0.5 ? PAL.blueband : rr() < 0.7 ? '#e9d6b8' : PAL.night2;
        x.strokeStyle = C.rgba(col, 0.08 + rr() * 0.2 * (1 - k));
        x.lineWidth = 1 + k * 10 * rr();
        const xx = x0 + rr() * (x1 - x0), L = 60 + rr() * 500 * (0.3 + k);
        x.beginPath(); x.moveTo(xx, y); x.lineTo(xx + L, y + (rr() - 0.5) * 3); x.stroke();
      }
      C.paint(x, rect(x0, horizonY, x1 - x0, yb - horizonY), { fill: 'rgba(0,0,0,0)', mottle: 0.3, hatch: 0.06, hatchColor: '#0c0d20', hatchAngle: -4, seed: 2 });
    }));
    const calmBase = env.once(`river:calm:${horizonY}`, () => C.layer(x1 - x0, yb - horizonY, env.res * 0.75, (x) => {
      x.translate(-x0, -horizonY);
      const g = x.createLinearGradient(0, horizonY, 0, yb);
      g.addColorStop(0, '#9a6c8c'); g.addColorStop(0.04, '#4b4a86'); g.addColorStop(0.3, PAL.night2);
      g.addColorStop(0.7, PAL.night1); g.addColorStop(1, PAL.night0);
      x.fillStyle = g; x.fillRect(x0, horizonY, x1 - x0, yb - horizonY);
      const rr = C.rng(78);
      for (let n = 0; n < 500; n++) {
        const y = horizonY + Math.pow(rr(), 2.2) * (yb - horizonY);
        const k = (y - horizonY) / (yb - horizonY);
        const col = rr() < 0.5 ? '#6f86c8' : rr() < 0.7 ? '#c9c2e0' : PAL.night2;
        x.strokeStyle = C.rgba(col, 0.06 + rr() * 0.14 * (1 - k));
        x.lineWidth = 1 + k * 8 * rr();
        const xx = x0 + rr() * (x1 - x0), L = 80 + rr() * 600 * (0.3 + k);
        x.beginPath(); x.moveTo(xx, y); x.lineTo(xx + L, y); x.stroke();
      }
      C.paint(x, rect(x0, horizonY, x1 - x0, yb - horizonY), { fill: 'rgba(0,0,0,0)', mottle: 0.3, hatch: 0.05, hatchColor: '#0c0d20', hatchAngle: -4, seed: 2 });
    }));
    if (calm < 1) C.blit(ctx, base, x0, horizonY, 1);
    if (calm > 0) C.blit(ctx, calmBase, x0, horizonY, calm);

    // lane ribbons: each filled with a distance gradient (sky reflection), painted edges
    const S_MAX = L1 + arcLen + L3;
    for (const lane of lanes) {
      const pts = [];
      const N = 90;
      const sAt = (j) => Math.pow(j / N, 1.6) * S_MAX;
      for (let j = 0; j <= N; j++) { const s = sAt(j); const p = lanePoint(s, lane.a + wobble(lane, s, 0, phase)); pts.push(project(p.X, p.Z)); }
      const edgeA = pts.slice();
      const edgeB = [];
      for (let j = N; j >= 0; j--) { const s = sAt(j); const p = lanePoint(s, lane.b + wobble(lane, s, 1, phase)); const q = project(p.X, p.Z); pts.push(q); edgeB.push(q); }
      const path = new C.Path2D();
      pts.forEach((q, i) => (i ? path.lineTo(q.x, q.y) : path.moveTo(q.x, q.y)));
      path.closePath();
      const ramp = laneRamp(lane, calm);
      const g = ctx.createLinearGradient(0, horizonY, 0, 1100);
      g.addColorStop(0, ramp[0]); g.addColorStop(0.12, ramp[0]); g.addColorStop(0.32, ramp[1]); g.addColorStop(1, ramp[2]);
      ctx.save();
      ctx.globalAlpha = lane.paper ? 0.85 - calm * 0.35 : 0.78;
      C.paint(ctx, path, { fill: g, mottle: 0.4, hatch: 0.07, hatchColor: '#0c0d20', hatchAngle: -12, hatchSpacing: 6, seed: lane.i + 2 });
      ctx.restore();
      // painted edge: a light lip on one side, a dark one on the other
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.strokeStyle = C.rgba(calm > 0.5 ? '#c9c2e0' : '#f2c79a', 0.22); ctx.lineWidth = 1.6;
      ctx.beginPath(); edgeA.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.stroke();
      ctx.strokeStyle = C.rgba('#0c0d20', 0.25); ctx.lineWidth = 2.4;
      ctx.beginPath(); edgeB.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.stroke();
      ctx.restore();
    }
    // flowing streaks along lanes (the painted ribbon strokes), batched by colour
    drawStreaks(ctx, phase, calm);
    if (calm > 0) starReflections(ctx, t, calm);
  }

  function drawStreaks(ctx, phase, calm) {
    const sr = C.rng(seed + 7);
    const groups = new Map();
    for (let n = 0; n < 520; n++) {
      const lane = lanes[Math.floor(sr() * lanes.length)];
      const off = C.lerp(lane.a, lane.b, sr());
      const s0 = sr() * (L1 + arcLen + 40), len = 0.6 + sr() * 2.5, sp = 0.8 + sr() * 0.4;
      const colWarm = sr() < 0.35 ? '#f0b48a' : sr() < 0.6 ? '#9fb8e6' : sr() < 0.8 ? '#efe6cf' : PAL.ember2;
      const colCalm = sr() < 0.5 ? '#8ea2dc' : '#d8d2ee';
      const col = calm > 0.5 ? colCalm : colWarm;
      let s = (s0 + phase * sp) % (L1 + arcLen + 40);
      const segs = [];
      for (let q = 0; q <= 6; q++) {
        const ss = s + (len * q) / 6;
        const p = lanePoint(ss, off + wobble(lane, ss, 0.5, phase));
        if (p.Z < 1.5) continue;
        segs.push(project(p.X, p.Z));
      }
      if (segs.length < 2) continue;
      const w = Math.max(0.6, segs[0].k * 0.006);
      const key = col + '|' + Math.round(w * 2);
      if (!groups.has(key)) groups.set(key, { col, w, paths: [] });
      groups.get(key).paths.push(segs);
    }
    ctx.save();
    ctx.lineCap = 'round';
    for (const g of groups.values()) {
      ctx.strokeStyle = C.rgba(g.col, 0.35);
      ctx.lineWidth = g.w;
      ctx.beginPath();
      for (const segs of g.paths) segs.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.stroke();
    }
    ctx.restore();
  }

  function starReflections(ctx, t, calm) {
    const rr = C.rng(seed + 9);
    ctx.save();
    for (let n = 0; n < 160; n++) {
      const x = -200 + rr() * 2300, k = Math.pow(rr(), 2.4);
      const y = horizonY + 4 + k * 560;
      const tw = 0.5 + 0.5 * Math.sin(t * (1 + rr() * 2) + rr() * 6);
      const a = calm * tw * (0.35 + 0.5 * rr());
      const L = 4 + k * 26;
      ctx.strokeStyle = C.rgba('#f4ecd6', a);
      ctx.lineWidth = 0.8 + k * 1.6;
      ctx.beginPath(); ctx.moveTo(x - L, y); ctx.lineTo(x + L, y); ctx.stroke();
    }
    ctx.restore();
  }

  // Pages. filter(state) can split pages around a character (e.g. Z > 5 behind her).
  // d.calm sinks pages in random order; d.only(p,state) => false to skip (e.g. a page owned by the shot).
  function drawPages(ctx, d = {}) {
    const { phase = 0, calm = 0, t = 0, zMin = 1.2, zMax = 26, only = null, lift = null } = d;
    const list = [];
    for (const p of pages) {
      const st = pageState(p, phase);
      if (st.Z < zMin || st.Z > zMax) continue;
      if (only && !only(p, st)) continue;
      const sinkK = C.clamp((calm - p.sink * 0.85) / 0.15);
      if (sinkK >= 1) continue;
      list.push([p, st, sinkK]);
    }
    list.sort((a, b) => b[1].Z - a[1].Z);
    for (const [p, st, sinkK] of list) drawPage(ctx, p, st, { t, sinkK, calm });
  }

  function pageCorners(st, scale = 1) {
    const ca = Math.cos(st.rot), sa = Math.sin(st.rot);
    // page axes in plan: along flow (dx,dz) rotated by rot
    const ux = (st.dx * ca - st.dz * sa) * PAGE_H * scale, uz = (st.dz * ca + st.dx * sa) * PAGE_H * scale;
    const vx = (st.dz * ca + st.dx * sa) * PAGE_W * scale, vz = (-st.dx * ca + st.dz * sa) * PAGE_W * scale;
    const o = { X: st.X - ux / 2 - vx / 2, Z: st.Z - uz / 2 - vz / 2 };
    const p0 = project(o.X, o.Z);
    const pV = project(o.X + vx, o.Z + vz); // along width
    const pU = project(o.X + ux, o.Z + uz); // along height
    return { p0, pV, pU };
  }

  function drawPage(ctx, p, st, o) {
    const { sinkK = 0, t = 0, calm = 0 } = o;
    const { p0, pV, pU } = pageCorners(st);
    const pxSize = Math.abs(pV.x - p0.x) + Math.abs(pU.y - p0.y);
    if (pxSize < 2.5) return;
    const bob = Math.sin(t * 2.2 + p.bob) * 0.012 * p0.k;
    const sp = sprites[p.sprite];
    const tint = st.Z > 14 ? 'red' : st.Z > 7 ? 'warm' : 'cool';
    const img = calm > 0.5 ? sp.night : sp[tint];
    const fog = C.clamp(1 - (st.Z - 4) / 26);
    ctx.save();
    ctx.globalAlpha = (0.35 + 0.65 * fog) * (1 - sinkK);
    // affine from sprite space (w x h) to the projected parallelogram
    ctx.transform((pV.x - p0.x) / sp.w, (pV.y - p0.y) / sp.w, (pU.x - p0.x) / sp.h, (pU.y - p0.y) / sp.h, p0.x, p0.y - bob);
    ctx.drawImage(img, 0, 0, sp.w, sp.h);
    ctx.restore();
  }

  return {
    horizonY, vpX, F, CAM_H, lanes, pages, total, loopLen,
    centre, lanePoint, project, pageState, pageCorners, drawWater, drawPages, drawPage, sprites,
    PAGE_W, PAGE_H,
  };
}

// [far, mid, near] colours per lane kind, warm (act 1) vs calm (starry sea)
const RAMPS = {
  warm: {
    red: ['#e0603a', '#a8301c', '#3a1a34'], blue: ['#8a92c4', '#4f78b8', '#1b2350'], white: ['#f3d6b8', '#b9b7cc', '#4a5280'],
    dark: ['#5a2a40', '#2a2048', '#10132b'], paper: ['#f2c9a0', '#cdbfa6', '#6f6f92'],
  },
  calm: {
    red: ['#8a6c9c', '#3f4a8a', '#151a3e'], blue: ['#6f86c8', '#33488a', '#141a40'], white: ['#c9c2e0', '#7f88bb', '#2a3466'],
    dark: ['#3a3466', '#1f2550', '#0e1130'], paper: ['#b9b3d6', '#6f78ac', '#252d5c'],
  },
};
function laneRamp(lane, calm) {
  const a = RAMPS.warm[lane.kind], b = RAMPS.calm[lane.kind];
  return a.map((c, i) => C.mix(c, b[i], calm));
}

function rect(x, y, w, h) { const p = new C.Path2D(); p.rect(x, y, w, h); return p; }

// ---------------------------------------------------------------- page sprites
// 10 résumé pages: cream paper, gouache mottle, hatching, faint text lines, some REJECTED stamps,
// folds and torn edges. Each in 4 lighting tints (cool near, warm mid, red far, night).
function makePageSprites(env) {
  const out = [];
  const w = Math.round(150 * Math.max(1, env.res)), h = Math.round(w * 1.39);
  for (let i = 0; i < 10; i++) {
    const base = C.canvas(w, h), x = base.getContext('2d');
    drawResumePage(x, w, h, i);
    const tinted = (col, a) => {
      const c = C.canvas(w, h), y = c.getContext('2d');
      y.drawImage(base, 0, 0);
      y.globalCompositeOperation = 'source-atop';
      y.globalAlpha = a; y.fillStyle = col; y.fillRect(0, 0, w, h);
      y.globalCompositeOperation = 'multiply'; y.globalAlpha = 1;
      return c;
    };
    out.push({ w, h, base, cool: tinted('#7d86b4', 0.32), warm: tinted('#e08a5a', 0.28), red: tinted(PAL.ember1, 0.45), night: tinted(PAL.night2, 0.55) });
  }
  return out;
}

// Draw one résumé page into (0,0,w,h). Exported for shots that need a hero page.
function drawResumePage(x, w, h, variant = 0, o = {}) {
  const r = C.rng(1000 + variant * 13);
  const torn = o.torn ?? (variant % 4 === 3);
  const stamped = o.stamp ?? (variant % 3 === 0);
  const s = w / 150;
  // outline (slightly irregular, torn on one side)
  const p = new C.Path2D();
  const jag = (n) => (torn ? (r() - 0.5) * 7 * s : (r() - 0.5) * 1.2 * s);
  p.moveTo(2 * s, 2 * s);
  for (let i = 1; i <= 8; i++) p.lineTo((w - 2 * s) * (i / 8), 2 * s + (r() - 0.5) * 1.2 * s);
  for (let i = 1; i <= 10; i++) p.lineTo(w - 2 * s + jag(i), (h - 2 * s) * (i / 10));
  for (let i = 7; i >= 0; i--) p.lineTo((w - 2 * s) * (i / 8), h - 2 * s + (r() - 0.5) * 1.2 * s);
  p.closePath();
  C.paint(x, p, { fill: C.mix(PAL.paper, PAL.paperWarm, r() * 0.6), mottle: 0.5, hatch: 0.07, hatchColor: PAL.paperShade, hatchAngle: 30 + r() * 20, hatchSpacing: 5, seed: variant + 1 });
  x.save();
  x.clip(p);
  // header: name block
  const ink = C.rgba(PAL.ink, 0.62);
  x.fillStyle = ink;
  const m = 14 * s;
  roundBar(x, m, 14 * s, w * (0.42 + r() * 0.2), 7 * s);
  x.fillStyle = C.rgba(PAL.ink, 0.35);
  roundBar(x, m, 26 * s, w * 0.5, 3 * s);
  // rule
  x.fillRect(m, 34 * s, w - 2 * m, 0.8 * s);
  // text lines in blocks
  let y = 42 * s;
  while (y < h - 18 * s) {
    if (r() < 0.25) { x.fillStyle = C.rgba(PAL.ink, 0.55); roundBar(x, m, y, w * 0.3, 4 * s); y += 8 * s; }
    const n = 2 + Math.floor(r() * 4);
    x.fillStyle = C.rgba(PAL.ink, 0.28);
    for (let k = 0; k < n && y < h - 14 * s; k++) {
      // a line made of words
      let xx = m + (r() < 0.3 ? 6 * s : 0);
      const end = w - m - r() * 30 * s;
      while (xx < end) { const ww = (6 + r() * 18) * s; roundBar(x, xx, y, Math.min(ww, end - xx), 2.4 * s); xx += ww + 3 * s; }
      y += 6.5 * s;
    }
    y += 6 * s;
  }
  // crease / fold shadow
  if (r() < 0.6) {
    const fx = w * (0.2 + r() * 0.6);
    const g = x.createLinearGradient(fx - 12 * s, 0, fx + 12 * s, 0);
    g.addColorStop(0, 'rgba(120,90,60,0)'); g.addColorStop(0.5, 'rgba(120,90,60,0.22)'); g.addColorStop(1, 'rgba(255,250,235,0.0)');
    x.fillStyle = g; x.save(); x.translate(fx, h / 2); x.rotate((r() - 0.5) * 0.5); x.translate(-fx, -h / 2); x.fillRect(fx - 12 * s, -20, 24 * s, h + 40); x.restore();
  }
  // wet edge darkening
  x.strokeStyle = 'rgba(110,85,60,0.35)'; x.lineWidth = 6 * s; x.filter = `blur(${3 * s}px)`; x.stroke(p); x.filter = 'none';
  // rejection stamp
  if (stamped) {
    x.save();
    x.translate(w * (0.45 + r() * 0.15), h * (0.45 + r() * 0.25));
    x.rotate(-0.25 + (r() - 0.5) * 0.2);
    x.strokeStyle = C.rgba(PAL.stampRed, 0.8); x.lineWidth = 3 * s;
    const sw = 96 * s, sh = 30 * s;
    x.beginPath(); x.roundRect(-sw / 2, -sh / 2, sw, sh, 4 * s); x.stroke();
    C.text(x, 'REJECTED', 0, 8.5 * s, { font: C.FONT.sansBold(Math.round(21 * s)), color: C.rgba(PAL.stampRed, 0.85), align: 'center' });
    // distress the stamp: knock out specks
    x.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < 90; k++) { x.fillStyle = `rgba(0,0,0,${0.3 + r() * 0.6})`; x.fillRect((r() - 0.5) * sw, (r() - 0.5) * sh, 1.5 * s, 1.5 * s); }
    x.restore();
  }
  x.restore();
  C.ink(x, p, { color: '#6a5a48', width: 0.9 * s, alpha: 0.6 });
}
function roundBar(x, x0, y0, w, h) { if (w <= 0) return; x.beginPath(); x.roundRect(x0, y0, w, h, h / 2); x.fill(); }

module.exports = { createRiver, drawResumePage, F, CAM_H, flowPhase, flowSpeed, calmAt, warmthAt };
