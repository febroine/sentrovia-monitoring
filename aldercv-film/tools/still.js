'use strict';
// Render stills.  node tools/still.js --t 1.0,3.5 [--mode landscape|vertical] [--scale 0.5] [--dir out/stills] [--tag name]
// --t accepts seconds; --f accepts frame numbers. Files: <dir>/<tag>_f0123.png
const fs = require('fs');
const path = require('path');
const { makeEnv } = require('../src/lib/stage');
const { renderFrame } = require('../src/film');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? a.concat([[v.slice(2), arr[i + 1]]]) : a), []));
const mode = args.mode || 'landscape';
const scale = parseFloat(args.scale || '0.5');
const dir = args.dir || 'out/stills';
const tag = args.tag || mode;
fs.mkdirSync(dir, { recursive: true });
const frames = args.f ? args.f.split(',').map(Number) : (args.t || '0').split(',').map((s) => Math.round(parseFloat(s) * 30));
const env = makeEnv({ mode, scale });
for (const f of frames) {
  const t0 = Date.now();
  const c = renderFrame(env, Math.min(899, Math.max(0, f)));
  const file = path.join(dir, `${tag}_f${String(f).padStart(4, '0')}.png`);
  fs.writeFileSync(file, c.toBuffer('image/png'));
  console.log(file, `${Date.now() - t0}ms`);
}
