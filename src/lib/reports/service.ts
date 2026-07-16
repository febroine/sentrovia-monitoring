import crypto from "node:crypto";
import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import type Mail from "nodemailer/lib/mailer";
import { AuthError } from "@/lib/auth/errors";
import { getCompanyById } from "@/lib/companies/service";
import { db } from "@/lib/db";
import { companies, monitorChecks, monitorEvents, monitors, reportSchedules } from "@/lib/db/schema";
import { sendEmailDelivery } from "@/lib/delivery/service";
import { sanitizeMonitorUrlForDisplay } from "@/lib/monitors/targets";
import { buildPrintableReportHtml, buildReportFileSlug } from "@/lib/reports/export";
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
const REPORT_CLAIM_LEASE_MS = 15 * 60 * 1000;
const DUE_REPORT_BATCH_SIZE = 5;
const DEFAULT_REPORT_TEMPLATE: ReportTemplateVariant = "operations";
type ReportCheckAggregate = {
  monitorId: string;
  totalChecks: number;
  upChecks: number;
  downChecks: number;
  pendingChecks: number;
  latencySamples: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
};
type ReportFailureAggregate = {
  monitorId: string;
  failures: number;
  lastFailureAt: Date | null;
};
type ReportDeliveryOptions = {
  deliveryDetailLevel: "summary" | "standard" | "full";
  includeOutageSummary: boolean;
  includeMonitorBreakdown: boolean;
  emailSubjectTemplate: string | null;
  emailIntroTemplate: string | null;
};

const DEFAULT_REPORT_DELIVERY_OPTIONS: ReportDeliveryOptions = {
  deliveryDetailLevel: "standard",
  includeOutageSummary: true,
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
      reportBrandName: emptyTemplateToNull(input.reportBrandName),
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

  const hasNextRunAtUpdate = Object.prototype.hasOwnProperty.call(input, "nextRunAt");
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
    nextRunAt: hasNextRunAtUpdate ? input.nextRunAt : existing.nextRunAt?.toISOString() ?? null,
    reportBrandName: input.reportBrandName ?? existing.reportBrandName,
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
      nextRunAt: hasNextRunAtUpdate ? resolveNextRunAt(input.nextRunAt) : existing.nextRunAt,
      reportBrandName: Object.prototype.hasOwnProperty.call(input, "reportBrandName")
        ? emptyTemplateToNull(input.reportBrandName)
        : existing.reportBrandName,
      ...normalizeReportDeliveryOptions({ ...existing, ...input }),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(reportSchedules.id, scheduleId),
        eq(reportSchedules.userId, userId),
        reportScheduleClaimAvailable(new Date())
      )
    )
    .returning();

  if (!updated) {
    const [current] = await db
      .select({ id: reportSchedules.id })
      .from(reportSchedules)
      .where(and(eq(reportSchedules.id, scheduleId), eq(reportSchedules.userId, userId)));

    if (current) {
      throw new AuthError("Wait for the current report delivery to finish before updating this schedule.", 409);
    }

    return null;
  }

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
      includeOutageSummary: existing.includeOutageSummary,
      includeMonitorBreakdown: existing.includeMonitorBreakdown,
      emailSubjectTemplate: existing.emailSubjectTemplate,
      emailIntroTemplate: existing.emailIntroTemplate,
      reportBrandName: existing.reportBrandName,
    })
    .returning();

  return serializeSchedule(created, await resolveCompanyName(userId, created.companyId));
}

export async function deleteReportSchedule(userId: string, scheduleId: string) {
  const now = new Date();
  const [deleted] = await db
    .delete(reportSchedules)
    .where(
      and(
        eq(reportSchedules.id, scheduleId),
        eq(reportSchedules.userId, userId),
        reportScheduleClaimAvailable(now)
      )
    )
    .returning({ id: reportSchedules.id });

  if (deleted) {
    return deleted;
  }

  const [existing] = await db
    .select({ id: reportSchedules.id })
    .from(reportSchedules)
    .where(and(eq(reportSchedules.id, scheduleId), eq(reportSchedules.userId, userId)));

  if (existing) {
    throw new AuthError("Wait for the current report delivery to finish before deleting this schedule.", 409);
  }

  return null;
}

