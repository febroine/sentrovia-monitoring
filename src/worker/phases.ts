import { runRetentionCleanup } from "@/lib/data-retention/service";
import { retryDeliveryQueueForAllUsers } from "@/lib/delivery/service";
import { runDueReportSchedules } from "@/lib/reports/service";
import { ensureWorkerConnectivity } from "@/worker/connectivity";
import { dispatchQueuedNotifications } from "@/worker/notification-outbox";
import { dispatchDueMonitors } from "@/worker/scheduler";
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

  const outboundConnectivity = await ensureWorkerConnectivity();
  if (outboundConnectivity.available) {
    try {
      await retryDeliveryQueueForAllUsers();
    } catch (error) {
      console.error("[sentrovia] Delivery retry failed; monitor checks will continue.", error);
    }
  }
  if (!(await isRunRequested())) return { status: "stopped" };

  // Starts due monitors in free slots; they finish in the background, so slow checks never hold back
  // delivery retries, reports, or the next monitors.
  await dispatchDueMonitors();
  if (!(await isRunRequested())) return { status: "stopped" };

  // Queued alerts are normally started the moment they are raised; this picks up retries that came
  // due and alerts left from before a restart or a connectivity pause.
  try {
    await dispatchQueuedNotifications(outboundConnectivity.available);
  } catch (error) {
    console.error("[sentrovia] Unable to start queued notifications; monitor checks will continue.", error);
  }
  if (!(await isRunRequested())) return { status: "stopped" };

  if (!outboundConnectivity.available) {
    return { status: "connectivity-paused", message: outboundConnectivity.message };
  }

  await runDueReportSchedules();
  return (await isRunRequested()) ? { status: "completed" } : { status: "stopped" };
}
