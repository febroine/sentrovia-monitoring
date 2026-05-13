import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import type Mail from "nodemailer/lib/mailer";
import { getCompanyById } from "@/lib/companies/service";
import { db } from "@/lib/db";
import { companies, monitorChecks, monitorEvents, monitors, reportSchedules } from "@/lib/db/schema";
import { sendEmailDelivery } from "@/lib/delivery/service";
import { buildPrintableReportHtml, buildReportCsv, buildReportFileSlug } from "@/lib/reports/export";
import { buildReportPdf } from "@/lib/reports/pdf";
import { getSettings } from "@/lib/settings/service";
import type {
  GeneratedReport,
  ReportCadence,
  ReportPreviewInput,
  ReportScheduleInput,
  ReportScheduleRecord,
  ReportScheduleStatus,
  ReportTemplateVariant,
} from "@/lib/reports/types";

const REPORT_PREVIEW_LIMIT = 12;
const RECENT_FAILURE_LIMIT = 8;
const DEFAULT_FIRST_RUN_DELAY_MS = 60 * 60 * 1000;
const DEFAULT_REPORT_TEMPLATE: ReportTemplateVariant = "operations";
type ReportDeliveryOptions = {
  deliveryDetailLevel: "summary" | "standard" | "full";
  attachCsv: boolean;
  attachHtml: boolean;
  attachPdf: boolean;
  includeIncidentSummary: boolean;
  includeMonitorBreakdown: boolean;
  emailSubjectTemplate: string | null;
  emailIntroTemplate: string | null;
};

const DEFAULT_REPORT_DELIVERY_OPTIONS: ReportDeliveryOptions = {
  deliveryDetailLevel: "standard",
  attachCsv: true,
  attachHtml: true,
  attachPdf: true,
  includeIncidentSummary: true,
  includeMonitorBreakdown: true,
  emailSubjectTemplate: null,
  emailIntroTemplate: null,
};

export async function listReportSchedules(userId: string): Promise<ReportScheduleRecord[]> {
  const rows = await db
    .select()
    .from(reportSchedules)
    .where(eq(reportSchedules.userId, userId))
    .orderBy(desc(reportSchedules.createdAt));

  const companyIds = Array.from(new Set(rows.map((row) => row.companyId).filter(Boolean))) as string[];
  const companyRows =
    companyIds.length === 0
      ? []
      : await db
          .select({ id: companies.id, name: companies.name })
          .from(companies)
          .where(inArray(companies.id, companyIds));
  const companyNameMap = new Map<string, string>();

  for (const row of companyRows) {
    companyNameMap.set(row.id, row.name);
  }

  return rows.map((row) => serializeSchedule(row, companyNameMap.get(row.companyId ?? "") ?? null));
}

export async function createReportSchedule(userId: string, input: ReportScheduleInput) {
  const resolvedCompanyId = await resolveScopedCompanyId(userId, input);
  const [created] = await db
    .insert(reportSchedules)
    .values({
      userId,
      name: input.name.trim(),
      scope: input.scope,
      cadence: input.cadence,
      template: input.template ?? DEFAULT_REPORT_TEMPLATE,
      companyId: resolvedCompanyId,
      recipientEmails: normalizeEmails(input.recipientEmails),
      isActive: input.isActive,
      nextRunAt: resolveNextRunAt(input.nextRunAt),
      lastStatus: "idle",
      ...normalizeReportDeliveryOptions(input),
    })
    .returning();

  return serializeSchedule(created, await resolveCompanyName(userId, resolvedCompanyId));
}

async function getReportScheduleById(userId: string, scheduleId: string) {
  const [row] = await db
    .select()
    .from(reportSchedules)
    .where(and(eq(reportSchedules.id, scheduleId), eq(reportSchedules.userId, userId)));

  if (!row) {
    return null;
  }

  return serializeSchedule(row, await resolveCompanyName(userId, row.companyId));
}

export async function updateReportSchedule(
  userId: string,
  scheduleId: string,
  input: Partial<ReportScheduleInput>
) {
  const [existing] = await db
    .select()
    .from(reportSchedules)
    .where(and(eq(reportSchedules.id, scheduleId), eq(reportSchedules.userId, userId)));

  if (!existing) {
    return null;
  }

  const scope = input.scope ?? (existing.scope as ReportPreviewInput["scope"]);
  const cadence = input.cadence ?? (existing.cadence as ReportCadence);
  const template = input.template ?? (existing.template as ReportTemplateVariant);
  const companyId = await resolveScopedCompanyId(userId, {
    scope,
    cadence,
    template,
    companyId: input.companyId ?? existing.companyId,
    name: input.name ?? existing.name,
    recipientEmails: input.recipientEmails ?? existing.recipientEmails,
    isActive: input.isActive ?? existing.isActive,
    nextRunAt: input.nextRunAt ?? existing.nextRunAt?.toISOString() ?? null,
  });

  const [updated] = await db
    .update(reportSchedules)
    .set({
      name: input.name?.trim() ?? existing.name,
      scope,
      cadence,
      template,
      companyId,
      recipientEmails: input.recipientEmails ? normalizeEmails(input.recipientEmails) : existing.recipientEmails,
      isActive: input.isActive ?? existing.isActive,
      nextRunAt: input.nextRunAt ? new Date(input.nextRunAt) : existing.nextRunAt,
      ...normalizeReportDeliveryOptions({ ...existing, ...input }),
      updatedAt: new Date(),
    })
    .where(and(eq(reportSchedules.id, scheduleId), eq(reportSchedules.userId, userId)))
    .returning();

  return serializeSchedule(updated, await resolveCompanyName(userId, companyId));
}