export async function generateReportPreview(
  userId: string,
  input: ReportPreviewInput,
  now = new Date()
): Promise<GeneratedReport> {
  const scoped = await loadScopedReportData(userId, input, now);
  const workspaceName = await resolveReportBrandName(userId, input.reportBrandName);
  const period = resolveReportPeriod(input.cadence, now);
  const template = input.template ?? DEFAULT_REPORT_TEMPLATE;
  const checksByMonitor = new Map(scoped.checkAggregates.map((item) => [item.monitorId, item]));
  const failuresByMonitor = new Map(scoped.failureAggregates.map((item) => [item.monitorId, item]));
  const slowMonitors = buildSlowMonitorSummary(scoped.monitorRows, checksByMonitor);
  const failingMonitors = buildFailingMonitorSummary(scoped.monitorRows, failuresByMonitor);
  const monitorBreakdown = buildMonitorBreakdown(scoped.monitorRows, checksByMonitor, failuresByMonitor);
  const { totalChecks, upChecks, downChecks, pendingChecks, averageLatencyMs, p95LatencyMs } = scoped.checkSummary;
  const uptimePct = totalChecks > 0 ? roundToTwoDecimals((upChecks / totalChecks) * 100) : 100;
  const failureRatePct = totalChecks > 0 ? roundToTwoDecimals((downChecks / totalChecks) * 100) : 0;
  const impactedMonitors = failingMonitors.length;
  const healthScore = buildHealthScore({
    uptimePct,
    failureRatePct,
    p95LatencyMs,
    currentlyDown: scoped.monitorRows.filter((monitor) => monitor.status === "down").length,
  });
  const recentFailures = buildRecentFailures(scoped.recentFailureEvents, scoped.monitorRows);
  const recommendations = buildRecommendations({
    summary: {
      currentlyDown: scoped.monitorRows.filter((monitor) => monitor.status === "down").length,
      failureEvents: scoped.failureSummary.total,
      impactedMonitors,
      p95LatencyMs,
      failureRatePct,
    },
    failingMonitors,
    slowMonitors,
  });

  return {
    title: buildReportTitle(input.cadence, input.scope, scoped.companyName),
    scope: input.scope,
    cadence: input.cadence,
    template,
    companyId: scoped.companyId,
    companyName: scoped.companyName,
    workspaceName,
    brandName: workspaceName,
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
      failureEvents: scoped.failureSummary.total,
      impactedMonitors,
      failureRatePct,
      healthScore,
      healthStatus: buildHealthStatus(healthScore),
    },
    recommendations,
    statusCodes: scoped.statusCodes,
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
  const attachments = await buildReportAttachments(report);
  const message = buildReportMessage(report, deliveryOptions);
  const delivery = await sendEmailDelivery({
    userId,
    kind: "report",
    destinationOverride: normalizedRecipients.join(", "),
    subject: message.subject,
    textBody: message.textBody,
    htmlBody: message.htmlBody,
    attachments,
  });
  assertReportEmailDelivered(delivery);

  return {
    report,
    delivery: serializeDeliveryResult(delivery),
  };
}

export async function runDueReportSchedules(now = new Date()) {
  const dueSchedules = await db
    .select()
    .from(reportSchedules)
    .where(
      and(
        eq(reportSchedules.isActive, true),
        lte(reportSchedules.nextRunAt, now),
        reportScheduleClaimAvailable(now)
      )
    )
    .orderBy(asc(reportSchedules.nextRunAt))
    .limit(DUE_REPORT_BATCH_SIZE);

  for (const schedule of dueSchedules) {
    const nextRunAt = scheduleNextRunAfter(schedule.nextRunAt, schedule.cadence as ReportCadence, now);
    const claimedSchedule = await claimDueReportSchedule(schedule, now);
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

      await completeClaimedReportSchedule(claimedSchedule.id, claimedSchedule.claimToken, {
          lastRunAt: now,
          lastDeliveredAt: now,
          lastStatus: "delivered",
          lastErrorMessage: null,
          nextRunAt,
      });
    } catch (error) {
      await completeClaimedReportSchedule(claimedSchedule.id, claimedSchedule.claimToken, {
          lastRunAt: now,
          lastStatus: "failed",
          lastErrorMessage: toMessage(error),
          nextRunAt,
      });
    }
  }
}

export async function sendReportScheduleNow(userId: string, scheduleId: string, now = new Date()) {
  const schedule = await getReportScheduleById(userId, scheduleId);
  if (!schedule) {
    return null;
  }

  const claimedSchedule = await claimReportScheduleForManualSend(userId, scheduleId, now);
  if (!claimedSchedule) {
    throw new AuthError("This report schedule is already being delivered.", 409);
  }

  let result: Awaited<ReturnType<typeof dispatchReportNow>>;
  try {
    result = await dispatchReportNow(
      userId,
      {
        scope: claimedSchedule.scope as ReportPreviewInput["scope"],
        cadence: claimedSchedule.cadence as ReportCadence,
        template: claimedSchedule.template as ReportTemplateVariant,
        companyId: claimedSchedule.companyId,
        ...scheduleToDeliveryInput(claimedSchedule),
      },
      claimedSchedule.recipientEmails
    );
  } catch (error) {
    const updatedSchedule = await completeManualReportSchedule(userId, claimedSchedule, {
      lastRunAt: now,
      lastStatus: "failed",
      lastErrorMessage: toMessage(error),
    });

    return {
      report: null,
      delivery: null,
      schedule: serializeCompletedManualSchedule(updatedSchedule, schedule.companyName),
      message: toMessage(error),
    };
  }

  const updatedSchedule = await completeManualReportSchedule(userId, claimedSchedule, {
    lastRunAt: now,
    lastDeliveredAt: now,
    lastStatus: "delivered",
    lastErrorMessage: null,
  });

  return {
    ...result,
    schedule: serializeCompletedManualSchedule(updatedSchedule, schedule.companyName),
  };
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
        ? and(
            eq(monitors.userId, userId),
            eq(monitors.companyId, company.id),
            eq(monitors.isActive, true),
            isNull(monitors.deletedAt)
          )
        : and(eq(monitors.userId, userId), eq(monitors.isActive, true), isNull(monitors.deletedAt))
    )
    .orderBy(asc(monitors.name));

  const normalizedMonitorRows = monitorRows.map((monitor) => ({
    ...monitor,
    status: normalizeReportStatus(monitor.status),
  }));
  const monitorIds = normalizedMonitorRows.map((monitor) => monitor.id);

  const reportMetrics = monitorIds.length === 0
    ? emptyReportMetrics()
    : await loadReportMetrics(userId, monitorIds, period);

  return {
    companyId: company?.id ?? null,
    companyName: company?.name ?? null,
    monitorRows: normalizedMonitorRows,
    ...reportMetrics,
  };
}

