'use strict';
// Hand-painted botanicals (ref1/ref4 grammar): silver agave, dense lanceolate leaf masses,
// night-pink blooms, grass, yellow-bud stalks, and a stone bank.
// All functions draw in the caller's current transform and are meant to be baked into cached
// layers (env.once + C.layer) — they are too heavy to redraw every frame.
// light: { key: colour of the sky light from above, rim: colour of the horizon rim, rimSide: -1 | 1 }

const C = require('./core');
const PAL = require('./palette');

const NIGHT = { key: '#8ea2dc', rim: '#ef8a3c', rimSide: 1, dark: 0.0 };

// Lanceolate leaf added to path p. (x,y) base, len, wid, ang (radians, 0 = up), bend
function leafPath(p, x, y, len, wid, ang, bend = 0) {
  const s = Math.sin(ang), c = -Math.cos(ang);
  const tx = x + s * len + Math.cos(ang) * bend * len, ty = y + c * len + Math.sin(ang) * bend * len;
  const mx = x + s * len * 0.45, my = y + c * len * 0.45;
  const nx = Math.cos(ang) * wid, ny = Math.sin(ang) * wid;
  p.moveTo(x, y);
  p.quadraticCurveTo(mx + nx, my + ny, tx, ty);
  p.quadraticCurveTo(mx - nx, my - ny, x, y);
  return { tx, ty, mx, my };
}

// Silver agave rosette (ref4). size ~ height in px.
function agave(x, cx, cy, size, seed = 1, light = NIGHT) {
  const r = C.rng(seed);
  const blades = [];
  const n = 18 + Math.floor(r() * 10);
  for (let i = 0; i < n; i++) {
    const a = (r() - 0.5) * 2.6;           // spread
    const len = size * (0.45 + r() * 0.65) * (1 - Math.abs(a) * 0.18);
    const droop = (r() - 0.3) * 0.5 + Math.sign(a) * Math.abs(a) * 0.25;
    blades.push({ a, len, droop, w: size * (0.05 + r() * 0.04), depth: r() });
  }
  blades.sort((p, q) => p.depth - q.depth);
  for (const b of blades) {
    const p = new C.Path2D();
    const s = Math.sin(b.a), c = -Math.cos(b.a);
    const tip = { x: cx + s * b.len + b.droop * b.len * Math.sign(s || 1) * 0.6, y: cy + c * b.len + Math.abs(b.droop) * b.len * 0.55 };
    const ctrl = { x: cx + s * b.len * 0.55, y: cy + c * b.len * 0.75 };
    const nx = -c * b.w, ny = s * b.w;
    p.moveTo(cx - nx, cy - ny);
    p.quadraticCurveTo(ctrl.x - nx * 0.9, ctrl.y - ny * 0.9, tip.x, tip.y);
    p.quadraticCurveTo(ctrl.x + nx * 0.9, ctrl.y + ny * 0.9, cx + nx, cy + ny);
    p.closePath();
    const tone = C.mix(PAL.agaveShade, PAL.agave, 0.3 + b.depth * 0.7);
    const fill = C.mix(tone, light.key, 0.18);
    C.paint(x, p, { fill, mottle: 0.5, hatch: 0.16, hatchColor: C.shade(PAL.agaveShade, -0.4), hatchAngle: (b.a * 180) / Math.PI + 80, hatchSpacing: 5, seed: seed + 3 });
    // midrib + light edge
    x.save();
    x.lineCap = 'round';
    x.strokeStyle = C.rgba(PAL.agaveLight, 0.55); x.lineWidth = Math.max(1, b.w * 0.25);
    x.beginPath(); x.moveTo(cx + nx * 0.6, cy + ny * 0.6); x.quadraticCurveTo(ctrl.x + nx * 0.5, ctrl.y + ny * 0.5, tip.x, tip.y); x.stroke();
    x.strokeStyle = C.rgba(PAL.agaveShade, 0.7); x.lineWidth = Math.max(0.8, b.w * 0.12);
    x.beginPath(); x.moveTo(cx, cy); x.quadraticCurveTo(ctrl.x, ctrl.y, tip.x, tip.y); x.stroke();
    if (light.rim && Math.sign(s) === light.rimSide) {
      x.strokeStyle = C.rgba(light.rim, 0.35); x.lineWidth = Math.max(0.8, b.w * 0.15);
      x.beginPath(); x.moveTo(cx + nx, cy + ny); x.quadraticCurveTo(ctrl.x + nx * 0.9, ctrl.y + ny * 0.9, tip.x, tip.y); x.stroke();
    }
    x.restore();
  }
}

