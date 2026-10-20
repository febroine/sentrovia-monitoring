'use strict';
// Core drawing kit: canvas creation, fonts, deterministic noise, colour, easing,
// procedural textures (paper grain, gouache mottle, pencil hatching) and painted fills.
// Every visual in the film is built from these primitives. See docs/ANIMATION_GUIDE.md.

const path = require('path');
const { createCanvas, GlobalFonts, Path2D, DOMMatrix } = require('@napi-rs/canvas');

const ROOT = path.join(__dirname, '..', '..');
const W = 1920;
const H = 1080;
const FPS = 30;
const FRAMES = 900;

// ---------------------------------------------------------------- fonts
let fontsReady = false;
function registerFonts() {
  if (fontsReady) return;
  const f = (file, alias) => GlobalFonts.registerFromPath(path.join(ROOT, 'fonts', file), alias);
  f('Alegreya-Regular.ttf', 'Alegreya');
  f('Alegreya-Medium.ttf', 'AlegreyaMedium');
  f('Alegreya-Italic.ttf', 'AlegreyaItalic');
  f('Figtree-Regular.ttf', 'Figtree');
  f('Figtree-SemiBold.ttf', 'FigtreeSemi');
  f('Figtree-Bold.ttf', 'FigtreeBold');
  fontsReady = true;
}
// Font shorthands: serif = her words, sans = product line.
const FONT = {
  serif: (px) => `${px}px Alegreya`,
  serifMed: (px) => `${px}px AlegreyaMedium`,
  serifIt: (px) => `${px}px AlegreyaItalic`,
  sans: (px) => `${px}px Figtree`,
  sansSemi: (px) => `${px}px FigtreeSemi`,
  sansBold: (px) => `${px}px FigtreeBold`,
};

// ---------------------------------------------------------------- math
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, k) => a + (b - a) * k;
const invLerp = (a, b, v) => clamp((v - a) / (b - a));
const smooth = (k) => { k = clamp(k); return k * k * (3 - 2 * k); };
const ease = {
  inOutSine: (k) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(k)),
  outSine: (k) => Math.sin((Math.PI / 2) * clamp(k)),
  inSine: (k) => 1 - Math.cos((Math.PI / 2) * clamp(k)),
  inOutCubic: (k) => { k = clamp(k); return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; },
  outCubic: (k) => 1 - Math.pow(1 - clamp(k), 3),
  inCubic: (k) => Math.pow(clamp(k), 3),
  outQuint: (k) => 1 - Math.pow(1 - clamp(k), 5),
};
// Normalised progress of t through [a,b], optionally eased.
const seg = (t, a, b, fn) => { const k = invLerp(a, b, t); return fn ? fn(k) : k; };
// Characters animate on twos (15 fps): quantise time for character motion.
const twos = (t) => Math.floor(t * 15 + 1e-6) / 15;
// Value at 1 inside [a,b] with soft ramps of length r on both sides.
const window_ = (t, a, b, r) => Math.min(seg(t, a - r, a, ease.inOutSine), 1 - seg(t, b, b + r, ease.inOutSine));

// ---------------------------------------------------------------- rng + noise
function rng(seed) {
  let a = (seed >>> 0) || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + (hi - lo) * next();
  next.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * next());
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.gauss = () => (next() + next() + next() - 1.5) / 1.5;
  return next;
}
function hash2(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function fbm(x, y, oct = 4, seed = 0) {
  let s = 0, amp = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += amp * vnoise(x * f, y * f, seed + i * 31); n += amp; amp *= 0.5; f *= 2.03; }
  return s / n;
}

// ---------------------------------------------------------------- colour
function hex2rgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
const toHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
function mix(a, b, k) {
  const A = hex2rgb(a), B = hex2rgb(b);
  return toHex(lerp(A[0], B[0], k), lerp(A[1], B[1], k), lerp(A[2], B[2], k));
}
function rgba(hex, a) { const [r, g, b] = hex2rgb(hex); return `rgba(${r},${g},${b},${a})`; }
// Shift value (lightness-ish) of a hex colour by k in [-1,1].
const shade = (hex, k) => (k >= 0 ? mix(hex, '#ffffff', k) : mix(hex, '#000000', -k));

// ---------------------------------------------------------------- canvas helpers
function canvas(w, h) { return createCanvas(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h))); }
// Build an offscreen layer in world units (w x h) at resolution `res` px per unit.
function layer(w, h, res, draw) {
  const c = canvas(w * res, h * res);
  const x = c.getContext('2d');
  x.scale(res, res);
  draw(x, c);
  c.worldW = w; c.worldH = h; c.res = res;
  return c;
}
// Draw a layer built with layer() at world position (x,y), honouring its world size.
function blit(ctx, lay, x = 0, y = 0, alpha = 1) {
  if (alpha <= 0) return;
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * alpha;
  ctx.drawImage(lay, x, y, lay.worldW, lay.worldH);
  ctx.globalAlpha = a;
}
function withState(ctx, fn) { ctx.save(); try { fn(ctx); } finally { ctx.restore(); } }

