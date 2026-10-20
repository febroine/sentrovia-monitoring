'use strict';
// Painted night sky in horizontal bands (indigo -> blue -> burnt red), smoke clouds,
// a black treeline with tiny red lights, and twinkling stars.
// warmth: 1 = act-1 red sunset, 0 = calm starry night (act 2). Both looks are cached layers.

const C = require('./core');
const PAL = require('./palette');

// Sky extents in world units (wider than the frame so cameras can drift).
const SX0 = -240, SX1 = 2160, SW = SX1 - SX0;

function skyLayer(env, horizonY, warm, seed) {
  return env.once(`sky:${horizonY}:${warm}:${seed}`, () => {
    const top = -200, h = horizonY - top + 6;
    return C.layer(SW, h, env.res, (x) => {
      x.translate(-SX0, -top);
      const y = (k) => C.lerp(top, horizonY, k);
      const g = x.createLinearGradient(0, top, 0, horizonY);
      const stops = warm
        ? [[0, PAL.night0], [0.30, PAL.night1], [0.52, PAL.night2], [0.66, PAL.blueband], [0.74, '#8b8fb0'],
          [0.80, PAL.glow], [0.88, PAL.ember2], [0.95, PAL.ember1], [1, PAL.ember0]]
        : [[0, PAL.night0], [0.35, PAL.night1], [0.62, PAL.night2], [0.80, '#3f5a9a'], [0.90, '#5b5f98'],
          [0.96, '#9a6c8c'], [1, '#3a2c55']];
      for (const [k, c] of stops) g.addColorStop(k, c);
      x.fillStyle = g;
      x.fillRect(SX0, top, SW, h);
      // brushed horizontal strokes: the sky is painted in long drags, not a smooth gradient
      const r = C.rng(seed);
      for (let n = 0; n < 900; n++) {
        const yy = top + r() * h;
        const k = (yy - top) / h;
        const base = sampleStops(stops, k);
        const col = C.shade(base, (r() - 0.5) * 0.18);
        const len = 80 + r() * 520, xx = SX0 + r() * SW;
        x.strokeStyle = C.rgba(col, 0.10 + r() * 0.16);
        x.lineWidth = 2 + r() * 9 * (0.4 + k);
        x.lineCap = 'round';
        x.beginPath();
        x.moveTo(xx, yy);
        x.bezierCurveTo(xx + len * 0.3, yy + (r() - 0.5) * 6, xx + len * 0.7, yy + (r() - 0.5) * 6, xx + len, yy + (r() - 0.5) * 4);
        x.stroke();
      }
      // hot line just above the treeline
      if (warm) {
        const hg = x.createLinearGradient(0, horizonY - 46, 0, horizonY);
        hg.addColorStop(0, C.rgba(PAL.glow, 0));
        hg.addColorStop(0.7, C.rgba('#f6b066', 0.55));
        hg.addColorStop(1, C.rgba(PAL.ember2, 0.2));
        x.fillStyle = hg; x.fillRect(SX0, horizonY - 46, SW, 46);
      }
      // smoke clouds sitting on the horizon: soft clusters of translucent dabs (ref4 grammar)
      const cr = C.rng(seed + 3);
      x.filter = 'blur(1.6px)';
      for (let n = 0; n < 16; n++) {
        const cx = SX0 + cr() * SW, cy = horizonY - 26 - cr() * 60, s = 10 + cr() * 22;
        const col = warm ? C.mix(PAL.treeline, PAL.ember0, 0.35 + cr() * 0.3) : C.mix(PAL.treeline, PAL.night1, 0.55);
        const dabs = 18 + Math.floor(cr() * 26);
        for (let b = 0; b < dabs; b++) {
          const bx = cx + cr() * s * 3.2 - s * 1.6, by = cy + (cr() - 0.3) * s * 0.9 * (1 - Math.abs(bx - cx) / (s * 2));
          const rx = s * (0.25 + cr() * 0.35), ry = rx * (0.5 + cr() * 0.4);
          x.fillStyle = C.rgba(col, 0.18 + cr() * 0.3);
          x.beginPath(); x.ellipse(bx, by, rx, ry, (cr() - 0.5) * 0.6, 0, Math.PI * 2); x.fill();
        }
        // lit underside
        if (warm) { x.fillStyle = C.rgba(PAL.glow, 0.25); x.beginPath(); x.ellipse(cx, cy + s * 0.35, s * 1.3, s * 0.18, 0, 0, Math.PI * 2); x.fill(); }
      }
      x.filter = 'none';
      // texture
      C.paint(x, rectPath(SX0, top, SW, h), { fill: 'rgba(0,0,0,0)', mottle: 0.35, hatch: 0.05, hatchColor: PAL.night0, hatchAngle: -8, hatchSpacing: 9, seed: 4 });
      // treeline silhouette
      drawTreeline(x, horizonY, seed + 9, warm);
    });
  });
}

