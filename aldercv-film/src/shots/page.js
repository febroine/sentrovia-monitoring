'use strict';
// PAGE chapter — S4 (she sits on the bank, exhales, the river slows) and
// S5 (close on her lap: a blank sheet, words grow like plants, each line ends in an alder leaf).
//
// Exports for other chapters (keep stable):
//   bankScene(ctx, env, { t, T, cam, warmth, calm, flowPhase, starAmount,
//                         girl: { breath, eyes, mouth, hands, releaseK, lookUp, glow, glowAmt, light },
//                         drawExtras /* fn(ctx) called after the girl, world space */ })
//     Draws the whole bank set (sky, river, painted botanicals, stone bank, Mira sitting) and sets
//     the camera itself from `cam` ({ cx, cy, zoom, vx }). Optional extras in o.girl:
//     headTilt, sway, dy (seat offset, world px). BANK holds the set's world geometry.
//   drawFinishedPage(ctx, w, h, o)
//     Draws the completed S5 sheet (paper + all four story.pageLines + their leaves) into the box
//     (0,0)-(w,h) of the current transform. w/h < 0.62 picks the narrow (vertical) layout.
//     o: { env (enables paper caching), shadow = true, paper = true, seed }.
//   drawPage(ctx, w, h, { tp, ... }) — same sheet at S5 time tp (seconds into S5).
//   alderLeaf(ctx, x, y, size, o) — the sprouting alder leaf (brand-icon shape, alder green).

const C = require('../lib/core');
const PAL = require('../lib/palette');
const { camera, parallax } = require('../lib/stage');
const { drawSky } = require('../lib/sky');
const R = require('../lib/river');
const B = require('../lib/botany');
const G = require('../lib/girl');
const STORY = require('../lib/story');

// ---------------------------------------------------------------- shared timing (river lib, with fallbacks)
const rampF = (T, a, b, v0, v1) => C.lerp(v0, v1, C.ease.inOutSine(C.invLerp(a, b, T)));
function fbFlowPhase(T) {
  if (T <= 12) return 1.2 * T;
  const D = 2.5, dv = 1.1, u = Math.min(T, 14.5) - 12;
  let s = 14.4 + 0.1 * u + dv * (0.5 * u + ((0.5 * D) / Math.PI) * Math.sin((Math.PI * u) / D));
  if (T > 14.5) s += 0.1 * (T - 14.5);
  return s;
}
function fbCalm(T) { return T <= 12 ? 0 : T <= 16 ? rampF(T, 12, 16, 0, 0.3) : T <= 22.4 ? 0.3 : T <= 24 ? rampF(T, 22.4, 24, 0.3, 1) : 1; }
function fbWarmth(T) { return T <= 12 ? 1 : T <= 16 ? rampF(T, 12, 16, 1, 0.75) : T <= 22.4 ? 0.75 : T <= 24 ? rampF(T, 22.4, 24, 0.75, 0) : 0; }
const flowPhaseAt = (T) => (R.flowPhase || fbFlowPhase)(T);
const calmAt = (T) => (R.calmAt || fbCalm)(T);
const warmthAt = (T) => (R.warmthAt || fbWarmth)(T);

const MOON = '#8ea2dc';

// ================================================================= BANK SET (S4, reused by S6a)
const BANK = {
  horizonY: 400,
  girlX: 760, girlY: 900, girlS: 0.86,
  stoneTop: 792, stoneFront: 968, stoneBottom: 1240,
  river: { horizonY: 400, vpX: 1180, X0: 1.2, Z0: 1.6, L1: 4.0, R: 11.0, halfWidth: 7.0, seed: 5 },
};
const LIGHT = { key: MOON, rim: PAL.glow, rimSide: 1 };

function rectPath(x, y, w, h) { const p = new C.Path2D(); p.rect(x, y, w, h); return p; }
// Loose leaves around the rim of an ellipse (no underpaint) so leaf masses read as foliage, not blobs.
function leafSpray(x, cx, cy, w, h, seed, n, light) {
  const r = C.rng(seed);
  for (const [col, k] of [[PAL.leafDeep, 1], [PAL.leaf, 0.7], [PAL.leafMid, 0.45], [PAL.leafLight, 0.25]]) {
    const p = new C.Path2D();
    const m = Math.floor(n * k);
    for (let i = 0; i < m; i++) {
      const a = r() * Math.PI * 2, rr = 0.85 + r() * 0.25;
      const px = cx + Math.cos(a) * w * 0.5 * rr, py = cy + Math.sin(a) * h * 0.5 * rr;
      const ll = 30 + r() * 34, ang = a + Math.PI / 2 + (r() - 0.5) * 1.1; // pointing outward
      B.leafPath(p, px, py, ll, ll * 0.17, ang, (r() - 0.5) * 0.3);
    }
    C.paint(x, p, { fill: C.mix(col, light.key, 0.12), mottle: 0.4, hatch: 0.1, hatchColor: '#0d1a12', hatchAngle: 50, hatchSpacing: 5, seed: seed + 1 });
  }
}
// x-range a baked layer needs (vertical renders only see a strip around vx)
function spanFor(env, x0, x1, vx) {
  if (!env.vertical) return [x0, x1];
  return [Math.max(x0, vx - 520), Math.min(x1, vx + 520)];
}

