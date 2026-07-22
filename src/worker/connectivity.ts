import { env } from "@/lib/env";
import { updateWorkerState } from "@/lib/monitors/service";

export type WorkerConnectivityStatus = "unknown" | "online" | "offline" | "disabled";

export interface WorkerConnectivityResult {
  available: boolean;
  status: WorkerConnectivityStatus;
  checkedAt: Date;
  successfulTargets: number;
  totalTargets: number;
  message: string;
}

type ConnectivityFetch = (
  input: string,
  init: { method: string; redirect: "manual"; signal: AbortSignal }
) => Promise<unknown>;

let activeProbe: Promise<WorkerConnectivityResult> | null = null;

export async function ensureWorkerConnectivity() {
  if (!env.workerConnectivityCheckEnabled) {
    return persistConnectivityResult({
      available: true,
      status: "disabled",
      checkedAt: new Date(),
      successfulTargets: 0,
      totalTargets: env.workerConnectivityTargets.length,
      message: "Internet connectivity checks are disabled by configuration.",
    });
  }

  activeProbe ??= probeWorkerConnectivity(
    env.workerConnectivityTargets,
    env.workerConnectivityTimeoutMs
  )
    .then(persistConnectivityResult)
    .finally(() => {
      activeProbe = null;
    });

  return activeProbe;
}

export async function probeWorkerConnectivity(
  targets: string[],
  timeoutMs: number,
  fetchImpl: ConnectivityFetch = fetch
): Promise<WorkerConnectivityResult> {
  const checkedAt = new Date();
  const controllers = targets.map(() => new AbortController());
  let available = false;

  try {
    await Promise.any(
      targets.map((target, index) => probeTarget(
        target,
        timeoutMs,
        controllers[index],
        fetchImpl
      ))
    );
    available = true;
  } catch {
    available = false;
  } finally {
    controllers.forEach((controller) => controller.abort());
  }

  const successfulTargets = available ? 1 : 0;

  return {
    available,
    status: available ? "online" : "offline",
    checkedAt,
    successfulTargets,
    totalTargets: targets.length,
    message: available
      ? `Internet connectivity confirmed by at least one of ${targets.length} canary targets.`
      : `Internet connectivity unavailable: none of ${targets.length} canary targets responded. Monitoring and outbound worker tasks are paused.`,
  };
}

async function probeTarget(
  target: string,
  timeoutMs: number,
  controller: AbortController,
  fetchImpl: ConnectivityFetch
) {
  const timeout = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));

  try {
    await fetchImpl(target, {
      method: "HEAD",
      redirect: "manual",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function persistConnectivityResult(result: WorkerConnectivityResult) {
  await updateWorkerState({
    connectivityStatus: result.status,
    connectivityCheckedAt: result.checkedAt,
    connectivityMessage: result.message,
  });
  return result;
}