export async function duplicateReportSchedule(userId: string, scheduleId: string) {
  const [existing] = await db
    .select()
    .from(reportSchedules)
    .where(and(eq(reportSchedules.id, scheduleId), eq(reportSchedules.userId, userId)));

  if (!existing) {
    return null;
  }

  const [created] = await db
    .insert(reportSchedules)
    .values({
      userId,
      name: `${existing.name} Copy`,
      scope: existing.scope,
      cadence: existing.cadence,
      template: existing.template,
      companyId: existing.companyId,
      recipientEmails: existing.recipientEmails,
      isActive: false,
      nextRunAt: resolveNextRunAt(null),
      lastStatus: "idle",
      lastRunAt: null,
      lastDeliveredAt: null,
      lastErrorMessage: null,
      deliveryDetailLevel: existing.deliveryDetailLevel,
      attachCsv: existing.attachCsv,
      attachHtml: existing.attachHtml,
      attachPdf: existing.attachPdf,
      includeIncidentSummary: existing.includeIncidentSummary,
      includeMonitorBreakdown: existing.includeMonitorBreakdown,
      emailSubjectTemplate: existing.emailSubjectTemplate,
      emailIntroTemplate: existing.emailIntroTemplate,
    })
    .returning();

  return serializeSchedule(created, await resolveCompanyName(userId, created.companyId));
}

export async function deleteReportSchedule(userId: string, scheduleId: string) {
  const [deleted] = await db
    .delete(reportSchedules)
    .where(and(eq(reportSchedules.id, scheduleId), eq(reportSchedules.userId, userId)))
    .returning({ id: reportSchedules.id });

  return deleted ?? null;
}

export async function generateReportPreview(
  userId: string,
  input: ReportPreviewInput,
  now = new Date()
): Promise<GeneratedReport> {
  const scoped = await loadScopedReportData(userId, input, now);
  const workspaceName = await getWorkspaceName(userId);
  const period = resolveReportPeriod(input.cadence, now);
  const template = input.template ?? DEFAULT_REPORT_TEMPLATE;
  const checksByMonitor = groupChecksByMonitor(scoped.checks);
  const failuresByMonitor = groupFailuresByMonitor(scoped.failureEvents);
  const statusCodeSummary = buildStatusCodeSummary(scoped.checks);
  const slowMonitors = buildSlowMonitorSummary(scoped.monitorRows, checksByMonitor);
  const failingMonitors = buildFailingMonitorSummary(scoped.monitorRows, failuresByMonitor);
  const monitorBreakdown = buildMonitorBreakdown(scoped.monitorRows, checksByMonitor, failuresByMonitor);
  const totalChecks = scoped.checks.filter((check) => check.status !== "pending").length;
  const upChecks = scoped.checks.filter((check) => check.status === "up").length;
  const downChecks = scoped.checks.filter((check) => check.status === "down").length;
  const pendingChecks = scoped.checks.filter((check) => check.status === "pending").length;
  const latencySamples = scoped.checks
    .map((check) => check.latencyMs)
    .filter((value): value is number => typeof value === "number");
  const averageLatencyMs = averageValue(
    latencySamples
  );
  const uptimePct = totalChecks > 0 ? roundToTwoDecimals((upChecks / totalChecks) * 100) : 100;
  const failureRatePct = totalChecks > 0 ? roundToTwoDecimals((downChecks / totalChecks) * 100) : 0;
  const impactedMonitors = failingMonitors.length;
  const p95LatencyMs = percentileValue(latencySamples, 95);
  const healthScore = buildHealthScore({
    uptimePct,
    failureRatePct,
    p95LatencyMs,
    currentlyDown: scoped.monitorRows.filter((monitor) => monitor.status === "down").length,
  });
  const recentFailures = buildRecentFailures(scoped.failureEvents, scoped.monitorRows);
  const recommendations = buildRecommendations({
    summary: {
      currentlyDown: scoped.monitorRows.filter((monitor) => monitor.status === "down").length,
      failureEvents: scoped.failureEvents.length,
      impactedMonitors,
      p95LatencyMs,
      failureRatePct,
    },
    failingMonitors,
    slowMonitors,
    statusCodes: statusCodeSummary,
  });

  return {
    title: buildReportTitle(input.cadence, input.scope, scoped.companyName),
    scope: input.scope,
    cadence: input.cadence,
    template,
    companyId: scoped.companyId,
    companyName: scoped.companyName,
    workspaceName,
    templateLabel: resolveTemplateLabel(template),
    generatedAt: now.toISOString(),
    periodStartedAt: period.startedAt.toISOString(),
    periodEndedAt: period.endedAt.toISOString(),
    periodLabel: period.label,
    summary: {
      monitorCount: scoped.monitorRows.length,
      currentlyUp: scoped.monitorRows.filter((monitor) => monitor.status === "up").length,
      currentlyDown: scoped.monitorRows.filter((monitor) => monitor.status === "down").length,
      currentlyPending: scoped.monitorRows.filter((monitor) => monitor.status === "pending").length,
      totalChecks,
      upChecks,
      downChecks,
      pendingChecks,
      uptimePct,
      averageLatencyMs,
      p95LatencyMs,
      failureEvents: scoped.failureEvents.length,
      impactedMonitors,
      failureRatePct,
      healthScore,
      healthStatus: buildHealthStatus(healthScore),
    },
    recommendations,
    statusCodes: statusCodeSummary,
    slowMonitors: slowMonitors.slice(0, REPORT_PREVIEW_LIMIT),
    failingMonitors: failingMonitors.slice(0, REPORT_PREVIEW_LIMIT),
    recentFailures,
    monitorBreakdown,
  };
}

export async function dispatchReportNow(
  userId: string,
  input: ReportPreviewInput,
  recipientEmails: string[]
) {
  const normalizedRecipients = normalizeEmails(recipientEmails);
  if (normalizedRecipients.length === 0) {
    throw new Error("At least one recipient email is required.");
  }

  const report = await generateReportPreview(userId, input);
  const deliveryOptions = normalizeReportDeliveryOptions(input);
  const message = buildReportMessage(report, deliveryOptions);
  const delivery = await sendEmailDelivery({
    userId,
    kind: "report",
    destinationOverride: normalizedRecipients.join(", "),
    subject: message.subject,
    textBody: message.textBody,
    htmlBody: message.htmlBody,
    attachments: await buildReportAttachments(report, deliveryOptions),
  });

  return {
    report,
    delivery: delivery ? serializeDeliveryResult(delivery) : null,
  };
}