// Stone bank: top surface (where she sits) + front face. Baked.
function stoneLayer(env, vx) {
  const [x0, x1] = spanFor(env, 180, 2120, vx);
  const y0 = BANK.stoneTop - 14, y1 = BANK.stoneBottom;
  return env.once(`page:bank:stone:${x0}:${x1}`, () => C.layer(x1 - x0, y1 - y0, env.res, (x) => {
    x.translate(-x0, -y0);
    // top surface, receding: lighter, with joints converging toward the horizon vanishing point
    const top = new C.Path2D();
    const r = C.rng(41);
    top.moveTo(300, BANK.stoneTop + 4);
    for (let k = 0; k <= 30; k++) top.lineTo(300 + (1880 * k) / 30, BANK.stoneTop + (r() - 0.5) * 5);
    top.lineTo(2180, BANK.stoneFront); top.lineTo(170, BANK.stoneFront); top.closePath();
    const g = x.createLinearGradient(0, BANK.stoneTop, 0, BANK.stoneFront);
    g.addColorStop(0, C.mix(PAL.stoneShade, PAL.night1, 0.35));
    g.addColorStop(0.25, C.mix(C.mix(PAL.stone, MOON, 0.3), PAL.night1, 0.25));
    g.addColorStop(1, C.mix(C.mix(PAL.stoneLight, MOON, 0.28), PAL.night1, 0.18));
    C.paint(x, top, { fill: g, mottle: 0.7, hatch: 0.15, hatchColor: '#1d1b22', hatchAngle: 12, hatchSpacing: 6, seed: 9 });
    x.save(); x.clip(top);
    // warm horizon light grazing the far edge of the slab
    const wg = x.createLinearGradient(0, BANK.stoneTop, 0, BANK.stoneTop + 60);
    wg.addColorStop(0, C.rgba(PAL.glow, 0.28)); wg.addColorStop(1, C.rgba(PAL.glow, 0));
    x.fillStyle = wg; x.fillRect(1000, BANK.stoneTop - 4, 1200, 70);
    // a few irregular slab joints (old river-wall stones, not tiles)
    x.strokeStyle = 'rgba(28,24,34,0.5)'; x.lineWidth = 1.6; x.lineJoin = 'round'; x.beginPath();
    for (const jx of [520, 1010, 1430, 1890]) {
      let cx = jx + (r() - 0.5) * 60, cy = BANK.stoneFront;
      x.moveTo(cx, cy);
      for (let k = 1; k <= 6; k++) { cx += (1100 - jx) * 0.035 + (r() - 0.5) * 10; cy -= (BANK.stoneFront - BANK.stoneTop) / 6; x.lineTo(cx, cy); }
    }
    { let cx = 300, cy = 880; x.moveTo(cx, cy); while (cx < 2200) { cx += 60 + r() * 80; cy += (r() - 0.5) * 6; x.lineTo(cx, cy); } }
    x.stroke();
    // lichen / moss dabs and worn pale patches
    for (let i = 0; i < 160; i++) {
      const mx = 200 + r() * 1980, my = BANK.stoneTop + 8 + r() * 160, rr = 3 + r() * 14;
      x.fillStyle = r() < 0.6 ? C.rgba(C.mix(PAL.leafMid, MOON, 0.3), 0.18 + r() * 0.2) : C.rgba(PAL.stoneLight, 0.12 + r() * 0.12);
      x.beginPath(); x.ellipse(mx, my, rr * 1.8, rr * 0.5, 0, 0, Math.PI * 2); x.fill();
    }
    // cracks + speckles
    x.strokeStyle = 'rgba(28,24,34,0.35)'; x.lineWidth = 1; x.beginPath();
    for (let i = 0; i < 26; i++) {
      let cx = 200 + r() * 1950, cy = BANK.stoneTop + 10 + r() * 150;
      x.moveTo(cx, cy);
      for (let k = 0; k < 4; k++) { cx += (r() - 0.5) * 50; cy += (r() - 0.3) * 10; x.lineTo(cx, cy); }
    }
    x.stroke();
    for (let i = 0; i < 900; i++) {
      x.fillStyle = r() < 0.5 ? 'rgba(30,26,34,0.22)' : 'rgba(240,235,220,0.14)';
      x.fillRect(170 + r() * 2000, BANK.stoneTop + r() * 176, 1.6, 1.2);
    }
    // wet dark rim where the water laps the slab
    x.strokeStyle = C.rgba(PAL.night0, 0.55); x.lineWidth = 7; x.filter = 'blur(2px)';
    x.beginPath(); x.moveTo(300, BANK.stoneTop + 3); x.lineTo(2200, BANK.stoneTop + 3); x.stroke(); x.filter = 'none';
    x.restore();
    // front face
    B.stoneBank(x, 150, BANK.stoneFront, 2180, BANK.stoneBottom, 17, { light: LIGHT });
    x.fillStyle = C.rgba(PAL.night0, 0.35); x.fillRect(150, BANK.stoneFront + 8, 2040, BANK.stoneBottom - BANK.stoneFront);
  }));
}

// Dense painted botanical wall on the left (ref1 grammar), standing on earth beside the slab. Baked.
function wallLayer(env, vx) {
  const [x0, x1] = spanFor(env, -200, 700, vx);
  const y0 = 0, y1 = 1240;
  return env.once(`page:bank:wall:${x0}:${x1}`, () => C.layer(x1 - x0, y1 - y0, env.res, (x) => {
    x.translate(-x0, -y0);
    const L = LIGHT;
    // earth/moss mound under the plants
    const mound = new C.Path2D();
    mound.moveTo(-220, 560); mound.bezierCurveTo(200, 600, 420, 760, 470, 980); mound.lineTo(380, 1250); mound.lineTo(-220, 1250); mound.closePath();
    C.paint(x, mound, { fill: C.mix(PAL.leafDeep, PAL.night0, 0.5), mottle: 0.6, hatch: 0.14, hatchColor: '#08100c', seed: 21 });
    // back wall of leaves, tall, rising out of frame; loose sprays break the silhouette
    B.leafMass(x, -40, 40, 640, 520, 100, { count: 420, len: 56, light: L });
    B.leafMass(x, 60, 230, 600, 520, 101, { count: 420, len: 54, light: L });
    B.leafMass(x, 330, 420, 400, 420, 102, { count: 300, len: 50, light: L });
    B.leafMass(x, -60, 560, 520, 520, 103, { count: 360, len: 56, light: L });
    leafSpray(x, -40, 40, 640, 520, 140, 90, L);
    leafSpray(x, 60, 230, 600, 520, 141, 90, L);
    leafSpray(x, 330, 420, 400, 420, 142, 80, L);
    B.blooms(x, 120, 170, 130, 104, { n: 11, size: 17, light: L, night: 0.55 });
    B.blooms(x, 360, 330, 80, 105, { n: 7, size: 15, light: L, night: 0.55 });
    B.blooms(x, -20, 470, 90, 106, { n: 8, size: 16, light: L, night: 0.55 });
    B.blooms(x, 200, -20, 110, 116, { n: 9, size: 17, light: L, night: 0.55 });
    B.leafMass(x, 380, 640, 330, 300, 107, { count: 240, len: 46, light: L });
    leafSpray(x, 380, 640, 330, 300, 143, 60, L);
    B.leafMass(x, 470, 760, 260, 200, 117, { count: 160, len: 40, light: L });
    leafSpray(x, 470, 760, 260, 200, 144, 50, L);
    B.budStalk(x, 520, 860, 560, 108, { lean: 0.1, light: L });
    B.budStalk(x, 420, 900, 430, 109, { lean: -0.05, light: L });
    B.leafMass(x, 150, 820, 560, 360, 110, { count: 320, len: 52, light: L });
    B.blooms(x, 280, 720, 70, 111, { n: 5, size: 14, light: L, night: 0.6 });
    // silver agave in front (ref4 grammar)
    B.agave(x, 300, 1010, 300, 112, L);
    B.agave(x, 40, 1080, 380, 113, L);
    B.grass(x, -200, 1000, 700, 120, 114, { density: 1.4, light: L });
    // a few blades leaning out over the slab
    B.grass(x, 380, 975, 160, 90, 115, { density: 1.2, light: L });
  }));
}

