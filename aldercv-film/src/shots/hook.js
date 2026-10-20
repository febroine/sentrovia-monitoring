'use strict';
// Hook chapter — S1 (0–60): extreme close-up of Mira's left eye, a rejection email reflected in the iris,
// three red pulses, a blink that is the cut.  S8 (870–900): cut to black, then the same eye, calm, with the
// green-lit aldercv.com page reflected — framed exactly like S1 frame 0 so the loop seam reads as one eye.
//
// One painter, drawEye(ctx, env, state), serves both shots:
//   state = { pulse 0..1, pupil 0..1 (contraction), blink 0..1, lidRelax 0..1, palette: 'red'|'calm', reflection: 'email'|'cv' }
// Everything static (skin, brow, globe + iris, bangs, light maps, warped reflections) is baked once per env.

const C = require('../lib/core');
const PAL = require('../lib/palette');
const { camera, identity } = require('../lib/stage');

// ---------------------------------------------------------------- geometry (world px, 1920x1080)
const CAM = { cx: 960, cy: 560, vx: 960 };
const IRIS = { x: 960, y: 575, rx: 318, ry: 336 };
const SPEC = { x: 1168, y: 392, r: 20 };          // the single specular dot
// eyelid curves: cubic béziers [p0, c1, c2, p3], inner corner (viewer's left) -> outer corner
const UP_OPEN = [[318, 626], [560, 262], [1250, 148], [1662, 520]];
const UP_RELAX = [[318, 630], [560, 330], [1250, 222], [1662, 530]];
const LO_OPEN = [[318, 626], [600, 898], [1300, 872], [1662, 520]];
const SHUT = [[318, 640], [640, 792], [1270, 784], [1662, 548]];
const CREASE = [[372, 520], [600, 150], [1270, 40], [1720, 430]];
const FLICK_OPEN = [92, -58], FLICK_SHUT = [84, -6];
const CUES = [0.15, 0.85, 1.55];                     // notification blips (s), shotlist S1

// ---------------------------------------------------------------- small helpers
const lerp2 = (a, b, k) => [C.lerp(a[0], b[0], k), C.lerp(a[1], b[1], k)];
const lerpBez = (A, B, k) => A.map((p, i) => lerp2(p, B[i], k));
function bez(B, t) {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [a * B[0][0] + b * B[1][0] + c * B[2][0] + d * B[3][0], a * B[0][1] + b * B[1][1] + c * B[2][1] + d * B[3][1]];
}
function sample(B, n, t0 = 0, t1 = 1) {
  const out = [];
  for (let i = 0; i <= n; i++) out.push(bez(B, C.lerp(t0, t1, i / n)));
  return out;
}
// tangent + "up" normal (for a left->right curve, n points up / away from the eyeball for the upper lid)
function frames(pts) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    return { p, t: [dx, dy], n: [dy, -dx] };
  });
}
function poly(pts, close = true) {
  const p = new C.Path2D();
  pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  if (close) p.closePath();
  return p;
}
function strokePts(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
}
const offsetPts = (pts, dx, dy) => pts.map(([x, y]) => [x + dx, y + dy]);
function rectPath(x, y, w, h) { const p = new C.Path2D(); p.rect(x, y, w, h); return p; }
// Tapered strand (hair / lash): base centre b, tip t, control c, base width w.
function strand(path, b, c, t, w) {
  let dx = t[0] - b[0], dy = t[1] - b[1];
  const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
  const px = -dy * w / 2, py = dx * w / 2;
  path.moveTo(b[0] + px, b[1] + py);
  path.quadraticCurveTo(c[0] + px * 0.45, c[1] + py * 0.45, t[0], t[1]);
  path.quadraticCurveTo(c[0] - px * 0.45, c[1] - py * 0.45, b[0] - px, b[1] - py);
  path.closePath();
}
// Area a cached world layer must cover: full over-draw in landscape, the ~607 px strip (+margin) in vertical.
function area(env) {
  return env.vertical ? { x0: 560, x1: 1360, y0: -160, y1: 1240 } : { x0: -160, x1: 2080, y0: -160, y1: 1240 };
}
function worldLayer(env, key, draw) {
  return env.once('hook:' + key, () => {
    const A = area(env);
    const lay = C.layer(A.x1 - A.x0, A.y1 - A.y0, env.res, (x) => { x.translate(-A.x0, -A.y0); draw(x, A); });
    lay.ox = A.x0; lay.oy = A.y0;
    return lay;
  });
}
const blitL = (ctx, lay, a = 1) => C.blit(ctx, lay, lay.ox, lay.oy, a);

// Short pencil hatching strokes inside the current clip, weighted by w(x,y) in [0,1]. Batched in 3 alpha buckets.
function hatchField(x, box, o) {
  const { angle = 35, spacing = 9, len = [18, 44], color = PAL.line, alpha = 0.22, width = 1.6, seed = 7, w = () => 1 } = o;
  const r = C.rng(seed);
  const a = (angle * Math.PI) / 180, dx = Math.cos(a), dy = -Math.sin(a);
  const buckets = [new C.Path2D(), new C.Path2D(), new C.Path2D()];
  for (let yy = box.y0; yy < box.y1; yy += spacing * 0.5) {
    for (let xx = box.x0 + r() * spacing; xx < box.x1; xx += spacing * (0.8 + r() * 0.8)) {
      const px = xx + (r() - 0.5) * 6, py = yy + (r() - 0.5) * 6;
      const k = w(px, py) - r() * 0.35;
      if (k <= 0) continue;
      const L = C.lerp(len[0], len[1], r());
      const bi = k > 0.55 ? 2 : k > 0.25 ? 1 : 0;
      buckets[bi].moveTo(px - dx * L / 2, py - dy * L / 2);
      buckets[bi].lineTo(px + dx * L / 2 + (r() - 0.5) * 2, py + dy * L / 2 + (r() - 0.5) * 2);
    }
  }
  x.save();
  x.strokeStyle = color; x.lineCap = 'round'; x.lineWidth = width;
  [0.35, 0.65, 1].forEach((m, i) => { x.globalAlpha = alpha * m; x.stroke(buckets[i]); });
  x.restore();
}

