import type { MonitorInput } from "@/lib/monitors/schemas";

export function assertRestorablePostgresMonitorPasswords(monitors: MonitorInput[]) {
  const missingPasswordMonitors = monitors.filter((monitor) => (
    monitor.monitorType === "postgres"
    && monitor.databasePasswordConfigured
    && monitor.databasePassword.trim().length === 0
  ));

  if (missingPasswordMonitors.length === 0) {
    return;
  }

  const names = missingPasswordMonitors.map((monitor) => monitor.name).join(", ");
  throw new Error(
    `PostgreSQL monitor passwords are not included in backups or monitor config exports. Re-enter passwords before continuing: ${names}`
  );
}