// Small foreground: agave far right and grass along the front lip (in front of everything). Baked.
function frontLayer(env, vx) {
  const [x0, x1] = spanFor(env, 1500, 2160, vx);
  const y0 = 760, y1 = 1240;
  if (x1 <= x0) return null;
  return env.once(`page:bank:front:${x0}:${x1}`, () => C.layer(x1 - x0, y1 - y0, env.res, (x) => {
    x.translate(-x0, -y0);
    B.agave(x, 1940, 1110, 300, 131, LIGHT);
    B.grass(x, 1720, 1060, 440, 110, 132, { density: 1.3, light: LIGHT });
  }));
}

// Night-tinted blank sheet lying on the slab beside her (S4) — the page she will write on.
function sheetOnStone(ctx, x, y, s, lift = 0) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  const p = new C.Path2D();
  p.moveTo(-70, 0); p.lineTo(64, -6); p.quadraticCurveTo(80, -14 - lift * 6, 84, -26 - lift * 10);
  p.lineTo(-40, -24); p.quadraticCurveTo(-60, -14, -70, 0); p.closePath();
  ctx.fillStyle = C.rgba(PAL.night0, 0.45); ctx.filter = 'blur(3px)';
  ctx.beginPath(); ctx.ellipse(6, 4, 82, 9, -0.03, 0, Math.PI * 2); ctx.fill(); ctx.filter = 'none';
  C.paint(ctx, p, { fill: C.mix(PAL.paper, MOON, 0.22), mottle: 0.5, hatch: 0.1, hatchColor: PAL.paperShade, hatchAngle: 25, hatchSpacing: 4, seed: 6 });
  ctx.strokeStyle = C.rgba(PAL.glow, 0.5); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-40, -24); ctx.lineTo(84, -26 - lift * 10); ctx.stroke();
  C.ink(ctx, p, { color: '#6a5a48', width: 1, alpha: 0.6 });
  ctx.restore();
}

function bankScene(ctx, env, o = {}) {
  const T = o.T ?? 12 + (o.t || 0);
  const t = o.t ?? 0;
  const cam = { cx: 960, cy: 540, zoom: 1, vx: BANK.girlX, ...(o.cam || {}) };
  const warmth = o.warmth ?? warmthAt(T);
  const calm = o.calm ?? calmAt(T);
  const phase = o.flowPhase ?? flowPhaseAt(T);
  const starAmount = o.starAmount ?? 0.4;
  const gi = o.girl || {};

  // far: sky + river share one parallax depth so the horizon stays locked
  parallax(ctx, env, cam, 0.55);
  drawSky(ctx, env, { horizonY: BANK.horizonY, warmth, t: T, starAmount, seed: 7 });
  const river = R.createRiver(env, BANK.river);
  river.drawWater(ctx, { phase, calm, t: T });
  river.drawPages(ctx, { phase, calm, t: T, zMin: 3.0 });

  // near: bank, wall, girl
  camera(ctx, env, cam);
  C.blit(ctx, stoneLayer(env, cam.vx), ...originOf(env, 180, BANK.stoneTop - 14, cam.vx, 2120));
  C.blit(ctx, wallLayer(env, cam.vx), ...originOf(env, -200, 0, cam.vx, 700));

  // contact shadow under her
  ctx.save();
  ctx.fillStyle = C.rgba(PAL.night0, 0.5); ctx.filter = 'blur(6px)';
  ctx.beginPath(); ctx.ellipse(BANK.girlX + 6, BANK.girlY + 6, 225 * BANK.girlS, 22, 0, 0, Math.PI * 2); ctx.fill();
  ctx.filter = 'none';
  ctx.restore();

  ctx.save();
  ctx.translate(BANK.girlX, BANK.girlY + (gi.dy || 0));
  ctx.scale(BANK.girlS, BANK.girlS);
  G.sitFront(ctx, {
    breath: gi.breath ?? 0, eyes: gi.eyes, mouth: gi.mouth, hands: gi.hands || 'knees', releaseK: gi.releaseK,
    lookUp: gi.lookUp ?? 0, glow: gi.glow, glowAmt: gi.glowAmt, headTilt: gi.headTilt, sway: gi.sway,
    light: gi.light || { rim: PAL.glow, rimAmt: 0.7, side: 1 },
  });
  ctx.restore();

  if (o.drawExtras) { ctx.save(); o.drawExtras(ctx); ctx.restore(); }
  const fl = frontLayer(env, cam.vx);
  if (fl) C.blit(ctx, fl, ...originOf(env, 1500, 760, cam.vx, 2160));
  return { river };
}
function originOf(env, x0, y0, vx, x1) { return [spanFor(env, x0, x1, vx)[0], y0]; }

// ---------------------------------------------------------------- S4
function drawS4(ctx, env, t, info) {
  const T = info ? info.T : 12 + t;
  const tc = C.twos(t); // character time (on twos)
  const k = C.seg(t, 0, 4, C.ease.inOutSine);
  const cam = { cx: 935, cy: 540, zoom: C.lerp(1.06, 1.0, k), vx: 715 };
  // settling (she has just sat down): seat sinks a few px, hair sways out
  const settle = 1 - C.seg(tc, 0, 0.5, C.ease.outCubic);
  const dy = -9 * settle;
  const sway = 5 * Math.sin(tc * 9) * (1 - C.seg(tc, 0, 0.9, C.ease.outSine));
  // 12.6 s exhale: shoulders drop, eyes close, breath mouth then neutral
  const breath = C.seg(tc, 0.6, 1.5, C.ease.inOutSine);
  let open = 1 - C.seg(tc, 0.6, 0.8);
  let lookX = 0, lookY = 0.15;
  // 15.0 s eyes reopen, lowered toward the blank sheet beside her (sets up S5)
  const reopen = C.seg(tc, 3.0, 3.4, C.ease.inOutSine);
  if (tc >= 3.0) { open = 0.55 * reopen; lookX = 0.55; lookY = 0.9; }
  const mouth = tc >= 0.6 && tc < 1.35 ? 'breath' : tc >= 3.2 ? 'soft' : 'neutral';
  const headTilt = 0.04 * breath + 0.03 * reopen;
  // horizon rim light cools over the shot
  const cool = C.seg(t, 0.6, 4, C.ease.inOutSine);
  const light = { rim: C.mix(PAL.glow, MOON, 0.45 * cool), rimAmt: C.lerp(0.75, 0.55, cool), side: 1 };
  // first stars brighten by 14.5 s
  const starAmount = C.lerp(0.32, 0.9, C.seg(t, 0.4, 2.5, C.ease.inOutSine));
  bankScene(ctx, env, {
    t, T, cam, starAmount,
    girl: { breath, eyes: { open, lookX, lookY }, mouth, hands: 'knees', headTilt, sway, dy, light },
    drawExtras: (c) => sheetOnStone(c, 1030, 878, 1.0, 0.5 + 0.5 * Math.sin(T * 1.1)),
  });
  return { post: { grain: 0.6, vignette: 0.38 } };
}