// ---------------------------------------------------------------- baked: skin, brow, lid crease, under-eye
function skinLayer(env) {
  return worldLayer(env, 'skin', (x, A) => {
    const full = rectPath(A.x0, A.y0, A.x1 - A.x0, A.y1 - A.y0);
    C.paint(x, full, { fill: PAL.skin, mottle: 0.2, mottleScale: 2.2, hatch: 0.035, hatchColor: PAL.line, hatchScale: 1.6, seed: 4 });
    const up = sample(UP_OPEN, 40), lo = sample(LO_OPEN, 40), cr = sample(CREASE, 40);
    // soft painterly modelling (blurred, baked)
    x.save();
    x.filter = 'blur(46px)';
    x.fillStyle = C.rgba(PAL.skinShade, 0.55);              // orbital hollow under the brow, deepest at the inner corner
    x.fill(poly([...offsetPts(cr, 0, -30), [1500, -40], [200, -40], [120, 520]]));
    x.fillStyle = C.rgba(PAL.skinShade, 0.75);              // side of the nose (viewer's left)
    x.fillRect(-300, -100, 400, 1400);
    x.fillStyle = C.rgba(PAL.skinShade, 0.45);              // temple (viewer's right)
    x.beginPath(); x.ellipse(1880, 380, 170, 420, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = C.rgba(PAL.skinShade, 0.6);               // under-eye
    x.fill(poly([...offsetPts(lo, 0, 30).slice(6, 38), ...offsetPts(lo, 30, 150).slice(10, 34).reverse()]));
    x.fillStyle = C.rgba(C.shade(PAL.skin, 0.35), 0.7);     // lid dome catches light
    x.beginPath(); x.ellipse(1040, 210, 330, 70, -0.18, 0, Math.PI * 2); x.fill();
    x.fillStyle = C.rgba(C.shade(PAL.skin, 0.3), 0.6);      // cheekbone
    x.beginPath(); x.ellipse(1260, 1080, 520, 120, -0.08, 0, Math.PI * 2); x.fill();
    x.filter = 'none';
    x.restore();
    // lid surface where the shut lid will be (seen during the blink): soft fold shade above the shut line
    x.save();
    x.filter = 'blur(18px)';
    x.strokeStyle = C.rgba(PAL.skinShade, 0.55); x.lineWidth = 40;
    strokePts(x, offsetPts(sample(SHUT, 30), 0, -10));
    x.filter = 'none';
    x.restore();
    // cel shade shapes (hard-edged, one shade)
    const foldShade = poly([...cr.slice(4, 38), ...offsetPts(cr, 6, 34).slice(4, 38).reverse()]);
    C.cel(x, foldShade, C.mix(PAL.skin, PAL.skinShade, 0.75), { mottle: 0.12 });
    const underShade = poly([...offsetPts(lo, 0, 6).slice(8, 37), ...offsetPts(lo, 18, 46).slice(12, 35).reverse()]);
    C.cel(x, underShade, C.mix(PAL.skin, PAL.skinShade, 0.6), { mottle: 0.12 });
    // pencil hatching: lid crease band and under-eye
    x.save();
    x.clip(poly([...offsetPts(cr, 0, -26).slice(3, 39), ...offsetPts(cr, 10, 64).slice(3, 39).reverse()]));
    hatchField(x, { x0: 300, x1: 1760, y0: 20, y1: 520 }, {
      angle: 32, spacing: 10, alpha: 0.26, seed: 21,
      w: (px) => C.smooth(C.invLerp(380, 800, px)) * (1 - C.smooth(C.invLerp(1450, 1720, px))) * 0.9 + 0.1,
    });
    x.restore();
    x.save();
    x.clip(poly([...offsetPts(lo, 0, 24).slice(6, 38), ...offsetPts(lo, 24, 170).slice(8, 36).reverse()]));
    hatchField(x, { x0: 360, x1: 1700, y0: 560, y1: 1100 }, {
      angle: 38, spacing: 11, alpha: 0.24, seed: 23,
      w: (px, py) => {
        const yl = bez(LO_OPEN, C.clamp((px - 318) / 1344))[1];
        return (1 - C.smooth(C.invLerp(30, 150, py - yl))) * C.smooth(C.invLerp(420, 760, px)) * (1 - C.smooth(C.invLerp(1380, 1640, px)));
      },
    });
    x.restore();
    // lines: crease (warm line, thicker toward the outer corner), under-eye bag line
    const creaseLine = sample(CREASE, 40, 0.18, 0.96);
    x.save(); x.lineCap = 'round'; x.lineJoin = 'round';
    x.strokeStyle = C.rgba(PAL.line, 0.75); x.lineWidth = 4.5; strokePts(x, creaseLine.slice(8));
    x.strokeStyle = C.rgba(PAL.line, 0.45); x.lineWidth = 3; strokePts(x, creaseLine.slice(0, 12));
    x.strokeStyle = C.rgba(PAL.line, 0.3); x.lineWidth = 2.6; strokePts(x, offsetPts(sample(LO_OPEN, 30, 0.42, 0.78), 0, 74));
    x.restore();
    // blush hatching on the cheek (her design: hatched blush)
    x.save();
    x.strokeStyle = C.rgba(PAL.blush, 0.55); x.lineWidth = 3.2; x.lineCap = 'round';
    x.beginPath();
    for (let k = 0; k < 13; k++) { const bx = 1180 + k * 26; x.moveTo(bx - 14, 1068); x.lineTo(bx + 14, 1012); }
    x.stroke(); x.restore();
    // brow (dark aubergine-black), partly off the top edge
    const browLo = sample([[150, 196], [520, 70], [1150, 20], [1640, 150]], 30);
    const browHi = sample([[180, 120], [520, -20], [1150, -70], [1600, 90]], 30);
    const brow = poly([...browLo, [1680, 168], ...browHi.reverse()]);
    C.cel(x, brow, PAL.hair, { mottle: 0.1 });
    x.save(); x.clip(brow);
    const rb = C.rng(31);
    x.strokeStyle = C.rgba(PAL.hairLight, 0.55); x.lineWidth = 3; x.lineCap = 'round';
    x.beginPath();
    for (let k = 0; k < 120; k++) {
      const s = rb(); const p = bez([[150, 196], [520, 70], [1150, 20], [1640, 150]], s);
      const L = 40 + rb() * 60, ang = -0.5 + s * 0.65;
      x.moveTo(p[0], p[1] - rb() * 70); x.lineTo(p[0] + Math.cos(ang) * L, p[1] - rb() * 70 + Math.sin(ang) * L);
    }
    x.stroke(); x.restore();
    // stray brow hairs below the edge
    x.save(); x.strokeStyle = PAL.hair; x.lineWidth = 2.6; x.lineCap = 'round'; x.beginPath();
    for (let k = 0; k < 40; k++) {
      const s = 0.05 + rb() * 0.9; const p = bez([[150, 196], [520, 70], [1150, 20], [1640, 150]], s);
      x.moveTo(p[0], p[1] - 4); x.lineTo(p[0] + 18 + rb() * 18, p[1] + 6 + rb() * 10);
    }
    x.stroke(); x.restore();
    C.ink(x, poly(browLo, false), { color: PAL.line, width: 3, alpha: 0.6 });
  });
}

// right edge: face contour, painterly sky between the strands of the side lock (per palette)
function edgeLayer(env, palette) {
  return env.once('hook:edge:' + palette, () => {
    const lay = C.layer(420, 1400, env.res, (x) => {
      x.translate(-1720, 160);
      const red = palette === 'red';
      const sky = poly([[1880, -170], [1840, 200], [1872, 560], [1900, 900], [1860, 1250], [2160, 1250], [2160, -170]]);
      const g = x.createLinearGradient(0, -160, 0, 1240);
      const stops = red
        ? [[0, PAL.night0], [0.3, PAL.night1], [0.5, PAL.night2], [0.62, PAL.blueband], [0.7, PAL.glow], [0.78, PAL.ember2], [0.9, PAL.ember1], [1, PAL.ember0]]
        : [[0, PAL.night0], [0.4, PAL.night1], [0.7, PAL.night2], [0.86, C.mix(PAL.night2, PAL.blueband, 0.5)], [1, PAL.night1]];
      for (const [k, c] of stops) g.addColorStop(k, c);
      C.paint(x, sky, { fill: g, mottle: 0.5, hatch: 0.1, hatchColor: PAL.night0, seed: 6 });
      if (!red) {
        const rs = C.rng(77); x.fillStyle = C.rgba(PAL.paper, 0.85);
        for (let k = 0; k < 30; k++) { x.beginPath(); x.arc(1850 + rs() * 300, -150 + rs() * 1000, 1 + rs() * 2.2, 0, Math.PI * 2); x.fill(); }
      }
      C.ink(x, poly([[1880, -170], [1840, 200], [1872, 560], [1900, 900], [1860, 1250]], false), { color: PAL.line, width: 4 });
      // side lock: tapered strands with gaps
      const lock = new C.Path2D();
      const r = C.rng(41);
      for (let k = 0; k < 7; k++) {
        const bx = 1790 + k * 34 + r() * 20, tx = bx + 10 + r() * 60, ty = 760 + r() * 520;
        strand(lock, [bx, -170], [bx - 30 + r() * 30, ty * 0.5], [tx, ty], 46 + r() * 26);
      }
      C.cel(x, lock, PAL.hair, { mottle: 0.1 });
      x.save(); x.clip(lock);
      x.strokeStyle = C.rgba(PAL.hairLight, 0.6); x.lineWidth = 3; x.beginPath();
      for (let k = 0; k < 26; k++) { const sx = 1790 + r() * 260; x.moveTo(sx, 80 + r() * 200); x.quadraticCurveTo(sx - 16, 400, sx + 10, 640 + r() * 300); }
      x.stroke();
      x.strokeStyle = C.rgba(red ? PAL.ember2 : C.mix(PAL.blueband, PAL.agaveLight, 0.5), 0.6); x.lineWidth = 8; x.beginPath();
      for (let k = 0; k < 7; k++) { const sx = 1784 + k * 34; x.moveTo(sx, 300); x.quadraticCurveTo(sx - 20, 600, sx + 8, 1000); }
      x.stroke();
      x.restore();
      C.ink(x, lock, { color: PAL.line, width: 3.4, alpha: 0.85 });
    });
    return lay;
  });
}

// ---------------------------------------------------------------- baked: globe (sclera + painted iris)
function wobbleCircle(r, seed, amp = 0.012, n = 96) {
  const p = new C.Path2D();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 + amp * (C.vnoise(Math.cos(a) * 3 + 5, Math.sin(a) * 3 + 5, seed) - 0.5) * 2);
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    if (i) p.lineTo(x, y); else p.moveTo(x, y);
  }
  p.closePath();
  return p;
}
function globeLayer(env) {
  return env.once('hook:globe', () => {
    const X0 = 280, Y0 = 110, GW = 1440, GH = 840;
    const lay = C.layer(GW, GH, env.res, (x) => {
      x.translate(-X0, -Y0);
      // sclera: cool cream, spherical shading toward the corners
      const sclera = rectPath(X0, Y0, GW, GH);
      C.paint(x, sclera, { fill: C.mix(PAL.paper, PAL.agaveLight, 0.45), mottle: 0.22, hatch: 0.05, hatchColor: PAL.agaveShade, seed: 2 });
      const sg = x.createRadialGradient(IRIS.x, IRIS.y + 40, 260, IRIS.x, IRIS.y + 40, 820);
      sg.addColorStop(0, C.rgba(PAL.agaveShade, 0));
      sg.addColorStop(0.55, C.rgba(PAL.agaveShade, 0.35));
      sg.addColorStop(1, C.rgba(C.mix(PAL.agaveShade, PAL.skinShade, 0.5), 0.85));
      x.fillStyle = sg; x.fillRect(X0, Y0, GW, GH);
      // iris
      x.save();
      x.translate(IRIS.x, IRIS.y); x.scale(1, IRIS.ry / IRIS.rx);
      const R = IRIS.rx;
      // soft cast onto the sclera around the iris
      x.save(); x.filter = 'blur(10px)'; x.fillStyle = C.rgba(PAL.agaveShade, 0.5);
      x.beginPath(); x.arc(0, 0, R + 14, 0, Math.PI * 2); x.fill(); x.filter = 'none'; x.restore();
      const disc = wobbleCircle(R, 9, 0.006);
      const g = x.createRadialGradient(0, 0, 0, 0, 0, R);
      g.addColorStop(0, C.shade(PAL.iris, -0.55));
      g.addColorStop(0.3, C.shade(PAL.iris, -0.2));
      g.addColorStop(0.42, C.mix(PAL.iris, PAL.irisRing, 0.55));
      g.addColorStop(0.58, PAL.irisRing);
      g.addColorStop(0.72, C.mix(PAL.iris, PAL.irisRing, 0.45));
      g.addColorStop(0.88, PAL.iris);
      g.addColorStop(1, C.shade(PAL.iris, -0.5));
      C.paint(x, disc, { fill: g, mottle: 0.45, mottleScale: 0.8, hatch: 0.12, hatchColor: C.shade(PAL.iris, -0.5), hatchAngle: 35, seed: 5 });
      x.save(); x.clip(disc);
      // bottom light: anime iris glows from below
      const bl = x.createRadialGradient(0, R * 0.62, 0, 0, R * 0.62, R * 0.85);
      bl.addColorStop(0, C.rgba(C.shade(PAL.irisRing, 0.35), 0.75));
      bl.addColorStop(1, C.rgba(PAL.irisRing, 0));
      x.globalCompositeOperation = 'screen'; x.fillStyle = bl; x.fillRect(-R, -R, 2 * R, 2 * R);
      x.globalCompositeOperation = 'source-over';
      // radial fibres
      const r = C.rng(13);
      const light = new C.Path2D(), dark = new C.Path2D();
      for (let k = 0; k < 340; k++) {
        const a = r() * Math.PI * 2, r0 = R * (0.36 + r() * 0.12), r1 = R * (0.62 + r() * 0.34), bend = (r() - 0.5) * 0.12;
        const p = k % 2 ? light : dark;
        p.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
        p.quadraticCurveTo(Math.cos(a + bend) * (r0 + r1) / 2, Math.sin(a + bend) * (r0 + r1) / 2, Math.cos(a) * r1, Math.sin(a) * r1);
      }
      x.lineCap = 'round';
      x.strokeStyle = C.rgba(C.shade(PAL.irisRing, 0.3), 0.32); x.lineWidth = 3; x.stroke(light);
      x.strokeStyle = C.rgba(C.shade(PAL.iris, -0.4), 0.4); x.lineWidth = 3.4; x.stroke(dark);
      // painted concentric rings (ref3 grammar): wobbly, uneven, layered
      const rings = [
        [0.94, 26, C.shade(PAL.iris, -0.55), 0.85], [0.84, 9, C.shade(PAL.irisRing, 0.1), 0.55],
        [0.74, 20, C.shade(PAL.irisRing, 0.22), 0.4], [0.64, 7, C.shade(PAL.irisRing, 0.45), 0.7],
        [0.53, 16, C.shade(PAL.iris, -0.1), 0.5], [0.44, 6, C.shade(PAL.irisRing, 0.5), 0.8],
        [0.38, 12, C.shade(PAL.iris, -0.45), 0.7],
      ];
      rings.forEach(([k, w, col, al], i) => {
        x.strokeStyle = C.rgba(col, al); x.lineWidth = w;
        x.stroke(wobbleCircle(R * k, 20 + i, 0.02));
      });
      // pupil core (minimum pupil; the live pupil is drawn per frame on top)
      x.fillStyle = C.mix(PAL.hair, PAL.night0, 0.4);
      x.beginPath(); x.arc(0, 0, R * 0.27, 0, Math.PI * 2); x.fill();
      x.restore();
      C.ink(x, disc, { color: C.shade(PAL.line, -0.3), width: 5 });
      x.restore();
    });
    lay.ox = X0; lay.oy = Y0;
    return lay;
  });
}

