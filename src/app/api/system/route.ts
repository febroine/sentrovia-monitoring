import os from "os";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";

export const runtime = "nodejs";

function getCpuUsage(): Promise<number> {
  return new Promise((resolve) => {
    const cpusBefore = os.cpus();

    setTimeout(() => {
      const cpusAfter = os.cpus();
      let totalIdle = 0;
      let totalTick = 0;

      cpusBefore.forEach((cpu, index) => {
        const nextCpu = cpusAfter[index];
        const idleBefore = cpu.times.idle;
        const idleAfter = nextCpu.times.idle;
        const totalBefore = Object.values(cpu.times).reduce((total, current) => total + current, 0);
        const totalAfter = Object.values(nextCpu.times).reduce((total, current) => total + current, 0);

        totalIdle += idleAfter - idleBefore;
        totalTick += totalAfter - totalBefore;
      });

      const usage = totalTick > 0 ? 100 - (100 * totalIdle) / totalTick : 0;
      resolve(Math.round(usage * 10) / 10);
    }, 200);
  });
}

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const cpuUsage = await getCpuUsage();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memUsagePct = Math.round((usedMem / totalMem) * 1000) / 10;

  return NextResponse.json({
    cpu: {
      usage: cpuUsage,
      model: os.cpus()[0]?.model ?? "Unknown",
      cores: os.cpus().length,
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
}