// Dense leaf mass (ref1 oleander wall). Fills an ellipse-ish region (cx,cy,w,h) with ~count leaves.
// Painted back-to-front in value layers: deep -> mid -> light, each batched into one path.
function leafMass(x, cx, cy, w, h, seed = 1, o = {}) {
  const { count = 260, len = 46, light = NIGHT, tint = 0 } = o;
  const r = C.rng(seed);
  const layers = [
    { col: PAL.leafDeep, k: 1.0 }, { col: PAL.leaf, k: 0.8 }, { col: PAL.leafMid, k: 0.55 }, { col: PAL.leafLight, k: 0.3 },
  ];
  // underpaint: a dark blob so gaps read as depth, not holes
  const under = new C.Path2D();
  under.ellipse(cx, cy, w * 0.48, h * 0.46, 0, 0, Math.PI * 2);
  C.paint(x, under, { fill: C.mix(PAL.leafDeep, PAL.night0, 0.45), mottle: 0.5, hatch: 0.12, hatchColor: '#0a120e', seed });
  for (const L of layers) {
    const p = new C.Path2D();
    const ribs = [];
    const n = Math.floor(count * L.k * 0.5);
    for (let i = 0; i < n; i++) {
      // sample inside ellipse, biased to the top for lighter layers (light from above)
      const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * L.k;
      const px = cx + Math.cos(a) * w * 0.5 * rr;
      const py = cy + Math.sin(a) * h * 0.5 * rr - (1 - L.k) * h * 0.18;
      const ll = len * (0.6 + r() * 0.7), ang = (r() - 0.5) * 2.4 + (px - cx) / w * 1.2;
      const info = leafPath(p, px, py, ll, ll * 0.16, ang, (r() - 0.5) * 0.25);
      ribs.push([px, py, info.tx, info.ty]);
    }
    const fill = C.mix(C.mix(L.col, light.key, 0.12), PAL.bloom, tint);
    C.paint(x, p, { fill, mottle: 0.4, hatch: 0.1, hatchColor: '#0d1a12', hatchAngle: 50, hatchSpacing: 5, seed: seed + 1 });
    x.save();
    x.strokeStyle = C.rgba(C.shade(L.col, 0.35), 0.35); x.lineWidth = 0.9; x.beginPath();
    for (const [a1, b1, a2, b2] of ribs) { x.moveTo(a1, b1); x.lineTo(a1 + (a2 - a1) * 0.85, b1 + (b2 - b1) * 0.85); }
    x.stroke();
    x.restore();
  }
}

// Clustered 5-petal blooms (ref1 grammar, night-tinted). n flowers within radius rad.
function blooms(x, cx, cy, rad, seed = 1, o = {}) {
  const { n = 9, size = 14, col = PAL.bloom, light = NIGHT, night = 0.35 } = o;
  const r = C.rng(seed);
  const base = C.mix(col, light.key, night * 0.5);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * rad;
    const fx = cx + Math.cos(a) * d, fy = cy + Math.sin(a) * d * 0.7, s = size * (0.7 + r() * 0.5);
    const p = new C.Path2D();
    const rot = r() * 6.28;
    for (let k = 0; k < 5; k++) {
      const pa = rot + (k * Math.PI * 2) / 5;
      p.ellipse(fx + Math.cos(pa) * s * 0.55, fy + Math.sin(pa) * s * 0.55, s * 0.55, s * 0.38, pa, 0, Math.PI * 2);
    }
    C.paint(x, p, { fill: C.mix(base, '#ffffff', r() * 0.2), mottle: 0.4, hatch: 0.12, hatchColor: C.shade(col, -0.5), hatchSpacing: 4, seed: seed + i });
    x.fillStyle = C.rgba(C.shade(col, -0.45), 0.8);
    x.beginPath(); x.arc(fx, fy, s * 0.18, 0, Math.PI * 2); x.fill();
    x.fillStyle = C.rgba('#f6e6a0', 0.7);
    for (let k = 0; k < 4; k++) { x.beginPath(); x.arc(fx + (r() - 0.5) * s * 0.3, fy + (r() - 0.5) * s * 0.3, 0.9, 0, Math.PI * 2); x.fill(); }
  }
}

