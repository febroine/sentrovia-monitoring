/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("node:path");

const isWindows = process.platform === "win32";
const nodeCommand = process.execPath;
const cwd = __dirname;

const nextBin = path.join(cwd, "node_modules", "next", "dist", "bin", "next");
const tsxBin = path.join(cwd, "node_modules", "tsx", "dist", "cli.mjs");

module.exports = {
  apps: [
    {
      name: "sentrovia-web",
      script: isWindows ? nodeCommand : nextBin,
      args: isWindows ? `"${nextBin}" start` : "start",
      cwd,
      env: {
        NODE_ENV: "production",
      },
      interpreter: "none",
      windowsHide: true,
      autorestart: true,
    },
    {
      name: "sentrovia-worker",
      script: isWindows ? nodeCommand : tsxBin,
      args: isWindows ? `"${tsxBin}" src\\worker\\runner.ts` : "src/worker/runner.ts",
      cwd,
      env: {
        NODE_ENV: "production",
      },
      interpreter: "none",
      windowsHide: true,
      autorestart: true,
    },
  ],
};