function sampleStops(stops, k) {
  for (let i = 1; i < stops.length; i++) {
    if (k <= stops[i][0]) {
      const [k0, c0] = stops[i - 1], [k1, c1] = stops[i];
      return C.mix(c0, c1, (k - k0) / (k1 - k0));
    }
  }
  return stops[stops.length - 1][1];
}
function rectPath(x, y, w, h) { const p = new C.Path2D(); p.rect(x, y, w, h); return p; }

function drawTreeline(x, horizonY, seed, warm) {
  const r = C.rng(seed);
  const p = new C.Path2D();
  p.moveTo(SX0, horizonY + 6);
  let xx = SX0;
  while (xx < SX1) {
    const w = 8 + r() * 40, hh = 6 + r() * r() * 34;
    // canopy bump made of 2-3 small arcs
    const n = 1 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const bw = w / n;
      p.quadraticCurveTo(xx + bw * 0.5, horizonY - hh - r() * 8, xx + bw, horizonY - hh * 0.4);
      xx += bw;
    }
    if (r() < 0.06) { // pole / thin tree
      p.lineTo(xx, horizonY - 30 - r() * 30); p.lineTo(xx + 2, horizonY - 30 - r() * 30); p.lineTo(xx + 2, horizonY - 4);
    }
    p.lineTo(xx, horizonY - 2);
  }
  p.lineTo(SX1, horizonY + 6);
  p.closePath();
  x.fillStyle = warm ? PAL.treeline : '#151226';
  x.fill(p);
}

// Stars: deterministic positions, twinkle per frame. density 0..1, region above `maxY`.
function stars(ctx, env, o) {
  const { t = 0, amount = 1, maxY = 380, seed = 21, warmFade = 0 } = o;
  if (amount <= 0) return;
  const list = env.once(`stars:${seed}:${maxY}`, () => {
    const r = C.rng(seed), out = [];
    for (let i = 0; i < 260; i++) {
      const y = -180 + Math.pow(r(), 1.3) * (maxY + 180);
      out.push({ x: SX0 + r() * SW, y, s: 0.6 + Math.pow(r(), 4) * 2.6, ph: r() * 6.28, f: 0.6 + r() * 2.2, rank: r() });
    }
    return out;
  });
  ctx.save();
  for (const s of list) {
    if (s.rank > amount) continue;
    const fadeLow = 1 - C.smooth((s.y - (maxY - 160)) / 160) * warmFade; // red sky washes out low stars
    const tw = 0.65 + 0.35 * Math.sin(s.ph + t * s.f * 2);
    const a = tw * fadeLow * Math.min(1, (amount - s.rank) * 6);
    if (a <= 0.02) continue;
    ctx.fillStyle = C.rgba('#f4ecd6', a);
    ctx.beginPath(); ctx.arc(s.x, s.y, s.s, 0, Math.PI * 2); ctx.fill();
    if (s.s > 2.2) { // painted 4-point sparkle on bright stars
      ctx.strokeStyle = C.rgba('#f4ecd6', a * 0.5); ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(s.x - s.s * 3, s.y); ctx.lineTo(s.x + s.s * 3, s.y); ctx.moveTo(s.x, s.y - s.s * 3); ctx.lineTo(s.x, s.y + s.s * 3); ctx.stroke();
    }
  }
  ctx.restore();
}

// Tiny red lights in the treeline (pulse softly).
function horizonLights(ctx, env, o) {
  const { horizonY, t = 0, amount = 1, seed = 33 } = o;
  if (amount <= 0) return;
  const r = C.rng(seed);
  for (let i = 0; i < 14; i++) {
    const x = SX0 + r() * SW, y = horizonY - 4 - r() * 14, ph = r() * 6;
    const a = amount * (0.55 + 0.45 * Math.sin(t * 1.3 + ph));
    C.glow(ctx, x, y, 14, '#ff5a3a', 0.5 * a);
    ctx.fillStyle = C.rgba('#ffb08a', a);
    ctx.fillRect(x - 1.2, y - 1.2, 2.4, 2.4);
  }
}

// Full sky. warmth in [0,1] crossfades the red and calm layers.
function drawSky(ctx, env, o = {}) {
  const { horizonY = 470, warmth = 1, t = 0, starAmount = 0.5, seed = 7 } = o;
  const warmL = skyLayer(env, horizonY, true, seed);
  const calmL = skyLayer(env, horizonY, false, seed);
  if (warmth < 1) C.blit(ctx, calmL, SX0, -200, 1);
  if (warmth > 0) C.blit(ctx, warmL, SX0, -200, warmth < 1 ? warmth : 1);
  stars(ctx, env, { t, amount: starAmount, maxY: horizonY - 60, warmFade: warmth });
  horizonLights(ctx, env, { horizonY, t, amount: warmth });
}

module.exports = { drawSky, stars, horizonLights, SX0, SX1 };
