import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, monitorOutages, monitors, userSettings, users } from "@/lib/db/schema";
import { buildMonitorHealthSummary, isMonitorCheckStale } from "@/lib/monitors/health";
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
      publicStatusCompanyId: userSettings.publicStatusCompanyId,
      companyName: companies.name,
      companyDeletedAt: companies.deletedAt,
      firstName: users.firstName,
      organization: users.organization,
    })
    .from(userSettings)
    .innerJoin(users, eq(users.id, userSettings.userId))
    .leftJoin(companies, and(
      eq(companies.id, userSettings.publicStatusCompanyId),
      eq(companies.userId, userSettings.userId)
    ))
    .where(and(eq(userSettings.publicStatusEnabled, true), eq(userSettings.publicStatusSlug, trimmedSlug)))
    .limit(1);

  if (!settingsRow) {
    return null;
  }

  if (!isPublicStatusCompanyAvailable(
    settingsRow.publicStatusCompanyId,
    settingsRow.companyName,
    settingsRow.companyDeletedAt
  )) {
    return null;
  }

  const monitorScope = settingsRow.publicStatusCompanyId
    ? eq(monitors.companyId, settingsRow.publicStatusCompanyId)
    : undefined;

  const [settings, monitorRows, openOutages] = await Promise.all([
    getSettings(settingsRow.userId),
    db
      .select({
        id: monitors.id,
        url: monitors.url,
        company: monitors.company,
        status: monitors.status,
        lastCheckedAt: monitors.lastCheckedAt,
        nextCheckAt: monitors.nextCheckAt,
        intervalValue: monitors.intervalValue,
        intervalUnit: monitors.intervalUnit,
        timeout: monitors.timeout,
        uptime: monitors.uptime,
        latencyMs: monitors.latencyMs,
        slowResponseThresholdMs: monitors.slowResponseThresholdMs,
        isActive: monitors.isActive,
        verificationMode: monitors.verificationMode,
        consecutiveFailures: monitors.consecutiveFailures,
      })
      .from(monitors)
      .where(and(
        eq(monitors.userId, settingsRow.userId),
        eq(monitors.isActive, true),
        isNull(monitors.deletedAt),
        monitorScope
      ))
      .orderBy(asc(monitors.company), asc(monitors.url)),
    db
      .select({
        monitorId: monitorOutages.monitorId,
        startedAt: monitorOutages.startedAt,
      })
      .from(monitorOutages)
      .where(and(eq(monitorOutages.userId, settingsRow.userId), eq(monitorOutages.status, "open")))
      .orderBy(desc(monitorOutages.startedAt)),
  ]);

  const timeDisplaySettings = resolveTimeDisplaySettings(settings?.appearance);
  const openOutageMap = new Map(openOutages.map((outage) => [outage.monitorId, outage.startedAt.toISOString()]));
  const generatedAt = new Date();
  const services = monitorRows.map((monitor) => {
    const status = normalizePublicServiceStatus(monitor.status);
    const stale = isMonitorCheckStale({
      lastCheckedAt: monitor.lastCheckedAt,
      nextCheckAt: monitor.nextCheckAt,
      intervalValue: monitor.intervalValue,
      intervalUnit: monitor.intervalUnit,
      timeout: monitor.timeout,
      now: generatedAt,
    });
    const publicStatus = isSlowPublicService(status, monitor.latencyMs, monitor.slowResponseThresholdMs) || (status === "up" && stale)
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
      nextCheckAt: monitor.nextCheckAt,
      intervalValue: monitor.intervalValue,
      intervalUnit: monitor.intervalUnit,
      timeout: monitor.timeout,
      now: generatedAt,
    });
    const hasOpenOutage = publicStatus === "down" && openOutageMap.has(monitor.id);

    return {
      id: monitor.id,
      url: sanitizePublicMonitorUrl(monitor.url),
      company: settingsRow.companyName ?? monitor.company ?? "Workspace",
      status: publicStatus,
      uptime: monitor.uptime,
      latencyMs: monitor.latencyMs,
      slowResponseThresholdMs: monitor.slowResponseThresholdMs,
      lastCheckedAt: monitor.lastCheckedAt?.toISOString() ?? null,
      healthScore: health.score,
      healthLabel: health.label,
      hasOpenOutage,
      outageStartedAt: hasOpenOutage ? openOutageMap.get(monitor.id) ?? null : null,
    };
  }).sort(comparePublicStatusServices);

  const total = services.length;
  const operational = services.filter((service) => service.status === "up").length;
  const degraded = services.filter((service) => service.status === "pending").length;
  const outage = services.filter((service) => service.status === "down").length;

  return {
    slug: trimmedSlug,
    title:
      settingsRow.publicStatusTitle ||
      (settingsRow.companyName ? `${settingsRow.companyName} service status` : null) ||
      settingsRow.organization ||
      `${settingsRow.firstName} workspace status`,
    summary:
      settingsRow.publicStatusSummary ||
      "Live service availability, recent health state, and active outages.",
    scope: {
      companyId: settingsRow.publicStatusCompanyId ?? null,
      companyName: settingsRow.companyName ?? null,
    },
    generatedAt: generatedAt.toISOString(),
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

export function isPublicStatusCompanyAvailable(
  companyId: string | null,
  companyName: string | null,
  deletedAt: Date | null
) {
  return !companyId || Boolean(companyName && !deletedAt);
}

export function comparePublicStatusServices(
  left: { status: string; url: string },
  right: { status: string; url: string }
) {
  const priority = { down: 0, pending: 1, up: 2 } as const;
  const statusDifference = priority[normalizePublicServiceStatus(left.status)]
    - priority[normalizePublicServiceStatus(right.status)];

  return statusDifference || left.url.localeCompare(right.url);
}
