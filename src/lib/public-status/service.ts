import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { monitorIncidents, monitors, userSettings, users } from "@/lib/db/schema";
import { buildMonitorHealthSummary } from "@/lib/monitors/health";
import { sanitizeMonitorUrlForDisplay } from "@/lib/monitors/targets";
import { getSettings } from "@/lib/settings/service";
import { resolveTimeDisplaySettings } from "@/lib/time";

export async function getPublicStatusPage(slug: string) {
  const trimmedSlug = slug.trim().toLowerCase();
  if (trimmedSlug.length === 0) {
    return null;
  }

  const [settingsRow] = await db
    .select({
      userId: userSettings.userId,
      publicStatusTitle: userSettings.publicStatusTitle,
      publicStatusSummary: userSettings.publicStatusSummary,
      firstName: users.firstName,
      organization: users.organization,
    })
    .from(userSettings)
    .innerJoin(users, eq(users.id, userSettings.userId))
    .where(and(eq(userSettings.publicStatusEnabled, true), eq(userSettings.publicStatusSlug, trimmedSlug)))
    .limit(1);

  if (!settingsRow) {
    return null;
  }

  const [settings, monitorRows, openIncidents] = await Promise.all([
    getSettings(settingsRow.userId),
    db
      .select({
        id: monitors.id,
        url: monitors.url,
        company: monitors.company,
        status: monitors.status,
        lastCheckedAt: monitors.lastCheckedAt,
        uptime: monitors.uptime,
        latencyMs: monitors.latencyMs,
        slowResponseThresholdMs: monitors.slowResponseThresholdMs,
        isActive: monitors.isActive,
        verificationMode: monitors.verificationMode,
        consecutiveFailures: monitors.consecutiveFailures,
      })
      .from(monitors)
      .where(and(eq(monitors.userId, settingsRow.userId), eq(monitors.isActive, true)))
      .orderBy(asc(monitors.company), asc(monitors.url)),
    db
      .select({
        monitorId: monitorIncidents.monitorId,
        startedAt: monitorIncidents.startedAt,
      })
      .from(monitorIncidents)
      .where(and(eq(monitorIncidents.userId, settingsRow.userId), eq(monitorIncidents.status, "open")))
      .orderBy(desc(monitorIncidents.startedAt)),
  ]);

  const timeDisplaySettings = resolveTimeDisplaySettings(settings?.appearance);
  const openIncidentMap = new Map(openIncidents.map((incident) => [incident.monitorId, incident.startedAt.toISOString()]));
  const services = monitorRows.map((monitor) => {
    const status = normalizePublicServiceStatus(monitor.status);
    const publicStatus = isSlowPublicService(status, monitor.latencyMs, monitor.slowResponseThresholdMs)
      ? "pending"
      : status;
    const health = buildMonitorHealthSummary({
      status: publicStatus,
      verificationMode: monitor.verificationMode,
      consecutiveFailures: monitor.consecutiveFailures,
      latencyMs: monitor.latencyMs,
      uptime: monitor.uptime,
      isActive: monitor.isActive,
      lastCheckedAt: monitor.lastCheckedAt,
    });

    return {
      id: monitor.id,
      url: sanitizePublicMonitorUrl(monitor.url),
      company: monitor.company ?? "Workspace",
      status: publicStatus,
      uptime: monitor.uptime,
      latencyMs: monitor.latencyMs,
      slowResponseThresholdMs: monitor.slowResponseThresholdMs,
      lastCheckedAt: monitor.lastCheckedAt?.toISOString() ?? null,
      healthScore: health.score,
      healthLabel: health.label,
      hasOpenIncident: openIncidentMap.has(monitor.id),
      incidentStartedAt: openIncidentMap.get(monitor.id) ?? null,
    };
  });

  const total = services.length;
  const operational = services.filter((service) => service.status === "up").length;
  const degraded = services.filter((service) => service.status === "pending").length;
  const outage = services.filter((service) => service.status === "down").length;

  return {
    slug: trimmedSlug,
    title:
      settingsRow.publicStatusTitle ||
      settingsRow.organization ||
      `${settingsRow.firstName} workspace status`,
    summary:
      settingsRow.publicStatusSummary ||
      "Live service availability, recent health state, and active incidents.",
    generatedAt: new Date().toISOString(),
    timeZone: timeDisplaySettings.timeZone,
    use24HourClock: timeDisplaySettings.use24HourClock,
    totals: {
      total,
      operational,
      degraded,
      outage,
    },
    services,
  };
}

export function isSlowPublicService(status: "up" | "down" | "pending", latencyMs: number | null, thresholdMs: number | null) {
  return status === "up" && typeof latencyMs === "number" && typeof thresholdMs === "number" && latencyMs > thresholdMs;
}

export function normalizePublicServiceStatus(status: string) {
  if (status === "up" || status === "down" || status === "pending") {
    return status;
  }

  return "pending";
}

export function sanitizePublicMonitorUrl(value: string) {
  return sanitizeMonitorUrlForDisplay(value);
}
