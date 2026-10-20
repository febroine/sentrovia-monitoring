'use strict';
// Stage: output modes (landscape / native vertical crop), camera, screen-space UI space,
// per-render layer cache, and the final post pass (paper grain on twos + vignette).

const { W, H, canvas, grainTexture, clamp } = require('./core');

// mode: 'landscape' (1920x1080 * scale) or 'vertical' (1080x1920 * scale, native crop of the world)
function makeEnv({ mode = 'landscape', scale = 1 } = {}) {
  const vertical = mode === 'vertical';
  const outW = Math.round((vertical ? 1080 : 1920) * scale);
  const outH = Math.round((vertical ? 1920 : 1080) * scale);
  const s = vertical ? (outH / H) : (outW / W); // world px -> output px at zoom 1
  const env = {
    mode, vertical, scale, outW, outH, s,
    // resolution for cached world layers (headroom for slow pushes up to ~1.12)
    res: s * 1.12,
    // UI space: 1920x1080 landscape or 1080x1920 vertical, in "design px"
    uiW: vertical ? 1080 : 1920, uiH: vertical ? 1920 : 1080, uiScale: outW / (vertical ? 1080 : 1920),
    cache: new Map(),
  };
  // Lazily build and keep a per-env object (layers, sprites...). key must be unique per shot/use.
  env.once = (key, make) => { if (!env.cache.has(key)) env.cache.set(key, make()); return env.cache.get(key); };
  return env;
}

// Set the world camera. cam: { cx, cy, zoom, vx }  (world point at screen centre).
// In vertical mode the camera centres on vx (the shot's vertical focus) and the
// visible world strip is ~607/zoom px wide, clamped to [0, W].
function camera(ctx, env, cam = {}) {
  const zoom = cam.zoom ?? 1;
  let cx = cam.cx ?? W / 2;
  const cy = cam.cy ?? H / 2;
  const k = env.s * zoom;
  if (env.vertical) {
    cx = cam.vx ?? cx;
    const half = env.outW / k / 2;
    cx = clamp(cx, half, W - half);
  }
  ctx.setTransform(k, 0, 0, k, env.outW / 2 - cx * k, env.outH / 2 - cy * k);
}
// Parallax helper: same camera but layer moves `depth` (0 = fixed to screen, 1 = full world motion).
function parallax(ctx, env, cam, depth) {
  const c = { ...cam };
  c.cx = W / 2 + ((cam.cx ?? W / 2) - W / 2) * depth;
  c.cy = H / 2 + ((cam.cy ?? H / 2) - H / 2) * depth;
  if (cam.vx != null) c.vx = W / 2 + (cam.vx - W / 2) * 1; // vertical framing always follows the focus
  c.zoom = 1 + ((cam.zoom ?? 1) - 1) * depth;
  camera(ctx, env, c);
}
// Screen-space UI transform (design px: 1920x1080 or 1080x1920).
function ui(ctx, env) { ctx.setTransform(env.uiScale, 0, 0, env.uiScale, 0, 0); }
function identity(ctx) { ctx.setTransform(1, 0, 0, 1, 0, 0); }

// Final pass: grain boils on twos (3 tiles), soft vignette. strength 0 disables (e.g. pure black).
function post(ctx, env, frame, o = {}) {
  const { grain = 0.6, vignette = 0.35 } = o;
  identity(ctx);
  if (grain > 0) {
    const g = env.once('post:grain:' + (Math.floor(frame / 2) % 3), () => grainTexture(env.outW, env.outH, 1 + (Math.floor(frame / 2) % 3)));
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = grain;
    ctx.drawImage(g, 0, 0);
    ctx.restore();
  }
  if (vignette > 0) {
    const v = env.once('post:vignette', () => {
      const c = canvas(env.outW, env.outH), x = c.getContext('2d');
      const r = Math.hypot(env.outW, env.outH) / 2;
      const gr = x.createRadialGradient(env.outW / 2, env.outH / 2, r * 0.45, env.outW / 2, env.outH / 2, r * 1.05);
      gr.addColorStop(0, 'rgba(16,12,30,0)');
      gr.addColorStop(1, 'rgba(16,12,30,1)');
      x.fillStyle = gr; x.fillRect(0, 0, env.outW, env.outH);
      return c;
    });
    ctx.save();
    ctx.globalAlpha = vignette;
    ctx.drawImage(v, 0, 0);
    ctx.restore();
  }
}

module.exports = { makeEnv, camera, parallax, ui, identity, post };
