'use strict';
// Worker: renders frames [from,to) and pipes raw RGBA into ffmpeg -> segment file.
const { spawn } = require('child_process');
const { makeEnv } = require('../src/lib/stage');
const { renderFrame } = require('../src/film');
const { canvas } = require('../src/lib/core');

const [, , mode, scaleS, fromS, toS, outFile, crf] = process.argv;
const env = makeEnv({ mode, scale: parseFloat(scaleS) });
const from = +fromS, to = +toS;
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${env.outW}x${env.outH}`, '-r', '30', '-i', '-',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', crf || '14', '-pix_fmt', 'yuv420p', '-tune', 'grain', outFile], { stdio: ['pipe', 'inherit', 'inherit'] });
const target = canvas(env.outW, env.outH);
(async () => {
  for (let f = from; f < to; f++) {
    const c = renderFrame(env, f, target);
    const buf = c.data();
    if (!ff.stdin.write(Buffer.from(buf))) await new Promise((r) => ff.stdin.once('drain', r));
    if (process.send) process.send({ f });
  }
  ff.stdin.end();
  ff.on('close', (code) => process.exit(code));
})();
