import type { MonitorPayload, MonitorRecord } from "@/lib/monitors/types";
import { DEFAULT_MONITOR_FORM } from "@/lib/monitors/types";
import { toMonitorPayload } from "@/lib/monitors/targets";

export function formatLastChecked(value: string | null) {
  if (!value) return "Never";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";

  const diffMinutes = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  return `${Math.floor(diffHours / 24)}d ago`;
}

export function payloadFromMonitor(monitor: MonitorRecord): MonitorPayload {
  return {
    ...DEFAULT_MONITOR_FORM,
    ...toMonitorPayload(monitor),
    telegramTemplate: monitor.telegramTemplate ?? DEFAULT_MONITOR_FORM.telegramTemplate,
    emailSubject: monitor.emailSubject ?? DEFAULT_MONITOR_FORM.emailSubject,
    emailBody: monitor.emailBody ?? DEFAULT_MONITOR_FORM.emailBody,
    sendIncidentScreenshot: monitor.sendIncidentScreenshot,
  };
}