// ================================================================= THE PAGE (S5, reused by S6)
// The alder leaf, from the aldercv.com mark (rounded leaf, notch at the tip, midrib + parallel side veins),
// normalised: base at (0,0), notch at (0,-1), axis pointing up.
const LEAF_SVG = [[19.82, 43.44], [10.76, 33.85], [9.92, 21.23], [16.11, 12.71], [23.26, 2.88], [33.57, 1.36], [39.86, 5.93],
  [42.48, 7.84], [43.1, 10.29], [41.91, 13.03], [44.15, 11.05], [46.68, 10.89], [49.3, 12.79], [55.59, 17.36], [57.33, 27.64],
  [50.19, 37.47], [44, 45.99], [31.73, 49.09], [19.82, 43.44]];
const LEAF_PATH = (() => {
  const bx = 20.5, by = 43.8, L = 37.5, a = -0.607, ca = Math.cos(a), sa = Math.sin(a);
  const q = ([x, y]) => { const dx = (x - bx) / L, dy = (y - by) / L; return [dx * ca - dy * sa, dx * sa + dy * ca]; };
  const pts = LEAF_SVG.map(q);
  const p = new C.Path2D();
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i += 3) p.bezierCurveTo(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], pts[i + 2][0], pts[i + 2][1]);
  p.closePath();
  return p;
})();

// o: { ang (lean, radians from up), grow 0..1 (length), open 0..1 (width/unfurl), curl (radians), alpha }
function alderLeaf(ctx, x, y, size, o = {}) {
  const grow = C.clamp(o.grow ?? 1), open = C.clamp(o.open ?? 1);
  if (grow <= 0.001) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((o.ang ?? 0.5) + (o.curl ?? 0));
  ctx.globalAlpha *= o.alpha ?? 1;
  // petiole
  ctx.strokeStyle = PAL.alderDeep; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1.2, size * 0.035);
  ctx.beginPath(); ctx.moveTo(0, size * 0.02); ctx.quadraticCurveTo(-size * 0.03, size * 0.14 * grow, -size * 0.1, size * 0.24 * grow); ctx.stroke();
  ctx.scale(size * (0.12 + 0.88 * open) * grow, size * grow);
  const lw = 1 / size;
  C.paint(ctx, LEAF_PATH, { fill: C.mix(PAL.alder, PAL.alderLight, 0.12), mottle: 0.45, hatch: 0.16, hatchColor: PAL.alderDeep, hatchAngle: 50, hatchSpacing: 4, hatchScale: 2 / size, mottleScale: 0.6 / size, seed: 4 });
  // shade half (cel: one shade shape)
  ctx.save(); ctx.clip(LEAF_PATH);
  ctx.fillStyle = C.rgba(PAL.alderDeep, 0.35); ctx.fillRect(0.02, -1.2, 1, 1.4);
  ctx.restore();
  const vk = C.seg(open, 0.35, 1);
  if (vk > 0) {
    ctx.save(); ctx.clip(LEAF_PATH);
    ctx.globalAlpha *= vk;
    ctx.strokeStyle = PAL.alderDeep; ctx.lineCap = 'round';
    ctx.lineWidth = 3.2 * lw;
    ctx.beginPath(); ctx.moveTo(0, 0.02); ctx.lineTo(0, -0.84); ctx.stroke();
    ctx.lineWidth = 2.4 * lw; ctx.beginPath();
    for (const u of [0.22, 0.38, 0.54, 0.7]) {
      const hw = Math.sqrt(Math.max(0, 0.27 - (u - 0.48) * (u - 0.48))) * 0.95;
      for (const sd of [-1, 1]) { ctx.moveTo(0, -u); ctx.lineTo(sd * hw * 0.85, -u - hw * 0.62); }
    }
    ctx.stroke();
    ctx.strokeStyle = C.rgba(PAL.alderLight, 0.55); ctx.lineWidth = 1.2 * lw;
    ctx.beginPath(); ctx.moveTo(-0.025, -0.05); ctx.lineTo(-0.025, -0.8); ctx.stroke();
    ctx.restore();
  }
  ctx.lineJoin = 'round';
  ctx.strokeStyle = PAL.alderDeep; ctx.lineWidth = 2.2 * lw / Math.max(0.3, open); ctx.stroke(LEAF_PATH);
  ctx.restore();
}