// ---------------------------------------------------------------- baked: convex-warped reflections
// The flat art is drawn centred on (0,0). A destination point at offset d from the iris centre samples the
// flat art at d * m * (1 + k |d|²/R²): magnified (1/m) in the middle, squeezed toward the limbus = cornea bulge.
const WARP = { m: 0.84, k: 0.34, R: 318 };
function warpFwd(sx, sy) { // flat -> destination offset (Newton-free fixed point)
  let dx = sx / WARP.m, dy = sy / WARP.m;
  for (let i = 0; i < 30; i++) {
    const f = WARP.m * (1 + WARP.k * (dx * dx + dy * dy) / (WARP.R * WARP.R));
    dx = sx / f; dy = sy / f;
  }
  return [dx, dy];
}
function warpedLayer(env, key, fw, fh, drawFlat) {
  return env.once('hook:refl:' + key, () => {
    const sres = env.res * 1.5;
    const flat = C.canvas(fw * sres, fh * sres);
    const fx = flat.getContext('2d');
    fx.scale(sres, sres); fx.translate(fw / 2, fh / 2);
    drawFlat(fx);
    const FW = flat.width, FH = flat.height;
    const src = fx.getImageData(0, 0, FW, FH).data;
    const DWw = IRIS.rx * 2 + 8, DHw = IRIS.ry * 2 + 8;
    const lay = C.layer(DWw, DHw, env.res, () => {});
    const ox = lay.getContext('2d');
    const DW = lay.width, DH = lay.height;
    const img = ox.createImageData(DW, DH), d = img.data;
    const R2 = WARP.R * WARP.R;
    for (let j = 0; j < DH; j++) {
      const wy = (j + 0.5) / env.res - DHw / 2;
      for (let i = 0; i < DW; i++) {
        const wx = (i + 0.5) / env.res - DWw / 2;
        const e = Math.sqrt((wx / IRIS.rx) ** 2 + (wy / IRIS.ry) ** 2);
        if (e > 0.99) continue;
        const f = WARP.m * (1 + WARP.k * (wx * wx + wy * wy) / R2);
        const sx = (wx * f + fw / 2) * sres - 0.5, sy = (wy * f + fh / 2) * sres - 0.5;
        if (sx < 0 || sy < 0 || sx >= FW - 1 || sy >= FH - 1) continue;
        const x0 = sx | 0, y0 = sy | 0, ax = sx - x0, ay = sy - y0;
        let r = 0, g = 0, b = 0, a = 0;
        for (const [ix, iy, w] of [[x0, y0, (1 - ax) * (1 - ay)], [x0 + 1, y0, ax * (1 - ay)], [x0, y0 + 1, (1 - ax) * ay], [x0 + 1, y0 + 1, ax * ay]]) {
          const k = (iy * FW + ix) * 4, aw = (src[k + 3] / 255) * w;
          r += src[k] * aw; g += src[k + 1] * aw; b += src[k + 2] * aw; a += aw;
        }
        if (a <= 0.002) continue;
        const fade = 1 - C.smooth((e - 0.84) / 0.14);
        const o = (j * DW + i) * 4;
        d[o] = r / a; d[o + 1] = g / a; d[o + 2] = b / a; d[o + 3] = 255 * a * fade;
      }
    }
    ox.putImageData(img, 0, 0);
    lay.ox = IRIS.x - DWw / 2; lay.oy = IRIS.y - DHw / 2;
    return lay;
  });
}
// a coloured, blurred bloom of a layer (for the pulse glow)
function bloomOf(env, key, src, color, blur, extra) {
  return env.once('hook:bloom:' + key, () => {
    const pad = blur * 3;
    const lay = C.layer(src.worldW + pad * 2, src.worldH + pad * 2, env.res, (x) => {
      x.filter = `blur(${blur}px)`;
      x.drawImage(src, pad, pad, src.worldW, src.worldH);
      x.filter = 'none';
      x.globalCompositeOperation = 'source-in';
      x.fillStyle = color; x.fillRect(0, 0, src.worldW + pad * 2, src.worldH + pad * 2);
      x.globalCompositeOperation = 'source-over';
      if (extra) { x.translate(pad - src.ox, pad - src.oy); extra(x); }
    });
    lay.ox = src.ox - pad; lay.oy = src.oy - pad;
    return lay;
  });
}