// ---------------------------------------------------------------- textures (cached per process)
const TEX = new Map();
function cached(key, make) { if (!TEX.has(key)) TEX.set(key, make()); return TEX.get(key); }

// Screen-space paper grain, near-white, for 'multiply'. Fibres + tooth + low-frequency cockle.
function grainTexture(w, h, seed = 1) {
  return cached(`grain:${w}x${h}:${seed}`, () => {
    const c = canvas(w, h), x = c.getContext('2d');
    const img = x.createImageData(c.width, c.height), d = img.data;
    const r = rng(seed);
    for (let j = 0; j < c.height; j++) {
      for (let i = 0; i < c.width; i++) {
        const tooth = r();
        const cockle = vnoise(i / 140, j / 140, seed) * 0.6 + vnoise(i / 37, j / 37, seed + 7) * 0.4;
        let v = 1 - 0.085 * tooth * tooth - 0.075 * cockle;
        const k = (j * c.width + i) * 4;
        d[k] = 255 * v; d[k + 1] = 255 * (v - 0.004); d[k + 2] = 255 * (v - 0.016); d[k + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
    // fibres: short faint curved strokes, batched
    x.lineWidth = Math.max(0.6, w / 2400);
    x.strokeStyle = 'rgba(90,70,50,0.07)';
    x.beginPath();
    const nF = Math.floor((w * h) / 2600);
    for (let n = 0; n < nF; n++) {
      const px = r() * w, py = r() * h, a = r() * Math.PI * 2, L = 4 + r() * 16;
      x.moveTo(px, py);
      x.quadraticCurveTo(px + Math.cos(a + 0.6) * L * 0.5, py + Math.sin(a + 0.6) * L * 0.5, px + Math.cos(a) * L, py + Math.sin(a) * L);
    }
    x.stroke();
    x.strokeStyle = 'rgba(255,255,255,0.10)';
    x.beginPath();
    for (let n = 0; n < nF / 2; n++) {
      const px = r() * w, py = r() * h, a = r() * Math.PI * 2, L = 3 + r() * 10;
      x.moveTo(px, py); x.lineTo(px + Math.cos(a) * L, py + Math.sin(a) * L);
    }
    x.stroke();
    return c;
  });
}

// Gouache mottle tile: grey around 128 for 'soft-light' (darker/lighter blotches + brush drag).
function mottleTile(size = 512, seed = 3) {
  return cached(`mottle:${size}:${seed}`, () => {
    const c = canvas(size, size), x = c.getContext('2d');
    const img = x.createImageData(size, size), d = img.data;
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        // tileable by sampling on a torus-ish wrap (periodic lattice)
        const u = i / size, v = j / size;
        const n1 = periodicNoise(u * 6, v * 6, 6, seed);
        const n2 = periodicNoise(u * 24, v * 6, 24, seed + 5); // horizontal brush drag
        const n3 = periodicNoise(u * 48, v * 48, 48, seed + 9);
        const g = 128 + (n1 - 0.5) * 120 + (n2 - 0.5) * 50 + (n3 - 0.5) * 36;
        const k = (j * size + i) * 4;
        d[k] = d[k + 1] = d[k + 2] = clamp(g, 0, 255); d[k + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
    return c;
  });
}
// value noise with lattice period p (x,y in lattice units) -> seamless tiles
function periodicNoise(x, y, p, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const m = (v) => ((v % p) + p) % p;
  const a = hash2(m(ix), m(iy), seed), b = hash2(m(ix + 1), m(iy), seed);
  const c = hash2(m(ix), m(iy + 1), seed), d = hash2(m(ix + 1), m(iy + 1), seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

// Pencil hatching tile: parallel jittered strokes at `angle` degrees, coloured, transparent bg.
function hatchTile(color = '#2b2330', angle = 35, spacing = 7, size = 384, seed = 11, weight = 1) {
  return cached(`hatch:${color}:${angle}:${spacing}:${size}:${seed}:${weight}`, () => {
    const c = canvas(size, size), x = c.getContext('2d');
    const r = rng(seed);
    const a = (angle * Math.PI) / 180, dx = Math.cos(a), dy = Math.sin(a);
    const nx = -dy, ny = dx;
    x.strokeStyle = color; x.lineCap = 'round';
    // draw 3x3 copies so the tile wraps cleanly
    const passes = [[0.9 * weight, 0.55], [0.55 * weight, 0.35]];
    for (const [lw, al] of passes) {
      x.lineWidth = lw; x.globalAlpha = al;
      x.beginPath();
      const span = size * 1.5;
      for (let s = -span; s < span; s += spacing * (0.75 + r() * 0.5)) {
        // broken strokes along the line
        let u = -span + r() * 40;
        while (u < span) {
          const L = 30 + r() * 90;
          const ox = size / 2 + nx * s + dx * u, oy = size / 2 + ny * s + dy * u;
          const j = (r() - 0.5) * 1.6;
          for (const [tx, ty] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
            x.moveTo(ox + tx + nx * j, oy + ty + ny * j);
            x.lineTo(ox + tx + dx * L - nx * j, oy + ty + dy * L - ny * j);
          }
          u += L + 6 + r() * 30;
        }
      }
      x.stroke();
    }
    return c;
  });
}

// ---------------------------------------------------------------- painted fills
// Fill a Path2D (in current user space) as gouache + pencil:
//   base fill -> soft-light mottle -> pencil hatch in hatchColor -> optional rim/edge darkening.
// Textures are anchored to the current transform, so translate to the object's origin first
// if it moves (avoids the "shower door" effect).
function paint(ctx, p, o = {}) {
  const {
    fill = '#888888', mottle = 0.45, mottleScale = 1, hatch = 0.12, hatchColor = '#2b2330',
    hatchAngle = 35, hatchSpacing = 7, hatchScale = 1, seed = 3, edge = 0, edgeColor = null,
  } = o;
  ctx.fillStyle = fill;
  ctx.fill(p);
  if (mottle <= 0 && hatch <= 0 && edge <= 0) return;
  ctx.save();
  ctx.clip(p);
  if (mottle > 0) {
    const pat = ctx.createPattern(mottleTile(512, seed % 7), 'repeat');
    if (mottleScale !== 1) pat.setTransform(new DOMMatrix().scale(mottleScale, mottleScale));
    ctx.globalAlpha = mottle; ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = pat; ctx.fillRect(-4000, -4000, 12000, 12000);
  }
  if (hatch > 0) {
    const pat = ctx.createPattern(hatchTile(hatchColor, hatchAngle, hatchSpacing, 384, 11 + (seed % 5)), 'repeat');
    if (hatchScale !== 1) pat.setTransform(new DOMMatrix().scale(hatchScale, hatchScale));
    ctx.globalAlpha = hatch; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = pat; ctx.fillRect(-4000, -4000, 12000, 12000);
  }
  if (edge > 0) {
    ctx.globalAlpha = edge; ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = edgeColor || shade(fill, -0.35); ctx.lineWidth = 6;
    ctx.filter = 'blur(3px)'; ctx.stroke(p); ctx.filter = 'none';
  }
  ctx.restore();
}

// Cel fill for characters: flat colour, no mottle, faint grain only.
function cel(ctx, p, fill, o = {}) {
  ctx.fillStyle = fill;
  ctx.fill(p);
  if (o.texture !== false) paint(ctx, p, { fill, mottle: o.mottle ?? 0.12, hatch: 0, seed: o.seed ?? 5 });
}
// Warm dark character line. Slight double pass gives a pencil-inked feel.
function ink(ctx, p, o = {}) {
  const { color = '#4b2f2b', width = 2, alpha = 1 } = o;
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha * 0.9; ctx.lineWidth = width; ctx.stroke(p);
  ctx.globalAlpha = alpha * 0.25; ctx.lineWidth = width * 1.9; ctx.stroke(p);
  ctx.restore();
}

// Hand-drawn stroke along points with jitter; multiple light passes = coloured pencil.
function pencil(ctx, pts, o = {}) {
  const { color = '#2b2330', width = 1.2, alpha = 0.6, passes = 2, jitter = 0.8, seed = 1 } = o;
  const r = rng(seed);
  ctx.save();
  ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let p = 0; p < passes; p++) {
    ctx.globalAlpha = alpha * (p === 0 ? 1 : 0.5);
    ctx.lineWidth = width * (p === 0 ? 1 : 0.7);
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
      const jx = (r() - 0.5) * jitter, jy = (r() - 0.5) * jitter;
      if (i === 0) ctx.moveTo(x + jx, y + jy); else ctx.lineTo(x + jx, y + jy);
    });
    ctx.stroke();
  }
  ctx.restore();
}

// Soft radial glow (screen blend). Used for horizon lights, page glow, red pulse.
function glow(ctx, x, y, r, color, alpha = 1, op = 'screen') {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = op;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(0.35, rgba(color, alpha * 0.45));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

// Text helper. Returns measured width.
function text(ctx, str, x, y, o = {}) {
  const { font = FONT.serif(48), color = '#2b2330', align = 'left', baseline = 'alphabetic', alpha = 1 } = o;
  ctx.save();
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = baseline;
  ctx.globalAlpha *= alpha;
  ctx.fillText(str, x, y);
  const w = ctx.measureText(str).width;
  ctx.restore();
  return w;
}

// SVG-path-string to Path2D, with optional affine (scale/translate) baked in by the caller's transform.
const P = (d) => new Path2D(d);

module.exports = {
  ROOT, W, H, FPS, FRAMES, Path2D, createCanvas, registerFonts, FONT,
  clamp, lerp, invLerp, smooth, ease, seg, twos, window: window_,
  rng, hash2, vnoise, fbm, hex2rgb, toHex, mix, rgba, shade,
  canvas, layer, blit, withState, cached, grainTexture, mottleTile, hatchTile,
  paint, cel, ink, pencil, glow, text, P,
};