// ---- layout
const LAYOUTS = {
  wide: { DW: 1040, margin: 104, top: 120, sizes: { name: 112, italic: 58, body: 52 }, after: { name: 0.95, italic: 0.9, body: 0.82 }, before: 0.95 },
  narrow: { DW: 560, margin: 46, top: 90, sizes: { name: 80, italic: 40, body: 38 }, after: { name: 0.9, italic: 0.85, body: 0.8 }, before: 0.95, wrap: true },
};
const FONTS = { name: C.FONT.serifMed, italic: C.FONT.serifIt, body: C.FONT.serif };
let measureCtx = null;
const layoutCache = new Map();
function getLayout(kind) {
  if (layoutCache.has(kind)) return layoutCache.get(kind);
  C.registerFonts();
  if (!measureCtx) measureCtx = C.canvas(8, 8).getContext('2d');
  const m = measureCtx, Lk = LAYOUTS[kind];
  const avail = Lk.DW - Lk.margin * 2;
  const lines = [];
  let y = Lk.top;
  STORY.pageLines.forEach((ln, li) => {
    const size = Lk.sizes[ln.style];
    m.font = FONTS[ln.style](size);
    const leafSize = ln.style === 'name' ? size * 0.92 : size * 1.25;
    const leafRoom = leafSize * 0.95;
    // wrap into rows if the line plus its leaf does not fit
    let rows = [ln.text];
    if (Lk.wrap && m.measureText(ln.text).width + leafRoom > avail) {
      const words = ln.text.split(' ');
      let best = null;
      for (let i = 1; i < words.length; i++) {
        const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
        const wa = m.measureText(a).width, wb = m.measureText(b).width + leafRoom;
        if (wa <= avail && wb <= avail) { const sc = Math.abs(wa - wb); if (!best || sc < best.sc) best = { sc, rows: [a, b] }; }
      }
      if (best) rows = best.rows;
    }
    y += size * (li === 0 ? 0.7 : Lk.before * 0.6);
    const out = { li, style: ln.style, size, start: ln.start, leaf: ln.leaf, leafSize, rows: [] };
    rows.forEach((txt, ri) => {
      if (ri > 0) y += size * 1.18;
      const glyphs = [];
      for (let i = 0; i < txt.length; i++) {
        const ch = txt[i];
        if (ch === ' ') continue;
        const gx = m.measureText(txt.slice(0, i)).width;
        glyphs.push({ ch, x: gx, w: m.measureText(ch).width });
      }
      const width = m.measureText(txt).width;
      out.rows.push({ text: txt, x: Lk.margin, y, width, glyphs });
    });
    y += size * Lk.after[ln.style];
    lines.push(out);
  });
  // vines: one per row, a gentle wobble just under the baseline; the last row hooks up into the leaf
  for (const ln of lines) {
    let total = 0;
    ln.rows.forEach((row, ri) => {
      const s = ln.size, last = ri === ln.rows.length - 1;
      const xs = row.x - s * 0.28, xe = row.x + row.width + s * 0.12, yv = row.y + s * 0.13;
      const pts = [];
      const n = Math.max(12, Math.round((xe - xs) / 10));
      const ph = (ln.li * 1.7 + ri) * 2.1;
      for (let i = 0; i <= n; i++) {
        const xx = xs + ((xe - xs) * i) / n;
        pts.push([xx, yv + Math.sin(xx / (s * 0.9) + ph) * s * 0.035 + Math.sin(xx / (s * 0.37) + ph * 2) * s * 0.012]);
      }
      if (last) { // hook up to the leaf base
        const hx = xe + s * 0.16, hy = row.y - s * 0.02;
        const [lx, ly] = pts[pts.length - 1];
        for (let i = 1; i <= 8; i++) {
          const u = i / 8;
          pts.push([C.lerp(lx, hx, Math.sin(u * Math.PI / 2)), C.lerp(ly, hy, 1 - Math.cos(u * Math.PI / 2))]);
        }
        ln.leafAt = [hx, hy];
      }
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      row.vine = { pts, cum, len: cum[cum.length - 1], xs, xe };
      // tiny leaflets hanging under the vine
      row.buds = [];
      const rr = C.rng(300 + ln.li * 17 + ri);
      for (let bx = xs + s * 0.9 + rr() * s * 0.5; bx < xe - s * 0.4; bx += s * (1.4 + rr() * 0.9)) row.buds.push({ x: bx, side: rr() < 0.75 ? 1 : -1, len: s * (0.16 + rr() * 0.08), ang: 0.5 + rr() * 0.6 });
      row.growDist = s * 1.1;
      row.ext = (xe - xs) + row.growDist; // virtual travel for this row
      total += row.ext;
    });
    ln.total = total;
  }
  const res = { kind, ...Lk, lines };
  layoutCache.set(kind, res);
  return res;
}

function vineAt(row, x) { // y on the vine at x (straight part)
  const { pts } = row.vine;
  const i = C.clamp(Math.floor(((x - row.vine.xs) / (row.vine.xe - row.vine.xs)) * (pts.length - 9)), 0, pts.length - 2);
  return pts[i][1];
}

function strokePartial(ctx, pts, cum, L) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  let tip = pts[0];
  for (let i = 1; i < pts.length; i++) {
    if (cum[i] <= L) { ctx.lineTo(pts[i][0], pts[i][1]); tip = pts[i]; continue; }
    const k = (L - cum[i - 1]) / (cum[i] - cum[i - 1]);
    tip = [C.lerp(pts[i - 1][0], pts[i][0], k), C.lerp(pts[i - 1][1], pts[i][1], k)];
    ctx.lineTo(tip[0], tip[1]);
    break;
  }
  ctx.stroke();
  return tip;
}

// Paper sheet path in design units (DW x DH), slightly irregular, faint keystone (seen from above).
function sheetPath(DW, DH, seed) {
  const r = C.rng(seed);
  const p = new C.Path2D();
  const ins = DW * 0.012;
  p.moveTo(ins, 0);
  for (let i = 1; i <= 10; i++) p.lineTo(ins + ((DW - 2 * ins) * i) / 10, (r() - 0.5) * 1.6);
  for (let i = 1; i <= 12; i++) p.lineTo(DW - ins * (1 - i / 12) + (r() - 0.5) * 1.6, (DH * i) / 12);
  for (let i = 9; i >= 0; i--) p.lineTo((DW * i) / 10, DH + (r() - 0.5) * 1.6);
  for (let i = 11; i >= 1; i--) p.lineTo(ins * (1 - i / 12) + (r() - 0.5) * 1.6, (DH * i) / 12);
  p.closePath();
  return p;
}
function paintPaper(x, DW, DH, o) {
  const seed = o.seed ?? 3;
  const p = sheetPath(DW, DH, seed);
  if (o.shadow !== false) {
    x.save();
    x.fillStyle = C.rgba(PAL.night0, 0.55); x.filter = 'blur(10px)';
    x.translate(DW * 0.012, DW * 0.022); x.fill(p);
    x.restore();
    x.filter = 'none';
  }
  const g = x.createLinearGradient(0, 0, DW * 0.4, DH);
  g.addColorStop(0, C.mix(PAL.paper, '#fbf4e2', 0.35)); g.addColorStop(0.55, PAL.paper); g.addColorStop(1, C.mix(PAL.paperWarm, MOON, 0.12));
  C.paint(x, p, { fill: g, mottle: 0.42, hatch: 0.07, hatchColor: PAL.paperShade, hatchAngle: 32, hatchSpacing: 6, seed });
  x.save(); x.clip(p);
  // soft edge darkening + faint paper tooth fibres
  x.strokeStyle = C.rgba(PAL.paperShade, 0.45); x.lineWidth = DW * 0.02; x.filter = 'blur(6px)'; x.stroke(p); x.filter = 'none';
  const r = C.rng(seed + 50);
  x.strokeStyle = C.rgba(PAL.paperShade, 0.18); x.lineWidth = 0.8; x.beginPath();
  for (let i = 0; i < 260; i++) { const fx = r() * DW, fy = r() * DH, a = r() * 6.28, L = 4 + r() * 10; x.moveTo(fx, fy); x.lineTo(fx + Math.cos(a) * L, fy + Math.sin(a) * L); }
  x.stroke();
  x.restore();
  C.ink(x, p, { color: '#8a7658', width: 1.1, alpha: 0.55 });
}

