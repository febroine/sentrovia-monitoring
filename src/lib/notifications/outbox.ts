import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db, type DatabaseExecutor } from "@/lib/db";
import { notificationJobs, type NotificationJob } from "@/lib/db/schema";

// A job that throws (database outage, unexpected error) is retried with backoff; a delivery that is
// refused is not an error here, the delivery queue retries it on its own.
export const MAX_NOTIFICATION_JOB_ATTEMPTS = 5;
const NOTIFICATION_JOB_RETRY_DELAYS_MS = [15_000, 60_000, 120_000, 300_000];
// Long enough for a queued screenshot (up to twice its 82 s budget) plus every delivery.
export const NOTIFICATION_JOB_CLAIM_MS = 10 * 60_000;
// Finished jobs are only bookkeeping; the sent alerts live on in the delivery log and monitor events.
export const NOTIFICATION_JOB_RETENTION_DAYS = 3;
const MAX_ERROR_LENGTH = 1_000;

export type NotificationJobOutcome = "sent" | "skipped";

export async function enqueueNotificationJob(input: {
  workspaceId: string;
  userId: string;
  monitorId: string;
  kind: string;
  dedupeKey: string | null;
  payload: string;
  checkedAt: Date;
}) {
  // An alert with a dedupe key is dropped while the same alert still waits; it is not lost, the
  // waiting one carries it.
  const rows = await db.execute<{ id: string }>(sql`
    insert into notification_jobs (id, workspace_id, user_id, monitor_id, kind, dedupe_key, payload, checked_at)
    values (
      ${crypto.randomUUID()},
      ${input.workspaceId},
      ${input.userId},
      ${input.monitorId},
      ${input.kind},
      ${input.dedupeKey},
      ${input.payload},
      ${input.checkedAt.toISOString()}::timestamptz
    )
    on conflict (monitor_id, dedupe_key) where status in ('pending', 'processing') and dedupe_key is not null
    do nothing
    returning id
  `);

  return rows.length > 0 ? "queued" as const : "duplicate" as const;
}

export async function hasOpenNotificationJob(monitorId: string, kind: string) {
  const [row] = await db
    .select({ id: notificationJobs.id })
    .from(notificationJobs)
    .where(and(
      eq(notificationJobs.monitorId, monitorId),
      eq(notificationJobs.kind, kind),
      sql`${notificationJobs.status} in ('pending', 'processing')`
    ))
    .limit(1);

  return Boolean(row);
}

// Claims the oldest runnable jobs. A job waits while an earlier job of the same monitor is unfinished,
// so a monitor's alerts always go out in the order they were raised. Jobs whose worker died are taken
// over once their claim expires.
export async function claimNotificationJobs(limit: number, claimMs = NOTIFICATION_JOB_CLAIM_MS) {
  if (limit <= 0) return [];

  const rows = await db.execute<Record<string, unknown>>(sql`
    with candidates as (
      select job.id
      from notification_jobs as job
      where (
          (job.status = 'pending' and job.next_attempt_at <= now())
          or (job.status = 'processing' and job.claim_expires_at <= now())
        )
        and not exists (
          select 1
          from notification_jobs as earlier
          where earlier.monitor_id = job.monitor_id
            and earlier.status in ('pending', 'processing')
            and earlier.seq < job.seq
        )
      order by job.seq
      limit ${limit}
      for update of job skip locked
    )
    update notification_jobs as job
    set status = 'processing',
        claim_token = gen_random_uuid()::text,
        claim_expires_at = now() + make_interval(secs => ${claimMs / 1_000}),
        attempts = job.attempts + 1
    from candidates
    where job.id = candidates.id
    returning job.*
  `);

  return rows.map(mapNotificationJobRow).sort((left, right) => left.seq - right.seq);
}

// Records that deliveries may have started, so a job taken over after a crash can tell whether its
// alert already went out. The first attempt's time is kept.
export async function markNotificationDeliveryStarted(job: Pick<NotificationJob, "id" | "claimToken">) {
  if (!job.claimToken) return;

  await db
    .update(notificationJobs)
    .set({ deliveryStartedAt: sql`coalesce(${notificationJobs.deliveryStartedAt}, now())` })
    .where(and(eq(notificationJobs.id, job.id), eq(notificationJobs.claimToken, job.claimToken)));
}

// Locks the job row if this worker still owns it. A history reset or monitor deletion removes the job,
// and an expired claim may have been taken over; either way the caller must not record anything.
export async function lockOwnedNotificationJob(
  database: DatabaseExecutor,
  job: Pick<NotificationJob, "id" | "claimToken">
) {
  if (!job.claimToken) return false;

  const rows = await database.execute<{ id: string }>(sql`
    select id
    from notification_jobs
    where id = ${job.id}
      and claim_token = ${job.claimToken}
      and status = 'processing'
    for update
  `);

  return rows.length > 0;
}

