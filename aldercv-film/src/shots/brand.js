'use strict';
// BRAND chapter — S6 (page lifts, river -> starry sea, page resolves into the aldercv.com CV) and
// S7 (tagline + URL, she looks up). See docs/shotlist.md and docs/ANIMATION_GUIDE.md.
//
//   S6a 22.0–24.4  bank (page chapter's bankScene, reframed): the finished page lifts from her knees,
//                  rises and glows; the river calms into a starry sea. Camera tilts up ~60 px.
//   S6b 24.4–27.0  insert: the glowing page fills frame and resolves (24.4–24.6) into the clean
//                  aldercv.com CV inside a minimal teal brand frame. Warm chord at 24.5. Push 1.00→1.04.
//   S7  27.0–29.0  bust MCU against the starry sea, page glow on her face; tagline at 27.0, URL +
//                  logo at 27.6 (bell); she looks up at 27.9 (on twos). Push 1.00→1.03.

const C = require('../lib/core');
const PAL = require('../lib/palette');
const STORY = require('../lib/story');
const { camera, parallax, ui } = require('../lib/stage');
const { drawSky } = require('../lib/sky');
const { createRiver } = require('../lib/river');
const girl = require('../lib/girl');
const { leafPath } = require('../lib/botany');

// ------------------------------------------------------------------ shared timing (river chapter)
// Prefer the river chapter's closed-form curves; fall back to the agreed numbers.
let RIVER_FNS = null;
function riverFns() {
  if (RIVER_FNS) return RIVER_FNS;
  let R = {};
  try { R = require('../lib/river'); } catch (e) { R = {}; }
  RIVER_FNS = {
    flowPhase: typeof R.flowPhase === 'function' ? R.flowPhase : (T) => 1.2 * 12 + 1.5 + 0.1 * Math.max(0, T - 14.5),
    calmAt: typeof R.calmAt === 'function' ? R.calmAt : (T) => C.lerp(0.3, 1, C.seg(T, 22.4, 24.0, C.ease.inOutSine)),
    warmthAt: typeof R.warmthAt === 'function' ? R.warmthAt : (T) => C.lerp(0.75, 0, C.seg(T, 22.4, 24.0, C.ease.inOutSine)),
  };
  return RIVER_FNS;
}
// Page chapter exports (bankScene / drawFinishedPage) — optional, resolved lazily.
let PAGE_FNS;
function pageFns() {
  if (PAGE_FNS !== undefined) return PAGE_FNS;
  try { PAGE_FNS = require('./page'); } catch (e) { PAGE_FNS = {}; }
  return PAGE_FNS;
}

// ------------------------------------------------------------------ the real aldercv.com logo
// Path data straight from refs/brand_icon.svg (viewBox 0 0 64 64, leaf group at translate 8.32 scale .74).
const LOGO_STEM = 'M15.7 58.42L16.21 57.45L16.72 56.49L17.23 55.54L17.73 54.6L18.24 53.66L18.74 52.72L19.24 51.8L19.74 50.88L20.24 49.97L20.73 49.06L21.23 48.16L21.72 47.27L22.21 46.38L22.69 45.5A2.6 2.6 0 0 0 18.15 42.98L17.66 43.86L17.16 44.76L16.67 45.66L16.17 46.56L15.67 47.48L15.17 48.4L14.67 49.32L14.16 50.25L13.66 51.19L13.15 52.14L12.64 53.09L12.13 54.05L11.62 55.01L11.1 55.98A2.6 2.6 0 0 0 15.7 58.42Z';
const LOGO_LEAF = 'M19.82 43.44C10.76 33.85 9.92 21.23 16.11 12.71C23.26 2.88 33.57 1.36 39.86 5.93C42.48 7.84 43.1 10.29 41.91 13.03C44.15 11.05 46.68 10.89 49.3 12.79C55.59 17.36 57.33 27.64 50.19 37.47C44 45.99 31.73 49.09 19.82 43.44ZM24.47 40.01L25.62 38.34L40.6 36.54L40.48 35.19L27.38 35.81L30.98 30.62L47.94 29.69L47.91 28.33L32.73 28.09L36.24 23.03L48.43 21.62L48.33 20.26L38 20.5L39.8 17.9L40.01 15.65L37.93 16.55L36.02 19.06L33.06 9.16L31.73 9.48L34.16 21.51L30.43 26.42L25.51 12.06L24.2 12.45L28.57 28.87L24.74 33.9L21.28 21.24L19.96 21.55L22.88 36.35L21.65 37.96Z';
let LOGO_PATHS = null;
// Draw the mark with its top-left at (x,y), `size` px square. o.square: draw the rounded teal tile.
function drawLogo(ctx, x, y, size, o = {}) {
  if (!LOGO_PATHS) LOGO_PATHS = { stem: C.P(LOGO_STEM), leaf: C.P(LOGO_LEAF) };
  ctx.save();
  ctx.translate(x, y); ctx.scale(size / 64, size / 64);
  ctx.globalAlpha *= o.alpha ?? 1;
  if (o.square !== false) {
    ctx.fillStyle = o.tile || PAL.brandTeal;
    ctx.beginPath(); ctx.roundRect(0, 0, 64, 64, 14); ctx.fill();
    if (o.ring) { ctx.strokeStyle = o.ring; ctx.lineWidth = o.ringW ?? 1.2; ctx.stroke(); }
  }
  ctx.translate(8.32, 8.32); ctx.scale(0.74, 0.74);
  ctx.fillStyle = PAL.brandPaper; ctx.fill(LOGO_PATHS.stem);
  ctx.fillStyle = PAL.brandAmber; ctx.fill(LOGO_PATHS.leaf, 'evenodd');
  ctx.restore();
}