export async function runDueReportSchedules(now = new Date()) {
  const dueSchedules = await db
    .select()
    .from(reportSchedules)
    .where(and(eq(reportSchedules.isActive, true), lte(reportSchedules.nextRunAt, now)))
    .orderBy(asc(reportSchedules.nextRunAt))
    .limit(20);

  for (const schedule of dueSchedules) {
    const nextRunAt = scheduleNextRunAfter(schedule.nextRunAt, schedule.cadence as ReportCadence, now);
    const claimedSchedule = await claimDueReportSchedule(schedule, now, nextRunAt);
    if (!claimedSchedule) {
      continue;
    }

    try {
      await dispatchReportNow(
        claimedSchedule.userId,
        {
          scope: claimedSchedule.scope as ReportPreviewInput["scope"],
          cadence: claimedSchedule.cadence as ReportCadence,
          template: claimedSchedule.template as ReportTemplateVariant,
          companyId: claimedSchedule.companyId,
          ...scheduleToDeliveryInput(claimedSchedule),
        },
        claimedSchedule.recipientEmails
      );

      await db
        .update(reportSchedules)
        .set({
          lastRunAt: now,
          lastDeliveredAt: now,
          lastStatus: "delivered",
          lastErrorMessage: null,
          nextRunAt,
          updatedAt: new Date(),
        })
        .where(eq(reportSchedules.id, claimedSchedule.id));
    } catch (error) {
      await db
        .update(reportSchedules)
        .set({
          lastRunAt: now,
          lastStatus: "failed",
          lastErrorMessage: toMessage(error),
          nextRunAt,
          updatedAt: new Date(),
        })
        .where(eq(reportSchedules.id, claimedSchedule.id));
    }
  }
}

export async function sendReportScheduleNow(userId: string, scheduleId: string, now = new Date()) {
  const schedule = await getReportScheduleById(userId, scheduleId);
  if (!schedule) {
    return null;
  }

  try {
    const result = await dispatchReportNow(
      userId,
      {
        scope: schedule.scope,
        cadence: schedule.cadence,
        template: schedule.template,
        companyId: schedule.companyId,
        ...scheduleToDeliveryInput(schedule),
      },
      schedule.recipientEmails
    );
    const updatedSchedule = await updateScheduleDeliveryState(scheduleId, {
      lastRunAt: now,
      lastDeliveredAt: now,
      lastStatus: "delivered",
      lastErrorMessage: null,
    });

    return {
      ...result,
      schedule: serializeSchedule(updatedSchedule, schedule.companyName),
    };
  } catch (error) {
    const updatedSchedule = await updateScheduleDeliveryState(scheduleId, {
      lastRunAt: now,
      lastDeliveredAt: null,
      lastStatus: "failed",
      lastErrorMessage: toMessage(error),
    });

    return {
      report: null,
      delivery: null,
      schedule: serializeSchedule(updatedSchedule, schedule.companyName),
      message: toMessage(error),
    };
  }
}

async function loadScopedReportData(userId: string, input: ReportPreviewInput, now: Date) {
  const period = resolveReportPeriod(input.cadence, now);
  const company =
    input.scope === "company" && input.companyId
      ? await getCompanyById(userId, input.companyId)
      : null;

  if (input.scope === "company" && !company) {
    throw new Error("The selected company could not be found.");
  }

  const monitorRows = await db
    .select({
      id: monitors.id,
      name: monitors.name,
      url: monitors.url,
      status: monitors.status,
      statusCode: monitors.statusCode,
      companyId: monitors.companyId,
      company: monitors.company,
      companyName: companies.name,
      lastCheckedAt: monitors.lastCheckedAt,
      lastFailureAt: monitors.lastFailureAt,
      lastErrorMessage: monitors.lastErrorMessage,
    })
    .from(monitors)
    .leftJoin(companies, eq(monitors.companyId, companies.id))
    .where(
      input.scope === "company" && company
        ? and(eq(monitors.userId, userId), eq(monitors.companyId, company.id), eq(monitors.isActive, true))
        : and(eq(monitors.userId, userId), eq(monitors.isActive, true))
    )
    .orderBy(asc(monitors.name));

  const monitorIds = monitorRows.map((monitor) => monitor.id);

  const checks =
    monitorIds.length === 0
      ? []
      : await db
          .select({
            monitorId: monitorChecks.monitorId,
            status: monitorChecks.status,
            statusCode: monitorChecks.statusCode,
            latencyMs: monitorChecks.latencyMs,
            createdAt: monitorChecks.createdAt,
          })
          .from(monitorChecks)
          .where(
            and(
              eq(monitorChecks.userId, userId),
              inArray(monitorChecks.monitorId, monitorIds),
              gte(monitorChecks.createdAt, period.startedAt),
              lte(monitorChecks.createdAt, period.endedAt)
            )
          )
          .orderBy(desc(monitorChecks.createdAt))
          .limit(8_000);

  const failureEvents =
    monitorIds.length === 0
      ? []
      : await db
          .select({
            monitorId: monitorEvents.monitorId,
            statusCode: monitorEvents.statusCode,
            message: monitorEvents.message,
            rcaSummary: monitorEvents.rcaSummary,
            createdAt: monitorEvents.createdAt,
          })
          .from(monitorEvents)
          .where(
            and(
              eq(monitorEvents.userId, userId),
              inArray(monitorEvents.monitorId, monitorIds),
              eq(monitorEvents.eventType, "failure"),
              gte(monitorEvents.createdAt, period.startedAt),
              lte(monitorEvents.createdAt, period.endedAt)
            )
          )
          .orderBy(desc(monitorEvents.createdAt))
          .limit(4_000);

  return {
    companyId: company?.id ?? null,
    companyName: company?.name ?? null,
    monitorRows,
    checks,
    failureEvents,
  };
}

