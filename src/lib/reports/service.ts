import crypto from "node:crypto";
import { and, asc, desc, eq, exists, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { AuthError } from "@/lib/auth/errors";
import { getCompanyById } from "@/lib/companies/service";
import { db } from "@/lib/db";
import { companies, monitorChecks, monitorEvents, monitors, reportSchedules } from "@/lib/db/schema";
import { sendEmailDelivery } from "@/lib/delivery/service";
import { sanitizeMonitorUrlForDisplay } from "@/lib/monitors/targets";
import {
  buildReportAttachments,
  buildReportMessage,
  type ReportDeliveryOptions,
} from "@/lib/reports/message";
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
const REPORT_DAY_MS = 24 * 60 * 60 * 1000;
const REPORT_WINDOW_DAYS = 7;
type ReportCheckAggregate = {
  monitorId: string;
  totalChecks: number;
  upChecks: number;
  downChecks: number;
  pendingChecks: number;
  latencySamples: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  lastFailureAt: Date | null;
};
type ReportCheckSummary = Omit<ReportCheckAggregate, "monitorId" | "lastFailureAt">;

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
          .where(and(
            eq(companies.userId, userId),
            inArray(companies.id, companyIds),
            isNull(companies.deletedAt)
          ));
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
  const cadence = input.cadence ?? normalizeReportScheduleCadence(existing.cadence);
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

  const companyName = await resolveCompanyName(userId, existing.companyId);
  assertReportScheduleCompanyAvailable(existing.scope, companyName);

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

  return serializeSchedule(created, companyName);
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
  const period = resolveReportPeriod(now);
  const template = input.template ?? DEFAULT_REPORT_TEMPLATE;
  const checksByMonitor = new Map(scoped.checkAggregates.map((item) => [item.monitorId, item]));
  const slowMonitors = buildSlowMonitorSummary(scoped.monitorRows, checksByMonitor);
  const failingMonitors = buildFailingMonitorSummary(scoped.monitorRows, checksByMonitor);
  const monitorBreakdown = buildMonitorBreakdown(scoped.monitorRows, checksByMonitor);
  const { totalChecks, upChecks, downChecks, pendingChecks, latencySamples, averageLatencyMs, p95LatencyMs } = scoped.checkSummary;
  const reportMetrics = calculateReportSummaryMetrics({
    totalChecks,
    upChecks,
    downChecks,
    latencySamples,
    averageLatencyMs,
    p95LatencyMs,
    currentlyDown: scoped.monitorRows.filter((monitor) => monitor.status === "down").length,
  });
  const impactedMonitors = failingMonitors.length;
  const currentlyDown = scoped.monitorRows.filter((monitor) => monitor.status === "down").length;
  const recentFailures = buildRecentFailures(scoped.recentFailureEvents, scoped.monitorRows);
  const recommendations = buildRecommendations({
    summary: {
      currentlyDown,
      failureEvents: downChecks,
      impactedMonitors,
      p95LatencyMs: reportMetrics.p95LatencyMs,
      failureRatePct: reportMetrics.failureRatePct,
    },
    failingMonitors,
    slowMonitors,
  });

  return {
    title: resolveReportTitle(input.cadence, input.scope, scoped.companyName),
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
      hasCompletedChecks: reportMetrics.hasCompletedChecks,
      hasLatencySamples: reportMetrics.hasLatencySamples,
      uptimePct: reportMetrics.uptimePct,
      averageLatencyMs,
      p95LatencyMs,
      failureEvents: downChecks,
      impactedMonitors,
      failureRatePct: reportMetrics.failureRatePct,
      healthScore: reportMetrics.healthScore,
      healthStatus: reportMetrics.healthStatus,
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
        reportScheduleCompanyAvailable(),
        reportScheduleClaimAvailable(now)
      )
    )
    .orderBy(asc(reportSchedules.nextRunAt))
    .limit(DUE_REPORT_BATCH_SIZE);

  for (const schedule of dueSchedules) {
    const cadence = normalizeReportScheduleCadence(schedule.cadence);
    const nextRunAt = scheduleNextRunAfter(schedule.nextRunAt, cadence, now);
    const claimedSchedule = await claimDueReportSchedule(schedule, now);
    if (!claimedSchedule) {
      continue;
    }

    try {
      await dispatchReportNow(
        claimedSchedule.userId,
        {
          scope: claimedSchedule.scope as ReportPreviewInput["scope"],
          cadence,
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

  assertReportScheduleCompanyAvailable(schedule.scope, schedule.companyName);

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
        cadence: normalizeReportScheduleCadence(claimedSchedule.cadence),
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

export function assertReportScheduleCompanyAvailable(scope: string, companyName: string | null) {
  if (scope === "company" && !companyName) {
    throw new AuthError("The company assigned to this report schedule is unavailable.", 409);
  }
}

async function loadScopedReportData(userId: string, input: ReportPreviewInput, now: Date) {
  const period = resolveReportPeriod(now);
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

  const [checkAggregateRows, checkSummaryRows, recentFailureEvents, statusCodeRows] =
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
          lastFailureAt: sql<Date | null>`max(${monitorChecks.createdAt}) filter (where ${monitorChecks.status} = 'down')`,
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
          latencySamples: sql<number>`count(${monitorChecks.latencyMs}) filter (where ${monitorChecks.status} in ('up', 'down'))::integer`,
          averageLatencyMs: sql<number>`coalesce(round(avg(${monitorChecks.latencyMs}) filter (where ${monitorChecks.status} in ('up', 'down'))), 0)::integer`,
          p95LatencyMs: sql<number>`coalesce(round(percentile_cont(0.95) within group (order by ${monitorChecks.latencyMs}) filter (where ${monitorChecks.status} in ('up', 'down'))), 0)::integer`,
        })
        .from(monitorChecks)
        .where(checkWhere),
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
  const summary = checkSummaryRows[0];

  return {
    checkAggregates,
    checkSummary: summary ? toCheckSummary(summary) : emptyCheckSummary(),
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
    lastFailureAt: row.lastFailureAt instanceof Date ? row.lastFailureAt : null,
  };
}

function toCheckSummary(row: Record<keyof ReportCheckSummary, unknown>): ReportCheckSummary {
  return {
    totalChecks: Number(row.totalChecks),
    upChecks: Number(row.upChecks),
    downChecks: Number(row.downChecks),
    pendingChecks: Number(row.pendingChecks),
    latencySamples: Number(row.latencySamples),
    averageLatencyMs: Number(row.averageLatencyMs),
    p95LatencyMs: Number(row.p95LatencyMs),
  };
}

function emptyCheckSummary() {
  return { totalChecks: 0, upChecks: 0, downChecks: 0, pendingChecks: 0, latencySamples: 0, averageLatencyMs: 0, p95LatencyMs: 0 };
}

function emptyReportMetrics() {
  return {
    checkAggregates: [] as ReportCheckAggregate[],
    checkSummary: emptyCheckSummary(),
    recentFailureEvents: [],
    statusCodes: [],
  };
}

export function resolveReportPeriod(now: Date) {
  return {
    startedAt: new Date(now.getTime() - REPORT_WINDOW_DAYS * REPORT_DAY_MS),
    endedAt: now,
    label: "Last 7 days",
  };
}

export function resolveReportTitle(
  cadence: ReportCadence,
  scope: ReportPreviewInput["scope"],
  companyName: string | null
) {
  const cadenceLabel = cadence === "weekly" ? "Weekly" : "7-Day";
  return scope === "company" ? `${cadenceLabel} ${companyName ?? "Company"} Report` : `${cadenceLabel} Workspace Report`;
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
  checksByMonitor: Map<string, ReportCheckAggregate>
) {
  return monitorRows
    .map((monitor) => {
      const failure = resolveReportFailureStats(checksByMonitor.get(monitor.id));

      return {
        monitorId: monitor.id,
        name: monitor.name,
        url: sanitizeMonitorUrlForDisplay(monitor.url),
        ...failure,
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
    lastErrorMessage: string | null;
  }>,
  checksByMonitor: Map<string, ReportCheckAggregate>
) {
  return monitorRows
    .map((monitor) => {
      const checks = checksByMonitor.get(monitor.id);
      const failure = resolveReportFailureStats(checks);
      const totalChecks = checks?.totalChecks ?? 0;
      const upChecks = checks?.upChecks ?? 0;
      const hasCompletedChecks = totalChecks > 0;
      const hasLatencySamples = (checks?.latencySamples ?? 0) > 0;

      return {
        monitorId: monitor.id,
        name: monitor.name,
        url: sanitizeMonitorUrlForDisplay(monitor.url),
        companyName: monitor.companyName ?? monitor.company,
        status: monitor.status,
        currentStatusCode: monitor.statusCode,
        lastCheckedAt: monitor.lastCheckedAt?.toISOString() ?? null,
        lastFailureAt: failure.lastFailureAt,
        lastErrorMessage: monitor.lastErrorMessage
          ? formatFailureDetail({
              message: monitor.lastErrorMessage,
              rcaSummary: null,
              statusCode: monitor.statusCode,
            })
          : null,
        hasCompletedChecks,
        hasLatencySamples,
        uptimePct: hasCompletedChecks ? roundToTwoDecimals((upChecks / totalChecks) * 100) : 0,
        averageLatencyMs: checks?.averageLatencyMs ?? 0,
        p95LatencyMs: checks?.p95LatencyMs ?? 0,
        totalChecks,
        upChecks,
        downChecks: checks?.downChecks ?? 0,
        pendingChecks: checks?.pendingChecks ?? 0,
        failures: failure.failures,
      };
    })
    .sort((left, right) => {
      if (right.failures !== left.failures) {
        return right.failures - left.failures;
      }

      return right.averageLatencyMs - left.averageLatencyMs;
    });
}

export function resolveReportFailureStats(
  aggregate: Pick<ReportCheckAggregate, "downChecks" | "lastFailureAt"> | undefined
) {
  return {
    failures: aggregate?.downChecks ?? 0,
    lastFailureAt: aggregate?.lastFailureAt?.toISOString() ?? null,
  };
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

export function calculateReportSummaryMetrics({
  totalChecks,
  upChecks,
  downChecks,
  latencySamples,
  averageLatencyMs,
  p95LatencyMs,
  currentlyDown,
}: {
  totalChecks: number;
  upChecks: number;
  downChecks: number;
  latencySamples: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  currentlyDown: number;
}) {
  const hasCompletedChecks = totalChecks > 0;
  const hasLatencySamples = latencySamples > 0;
  const resolvedUptimePct = hasCompletedChecks ? roundToTwoDecimals((upChecks / totalChecks) * 100) : 0;
  const failureRatePct = hasCompletedChecks ? roundToTwoDecimals((downChecks / totalChecks) * 100) : 0;
  const healthScore = hasCompletedChecks
    ? buildHealthScore({ uptimePct: resolvedUptimePct, p95LatencyMs, currentlyDown })
    : 0;

  return {
    hasCompletedChecks,
    hasLatencySamples,
    uptimePct: resolvedUptimePct,
    averageLatencyMs,
    p95LatencyMs,
    failureRatePct,
    healthScore,
    healthStatus: buildHealthStatus(healthScore, hasCompletedChecks),
  };
}

function buildHealthScore({
  uptimePct,
  p95LatencyMs,
  currentlyDown,
}: {
  uptimePct: number;
  p95LatencyMs: number;
  currentlyDown: number;
}) {
  const latencyPenalty = Math.min(12, Math.floor(p95LatencyMs / 500));
  const downPenalty = currentlyDown * 8;

  return Math.max(0, Math.min(100, Math.round(uptimePct - latencyPenalty - downPenalty)));
}

function buildHealthStatus(score: number, hasCompletedChecks: boolean) {
  if (!hasCompletedChecks) {
    return "No data";
  }

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
    cadence: normalizeReportScheduleCadence(row.cadence),
    template: row.template as ReportTemplateVariant,
    companyId: row.companyId,
    companyName,
    recipientEmails: row.recipientEmails,
    isActive: row.isActive,
    nextRunAt: row.nextRunAt.toISOString(),
    lastRunAt: row.lastRunAt?.toISOString() ?? null,
    lastDeliveredAt: row.lastDeliveredAt?.toISOString() ?? null,
    lastStatus: normalizeReportScheduleStatus(row.lastStatus),
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

export function normalizeReportScheduleStatus(value: unknown): ReportScheduleStatus {
  if (value === "running" || value === "delivered" || value === "failed") {
    return value;
  }

  return value === "error" ? "failed" : "idle";
}

export function normalizeReportScheduleCadence(
  value: unknown
): Exclude<ReportCadence, "all_time"> {
  return value === "weekly" ? "weekly" : "monthly";
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
      nextRunAt.setUTCDate(nextRunAt.getUTCDate() + 7);
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
        reportScheduleCompanyAvailable(),
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
        reportScheduleCompanyAvailable(),
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

function reportScheduleCompanyAvailable() {
  return or(
    ne(reportSchedules.scope, "company"),
    exists(
      db
        .select({ id: companies.id })
        .from(companies)
        .where(and(
          eq(companies.id, reportSchedules.companyId),
          eq(companies.userId, reportSchedules.userId),
          isNull(companies.deletedAt)
        ))
    )
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
  const dayOfMonth = value.getUTCDate();
  const lastDayOfCurrentMonth = new Date(Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth() + 1,
    0
  )).getUTCDate();
  const staysAtMonthEnd = dayOfMonth === lastDayOfCurrentMonth;
  value.setUTCDate(1);
  value.setUTCMonth(value.getUTCMonth() + 1);
  const lastDayOfTargetMonth = new Date(Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth() + 1,
    0
  )).getUTCDate();
  value.setUTCDate(staysAtMonthEnd ? lastDayOfTargetMonth : Math.min(dayOfMonth, lastDayOfTargetMonth));
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

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected report delivery failure.";
}

export { buildReportMessage };
