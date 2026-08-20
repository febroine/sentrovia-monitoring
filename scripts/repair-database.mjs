import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import nextEnv from "@next/env";
import postgres from "postgres";

const { loadEnvConfig } = nextEnv;
const MAINTENANCE_LOCK_KEYS = [728_551, 493_028];
const WORKER_PROCESS_LOCK_KEY = 51_772_904;
const WORKER_STATE_ID = "primary";
const SOFT_DELETE_GRACE_SECONDS = 60;
const EXPECTED_TABLES = new Set([
  "companies",
  "delivery_events",
  "log_filter_presets",
  "monitor_checks",
  "monitor_diagnostics",
  "monitor_events",
  "monitor_outages",
  "monitors",
  "outage_events",
  "report_schedules",
  "sentrovia_manual_migrations",
  "user_settings",
  "users",
  "webhook_endpoints",
  "worker_cycle_metrics",
  "worker_state",
]);

const RETIRED_OBJECTS = [
  "incident_events",
  "maintenance_windows",
  "monitor_incidents",
];

const OPERATIONS = [
  operation("Create missing user settings", `
    insert into user_settings (id, user_id)
    select md5('sentrovia-user-settings:' || users.id), users.id
    from users
    where not exists (
      select 1 from user_settings where user_settings.user_id = users.id
    )
    on conflict do nothing
  `),
  operation("Repair invalid user setting values", `
    update user_settings
    set
      notification_language = case when notification_language in ('en', 'tr') then notification_language else 'en' end,
      prolonged_downtime_minutes = least(10080, greatest(5, prolonged_downtime_minutes)),
      alert_dedup_minutes = least(1440, greatest(0, alert_dedup_minutes)),
      smtp_port = case when smtp_port between 1 and 65535 then smtp_port else 587 end,
      monitoring_interval = case
        when monitoring_interval ~ '^([1-9]|[1-9][0-9]{1,2}|1[0-3][0-9]{2}|14[0-3][0-9]|1440)(s|m|h)$' then monitoring_interval
        else '5m'
      end,
      monitoring_timeout = least(120000, greatest(1000, monitoring_timeout)),
      monitoring_retries = least(10, greatest(2, monitoring_retries)),
      monitoring_batch_size = least(500, greatest(1, monitoring_batch_size)),
      monitoring_method = case
        when monitoring_method in ('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS') then monitoring_method
        else 'GET'
      end,
      monitoring_response_max_length = least(100000, greatest(0, monitoring_response_max_length)),
      monitoring_max_redirects = least(10, greatest(0, monitoring_max_redirects)),
      sidebar_accent = case when sidebar_accent in ('amber', 'emerald', 'sky', 'rose', 'violet', 'slate') then sidebar_accent else 'emerald' end,
      dashboard_landing_page = case when dashboard_landing_page in ('dashboard', 'monitoring', 'companies', 'logs', 'settings') then dashboard_landing_page else 'dashboard' end,
      dashboard_focus = case when dashboard_focus in ('all', 'favorites', 'critical') then dashboard_focus else 'all' end,
      time_zone = case when exists (select 1 from pg_timezone_names where name = time_zone) then time_zone else 'Europe/Istanbul' end,
      data_retention_days = least(3650, greatest(7, data_retention_days)),
      delivery_retention_days = least(3650, greatest(7, delivery_retention_days)),
      event_retention_days = least(3650, greatest(1, event_retention_days)),
      updated_at = now()
    where
      notification_language not in ('en', 'tr')
      or prolonged_downtime_minutes not between 5 and 10080
      or alert_dedup_minutes not between 0 and 1440
      or smtp_port not between 1 and 65535
      or monitoring_interval !~ '^([1-9]|[1-9][0-9]{1,2}|1[0-3][0-9]{2}|14[0-3][0-9]|1440)(s|m|h)$'
      or monitoring_timeout not between 1000 and 120000
      or monitoring_retries not between 2 and 10
      or monitoring_batch_size not between 1 and 500
      or monitoring_method not in ('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS')
      or monitoring_response_max_length not between 0 and 100000
      or monitoring_max_redirects not between 0 and 10
      or sidebar_accent not in ('amber', 'emerald', 'sky', 'rose', 'violet', 'slate')
      or dashboard_landing_page not in ('dashboard', 'monitoring', 'companies', 'logs', 'settings')
      or dashboard_focus not in ('all', 'favorites', 'critical')
      or not exists (select 1 from pg_timezone_names where name = time_zone)
      or data_retention_days not between 7 and 3650
      or delivery_retention_days not between 7 and 3650
      or event_retention_days not between 1 and 3650
  `),
  operation("Clear invalid dashboard company references", `
    update user_settings as settings
    set dashboard_company_id = null, updated_at = now()
    where dashboard_company_id is not null
      and not exists (
        select 1 from companies
        where companies.id = settings.dashboard_company_id
          and companies.user_id = settings.user_id
          and companies.deleted_at is null
      )
  `),
  operation("Disable invalid public status company scopes", `
    update user_settings as settings
    set public_status_enabled = false,
        public_status_company_id = null,
        updated_at = now()
    where public_status_company_id is not null
      and not exists (
        select 1 from companies
        where companies.id = settings.public_status_company_id
          and companies.user_id = settings.user_id
          and companies.deleted_at is null
      )
  `),
  operation("Release expired monitor leases", `
    update monitors
    set lease_token = null, lease_expires_at = null, updated_at = now()
    where (lease_token is null) <> (lease_expires_at is null)
       or lease_expires_at <= now()
       or (lease_token is not null and (not is_active or deleted_at is not null))
  `),
  operation("Repair expired delivery claims", `
    update delivery_events
    set status = case when status = 'processing' then 'retrying' else status end,
        next_retry_at = case when status = 'processing' then coalesce(next_retry_at, now()) else next_retry_at end,
        claim_token = null,
        claim_expires_at = null
    where (claim_token is null) <> (claim_expires_at is null)
       or claim_expires_at <= now()
       or (claim_token is not null and status in ('delivered', 'failed'))
  `),
  operation("Repair expired report claims", `
    update report_schedules
    set last_status = case when last_status = 'running' then 'idle' else last_status end,
        claim_token = null,
        claim_expires_at = null,
        updated_at = now()
    where (claim_token is null) <> (claim_expires_at is null)
       or claim_expires_at <= now()
       or (claim_token is not null and last_status <> 'running')
  `),
  operation("Detach expired deleted companies from settings", `
    with expired as (
      select id from companies
      where deleted_at is not null
        and deleted_at < now() - make_interval(secs => ${SOFT_DELETE_GRACE_SECONDS})
    )
    update user_settings
    set public_status_enabled = false,
        public_status_company_id = null,
        dashboard_company_id = null,
        updated_at = now()
    where public_status_company_id in (select id from expired)
       or dashboard_company_id in (select id from expired)
  `),
  operation("Detach expired deleted companies from reports", `
    with expired as (
      select id from companies
      where deleted_at is not null
        and deleted_at < now() - make_interval(secs => ${SOFT_DELETE_GRACE_SECONDS})
    )
    update report_schedules
    set company_id = null,
        is_active = false,
        last_status = 'error',
        last_error_message = 'The assigned company was deleted.',
        updated_at = now()
    where company_id in (select id from expired)
  `),
  operation("Detach monitors from expired deleted companies", `
    with expired as (
      select id from companies
      where deleted_at is not null
        and deleted_at < now() - make_interval(secs => ${SOFT_DELETE_GRACE_SECONDS})
    )
    update monitors
    set company_id = null, company = null, updated_at = now()
    where company_id in (select id from expired)
  `),
  operation("Purge expired deleted companies", `
    delete from companies
    where deleted_at is not null
      and deleted_at < now() - make_interval(secs => ${SOFT_DELETE_GRACE_SECONDS})
  `),
  operation("Purge expired deleted monitors", `
    delete from monitors
    where deleted_at is not null
      and deleted_at < now() - make_interval(secs => ${SOFT_DELETE_GRACE_SECONDS})
  `),
  operation("Purge expired monitor checks", retentionDelete("monitor_checks", "data_retention_days", 90)),
  operation("Purge expired monitor diagnostics", retentionDelete("monitor_diagnostics", "event_retention_days", 30)),
  operation("Purge expired outage timeline events", retentionDelete("outage_events", "event_retention_days", 30)),
  operation("Purge expired resolved outages", `
    delete from monitor_outages as record
    where record.status = 'resolved'
      and coalesce(record.resolved_at, record.updated_at) < now() - make_interval(days => coalesce(
        (select event_retention_days from user_settings where user_id = record.user_id), 30
      ))
  `),
  operation("Purge expired monitor events", `
    delete from monitor_events as record
    where record.created_at < now() - make_interval(days => coalesce(
      (select event_retention_days from user_settings where user_id = record.user_id), 30
    ))
      and not (
        record.event_type in ('failure-notification', 'downtime-reminder')
        and exists (
          select 1 from monitors
          where monitors.id = record.monitor_id and monitors.status = 'down'
        )
      )
  `),
  operation("Purge expired delivery history", `
    delete from delivery_events as record
    where record.status in ('delivered', 'failed')
      and record.created_at < now() - make_interval(days => coalesce(
        (select delivery_retention_days from user_settings where user_id = record.user_id), 90
      ))
  `),
  operation("Purge expired worker metrics", `
    delete from worker_cycle_metrics
    where created_at < now() - make_interval(
      days => greatest(coalesce((select max(data_retention_days) from user_settings), 90), 7)
    )
  `),
  operation("Remove unused worker state rows", `
    delete from worker_state where id <> '${WORKER_STATE_ID}'
  `),
  operation("Create the primary worker state when missing", `
    insert into worker_state (id, desired_state, running)
    values ('${WORKER_STATE_ID}', 'stopped', false)
    on conflict (id) do nothing
  `),
];