// The sheet at S5 time tp (seconds into S5; Infinity = finished), drawn into (0,0)-(w,h).
function drawPage(ctx, w, h, o = {}) {
  const tp = o.tp ?? Infinity;
  const kind = o.layout || (w / h < 0.62 ? 'narrow' : 'wide');
  const Lo = getLayout(kind);
  const s = w / Lo.DW, DH = h / s;
  ctx.save();
  if (o.paper !== false) {
    if (o.env) {
      const env = o.env, pad = 60;
      const res = env.res * s * (o.resBoost ?? 1);
      const lay = env.once(`page:paper:${kind}:${Math.round(w)}x${Math.round(h)}:${o.shadow !== false}:${o.seed ?? 3}:${(o.resBoost ?? 1)}`,
        () => C.layer(Lo.DW + pad * 2, DH + pad * 2, res, (x) => { x.translate(pad, pad); paintPaper(x, Lo.DW, DH, o); }));
      ctx.save(); ctx.scale(s, s); C.blit(ctx, lay, -pad, -pad); ctx.restore();
    } else {
      ctx.save(); ctx.scale(s, s); paintPaper(ctx, Lo.DW, DH, o); ctx.restore();
    }
  }
  if (o.crease > 0) { // a soft diagonal crease that her hand smooths away
    ctx.save(); ctx.scale(s, s);
    ctx.globalAlpha = o.crease;
    const gx = Lo.DW * 0.62, gy = Math.min(DH * 0.62, 900);
    ctx.translate(gx, gy); ctx.rotate(-0.5);
    const g = ctx.createLinearGradient(0, -18, 0, 18);
    g.addColorStop(0, C.rgba(PAL.paperShade, 0)); g.addColorStop(0.45, C.rgba(PAL.paperShade, 0.55)); g.addColorStop(0.55, C.rgba('#fffaf0', 0.5)); g.addColorStop(1, C.rgba('#fffaf0', 0));
    ctx.fillStyle = g; ctx.fillRect(-Lo.DW * 0.5, -18, Lo.DW, 36);
    ctx.restore();
  }
  ctx.scale(s, s);
  drawWords(ctx, Lo, tp, o);
  ctx.restore();
}

function drawWords(ctx, Lo, tp) {
  for (const ln of Lo.lines) {
    const dur = Math.max(0.2, ln.leaf - 0.06 - ln.start);
    const travel = C.clamp((tp - ln.start) / dur) * ln.total; // virtual distance along all rows of this line
    if (tp < ln.start) continue;
    let acc = 0;
    const s = ln.size;
    ctx.font = FONTS[ln.style](s);
    ctx.textBaseline = 'alphabetic';
    ln.rows.forEach((row, ri) => {
      const v = travel - acc; // this row's virtual travel
      acc += row.ext;
      if (v <= 0) return;
      const vx = row.vine.xs + v;           // virtual tip x (continues past the end for the last glyphs)
      const vineL = Math.min(row.vine.len, v * (row.vine.len / (row.vine.xe - row.vine.xs)));
      // stem
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = PAL.alderDeep; ctx.lineWidth = Math.max(2, s * 0.05);
      const tip = strokePartial(ctx, row.vine.pts, row.vine.cum, vineL);
      ctx.strokeStyle = C.rgba(PAL.alder, 0.9); ctx.lineWidth = Math.max(1, s * 0.022);
      strokePartial(ctx, row.vine.pts, row.vine.cum, vineL);
      if (vineL < row.vine.len - 0.5) { // growing tip bud
        ctx.fillStyle = PAL.alderLight; ctx.beginPath(); ctx.arc(tip[0], tip[1], Math.max(1.8, s * 0.04), 0, Math.PI * 2); ctx.fill();
      }
      // leaflets under the stem
      for (const b of row.buds) {
        const k = C.ease.outCubic(C.clamp((vx - b.x) / (s * 0.9)));
        if (k <= 0) continue;
        const by = vineAt(row, b.x);
        const p = new C.Path2D();
        B.leafPath(p, b.x, by, b.len * k, b.len * 0.28 * k, Math.PI - b.ang * b.side, 0.15);
        ctx.fillStyle = C.mix(PAL.alder, PAL.alderLight, 0.25); ctx.fill(p);
        ctx.strokeStyle = PAL.alderDeep; ctx.lineWidth = 0.9; ctx.stroke(p);
      }
      ctx.restore();
      // glyphs: unfurl from the stem — grow from small scale + rotation, anchored on the vine, no bounce
      ctx.save();
      ctx.beginPath(); ctx.rect(row.x - s, row.y - s * 1.6, Math.max(0, vx - row.x + s * 0.9), s * 2.6); ctx.clip();
      ctx.fillStyle = PAL.ink;
      for (const g of row.glyphs) {
        const k = C.clamp((vx - (row.x + g.x)) / row.growDist);
        if (k <= 0) continue;
        const e = C.ease.outCubic(k);
        const ax = row.x + g.x + g.w * 0.5, ay = row.y + s * 0.12;
        if (e >= 0.999) { ctx.fillText(g.ch, row.x + g.x, row.y); continue; }
        ctx.save();
        ctx.globalAlpha = Math.min(1, k * 2.2);
        ctx.translate(ax, ay);
        ctx.rotate(-0.42 * (1 - e));
        ctx.scale(0.2 + 0.8 * e, 0.12 + 0.88 * e);
        ctx.fillText(g.ch, -g.w * 0.5, -s * 0.12);
        ctx.restore();
      }
      ctx.restore();
    });
    // leaf: sprouts exactly at its cue (bud visible on the cue frame), unfurls over ~0.55 s
    if (tp >= ln.leaf - 1e-6 && ln.leafAt) {
      const u = tp - ln.leaf;
      const grow = C.ease.outCubic(C.clamp(u / 0.42 + 0.1));
      const open = C.ease.outCubic(C.clamp((u - 0.04) / 0.55 + 0.05));
      const [lx, ly] = ln.leafAt;
      if (u < 0.7) C.glow(ctx, lx + ln.leafSize * 0.3, ly - ln.leafSize * 0.5, ln.leafSize * 1.3, PAL.alderLight, 0.32 * (1 - C.clamp(u / 0.7)));
      alderLeaf(ctx, lx, ly, ln.leafSize, { ang: 0.62, curl: -0.55 * (1 - open), grow, open });
    }
  }
}

