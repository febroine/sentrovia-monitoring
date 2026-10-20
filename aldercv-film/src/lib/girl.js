'use strict';
// Mira — the one character. Flat cel (fill + one shade shape + warm line), animated on twos.
// Design: chin-length dark bob with bangs, alder-green hair clip (her right / viewer's left),
// pale sage-blue short-sleeved shirt, indigo trousers rolled at the ankle, bare feet.
//
// Shared head:   head(ctx, o)        eye line at y=0, chin y≈+60, crown y≈-92 (head units)
// Poses:         sitFront(ctx, o)    cross-legged, facing camera, origin = seat on the ground
//                wadeBack(ctx, o)    back view, waist-deep, origin = waterline at her centre
//                bust(ctx, o)        head + shoulders for close-ups, origin = eye line centre
//                hand(ctx, o)        a single hand (for inserts)
// Common options: light = { rim: colour, rimAmt: 0..1, side: -1|1 (rim side), glow: colour|null, glowAmt }
//                 lw = line width in local units (defaults scale-aware)

const C = require('./core');
const { PathOp, DOMMatrix } = require('@napi-rs/canvas');
const PAL = require('./palette');

const LINE = PAL.line;

// ---------------------------------------------------------------- shape helpers
// Ribbon outline around a polyline with per-point widths (smooth-ish).
function limb(pts, widths) {
  const L = [], R = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const w = widths[i] / 2;
    L.push([pts[i][0] - dy * w, pts[i][1] + dx * w]);
    R.push([pts[i][0] + dy * w, pts[i][1] - dx * w]);
  }
  const p = new C.Path2D();
  smoothThrough(p, L, true);
  // rounded end cap: control point pushed past the end along the last segment
  const end = pts[pts.length - 1], prev = pts[pts.length - 2];
  const ex = end[0] - prev[0], ey = end[1] - prev[1], el = Math.hypot(ex, ey) || 1;
  const wEnd = widths[widths.length - 1] / 2, last = R[R.length - 1];
  p.quadraticCurveTo(end[0] + (ex / el) * wEnd * 1.4, end[1] + (ey / el) * wEnd * 1.4, last[0], last[1]);
  smoothThrough(p, R.slice().reverse(), false);
  p.closePath();
  return p;
}
// Catmull-Rom-ish smooth path through points (quadratic midpoints).
function smoothThrough(p, pts, move) {
  if (move) p.moveTo(pts[0][0], pts[0][1]); else p.lineTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
    p.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
  }
  const l = pts[pts.length - 1];
  p.lineTo(l[0], l[1]);
}
function closedSmooth(pts) {
  const p = new C.Path2D();
  const n = pts.length;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m0 = mid(pts[n - 1], pts[0]);
  p.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) { const m = mid(pts[i], pts[(i + 1) % n]); p.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]); }
  p.closePath();
  return p;
}
const D = (d) => new C.Path2D(d);

// Fill + texture + line in one call (character cel style).
function celPart(ctx, p, fill, o = {}) {
  C.cel(ctx, p, fill, { mottle: o.mottle ?? 0.14, seed: o.seed ?? 5 });
  if (o.shade) { ctx.save(); ctx.clip(p); C.cel(ctx, o.shade, o.shadeFill || C.shade(fill, -0.18), { mottle: 0.1 }); ctx.restore(); }
  if (o.line !== false) C.ink(ctx, p, { color: o.lineColor || LINE, width: o.lw ?? 2.2 });
}
// Rim light: a crescent on the lit side = shape minus itself shifted away from the light.
function rim(ctx, p, light, lw, side = 1) {
  if (!light || !light.rimAmt) return;
  const sd = light.side ?? side;
  const d = lw * 2.4;
  const shifted = new C.Path2D(p).transform(new DOMMatrix().translate(sd * -d, d * 0.5));
  const crescent = new C.Path2D(p).op(shifted, PathOp.Difference);
  ctx.save();
  ctx.fillStyle = C.rgba(light.rim || PAL.glow, 0.6 * light.rimAmt);
  ctx.fill(crescent);
  ctx.restore();
}