// ------------------------------------------------------------------ small alder leaf (S5 motif)
function alderLeaf(ctx, x, y, len, ang, o = {}) {
  const p = new C.Path2D();
  const info = leafPath(p, x, y, len, len * 0.3, ang, o.bend ?? 0.08);
  ctx.save();
  ctx.globalAlpha *= o.alpha ?? 1;
  ctx.fillStyle = o.fill || PAL.alder; ctx.fill(p);
  // one shade shape on the lower half
  ctx.save(); ctx.clip(p);
  ctx.fillStyle = C.rgba(PAL.alderDeep, 0.35);
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(info.tx, info.ty); ctx.lineTo(info.tx + 40, info.ty + 60); ctx.lineTo(x + 40, y + 60); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = C.rgba(PAL.alderLight, 0.9); ctx.lineWidth = Math.max(1, len * 0.045); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(info.mx, info.my, info.tx, info.ty); ctx.stroke();
  ctx.strokeStyle = PAL.alderDeep; ctx.lineWidth = Math.max(1, len * 0.04); ctx.stroke(p);
  // little stem
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - Math.sin(ang) * len * 0.18, y + Math.cos(ang) * len * 0.18); ctx.stroke();
  ctx.restore();
}

// ------------------------------------------------------------------ the hand-painted finished page
// Fallback for page.js drawFinishedPage(ctx, w, h, o): same words as S5 (story.pageLines), green leaves.
// Geometry of the S5 sheet (design units). Taken from page.js when present so the name lines up exactly.
let PG = null;
function pageGeom() {
  if (PG) return PG;
  const fns = pageFns();
  if (typeof fns.getLayout === 'function') {
    const L = fns.getLayout('wide');
    PG = { DW: L.DW, DH: (fns.LAP && fns.LAP.wide && fns.LAP.wide.h) || 1400, mx: L.margin, ny: L.lines[0].rows[0].y, ns: L.sizes.name };
  } else PG = { DW: 1040, DH: 1400, mx: 104, ny: 198.4, ns: 112 };
  return PG;
}
// The finished S5 sheet into (0,0)-(DW,DH) design units. page.js drawFinishedPage when available.
function paintedPage(ctx, o = {}) {
  const G_ = pageGeom();
  const fns = pageFns();
  if (typeof fns.drawFinishedPage === 'function') { fns.drawFinishedPage(ctx, G_.DW, G_.DH, { shadow: false, ...o }); return; }
  const w = G_.DW, h = G_.DH;
  const r = C.rng(4242);
  const p = new C.Path2D();
  p.moveTo(6, 8);
  for (let i = 1; i <= 10; i++) p.lineTo((w - 6) * (i / 10), 6 + (r() - 0.5) * 3);
  for (let i = 1; i <= 8; i++) p.lineTo(w - 6 + (r() - 0.5) * 3, (h - 6) * (i / 8));
  for (let i = 9; i >= 0; i--) p.lineTo((w - 6) * (i / 10) + 6 * (i === 0), h - 6 + (r() - 0.5) * 3);
  p.closePath();
  C.paint(ctx, p, { fill: C.mix(PAL.paper, PAL.paperWarm, 0.25), mottle: 0.5, hatch: 0.08, hatchColor: PAL.paperShade, hatchAngle: 32, hatchSpacing: 6, seed: 3 });
  ctx.save(); ctx.clip(p);
  for (const [lw, a] of [[26, 0.06], [16, 0.08], [8, 0.12]]) { ctx.strokeStyle = C.rgba(PAL.paperShade, a); ctx.lineWidth = lw; ctx.stroke(p); }
  ctx.restore();
  C.ink(ctx, p, { color: C.mix(PAL.paperShade, PAL.ink, 0.3), width: 1.4, alpha: 0.5 });
  const fonts = { name: C.FONT.serifMed(G_.ns), italic: C.FONT.serifIt(58), body: C.FONT.serif(52) };
  const ys = [G_.ny, 338, 420, 492];
  STORY.pageLines.forEach((L, i) => {
    ctx.font = fonts[L.style];
    const tw = ctx.measureText(L.text).width;
    C.text(ctx, L.text, G_.mx, ys[i], { font: fonts[L.style], color: PAL.ink });
    alderLeaf(ctx, G_.mx + tw + 26, ys[i] - 4, i === 0 ? 70 : 52, 0.9, { bend: -0.1 });
  });
}

