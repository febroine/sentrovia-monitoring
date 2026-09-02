import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db, type DatabaseExecutor } from "@/lib/db";
import {
  companies,
  monitors,
  publicStatusPages,
  reportSchedules,
  users,
  userSettings,
} from "@/lib/db/schema";
import { getAuthSecret } from "@/lib/env";

const RESTORE_PREVIEW_TOKEN_TTL_MS = 10 * 60_000;
const MONITOR_RUNTIME_REVISION_FIELDS = [
  "status",
  "statusCode",
  "uptime",
  "lastCheckedAt",
  "nextCheckAt",
  "leaseToken",
  "leaseExpiresAt",
  "lastSuccessAt",
  "lastFailureAt",
  "sslExpiresAt",
  "lastErrorMessage",
  "consecutiveFailures",
  "verificationMode",
  "verificationFailureCount",
  "latencyMs",
  "heartbeatLastReceivedAt",
  "updatedAt",
] as const;
const REPORT_SCHEDULE_RUNTIME_REVISION_FIELDS = [
  "nextRunAt",
  "lastRunAt",
  "lastDeliveredAt",
  "lastStatus",
  "lastErrorMessage",
  "claimToken",
  "claimExpiresAt",
  "updatedAt",
] as const;

export function createWorkspaceRestoreToken(
  userId: string,
  format: "json" | "yaml",
  content: string,
  workspaceRevision: string,
  now = new Date(),
  workspaceId?: string
) {
  const expiresAt = now.getTime() + RESTORE_PREVIEW_TOKEN_TTL_MS;
  const signature = signWorkspaceRestoreToken(
    userId,
    format,
    content,
    workspaceRevision,
    expiresAt,
    workspaceId
  );
  return `${expiresAt}.${signature}`;
}

export function verifyWorkspaceRestoreToken(
  token: string,
  userId: string,
  format: "json" | "yaml",
  content: string,
  workspaceRevision: string,
  now = new Date(),
  workspaceId?: string
) {
  const [expiresAtRaw, suppliedSignature, ...extraParts] = token.split(".");
  const expiresAt = Number(expiresAtRaw);
  if (
    extraParts.length > 0
    || !Number.isSafeInteger(expiresAt)
    || expiresAt <= now.getTime()
    || expiresAt > now.getTime() + RESTORE_PREVIEW_TOKEN_TTL_MS
    || !suppliedSignature
  ) {
    return false;
  }

  const expectedSignature = signWorkspaceRestoreToken(
    userId,
    format,
    content,
    workspaceRevision,
    expiresAt,
    workspaceId
  );
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

export async function getWorkspaceRestoreRevision(
  userId: string,
  database: DatabaseExecutor = db,
  workspaceId?: string
) {
  const [companyRows, monitorRows, publicStatusPageRows, reportScheduleRows, settingsRows, userRows] = await Promise.all([
    database.select().from(companies).where(
      workspaceId ? eq(companies.workspaceId, workspaceId) : eq(companies.userId, userId)
    ),
    database.select().from(monitors).where(
      workspaceId ? eq(monitors.workspaceId, workspaceId) : eq(monitors.userId, userId)
    ),
    database.select().from(publicStatusPages).where(
      workspaceId
        ? eq(publicStatusPages.workspaceId, workspaceId)
        : eq(publicStatusPages.userId, userId)
    ),
    database.select().from(reportSchedules).where(
      workspaceId ? eq(reportSchedules.workspaceId, workspaceId) : eq(reportSchedules.userId, userId)
    ),
    database.select().from(userSettings).where(eq(userSettings.userId, userId)),
    database
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        role: users.role,
        department: users.department,
        username: users.username,
        organization: users.organization,
        jobTitle: users.jobTitle,
        phone: users.phone,
      })
      .from(users)
      .where(eq(users.id, userId)),
  ]);

  return buildWorkspaceRestoreRevision({
    companies: companyRows,
    monitors: monitorRows,
    publicStatusPages: publicStatusPageRows,
    reportSchedules: reportScheduleRows,
    settings: settingsRows[0] ?? null,
    user: userRows[0] ?? null,
  });
}

export function buildWorkspaceRestoreRevision(input: {
  companies: Array<Record<string, unknown>>;
  monitors: Array<Record<string, unknown>>;
  publicStatusPages?: Array<Record<string, unknown>>;
  reportSchedules?: Array<Record<string, unknown>>;
  settings: Record<string, unknown> | null;
  user: Record<string, unknown> | null;
}) {
  return crypto.createHash("sha256").update(JSON.stringify({
    companies: normalizeRevisionRecords(input.companies, ["updatedAt"]),
    monitors: normalizeRevisionRecords(input.monitors, MONITOR_RUNTIME_REVISION_FIELDS),
    publicStatusPages: normalizeRevisionRecords(input.publicStatusPages ?? [], ["updatedAt"]),
    reportSchedules: normalizeRevisionRecords(input.reportSchedules ?? [], REPORT_SCHEDULE_RUNTIME_REVISION_FIELDS),
    settings: input.settings ? omitRevisionFields(input.settings, ["updatedAt"]) : null,
    user: input.user,
  })).digest("base64url");
}

function signWorkspaceRestoreToken(
  userId: string,
  format: "json" | "yaml",
  content: string,
  workspaceRevision: string,
  expiresAt: number,
  workspaceId?: string
) {
  const contentDigest = crypto.createHash("sha256").update(content, "utf8").digest("base64url");
  return crypto
    .createHmac("sha256", getAuthSecret())
    .update(`${userId}\n${workspaceId ?? ""}\n${format}\n${workspaceRevision}\n${expiresAt}\n${contentDigest}`, "utf8")
    .digest("base64url");
}

function normalizeRevisionRecords(
  rows: Array<Record<string, unknown>>,
  excludedFields: readonly string[]
) {
  return rows
    .map((row) => omitRevisionFields(row, excludedFields))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

function omitRevisionFields(row: Record<string, unknown>, excludedFields: readonly string[]) {
  const excluded = new Set(excludedFields);
  return Object.fromEntries(Object.entries(row).filter(([key]) => !excluded.has(key)));
}