function drawFinishedPage(ctx, w, h, o = {}) { drawPage(ctx, w, h, { ...o, tp: Infinity }); }

// ---------------------------------------------------------------- S5 set: her lap from above (POV)
const LAP = {
  wide: { x: 440, y: 150, w: 1040, h: 1400, rot: -0.012 },
  narrow: { x: 690, y: 150, w: 540, h: 1250, rot: -0.01 },
};

function lapLayer(env) {
  const [x0, x1] = spanFor(env, -200, 2120, 960);
  const y0 = -200, y1 = 1250;
  return env.once(`page:S5:lap:${x0}`, () => C.layer(x1 - x0, y1 - y0, env.res, (x) => {
    x.translate(-x0, -y0);
    // far: the stone bank beyond her feet + soft foliage, depth-softened (baked blur)
    const far = C.layer(x1 - x0, 520, env.res, (y) => {
      y.translate(-x0, 200);
      const ground = rectPath(-260, -220, 2440, 520);
      const g = y.createLinearGradient(0, -200, 0, 300);
      g.addColorStop(0, C.mix(PAL.stoneShade, PAL.night1, 0.5)); g.addColorStop(1, C.mix(PAL.stone, MOON, 0.3));
      C.paint(y, ground, { fill: g, mottle: 0.7, hatch: 0.14, hatchColor: '#1d1b22', hatchAngle: 18, seed: 12 });
      B.leafMass(y, -60, -120, 700, 300, 201, { count: 300, len: 60, light: LIGHT });
      B.blooms(y, 120, -150, 120, 202, { n: 8, size: 20, light: LIGHT, night: 0.55 });
      B.agave(y, 1780, 60, 320, 203, LIGHT);
      B.leafMass(y, 1980, -100, 600, 320, 204, { count: 260, len: 60, light: LIGHT });
      B.grass(y, -200, 60, 2400, 90, 205, { density: 1.1, light: LIGHT });
      B.agave(y, 120, 120, 260, 206, LIGHT);
    });
    x.save(); x.filter = 'blur(3px)'; C.blit(x, far, x0, -200); x.restore(); x.filter = 'none';
    x.fillStyle = C.rgba(PAL.night0, 0.3); x.fillRect(x0, -200, x1 - x0, 520);
    // her legs (cel), seen from above: crossed shins at the top with a bare foot, rounded knees out
    // to the sides, thighs sweeping in toward the bottom centre (under the sheet)
    const lw = 2.6;
    const tr = PAL.trousers, trS = PAL.trousersShade, trL = C.mix(tr, MOON, 0.28);
    const fold = (pathFn) => { x.save(); x.strokeStyle = C.rgba(trS, 0.95); x.lineWidth = 2.4; x.lineCap = 'round'; x.beginPath(); pathFn(); x.stroke(); x.restore(); };
    // back shin (left knee -> right, under everything) and its foot on the right
    const shinB = G.limb([[180, 250], [700, 175], [1250, 165], [1650, 205]], [210, 200, 190, 170]);
    G.celPart(x, shinB, C.shade(tr, -0.1), { lw, shade: rectPath(-300, 215, 2600, 200), shadeFill: trS });
    const footR = G.closedSmooth([[1600, 150], [1700, 120], [1800, 132], [1850, 175], [1800, 215], [1680, 230], [1600, 225]]);
    G.celPart(x, footR, PAL.skin, { lw, shade: rectPath(1550, 190, 400, 80), shadeFill: PAL.skinShade });
    // front shin (right knee -> left), cuff and upturned sole on the left
    const shinF = G.limb([[1760, 290], [1250, 140], [700, 120], [290, 150]], [230, 220, 210, 190]);
    G.celPart(x, shinF, tr, { lw, shade: rectPath(-300, 170, 2600, 200), shadeFill: C.mix(tr, trS, 0.7) });
    x.save(); x.clip(shinF); x.strokeStyle = C.rgba(trL, 0.6); x.lineWidth = 5; x.beginPath(); x.moveTo(300, 60); x.bezierCurveTo(700, 25, 1250, 45, 1700, 200); x.stroke(); x.restore();
    fold(() => { x.moveTo(1220, 50); x.quadraticCurveTo(1190, 120, 1230, 230); x.moveTo(820, 30); x.quadraticCurveTo(790, 110, 830, 215); x.moveTo(520, 50); x.quadraticCurveTo(505, 120, 530, 230); });
    const cuff = G.limb([[300, 60], [290, 150], [285, 245]], [44, 46, 44]);
    G.celPart(x, cuff, C.mix(tr, PAL.shirt, 0.22), { lw });
    const sole = G.closedSmooth([[270, 70], [160, 40], [60, 70], [20, 140], [60, 205], [170, 230], [270, 215]]);
    G.celPart(x, sole, C.mix(PAL.skin, PAL.skinShade, 0.35), { lw, shade: rectPath(-50, 160, 400, 100), shadeFill: PAL.skinShade });
    x.save(); x.strokeStyle = C.rgba(PAL.line, 0.5); x.lineWidth = 1.6; x.beginPath();
    for (let k = 0; k < 5; k++) { const yy = 70 + k * 30; x.moveTo(40 + Math.abs(k - 2) * 8, yy); x.quadraticCurveTo(25 + Math.abs(k - 2) * 8, yy + 12, 40 + Math.abs(k - 2) * 8, yy + 22); }
    x.stroke(); x.restore();
    // thighs + knees
    const thighL = G.limb([[0, 330], [200, 560], [420, 860], [640, 1260]], [420, 440, 440, 420]);
    const thighR = G.limb([[1920, 330], [1720, 560], [1500, 860], [1280, 1260]], [420, 440, 440, 420]);
    const kneeL = G.closedSmooth([[-180, 210], [40, 170], [230, 260], [260, 450], [120, 560], [-120, 520], [-220, 380]]);
    const kneeR = G.closedSmooth([[2100, 210], [1880, 170], [1690, 260], [1660, 450], [1800, 560], [2040, 520], [2140, 380]]);
    for (const [th, kn, sx] of [[thighL, kneeL, -1], [thighR, kneeR, 1]]) {
      const u = th.op(kn, require('@napi-rs/canvas').PathOp.Union);
      G.celPart(x, u, tr, { lw, shade: sx < 0 ? rectPath(-300, 520, 760, 900) : rectPath(1640, 360, 700, 1000), shadeFill: trS });
      x.save(); x.clip(u);
      // moonlit crown of the knee (upper-left light)
      x.fillStyle = C.rgba(trL, 0.55); x.filter = 'blur(14px)';
      x.beginPath(); x.ellipse(sx < 0 ? 40 : 1880, 300, 150, 90, sx * 0.3, 0, Math.PI * 2); x.fill(); x.filter = 'none';
      x.restore();
      fold(() => {
        if (sx < 0) { x.moveTo(150, 520); x.quadraticCurveTo(260, 640, 300, 820); x.moveTo(240, 330); x.quadraticCurveTo(300, 420, 280, 520); }
        else { x.moveTo(1770, 520); x.quadraticCurveTo(1660, 640, 1620, 820); x.moveTo(1680, 330); x.quadraticCurveTo(1620, 420, 1640, 520); }
      });
      G.rim(x, u, { rim: MOON, rimAmt: 0.45, side: -1 }, lw);
    }
    // deep shadow in the hollow of her lap, under the sheet
    x.fillStyle = C.rgba(PAL.night0, 0.45); x.filter = 'blur(24px)';
    x.beginPath(); x.ellipse(960, 820, 600, 420, 0, 0, Math.PI * 2); x.fill(); x.filter = 'none';
  }));
}

