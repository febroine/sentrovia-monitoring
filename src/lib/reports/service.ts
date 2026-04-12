import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { getCompanyById } from "@/lib/companies/service";
import { db } from "@/lib/db";
import { companies, monitorChecks, monitorEvents, monitors, reportSchedules } from "@/lib/db/schema";
import { sendEmailDelivery } from "@/lib/delivery/service";
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
const DEFAULT_FIRST_RUN_DELAY_MS = 60 * 60 * 1000;
const DEFAULT_REPORT_TEMPLATE: ReportTemplateVariant = "operations";

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
    })
    .returning();

  return serializeSchedule(created, await resolveCompanyName(userId, resolvedCompanyId));
}

export async function getReportScheduleById(userId: string, scheduleId: string) {
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
  const averageLatencyMs = averageValue(
    scoped.checks.map((check) => check.latencyMs).filter((value): value is number => typeof value === "number")
  );

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
      uptimePct: totalChecks > 0 ? roundToTwoDecimals((upChecks / totalChecks) * 100) : 100,
      averageLatencyMs,
      failureEvents: scoped.failureEvents.length,
    },
    statusCodes: statusCodeSummary,
    slowMonitors: slowMonitors.slice(0, REPORT_PREVIEW_LIMIT),
    failingMonitors: failingMonitors.slice(0, REPORT_PREVIEW_LIMIT),
    monitorBreakdown: monitorBreakdown.slice(0, REPORT_PREVIEW_LIMIT),
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
  const message = buildReportMessage(report);
  const delivery = await sendEmailDelivery({
    userId,
    kind: "report",
    destinationOverride: normalizedRecipients.join(", "),
    subject: message.subject,
    textBody: message.textBody,
    htmlBody: message.htmlBody,
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
    const nextRunAt = scheduleNextRunAt(schedule.nextRunAt, schedule.cadence as ReportCadence);

    try {
      await dispatchReportNow(
        schedule.userId,
        {
          scope: schedule.scope as ReportPreviewInput["scope"],
          cadence: schedule.cadence as ReportCadence,
          template: schedule.template as ReportTemplateVariant,
          companyId: schedule.companyId,
        },
        schedule.recipientEmails
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
        .where(eq(reportSchedules.id, schedule.id));
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
        .where(eq(reportSchedules.id, schedule.id));
    }
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
      status: monitors.status,
      companyId: monitors.companyId,
      company: monitors.company,
    })
    .from(monitors)
    .where(
      input.scope === "company" && company
        ? and(eq(monitors.userId, userId), eq(monitors.companyId, company.id))
        : eq(monitors.userId, userId)
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
              gte(monitorChecks.createdAt, period.startedAt)
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
            createdAt: monitorEvents.createdAt,
          })
          .from(monitorEvents)
          .where(
            and(
              eq(monitorEvents.userId, userId),
              inArray(monitorEvents.monitorId, monitorIds),
              eq(monitorEvents.eventType, "failure"),
              gte(monitorEvents.createdAt, period.startedAt)
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
    status: string;
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
      const latencies = settledChecks
        .map((check) => check.latencyMs)
        .filter((value): value is number => typeof value === "number");

      return {
        monitorId: monitor.id,
        name: monitor.name,
        status: monitor.status,
        uptimePct:
          settledChecks.length > 0 ? roundToTwoDecimals((upChecks / settledChecks.length) * 100) : 100,
        averageLatencyMs: averageValue(latencies),
        totalChecks: settledChecks.length,
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

function buildReportMessage(report: GeneratedReport) {
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
  const subject = `${subjectPrefix} ${report.title}`;
  const lines = [
    `${report.title}`,
    `${report.workspaceName}`,
    `${report.templateLabel}`,
    introLine,
    `${report.periodLabel} (${new Date(report.periodStartedAt).toLocaleString()} - ${new Date(report.periodEndedAt).toLocaleString()})`,
    "",
    `Monitors: ${report.summary.monitorCount}`,
    `Currently up: ${report.summary.currentlyUp}`,
    `Currently down: ${report.summary.currentlyDown}`,
    `Currently pending: ${report.summary.currentlyPending}`,
    `Checks: ${report.summary.totalChecks}`,
    `Uptime: ${report.summary.uptimePct.toFixed(2)}%`,
    `Average latency: ${report.summary.averageLatencyMs}ms`,
    `Failure events: ${report.summary.failureEvents}`,
    "",
    "Top slow monitors:",
    ...report.slowMonitors
      .slice(0, 5)
      .map((monitor) => `- ${monitor.name}: ${monitor.averageLatencyMs}ms avg over ${monitor.checks} checks`),
    "",
    "Top failing monitors:",
    ...report.failingMonitors.slice(0, 5).map((monitor) => `- ${monitor.name}: ${monitor.failures} failures`),
  ];

  const htmlBody = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
      <div style="border:1px solid #e5e7eb;border-radius:18px;padding:18px 20px;background:linear-gradient(135deg,rgba(15,23,42,0.03),rgba(59,130,246,0.03));margin-bottom:18px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div>
            <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#64748b">${escapeHtml(report.templateLabel)}</p>
            <h2 style="margin:0 0 6px">${escapeHtml(report.title)}</h2>
            <p style="margin:0;color:#4b5563">${escapeHtml(report.workspaceName)} - ${escapeHtml(report.periodLabel)}</p>
          </div>
          <div style="border:1px solid #dbeafe;border-radius:999px;padding:8px 12px;color:#1d4ed8;background:#eff6ff;font-size:12px;font-weight:600">
            ${escapeHtml(report.scope === "company" ? report.companyName ?? "Company" : "Workspace")}
          </div>
        </div>
        <p style="margin:12px 0 0;color:#475569">${escapeHtml(introLine)}</p>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:20px 0">
        ${renderMetricCard("Monitors", String(report.summary.monitorCount))}
        ${renderMetricCard("Uptime", `${report.summary.uptimePct.toFixed(2)}%`)}
        ${renderMetricCard("Avg latency", `${report.summary.averageLatencyMs}ms`)}
        ${renderMetricCard("Down now", String(report.summary.currentlyDown))}
        ${renderMetricCard("Checks", String(report.summary.totalChecks))}
        ${renderMetricCard("Failures", String(report.summary.failureEvents))}
      </div>
      ${renderSimpleList("Top slow monitors", report.slowMonitors.slice(0, 5).map((monitor) => `${monitor.name} - ${monitor.averageLatencyMs}ms avg`))}
      ${renderSimpleList("Top failing monitors", report.failingMonitors.slice(0, 5).map((monitor) => `${monitor.name} - ${monitor.failures} failures`))}
    </div>
  `;

  return {
    subject,
    textBody: lines.join("\n"),
    htmlBody,
  };
}

function renderMetricCard(label: string, value: string) {
  return `<div style="border:1px solid #e5e7eb;border-radius:14px;padding:12px 14px"><div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#6b7280">${escapeHtml(label)}</div><div style="margin-top:6px;font-size:20px;font-weight:700">${escapeHtml(value)}</div></div>`;
}

function renderSimpleList(title: string, items: string[]) {
  const safeItems = items.length > 0 ? items : ["No data in this period."];
  return `<div style="margin-top:20px"><p style="font-weight:600;margin-bottom:8px">${escapeHtml(title)}</p><ul style="padding-left:18px;margin:0">${safeItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`;
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
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
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

function roundToTwoDecimals(value: number) {
  return Math.round(value * 100) / 100;
}

function scheduleNextRunAt(currentRunAt: Date, cadence: ReportCadence) {
  const nextRunAt = new Date(currentRunAt);

  if (cadence === "weekly") {
    nextRunAt.setDate(nextRunAt.getDate() + 7);
    return nextRunAt;
  }

  nextRunAt.setMonth(nextRunAt.getMonth() + 1);
  return nextRunAt;
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
