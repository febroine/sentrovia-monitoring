'use strict';
// Parallel render.  node tools/render.js --mode landscape --scale 1 --out out/video_landscape.mp4 [--from 0 --to 900 --workers 4 --crf 14]
// Video only; tools/finalize.sh muxes in audio/score.wav.
const { fork, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? a.concat([[v.slice(2), arr[i + 1]]]) : a), []));
const mode = args.mode || 'landscape', scale = args.scale || '1';
const from = +(args.from || 0), to = +(args.to || 900);
const workers = +(args.workers || Math.max(1, os.cpus().length));
const out = args.out || `out/video_${mode}.mp4`;
const cacheDir = path.join('out', 'cache', `${mode}_${scale}`);
fs.mkdirSync(cacheDir, { recursive: true });
const n = to - from, per = Math.ceil(n / workers);
const segs = [];
let done = 0; const t0 = Date.now();
const jobs = [];
for (let k = 0; k < workers; k++) {
  const a = from + k * per, b = Math.min(to, a + per);
  if (a >= b) break;
  const seg = path.join(cacheDir, `seg_${String(k).padStart(2, '0')}.mp4`);
  segs.push(seg);
  jobs.push(new Promise((res, rej) => {
    const w = fork(path.join(__dirname, 'render_worker.js'), [mode, scale, a, b, seg, args.crf || '14']);
    w.on('message', () => { done++; if (done % 30 === 0) process.stdout.write(`\r${done}/${n} frames  ${((Date.now() - t0) / 1000).toFixed(0)}s`); });
    w.on('exit', (c) => (c === 0 ? res() : rej(new Error(`worker ${k} exited ${c}`))));
  }));
}
Promise.all(jobs).then(() => {
  const list = path.join(cacheDir, 'list.txt');
  fs.writeFileSync(list, segs.map((s) => `file '${path.resolve(s)}'`).join('\n'));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out]);
  console.log(`\n${out}  (${n} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}).catch((e) => { console.error(e); process.exit(1); });