function resolveReportPeriod(cadence: ReportCadence, now: Date) {
  const startedAt = new Date(now);

  if (cadence === "weekly") {
    startedAt.setDate(startedAt.getDate() - 7);
    return { startedAt, endedAt: now, label: "Last 7 days" };
  }

  startedAt.setDate(startedAt.getDate() - 30);
  return { startedAt, endedAt: now, label: "Last 30 days" };
}

function buildReportTitle(cadence: ReportCadence, scope: ReportPreviewInput["scope"], companyName: string | null) {
  const cadenceLabel = cadence === "weekly" ? "Weekly" : "Monthly";
  return scope === "company" ? `${cadenceLabel} ${companyName ?? "Company"} Report` : `${cadenceLabel} Workspace Report`;
}

function groupChecksByMonitor(
  checks: Array<{
    monitorId: string;
    status: string;
    statusCode: number | null;
    latencyMs: number | null;
    createdAt: Date;
  }>
) {
  const grouped = new Map<string, typeof checks>();

  for (const check of checks) {
    const current = grouped.get(check.monitorId) ?? [];
    current.push(check);
    grouped.set(check.monitorId, current);
  }

  return grouped;
}

function groupFailuresByMonitor(
  failureEvents: Array<{
    monitorId: string;
    createdAt: Date;
  }>
) {
  const grouped = new Map<string, typeof failureEvents>();

  for (const event of failureEvents) {
    const current = grouped.get(event.monitorId) ?? [];
    current.push(event);
    grouped.set(event.monitorId, current);
  }

  return grouped;
}

