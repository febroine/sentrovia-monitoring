import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  companies,
  monitorOutages,
  monitors,
  publicStatusPages,
  users,
} from "@/lib/db/schema";
import { buildMonitorHealthSummary, isMonitorCheckStale } from "@/lib/monitors/health";
import { sanitizeMonitorUrlForDisplay } from "@/lib/monitors/targets";
import { formatMonitorUptime, getMonitorUptimeById } from "@/lib/monitoring/uptime";
import { getSettings } from "@/lib/settings/service";
import { resolveTimeDisplaySettings } from "@/lib/time";

export async function getPublicStatusPage(slug: string) {
  const trimmedSlug = slug.trim().toLowerCase();
  if (trimmedSlug.length === 0) {
    return null;
  }

  const pageRow = await findPublicStatusPage(trimmedSlug);

  if (!pageRow) {
    return null;
  }

  if (!isPublicStatusCompanyAvailable(
    pageRow.companyId,
    pageRow.companyName,
    pageRow.companyDeletedAt
  )) {
    return null;
  }

  const monitorScope = pageRow.companyId
    ? eq(monitors.companyId, pageRow.companyId)
    : undefined;
  const publicMonitorScope = and(
    eq(monitors.userId, pageRow.userId),
    eq(monitors.isActive, true),
    eq(monitors.publishOnStatusPage, true),
    isNull(monitors.deletedAt),
    monitorScope
  );

  const generatedAt = new Date();
  const [settings, monitorRows, openOutages] = await Promise.all([
    getSettings(pageRow.userId),
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
        latencyMs: monitors.latencyMs,
        slowResponseThresholdMs: monitors.slowResponseThresholdMs,
        isActive: monitors.isActive,
        verificationMode: monitors.verificationMode,
        consecutiveFailures: monitors.consecutiveFailures,
      })
      .from(monitors)
      .where(publicMonitorScope)
      .orderBy(asc(monitors.company), asc(monitors.url)),
    db
      .select({
        monitorId: monitorOutages.monitorId,
        startedAt: monitorOutages.startedAt,
      })
      .from(monitorOutages)
      .innerJoin(monitors, eq(monitors.id, monitorOutages.monitorId))
      .where(and(
        eq(monitorOutages.userId, pageRow.userId),
        eq(monitorOutages.status, "open"),
        publicMonitorScope
      ))
      .orderBy(desc(monitorOutages.startedAt)),
  ]);

  const uptimeByMonitorId = await getMonitorUptimeById(
    pageRow.userId,
    monitorRows.map((monitor) => monitor.id),
    generatedAt
  );
  const timeDisplaySettings = resolveTimeDisplaySettings(settings?.appearance);
  const openOutageMap = new Map(openOutages.map((outage) => [outage.monitorId, outage.startedAt.toISOString()]));
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
    const uptime = uptimeByMonitorId.get(monitor.id) ?? formatMonitorUptime();
    const health = buildMonitorHealthSummary({
      status: publicStatus,
      verificationMode: monitor.verificationMode,
      consecutiveFailures: monitor.consecutiveFailures,
      latencyMs: monitor.latencyMs,
      uptime,
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
      company: pageRow.companyName ?? monitor.company ?? "Workspace",
      status: publicStatus,
      uptime,
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
      pageRow.title ||
      (pageRow.companyName ? `${pageRow.companyName} service status` : null) ||
      pageRow.organization ||
      `${pageRow.firstName} workspace status`,
    summary:
      pageRow.summary ||
      "Live service availability, recent health state, and active outages.",
    scope: {
      companyId: pageRow.companyId ?? null,
      companyName: pageRow.companyName ?? null,
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

async function findPublicStatusPage(slug: string) {
  const [page] = await db
    .select({
      userId: publicStatusPages.userId,
      title: publicStatusPages.title,
      summary: publicStatusPages.summary,
      companyId: publicStatusPages.companyId,
      isEnabled: publicStatusPages.isEnabled,
      companyName: companies.name,
      companyDeletedAt: companies.deletedAt,
      firstName: users.firstName,
      organization: users.organization,
    })
    .from(publicStatusPages)
    .innerJoin(users, eq(users.id, publicStatusPages.userId))
    .leftJoin(companies, and(
      eq(companies.id, publicStatusPages.companyId),
      eq(companies.userId, publicStatusPages.userId)
    ))
    .where(eq(publicStatusPages.slug, slug))
    .limit(1);

  return page?.isEnabled ? page : null;
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