// Grass tufts along a strip [x0, x0+w] rooted at y. Thin painted blades, batched by tone.
function grass(x, x0, y, w, h, seed = 1, o = {}) {
  const { density = 1, light = NIGHT } = o;
  const r = C.rng(seed);
  const tones = [PAL.leafDeep, PAL.leaf, PAL.leafMid, C.mix(PAL.leafLight, light.key, 0.2)];
  for (const tone of tones) {
    x.save();
    x.strokeStyle = tone; x.lineCap = 'round';
    x.lineWidth = 1.6;
    x.beginPath();
    const n = Math.floor((w / 3) * density * 0.25);
    for (let i = 0; i < n; i++) {
      const bx = x0 + r() * w, bh = h * (0.3 + r() * 0.7), lean = (r() - 0.5) * bh * 0.6;
      x.moveTo(bx, y + r() * 6);
      x.quadraticCurveTo(bx + lean * 0.3, y - bh * 0.6, bx + lean, y - bh);
    }
    x.stroke();
    x.restore();
  }
}

// Tall agave flower stalk with yellow bud clusters (ref4 grammar).
function budStalk(x, bx, by, h, seed = 1, o = {}) {
  const { lean = 0.08, light = NIGHT } = o;
  const r = C.rng(seed);
  const tx = bx + h * lean;
  x.save();
  x.strokeStyle = C.mix('#6f7a4a', light.key, 0.2); x.lineWidth = 3; x.lineCap = 'round';
  x.beginPath(); x.moveTo(bx, by); x.quadraticCurveTo(bx + h * lean * 0.2, by - h * 0.6, tx, by - h); x.stroke();
  for (let i = 0; i < 9; i++) {
    const k = 0.45 + i * 0.065;
    const px = bx + (tx - bx) * k * k, py = by - h * k;
    const side = i % 2 ? 1 : -1, L = 16 + r() * 18;
    x.strokeStyle = C.mix('#7d8a50', light.key, 0.15); x.lineWidth = 1.4;
    x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + side * L * 0.6, py - 4, px + side * L, py - 10 - r() * 6); x.stroke();
    for (let b = 0; b < 6; b++) {
      const qx = px + side * L * (0.5 + r() * 0.6), qy = py - 8 - r() * 12;
      x.fillStyle = C.mix('#e2c84a', '#f2e28a', r());
      x.beginPath(); x.arc(qx, qy, 2.2 + r() * 2, 0, Math.PI * 2); x.fill();
      x.fillStyle = 'rgba(80,60,20,0.5)'; x.beginPath(); x.arc(qx + 0.8, qy + 0.8, 1, 0, Math.PI * 2); x.fill();
    }
  }
  x.restore();
}

// Flat stone bank slab with painted texture, cracks and moss. Top edge at y0, spans x0..x1.
function stoneBank(x, x0, y0, x1, y1, seed = 1, o = {}) {
  const { light = NIGHT } = o;
  const r = C.rng(seed);
  const p = new C.Path2D();
  p.moveTo(x0, y0 + 6);
  for (let k = 0; k <= 20; k++) p.lineTo(x0 + ((x1 - x0) * k) / 20, y0 + (r() - 0.5) * 6);
  p.lineTo(x1, y1); p.lineTo(x0, y1); p.closePath();
  const g = x.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, C.mix(PAL.stoneLight, light.key, 0.25)); g.addColorStop(0.15, C.mix(PAL.stone, light.key, 0.2)); g.addColorStop(1, C.mix(PAL.stoneShade, PAL.night0, 0.4));
  C.paint(x, p, { fill: g, mottle: 0.7, hatch: 0.16, hatchColor: '#1d1b22', hatchAngle: 20, hatchSpacing: 6, seed });
  // lip highlight
  x.save();
  x.strokeStyle = C.rgba('#e9e4d4', 0.4); x.lineWidth = 2;
  x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y0); x.stroke();
  // cracks and slab joints
  x.strokeStyle = 'rgba(30,26,34,0.45)'; x.lineWidth = 1.1;
  x.beginPath();
  for (let i = 0; i < 14; i++) {
    let cx = x0 + r() * (x1 - x0), cy = y0 + r() * (y1 - y0);
    x.moveTo(cx, cy);
    for (let k = 0; k < 5; k++) { cx += (r() - 0.5) * 40; cy += r() * 18; x.lineTo(cx, cy); }
  }
  for (let jx = x0 + 180 + r() * 100; jx < x1; jx += 260 + r() * 160) { x.moveTo(jx, y0 + 2); x.lineTo(jx - 30, y1); }
  x.stroke();
  // speckles
  for (let i = 0; i < 400; i++) {
    x.fillStyle = r() < 0.5 ? 'rgba(30,26,34,0.25)' : 'rgba(240,235,220,0.18)';
    x.fillRect(x0 + r() * (x1 - x0), y0 + r() * (y1 - y0), 1.5, 1.5);
  }
  x.restore();
}

module.exports = { NIGHT, leafPath, agave, leafMass, blooms, grass, budStalk, stoneBank };