// ------------------------------------------------------------------ S6b: the aldercv.com CV
function cvLayout(env) {
  if (env.vertical) {
    const panel = { x: 64, y: 250, w: 952, h: 1400, r: 26 };
    return {
      panel, barH: 150, logo: 84, url: 66, pad: 76,
      name: 128, title: 54, summary: 48, head: 30, item: 40, lh: 56,
      vertical: true,
    };
  }
  const panel = { x: 170, y: 64, w: 1580, h: 952, r: 24 };
  return { panel, barH: 150, logo: 94, url: 74, pad: 112, name: 140, title: 56, summary: 50, head: 30, item: 38, lh: 54, vertical: false };
}

// Draw the CV into panel-local coordinates (0,0)-(w,h).
function drawCV(x, L) {
  const { w, h, r } = L.panel;
  const cv = STORY.cv;
  x.save();
  const clipP = new C.Path2D(); clipP.roundRect(0, 0, w, h, r);
  x.clip(clipP);
  // page: brand paper, the faintest tooth so it never looks dead-digital
  C.paint(x, clipP, { fill: PAL.brandPaper, mottle: 0.07, hatch: 0, seed: 6 });
  // brand bar
  x.fillStyle = PAL.brandTeal; x.fillRect(0, 0, w, L.barH);
  x.fillStyle = PAL.brandTealRaise; x.fillRect(0, L.barH - 3, w, 3);
  const ly = (L.barH - L.logo) / 2;
  drawLogo(x, L.pad - 14, ly, L.logo, { tile: PAL.brandTealRaise });
  C.text(x, STORY.url, L.pad - 14 + L.logo + 26, L.barH / 2 + L.url * 0.35, { font: C.FONT.sansSemi(L.url), color: PAL.brandPaper });

  const ink = PAL.brandInk, teal = PAL.brandTeal, muted = C.mix(PAL.brandInk, PAL.brandPaper, 0.42);
  const px = L.pad;
  let y = L.barH + L.name * (L.vertical ? 1.35 : 1.2);
  // name (her voice: Alegreya) + the alder leaf from S5
  const nw = C.text(x, cv.name, px - 4, y, { font: C.FONT.serifMed(L.name), color: ink });
  alderLeaf(x, px + nw + L.name * 0.16, y - L.name * 0.1, L.name * 0.5, 0.72, { bend: -0.12 });
  y += L.title * 1.55;
  C.text(x, cv.title, px, y, { font: C.FONT.sansSemi(L.title), color: teal });
  y += L.summary * 1.55;
  C.text(x, cv.summary, px, y, { font: C.FONT.serifIt(L.summary), color: C.mix(ink, PAL.brandPaper, 0.15) });
  y += L.summary * 1.0;
  // rule
  x.fillStyle = C.mix(PAL.brandMuted, PAL.brandPaper, 0.2); x.fillRect(px, y, w - px * 2, 3);
  y += L.head * 2.6;

  const head = (str, hx, hy) => {
    x.save(); x.font = C.FONT.sansBold(L.head); x.fillStyle = teal; x.letterSpacing = `${(L.head * 0.12).toFixed(1)}px`;
    x.fillText(str.toUpperCase(), hx, hy); x.restore();
  };
  const sk = cv.sections[0], ex = cv.sections[1], ed = cv.sections[2];
  const itemFont = C.FONT.sans(L.item), itemSemi = C.FONT.sansSemi(L.item);
  if (!L.vertical) {
    // three columns: Skills | Experience | Education
    const cols = [px, px + 360, px + 900];
    head(sk.h, cols[0], y); head(ex.h, cols[1], y); head(ed.h, cols[2], y);
    const y0 = y + L.lh * 1.15;
    sk.items.forEach((it, i) => C.text(x, it, cols[0], y0 + i * L.lh, { font: itemFont, color: ink }));
    let yy = y0;
    for (const it of ex.items) {
      const [a, b] = it.split(' — ');
      C.text(x, a, cols[1], yy, { font: itemSemi, color: ink });
      if (b) C.text(x, b, cols[1], yy + L.lh * 0.9, { font: itemFont, color: muted });
      yy += L.lh * 2.15;
    }
    const [ea, eb] = splitYear(ed.items[0]);
    C.text(x, ea, cols[2], y0, { font: itemSemi, color: ink });
    C.text(x, eb, cols[2], y0 + L.lh * 0.9, { font: itemFont, color: muted });
  } else {
    // stacked sections
    head(sk.h, px, y);
    y += L.lh * 1.05;
    for (const line of wrapItems(x, sk.items, '  ·  ', itemFont, w - px * 2)) { C.text(x, line, px, y, { font: itemFont, color: ink }); y += L.lh; }
    y += L.lh * 0.7;
    head(ex.h, px, y); y += L.lh * 1.05;
    for (const it of ex.items) {
      const [a, b] = it.split(' — ');
      C.text(x, a, px, y, { font: itemSemi, color: ink }); y += L.lh * 0.9;
      if (b) { C.text(x, b, px, y, { font: itemFont, color: muted }); y += L.lh * 1.25; }
    }
    y += L.lh * 0.45;
    head(ed.h, px, y); y += L.lh * 1.05;
    const [ea, eb] = splitYear(ed.items[0]);
    C.text(x, ea, px, y, { font: itemSemi, color: ink }); y += L.lh * 0.9;
    C.text(x, eb, px, y, { font: itemFont, color: muted });
  }
  x.restore();
}
function splitYear(s) { const m = s.match(/^(.*),\s*(\d{4})$/); return m ? [m[1], m[2]] : [s, '']; }
function wrapItems(x, items, sep, font, maxW) {
  x.save(); x.font = font;
  const out = [];
  let cur = '';
  for (const it of items) { const t = cur ? cur + sep + it : it; if (x.measureText(t).width > maxW && cur) { out.push(cur); cur = it; } else cur = t; }
  if (cur) out.push(cur);
  x.restore();
  return out;
}
function wrap(x, str, font, maxW) {
  x.save(); x.font = font;
  const words = str.split(' '), out = [];
  let cur = '';
  for (const wd of words) { const t = cur ? cur + ' ' + wd : wd; if (x.measureText(t).width > maxW && cur) { out.push(cur); cur = wd; } else cur = t; }
  if (cur) out.push(cur);
  x.restore();
  return out.map((l) => l.replace(/^·\s*/, ''));
}

