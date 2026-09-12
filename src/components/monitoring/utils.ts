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

export function formatLatency(value: number | null) {
  return typeof value === "number" ? `${value}ms` : "--";
}

export function payloadFromMonitor(monitor: MonitorRecord): MonitorPayload {
  return {
    ...DEFAULT_MONITOR_FORM,
    ...toMonitorPayload(monitor),
    telegramTemplate: monitor.telegramTemplate ?? DEFAULT_MONITOR_FORM.telegramTemplate,
    emailSubject: monitor.emailSubject ?? DEFAULT_MONITOR_FORM.emailSubject,
    emailHeadline: monitor.emailHeadline ?? DEFAULT_MONITOR_FORM.emailHeadline,
    emailBody: monitor.emailBody ?? DEFAULT_MONITOR_FORM.emailBody,
    slowResponseEmailSubject: monitor.slowResponseEmailSubject ?? DEFAULT_MONITOR_FORM.slowResponseEmailSubject,
    slowResponseEmailHeadline: monitor.slowResponseEmailHeadline ?? DEFAULT_MONITOR_FORM.slowResponseEmailHeadline,
    slowResponseEmailBody: monitor.slowResponseEmailBody ?? DEFAULT_MONITOR_FORM.slowResponseEmailBody,
    slowResponseTelegramTemplate:
      monitor.slowResponseTelegramTemplate ?? DEFAULT_MONITOR_FORM.slowResponseTelegramTemplate,
    recoveryEmailSubject: monitor.recoveryEmailSubject ?? DEFAULT_MONITOR_FORM.recoveryEmailSubject,
    recoveryEmailHeadline: monitor.recoveryEmailHeadline ?? DEFAULT_MONITOR_FORM.recoveryEmailHeadline,
    recoveryEmailBody: monitor.recoveryEmailBody ?? DEFAULT_MONITOR_FORM.recoveryEmailBody,
    recoveryTelegramTemplate: monitor.recoveryTelegramTemplate ?? DEFAULT_MONITOR_FORM.recoveryTelegramTemplate,
    prolongedDowntimeEmailSubject:
      monitor.prolongedDowntimeEmailSubject ?? DEFAULT_MONITOR_FORM.prolongedDowntimeEmailSubject,
    prolongedDowntimeEmailHeadline:
      monitor.prolongedDowntimeEmailHeadline ?? DEFAULT_MONITOR_FORM.prolongedDowntimeEmailHeadline,
    prolongedDowntimeEmailBody:
      monitor.prolongedDowntimeEmailBody ?? DEFAULT_MONITOR_FORM.prolongedDowntimeEmailBody,
    prolongedDowntimeTelegramTemplate:
      monitor.prolongedDowntimeTelegramTemplate ?? DEFAULT_MONITOR_FORM.prolongedDowntimeTelegramTemplate,
    sslExpiryEmailSubject: monitor.sslExpiryEmailSubject ?? DEFAULT_MONITOR_FORM.sslExpiryEmailSubject,
    sslExpiryEmailHeadline: monitor.sslExpiryEmailHeadline ?? DEFAULT_MONITOR_FORM.sslExpiryEmailHeadline,
    sslExpiryEmailBody: monitor.sslExpiryEmailBody ?? DEFAULT_MONITOR_FORM.sslExpiryEmailBody,
    sslExpiryTelegramTemplate: monitor.sslExpiryTelegramTemplate ?? DEFAULT_MONITOR_FORM.sslExpiryTelegramTemplate,
    sendOutageScreenshot: monitor.sendOutageScreenshot,
    slowResponseThresholdMs: monitor.slowResponseThresholdMs,
  };
}
