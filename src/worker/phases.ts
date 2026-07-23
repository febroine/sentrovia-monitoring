import { runRetentionCleanup } from "@/lib/data-retention/service";
import { retryWebhookQueueForAllUsers } from "@/lib/delivery/service";
import { runDueReportSchedules } from "@/lib/reports/service";
import { ensureWorkerConnectivity } from "@/worker/connectivity";
import { runMonitoringCycle } from "@/worker/scheduler";

export type WorkerPhaseResult =
  | { status: "completed" }
  | { status: "stopped" }
  | { status: "connectivity-paused"; message: string };

export async function runWorkerPhases(
  isRunRequested: () => Promise<boolean>
): Promise<WorkerPhaseResult> {
  try {
    await runRetentionCleanup();
  } catch (error) {
    console.error("[sentrovia] Retention cleanup failed; monitor checks will continue.", error);
  }
  if (!(await isRunRequested())) return { status: "stopped" };

  const beforeMonitoring = await ensureWorkerConnectivity();
  if (!beforeMonitoring.available) {
    return { status: "connectivity-paused", message: beforeMonitoring.message };
  }

  await runMonitoringCycle();
  if (!(await isRunRequested())) return { status: "stopped" };

  const beforeOutboundWork = await ensureWorkerConnectivity();
  if (!beforeOutboundWork.available) {
    return { status: "connectivity-paused", message: beforeOutboundWork.message };
  }

  await retryWebhookQueueForAllUsers();
  if (!(await isRunRequested())) return { status: "stopped" };

  await runDueReportSchedules();
  return (await isRunRequested()) ? { status: "completed" } : { status: "stopped" };
}