// Night backdrop in ui space (behind the insert): painted indigo with brushed drags.
function nightBackdrop(env) {
  return env.once('brand:night:' + env.mode, () => C.layer(env.uiW, env.uiH, env.uiScale, (x) => {
    const W_ = env.uiW, H_ = env.uiH;
    const g = x.createLinearGradient(0, 0, 0, H_);
    g.addColorStop(0, PAL.night0); g.addColorStop(0.55, PAL.night1); g.addColorStop(1, C.mix(PAL.night1, PAL.night2, 0.6));
    const p = new C.Path2D(); p.rect(0, 0, W_, H_);
    C.paint(x, p, { fill: g, mottle: 0.4, hatch: 0.06, hatchColor: PAL.night0, hatchAngle: -8, hatchSpacing: 9, seed: 4 });
    const r = C.rng(91);
    x.lineCap = 'round';
    for (let n = 0; n < 260; n++) {
      const yy = r() * H_, xx = r() * W_, len = 80 + r() * 380;
      x.strokeStyle = C.rgba(r() < 0.5 ? PAL.night2 : PAL.blueband, 0.06 + r() * 0.08);
      x.lineWidth = 2 + r() * 8;
      x.beginPath(); x.moveTo(xx, yy); x.lineTo(xx + len, yy + (r() - 0.5) * 5); x.stroke();
    }
  }));
}
function uiStars(ctx, env, T, amount = 1) {
  const list = env.once('brand:uistars:' + env.mode, () => {
    const r = C.rng(515), out = [];
    for (let i = 0; i < 240; i++) out.push({ x: r() * env.uiW, y: r() * env.uiH, s: 0.7 + Math.pow(r(), 4) * 2.4, ph: r() * 6.28, f: 0.6 + r() * 2 });
    return out;
  });
  ctx.save();
  for (const s of list) {
    const a = amount * (0.6 + 0.4 * Math.sin(s.ph + T * s.f * 2));
    ctx.fillStyle = C.rgba('#f4ecd6', a * 0.85);
    ctx.beginPath(); ctx.arc(s.x, s.y, s.s, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// t: seconds since 24.4 (S6b start)
function drawS6b(ctx, env, t, T) {
  const L = cvLayout(env);
  const P = L.panel;
  const k = C.seg(t, 0, 0.2, C.ease.inOutSine);           // paper -> screen (done by 24.6)
  const zoom = C.lerp(1, 1.04, C.seg(t, 0, 2.6, C.ease.inOutSine));
  ui(ctx, env);
  C.blit(ctx, nightBackdrop(env), 0, 0);
  uiStars(ctx, env, T, 0.9);
  const cx = env.uiW / 2, cy = env.uiH / 2;
  ctx.translate(cx, cy); ctx.scale(zoom, zoom); ctx.translate(-cx, -cy);

  // The painted S5 sheet at the cut (big, text block centred) -> its name settles exactly onto the CV name.
  const G_ = pageGeom();
  const nameX = P.x + L.pad - 4, nameY = P.y + L.barH + L.name * (L.vertical ? 1.35 : 1.2);
  const s0 = env.vertical ? 0.98 : 1.45, s1 = L.name / G_.ns;
  const A = { s: s0, x: cx - (G_.DW * s0) / 2, y: (env.vertical ? 640 : 500) - 310 * s0 };
  const B = { s: s1, x: nameX - G_.mx * s1, y: nameY - G_.ny * s1 };
  const kk = C.seg(t, 0, 0.16, C.ease.inOutSine);
  const S = C.lerp(A.s, B.s, kk), X = C.lerp(A.x, B.x, kk), Y = C.lerp(A.y, B.y, kk);
  // the visible outline: the sheet's own edge -> straightens into the brand panel
  const R0 = { x: X - 8, y: Y - 8, w: G_.DW * S + 16, h: G_.DH * S + 16 };
  const R = { x: C.lerp(R0.x, P.x, k), y: C.lerp(R0.y, P.y, k), w: C.lerp(R0.w, P.w, k), h: C.lerp(R0.h, P.h, k) };
  const rot = C.lerp(-0.02, 0, k);

  // glow: strong cream halo at the cut, a soft swell on the warm chord (24.5), settling to a faint aura
  const chord = Math.exp(-Math.pow((t - 0.12) / 0.32, 2));
  const halo = C.lerp(1, 0.16, C.seg(t, 0, 1.2, C.ease.outSine)) + 0.3 * chord;
  const gx = C.lerp(cx, R.x + R.w / 2, k), gy = C.lerp(A.y + 310 * s0, R.y + R.h / 2, k), gr = C.lerp(env.vertical ? 900 : 1300, Math.max(P.w, P.h), k);
  C.glow(ctx, gx, gy, gr * 0.95, PAL.paper, halo * 0.6);
  C.glow(ctx, gx, gy, gr * 0.7, PAL.paperWarm, halo * 0.45);

  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(rot); ctx.translate(-cx, -cy);
  if (k > 0) { const cp = new C.Path2D(); cp.roundRect(R.x, R.y, R.w, R.h, C.lerp(2, P.r, k)); ctx.clip(cp); }
  // Three steps inside 6 frames, never two different texts on top of each other:
  //  1) grain + painted words dissolve into a clean blank page while the edges straighten (k 0 -> .65);
  //     her name glides onto the CV name's exact place, so it reads as the one thing that stays
  //  2) the teal bar and the rest of the CV resolve on that clean page (k .45 -> 1)
  const aBlank = C.seg(k, 0.2, 0.5, C.ease.inOutSine);
  const aPaint = 1 - C.seg(k, 0.25, 0.65, C.ease.inOutSine);
  const aCV = C.seg(k, 0.45, 1.0, C.ease.inOutSine);
  if (aBlank > 0 && aCV < 1) {
    ctx.globalAlpha = aBlank;
    ctx.fillStyle = PAL.brandPaper; ctx.fillRect(R.x, R.y, R.w, R.h);
  }
  if (aPaint > 0) {
    const painted = env.once('brand:painted:' + env.mode, () => C.layer(G_.DW, G_.DH, env.uiScale * s0 * 1.08, (x) => paintedPage(x, {})));
    ctx.globalAlpha = aPaint;
    ctx.drawImage(painted, X, Y, G_.DW * S, G_.DH * S);
    // the page is lit from within: a cream bloom on top of the painted sheet at the cut
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = C.rgba(PAL.paper, 0.18 * (1 - k)); ctx.fillRect(X, Y, G_.DW * S, G_.DH * S); ctx.restore();
  }
  ctx.translate(P.x, P.y);
  const Rw = P.w, Rh = P.h;
  if (aCV > 0) {
    const cvL = env.once('brand:cv:' + env.mode, () => C.layer(P.w, P.h, env.uiScale * 1.1, (x) => drawCV(x, L)));
    ctx.globalAlpha = aCV;
    ctx.drawImage(cvL, 0, 0, Rw, Rh);
    // remaining light on the clean page right after the chord, fading to nothing
    const sheen = (1 - C.seg(t, 0.15, 0.9, C.ease.outSine)) * 0.3;
    if (sheen > 0.005) {
      ctx.globalAlpha = 1; ctx.save(); ctx.globalCompositeOperation = 'screen';
      const g = ctx.createRadialGradient(Rw / 2, Rh * 0.45, 0, Rw / 2, Rh * 0.45, Rw * 0.7);
      g.addColorStop(0, C.rgba(PAL.paper, sheen)); g.addColorStop(1, C.rgba(PAL.paper, 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, Rw, Rh); ctx.restore();
    }
  }
  ctx.restore();
  return { post: { grain: C.lerp(0.6, 0.3, k), vignette: C.lerp(0.35, 0.28, k) } };
}

// ------------------------------------------------------------------ S6a: the page lifts (wide)
// t: seconds since 22.0.  22.0–22.3 page still on her knees · 22.3–23.7 it lifts and rises, turning to
// face us, glow builds · 23.7–24.4 held (0.7 s: only water, stars and grain move).
const SEAT = { x: 760, y: 900, s: 0.86 };            // page.js BANK girl position (fallback)
const LIFT = { t0: 22.3, t1: 23.7 };
function drawS6a(ctx, env, t, T) {
  const RF = riverFns();
  const calm = RF.calmAt(T), warmth = RF.warmthAt(T), phase = RF.flowPhase(T);
  const fns = pageFns();
  const seat = fns.BANK ? { x: fns.BANK.girlX, y: fns.BANK.girlY, s: fns.BANK.girlS } : SEAT;
  const lift = C.seg(T, LIFT.t0, LIFT.t1, C.ease.inOutSine);
  const tilt = C.seg(T, 22.35, 23.75, C.ease.inOutSine);
  const cam = { cx: 900, cy: C.lerp(540, 480, tilt), zoom: 1, vx: seat.x + 100 };
  // character on twos: hands open as the page leaves them, then she watches it rise
  const tt = C.twos(T);
  const releaseK = C.seg(tt, 22.3, 22.9, C.ease.inOutSine);
  const lookUp = C.seg(tt, 22.55, 23.5, C.ease.inOutSine);
  const glowAmt = C.lerp(0.2, 0.5, C.seg(T, 22.3, 23.3));
  const girlO = {
    breath: 1, eyes: { open: C.lerp(0.6, 1, lookUp), lookY: C.lerp(0.9, -0.9, lookUp), lookX: C.lerp(0.05, 0.6, lookUp) },
    mouth: lookUp > 0.7 ? 'soft' : 'neutral', hands: 'release', releaseK, lookUp,
    glow: PAL.paper, glowAmt,
    light: { rim: C.mix(PAL.glow, '#8ea2dc', C.seg(T, 22.4, 24)), rimAmt: 0.45, side: 1, glow: PAL.paper, glowAmt },
  };
  const drawPage = (c2) => drawLiftingPage(c2, env, T, lift, seat);
  if (typeof fns.bankScene === 'function') {
    fns.bankScene(ctx, env, { t, T, cam, warmth, calm, flowPhase: phase, starAmount: C.lerp(0.6, 1, calm), girl: girlO, drawExtras: drawPage });
  } else {
    fallbackBank(ctx, env, { t, T, cam, warmth, calm, phase, girlO, drawPage, seat });
  }
  return { post: { grain: 0.6, vignette: 0.36 } };
}
// The finished sheet in world space: flat on her knees (foreshortened) -> up above her, facing us.
function drawLiftingPage(ctx, env, T, lift, seat) {
  const G_ = pageGeom();
  const w0 = 160, h0 = w0 * G_.DH / G_.DW;
  // drifts right early (so it never covers her face) while it rises; ends top-centre of frame
  const x = C.lerp(seat.x + 4, 965, C.ease.outSine(C.seg(lift, 0, 0.8)));
  const y = C.lerp(seat.y - 112 * seat.s, 300, lift);
  const sc = C.lerp(1, 1.8, lift);
  const face = C.lerp(0.3, 1, C.ease.inOutSine(C.seg(lift, 0.05, 0.75)));
  const sway = Math.sin((T - LIFT.t0) * 2.4) * 0.03 * Math.sin(Math.PI * lift); // only while rising
  const glowA = C.ease.inOutSine(C.seg(T, 22.25, 23.4));
  C.glow(ctx, x, y, 520 * sc, PAL.paper, 0.42 * glowA);
  C.glow(ctx, x, y, 240 * sc, PAL.paperWarm, 0.6 * glowA);
  const lay = env.once('brand:painted:world', () => C.layer(G_.DW, G_.DH, env.res * (w0 * 1.6) / G_.DW, (c2) => paintedPage(c2, {})));
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(C.lerp(-0.06, -0.02, lift) + sway);
  ctx.scale(sc, sc * face);
  ctx.drawImage(lay, -w0 / 2, -h0 / 2, w0, h0);
  // lit from within
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = C.rgba(PAL.paper, 0.22 * glowA); ctx.fillRect(-w0 / 2, -h0 / 2, w0, h0);
  ctx.restore();
}
// Minimal bank scene, used only until page.js exports bankScene.
function fallbackBank(ctx, env, o) {
  const { T, cam, warmth, calm, phase, girlO, drawPage, seat } = o;
  parallax(ctx, env, cam, 0.5);
  drawSky(ctx, env, { horizonY: 470, warmth, t: T, starAmount: C.lerp(0.5, 1, calm) });
  const river = createRiver(env, {});
  river.drawWater(ctx, { phase, calm, t: T });
  river.drawPages(ctx, { phase, calm, t: T });
  camera(ctx, env, cam);
  const bank = env.once('brand:fbank', () => C.layer(2300, 420, env.res, (x) => {
    x.translate(150, 0);
    require('../lib/botany').stoneBank(x, -150, 40, 2150, 420, 3);
  }));
  C.blit(ctx, bank, -150, 820);
  ctx.save(); ctx.translate(seat.x, seat.y); ctx.scale(seat.s, seat.s);
  girl.sitFront(ctx, { ...girlO, light: girlO.light });
  ctx.restore();
  drawPage(ctx);
}

// ------------------------------------------------------------------ S7 bust (local, proportioned)
// girl.bust's shoulders are ~3.3 head-widths wide, which reads as a blocky cape in an MCU. This is the
// same cel recipe (celPart + one shade + rim + page glow) with sloped shoulders ~2.4 head-widths wide.
// Origin = eye line centre (same as girl.bust).
const D = (d) => new C.Path2D(d);
function miraBust(ctx, o = {}) {
  const lw = o.lw ?? 1.7;
  const light = o.light || {};
  const body = D(`M -15 86 C -34 104 -74 110 -112 122 C -140 131 -152 156 -154 196 L -158 440 L 158 440 L 154 196
    C 152 156 140 131 112 122 C 74 110 34 104 15 86 Z`);
  girl.celPart(ctx, body, PAL.shirt, {
    lw, shade: D('M -170 120 C -132 140 -116 210 -112 300 C -110 360 -118 420 -124 450 L -180 450 Z M 170 300 C 120 330 60 350 -20 360 L -20 460 L 170 460 Z'),
    shadeFill: PAL.shirtShade,
  });
  // folds, placket, buttons (clipped)
  ctx.save(); ctx.clip(body);
  ctx.strokeStyle = C.rgba(PAL.shirtShade, 0.95); ctx.lineWidth = lw * 0.8; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-112, 200); ctx.quadraticCurveTo(-106, 260, -110, 330);
  ctx.moveTo(112, 200); ctx.quadraticCurveTo(106, 260, 110, 330);
  ctx.moveTo(3, 128); ctx.lineTo(2, 440);
  ctx.moveTo(-70, 150); ctx.quadraticCurveTo(-52, 170, -46, 196);
  ctx.stroke();
  ctx.fillStyle = C.rgba('#eef2f2', 0.85);
  for (const by of [176, 236, 296]) { ctx.beginPath(); ctx.arc(10, by, 2.8, 0, Math.PI * 2); ctx.fill(); }
  if (o.glow) C.glow(ctx, 0, 330, 260, o.glow, (o.glowAmt ?? 0.4) * 0.9, 'soft-light');
  ctx.restore();
  girl.rim(ctx, body, light, lw);
  girl.head(ctx, { ...o, lw });
  const collar = D('M -20 72 L -2 128 L -22 140 L -50 96 Z M 20 72 L 2 128 L 22 140 L 50 96 Z');
  girl.celPart(ctx, collar, C.shade(PAL.shirt, 0.15), { lw });
  if (o.glow) { ctx.save(); ctx.clip(collar); C.glow(ctx, 0, 140, 90, o.glow, 0.3, 'soft-light'); ctx.restore(); }
}

// ------------------------------------------------------------------ S7: tagline, she looks up
const S7G = { x: 1280, y: 450, s: 2.55, horizon: 700 };
function drawS7(ctx, env, t, T) {
  const RF = riverFns();
  const zoom = C.lerp(1, 1.03, C.seg(t, 0, 2.0, C.ease.inOutSine));
  const cam = { cx: 960, cy: 540, zoom, vx: S7G.x };
  // background: starry sky + calm sea, slight parallax
  parallax(ctx, env, cam, 0.5);
  drawSky(ctx, env, { horizonY: S7G.horizon, warmth: 0, t: T, starAmount: 1 });
  const sea = createRiver(env, { horizonY: S7G.horizon, vpX: 760 });
  sea.drawWater(ctx, { phase: RF.flowPhase(T), calm: 1, t: T });
  camera(ctx, env, cam);
  // page light from below-front (the page is just out of frame)
  C.glow(ctx, S7G.x - 40, 1220, 760, PAL.paper, 0.22);

  // Mira — on twos. 27.0 eyes lowered; 27.9 she looks up at the camera (~4 drawings).
  const tt = C.twos(t);
  const up = C.ease.inOutSine(C.seg(tt, 0.9, 1.2));
  const breath = Math.sin(tt * 2.4) * 1.5;
  const eyes = { open: C.lerp(0.5, 1, up), lookY: C.lerp(1, 0, up), lookX: C.lerp(-0.1, 0, up) };
  ctx.save();
  ctx.translate(S7G.x, S7G.y + C.lerp(8, 0, up) + breath);
  ctx.scale(S7G.s, S7G.s);
  miraBust(ctx, {
    eyes, mouth: up > 0.55 ? 'soft' : 'neutral', tilt: C.lerp(0.035, 0.0, up), lw: 1.7,
    light: { rim: '#8ea2dc', rimAmt: 0.45, side: 1 }, glow: PAL.paper, glowAmt: 0.4, browLift: up * 1.2,
  });
  ctx.restore();

  // --- type (screen space)
  ui(ctx, env);
  const tagA = C.seg(t, 0.0, 0.55, C.ease.inOutSine);
  const urlA = C.seg(t, 0.6, 0.9, C.ease.inOutSine);
  if (env.vertical) {
    // bottom quarter: a night scrim keeps it legible over her shirt
    const g = ctx.createLinearGradient(0, 1300, 0, 1920);
    g.addColorStop(0, C.rgba(PAL.night0, 0)); g.addColorStop(0.35, C.rgba(PAL.night0, 0.72)); g.addColorStop(1, C.rgba(PAL.night0, 0.9));
    ctx.fillStyle = g; ctx.fillRect(0, 1300, 1080, 620);
    revealText(ctx, STORY.tagline, 540, 1560, { font: C.FONT.serif(76), color: PAL.paper, align: 'center', k: tagA });
    lockup(ctx, 540, 1730, 96, urlA, 'center');
  } else {
    const g = ctx.createLinearGradient(0, 0, 900, 0);
    g.addColorStop(0, C.rgba(PAL.night0, 0.45)); g.addColorStop(1, C.rgba(PAL.night0, 0));
    ctx.fillStyle = g; ctx.fillRect(0, 640, 900, 440);
    revealText(ctx, STORY.tagline, 150, 800, { font: C.FONT.serif(74), color: PAL.paper, align: 'left', k: tagA });
    lockup(ctx, 150, 935, 96, urlA, 'left');
  }
}
// Text that grows left-to-right with a soft edge (vine reveal) — never bouncy.
function revealText(ctx, str, x, y, o) {
  const { font, color, align = 'left', k } = o;
  if (k <= 0) return;
  ctx.save();
  ctx.font = font;
  const w = ctx.measureText(str).width;
  const x0 = align === 'center' ? x - w / 2 : x;
  const edge = 120;
  const front = x0 - edge + (w + edge * 2) * k;
  const g = ctx.createLinearGradient(front - edge, 0, front, 0);
  g.addColorStop(0, C.rgba(color, 1)); g.addColorStop(1, C.rgba(color, 0));
  ctx.fillStyle = g; ctx.textAlign = 'left';
  ctx.fillText(str, x0, y);
  ctx.restore();
}
// Logo mark + aldercv.com, baseline y. size = URL font px.
function lockup(ctx, x, y, size, a, align) {
  if (a <= 0) return;
  ctx.save();
  ctx.font = C.FONT.sansSemi(size);
  const tw = ctx.measureText(STORY.url).width;
  const ls = size * 1.12, gap = size * 0.28;
  const total = ls + gap + tw;
  const x0 = align === 'center' ? x - total / 2 : x;
  const cap = size * 0.7;
  ctx.globalAlpha = a;
  const rise = (1 - a) * 10;
  drawLogo(ctx, x0, y - cap / 2 - ls / 2 + rise, ls, { ring: C.rgba(PAL.brandMuted, 0.5) });
  C.text(ctx, STORY.url, x0 + ls + gap, y + rise, { font: C.FONT.sansSemi(size), color: PAL.brandPaper });
  ctx.restore();
}

module.exports = {
  S6: {
    vfocus: 860,
    draw(ctx, env, t, info) {
      if (t < 2.4) return drawS6a(ctx, env, t, info.T);
      return drawS6b(ctx, env, t - 2.4, info.T);
    },
  },
  S7: {
    vfocus: S7G.x,
    draw(ctx, env, t, info) { return drawS7(ctx, env, t, info.T); },
  },
  // exported for the director (promote to a lib if useful)
  drawLogo, alderLeaf,
};
