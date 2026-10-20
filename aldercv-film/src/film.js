'use strict';
// The film timeline: which shot owns which frames. Shot modules export { S1: { draw, vfocus? }, ... }.
// draw(ctx, env, t, info): t = seconds since shot start; info = { T (global s), frame, shot }.

const { FPS, FRAMES, registerFonts, canvas } = require('./lib/core');
const { post, identity } = require('./lib/stage');

const SHOTS = [
  { id: 'S1', chapter: 'hook', from: 0, to: 60 },
  { id: 'S2', chapter: 'river', from: 60, to: 210 },
  { id: 'S3', chapter: 'river', from: 210, to: 360 },
  { id: 'S4', chapter: 'page', from: 360, to: 480 },
  { id: 'S5', chapter: 'page', from: 480, to: 660 },
  { id: 'S6', chapter: 'brand', from: 660, to: 810 },
  { id: 'S7', chapter: 'brand', from: 810, to: 870 },
  { id: 'S8', chapter: 'hook', from: 870, to: 900 },
];

const modules = {};
function shotImpl(shot) {
  if (!modules[shot.chapter]) modules[shot.chapter] = require(`./shots/${shot.chapter}`);
  const impl = modules[shot.chapter][shot.id];
  if (!impl) throw new Error(`shots/${shot.chapter}.js does not export ${shot.id}`);
  return impl;
}
const shotAt = (frame) => SHOTS.find((s) => frame >= s.from && frame < s.to) || SHOTS[SHOTS.length - 1];

// Render one frame into a fresh canvas sized for env. Returns the canvas.
function renderFrame(env, frame, target) {
  registerFonts();
  const c = target || canvas(env.outW, env.outH);
  const ctx = c.getContext('2d');
  identity(ctx);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
  ctx.fillStyle = '#10132b';
  ctx.fillRect(0, 0, env.outW, env.outH);
  const shot = shotAt(frame);
  const impl = shotImpl(shot);
  const t = (frame - shot.from) / FPS;
  ctx.save();
  const res = impl.draw(ctx, env, t, { T: frame / FPS, frame, shot }) || {};
  ctx.restore();
  if (res.post !== false) post(ctx, env, frame, res.post || {});
  return c;
}

module.exports = { SHOTS, FPS, FRAMES, renderFrame, shotAt };
