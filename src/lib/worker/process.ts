import { spawn } from "node:child_process";
import path from "node:path";

export function isPidAlive(pid: number | null | undefined) {
  if (!pid || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function spawnWorkerProcess() {
  const cliPath = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  const runnerPath = path.join(process.cwd(), "src", "worker", "runner.ts");
  const child = spawn(process.execPath, [cliPath, runnerPath], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });

  child.unref();
  return child.pid ?? null;
}