// ---------------------------------------------------------------- head
// o.eyes: { open 0..1, lookX -1..1, lookY -1..1 (positive = down), closedSmile 0..1 }
// o.mouth: 'neutral' | 'soft' | 'breath'
// o.hairSway: px of sway at the bob ends; o.tilt: radians; o.lw line width
function head(ctx, o = {}) {
  const lw = o.lw ?? 2.2;
  const eyes = { open: 1, lookX: 0, lookY: 0, ...(o.eyes || {}) };
  const sway = o.hairSway ?? 0;
  const light = o.light || {};
  ctx.save();
  if (o.tilt) ctx.rotate(o.tilt);

  // back hair mass (hugs the head, straight sides, ends at the chin with a slight inward turn)
  const back = D(`M -58 -20 C -72 -72 -40 -96 0 -96 C 40 -96 72 -72 58 -20 C 61 10 ${63 + sway} 36 ${64 + sway} 54
    Q ${58 + sway} 63 ${47 + sway * 0.6} 58 L 40 30 L -40 30 L ${-47 + sway * 0.6} 58 Q ${-58 + sway} 63 ${-64 + sway} 54 C -63 36 -61 10 -58 -20 Z`);
  celPart(ctx, back, PAL.hair, { lw, shade: D('M 6 -100 C 46 -96 74 -70 60 -20 C 64 18 70 50 66 66 L 6 66 Z'), shadeFill: C.shade(PAL.hair, -0.25) });
  rim(ctx, back, light, lw);
  // neck
  const neck = D('M -13 36 C -13 56 -15 76 -17 96 L 17 96 C 15 76 13 56 13 36 Z');
  celPart(ctx, neck, PAL.skin, { lw, shade: D('M -20 30 L 20 30 L 20 66 C 8 58 -8 58 -20 66 Z'), shadeFill: PAL.skinShade });
  // face
  const face = D('M -46 -32 C -48 -2 -46 16 -40 29 C -32 43 -16 53 0 57 C 16 53 32 43 40 29 C 46 16 48 -2 46 -32 Q 0 -82 -46 -32 Z');
  celPart(ctx, face, PAL.skin, { lw, shade: D('M -56 -40 L -36 -40 C -40 0 -32 32 -6 58 L -56 58 Z'), shadeFill: C.mix(PAL.skin, PAL.skinShade, 0.6) });
  if (o.glow) { ctx.save(); ctx.clip(face); C.glow(ctx, 0, 30, 110, o.glow, o.glowAmt ?? 0.5, 'soft-light'); ctx.restore(); }
  // blush (hatched)
  ctx.save(); ctx.clip(face);
  ctx.strokeStyle = C.rgba(PAL.blush, 0.45); ctx.lineWidth = lw * 0.45;
  ctx.beginPath();
  for (const sx of [-1, 1]) for (let k = -3; k <= 3; k++) { ctx.moveTo(sx * 27 + k * 3 - 3, 22 + 4); ctx.lineTo(sx * 27 + k * 3 + 3, 22 - 4); }
  ctx.stroke(); ctx.restore();

  // eyes
  for (const sx of [-1, 1]) drawEye(ctx, sx, eyes, lw);
  // brows (partly under bangs)
  ctx.save(); ctx.strokeStyle = PAL.hair; ctx.lineCap = 'round'; ctx.lineWidth = lw * 1.1;
  ctx.beginPath();
  for (const sx of [-1, 1]) { ctx.moveTo(sx * 11, -15 - (o.browLift || 0)); ctx.quadraticCurveTo(sx * 24, -20 - (o.browLift || 0), sx * 37, -16 - (o.browLift || 0) * 0.5); }
  ctx.stroke(); ctx.restore();
  // nose
  ctx.save(); ctx.strokeStyle = C.rgba(LINE, 0.8); ctx.lineWidth = lw * 0.8; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(1, 15); ctx.quadraticCurveTo(4, 21, 0, 23); ctx.stroke();
  ctx.fillStyle = C.rgba(PAL.skinShade, 0.7); ctx.beginPath(); ctx.ellipse(-3, 21, 4, 2.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // mouth
  ctx.save(); ctx.strokeStyle = C.rgba(LINE, 0.85); ctx.lineWidth = lw * 0.9; ctx.lineCap = 'round';
  const m = o.mouth || 'neutral';
  if (m === 'breath') {
    ctx.fillStyle = C.mix(PAL.blush, LINE, 0.45);
    ctx.beginPath(); ctx.ellipse(0, 39, 4.2, 2.8, 0, 0, Math.PI * 2); ctx.fill();
  } else {
    const curve = m === 'soft' ? 2.4 : 0.6;
    ctx.beginPath(); ctx.moveTo(-7, 37); ctx.quadraticCurveTo(0, 37 + curve, 7, 37); ctx.stroke();
    ctx.strokeStyle = C.rgba(PAL.blush, 0.5); ctx.lineWidth = lw * 0.6;
    ctx.beginPath(); ctx.moveTo(-3.5, 41.5); ctx.lineTo(3.5, 41.5); ctx.stroke();
  }
  ctx.restore();

  // side locks + bangs (in front of the face)
  const lockL = D(`M -60 -26 C -58 4 -57 30 ${-56 + sway * 0.5} 56 Q -51 52 -48 44 C -47 34 -44 12 -44 -24 Z`);
  const lockR = D(`M 60 -26 C 58 4 57 30 ${56 + sway * 0.5} 56 Q 51 52 48 44 C 47 34 44 12 44 -24 Z`);
  celPart(ctx, lockL, PAL.hair, { lw });
  celPart(ctx, lockR, PAL.hair, { lw });
  const bangs = D(`M -60 -26 C -64 -84 64 -84 60 -26 L 55 -6 Q 52 -16 47 -20 L 42 -9 Q 37 -20 30 -23 L 25 -11 Q 20 -22 13 -25
    L 7 -12 Q 1 -24 -6 -25 L -11 -14 Q -16 -24 -23 -24 L -29 -10 Q -34 -21 -41 -21 L -47 -7 Q -53 -17 -60 -26 Z`);
  celPart(ctx, bangs, PAL.hair, { lw, shade: D('M 10 -90 C 50 -90 66 -60 62 -30 L 62 0 L 10 0 Z'), shadeFill: C.shade(PAL.hair, -0.25) });
  // hair sheen band
  ctx.save(); ctx.clip(bangs);
  ctx.strokeStyle = C.rgba(PAL.hairLight, 0.75); ctx.lineCap = 'round';
  ctx.lineWidth = lw * 1.6;
  ctx.beginPath(); ctx.moveTo(-36, -60); ctx.quadraticCurveTo(-18, -66, -2, -63); ctx.moveTo(8, -63); ctx.quadraticCurveTo(18, -64, 26, -60); ctx.stroke();
  ctx.strokeStyle = C.rgba(PAL.hairLight, 0.35); ctx.lineWidth = lw * 0.6;
  ctx.beginPath(); for (const k of [-3.2, -1.4, 0.6, 2.3]) { ctx.moveTo(k * 12, -56); ctx.quadraticCurveTo(k * 13, -40, k * 14 + 2, -26); } ctx.stroke();
  ctx.restore();
  // alder-green hair clip (her right = viewer's left)
  ctx.save();
  ctx.translate(-38, -38); ctx.rotate(-0.55);
  const clip = D('M -14 -3.5 L 14 -3.5 Q 17 0 14 3.5 L -14 3.5 Q -17 0 -14 -3.5 Z');
  celPart(ctx, clip, PAL.alder, { lw: lw * 0.8, lineColor: PAL.alderDeep });
  ctx.fillStyle = C.rgba(PAL.alderLight, 0.9); ctx.fillRect(-10, -2.2, 12, 1.4);
  ctx.restore();
  ctx.restore();
}

function drawEye(ctx, sx, e, lw) {
  const open = C.clamp(e.open);
  const cx = sx * 21;
  ctx.save();
  if (open < 0.12) {
    // closed: soft downward arc + lashes
    ctx.strokeStyle = PAL.hair; ctx.lineWidth = lw * 1.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx - sx * 13, 1); ctx.quadraticCurveTo(cx, 6 + (e.closedSmile || 0) * -8, cx + sx * 14, 0); ctx.stroke();
    ctx.lineWidth = lw * 0.8; ctx.beginPath(); ctx.moveTo(cx + sx * 13, 0.5); ctx.lineTo(cx + sx * 17, -1.5); ctx.stroke();
    ctx.restore();
    return;
  }
  const top = -8 * open + 1, bot = 7;
  const lidDrop = Math.max(0, e.lookY) * 3; // looking down lowers the upper lid
  const white = new C.Path2D();
  white.moveTo(cx - sx * 13, 2);
  white.bezierCurveTo(cx - sx * 8, top - 2 + lidDrop, cx + sx * 8, top - 3 + lidDrop, cx + sx * 15, -1);
  white.bezierCurveTo(cx + sx * 10, bot, cx - sx * 6, bot + 1, cx - sx * 13, 2);
  white.closePath();
  ctx.fillStyle = '#f3ede4'; ctx.fill(white);
  ctx.save(); ctx.clip(white);
  // lid shadow on the white
  ctx.fillStyle = C.rgba('#a99bb0', 0.55); ctx.beginPath(); ctx.ellipse(cx, top - 1 + lidDrop, 18, 5, 0, 0, Math.PI * 2); ctx.fill();
  // iris
  const ix = cx + (e.lookX || 0) * 5, iy = 1.5 + (e.lookY || 0) * 3.2;
  const g = ctx.createRadialGradient(ix, iy + 2, 1, ix, iy, 8.2);
  g.addColorStop(0, '#3a2318'); g.addColorStop(0.45, PAL.iris); g.addColorStop(0.8, PAL.irisRing); g.addColorStop(1, '#3a2318');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ix, iy, 8.2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = C.rgba('#2a1810', 0.8); ctx.lineWidth = lw * 0.5; ctx.stroke();
  ctx.fillStyle = '#1c1210'; ctx.beginPath(); ctx.arc(ix, iy, 3.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.rgba('#2a1f24', 0.5); ctx.fillRect(ix - 10, top - 4 + lidDrop, 20, 4.5); // upper iris under lid shade
  ctx.fillStyle = '#fbf6ea'; ctx.beginPath(); ctx.arc(ix + 3, iy - 3, 1.9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.rgba('#fbf6ea', 0.6); ctx.beginPath(); ctx.arc(ix - 2.5, iy + 3.5, 0.9, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // upper lash line (thick, flicked at outer corner) and lower lid
  ctx.strokeStyle = PAL.hair; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.lineWidth = lw * 1.6;
  ctx.beginPath(); ctx.moveTo(cx - sx * 13, 2.5);
  ctx.bezierCurveTo(cx - sx * 8, top - 2 + lidDrop, cx + sx * 8, top - 3 + lidDrop, cx + sx * 15, -1);
  ctx.lineTo(cx + sx * 18, -3); ctx.stroke();
  ctx.strokeStyle = C.rgba(LINE, 0.6); ctx.lineWidth = lw * 0.6;
  ctx.beginPath(); ctx.moveTo(cx - sx * 9, 5.5); ctx.quadraticCurveTo(cx + sx * 2, bot + 1.5, cx + sx * 12, 3.5); ctx.stroke();
  // crease
  ctx.strokeStyle = C.rgba(LINE, 0.35); ctx.lineWidth = lw * 0.5;
  ctx.beginPath(); ctx.moveTo(cx - sx * 9, top - 5 + lidDrop * 0.5); ctx.quadraticCurveTo(cx + sx * 3, top - 8 + lidDrop * 0.5, cx + sx * 13, -5); ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- hands
// pose: 'rest' (relaxed), 'grip' (holding an edge), 'flat' (smoothing paper), 'open' (letting go)
// Origin = wrist; hand points along +y (rotate with ang). Built as a union of palm + finger capsules.
const HAND_POSES = {
  rest: { spread: 0.10, len: [15, 18, 17, 13], curl: 0.35, thumb: [-0.9, 0.55, 14] },
  grip: { spread: 0.04, len: [9, 10, 10, 8], curl: 0.9, thumb: [-0.2, 1, 15] },
  flat: { spread: 0.05, len: [17, 20, 19, 15], curl: 0, thumb: [-0.75, 0.65, 16] },
  open: { spread: 0.28, len: [17, 20, 19, 15], curl: 0.1, thumb: [-1, 0.25, 16] },
};
const handCache = new Map();
function handPath(pose) {
  if (handCache.has(pose)) return handCache.get(pose);
  const P = HAND_POSES[pose] || HAND_POSES.rest;
  let u = closedSmooth([[-10, -2], [-13, 12], [-12, 27], [0, 30], [12, 28], [13, 12], [10, -2]]);
  const bases = [-9, -3, 3, 9];
  const ribs = [];
  bases.forEach((bx, i) => {
    const a = (i - 1.5) * P.spread;
    const L = P.len[i];
    const mid = [bx + Math.sin(a) * L * 0.5, 27 + Math.cos(a) * L * 0.5];
    const tip = [bx + Math.sin(a) * L + P.curl * -2, 27 + Math.cos(a) * L - P.curl * 4];
    u = u.op(limb([[bx, 22], mid, tip], [7.4, 6.6, 5.6]), PathOp.Union);
    ribs.push([bx, 27, mid[0], mid[1]]);
  });
  const [tx, ty, tl] = P.thumb;
  u = u.op(limb([[-9, 6], [-9 + tx * tl * 0.5, 6 + ty * tl * 0.5], [-9 + tx * tl, 6 + ty * tl]], [9, 7.5, 6.4]), PathOp.Union);
  const out = { path: u, ribs };
  handCache.set(pose, out);
  return out;
}
function hand(ctx, o = {}) {
  const { x = 0, y = 0, s = 1, ang = 0, pose = 'rest', flip = 1, lw = 2.2, light } = o;
  ctx.save();
  ctx.translate(x, y); ctx.rotate(ang); ctx.scale(s * flip, s);
  const { path, ribs } = handPath(pose);
  celPart(ctx, path, PAL.skin, { lw: lw / s, shade: D('M 2 -5 L 20 -5 L 20 60 L 2 60 Z'), shadeFill: C.mix(PAL.skin, PAL.skinShade, 0.6) });
  ctx.strokeStyle = C.rgba(LINE, 0.45); ctx.lineWidth = (lw / s) * 0.6; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < ribs.length - 1; i++) { const [a1, b1] = ribs[i], [a2, b2] = ribs[i + 1]; ctx.moveTo((a1 + a2) / 2, b1 + 1); ctx.lineTo((ribs[i][2] + ribs[i + 1][2]) / 2, (ribs[i][3] + ribs[i + 1][3]) / 2); }
  ctx.stroke();
  if (light) rim(ctx, path, light, lw / s);
  ctx.restore();
}

// ---------------------------------------------------------------- sitting, cross-legged, facing camera
// o: { breath 0..1 (exhale drops shoulders), eyes, mouth, hands: 'knees'|'lap'|'page'|'release',
//      headTilt, lookUp 0..1 (head lifts, eyes up), light, sway }
function sitFront(ctx, o = {}) {
  const lw = o.lw ?? 2.4;
  const br = o.breath ?? 0;
  const lookUp = o.lookUp ?? 0;
  const light = o.light || {};
  const shY = br * 7; // shoulders drop on exhale
  ctx.save();
  // ---- legs (trousers): two thighs out to rounded knees, shins crossing in front, bare feet
  const tShade = PAL.trousersShade;
  const thighL = limb([[-40, -84], [-110, -78], [-178, -56]], [96, 84, 72]);
  const thighR = limb([[40, -84], [110, -78], [178, -56]], [96, 84, 72]);
  const kneeL = D('M -150 -92 C -200 -96 -226 -66 -218 -40 C -210 -18 -180 -14 -160 -24 Z');
  const kneeR = D('M 150 -92 C 200 -96 226 -66 218 -40 C 210 -18 180 -14 160 -24 Z');
  for (const [th, kn, sx] of [[thighL, kneeL, -1], [thighR, kneeR, 1]]) {
    const u = th.op(kn, PathOp.Union);
    celPart(ctx, u, PAL.trousers, { lw, shade: D(`M ${sx * 30} -30 C ${sx * 120} -44 ${sx * 200} -40 ${sx * 240} -50 L ${sx * 240} 10 L ${sx * 30} 10 Z`), shadeFill: tShade });
    ctx.save(); ctx.clip(u); ctx.strokeStyle = C.rgba(C.shade(PAL.trousers, 0.25), 0.8); ctx.lineWidth = lw; ctx.beginPath();
    ctx.moveTo(sx * 60, -118); ctx.quadraticCurveTo(sx * 130, -112, sx * 196, -88); ctx.stroke(); ctx.restore();
    rim(ctx, u, light, lw);
  }
  // back foot: toes peeking out under the right knee
  const footB = D('M 96 -30 C 120 -38 150 -34 162 -22 C 168 -12 158 -4 142 -4 C 122 -4 104 -8 96 -14 Z');
  celPart(ctx, footB, PAL.skin, { lw, shade: D('M 80 -22 L 170 -22 L 170 0 L 80 0 Z'), shadeFill: PAL.skinShade });
  // back shin (left knee -> under the right thigh)
  const shinB = limb([[-188, -30], [-90, -18], [10, -12], [104, -18]], [58, 54, 48, 42]);
  celPart(ctx, shinB, C.shade(PAL.trousers, -0.06), { lw, shade: D('M -220 -14 L 140 -14 L 140 30 L -220 30 Z'), shadeFill: tShade });
  // front shin (right knee -> resting on top, toward the left)
  const shinF = limb([[188, -44], [96, -40], [0, -36], [-84, -42]], [60, 56, 50, 44]);
  celPart(ctx, shinF, PAL.trousers, { lw, shade: D('M -120 -30 L 220 -30 L 220 10 L -120 10 Z'), shadeFill: tShade });
  ctx.save(); ctx.clip(shinF); ctx.strokeStyle = C.rgba(tShade, 0.9); ctx.lineWidth = lw * 0.8; ctx.beginPath();
  ctx.moveTo(150, -64); ctx.quadraticCurveTo(130, -50, 140, -24); ctx.moveTo(40, -62); ctx.quadraticCurveTo(30, -46, 38, -20); ctx.stroke(); ctx.restore();
  // rolled cuff + front foot (sole turned up, resting on the back shin)
  ctx.save(); ctx.translate(-84, -42); ctx.rotate(0.06);
  celPart(ctx, D('M -6 -24 L 12 -24 L 12 22 L -6 22 Z'), C.mix(PAL.trousers, PAL.shirt, 0.25), { lw });
  ctx.restore();
  const footF = D('M -88 -60 C -112 -66 -142 -60 -156 -46 C -166 -34 -158 -20 -140 -20 C -120 -20 -102 -26 -88 -30 Z');
  celPart(ctx, footF, PAL.skin, { lw, shade: D('M -170 -40 L -80 -40 L -80 -10 L -170 -10 Z'), shadeFill: PAL.skinShade });
  ctx.save(); ctx.strokeStyle = C.rgba(LINE, 0.5); ctx.lineWidth = lw * 0.6; ctx.beginPath();
  for (let k = 0; k < 4; k++) { ctx.moveTo(-152 + k * 4, -50 + k * 4); ctx.lineTo(-146 + k * 4, -48 + k * 4); }
  ctx.stroke(); ctx.restore();

  // ---- torso (shirt)
  const torso = D(`M -92 ${-296 + shY} C -108 ${-288 + shY} -108 -250 -98 -200 C -88 -160 -80 -130 -84 -98 C -86 -80 -62 -72 0 -72
    C 62 -72 86 -80 84 -98 C 80 -130 88 -160 98 -200 C 108 -250 108 ${-288 + shY} 92 ${-296 + shY} C 60 ${-314 + shY} 30 ${-320 + shY} 0 ${-320 + shY}
    C -30 ${-320 + shY} -60 ${-314 + shY} -92 ${-296 + shY} Z`);
  celPart(ctx, torso, PAL.shirt, { lw, shade: D(`M -110 -330 L -30 -330 C -40 -260 -44 -160 -20 -78 L -110 -78 Z`), shadeFill: PAL.shirtShade });
  // shirt details: placket, pocket, folds
  ctx.save(); ctx.clip(torso);
  ctx.strokeStyle = C.rgba(PAL.shirtShade, 0.9); ctx.lineWidth = lw * 0.8; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(4, -300 + shY); ctx.lineTo(2, -80);
  ctx.moveTo(30, -236); ctx.lineTo(58, -238); ctx.lineTo(58, -206); ctx.lineTo(30, -204); ctx.closePath();
  ctx.moveTo(-60, -140); ctx.quadraticCurveTo(-30, -120, -10, -96);
  ctx.moveTo(50, -150); ctx.quadraticCurveTo(30, -118, 20, -92);
  ctx.stroke();
  ctx.fillStyle = C.rgba('#eef2f2', 0.85);
  for (const by of [-268, -228, -188, -148, -108]) { ctx.beginPath(); ctx.arc(3, by + (by < -250 ? shY : 0), 2.6, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  rim(ctx, torso, light, lw);

  // ---- arms
  const handsMode = o.hands || 'knees';
  const sh = [[-84, -288 + shY], [84, -288 + shY]];
  let armPts;
  if (handsMode === 'lap' || handsMode === 'page') {
    armPts = [
      [[-94, -280 + shY], [-122, -200], [-104, -126], [-52, -100]],
      [[94, -280 + shY], [122, -200], [104, -126], [52, -100]],
    ];
  } else if (handsMode === 'release') {
    const k = o.releaseK ?? 0; // arms lift slightly, palms open, as the page rises
    armPts = [
      [[-94, -280 + shY], [-122, -206], [-106 + k * 10, -150 - k * 30], [-64 + k * 10, -128 - k * 60]],
      [[94, -280 + shY], [122, -206], [106 - k * 10, -150 - k * 30], [64 - k * 10, -128 - k * 60]],
    ];
  } else { // knees
    armPts = [
      [[-94, -280 + shY], [-124, -200], [-150, -130], [-172, -84]],
      [[94, -280 + shY], [124, -200], [150, -130], [172, -84]],
    ];
  }
  for (let i = 0; i < 2; i++) {
    const pts = armPts[i];
    const arm = limb(pts.slice(1), [36, 31, 27]);
    celPart(ctx, arm, PAL.skin, { lw, shade: i === 0 ? D('M -200 -260 L -100 -260 L -100 -60 L -200 -60 Z') : null, shadeFill: PAL.skinShade });
    rim(ctx, arm, light, lw);
    // sleeve
    const sx = i === 0 ? -1 : 1;
    const sleeve = D(`M ${sx * 80} ${-302 + shY} C ${sx * 112} ${-298 + shY} ${sx * 136} -260 ${sx * 140} -220 L ${sx * 100} -204 C ${sx * 96} -240 ${sx * 88} -270 ${sx * 80} ${-302 + shY} Z`);
    celPart(ctx, sleeve, PAL.shirt, { lw, shade: i === 0 ? D('M -200 -330 L 0 -330 L 0 -180 L -200 -180 Z') : null, shadeFill: PAL.shirtShade });
    const end = pts[pts.length - 1], prev = pts[pts.length - 2];
    const ang = Math.atan2(end[0] - prev[0], -(end[1] - prev[1])) + Math.PI;
    const pose = handsMode === 'knees' ? 'rest' : handsMode === 'page' ? 'flat' : handsMode === 'release' ? 'open' : 'rest';
    hand(ctx, { x: end[0], y: end[1], s: 1.15, ang: -ang, pose, flip: sx, lw, light });
  }
  // ---- collar + head
  const collar = D(`M -30 ${-322 + shY} L -4 ${-270 + shY} L -22 ${-258 + shY} L -46 ${-306 + shY} Z M 30 ${-322 + shY} L 4 ${-270 + shY} L 22 ${-258 + shY} L 46 ${-306 + shY} Z`);
  ctx.save();
  ctx.translate(0, -392 + shY * 0.8 - lookUp * 4);
  ctx.scale(0.9, 0.9);
  head(ctx, { lw, eyes: o.eyes, mouth: o.mouth, light, tilt: (o.headTilt || 0) - lookUp * 0.05, hairSway: o.sway || 0, glow: o.glow, glowAmt: o.glowAmt, browLift: lookUp * 2 });
  ctx.restore();
  celPart(ctx, collar, C.shade(PAL.shirt, 0.15), { lw });
  ctx.restore();
}

// ---------------------------------------------------------------- bust (close-ups)
// o: same head options + shoulders. Origin = eye line centre.
function bust(ctx, o = {}) {
  const lw = o.lw ?? 1.6;
  const light = o.light || {};
  ctx.save();
  const body = D('M -196 320 L -194 196 C -188 146 -152 124 -104 112 C -62 102 -30 92 -18 70 L 18 70 C 30 92 62 102 104 112 C 152 124 188 146 194 196 L 196 320 Z');
  celPart(ctx, body, PAL.shirt, { lw, shade: D('M -160 120 L -30 120 L -10 270 L -160 270 Z'), shadeFill: PAL.shirtShade });
  rim(ctx, body, light, lw);
  if (o.glow) { ctx.save(); ctx.clip(body); C.glow(ctx, 0, 220, 200, o.glow, (o.glowAmt ?? 0.5) * 0.8, 'soft-light'); ctx.restore(); }
  head(ctx, { ...o, lw });
  const collar = D('M -22 70 L -2 124 L -20 136 L -46 94 Z M 22 70 L 2 124 L 20 136 L 46 94 Z');
  celPart(ctx, collar, C.shade(PAL.shirt, 0.15), { lw });
  ctx.restore();
}

// ---------------------------------------------------------------- wading, back view
// Origin = waterline at her centre. o.push 0..1 arm cycle phase (use on twos), o.lean radians.
function wadeBack(ctx, o = {}) {
  const lw = o.lw ?? 2.4;
  const push = o.push ?? 0;
  const light = o.light || {};
  ctx.save();
  ctx.rotate(o.lean ?? -0.06);
  const a = Math.sin(push * Math.PI * 2);
  // arms (behind torso edges), forearms out, pushing pages aside
  for (const sx of [-1, 1]) {
    const k = sx === -1 ? a : -a;
    const pts = [[sx * 74, -196], [sx * (112 + k * 8), -140 - k * 6], [sx * (150 + k * 12), -86 - k * 12], [sx * (170 + k * 14), -44 - k * 10]];
    const arm = limb(pts, [36, 33, 29, 26]);
    celPart(ctx, arm, PAL.skin, { lw, shade: D(`M ${sx * 60} -220 L ${sx * 260} -220 L ${sx * 260} 0 L ${sx * 140} 0 Z`), shadeFill: PAL.skinShade });
    rim(ctx, arm, light, lw);
    hand(ctx, { x: pts[3][0], y: pts[3][1], s: 1.1, ang: sx * -0.5, pose: 'rest', flip: sx, lw, light });
  }
  // torso back (wet shirt darker near the water)
  const torso = D('M -78 -212 C -96 -200 -98 -160 -92 -120 C -88 -70 -84 -30 -86 6 L 86 6 C 84 -30 88 -70 92 -120 C 98 -160 96 -200 78 -212 C 50 -226 -50 -226 -78 -212 Z');
  celPart(ctx, torso, PAL.shirt, { lw, shade: D('M -110 -240 L -20 -240 L -30 10 L -110 10 Z'), shadeFill: PAL.shirtShade });
  ctx.save(); ctx.clip(torso);
  const wg = ctx.createLinearGradient(0, -70, 0, 6);
  wg.addColorStop(0, C.rgba(PAL.night1, 0)); wg.addColorStop(1, C.rgba(PAL.night1, 0.65));
  ctx.fillStyle = wg; ctx.fillRect(-120, -80, 240, 90);
  ctx.strokeStyle = C.rgba(PAL.shirtShade, 0.9); ctx.lineWidth = lw * 0.8;
  ctx.beginPath(); ctx.moveTo(-40, -200); ctx.quadraticCurveTo(-20, -150, -30, -90); ctx.moveTo(44, -196); ctx.quadraticCurveTo(26, -140, 36, -80); ctx.stroke();
  ctx.restore();
  rim(ctx, torso, light, lw);
  // neck + hair (back view of the bob)
  const neck = D('M -16 -236 L -16 -206 L 16 -206 L 16 -236 Z');
  celPart(ctx, neck, PAL.skinShade, { lw });
  ctx.save(); ctx.translate(0, -300);
  const hairB = D('M -64 -6 C -84 -62 -46 -92 0 -92 C 46 -92 84 -62 64 -6 C 68 22 74 44 70 58 Q 50 68 30 60 Q 0 70 -30 60 Q -50 68 -70 58 C -74 44 -68 22 -64 -6 Z');
  celPart(ctx, hairB, PAL.hair, { lw, shade: D('M 0 -100 L 90 -100 L 90 80 L 0 80 Z'), shadeFill: C.shade(PAL.hair, -0.25) });
  ctx.save(); ctx.clip(hairB);
  ctx.strokeStyle = C.rgba(PAL.hairLight, 0.8); ctx.lineWidth = lw * 2;
  ctx.beginPath(); ctx.moveTo(-44, -54); ctx.quadraticCurveTo(-6, -70, 30, -58); ctx.stroke();
  ctx.strokeStyle = C.rgba(PAL.hairLight, 0.45); ctx.lineWidth = lw * 0.8;
  ctx.beginPath(); for (let k = -5; k <= 5; k++) { ctx.moveTo(k * 9, -80); ctx.quadraticCurveTo(k * 12, -20, k * 13, 60); } ctx.stroke();
  ctx.restore();
  rim(ctx, hairB, light, lw);
  ctx.save(); ctx.translate(-50, -30); ctx.rotate(-1.1);
  const clip = D('M -12 -3 L 12 -3 Q 15 0 12 3 L -12 3 Q -15 0 -12 -3 Z');
  celPart(ctx, clip, PAL.alder, { lw: lw * 0.8, lineColor: PAL.alderDeep });
  ctx.restore();
  ctx.restore();
  ctx.restore();
}

module.exports = { head, sitFront, bust, wadeBack, hand, limb, closedSmooth, celPart, rim, drawEye };