// flat email card (S1). Centre of the card = (0,0).
const EMAIL = { w: 610, h: 384 };
const DOT_FLAT = [EMAIL.w / 2 - 22, -EMAIL.h / 2 + 22];
function drawEmailFlat(x) {
  const { w, h } = EMAIL;
  const card = new C.Path2D(); card.roundRect(-w / 2, -h / 2, w, h, 22);
  C.paint(x, card, { fill: C.mix(PAL.paper, PAL.bloomLight, 0.18), mottle: 0.18, hatch: 0.04, seed: 8 });
  const L = -w / 2 + 36;
  // sender row: avatar + muted bar
  x.fillStyle = C.mix(PAL.paperShade, PAL.ink, 0.2); x.beginPath(); x.arc(L + 16, -h / 2 + 40, 16, 0, Math.PI * 2); x.fill();
  x.fillStyle = C.rgba(PAL.paperShade, 0.9); x.fillRect(L + 44, -h / 2 + 33, 170, 13);
  C.text(x, 'Re: Application — Junior Designer', L, -h / 2 + 100, { font: C.FONT.sansSemi(31), color: PAL.ink });
  x.fillStyle = C.rgba(PAL.paperShade, 0.9); x.fillRect(L, -h / 2 + 118, w - 72, 3);
  // body, wrapped
  const words = 'Unfortunately, we have decided to move forward with other candidates.'.split(' ');
  x.font = C.FONT.sansSemi(46);
  const lines = []; let cur = '';
  for (const wd of words) { const tryS = cur ? cur + ' ' + wd : wd; if (x.measureText(tryS).width > w - 64 && cur) { lines.push(cur); cur = wd; } else cur = tryS; }
  lines.push(cur);
  lines.forEach((ln, i) => C.text(x, ln, L, -h / 2 + 178 + i * 58, { font: i === 0 ? C.FONT.sansBold(48) : C.FONT.sans(46), color: PAL.ink }));
  // red notification dot (badge on the corner)
  x.fillStyle = PAL.stampRed; x.beginPath(); x.arc(DOT_FLAT[0], DOT_FLAT[1], 27, 0, Math.PI * 2); x.fill();
  x.fillStyle = C.rgba(PAL.ember2, 0.9); x.beginPath(); x.arc(DOT_FLAT[0] - 5, DOT_FLAT[1] - 5, 14, 0, Math.PI * 2); x.fill();
}
// flat aldercv.com page (S8): cream page, teal bar with the logo, a few lines, an alder leaf
const CVP = { w: 330, h: 430 };
const LOGO = new C.Path2D('M19.82 43.44C10.76 33.85 9.92 21.23 16.11 12.71C23.26 2.88 33.57 1.36 39.86 5.93C42.48 7.84 43.1 10.29 41.91 13.03C44.15 11.05 46.68 10.89 49.3 12.79C55.59 17.36 57.33 27.64 50.19 37.47C44 45.99 31.73 49.09 19.82 43.44Z');
function leafPath(len, wid) {
  const p = new C.Path2D();
  p.moveTo(0, 0); p.quadraticCurveTo(len * 0.45, -wid, len, 0); p.quadraticCurveTo(len * 0.45, wid, 0, 0); p.closePath();
  return p;
}
function drawCvFlat(x) {
  const { w, h } = CVP;
  const page = new C.Path2D(); page.roundRect(-w / 2, -h / 2, w, h, 10);
  C.paint(x, page, { fill: C.mix(PAL.brandPaper, PAL.alderLight, 0.12), mottle: 0.16, hatch: 0.03, seed: 9 });
  x.save(); x.clip(page);
  x.fillStyle = PAL.brandTeal; x.fillRect(-w / 2, -h / 2, w, 62);
  x.save(); x.translate(-w / 2 + 18, -h / 2 + 10); x.scale(0.8, 0.8); x.fillStyle = PAL.brandAmber; x.fill(LOGO); x.restore();
  x.fillStyle = C.rgba(PAL.brandPaper, 0.85); x.fillRect(-w / 2 + 70, -h / 2 + 26, 110, 11);
  x.restore();
  const L = -w / 2 + 30;
  x.fillStyle = PAL.brandInk; x.fillRect(L, -h / 2 + 96, 170, 22);          // name
  x.fillStyle = C.rgba(PAL.alderDeep, 0.9); x.fillRect(L, -h / 2 + 132, 120, 10); // title
  // a small alder leaf by the name
  x.save(); x.translate(L + 196, -h / 2 + 112); x.rotate(-0.6);
  x.fillStyle = PAL.alder; x.fill(leafPath(54, 20));
  x.strokeStyle = PAL.alderDeep; x.lineWidth = 3; x.beginPath(); x.moveTo(-8, 0); x.lineTo(46, 0); x.stroke();
  x.restore();
  const rl = C.rng(5);
  x.fillStyle = C.rgba(PAL.brandInk, 0.45);
  let y = -h / 2 + 172;
  for (let s = 0; s < 3; s++) {
    x.fillStyle = C.rgba(PAL.brandTeal, 0.85); x.fillRect(L, y, 70, 10); y += 26;
    x.fillStyle = C.rgba(PAL.brandInk, 0.4);
    for (let k = 0; k < 2 + (s === 1 ? 1 : 0); k++) { x.fillRect(L, y, 200 + rl() * 70, 8); y += 20; }
    y += 14;
  }
}