async function loadReportMetrics(
  userId: string,
  monitorIds: string[],
  period: { startedAt: Date; endedAt: Date }
) {
  const checkWhere = and(
    eq(monitorChecks.userId, userId),
    inArray(monitorChecks.monitorId, monitorIds),
    gte(monitorChecks.createdAt, period.startedAt),
    lte(monitorChecks.createdAt, period.endedAt)
  );
  const failureWhere = and(
    eq(monitorEvents.userId, userId),
    inArray(monitorEvents.monitorId, monitorIds),
    eq(monitorEvents.eventType, "failure"),
    gte(monitorEvents.createdAt, period.startedAt),
    lte(monitorEvents.createdAt, period.endedAt)
  );
  const statusCodeCount = sql<number>`count(*)::integer`;

  const [checkAggregateRows, checkSummaryRows, failureAggregateRows, recentFailureEvents, statusCodeRows] =
    await Promise.all([
      db
        .select({
          monitorId: monitorChecks.monitorId,
          totalChecks: sql<number>`count(*) filter (where ${monitorChecks.status} in ('up', 'down'))::integer`,
          upChecks: sql<number>`count(*) filter (where ${monitorChecks.status} = 'up')::integer`,
          downChecks: sql<number>`count(*) filter (where ${monitorChecks.status} = 'down')::integer`,
          pendingChecks: sql<number>`count(*) filter (where ${monitorChecks.status} not in ('up', 'down'))::integer`,
          latencySamples: sql<number>`count(${monitorChecks.latencyMs}) filter (where ${monitorChecks.status} in ('up', 'down'))::integer`,
          averageLatencyMs: sql<number>`coalesce(round(avg(${monitorChecks.latencyMs}) filter (where ${monitorChecks.status} in ('up', 'down'))), 0)::integer`,
          p95LatencyMs: sql<number>`coalesce(round(percentile_cont(0.95) within group (order by ${monitorChecks.latencyMs}) filter (where ${monitorChecks.status} in ('up', 'down'))), 0)::integer`,
        })
        .from(monitorChecks)
        .where(checkWhere)
        .groupBy(monitorChecks.monitorId),
      db
        .select({
          totalChecks: sql<number>`count(*) filter (where ${monitorChecks.status} in ('up', 'down'))::integer`,
          upChecks: sql<number>`count(*) filter (where ${monitorChecks.status} = 'up')::integer`,
          downChecks: sql<number>`count(*) filter (where ${monitorChecks.status} = 'down')::integer`,
          pendingChecks: sql<number>`count(*) filter (where ${monitorChecks.status} not in ('up', 'down'))::integer`,
          averageLatencyMs: sql<number>`coalesce(round(avg(${monitorChecks.latencyMs}) filter (where ${monitorChecks.status} in ('up', 'down'))), 0)::integer`,
          p95LatencyMs: sql<number>`coalesce(round(percentile_cont(0.95) within group (order by ${monitorChecks.latencyMs}) filter (where ${monitorChecks.status} in ('up', 'down'))), 0)::integer`,
        })
        .from(monitorChecks)
        .where(checkWhere),
      db
        .select({
          monitorId: monitorEvents.monitorId,
          failures: sql<number>`count(*)::integer`,
          lastFailureAt: sql<Date | null>`max(${monitorEvents.createdAt})`,
        })
        .from(monitorEvents)
        .where(failureWhere)
        .groupBy(monitorEvents.monitorId),
      db
        .select({
          monitorId: monitorEvents.monitorId,
          statusCode: monitorEvents.statusCode,
          message: monitorEvents.message,
          rcaSummary: monitorEvents.rcaSummary,
          createdAt: monitorEvents.createdAt,
        })
        .from(monitorEvents)
        .where(failureWhere)
        .orderBy(desc(monitorEvents.createdAt))
        .limit(RECENT_FAILURE_LIMIT),
      db
        .select({ statusCode: monitorChecks.statusCode, count: statusCodeCount })
        .from(monitorChecks)
        .where(and(checkWhere, sql`${monitorChecks.statusCode} is not null`))
        .groupBy(monitorChecks.statusCode)
        .orderBy(desc(statusCodeCount))
        .limit(6),
    ]);

  const checkAggregates = checkAggregateRows.map(toCheckAggregate);
  const failureAggregates = failureAggregateRows.map(toFailureAggregate);
  const summary = checkSummaryRows[0];

  return {
    checkAggregates,
    checkSummary: summary ? toCheckSummary(summary) : emptyCheckSummary(),
    failureAggregates,
    failureSummary: { total: failureAggregates.reduce((total, item) => total + item.failures, 0) },
    recentFailureEvents,
    statusCodes: statusCodeRows.flatMap((row) =>
      typeof row.statusCode === "number" ? [{ statusCode: row.statusCode, count: Number(row.count) }] : []
    ),
  };
}