function buildStatusCodeSummary(
  checks: Array<{
    statusCode: number | null;
  }>
) {
  const counts = new Map<number, number>();

  for (const check of checks) {
    if (typeof check.statusCode !== "number") {
      continue;
    }

    counts.set(check.statusCode, (counts.get(check.statusCode) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([statusCode, count]) => ({ statusCode, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 6);
}

function buildSlowMonitorSummary(
  monitorRows: Array<{
    id: string;
    name: string;
  }>,
  checksByMonitor: Map<
    string,
    Array<{
      latencyMs: number | null;
      status: string;
    }>
  >
) {
  return monitorRows
    .map((monitor) => {
      const checks = checksByMonitor.get(monitor.id) ?? [];
      const latencies = checks
        .map((check) => check.latencyMs)
        .filter((value): value is number => typeof value === "number");

      return {
        monitorId: monitor.id,
        name: monitor.name,
        averageLatencyMs: averageValue(latencies),
        checks: latencies.length,
      };
    })
    .filter((item) => item.checks > 0)
    .sort((left, right) => right.averageLatencyMs - left.averageLatencyMs);
}

function buildFailingMonitorSummary(
  monitorRows: Array<{
    id: string;
    name: string;
  }>,
  failuresByMonitor: Map<
    string,
    Array<{
      createdAt: Date;
    }>
  >
) {
  return monitorRows
    .map((monitor) => {
      const failures = failuresByMonitor.get(monitor.id) ?? [];

      return {
        monitorId: monitor.id,
        name: monitor.name,
        failures: failures.length,
        lastFailureAt: failures[0]?.createdAt.toISOString() ?? null,
      };
    })
    .filter((item) => item.failures > 0)
    .sort((left, right) => right.failures - left.failures);
}

function buildMonitorBreakdown(
  monitorRows: Array<{
    id: string;
    name: string;
    url: string;
    company: string | null;
    companyName: string | null;
    status: string;
    statusCode: number | null;
    lastCheckedAt: Date | null;
    lastFailureAt: Date | null;
    lastErrorMessage: string | null;
  }>,
  checksByMonitor: Map<
    string,
    Array<{
      status: string;
      latencyMs: number | null;
    }>
  >,
  failuresByMonitor: Map<string, Array<{ createdAt: Date }>>
) {
  return monitorRows
    .map((monitor) => {
      const checks = checksByMonitor.get(monitor.id) ?? [];
      const settledChecks = checks.filter((check) => check.status !== "pending");
      const upChecks = settledChecks.filter((check) => check.status === "up").length;
      const downChecks = settledChecks.filter((check) => check.status === "down").length;
      const pendingChecks = checks.filter((check) => check.status === "pending").length;
      const latencies = settledChecks
        .map((check) => check.latencyMs)
        .filter((value): value is number => typeof value === "number");

      return {
        monitorId: monitor.id,
        name: monitor.name,
        url: monitor.url,
        companyName: monitor.companyName ?? monitor.company,
        status: monitor.status,
        currentStatusCode: monitor.statusCode,
        lastCheckedAt: monitor.lastCheckedAt?.toISOString() ?? null,
        lastFailureAt: monitor.lastFailureAt?.toISOString() ?? null,
        lastErrorMessage: monitor.lastErrorMessage,
        uptimePct:
          settledChecks.length > 0 ? roundToTwoDecimals((upChecks / settledChecks.length) * 100) : 100,
        averageLatencyMs: averageValue(latencies),
        p95LatencyMs: percentileValue(latencies, 95),
        totalChecks: settledChecks.length,
        upChecks,
        downChecks,
        pendingChecks,
        failures: (failuresByMonitor.get(monitor.id) ?? []).length,
      };
    })
    .sort((left, right) => {
      if (right.failures !== left.failures) {
        return right.failures - left.failures;
      }

      return right.averageLatencyMs - left.averageLatencyMs;
    });
}

function buildRecentFailures(
  failureEvents: Array<{
    monitorId: string;
    statusCode: number | null;
    message: string | null;
    rcaSummary: string | null;
    createdAt: Date;
  }>,
  monitorRows: Array<{
    id: string;
    name: string;
  }>
) {
  const monitorNameMap = new Map(monitorRows.map((monitor) => [monitor.id, monitor.name]));

  return failureEvents.slice(0, RECENT_FAILURE_LIMIT).map((event) => ({
    monitorId: event.monitorId,
    name: monitorNameMap.get(event.monitorId) ?? "Unknown monitor",
    statusCode: event.statusCode,
    message: event.message,
    rcaSummary: event.rcaSummary,
    createdAt: event.createdAt.toISOString(),
  }));
}

function buildRecommendations({
  summary,
  failingMonitors,
  slowMonitors,
  statusCodes,
}: {
  summary: {
    currentlyDown: number;
    failureEvents: number;
    impactedMonitors: number;
    p95LatencyMs: number;
    failureRatePct: number;
  };
  failingMonitors: Array<{ name: string; failures: number }>;
  slowMonitors: Array<{ name: string; averageLatencyMs: number }>;
  statusCodes: Array<{ statusCode: number; count: number }>;
}) {
  const recommendations: string[] = [];
  const serverErrorCount = statusCodes
    .filter((item) => item.statusCode >= 500)
    .reduce((sum, item) => sum + item.count, 0);

  if (summary.currentlyDown > 0) {
    recommendations.push(`${summary.currentlyDown} monitor is currently down. Prioritize active incidents before scheduled maintenance.`);
  }

  if (summary.impactedMonitors > 0) {
    recommendations.push(`${summary.impactedMonitors} monitor had at least one failure in this period. Review the failing monitor list for repeated patterns.`);
  }

  if (serverErrorCount > 0) {
    recommendations.push(`${serverErrorCount} server-side HTTP error checks were recorded. Check upstream application logs around the listed failure times.`);
  }

  if (summary.p95LatencyMs >= 1_500) {
    recommendations.push(`P95 latency is ${summary.p95LatencyMs}ms. Investigate slow endpoints and external dependencies before they become availability incidents.`);
  }

  if (summary.failureRatePct >= 5) {
    recommendations.push(`Failure rate is ${summary.failureRatePct.toFixed(2)}%. Consider tightening alert routing for the most affected services.`);
  }

  const topFailing = failingMonitors[0];
  if (topFailing && topFailing.failures >= 3) {
    recommendations.push(`${topFailing.name} is the most repeated failure source with ${topFailing.failures} events.`);
  }

  const topSlow = slowMonitors[0];
  if (topSlow && topSlow.averageLatencyMs >= 1_000) {
    recommendations.push(`${topSlow.name} has the highest average latency at ${topSlow.averageLatencyMs}ms.`);
  }

  if (recommendations.length === 0) {
    recommendations.push("No immediate operational action is required based on this report window.");
  }

  return recommendations.slice(0, 5);
}

function buildHealthScore({
  uptimePct,
  failureRatePct,
  p95LatencyMs,
  currentlyDown,
}: {
  uptimePct: number;
  failureRatePct: number;
  p95LatencyMs: number;
  currentlyDown: number;
}) {
  const latencyPenalty = Math.min(12, Math.floor(p95LatencyMs / 500));
  const downPenalty = currentlyDown * 8;
  const failurePenalty = Math.min(30, Math.round(failureRatePct * 2));

  return Math.max(0, Math.min(100, Math.round(uptimePct - latencyPenalty - downPenalty - failurePenalty)));
}

function buildHealthStatus(score: number) {
  if (score >= 95) {
    return "Excellent";
  }

  if (score >= 85) {
    return "Stable";
  }

  if (score >= 70) {
    return "Watch";
  }

  return "Critical";
}

function buildReportMessage(report: GeneratedReport, options: ReportDeliveryOptions) {
  const subjectPrefix =
    report.template === "executive"
      ? "[Sentrovia Executive Report]"
      : report.template === "client"
        ? "[Sentrovia Client Report]"
        : "[Sentrovia Operations Report]";
  const introLine =
    report.template === "executive"
      ? "A concise leadership snapshot of uptime, risk, and recent service movement."
      : report.template === "client"
        ? "A customer-friendly reliability summary focused on visible service health."
        : "An operator-ready report focused on detailed runtime behavior, checks, and failures.";
  const subject = renderReportTemplate(options.emailSubjectTemplate, report) || `${subjectPrefix} ${report.title}`;
  const intro = renderReportTemplate(options.emailIntroTemplate, report) || introLine;
  const lines = [
    `${report.title}`,
    `${report.workspaceName}`,
    `${report.templateLabel}`,
    intro,
    `${report.periodLabel} (${new Date(report.periodStartedAt).toLocaleString()} - ${new Date(report.periodEndedAt).toLocaleString()})`,
    "",
    `Health score: ${report.summary.healthScore}/100 (${report.summary.healthStatus})`,
    `Monitors: ${report.summary.monitorCount}`,
    `Currently up: ${report.summary.currentlyUp}`,
    `Currently down: ${report.summary.currentlyDown}`,
    `Currently pending: ${report.summary.currentlyPending}`,
    `Checks: ${report.summary.totalChecks}`,
    `Up checks: ${report.summary.upChecks}`,
    `Down checks: ${report.summary.downChecks}`,
    `Pending checks: ${report.summary.pendingChecks}`,
    `Uptime: ${report.summary.uptimePct.toFixed(2)}%`,
    `Average latency: ${report.summary.averageLatencyMs}ms`,
    `P95 latency: ${report.summary.p95LatencyMs}ms`,
    `Failure events: ${report.summary.failureEvents}`,
    `Failure rate: ${report.summary.failureRatePct.toFixed(2)}%`,
    `Impacted monitors: ${report.summary.impactedMonitors}`,
    "",
    "Recommended actions:",
    ...report.recommendations.map((item) => `- ${item}`),
    "",
    ...buildReportTextDetailLines(report, options),
    "",
    "Attachments:",
    ...buildAttachmentTextLines(options),
  ];

  return {
    subject,
    textBody: lines.join("\n"),
    htmlBody: buildReportEmailHtml(report, intro, options),
  };
}

function buildReportEmailHtml(report: GeneratedReport, introLine: string, options: ReportDeliveryOptions) {
  const scopeLabel = report.scope === "company" ? report.companyName ?? "Company" : "Workspace";
  const generatedAt = new Date(report.generatedAt).toLocaleString();

  return `
    <div style="margin:0;padding:0;background:#f8fafc;color:#0f172a;font-family:Arial,Helvetica,sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f8fafc;">
        <tr>
          <td align="center" style="padding:24px 12px;">
            <table role="presentation" width="720" cellpadding="0" cellspacing="0" style="width:720px;max-width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden;">
              <tr>
                <td style="padding:24px;background:#0f172a;color:#ffffff;">
                  <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#93c5fd;">${escapeHtml(report.templateLabel)}</div>
                  <h1 style="margin:8px 0 8px;font-size:24px;line-height:1.25;">${escapeHtml(report.title)}</h1>
                  <div style="font-size:14px;line-height:1.6;color:#cbd5e1;">${escapeHtml(report.workspaceName)} / ${escapeHtml(report.periodLabel)} / ${escapeHtml(scopeLabel)}</div>
                  <p style="margin:14px 0 0;font-size:14px;line-height:1.7;color:#e2e8f0;">${escapeHtml(introLine)}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:20px 24px 8px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                    <tr>
                      ${renderEmailMetric("Health score", `${report.summary.healthScore}/100`, report.summary.healthStatus)}
                      ${renderEmailMetric("Uptime", `${report.summary.uptimePct.toFixed(2)}%`, `${report.summary.upChecks}/${report.summary.totalChecks} successful`)}
                      ${renderEmailMetric("P95 latency", `${report.summary.p95LatencyMs}ms`, `${report.summary.averageLatencyMs}ms average`)}
                    </tr>
                    <tr>
                      ${renderEmailMetric("Down now", String(report.summary.currentlyDown), `${report.summary.currentlyUp} up, ${report.summary.currentlyPending} pending`)}
                      ${renderEmailMetric("Failures", String(report.summary.failureEvents), `${report.summary.impactedMonitors} impacted monitors`)}
                      ${renderEmailMetric("Failure rate", `${report.summary.failureRatePct.toFixed(2)}%`, `${report.summary.downChecks} failed checks`)}
                    </tr>
                  </table>
                </td>
              </tr>
              ${renderReportEmailDetailSections(report, options)}
              <tr>
                <td style="padding:18px 24px 24px;">
                  <div style="border:1px solid #bfdbfe;background:#eff6ff;border-radius:14px;padding:14px 16px;color:#1e3a8a;font-size:13px;line-height:1.6;">
                    ${escapeHtml(buildAttachmentSummary(options))} Generated at ${escapeHtml(generatedAt)}.
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;
}

function buildReportTextDetailLines(report: GeneratedReport, options: ReportDeliveryOptions) {
  if (options.deliveryDetailLevel === "summary") {
    return [];
  }

  const lines = [
    "",
    "Top slow monitors:",
    ...report.slowMonitors
      .slice(0, options.deliveryDetailLevel === "full" ? 8 : 5)
      .map((monitor) => `- ${monitor.name}: ${monitor.averageLatencyMs}ms avg over ${monitor.checks} checks`),
    "",
    "Top failing monitors:",
    ...report.failingMonitors
      .slice(0, options.deliveryDetailLevel === "full" ? 8 : 5)
      .map((monitor) => `- ${monitor.name}: ${monitor.failures} failures`),
  ];

  if (options.includeIncidentSummary) {
    lines.push(
      "",
      "Recent failures:",
      ...report.recentFailures
        .slice(0, options.deliveryDetailLevel === "full" ? 8 : 5)
        .map((event) => `- ${event.name}: ${event.statusCode ?? "N/A"} at ${new Date(event.createdAt).toLocaleString()} - ${event.rcaSummary ?? event.message ?? "No detail"}`)
    );
  }

  return lines;
}

function renderReportEmailDetailSections(report: GeneratedReport, options: ReportDeliveryOptions) {
  if (options.deliveryDetailLevel === "summary") {
    return renderEmailListSection("Recommended actions", report.recommendations);
  }

  const detailLimit = options.deliveryDetailLevel === "full" ? 8 : 5;
  const sections = [
    renderEmailListSection("Recommended actions", report.recommendations),
    renderEmailTableSection(
      "Top failing monitors",
      ["Monitor", "Failures", "Last failure"],
      report.failingMonitors.slice(0, detailLimit).map((monitor) => [
        monitor.name,
        String(monitor.failures),
        monitor.lastFailureAt ? new Date(monitor.lastFailureAt).toLocaleString() : "--",
      ])
    ),
    renderEmailTableSection(
      "Latency watchlist",
      ["Monitor", "Average", "Checks"],
      report.slowMonitors.slice(0, detailLimit).map((monitor) => [
        monitor.name,
        `${monitor.averageLatencyMs}ms`,
        String(monitor.checks),
      ])
    ),
  ];

  if (options.includeIncidentSummary) {
    sections.push(
      renderEmailTableSection(
        "Recent failure events",
        ["Monitor", "Code", "Detail"],
        report.recentFailures.slice(0, detailLimit).map((event) => [
          event.name,
          event.statusCode ? String(event.statusCode) : "--",
          event.rcaSummary ?? event.message ?? new Date(event.createdAt).toLocaleString(),
        ])
      )
    );
  }

  if (options.includeMonitorBreakdown && options.deliveryDetailLevel === "full") {
    sections.push(
      renderEmailTableSection(
        "Monitor breakdown",
        ["Monitor", "Uptime", "P95"],
        report.monitorBreakdown.slice(0, detailLimit).map((monitor) => [
          monitor.name,
          `${monitor.uptimePct.toFixed(2)}%`,
          `${monitor.p95LatencyMs}ms`,
        ])
      )
    );
  }

  return sections.join("");
}

async function buildReportAttachments(report: GeneratedReport, options: ReportDeliveryOptions): Promise<Mail.Attachment[]> {
  const fileSlug = buildReportFileSlug(report);
  const attachments: Mail.Attachment[] = [];

  if (options.attachCsv) {
    attachments.push({
      filename: `${fileSlug}.csv`,
      content: buildReportCsv(report),
      contentType: "text/csv; charset=utf-8",
    });
  }

  if (options.attachHtml) {
    attachments.push({
      filename: `${fileSlug}.html`,
      content: buildPrintableReportHtml(report),
      contentType: "text/html; charset=utf-8",
    });
  }

  if (options.attachPdf) {
    attachments.push({
      filename: `${fileSlug}.pdf`,
      content: await buildReportPdf(report),
      contentType: "application/pdf",
    });
  }

  return attachments;
}

function renderEmailMetric(label: string, value: string, detail: string) {
  return `
    <td width="33.33%" style="padding:0 6px 12px;vertical-align:top;">
      <div style="border:1px solid #e2e8f0;border-radius:14px;padding:14px;background:#ffffff;">
        <div style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;">${escapeHtml(label)}</div>
        <div style="margin-top:6px;font-size:22px;line-height:1.2;font-weight:700;color:#0f172a;">${escapeHtml(value)}</div>
        <div style="margin-top:4px;font-size:12px;line-height:1.5;color:#64748b;">${escapeHtml(detail)}</div>
      </div>
    </td>
  `;
}

function renderEmailListSection(title: string, items: string[]) {
  const safeItems = items.length > 0 ? items : ["No data in this period."];

  return `
    <tr>
      <td style="padding:12px 24px;">
        <h2 style="margin:0 0 10px;font-size:16px;color:#0f172a;">${escapeHtml(title)}</h2>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          ${safeItems
            .map(
              (item) => `
                <tr>
                  <td style="padding:9px 0;border-top:1px solid #e2e8f0;font-size:13px;line-height:1.6;color:#334155;">${escapeHtml(item)}</td>
                </tr>
              `
            )
            .join("")}
        </table>
      </td>
    </tr>
  `;
}

function renderEmailTableSection(title: string, headers: string[], rows: string[][]) {
  const safeRows = rows.length > 0 ? rows : [["No data", "--", "--"]];

  return `
    <tr>
      <td style="padding:12px 24px;">
        <h2 style="margin:0 0 10px;font-size:16px;color:#0f172a;">${escapeHtml(title)}</h2>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
          <thead>
            <tr>
              ${headers.map((header) => `<th align="left" style="padding:10px 12px;background:#f1f5f9;color:#475569;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;">${escapeHtml(header)}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${safeRows
              .map(
                (row) => `
                  <tr>
                    ${row.map((cell) => `<td style="padding:10px 12px;border-top:1px solid #e2e8f0;font-size:13px;line-height:1.5;color:#334155;">${escapeHtml(cell)}</td>`).join("")}
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </td>
    </tr>
  `;
}

function resolveNextRunAt(nextRunAt: string | null | undefined) {
  return nextRunAt ? new Date(nextRunAt) : new Date(Date.now() + DEFAULT_FIRST_RUN_DELAY_MS);
}

async function resolveScopedCompanyId(userId: string, input: ReportScheduleInput) {
  if (input.scope !== "company") {
    return null;
  }

  if (!input.companyId) {
    throw new Error("A company must be selected for company reports.");
  }

  const company = await getCompanyById(userId, input.companyId);
  if (!company) {
    throw new Error("The selected company could not be found.");
  }

  return company.id;
}

async function resolveCompanyName(userId: string, companyId: string | null) {
  if (!companyId) {
    return null;
  }

  const company = await getCompanyById(userId, companyId);
  return company?.name ?? null;
}

function serializeSchedule(
  row: typeof reportSchedules.$inferSelect,
  companyName: string | null
): ReportScheduleRecord {
  return {
    id: row.id,
    name: row.name,
    scope: row.scope as ReportScheduleRecord["scope"],
    cadence: row.cadence as ReportScheduleRecord["cadence"],
    template: row.template as ReportTemplateVariant,
    companyId: row.companyId,
    companyName,
    recipientEmails: row.recipientEmails,
    isActive: row.isActive,
    nextRunAt: row.nextRunAt.toISOString(),
    lastRunAt: row.lastRunAt?.toISOString() ?? null,
    lastDeliveredAt: row.lastDeliveredAt?.toISOString() ?? null,
    lastStatus: row.lastStatus as ReportScheduleStatus,
    lastErrorMessage: row.lastErrorMessage,
    deliveryDetailLevel: resolveDeliveryDetailLevel(row.deliveryDetailLevel),
    attachCsv: row.attachCsv,
    attachHtml: row.attachHtml,
    attachPdf: row.attachPdf,
    includeIncidentSummary: row.includeIncidentSummary,
    includeMonitorBreakdown: row.includeMonitorBreakdown,
    emailSubjectTemplate: row.emailSubjectTemplate,
    emailIntroTemplate: row.emailIntroTemplate,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function scheduleToDeliveryInput(schedule: typeof reportSchedules.$inferSelect | ReportScheduleRecord) {
  return {
    deliveryDetailLevel: resolveDeliveryDetailLevel(schedule.deliveryDetailLevel),
    attachCsv: schedule.attachCsv,
    attachHtml: schedule.attachHtml,
    attachPdf: schedule.attachPdf,
    includeIncidentSummary: schedule.includeIncidentSummary,
    includeMonitorBreakdown: schedule.includeMonitorBreakdown,
    emailSubjectTemplate: schedule.emailSubjectTemplate,
    emailIntroTemplate: schedule.emailIntroTemplate,
  };
}

function normalizeReportDeliveryOptions(input: Partial<ReportPreviewInput> | Record<string, unknown>): ReportDeliveryOptions {
  return {
    deliveryDetailLevel: resolveDeliveryDetailLevel(input.deliveryDetailLevel),
    attachCsv: booleanOption(input.attachCsv, DEFAULT_REPORT_DELIVERY_OPTIONS.attachCsv),
    attachHtml: booleanOption(input.attachHtml, DEFAULT_REPORT_DELIVERY_OPTIONS.attachHtml),
    attachPdf: booleanOption(input.attachPdf, DEFAULT_REPORT_DELIVERY_OPTIONS.attachPdf),
    includeIncidentSummary:
      booleanOption(input.includeIncidentSummary, DEFAULT_REPORT_DELIVERY_OPTIONS.includeIncidentSummary),
    includeMonitorBreakdown:
      booleanOption(input.includeMonitorBreakdown, DEFAULT_REPORT_DELIVERY_OPTIONS.includeMonitorBreakdown),
    emailSubjectTemplate: emptyTemplateToNull(input.emailSubjectTemplate),
    emailIntroTemplate: emptyTemplateToNull(input.emailIntroTemplate),
  };
}

function resolveDeliveryDetailLevel(value: unknown): ReportDeliveryOptions["deliveryDetailLevel"] {
  return value === "summary" || value === "full" ? value : "standard";
}

function emptyTemplateToNull(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function booleanOption(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeEmails(recipientEmails: string[]) {
  return Array.from(new Set(recipientEmails.map((email) => email.trim().toLowerCase()).filter(Boolean)));
}

function resolveTemplateLabel(template: ReportTemplateVariant) {
  if (template === "executive") {
    return "Executive Summary";
  }

  if (template === "client") {
    return "Client Report";
  }

  return "Operations Report";
}

function averageValue(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function percentileValue(values: number[], percentile: number) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil((percentile / 100) * sorted.length) - 1);

  return sorted[index] ?? 0;
}

function roundToTwoDecimals(value: number) {
  return Math.round(value * 100) / 100;
}

function scheduleNextRunAfter(currentRunAt: Date, cadence: ReportCadence, after: Date) {
  const nextRunAt = new Date(currentRunAt);

  while (nextRunAt <= after) {
    if (cadence === "weekly") {
      nextRunAt.setDate(nextRunAt.getDate() + 7);
    } else {
      nextRunAt.setMonth(nextRunAt.getMonth() + 1);
    }
  }

  return nextRunAt;
}

async function claimDueReportSchedule(
  schedule: typeof reportSchedules.$inferSelect,
  now: Date,
  nextRunAt: Date
) {
  const [claimed] = await db
    .update(reportSchedules)
    .set({
      lastRunAt: now,
      nextRunAt,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(reportSchedules.id, schedule.id),
        eq(reportSchedules.isActive, true),
        eq(reportSchedules.nextRunAt, schedule.nextRunAt)
      )
    )
    .returning();

  return claimed ?? null;
}

async function updateScheduleDeliveryState(
  scheduleId: string,
  values: {
    lastRunAt: Date;
    lastDeliveredAt: Date | null;
    lastStatus: ReportScheduleStatus;
    lastErrorMessage: string | null;
  }
) {
  const [updated] = await db
    .update(reportSchedules)
    .set({
      ...values,
      updatedAt: new Date(),
    })
    .where(eq(reportSchedules.id, scheduleId))
    .returning();

  return updated;
}

async function getWorkspaceName(userId: string) {
  const settings = await getSettings(userId);
  return settings?.profile.organization || "Sentrovia Workspace";
}

function serializeDeliveryResult(delivery: {
  status: string;
  deliveredAt?: Date | string | null;
}) {
  return {
    status: delivery.status,
    deliveredAt:
      delivery.deliveredAt instanceof Date
        ? delivery.deliveredAt.toISOString()
        : delivery.deliveredAt ?? null,
  };
}

function renderReportTemplate(template: string | null, report: GeneratedReport) {
  if (!template) {
    return "";
  }

  const replacements: Record<string, string> = {
    "{title}": report.title,
    "{workspace}": report.workspaceName,
    "{scope}": report.scope === "company" ? report.companyName ?? "Company" : "Workspace",
    "{period}": report.periodLabel,
    "{template}": report.templateLabel,
    "{health_score}": String(report.summary.healthScore),
    "{health_status}": report.summary.healthStatus,
    "{uptime}": `${report.summary.uptimePct.toFixed(2)}%`,
    "{failure_rate}": `${report.summary.failureRatePct.toFixed(2)}%`,
    "{failures}": String(report.summary.failureEvents),
    "{down_now}": String(report.summary.currentlyDown),
    "{p95_latency}": `${report.summary.p95LatencyMs}ms`,
    "{generated_at}": new Date(report.generatedAt).toLocaleString(),
  };

  return Object.entries(replacements).reduce(
    (result, [token, value]) => result.split(token).join(value),
    template
  );
}

function buildAttachmentTextLines(options: ReportDeliveryOptions) {
  const lines: string[] = [];

  if (options.attachCsv) {
    lines.push("- CSV report package for spreadsheets and handoff");
  }

  if (options.attachHtml) {
    lines.push("- Print-ready HTML report for browser/PDF export");
  }

  if (options.attachPdf) {
    lines.push("- PDF report attachment for direct sharing");
  }

  return lines.length > 0 ? lines : ["- No file attachments configured"];
}

function buildAttachmentSummary(options: ReportDeliveryOptions) {
  const enabled = [
    options.attachCsv ? "CSV" : null,
    options.attachHtml ? "HTML" : null,
    options.attachPdf ? "PDF" : null,
  ].filter(Boolean);

  return enabled.length > 0
    ? `${enabled.join(", ")} attachments are included for handoff, audit, and sharing.`
    : "This delivery was configured without file attachments.";
}

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected report delivery failure.";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
