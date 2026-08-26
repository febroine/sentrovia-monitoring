import { runRetentionCleanup } from "@/lib/data-retention/service";
import { retryDeliveryQueueForAllUsers } from "@/lib/delivery/service";
import { runDueReportSchedules } from "@/lib/reports/service";
import { ensureWorkerConnectivity } from "@/worker/connectivity";
import { runMonitoringCycle } from "@/worker/scheduler";
import { triggerAutomaticDatabaseBackup } from "@/lib/system/automatic-backup";

export type WorkerPhaseResult =
  | { status: "completed" }
  | { status: "stopped" }
  | { status: "connectivity-paused"; message: string };

export async function runWorkerPhases(
  isRunRequested: () => Promise<boolean>
): Promise<WorkerPhaseResult> {
  if (!(await isRunRequested())) return { status: "stopped" };

  void triggerAutomaticDatabaseBackup();
  try {
    await runRetentionCleanup();
  } catch (error) {
    console.error("[sentrovia] Retention cleanup failed; monitor checks will continue.", error);
  }
  if (!(await isRunRequested())) return { status: "stopped" };

  await runMonitoringCycle();
  if (!(await isRunRequested())) return { status: "stopped" };

  const beforeOutboundWork = await ensureWorkerConnectivity();
  if (!beforeOutboundWork.available) {
    return { status: "connectivity-paused", message: beforeOutboundWork.message };
  }

  await retryDeliveryQueueForAllUsers();
  if (!(await isRunRequested())) return { status: "stopped" };

  await runDueReportSchedules();
  return (await isRunRequested()) ? { status: "completed" } : { status: "stopped" };
}