class DryRunRollback extends Error {}

async function main() {
  loadEnvConfig(process.cwd());
  const options = parseOptions(process.argv.slice(2));
  const databaseUrl = resolveDatabaseUrl(process.env);
  if (!databaseUrl) {
    throw new Error("Database connection is not configured in .env.local or .env.");
  }

  const sql = postgres(databaseUrl, { max: 1, prepare: false, connect_timeout: 10 });
  let workerLockAcquired = false;
  try {
    await assertRequiredTables(sql);
    await acquireMaintenanceLock(sql);
    workerLockAcquired = await tryAcquireWorkerLock(sql);
    const summary = await runOperations(sql, options.dryRun, workerLockAcquired);
    printSummary(summary, options.dryRun, workerLockAcquired);
    await printAudit(sql);

    if (!options.dryRun) {
      await vacuumDatabase(sql);
    }
  } finally {
    if (workerLockAcquired) {
      await sql`select pg_advisory_unlock(${WORKER_PROCESS_LOCK_KEY})`.catch(() => undefined);
    }
    await releaseMaintenanceLock(sql);
    await sql.end({ timeout: 5 }).catch(() => undefined);
  }
}

function operation(label, query) {
  return { label, query: query.trim() };
}

function retentionDelete(table, settingColumn, fallbackDays) {
  return `
    delete from ${table} as record
    where record.created_at < now() - make_interval(days => coalesce(
      (select ${settingColumn} from user_settings where user_id = record.user_id), ${fallbackDays}
    ))
  `;
}

