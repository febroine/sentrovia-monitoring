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
//   sx = vpX + F * (X - camX) / Z,   sy = horizonY + F * camH / Z   (X lateral metres, Z depth metres)
// The centreline runs straight away from camera, bends left on an arc, then runs left forever,
// so far lanes become horizontal ribbons stacked toward the horizon (ref4 grammar).
// Under the lanes the whole water plane is painted as horizontal strata (far "sea").
// Lanes are organic ribbons: their shared boundaries wander along the flow and the wander pattern
// is advected with the flow, so ribbon widths swell and pinch and visibly travel downstream.
// Paper lanes carry dense streams of overlapping résumé pages.
// `camX` (metres, default 0) on drawWater / drawPages / drawPage / project gives true lateral
// parallax for camera drifts (near water moves more than far water).
//
// Options for createRiver(env, o): horizonY 470, vpX 900, X0 0.9, Z0 1.6, L1 5, R 12, halfWidth 7.5,
//   lanes 11, seed 5, camH 1.6 (camera height above the water), density 6 (pages per m² of paper lane).

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

// ---------------------------------------------------------------- colours (all derived from the palette)
const M = C.mix;
// [far, mid, near] per lane kind; warm = act 1 (red horizon), calm = starry sea
const RAMPS = {
  warm: {
    red: [M(PAL.ember2, PAL.glow, 0.25), PAL.ember1, M(PAL.ember0, PAL.night0, 0.35)],
    blue: [M(PAL.blueband, PAL.paper, 0.35), PAL.blueband, M(PAL.night2, PAL.blueband, 0.3)],
    cream: [M(PAL.paper, PAL.glow, 0.25), M(PAL.paper, PAL.blueband, 0.3), M(PAL.paperShade, PAL.night2, 0.62)],
    dark: [M(PAL.ember0, PAL.night1, 0.5), M(PAL.night0, PAL.night1, 0.4), PAL.night0],
    paper: [M(PAL.paperWarm, PAL.glow, 0.35), M(PAL.paperShade, PAL.night2, 0.45), M(PAL.night1, PAL.night2, 0.5)],
  },
  calm: {
    red: [M(PAL.night2, PAL.bloom, 0.25), M(PAL.night1, PAL.night2, 0.6), PAL.night0],
    blue: [M(PAL.blueband, PAL.night2, 0.3), PAL.night2, M(PAL.night0, PAL.night1, 0.6)],
    cream: [M(PAL.paper, PAL.blueband, 0.55), M(PAL.blueband, PAL.night2, 0.5), M(PAL.night1, PAL.night2, 0.5)],
    dark: [M(PAL.night1, PAL.night0, 0.3), PAL.night0, M(PAL.night0, PAL.treeline, 0.5)],
    paper: [M(PAL.paper, PAL.blueband, 0.6), M(PAL.night2, PAL.blueband, 0.3), M(PAL.night1, PAL.night0, 0.4)],
  },
};
function laneRamp(lane, calm) {
  const a = RAMPS.warm[lane.kind], b = RAMPS.calm[lane.kind];
  return a.map((c, i) => C.mix(c, b[i], calm));
}
// brush colours used for streaks inside each kind (warm, calm)
const STREAK = {
  red: [[M(PAL.ember2, PAL.glow, 0.4), PAL.ember0, M(PAL.ember1, PAL.paper, 0.3)], [M(PAL.night2, PAL.bloom, 0.3), PAL.night1]],
  blue: [[M(PAL.blueband, PAL.paper, 0.5), PAL.night2, M(PAL.blueband, PAL.night0, 0.3)], [M(PAL.blueband, PAL.paper, 0.3), PAL.night1]],
  cream: [[PAL.paper, M(PAL.paperShade, PAL.blueband, 0.4), M(PAL.paper, PAL.glow, 0.4)], [M(PAL.paper, PAL.blueband, 0.5), PAL.night2]],
  dark: [[M(PAL.night2, PAL.ember1, 0.3), PAL.night0, M(PAL.ember1, PAL.night0, 0.4)], [PAL.night2, PAL.night0]],
  paper: [[PAL.paper, PAL.paperShade, M(PAL.ink, PAL.paperShade, 0.3)], [M(PAL.paper, PAL.blueband, 0.5), PAL.night2]],
};
// strata kinds (far sea) warm/calm
const STRATA = {
  red: [PAL.ember1, M(PAL.night1, PAL.night2, 0.5)],
  ember: [M(PAL.ember2, PAL.glow, 0.3), M(PAL.night2, PAL.bloom, 0.25)],
  cream: [M(PAL.paper, PAL.paperShade, 0.25), M(PAL.blueband, PAL.paper, 0.35)],
  grey: [M(PAL.paperShade, PAL.night2, 0.45), M(PAL.night2, PAL.blueband, 0.4)],
  blue: [PAL.blueband, PAL.night2],
  dark: [M(PAL.night0, PAL.ember0, 0.3), PAL.night0],
};
const INK_DAB = M(PAL.treeline, PAL.night0, 0.5);

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
  const camH = o.camH ?? CAM_H;
  const density = o.density ?? 9;
  const arcLen = (Math.PI / 2) * R;
  const L3 = 60;
  const total = L1 + arcLen + L3;
  const S_MAX = total;

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
  const project = (X, Z, camX = 0) => ({ x: vpX + (F * (X - camX)) / Z, y: horizonY + (F * camH) / Z, k: F / Z });

  // ---------------------------------------------------------------- lanes (organic ribbons)
  const r = C.rng(seed);
  const KINDS = ['red', 'paper', 'blue', 'paper', 'cream', 'paper', 'red', 'paper', 'dark', 'blue', 'paper', 'cream'];
  const kinds = [];
  for (let i = 0; i < LANES; i++) kinds.push(KINDS[i % KINDS.length]);
  const weights = kinds.map((k) => (k === 'paper' ? 1.25 : 0.85));
  const wsum = weights.reduce((a, b) => a + b, 0);
  const bnd = []; // boundaries: base offset, wander amplitude/frequencies
  let acc = -HW;
  for (let i = 0; i <= LANES; i++) {
    const interior = i > 0 && i < LANES;
    const spacing = (2 * HW * (weights[Math.min(i, LANES - 1)] + weights[Math.max(i - 1, 0)])) / (2 * wsum);
    bnd.push({
      base: acc + (interior ? (r() - 0.5) * 0.25 * spacing : 0),
      amp: interior ? spacing * (0.28 + 0.16 * r()) : spacing * 0.12,
      f1: 0.16 + r() * 0.2, f2: 0.45 + r() * 0.5, p1: r() * 6.28, p2: r() * 6.28, hf: interior ? 0.05 + r() * 0.08 : 0,
    });
    if (i < LANES) acc += (2 * HW * weights[i]) / wsum;
  }
  const lanes = [];
  for (let i = 0; i < LANES; i++) {
    lanes.push({ i, a: bnd[i].base, b: bnd[i + 1].base, paper: kinds[i] === 'paper', kind: kinds[i], wob: r() * 6.28, wf: 0.25 + r() * 0.3 });
  }
  const MIN_GAP = 0.1;
  const ADV = 1.0; // ribbon pattern travels with the flow
  // all boundary offsets at arc length s (array of LANES+1), never crossing
  function edgesAt(s, phase, out) {
    out = out || new Array(LANES + 1);
    const u = s - phase * ADV;
    let prev = -1e9;
    for (let i = 0; i <= LANES; i++) {
      const b = bnd[i];
      let e = b.base + b.amp * (0.62 * Math.sin(u * b.f1 + b.p1) + 0.38 * Math.sin(u * b.f2 + b.p2))
        + b.hf * Math.sin(u * 2.3 + b.p2 * 3) * Math.sin(u * 0.9 + b.p1);
      if (e < prev + MIN_GAP) e = prev + MIN_GAP;
      out[i] = e; prev = e;
    }
    return out;
  }
  const laneEdges = (lane, s, phase) => { const e = edgesAt(s, phase); return [e[lane.i], e[lane.i + 1]]; };

  // ---------------------------------------------------------------- sprites
  const sprites = env.once('river:sprites', () => makePageSprites(env));

  // ---------------------------------------------------------------- page field
  const pages = [];
  const loopLen = L1 + arcLen + 25;
  const pr = C.rng(seed + 100);
  for (const lane of lanes) {
    const width = lane.b - lane.a;
    const dens = lane.paper ? density : 0.22;
    const n = Math.floor(loopLen * width * dens);
    for (let k = 0; k < n; k++) {
      const frac = 0.06 + pr() * 0.88;
      pages.push({
        lane, frac, off: C.lerp(lane.a, lane.b, frac),
        s0: pr() * loopLen, m: 0.88 + pr() * 0.24,
        rot: (pr() - 0.5) * 1.6, spin: (pr() - 0.5) * 0.25,
        sprite: Math.floor(pr() * 10), bob: pr() * 6.28,
        sink: pr(), // order in which pages sink when the river calms
        id: pages.length,
      });
    }
  }
  const PAGE_W = 0.36, PAGE_H = 0.5;

  // current state of a page at flow phase (metres)
  const _e = new Array(LANES + 1);
  function pageState(p, phase) {
    let s = (p.s0 + phase * p.m) % loopLen; if (s < 0) s += loopLen;
    const e = edgesAt(s, phase, _e);
    const off = C.lerp(e[p.lane.i], e[p.lane.i + 1], p.frac);
    const lp = lanePoint(s, off);
    return { s, X: lp.X, Z: lp.Z, dx: lp.dx, dz: lp.dz, rot: p.rot + p.spin * s };
  }

  // ---------------------------------------------------------------- strata (whole water plane)
  const strata = [];
  {
    const sr = C.rng(seed + 31);
    const kindsS = ['red', 'cream', 'blue', 'grey', 'ember', 'dark', 'red', 'cream', 'blue', 'dark', 'red'];
    let Z = 3.2;
    while (Z < 900) {
      const far = C.clamp(Math.log(Z / 3.2) / Math.log(280));
      let kind = sr.pick(kindsS);
      if (far > 0.75 && sr() < 0.5) kind = sr.pick(['cream', 'ember', 'grey']);
      strata.push({ Z, kind, amp: 0.04 + sr() * 0.1, f: 0.003 + sr() * 0.009, ph: sr() * 6.28, f2: 0.011 + sr() * 0.02, ph2: sr() * 6.28 });
      Z *= 1.07 + sr() * 0.1;
    }
    strata.push({ Z: 4000, kind: 'ember', amp: 0, f: 0.01, ph: 0, f2: 0.01, ph2: 0 });
  }

  // ---------------------------------------------------------------- particles (streaks + ink dabs)
  // Lane particles live in (lane, frac, s); strata particles in (X, Z). Fixed at build time.
  const laneStreaks = [];
  {
    const sr = C.rng(seed + 7);
    for (let n = 0; n < 1500; n++) {
      const lane = lanes[Math.floor(sr() * lanes.length)];
      const nearEdge = sr() < 0.35;
      const frac = nearEdge ? (sr() < 0.5 ? 0.02 + sr() * 0.12 : 0.86 + sr() * 0.12) : sr();
      laneStreaks.push({
        lane, frac, s0: sr() * S_MAX, len: 0.5 + sr() * sr() * 4.5, sp: 0.9 + sr() * 0.2,
        w: (lane.paper ? 0.012 : 0.018) + sr() * sr() * 0.07, ci: Math.floor(sr() * 3), a: 0.22 + sr() * 0.4, bend: (sr() - 0.5) * 0.12,
      });
    }
  }
  const laneDabs = [];
  {
    const sr = C.rng(seed + 8);
    for (let n = 0; n < 1300; n++) {
      const lane = lanes[Math.floor(sr() * lanes.length)];
      if (lane.paper && sr() < 0.8) continue;
      const frac = sr() < 0.75 ? (sr() < 0.5 ? sr() * 0.1 : 1 - sr() * 0.1) : sr();
      laneDabs.push({ lane, frac, s0: sr() * S_MAX, sp: 0.95 + sr() * 0.1, len: 0.06 + sr() * sr() * 0.5, wid: 0.025 + sr() * 0.05 });
    }
  }
  const seaParts = [];
  {
    const sr = C.rng(seed + 9);
    for (let n = 0; n < 700; n++) {
      const Z = 4 * Math.pow(220, Math.pow(sr(), 0.8));
      const dab = sr() < 0.4;
      seaParts.push({ Z, u0: sr(), dab, len: (0.6 + sr() * 4) * Math.sqrt(Z / 4), w: 0.05 + sr() * 0.14, ci: Math.floor(sr() * 4), a: 0.2 + sr() * 0.4, sp: 0.7 + sr() * 0.5 });
    }
  }

  // ---------------------------------------------------------------- drawing
  // Base water: banded reflection of the sky from the horizon down (under-layer for gaps).
  function baseLayer(calmV, x0, x1, yb) {
    return env.once(`river:base:${horizonY}:${calmV}:${x0}:${x1}`, () => C.layer(x1 - x0, yb - horizonY, env.res * 0.6, (x) => {
      x.translate(-x0, -horizonY);
      const g = x.createLinearGradient(0, horizonY, 0, yb);
      if (!calmV) {
        g.addColorStop(0, PAL.ember2); g.addColorStop(0.03, PAL.ember1); g.addColorStop(0.1, M(PAL.ember0, PAL.night2, 0.5));
        g.addColorStop(0.3, PAL.night2); g.addColorStop(0.65, PAL.night1); g.addColorStop(1, PAL.night0);
      } else {
        g.addColorStop(0, M(PAL.night2, PAL.bloom, 0.35)); g.addColorStop(0.04, M(PAL.night2, PAL.blueband, 0.4)); g.addColorStop(0.3, PAL.night2);
        g.addColorStop(0.7, PAL.night1); g.addColorStop(1, PAL.night0);
      }
      x.fillStyle = g; x.fillRect(x0, horizonY, x1 - x0, yb - horizonY);
    }));
  }
  // Static gouache texture for the whole water plane: grey around 50 % for 'soft-light'.
  // Mottle + horizontal dry-brush drags (thin near the horizon, broad near camera) + pencil hatch.
  function textureLayer(x0, x1, yb) {
    return env.once(`river:tex:${horizonY}:${x0}:${x1}:${camH}`, () => C.layer(x1 - x0, yb - horizonY, env.res * 0.75, (x) => {
      x.translate(-x0, -horizonY);
      x.fillStyle = '#808080'; x.fillRect(x0, horizonY, x1 - x0, yb - horizonY);
      const pat = x.createPattern(C.mottleTile(512, 4), 'repeat');
      x.globalAlpha = 0.8; x.fillStyle = pat; x.fillRect(x0, horizonY, x1 - x0, yb - horizonY);
      x.globalAlpha = 1;
      const rr = C.rng(seed + 77);
      x.lineCap = 'round';
      for (let n = 0; n < 2600; n++) {
        const k = Math.pow(rr(), 1.7);
        const y = horizonY + 1 + k * (yb - horizonY);
        const Z = (F * camH) / Math.max(1, y - horizonY);
        const sc = F / Z; // px per metre at this depth
        const v = rr() < 0.5 ? 255 : 0;
        x.strokeStyle = `rgba(${v},${v},${v},${0.05 + rr() * 0.13})`;
        x.lineWidth = Math.max(0.7, sc * (0.01 + rr() * 0.05));
        const xx = x0 + rr() * (x1 - x0), L = sc * (0.6 + rr() * 3.5);
        x.beginPath(); x.moveTo(xx, y); x.quadraticCurveTo(xx + L * 0.5, y + (rr() - 0.5) * sc * 0.03, xx + L, y + (rr() - 0.5) * sc * 0.02); x.stroke();
      }
      const hp = x.createPattern(C.hatchTile('#202020', -10, 6, 384, 12), 'repeat');
      x.globalAlpha = 0.3; x.fillStyle = hp; x.fillRect(x0, horizonY, x1 - x0, yb - horizonY);
      x.globalAlpha = 1;
    }));
  }

  // band boundary y at screen x (z = band depth), advected leftward with the flow
  function strataY(b, sx, phase, camX) {
    const o = ((phase + camX) * F) / b.Z;
    const z = b.Z * (1 + b.amp * (0.7 * Math.sin(b.f * (sx + o) + b.ph) + 0.3 * Math.sin(b.f2 * (sx + o * 1.02) + b.ph2)));
    return horizonY + (F * camH) / z;
  }

  function drawStrata(ctx, phase, calm, camX, x0, x1, yMax) {
    const xs = [];
    for (let x = x0; x <= x1 + 1; x += 32) xs.push(x);
    const fogTint = calm > 0.5 ? M(PAL.night2, PAL.bloom, 0.3) : M(PAL.ember2, PAL.glow, 0.3);
    let bottom = null;
    for (let j = 0; j < strata.length - 1; j++) {
      const b0 = strata[j], b1 = strata[j + 1];
      const y0n = horizonY + (F * camH) / b0.Z;
      if (y0n - horizonY < 0.6) break;
      const near = bottom || xs.map((x) => strataY(b0, x, phase, camX));
      const far = xs.map((x) => strataY(b1, x, phase, camX));
      bottom = far;
      if (Math.min(...far) > yMax) continue;
      const pal = STRATA[b0.kind];
      const fog = C.clamp(Math.log(b0.Z / 8) / Math.log(140)) * 0.35;
      const col = C.mix(C.mix(pal[0], pal[1], calm), fogTint, fog * (1 - calm * 0.5));
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(xs[0], near[0]);
      for (let i = 1; i < xs.length; i++) ctx.lineTo(xs[i], near[i]);
      for (let i = xs.length - 1; i >= 0; i--) ctx.lineTo(xs[i], far[i] - 0.6);
      ctx.closePath();
      ctx.fill();
    }
    // flowing sea streaks + ink dabs (leftward drift)
    const span = x1 - x0;
    const gL = new Map();
    const dab = new C.Path2D();
    for (const q of seaParts) {
      const k = F / q.Z;
      const y = horizonY + (F * camH) / q.Z;
      if (y > yMax + 20) continue;
      let sx = x0 + (((q.u0 * span - (phase * q.sp + camX) * k) % span) + span) % span;
      if (q.dab) {
        const rx = Math.max(0.6, q.w * k * 1.4), ry = Math.max(0.35, rx * (camH / q.Z) * 1.6);
        dab.moveTo(sx + rx, y); dab.ellipse(sx, y, rx, ry, 0, 0, Math.PI * 2);
        continue;
      }
      const L = q.len * k * 0.25;
      const w = Math.max(0.6, q.w * k * (camH / q.Z) * 2.2);
      const cols = calm > 0.5 ? [M(PAL.blueband, PAL.paper, 0.4), PAL.night2, M(PAL.paper, PAL.blueband, 0.5), PAL.night1]
        : [M(PAL.paper, PAL.glow, 0.3), PAL.ember1, M(PAL.blueband, PAL.paper, 0.3), PAL.night1];
      const key = q.ci + '|' + Math.round(w * 2);
      if (!gL.has(key)) gL.set(key, { col: cols[q.ci], w, list: [] });
      gL.get(key).list.push([sx, y, L]);
    }
    ctx.save();
    ctx.lineCap = 'round';
    for (const g of gL.values()) {
      ctx.strokeStyle = C.rgba(g.col, 0.4); ctx.lineWidth = g.w;
      ctx.beginPath();
      for (const [sx, y, L] of g.list) { ctx.moveTo(sx, y); ctx.lineTo(sx + L, y + 0.3); }
      ctx.stroke();
    }
    ctx.fillStyle = C.rgba(INK_DAB, 0.55 * (1 - calm * 0.6));
    ctx.fill(dab);
    ctx.restore();
  }

  // Lane ribbons, their soft painted edges, flowing brush streaks and ink dabs.
  function drawLanes(ctx, phase, calm, camX, x0, x1) {
    const N = 190;
    const sAt = (j) => Math.pow(j / N, 1.9) * S_MAX;
    const edges = [];   // edges[j] = boundary offsets at sample j
    const ss = [];
    for (let j = 0; j <= N; j++) { const s = sAt(j); ss.push(s); edges.push(edgesAt(s, phase)); }
    // projected boundary polylines
    const poly = [];
    for (let i = 0; i <= LANES; i++) {
      const pts = [];
      for (let j = 0; j <= N; j++) { const p = lanePoint(ss[j], edges[j][i]); pts.push(project(p.X, p.Z, camX)); }
      poly.push(pts);
    }
    const yNear = Math.min(1250, horizonY + (F * camH) / Z0);
    for (const lane of lanes) {
      const A = poly[lane.i], B = poly[lane.i + 1];
      const path = new C.Path2D();
      A.forEach((q, i) => (i ? path.lineTo(q.x, q.y) : path.moveTo(q.x, q.y)));
      for (let j = B.length - 1; j >= 0; j--) path.lineTo(B[j].x, B[j].y);
      path.closePath();
      const rp = laneRamp(lane, calm);
      const g = ctx.createLinearGradient(0, horizonY, 0, yNear);
      g.addColorStop(0, rp[0]); g.addColorStop(0.1, rp[0]); g.addColorStop(0.3, rp[1]); g.addColorStop(1, rp[2]);
      ctx.fillStyle = g;
      ctx.globalAlpha = lane.paper ? 1 - calm * 0.25 : 1;
      ctx.fill(path);
    }
    ctx.globalAlpha = 1;
    // soft painted edges: a broad dark wash + a thin light lip, widths in perspective (bucketed)
    const buckets = new Map();
    const add = (key, col, a, w, seg) => { const kk = key + '|' + Math.round(w * 2); if (!buckets.has(kk)) buckets.set(kk, { col, a, w, segs: [] }); buckets.get(kk).segs.push(seg); };
    const lipCol = calm > 0.5 ? M(PAL.paper, PAL.blueband, 0.5) : M(PAL.paper, PAL.glow, 0.35);
    for (let i = 1; i < LANES; i++) {
      const pts = poly[i];
      for (let j0 = 0; j0 < N; j0 += 8) {
        const seg = pts.slice(j0, Math.min(N, j0 + 8) + 1);
        const k = seg[Math.floor(seg.length / 2)].k;
        if (seg.every((q) => q.x < x0 || q.x > x1)) continue;
        add('d', INK_DAB, 0.16, Math.max(1, 0.05 * k), seg);
        add('l', lipCol, 0.3, Math.max(0.6, 0.025 * k * (camH / CAM_H)), seg.map((q) => ({ x: q.x, y: q.y - Math.max(0.5, 0.02 * k * (camH / CAM_H)) })));
      }
    }
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const b of buckets.values()) {
      ctx.strokeStyle = C.rgba(b.col, b.a); ctx.lineWidth = b.w;
      ctx.beginPath();
      for (const seg of b.segs) seg.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.stroke();
    }
    ctx.restore();
    // flowing streaks (broad brushed strokes along the ribbons)
    const groups = new Map();
    const e = new Array(LANES + 1);
    const fore = (k) => (camH / CAM_H) * Math.min(1, 0.35 + k / 300); // flatten far strokes
    for (const st of laneStreaks) {
      let s = (st.s0 + phase * st.sp) % S_MAX;
      const segs = [];
      const nseg = 5;
      for (let q = 0; q <= nseg; q++) {
        const sq = s + (st.len * q) / nseg;
        edgesAt(sq, phase, e);
        const off = C.lerp(e[st.lane.i], e[st.lane.i + 1], st.frac) + st.bend * Math.sin((q / nseg) * Math.PI);
        const p = lanePoint(sq, off);
        if (p.Z < Z0 * 0.9) continue;
        segs.push(project(p.X, p.Z, camX));
      }
      if (segs.length < 2) continue;
      if (segs.every((q) => q.x < x0 - 50 || q.x > x1 + 50)) continue;
      const k = segs[0].k;
      const w = Math.max(0.6, st.w * k * fore(k));
      const set = STREAK[st.lane.kind];
      const col = calm > 0.5 ? set[1][st.ci % 2] : set[0][st.ci];
      const key = col + '|' + Math.round(w * 1.5) + '|' + Math.round(st.a * 4);
      if (!groups.has(key)) groups.set(key, { col, w, a: st.a, paths: [] });
      groups.get(key).paths.push(segs);
    }
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const g of groups.values()) {
      ctx.strokeStyle = C.rgba(g.col, g.a * (1 - calm * 0.4));
      ctx.lineWidth = g.w;
      ctx.beginPath();
      for (const segs of g.paths) segs.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.stroke();
    }
    // ink dabs along ribbon edges (ref4 grammar: black blotches riding the bands)
    const dab = new C.Path2D();
    for (const d of laneDabs) {
      const s = (d.s0 + phase * d.sp) % S_MAX;
      edgesAt(s, phase, e);
      const off = C.lerp(e[d.lane.i], e[d.lane.i + 1], d.frac);
      const p = lanePoint(s, off);
      if (p.Z < Z0 * 1.2) continue;
      const q = project(p.X, p.Z, camX);
      if (q.x < x0 || q.x > x1) continue;
      // screen vectors along the flow and across it
      const qa = project(p.X + p.dx * d.len, p.Z + p.dz * d.len, camX);
      const qb = project(p.X + p.dz * d.wid, p.Z - p.dx * d.wid, camX);
      const ax = qa.x - q.x, ay = qa.y - q.y, bx = qb.x - q.x, by = qb.y - q.y;
      const la = Math.hypot(ax, ay), lb = Math.max(0.5, Math.hypot(bx, by), Math.abs(ay) * 0.25);
      if (la < 0.6) continue;
      const ra = Math.max(0.7, Math.min(la, 26)), an = Math.atan2(ay, ax);
      dab.moveTo(q.x + Math.cos(an) * ra, q.y + Math.sin(an) * ra);
      dab.ellipse(q.x, q.y, ra, Math.max(0.45, Math.min(lb, ra * 0.5, 7)), an, 0, Math.PI * 2);
    }
    ctx.fillStyle = C.rgba(INK_DAB, 0.6 * (1 - calm * 0.6));
    ctx.fill(dab);
    ctx.restore();
  }

  function drawWater(ctx, d = {}) {
    const { phase = 0, calm = 0, t = 0, x0 = -240, x1 = 2160, camX = 0, texture = 1 } = d;
    const yb = 1250;
    if (calm < 1) C.blit(ctx, baseLayer(false, x0, x1, yb), x0, horizonY, 1);
    if (calm > 0) C.blit(ctx, baseLayer(true, x0, x1, yb), x0, horizonY, calm);
    drawStrata(ctx, phase, calm, camX, x0, x1, yb);
    drawLanes(ctx, phase, calm, camX, x0, x1);
    if (texture > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'soft-light';
      C.blit(ctx, textureLayer(x0, x1, yb), x0, horizonY, texture);
      ctx.restore();
    }
    // horizon shimmer: a thin hot line where the water meets the treeline
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const hg = ctx.createLinearGradient(0, horizonY - 1, 0, horizonY + 10);
    const hc = calm > 0.5 ? M(PAL.blueband, PAL.bloom, 0.3) : PAL.glow;
    hg.addColorStop(0, C.rgba(hc, 0.55 * (1 - calm * 0.6))); hg.addColorStop(1, C.rgba(hc, 0));
    ctx.fillStyle = hg; ctx.fillRect(x0, horizonY - 1, x1 - x0, 11);
    ctx.restore();
    if (calm > 0) starReflections(ctx, t, calm, x0, x1);
  }

  function starReflections(ctx, t, calm, x0, x1) {
    const rr = C.rng(seed + 9);
    ctx.save();
    ctx.lineCap = 'round';
    for (let n = 0; n < 180; n++) {
      const x = x0 + rr() * (x1 - x0), k = Math.pow(rr(), 2.4);
      const y = horizonY + 3 + k * 560;
      const tw = 0.5 + 0.5 * Math.sin(t * (1 + rr() * 2) + rr() * 6);
      const a = calm * tw * (0.35 + 0.5 * rr());
      const L = 4 + k * 26;
      ctx.strokeStyle = C.rgba(PAL.paper, a);
      ctx.lineWidth = 0.8 + k * 1.6;
      ctx.beginPath(); ctx.moveTo(x - L, y); ctx.lineTo(x + L, y); ctx.stroke();
    }
    ctx.restore();
  }

  // Pages. d.only(p,state) => false to skip (e.g. a page owned by the shot).
  // d.warp(p,state) => state' (or null to skip): deflect pages around a character, etc.
  // d.calm sinks pages in random order. zMin/zMax split pages for depth sorting around characters.
  function drawPages(ctx, d = {}) {
    const { phase = 0, calm = 0, t = 0, zMin = 1.2, zMax = 40, only = null, warp = null, camX = 0, x0 = -260, x1 = 2180 } = d;
    const list = [];
    for (const p of pages) {
      let st = pageState(p, phase);
      if (warp) { st = warp(p, st); if (!st) continue; }
      if (st.Z < zMin || st.Z > zMax) continue;
      const sx = vpX + (F * (st.X - camX)) / st.Z;
      const margin = (F / st.Z) * 0.6;
      if (sx < x0 - margin || sx > x1 + margin) continue;
      if (only && !only(p, st)) continue;
      const sinkK = C.clamp((calm - p.sink * 0.85) / 0.15);
      if (sinkK >= 1) continue;
      list.push([p, st, sinkK]);
    }
    list.sort((a, b) => b[1].Z - a[1].Z);
    // far pages: tiny, batched as flat painted quads (fast); near pages: textured sprites
    let batch = null, batchCol = null;
    const flush = () => { if (batch) { ctx.fillStyle = batchCol; ctx.fill(batch); batch = null; } };
    for (const [p, st, sinkK] of list) {
      const { p0, pV, pU } = pageCorners(st, 1, camX);
      const pxSize = Math.abs(pV.x - p0.x) + Math.abs(pU.y - p0.y) + Math.abs(pU.x - p0.x);
      if (pxSize < 2) continue;
      if (pxSize < 13 && sinkK === 0) {
        const fog = C.clamp(1 - (st.Z - 4) / 30);
        const col = C.rgba(pageFlat(st.Z, calm, p.id), 0.5 + 0.45 * fog);
        if (col !== batchCol) { flush(); batchCol = col; }
        if (!batch) batch = new C.Path2D();
        batch.moveTo(p0.x, p0.y); batch.lineTo(pV.x, pV.y); batch.lineTo(pV.x + pU.x - p0.x, pV.y + pU.y - p0.y); batch.lineTo(pU.x, pU.y); batch.closePath();
        continue;
      }
      flush();
      drawPage(ctx, p, st, { t, sinkK, calm, camX, corners: { p0, pV, pU } });
    }
    flush();
  }
  const FLAT = {};
  function pageFlat(Z, calm, id) {
    const zb = Z > 17 ? 2 : Z > 11 ? 1 : 0;
    const v = id % 3;
    const cb = Math.round(calm * 4);
    const key = zb * 100 + v * 10 + cb;
    if (!FLAT[key]) {
      const warm = [M(PAL.paper, PAL.blueband, 0.25), M(PAL.paperWarm, PAL.glow, 0.25), M(PAL.paperWarm, PAL.ember2, 0.4)][zb];
      const base = C.shade(warm, (v - 1) * 0.06);
      FLAT[key] = C.mix(base, M(PAL.night2, PAL.paper, 0.35), cb / 4);
    }
    return FLAT[key];
  }

  function pageCorners(st, scale = 1, camX = 0) {
    const ca = Math.cos(st.rot), sa = Math.sin(st.rot);
    // page axes in plan: along flow (dx,dz) rotated by rot
    const ux = (st.dx * ca - st.dz * sa) * PAGE_H * scale, uz = (st.dz * ca + st.dx * sa) * PAGE_H * scale;
    const vx = (st.dz * ca + st.dx * sa) * PAGE_W * scale, vz = (-st.dx * ca + st.dz * sa) * PAGE_W * scale;
    const o = { X: st.X - ux / 2 - vx / 2, Z: st.Z - uz / 2 - vz / 2 };
    const p0 = project(o.X, o.Z, camX);
    const pV = project(o.X + vx, o.Z + vz, camX); // along width
    const pU = project(o.X + ux, o.Z + uz, camX); // along height
    return { p0, pV, pU };
  }

  // tint weights by depth: cool near, warm mid, red far (crossfaded, no popping)
  function tintWeights(Z) {
    if (Z < 6) return [['cool', 1]];
    if (Z < 9) { const k = (Z - 6) / 3; return [['cool', 1 - k], ['warm', k]]; }
    if (Z < 13) return [['warm', 1]];
    if (Z < 17) { const k = (Z - 13) / 4; return [['warm', 1 - k], ['red', k]]; }
    return [['red', 1]];
  }

  function drawPage(ctx, p, st, o = {}) {
    const { sinkK = 0, t = 0, calm = 0, camX = 0, alpha = 1 } = o;
    const { p0, pV, pU } = o.corners || pageCorners(st, st.scale || 1, camX);
    const pxSize = Math.abs(pV.x - p0.x) + Math.abs(pU.y - p0.y);
    if (pxSize < 2.5) return;
    const bob = Math.sin(t * 2.2 + p.bob) * 0.012 * p0.k * (camH / CAM_H);
    const sp = sprites[p.sprite];
    const fog = C.clamp(1 - (st.Z - 4) / 30);
    const sinkDrop = sinkK * 0.04 * p0.k;
    ctx.save();
    ctx.transform((pV.x - p0.x) / sp.w, (pV.y - p0.y) / sp.w, (pU.x - p0.x) / sp.h, (pU.y - p0.y) / sp.h, p0.x, p0.y - bob + sinkDrop);
    const a0 = (0.4 + 0.6 * fog) * (1 - sinkK) * alpha;
    if (calm >= 0.999) {
      ctx.globalAlpha = a0; ctx.drawImage(sp.night, 0, 0, sp.w, sp.h);
    } else {
      const tw = tintWeights(st.Z);
      let first = true;
      for (const [name, w] of tw) {
        ctx.globalAlpha = a0 * (first ? 1 : w);
        ctx.drawImage(sp[name], 0, 0, sp.w, sp.h);
        first = false;
      }
      if (calm > 0) { ctx.globalAlpha = a0 * calm; ctx.drawImage(sp.night, 0, 0, sp.w, sp.h); }
    }
    if (sinkK > 0) { // sinking pages darken into the water
      ctx.globalAlpha = a0 * Math.min(1, sinkK * 1.2);
      ctx.drawImage(sp.night, 0, 0, sp.w, sp.h);
    }
    ctx.restore();
  }

  return {
    horizonY, vpX, F, CAM_H: camH, camH, lanes, pages, total, loopLen,
    centre, lanePoint, laneEdges, edgesAt, project, pageState, pageCorners, drawWater, drawPages, drawPage, sprites,
    PAGE_W, PAGE_H,
  };
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
      return c;
    };
    out.push({
      w, h, base,
      cool: tinted(M(PAL.blueband, PAL.night2, 0.3), 0.3), warm: tinted(PAL.glow, 0.22),
      red: tinted(PAL.ember1, 0.42), night: tinted(PAL.night2, 0.55),
    });
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

module.exports = { createRiver, drawResumePage, F, CAM_H, flowPhase, flowSpeed, calmAt, warmthAt, laneRamp, RAMPS, rect };