function toCheckAggregate(row: Record<keyof ReportCheckAggregate, unknown>): ReportCheckAggregate {
  return {
    monitorId: String(row.monitorId),
    totalChecks: Number(row.totalChecks),
    upChecks: Number(row.upChecks),
    downChecks: Number(row.downChecks),
    pendingChecks: Number(row.pendingChecks),
    latencySamples: Number(row.latencySamples),
    averageLatencyMs: Number(row.averageLatencyMs),
    p95LatencyMs: Number(row.p95LatencyMs),
  };
}

function toCheckSummary(row: Omit<Record<keyof ReportCheckAggregate, unknown>, "monitorId" | "latencySamples">) {
  return {
    totalChecks: Number(row.totalChecks),
    upChecks: Number(row.upChecks),
    downChecks: Number(row.downChecks),
    pendingChecks: Number(row.pendingChecks),
    averageLatencyMs: Number(row.averageLatencyMs),
    p95LatencyMs: Number(row.p95LatencyMs),
  };
}

function toFailureAggregate(row: Record<keyof ReportFailureAggregate, unknown>): ReportFailureAggregate {
  return {
    monitorId: String(row.monitorId),
    failures: Number(row.failures),
    lastFailureAt: row.lastFailureAt instanceof Date ? row.lastFailureAt : null,
  };
}

function emptyCheckSummary() {
  return { totalChecks: 0, upChecks: 0, downChecks: 0, pendingChecks: 0, averageLatencyMs: 0, p95LatencyMs: 0 };
}

function emptyReportMetrics() {
  return {
    checkAggregates: [] as ReportCheckAggregate[],
    checkSummary: emptyCheckSummary(),
    failureAggregates: [] as ReportFailureAggregate[],
    failureSummary: { total: 0 },
    recentFailureEvents: [],
    statusCodes: [],
  };
}

function resolveReportPeriod(cadence: ReportCadence, now: Date) {
  const startedAt = new Date(now);

  if (cadence === "weekly") {
    startedAt.setDate(startedAt.getDate() - 7);
    return { startedAt, endedAt: now, label: "Last 7 days" };
  }

  if (cadence === "all_time") {
    return { startedAt: new Date("1970-01-01T00:00:00.000Z"), endedAt: now, label: "All time" };
  }

  startedAt.setDate(startedAt.getDate() - 30);
  return { startedAt, endedAt: now, label: "Last 30 days" };
}

function buildReportTitle(cadence: ReportCadence, scope: ReportPreviewInput["scope"], companyName: string | null) {
  const cadenceLabel = resolveCadenceLabel(cadence);
  return scope === "company" ? `${cadenceLabel} ${companyName ?? "Company"} Report` : `${cadenceLabel} Workspace Report`;
}

function resolveCadenceLabel(cadence: ReportCadence) {
  if (cadence === "weekly") {
    return "Weekly";
  }

  if (cadence === "monthly") {
    return "Monthly";
  }

  return "All-time";
}

function buildSlowMonitorSummary(
  monitorRows: Array<{
    id: string;
    name: string;
    url: string;
  }>,
  checksByMonitor: Map<string, ReportCheckAggregate>
) {
  return monitorRows
    .map((monitor) => {
      const aggregate = checksByMonitor.get(monitor.id);

      return {
        monitorId: monitor.id,
        name: monitor.name,
        url: sanitizeMonitorUrlForDisplay(monitor.url),
        averageLatencyMs: aggregate?.averageLatencyMs ?? 0,
        checks: aggregate?.latencySamples ?? 0,
      };
    })
    .filter((item) => item.checks > 0)
    .sort((left, right) => right.averageLatencyMs - left.averageLatencyMs);
}