export async function isNotificationJobOwned(job: Pick<NotificationJob, "id" | "claimToken">) {
  return lockOwnedNotificationJob(db, job);
}

export async function completeNotificationJob(
  database: DatabaseExecutor,
  job: Pick<NotificationJob, "id" | "claimToken">,
  outcome: NotificationJobOutcome
) {
  if (!job.claimToken) return false;

  const updated = await database
    .update(notificationJobs)
    .set({
      status: "done",
      outcome,
      claimToken: null,
      claimExpiresAt: null,
      lastError: null,
      completedAt: new Date(),
    })
    .where(and(eq(notificationJobs.id, job.id), eq(notificationJobs.claimToken, job.claimToken)))
    .returning({ id: notificationJobs.id });

  return updated.length > 0;
}

export async function failNotificationJob(
  job: Pick<NotificationJob, "id" | "claimToken" | "attempts">,
  errorMessage: string,
  // keepRetrying: the alert already went out, so only its bookkeeping is left; it is never given up.
  options: { permanent?: boolean; keepRetrying?: boolean } = {}
) {
  if (!job.claimToken) return false;

  const exhausted = options.permanent || (!options.keepRetrying && job.attempts >= MAX_NOTIFICATION_JOB_ATTEMPTS);
  const updated = await db
    .update(notificationJobs)
    .set(exhausted
      ? {
        status: "failed",
        claimToken: null,
        claimExpiresAt: null,
        lastError: errorMessage.slice(0, MAX_ERROR_LENGTH),
        completedAt: new Date(),
      }
      : {
        status: "pending",
        claimToken: null,
        claimExpiresAt: null,
        lastError: errorMessage.slice(0, MAX_ERROR_LENGTH),
        nextAttemptAt: new Date(Date.now() + calculateNotificationJobRetryDelayMs(job.attempts)),
      })
    .where(and(eq(notificationJobs.id, job.id), eq(notificationJobs.claimToken, job.claimToken)))
    .returning({ id: notificationJobs.id });

  return updated.length > 0;
}

export function calculateNotificationJobRetryDelayMs(attempts: number) {
  const index = Math.min(Math.max(0, attempts - 1), NOTIFICATION_JOB_RETRY_DELAYS_MS.length - 1);
  return NOTIFICATION_JOB_RETRY_DELAYS_MS[index];
}

// Alerts raised but not sent yet, and how long the oldest has been waiting.
export async function getNotificationQueueSummary(now = new Date(), scope: { workspaceId?: string; userId?: string } = {}) {
  const [row] = await db.execute<{ waiting: number | string; oldest_created_at: Date | string | null }>(sql`
    select
      count(*) as waiting,
      min(created_at) as oldest_created_at
    from notification_jobs
    where status in ('pending', 'processing')
      ${scope.workspaceId ? sql`and workspace_id = ${scope.workspaceId}` : sql``}
      ${!scope.workspaceId && scope.userId ? sql`and user_id = ${scope.userId}` : sql``}
  `);
  const oldest = row?.oldest_created_at ? new Date(row.oldest_created_at) : null;

  return {
    waiting: Number(row?.waiting ?? 0),
    oldestWaitMs: oldest && !Number.isNaN(oldest.getTime()) ? Math.max(0, now.getTime() - oldest.getTime()) : null,
  };
}

function mapNotificationJobRow(row: Record<string, unknown>): NotificationJob {
  return {
    id: String(row.id),
    seq: Number(row.seq),
    workspaceId: String(row.workspace_id),
    userId: String(row.user_id),
    monitorId: String(row.monitor_id),
    kind: String(row.kind),
    dedupeKey: (row.dedupe_key as string | null) ?? null,
    status: String(row.status),
    payload: String(row.payload),
    checkedAt: toDate(row.checked_at) ?? new Date(0),
    attempts: Number(row.attempts),
    nextAttemptAt: toDate(row.next_attempt_at) ?? new Date(0),
    claimToken: (row.claim_token as string | null) ?? null,
    claimExpiresAt: toDate(row.claim_expires_at),
    deliveryStartedAt: toDate(row.delivery_started_at),
    outcome: (row.outcome as string | null) ?? null,
    lastError: (row.last_error as string | null) ?? null,
    completedAt: toDate(row.completed_at),
    createdAt: toDate(row.created_at) ?? new Date(0),
  };
}

function toDate(value: unknown) {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}
