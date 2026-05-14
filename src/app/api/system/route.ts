import os from "os";
import { NextResponse } from "next/server";
import { toAuthError } from "@/lib/auth/errors";
import { getSession } from "@/lib/auth/session";

export const runtime = "nodejs";

const CPU_SAMPLE_WINDOW_MS = 1000;
const CPU_SAMPLE_POLL_MS = 250;

type CpuSnapshot = ReturnType<typeof captureCpuSnapshot>;

function captureCpuSnapshot() {
  return os.cpus().map((cpu) => ({
    idle: cpu.times.idle,
    total: Object.values(cpu.times).reduce((total, current) => total + current, 0),
  }));
}

function calculateCpuUsage(before: CpuSnapshot, after: CpuSnapshot) {
  let totalIdle = 0;
  let totalTick = 0;

  before.forEach((cpu, index) => {
    const nextCpu = after[index];
    if (!nextCpu) {
      return;
    }

    totalIdle += Math.max(0, nextCpu.idle - cpu.idle);
    totalTick += Math.max(0, nextCpu.total - cpu.total);
  });

  const usage = totalTick > 0 ? 100 - (100 * totalIdle) / totalTick : 0;
  return Math.max(0, Math.min(100, Math.round(usage * 10) / 10));
}

async function getCpuUsage(): Promise<number> {
  return new Promise((resolve) => {
    const samples = [captureCpuSnapshot()];

    const intervalId = setInterval(() => samples.push(captureCpuSnapshot()), CPU_SAMPLE_POLL_MS);
    setTimeout(() => {
      clearInterval(intervalId);
      samples.push(captureCpuSnapshot());
      resolve(calculateCpuUsage(samples[0], samples[samples.length - 1]));
    }, CPU_SAMPLE_WINDOW_MS);
  });
}

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const cpuUsage = await getCpuUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memUsagePct = Math.round((usedMem / totalMem) * 1000) / 10;
    const cpus = os.cpus();

    return NextResponse.json({
      cpu: {
        usage: cpuUsage,
        model: cpus[0]?.model ?? "Unknown",
        cores: cpus.length,
      },
      memory: {
        total: totalMem,
        used: usedMem,
        free: freeMem,
        usagePct: memUsagePct,
      },
      uptime: {
        process: Math.floor(process.uptime()),
        os: Math.floor(os.uptime()),
      },
      system: {
        platform: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
        nodeVersion: process.version,
      },
    });
  } catch (error) {
    const authError = toAuthError(error, "Unable to load system telemetry right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