function buildFailingMonitorSummary(
  monitorRows: Array<{
    id: string;
    name: string;
    url: string;
  }>,
  failuresByMonitor: Map<string, ReportFailureAggregate>
) {
  return monitorRows
    .map((monitor) => {
      const aggregate = failuresByMonitor.get(monitor.id);

      return {
        monitorId: monitor.id,
        name: monitor.name,
        url: sanitizeMonitorUrlForDisplay(monitor.url),
        failures: aggregate?.failures ?? 0,
        lastFailureAt: aggregate?.lastFailureAt?.toISOString() ?? null,
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
  checksByMonitor: Map<string, ReportCheckAggregate>,
  failuresByMonitor: Map<string, ReportFailureAggregate>
) {
  return monitorRows
    .map((monitor) => {
      const checks = checksByMonitor.get(monitor.id);
      const failures = failuresByMonitor.get(monitor.id);
      const totalChecks = checks?.totalChecks ?? 0;
      const upChecks = checks?.upChecks ?? 0;

      return {
        monitorId: monitor.id,
        name: monitor.name,
        url: sanitizeMonitorUrlForDisplay(monitor.url),
        companyName: monitor.companyName ?? monitor.company,
        status: monitor.status,
        currentStatusCode: monitor.statusCode,
        lastCheckedAt: monitor.lastCheckedAt?.toISOString() ?? null,
        lastFailureAt: monitor.lastFailureAt?.toISOString() ?? null,
        lastErrorMessage: monitor.lastErrorMessage
          ? formatFailureDetail({
              message: monitor.lastErrorMessage,
              rcaSummary: null,
              statusCode: monitor.statusCode,
            })
          : null,
        uptimePct: totalChecks > 0 ? roundToTwoDecimals((upChecks / totalChecks) * 100) : 100,
        averageLatencyMs: checks?.averageLatencyMs ?? 0,
        p95LatencyMs: checks?.p95LatencyMs ?? 0,
        totalChecks,
        upChecks,
        downChecks: checks?.downChecks ?? 0,
        pendingChecks: checks?.pendingChecks ?? 0,
        failures: failures?.failures ?? 0,
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
    url: string;
  }>
) {
  const monitorLookup = new Map(monitorRows.map((monitor) => [monitor.id, monitor]));

  return failureEvents.slice(0, RECENT_FAILURE_LIMIT).map((event) => ({
    monitorId: event.monitorId,
    name: monitorLookup.get(event.monitorId)?.name ?? "Unknown monitor",
    url: sanitizeMonitorUrlForDisplay(monitorLookup.get(event.monitorId)?.url ?? "Unknown URL"),
    statusCode: event.statusCode,
    message: event.message,
    rcaSummary: event.rcaSummary,
    detail: formatFailureDetail({
      message: event.message,
      rcaSummary: event.rcaSummary,
      statusCode: event.statusCode,
    }),
    createdAt: event.createdAt.toISOString(),
  }));
}

function buildRecommendations({
  summary,
  failingMonitors,
  slowMonitors,
}: {
  summary: {
    currentlyDown: number;
    failureEvents: number;
    impactedMonitors: number;
    p95LatencyMs: number;
    failureRatePct: number;
  };
  failingMonitors: Array<{ url: string; failures: number }>;
  slowMonitors: Array<{ url: string; averageLatencyMs: number }>;
}) {
  const recommendations: string[] = [];

  if (summary.currentlyDown > 0) {
    recommendations.push(`${formatUrlCount(summary.currentlyDown)} currently ${summary.currentlyDown === 1 ? "is" : "are"} down. Prioritize active outages and restore service health.`);
  }

  if (summary.impactedMonitors > 0) {
    recommendations.push(`${formatUrlCount(summary.impactedMonitors)} had at least one failure in this period. Review the failing URL list for repeated patterns.`);
  }

  if (summary.p95LatencyMs >= 1_500) {
    recommendations.push(`P95 latency is ${summary.p95LatencyMs}ms. Investigate slow endpoints and external dependencies before they become outages.`);
  }

  if (summary.failureRatePct >= 5) {
    recommendations.push(`Failure rate is ${summary.failureRatePct.toFixed(2)}%. Consider tightening alert routing for the most affected services.`);
  }

  const topFailing = failingMonitors[0];
  if (topFailing && topFailing.failures >= 3) {
    recommendations.push(`${topFailing.url} is the most repeated failure source with ${topFailing.failures} events.`);
  }

  const topSlow = slowMonitors[0];
  if (topSlow && topSlow.averageLatencyMs >= 1_000) {
    recommendations.push(`${topSlow.url} has the highest average latency at ${topSlow.averageLatencyMs}ms.`);
  }

  if (recommendations.length === 0) {
    recommendations.push("No immediate operational action is required based on this report window.");
  }

  return recommendations.slice(0, 5);
}

function formatUrlCount(count: number) {
  return `${count} ${count === 1 ? "URL" : "URLs"}`;
}

function formatFailureDetail({
  message,
  rcaSummary,
  statusCode,
}: {
  message: string | null;
  rcaSummary: string | null;
  statusCode: number | null;
}) {
  const rawDetail = rcaSummary?.trim() || message?.trim();
  if (!rawDetail) {
    return statusCode
      ? `The URL returned HTTP ${statusCode}, but no additional error detail was recorded.`
      : "The URL failed, but no additional error detail was recorded.";
  }

  const timedOut = rawDetail.match(/connect\s+ETIMEDOUT\s+([^\s]+)/i);
  if (timedOut) {
    return `The service did not accept a TCP connection before the timeout. Target: ${timedOut[1]}. Original error: ${rawDetail}`;
  }

  const refused = rawDetail.match(/connect\s+ECONNREFUSED\s+([^\s]+)/i);
  if (refused) {
    return `The host was reachable, but the target port refused the connection. Target: ${refused[1]}. Original error: ${rawDetail}`;
  }

  if (/\b(ENOTFOUND|EAI_AGAIN)\b/i.test(rawDetail)) {
    return `DNS resolution failed for the target URL. Verify the domain name and DNS provider health. Original error: ${rawDetail}`;
  }

  if (/certificate|self[-\s]?signed|CERT_|TLS|SSL/i.test(rawDetail)) {
    return `TLS or certificate validation failed while connecting to the service. Review the certificate chain, expiry, and hostname. Original error: ${rawDetail}`;
  }

  if (statusCode && statusCode >= 500) {
    return `The service returned HTTP ${statusCode}, which usually points to an upstream application or server-side failure. Detail: ${rawDetail}`;
  }

  if (statusCode && statusCode >= 400) {
    return `The service returned HTTP ${statusCode}. Check whether the monitored endpoint now requires auth, changed route, or rejects the request. Detail: ${rawDetail}`;
  }

  return rawDetail;
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
      ? `[${report.workspaceName} Executive Report]`
      : report.template === "client"
        ? `[${report.workspaceName} Client Report]`
        : `[${report.workspaceName} Operations Report]`;
  const introLine =
    report.template === "executive"
      ? "Here is the service health summary for this period, focused on uptime and active risk."
      : report.template === "client"
        ? "Here is the customer-facing reliability summary for this period."
        : "Here is the reliability summary for this period, with the URLs that need attention first.";
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
    `URLs tracked: ${report.summary.monitorCount}`,
    `Currently up: ${report.summary.currentlyUp}`,
    `Currently down: ${report.summary.currentlyDown}`,
    `Currently pending: ${report.summary.currentlyPending}`,
    `Uptime: ${report.summary.uptimePct.toFixed(2)}%`,
    `Average latency: ${report.summary.averageLatencyMs}ms`,
    `P95 latency: ${report.summary.p95LatencyMs}ms`,
    `Failure events: ${report.summary.failureEvents}`,
    `Failure rate: ${report.summary.failureRatePct.toFixed(2)}%`,
    `Impacted URLs: ${report.summary.impactedMonitors}`,
    "",
    "What needs attention:",
    ...report.recommendations.map((item) => `- ${item}`),
    "",
    ...buildReportTextDetailLines(report, options),
    "",
    "Attachments:",
    ...buildAttachmentTextLines(),
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
    <div style="margin:0;padding:0;background:#f8fafc;color:#0f172a;font-family:Arial,Helvetica,sans-serif;-webkit-locale:'en';">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f8fafc;">
        <tr>
          <td align="center" style="padding:24px 12px;">
            <table role="presentation" width="720" cellpadding="0" cellspacing="0" style="width:720px;max-width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden;">
              <tr>
                <td style="padding:24px;background:#0f172a;color:#ffffff;">
                  <div style="font-size:13px;font-weight:700;color:#93c5fd;-webkit-locale:'en';font-feature-settings:'locl' 0;">${escapeHtml(report.templateLabel)}</div>
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
                      ${renderEmailMetric("Uptime", `${report.summary.uptimePct.toFixed(2)}%`, "Availability for this period")}
                      ${renderEmailMetric("P95 latency", `${report.summary.p95LatencyMs}ms`, `${report.summary.averageLatencyMs}ms average`)}
                    </tr>
                    <tr>
                      ${renderEmailMetric("Down now", String(report.summary.currentlyDown), `${report.summary.currentlyUp} up, ${report.summary.currentlyPending} pending`)}
                      ${renderEmailMetric("Failures", String(report.summary.failureEvents), `${report.summary.impactedMonitors} impacted URLs`)}
                      ${renderEmailMetric("Failure rate", `${report.summary.failureRatePct.toFixed(2)}%`, "Share of unavailable results")}
                    </tr>
                  </table>
                </td>
              </tr>
              ${renderEmailSnapshotSection(report, scopeLabel, generatedAt)}
              ${renderReportEmailDetailSections(report, options)}
              <tr>
                <td style="padding:18px 24px 24px;">
                  <div style="border:1px solid #bfdbfe;background:#eff6ff;border-radius:14px;padding:14px 16px;color:#1e3a8a;font-size:13px;line-height:1.6;">
                    ${escapeHtml(buildAttachmentSummary())} Generated at ${escapeHtml(generatedAt)}.
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
    "Latency watchlist:",
    ...report.slowMonitors
      .slice(0, options.deliveryDetailLevel === "full" ? 8 : 5)
      .map((monitor) => `- ${monitor.url}: ${monitor.averageLatencyMs}ms average latency`),
    "",
    "Top failing URLs:",
    ...report.failingMonitors
      .slice(0, options.deliveryDetailLevel === "full" ? 8 : 5)
      .map((monitor) => `- ${monitor.url}: ${monitor.failures} failures`),
  ];

  if (options.includeOutageSummary) {
    lines.push(
      "",
      "Failure details:",
      ...report.recentFailures
        .slice(0, options.deliveryDetailLevel === "full" ? 8 : 5)
        .map((event) => `- ${event.url}: ${event.statusCode ?? "N/A"} at ${new Date(event.createdAt).toLocaleString()} - ${event.detail}`)
    );
  }

  return lines;
}

function renderReportEmailDetailSections(report: GeneratedReport, options: ReportDeliveryOptions) {
  if (options.deliveryDetailLevel === "summary") {
    return renderEmailListSection("What needs attention", report.recommendations);
  }

  const detailLimit = options.deliveryDetailLevel === "full" ? 8 : 5;
  const sections = [
    renderEmailListSection("What needs attention", report.recommendations),
    renderEmailTableSection(
      "Top failing URLs",
      ["URL", "Failures", "Last failure"],
      report.failingMonitors.slice(0, detailLimit).map((monitor) => [
        monitor.url,
        String(monitor.failures),
        monitor.lastFailureAt ? new Date(monitor.lastFailureAt).toLocaleString() : "--",
      ])
    ),
    renderEmailTableSection(
      "Latency watchlist",
      ["URL", "Average"],
      report.slowMonitors.slice(0, detailLimit).map((monitor) => [
        monitor.url,
        `${monitor.averageLatencyMs}ms`,
      ])
    ),
  ];

  if (options.includeOutageSummary) {
    sections.push(
      renderEmailTableSection(
        "Failure details",
        ["URL", "Code", "Detail"],
        report.recentFailures.slice(0, detailLimit).map((event) => [
          event.url,
          event.statusCode ? String(event.statusCode) : "--",
          event.detail,
        ])
      )
    );
  }

  if (options.includeMonitorBreakdown && options.deliveryDetailLevel === "full") {
    sections.push(
      renderEmailTableSection(
        "URL breakdown",
        ["URL", "Uptime", "P95"],
        report.monitorBreakdown.slice(0, detailLimit).map((monitor) => [
          monitor.url,
          `${monitor.uptimePct.toFixed(2)}%`,
          `${monitor.p95LatencyMs}ms`,
        ])
      )
    );
  }

  return sections.join("");
}

type ReportAttachmentRequest = {
  label: string;
  build: () => Mail.Attachment | Promise<Mail.Attachment>;
};

async function buildReportAttachments(report: GeneratedReport): Promise<Mail.Attachment[]> {
  const requests = getReportAttachmentRequests(report);
  const attachments: Mail.Attachment[] = [];

  for (const request of requests) {
    const attachment = await buildReportAttachmentSafely(request);
    if (attachment) {
      attachments.push(attachment);
    }
  }

  return attachments;
}

function getReportAttachmentRequests(report: GeneratedReport): ReportAttachmentRequest[] {
  const fileSlug = buildReportFileSlug(report);
  const requests: ReportAttachmentRequest[] = [];

  requests.push({
    label: "HTML",
    build: () => ({
      filename: `${fileSlug}.html`,
      content: buildPrintableReportHtml(report),
      contentType: "text/html; charset=utf-8",
    }),
  });

  return requests;
}

async function buildReportAttachmentSafely(request: ReportAttachmentRequest) {
  try {
    return await request.build();
  } catch (error) {
    console.warn(`[sentrovia] ${request.label} report attachment skipped: ${toMessage(error)}`);
    return null;
  }
}

function renderEmailMetric(label: string, value: string, detail: string) {
  return `
    <td width="33.33%" style="padding:0 6px 12px;vertical-align:top;">
      <div style="border:1px solid #e2e8f0;border-radius:14px;padding:14px;background:#ffffff;">
        <div style="font-size:12px;font-weight:700;color:#64748b;-webkit-locale:'en';font-feature-settings:'locl' 0;">${escapeHtml(label)}</div>
        <div style="margin-top:6px;font-size:22px;line-height:1.2;font-weight:700;color:#0f172a;">${escapeHtml(value)}</div>
        <div style="margin-top:4px;font-size:12px;line-height:1.5;color:#64748b;">${escapeHtml(detail)}</div>
      </div>
    </td>
  `;
}

function renderEmailSnapshotSection(report: GeneratedReport, scopeLabel: string, generatedAt: string) {
  const topFailingUrl = report.failingMonitors[0]?.url ?? "No failing URL in this period";
  const slowestUrl = report.slowMonitors[0]
    ? `${report.slowMonitors[0].url} (${report.slowMonitors[0].averageLatencyMs}ms avg)`
    : "No latency data in this period";
  const rows = [
    ["Reporting window", report.periodLabel],
    ["Generated", generatedAt],
    ["Scope", scopeLabel],
    [
      "Current state",
      `${report.summary.currentlyUp} up, ${report.summary.currentlyDown} down, ${report.summary.currentlyPending} pending`,
    ],
    ["Most affected URL", topFailingUrl],
    ["Slowest URL", slowestUrl],
  ];

  return renderEmailTableSection("Service snapshot", ["Item", "Detail"], rows);
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
  const safeRows = rows.length > 0 ? rows : [headers.map((_, index) => (index === 0 ? "No data" : "--"))];

  return `
    <tr>
      <td style="padding:12px 24px;">
        <h2 style="margin:0 0 10px;font-size:16px;color:#0f172a;">${escapeHtml(title)}</h2>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
          <thead>
            <tr>
              ${headers.map((header) => `<th align="left" style="padding:10px 12px;background:#f1f5f9;color:#475569;font-size:12px;font-weight:700;-webkit-locale:'en';font-feature-settings:'locl' 0;">${escapeHtml(header)}</th>`).join("")}
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
    includeOutageSummary: row.includeOutageSummary,
    includeMonitorBreakdown: row.includeMonitorBreakdown,
    emailSubjectTemplate: row.emailSubjectTemplate,
    emailIntroTemplate: row.emailIntroTemplate,
    reportBrandName: row.reportBrandName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function scheduleToDeliveryInput(schedule: typeof reportSchedules.$inferSelect | ReportScheduleRecord) {
  return {
    deliveryDetailLevel: resolveDeliveryDetailLevel(schedule.deliveryDetailLevel),
    includeOutageSummary: schedule.includeOutageSummary,
    includeMonitorBreakdown: schedule.includeMonitorBreakdown,
    emailSubjectTemplate: schedule.emailSubjectTemplate,
    emailIntroTemplate: schedule.emailIntroTemplate,
    reportBrandName: schedule.reportBrandName,
  };
}

function normalizeReportDeliveryOptions(input: Partial<ReportPreviewInput> | Record<string, unknown>): ReportDeliveryOptions {
  return {
    deliveryDetailLevel: resolveDeliveryDetailLevel(input.deliveryDetailLevel),
    includeOutageSummary:
      booleanOption(input.includeOutageSummary, DEFAULT_REPORT_DELIVERY_OPTIONS.includeOutageSummary),
    includeMonitorBreakdown:
      booleanOption(input.includeMonitorBreakdown, DEFAULT_REPORT_DELIVERY_OPTIONS.includeMonitorBreakdown),
    emailSubjectTemplate: emptyTemplateToNull(input.emailSubjectTemplate),
    emailIntroTemplate: emptyTemplateToNull(input.emailIntroTemplate),
  };
}

function resolveDeliveryDetailLevel(value: unknown): ReportDeliveryOptions["deliveryDetailLevel"] {
  return value === "summary" || value === "full" ? value : "standard";
}

export function normalizeReportStatus(status: string) {
  if (status === "up" || status === "down" || status === "pending") {
    return status;
  }

  return "pending";
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

function roundToTwoDecimals(value: number) {
  return Math.round(value * 100) / 100;
}

export function scheduleNextRunAfter(currentRunAt: Date, cadence: ReportCadence, after: Date) {
  const nextRunAt = new Date(currentRunAt);

  while (nextRunAt <= after) {
    if (cadence === "weekly") {
      nextRunAt.setDate(nextRunAt.getDate() + 7);
    } else {
      advanceOneMonthClamped(nextRunAt);
    }
  }

  return nextRunAt;
}

async function claimDueReportSchedule(
  schedule: typeof reportSchedules.$inferSelect,
  now: Date
) {
  const claimToken = crypto.randomUUID();
  const [claimed] = await db
    .update(reportSchedules)
    .set({
      lastRunAt: now,
      lastStatus: "running",
      claimToken,
      claimExpiresAt: new Date(now.getTime() + REPORT_CLAIM_LEASE_MS),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(reportSchedules.id, schedule.id),
        eq(reportSchedules.isActive, true),
        eq(reportSchedules.nextRunAt, schedule.nextRunAt),
        reportScheduleClaimAvailable(now)
      )
    )
    .returning();

  return claimed ?? null;
}

async function claimReportScheduleForManualSend(userId: string, scheduleId: string, now: Date) {
  const claimToken = crypto.randomUUID();
  const [claimed] = await db
    .update(reportSchedules)
    .set({
      lastRunAt: now,
      lastStatus: "running",
      lastErrorMessage: null,
      claimToken,
      claimExpiresAt: new Date(now.getTime() + REPORT_CLAIM_LEASE_MS),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(reportSchedules.id, scheduleId),
        eq(reportSchedules.userId, userId),
        reportScheduleClaimAvailable(now)
      )
    )
    .returning();

  return claimed ?? null;
}

function reportScheduleClaimAvailable(now: Date) {
  return or(
    ne(reportSchedules.lastStatus, "running"),
    isNull(reportSchedules.claimExpiresAt),
    lte(reportSchedules.claimExpiresAt, now)
  );
}

async function completeClaimedReportSchedule(
  scheduleId: string,
  claimToken: string | null,
  values: {
    lastRunAt: Date;
    lastDeliveredAt?: Date | null;
    lastStatus: ReportScheduleStatus;
    lastErrorMessage: string | null;
    nextRunAt: Date;
  }
) {
  if (!claimToken) {
    return null;
  }

  const [updated] = await db
    .update(reportSchedules)
    .set({
      ...values,
      claimToken: null,
      claimExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(reportSchedules.id, scheduleId), eq(reportSchedules.claimToken, claimToken)))
    .returning();

  return updated ?? null;
}

function advanceOneMonthClamped(value: Date) {
  const dayOfMonth = value.getDate();
  value.setDate(1);
  value.setMonth(value.getMonth() + 1);
  const lastDayOfTargetMonth = new Date(
    value.getFullYear(),
    value.getMonth() + 1,
    0
  ).getDate();
  value.setDate(Math.min(dayOfMonth, lastDayOfTargetMonth));
}

async function completeManualReportSchedule(
  userId: string,
  claimedSchedule: typeof reportSchedules.$inferSelect,
  values: {
    lastRunAt: Date;
    lastDeliveredAt?: Date | null;
    lastStatus: ReportScheduleStatus;
    lastErrorMessage: string | null;
  }
) {
  const [updated] = await db
    .update(reportSchedules)
    .set({
      ...values,
      claimToken: null,
      claimExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(reportSchedules.id, claimedSchedule.id),
        eq(reportSchedules.userId, userId),
        eq(reportSchedules.claimToken, claimedSchedule.claimToken ?? "")
      )
    )
    .returning();

  return updated ?? null;
}

function serializeCompletedManualSchedule(
  schedule: typeof reportSchedules.$inferSelect | null,
  companyName: string | null
) {
  if (!schedule) {
    throw new Error("The report delivery finished, but its schedule state could not be finalized.");
  }

  return serializeSchedule(schedule, companyName);
}

async function resolveReportBrandName(userId: string, override: string | null | undefined) {
  const brandName = emptyTemplateToNull(override);
  if (brandName) {
    return brandName;
  }

  const settings = await getSettings(userId);
  return settings?.profile.organization || "Sentrovia";
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

function assertReportEmailDelivered(
  delivery: { status: string; errorMessage?: string | null } | null
): asserts delivery is { status: string; deliveredAt?: Date | string | null } {
  if (delivery?.status === "delivered") {
    return;
  }

  throw new Error(delivery?.errorMessage || "Report email delivery failed.");
}

function renderReportTemplate(template: string | null, report: GeneratedReport) {
  if (!template) {
    return "";
  }

  const replacements: Record<string, string> = {
    "{title}": report.title,
    "{workspace}": report.workspaceName,
    "{brand}": report.workspaceName,
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

function buildAttachmentTextLines() {
  return ["- HTML report attachment for browser viewing"];
}

function buildAttachmentSummary() {
  return "The HTML report attachment is included for browser viewing and sharing.";
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