// Forearm from the wrist back toward the frame bottom; (dx,dy) = direction the fingers point.
function forearm(ctx, wx, wy, dx, dy, HS, light) {
  const L = 95 * HS;
  const pts = [[wx + dx * 2 * HS, wy + dy * 2 * HS], [wx - dx * L * 0.5, wy - dy * L * 0.5], [wx - dx * L, wy - dy * L]];
  const arm = G.limb(pts, [21 * HS, 24 * HS, 27 * HS]);
  G.celPart(ctx, arm, PAL.skin, { lw: 2.4, shade: null });
  ctx.save(); ctx.clip(arm);
  ctx.fillStyle = C.rgba(PAL.skinShade, 0.9);
  ctx.translate(wx, wy); ctx.rotate(Math.atan2(dy, dx));
  ctx.fillRect(-L * 1.2, 4 * HS, L * 1.4, 20 * HS); // underside shade
  ctx.restore();
  G.rim(ctx, arm, light, 2.4);
}

function drawS5(ctx, env, t, info) {
  const T = info ? info.T : 16 + t;
  const tc = C.twos(t);
  const kind = env.vertical ? 'narrow' : 'wide';
  const sh = LAP[kind];
  const k = C.seg(t, 0, 6, C.ease.inOutSine);
  const cam = { cx: 960, cy: 530, zoom: C.lerp(1.0, 1.07, k), vx: 960 };
  camera(ctx, env, cam);
  C.blit(ctx, lapLayer(env), spanFor(env, -200, 2120, 960)[0], -200);

  // the sheet (breathes very slightly with her)
  const breathe = Math.sin(tc * 1.4) * 1.2;
  const handLight = { rim: MOON, rimAmt: 0.4, side: -1 };
  // right-hand smoothing: 16.3 s the flat hand slides across the lower sheet, then rests at the edge (on twos)
  const HS = env.vertical ? 4.6 : 6.0;
  const sm0 = 0.3, sm1 = 0.55, sm2 = 1.1, sm3 = 1.4;
  const RX = sh.x + sh.w + 30, RY = 1060, RA = Math.PI - 0.42;      // resting right wrist
  const A = [sh.x + sh.w * 0.42, 1000, Math.PI - 0.12], Bp = [sh.x + sh.w * 0.9, 1010, Math.PI - 0.26];
  let rx = RX, ry = RY, rang = RA, rpose = 'rest';
  if (tc >= sm0 && tc < sm3) {
    let u, P0, P1;
    if (tc < sm1) { u = C.seg(tc, sm0, sm1, C.ease.inOutSine); P0 = [RX, RY, RA]; P1 = A; }
    else if (tc < sm2) { u = C.seg(tc, sm1, sm2, C.ease.inOutSine); P0 = A; P1 = Bp; }
    else { u = C.seg(tc, sm2, sm3, C.ease.inOutSine); P0 = Bp; P1 = [RX, RY, RA]; }
    rx = C.lerp(P0[0], P1[0], u); ry = C.lerp(P0[1], P1[1], u); rang = C.lerp(P0[2], P1[2], u);
    rpose = tc < sm2 + 0.15 ? 'flat' : 'rest';
  }
  const crease = 1 - C.seg(tc, sm1 + 0.05, sm2, C.ease.inOutSine);

  ctx.save();
  ctx.translate(sh.x, sh.y + breathe); ctx.rotate(sh.rot);
  drawPage(ctx, sh.w, sh.h, { tp: t, env, crease, layout: kind });
  ctx.restore();

  // left hand holds the lower-left edge
  const LX = sh.x - 30, LY = 1060 + breathe, LA = Math.PI + 0.42;
  forearm(ctx, LX, LY, -Math.sin(LA), Math.cos(LA), HS, handLight);
  G.hand(ctx, { x: LX, y: LY, s: HS, ang: LA, pose: 'flat', flip: 1, lw: 2.4, light: handLight });
  forearm(ctx, rx, ry, -Math.sin(rang), Math.cos(rang), HS, handLight);
  G.hand(ctx, { x: rx, y: ry, s: HS, ang: rang, pose: rpose, flip: -1, lw: 2.4, light: handLight });
  // soft cream light from the page falling on her fingers
  C.glow(ctx, sh.x + sh.w / 2, 560, 760, PAL.paper, 0.09, 'soft-light');
  return { post: { grain: 0.55, vignette: 0.4 } };
}

module.exports = {
  S4: { draw: drawS4, vfocus: BANK.girlX },
  S5: { draw: drawS5, vfocus: 960 },
  bankScene, drawFinishedPage, drawPage, alderLeaf, getLayout, BANK, LAP,
};