export function parseOptions(args) {
  return { dryRun: args.includes("--dry-run") };
}

export function resolveDatabaseUrl(environment) {
  if (environment.DATABASE_URL?.trim()) {
    return environment.DATABASE_URL.trim();
  }

  const user = environment.POSTGRES_USER;
  const password = environment.POSTGRES_PASSWORD;
  const database = environment.POSTGRES_DB;
  if (!user || !password || !database) {
    return null;
  }

  const host = environment.POSTGRES_HOST || "localhost";
  const port = environment.POSTGRES_PORT || "5432";
  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}`;
}

async function runOperations(sql, dryRun, workerLockAcquired) {
  const summary = [];
  try {
    await sql.begin(async (tx) => {
      for (const item of OPERATIONS) {
        const result = await tx.unsafe(item.query);
        summary.push({ label: item.label, affected: Number(result.count ?? 0) });
      }

      if (workerLockAcquired) {
        const result = await tx`
          update worker_state
          set running = false,
              pid = null,
              heartbeat_at = null,
              status_message = 'Database maintenance verified that no worker process is active.',
              updated_at = now()
          where id = ${WORKER_STATE_ID} and running = true
        `;
        summary.push({ label: "Repair stale worker runtime state", affected: Number(result.count ?? 0) });
      }

      if (dryRun) {
        throw new DryRunRollback();
      }
    });
  } catch (error) {
    if (!(error instanceof DryRunRollback)) {
      throw error;
    }
  }

  return summary;
}

async function assertRequiredTables(sql) {
  const rows = await sql`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
  `;
  const existing = new Set(rows.map((row) => row.table_name));
  const missing = [...EXPECTED_TABLES].filter((table) => !existing.has(table));
  if (missing.length > 0) {
    throw new Error(`Database schema is incomplete. Missing tables: ${missing.join(", ")}. Run npm run db:sync first.`);
  }
}

async function acquireMaintenanceLock(sql) {
  await sql`select pg_advisory_lock(${MAINTENANCE_LOCK_KEYS[0]}, ${MAINTENANCE_LOCK_KEYS[1]})`;
}

async function releaseMaintenanceLock(sql) {
  await sql`select pg_advisory_unlock(${MAINTENANCE_LOCK_KEYS[0]}, ${MAINTENANCE_LOCK_KEYS[1]})`.catch(() => undefined);
}

async function tryAcquireWorkerLock(sql) {
  const [row] = await sql`select pg_try_advisory_lock(${WORKER_PROCESS_LOCK_KEY}) as acquired`;
  return Boolean(row?.acquired);
}

async function printAudit(sql) {
  const unexpectedTables = await sql`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
    order by table_name
  `;
  const unknown = unexpectedTables
    .map((row) => row.table_name)
    .filter((table) => !EXPECTED_TABLES.has(table));
  const retired = RETIRED_OBJECTS.filter((table) => unknown.includes(table));
  const unvalidatedConstraints = await sql`
    select conname
    from pg_constraint
    where connamespace = 'public'::regnamespace and not convalidated
    order by conname
  `;

  console.log(`Audit: unexpected public tables: ${unknown.length ? unknown.join(", ") : "none"}.`);
  console.log(`Audit: retired tables still present: ${retired.length ? retired.join(", ") : "none"}.`);
  console.log(`Audit: unvalidated constraints: ${unvalidatedConstraints.length ? unvalidatedConstraints.map((row) => row.conname).join(", ") : "none"}.`);
  if (unknown.length > 0) {
    console.log("Unexpected tables were reported but not deleted because ownership cannot be proven safely.");
  }
}

async function vacuumDatabase(sql) {
  try {
    await sql.unsafe("vacuum (analyze)");
    console.log("VACUUM ANALYZE completed.");
  } catch (error) {
    console.warn(`VACUUM ANALYZE skipped: ${error instanceof Error ? error.message : "insufficient database permission"}`);
  }
}

function printSummary(summary, dryRun, workerLockAcquired) {
  console.log(dryRun ? "Database repair dry run (all changes rolled back):" : "Database repair completed:");
  for (const item of summary) {
    console.log(`- ${item.label}: ${item.affected}`);
  }
  console.log(`Worker activity: ${workerLockAcquired ? "no active worker; stale runtime state was eligible for repair" : "active worker detected; runtime state was preserved"}.`);
}

function isMainModule() {
  return Boolean(process.argv[1]) && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
}

if (isMainModule()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Database repair failed.");
    process.exitCode = 1;
  });
}