function reflection(env, kind) {
  if (kind === 'email') {
    const lay = warpedLayer(env, 'email', EMAIL.w + 80, EMAIL.h + 80, drawEmailFlat);
    const dot = warpFwd(DOT_FLAT[0], DOT_FLAT[1]);
    const dotW = [IRIS.x + dot[0], IRIS.y + dot[1]];
    const glow = bloomOf(env, 'email', lay, PAL.ember2, 26, (x) => C.glow(x, dotW[0], dotW[1], 90, PAL.ember2, 1));
    return { lay, glow, dot: dotW };
  }
  const lay = warpedLayer(env, 'cv', CVP.w + 60, CVP.h + 60, drawCvFlat);
  const glow = bloomOf(env, 'cv', lay, PAL.alderLight, 30);
  return { lay, glow, dot: null };
}

// ---------------------------------------------------------------- baked: light maps (painterly light on skin)
function lightLayer(env, palette) {
  return worldLayer(env, 'light:' + palette, (x, A) => {
    const red = palette === 'red';
    const c1 = red ? PAL.ember2 : C.mix(PAL.blueband, PAL.agaveLight, 0.45);
    const c2 = red ? PAL.glow : C.mix(PAL.blueband, PAL.paper, 0.6);
    const up = sample(UP_OPEN, 40), lo = sample(LO_OPEN, 40), cr = sample(CREASE, 40);
    x.lineCap = 'round'; x.lineJoin = 'round';
    x.filter = 'blur(34px)';
    x.strokeStyle = C.rgba(c1, 0.75); x.lineWidth = 110; strokePts(x, offsetPts(up, 0, -70).slice(8, 41));   // lid dome
    x.strokeStyle = C.rgba(c1, 0.6); x.lineWidth = 140; strokePts(x, offsetPts(lo, 0, 150).slice(10, 40));  // cheek top
    x.fillStyle = C.rgba(c1, 0.65); x.beginPath(); x.ellipse(1250, 1120, 640, 120, -0.05, 0, Math.PI * 2); x.fill(); // cheek
    x.filter = 'blur(10px)';
    x.strokeStyle = C.rgba(c2, 0.7); x.lineWidth = 22; strokePts(x, offsetPts(up, 0, -34).slice(12, 40));    // lid rim
    x.strokeStyle = C.rgba(c2, 0.55); x.lineWidth = 16; strokePts(x, offsetPts(lo, 0, 26).slice(14, 38));    // lower lid rim
    x.strokeStyle = C.rgba(c2, 0.4); x.lineWidth = 18; strokePts(x, offsetPts(cr, 0, -26).slice(14, 38));    // crease ridge
    x.filter = 'none';
    // painterly: dab the light away in mottled patches so it reads as gouache, not a gradient
    x.globalCompositeOperation = 'destination-out';
    const pat = x.createPattern(C.mottleTile(512, 3), 'repeat');
    x.globalAlpha = 0.45; x.fillStyle = pat; x.fillRect(A.x0, A.y0, A.x1 - A.x0, A.y1 - A.y0);
    const r = C.rng(palette === 'red' ? 61 : 62);
    x.globalAlpha = 0.25; x.lineWidth = 10;
    x.strokeStyle = '#000000'; x.beginPath();
    for (let k = 0; k < 220; k++) {
      const px = A.x0 + r() * (A.x1 - A.x0), py = A.y0 + r() * (A.y1 - A.y0), L = 30 + r() * 80;
      x.moveTo(px, py); x.lineTo(px + L * 0.82, py - L * 0.57);
    }
    x.stroke();
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
  });
}
// ambient grade (multiply): night falls off toward the frame edges
function ambientLayer(env, palette) {
  return worldLayer(env, 'amb:' + palette, (x, A) => {
    const red = palette === 'red';
    const g = x.createRadialGradient(960, 600, 120, 960, 600, 1250);
    if (red) {
      g.addColorStop(0, C.mix(PAL.paper, PAL.ember2, 0.1));
      g.addColorStop(0.45, C.mix(PAL.paper, PAL.bloom, 0.32));
      g.addColorStop(0.75, C.mix(PAL.paper, PAL.night2, 0.5));
      g.addColorStop(1, C.mix(PAL.night1, PAL.paper, 0.25));
    } else {
      g.addColorStop(0, C.mix(PAL.paper, PAL.agaveLight, 0.5));
      g.addColorStop(0.45, C.mix(PAL.paper, PAL.blueband, 0.4));
      g.addColorStop(0.75, C.mix(PAL.paper, PAL.night2, 0.62));
      g.addColorStop(1, C.mix(PAL.night1, PAL.paper, 0.18));
    }
    x.fillStyle = g; x.fillRect(A.x0, A.y0, A.x1 - A.x0, A.y1 - A.y0);
  });
}

