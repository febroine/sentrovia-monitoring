import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { workerState } from "@/lib/db/schema";
import { DEFAULT_SETTINGS } from "@/lib/settings/types";

const RETENTION_LOCK_KEY = 54_821_903;
const RETENTION_INTERVAL_MS = 60 * 60 * 1000;
const SOFT_DELETE_GRACE_MS = 60_000;
const WORKER_STATE_ID = "primary";

export async function runRetentionCleanup(now = new Date()) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${RETENTION_LOCK_KEY})`);
    const [state] = await tx
      .select({ lastRetentionCleanupAt: workerState.lastRetentionCleanupAt })
      .from(workerState)
      .where(eq(workerState.id, WORKER_STATE_ID));

    // Undo windows are short, so expired soft-deletes must not wait for the hourly history cleanup.
    await purgeExpiredSoftDeletes(tx, now);

    if (!shouldRunRetentionCleanup(state?.lastRetentionCleanupAt ?? null, now)) {
      return { ran: false };
    }

    await tx.execute(sql`
      delete from monitor_checks as record
      where record.created_at < ${now} - make_interval(days => coalesce(
        (select settings.data_retention_days from user_settings as settings where settings.user_id = record.user_id),
        ${DEFAULT_SETTINGS.data.retentionDays}
      ))
    `);
    await tx.execute(sql`
      delete from monitor_events as record
      where record.created_at < ${now} - make_interval(days => coalesce(
        (select settings.event_retention_days from user_settings as settings where settings.user_id = record.user_id),
        ${DEFAULT_SETTINGS.data.eventRetentionDays}
      ))
        and not (
          record.event_type in ('failure-notification', 'downtime-reminder')
          and exists (
            select 1 from monitors as monitor
            where monitor.id = record.monitor_id
              and monitor.status = 'down'
          )
        )
    `);
    await tx.execute(sql`
      delete from monitor_diagnostics as record
      where record.created_at < ${now} - make_interval(days => coalesce(
        (select settings.event_retention_days from user_settings as settings where settings.user_id = record.user_id),
        ${DEFAULT_SETTINGS.data.eventRetentionDays}
      ))
    `);
    await tx.execute(sql`
      delete from outage_events as record
      where record.created_at < ${now} - make_interval(days => coalesce(
        (select settings.event_retention_days from user_settings as settings where settings.user_id = record.user_id),
        ${DEFAULT_SETTINGS.data.eventRetentionDays}
      ))
    `);
    await tx.execute(sql`
      delete from monitor_outages as record
      where record.status = 'resolved'
        and coalesce(record.resolved_at, record.updated_at) < ${now} - make_interval(days => coalesce(
          (select settings.event_retention_days from user_settings as settings where settings.user_id = record.user_id),
          ${DEFAULT_SETTINGS.data.eventRetentionDays}
        ))
    `);
    await tx.execute(sql`
      delete from delivery_events as record
      where record.status in ('delivered', 'failed')
        and record.created_at < ${now} - make_interval(days => coalesce(
          (select settings.delivery_retention_days from user_settings as settings where settings.user_id = record.user_id),
          ${DEFAULT_SETTINGS.data.deliveryRetentionDays}
        ))
    `);
    await tx.execute(sql`
      delete from worker_cycle_metrics
      where created_at < ${now} - make_interval(
        days => greatest(coalesce((select max(data_retention_days) from user_settings), 90), 7)
      )
    `);
    await tx
      .update(workerState)
      .set({ lastRetentionCleanupAt: now, updatedAt: now })
      .where(eq(workerState.id, WORKER_STATE_ID));

    return { ran: true };
  });
}

export function shouldRunRetentionCleanup(lastRunAt: Date | null, now: Date) {
  return !lastRunAt || now.getTime() - lastRunAt.getTime() >= RETENTION_INTERVAL_MS;
}

async function purgeExpiredSoftDeletes(executor: Parameters<Parameters<typeof db.transaction>[0]>[0], now: Date) {
  const cutoff = getSoftDeleteCutoff(now);

  await executor.execute(sql`
    with expired_companies as (
      select id from companies
      where deleted_at is not null
        and deleted_at < ${cutoff}
    )
    update user_settings
    set public_status_enabled = false,
        public_status_company_id = null,
        updated_at = ${now}
    where public_status_company_id in (select id from expired_companies)
  `);
  await executor.execute(sql`
    with expired_companies as (
      select id from companies
      where deleted_at is not null
        and deleted_at < ${cutoff}
    )
    update report_schedules
    set company_id = null,
        is_active = false,
        last_status = 'error',
        last_error_message = 'The assigned company was deleted.',
        updated_at = ${now}
    where company_id in (select id from expired_companies)
  `);
  await executor.execute(sql`
    with expired_companies as (
      select id from companies
      where deleted_at is not null
        and deleted_at < ${cutoff}
    )
    update monitors
    set company_id = null, company = null, updated_at = ${now}
    where company_id in (select id from expired_companies)
  `);
  await executor.execute(sql`
    delete from companies
    where deleted_at is not null
      and deleted_at < ${cutoff}
  `);
  await executor.execute(sql`
    delete from monitors
    where deleted_at is not null
      and deleted_at < ${cutoff}
  `);
}

export function getSoftDeleteCutoff(now: Date) {
  return new Date(now.getTime() - SOFT_DELETE_GRACE_MS);
}