// ---------------------------------------------------------------- baked: bangs in front
function bangsLayer(env) {
  return worldLayer(env, 'bangs', (x) => {
    const r = C.rng(52);
    const p = new C.Path2D();
    const spec = [
      // [rootX, tipX, tipY, width]
      [230, 170, 300, 200], [380, 330, 345, 170], [520, 500, 270, 150], [610, 640, 205, 110],
      [820, 770, 292, 46],
      [1170, 1210, 190, 130], [1300, 1330, 248, 150], [1440, 1470, 170, 120],
    ];
    for (const [rx, tx, ty, w] of spec) strand(p, [rx, -180], [rx + (tx - rx) * 0.3 - 20, ty * 0.45], [tx, ty], w);
    C.cel(x, p, PAL.hair, { mottle: 0.1 });
    x.save(); x.clip(p);
    // one shade shape per clump (right side of each strand is in shadow)
    x.fillStyle = C.shade(PAL.hair, -0.3);
    const sh = new C.Path2D();
    for (const [rx, tx, ty, w] of spec) strand(sh, [rx + w * 0.3, -180], [rx + (tx - rx) * 0.3 + w * 0.1, ty * 0.45], [tx + 4, ty - 6], w * 0.4);
    x.fill(sh);
    x.strokeStyle = C.rgba(PAL.hairLight, 0.7); x.lineWidth = 7; x.lineCap = 'round';
    x.beginPath();
    for (const [rx, tx, ty, w] of spec) {
      if (w < 60) continue;
      x.moveTo(rx - w * 0.25, -40); x.quadraticCurveTo(rx - w * 0.2, 40, C.lerp(rx, tx, 0.5) - w * 0.15, ty * 0.5);
    }
    x.stroke();
    x.strokeStyle = C.rgba(PAL.hairLight, 0.35); x.lineWidth = 2.4; x.beginPath();
    for (let k = 0; k < 40; k++) { const sx = 150 + r() * 1400; x.moveTo(sx, -150); x.quadraticCurveTo(sx - 10, 40, sx + 8, 120 + r() * 140); }
    x.stroke();
    x.restore();
    C.ink(x, p, { color: PAL.line, width: 3.6 });
  });
}

// ---------------------------------------------------------------- per frame: the eye
function lidCurves(state) {
  const b = C.clamp(state.blink || 0);
  const up0 = lerpBez(UP_OPEN, UP_RELAX, C.clamp(state.lidRelax || 0));
  const up = lerpBez(up0, SHUT, C.ease.inSine(b));
  const lo = lerpBez(LO_OPEN, SHUT, Math.pow(b, 2.2));
  return { up, lo, b };
}

function drawEye(ctx, env, state) {
  const calm = state.palette === 'calm';
  const pulse = state.pulse || 0;
  const { up, lo, b } = lidCurves(state);
  const N = 48;
  const upPts = sample(up, N), loPts = sample(lo, N);
  const opening = poly([...upPts, ...loPts.slice().reverse()]);

  // 1. skin + right edge
  blitL(ctx, skinLayer(env));
  if (!env.vertical) { const e = edgeLayer(env, state.palette); C.blit(ctx, e, 1720, -160); }

  // 2. the eyeball inside the opening
  if (b < 0.995) {
    ctx.save();
    ctx.clip(opening);
    const gl = globeLayer(env);
    C.blit(ctx, gl, gl.ox, gl.oy);
    // live pupil (contracts on each pulse)
    const pr = IRIS.rx * 0.335 * (1 - 0.13 * (state.pupil || 0));
    ctx.save();
    ctx.translate(IRIS.x, IRIS.y); ctx.scale(1, IRIS.ry / IRIS.rx);
    ctx.fillStyle = C.rgba(C.mix(PAL.hair, PAL.night0, 0.4), 0.45); ctx.beginPath(); ctx.arc(0, 0, pr + 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.mix(PAL.hair, PAL.night0, 0.4); ctx.beginPath(); ctx.arc(0, 0, pr, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // inner-corner caruncle
    ctx.fillStyle = C.mix(PAL.blush, PAL.skinShade, 0.3);
    ctx.beginPath(); ctx.ellipse(334, 628, 34, 22, 0.15, 0, Math.PI * 2); ctx.fill();
    // lid shadow cast on the globe (follows the lid)
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const shCol = C.mix(PAL.hair, PAL.night1, 0.5);
    for (const [w, a] of [[190, 0.1], [130, 0.14], [80, 0.18], [36, 0.26]]) {
      ctx.strokeStyle = C.rgba(shCol, a); ctx.lineWidth = w; strokePts(ctx, offsetPts(upPts, 0, 6));
    }
    ctx.restore();
  }

  // 3. night ambient grade (multiply) over skin + globe
  ctx.save(); ctx.globalCompositeOperation = 'multiply';
  blitL(ctx, ambientLayer(env, state.palette));
  ctx.restore();

  // 4. emissive reflection + specular, inside the opening and the iris
  if (b < 0.995) {
    ctx.save();
    ctx.clip(opening);
    const R = reflection(env, state.reflection);
    const irisClip = new C.Path2D(); irisClip.ellipse(IRIS.x, IRIS.y, IRIS.rx, IRIS.ry, 0, 0, Math.PI * 2);
    ctx.save(); ctx.clip(irisClip);
    if (!calm) {
      C.blit(ctx, R.lay, R.lay.ox, R.lay.oy, 0.86 + 0.1 * pulse);
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      C.blit(ctx, R.glow, R.glow.ox, R.glow.oy, 0.22 + 0.7 * pulse);
      ctx.restore();
      C.glow(ctx, R.dot[0], R.dot[1], 70 + 50 * pulse, PAL.ember2, 0.35 + 0.6 * pulse);
    } else {
      // reflected stars (sparse, still)
      const rs = C.rng(88);
      ctx.fillStyle = C.rgba(PAL.paper, 0.75);
      for (let k = 0; k < 18; k++) {
        const a = rs() * Math.PI * 2, rr = 0.55 + rs() * 0.38;
        const sx = IRIS.x + Math.cos(a) * IRIS.rx * rr, sy = IRIS.y + Math.sin(a) * IRIS.ry * rr;
        ctx.beginPath(); ctx.arc(sx, sy, 1.6 + rs() * 2.2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      C.blit(ctx, R.glow, R.glow.ox, R.glow.oy, 0.55);
      ctx.restore();
      C.blit(ctx, R.lay, R.lay.ox, R.lay.oy, 0.9);
    }
    ctx.restore();
    // the lid still shades the top of the reflection a little
    ctx.lineCap = 'round';
    ctx.strokeStyle = C.rgba(C.mix(PAL.hair, PAL.night1, 0.5), 0.22); ctx.lineWidth = 90; strokePts(ctx, offsetPts(upPts, 0, 4));
    // single specular dot
    C.glow(ctx, SPEC.x, SPEC.y, 46, PAL.paper, 0.35);
    ctx.fillStyle = C.shade(PAL.paper, 0.55); ctx.beginPath(); ctx.arc(SPEC.x, SPEC.y, SPEC.r, 0, Math.PI * 2); ctx.fill();
    // waterline: a pale band along the lower lid
    ctx.strokeStyle = C.rgba(C.mix(PAL.skin, PAL.blush, 0.4), 0.85); ctx.lineWidth = 16;
    strokePts(ctx, offsetPts(loPts.slice(6, 46), 0, 4));
    ctx.restore();
  }

  // 5. painterly light on lid and cheek (screen) — under the lashes so they stay dark
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  blitL(ctx, lightLayer(env, state.palette), calm ? 0.55 : 0.3 + 0.7 * pulse);
  ctx.restore();

  // 6. lids: lower line + lashes, upper lash ribbon + lashes
  drawLids(ctx, upPts, loPts, b, state.palette, pulse);

  // 7. bangs in front
  blitL(ctx, bangsLayer(env));
}

function drawLids(ctx, upPts, loPts, b) {
  const F = frames(upPts), FL = frames(loPts);
  const n = F.length;
  // lower lid line (thin at the inner corner, firmer outward)
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = C.rgba(PAL.line, 0.55); ctx.lineWidth = 3; strokePts(ctx, offsetPts(loPts.slice(4, 30), 0, 9));
  ctx.strokeStyle = C.rgba(PAL.line, 0.85); ctx.lineWidth = 6; strokePts(ctx, offsetPts(loPts.slice(26), 0, 9));
  // lower lashes
  const ll = new C.Path2D();
  const r2 = C.rng(17);
  for (let i = 26; i < n - 2; i += 2) {
    const { p, t, n: nn } = FL[i];
    const s = i / n, L = 18 + 30 * s + r2() * 10;
    const dir = [-nn[0] * 0.9 + t[0] * 0.45, -nn[1] * 0.9 + t[1] * 0.45];
    const bp = [p[0], p[1] + 9];
    strand(ll, bp, [bp[0] + dir[0] * L * 0.5, bp[1] + dir[1] * L * 0.5], [bp[0] + dir[0] * L, bp[1] + dir[1] * L], 4);
  }
  ctx.fillStyle = PAL.hair; ctx.fill(ll);
  ctx.restore();

  // upper lash ribbon
  const width = (s) => 7 + 24 * C.smooth(s / 0.82);
  const outer = [], inner = [];
  F.forEach(({ p, n: nn }, i) => {
    const w = width(i / (n - 1));
    outer.push([p[0] + nn[0] * w, p[1] + nn[1] * w]);
    inner.push([p[0] - nn[0] * 3, p[1] - nn[1] * 3]);
  });
  const end = upPts[n - 1];
  const fl = lerp2(FLICK_OPEN, FLICK_SHUT, b);
  const tip = [end[0] + fl[0], end[1] + fl[1]];
  const rib = new C.Path2D();
  rib.moveTo(inner[0][0], inner[0][1]);
  inner.forEach(([x, y]) => rib.lineTo(x, y));
  rib.quadraticCurveTo(end[0] + fl[0] * 0.6, end[1] + fl[1] * 0.2 + 6, tip[0], tip[1]);
  rib.quadraticCurveTo(end[0] + fl[0] * 0.3, end[1] + fl[1] * 0.7 - 22, outer[n - 1][0], outer[n - 1][1]);
  for (let i = n - 1; i >= 0; i--) rib.lineTo(outer[i][0], outer[i][1]);
  rib.closePath();
  // lid rim highlight (the lid edge catches light), then the ribbon
  ctx.save(); ctx.lineCap = 'round';
  ctx.strokeStyle = C.rgba(C.shade(PAL.skin, 0.3), 0.6); ctx.lineWidth = 7;
  strokePts(ctx, outer.slice(6).map(([x, y], i) => { const { n: nn } = F[i + 6]; return [x + nn[0] * 8, y + nn[1] * 8]; }));
  ctx.restore();
  ctx.fillStyle = PAL.hair; ctx.fill(rib);
  ctx.save(); ctx.clip(rib);
  ctx.strokeStyle = C.rgba(PAL.hairLight, 0.8); ctx.lineWidth = 5; ctx.lineCap = 'round';
  strokePts(ctx, F.slice(14, 40).map(({ p, n: nn }, i) => { const w = width((i + 14) / (n - 1)); return [p[0] + nn[0] * w * 0.55, p[1] + nn[1] * w * 0.55]; }));
  ctx.restore();

  // upper lashes: open = up and outward, shut = hanging down and outward
  const lashes = new C.Path2D();
  const r = C.rng(29);
  const NL = 42;
  for (let k = 0; k < NL; k++) {
    const s = C.clamp(0.12 + 0.88 * (k / (NL - 1)) + (r() - 0.5) * 0.02, 0, 0.995);
    const fi = Math.min(n - 1, Math.round(s * (n - 1)));
    const { p, t, n: nn } = F[fi];
    const w = width(s);
    const th = C.lerp(-0.35, 1.05, s) + (r() - 0.5) * 0.18;
    const open = [nn[0] * Math.cos(th) + t[0] * Math.sin(th), nn[1] * Math.cos(th) + t[1] * Math.sin(th)];
    const ph = C.lerp(0.25, 0.95, s);
    const shut = [-nn[0] * Math.cos(ph) + t[0] * Math.sin(ph), -nn[1] * Math.cos(ph) + t[1] * Math.sin(ph)];
    let dx = C.lerp(open[0], shut[0], b), dy = C.lerp(open[1], shut[1], b);
    const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
    const L = C.lerp(26, 120, Math.pow(s, 1.4)) * (0.75 + r() * 0.5);
    const base = [p[0] + nn[0] * w * 0.55, p[1] + nn[1] * w * 0.55];
    const curl = C.lerp(0.22, -0.1, b);
    const ctrl = [base[0] + dx * L * 0.55 - t[0] * L * 0.05, base[1] + dy * L * 0.55 - t[1] * L * 0.05];
    const tipL = [base[0] + dx * L + t[0] * L * curl * 0.6, base[1] + dy * L + t[1] * L * curl * 0.6 - L * curl * 0.4 * (1 - b)];
    strand(lashes, base, ctrl, tipL, C.lerp(4, 9, s));
  }
  // three clumped outer spikes (the character silhouette of her lashes)
  for (const [s, L] of [[0.8, 120], [0.9, 145], [0.97, 150]]) {
    const fi = Math.round(s * (n - 1));
    const { p, t, n: nn } = F[fi];
    const open = [nn[0] * 0.45 + t[0] * 0.9, nn[1] * 0.45 + t[1] * 0.9];
    const shut = [-nn[0] * 0.5 + t[0] * 0.85, -nn[1] * 0.5 + t[1] * 0.85];
    let dx = C.lerp(open[0], shut[0], b), dy = C.lerp(open[1], shut[1], b);
    const dl = Math.hypot(dx, dy); dx /= dl; dy /= dl;
    const base = [p[0] + nn[0] * width(s) * 0.5, p[1] + nn[1] * width(s) * 0.5];
    strand(lashes, base, [base[0] + dx * L * 0.5 + nn[0] * 14 * (1 - b), base[1] + dy * L * 0.5 + nn[1] * 14 * (1 - b)], [base[0] + dx * L, base[1] + dy * L], 15);
  }
  ctx.fillStyle = PAL.hair; ctx.fill(lashes);
  C.ink(ctx, poly(inner, false), { color: PAL.hair, width: 3, alpha: 0.6 });
}

// ---------------------------------------------------------------- timing
// red pulse: fast attack peaking just after each cue, ~0.2 s decay (on ones)
function pulseAt(t) {
  let v = 0;
  for (const c of CUES) {
    const d = t - c;
    if (d < -0.05) continue;
    v += d < 0 ? C.smooth((d + 0.05) / 0.05) : Math.exp(-d / 0.2);
  }
  return C.clamp(v);
}
// pupil contraction: lags the light a little, relaxes slowly (fed with twos)
function pupilAt(t) {
  let v = 0;
  for (const c of CUES) {
    const d = t - c;
    if (d <= 0) continue;
    v = Math.max(v, (1 - Math.exp(-d / 0.05)) * Math.exp(-d / 0.5));
  }
  return C.clamp(v * 1.15);
}
// blink drawings on twos: frames 51/52, 53/54, 55/56, 57/58, 59 (shut)
function blinkAt(frame) {
  if (frame < 51) return 0;
  const key = Math.min(59, 51 + 2 * Math.floor((frame - 51) / 2));
  return [0.14, 0.38, 0.68, 0.9, 1][(key - 51) / 2];
}

// ---------------------------------------------------------------- shots
const S1 = {
  vfocus: 960,
  draw(ctx, env, t, info) {
    const zoom = C.lerp(1, 1.06, C.seg(t, 0, 2, C.ease.inOutSine));
    camera(ctx, env, { ...CAM, zoom });
    const frame = info ? info.frame : Math.round(t * 30);
    drawEye(ctx, env, {
      pulse: pulseAt(t), pupil: pupilAt(C.twos(t)), blink: blinkAt(frame), lidRelax: 0,
      palette: 'red', reflection: 'email',
    });
    return { post: { grain: 0.6, vignette: 0.42 } };
  },
};

const S8 = {
  vfocus: 960,
  draw(ctx, env, t, info) {
    const f = info ? info.frame - info.shot.from : Math.round(t * 30);
    if (f < 8) { // cut to black (the only pure black in the film)
      identity(ctx); ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, env.outW, env.outH);
      return { post: false };
    }
    camera(ctx, env, { ...CAM, zoom: 1 });
    // opens in over the first drawings (on twos), then holds
    const open = [0.42, 0.42, 0.14, 0.14][f - 8] ?? 0;
    drawEye(ctx, env, { pulse: 0, pupil: 0, blink: open, lidRelax: 0.75, palette: 'calm', reflection: 'cv' });
    const fade = C.ease.outSine(C.clamp((f - 7) / 5));
    if (fade < 1) { identity(ctx); ctx.fillStyle = C.rgba('#000000', 1 - fade); ctx.fillRect(0, 0, env.outW, env.outH); }
    return { post: { grain: 0.6 * fade, vignette: 0.42 } };
  },
};

module.exports = { S1, S8, drawEye };
