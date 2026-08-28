import nextEnv from "@next/env";
import postgres from "postgres";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { resolveDatabaseUrl } from "./database-url.mjs";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const DEFAULT_MONITOR_COUNT = 10_000;
const DEFAULT_ITERATIONS = 50;
const USER_COUNT = 100;
const CLAIM_LIMIT = 200;

export function parseBenchmarkOptions(environment = process.env) {
  return {
    monitorCount: parseBoundedInteger(environment.BENCHMARK_MONITORS, DEFAULT_MONITOR_COUNT, 100, 1_000_000),
    iterations: parseBoundedInteger(environment.BENCHMARK_ITERATIONS, DEFAULT_ITERATIONS, 5, 500),
  };
}

export function percentile(values, percentileValue) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(percentileValue * sorted.length) - 1));
  return sorted[index];
}

export function resolveBenchmarkDatabaseUrl(environment = process.env) {
  return resolveDatabaseUrl(environment, {
    defaultUser: "postgres",
    defaultDatabase: "uptimemonitoring",
    protocol: "postgresql",
  });
}

export async function runScaleBenchmark(databaseUrl, options = parseBenchmarkOptions()) {
  const sql = postgres(databaseUrl, { max: 1, idle_timeout: 5, connect_timeout: 10 });
  try {
    await createTemporaryBenchmarkTable(sql);
    const insertStartedAt = performance.now();
    await seedTemporaryMonitors(sql, options.monitorCount);
    const insertDurationMs = performance.now() - insertStartedAt;
    await sql`analyze sentrovia_benchmark_monitors`;

    const queryDurationsMs = [];
    let selectedRows = 0;
    for (let iteration = 0; iteration < options.iterations; iteration += 1) {
      const startedAt = performance.now();
      const rows = await selectDueBenchmarkMonitors(sql);
      queryDurationsMs.push(performance.now() - startedAt);
      selectedRows = rows.length;
    }

    const [planRow] = await sql.unsafe(`
      explain (analyze, buffers, format json)
      select id
      from sentrovia_benchmark_monitors
      where is_active = true
        and deleted_at is null
        and next_check_at <= now()
        and (lease_expires_at is null or lease_expires_at <= now())
      order by verification_mode desc, next_check_at asc, created_at asc
      limit ${CLAIM_LIMIT}
    `);
    const plan = planRow?.["QUERY PLAN"]?.[0];

    return {
      generatedAt: new Date().toISOString(),
      PostgreSQL: "temporary-table benchmark; no application data is modified",
      monitorCount: options.monitorCount,
      userCount: USER_COUNT,
      iterations: options.iterations,
      selectedRows,
      insertDurationMs: round(insertDurationMs),
      claimQueryMs: {
        min: round(Math.min(...queryDurationsMs)),
        p50: round(percentile(queryDurationsMs, 0.5)),
        p95: round(percentile(queryDurationsMs, 0.95)),
        max: round(Math.max(...queryDurationsMs)),
      },
      explainExecutionMs: round(Number(plan?.["Execution Time"] ?? 0)),
      explainPlanningMs: round(Number(plan?.["Planning Time"] ?? 0)),
    };
  } finally {
    await sql.end({ timeout: 1 });
  }
}

async function createTemporaryBenchmarkTable(sql) {
  await sql.unsafe(`
    create temporary table sentrovia_benchmark_monitors (
      id text primary key,
      user_id text not null,
      is_active boolean not null,
      deleted_at timestamptz,
      next_check_at timestamptz,
      lease_expires_at timestamptz,
      verification_mode boolean not null,
      created_at timestamptz not null
    ) on commit preserve rows
  `);
  await sql.unsafe(`
    create index sentrovia_benchmark_due_idx
      on sentrovia_benchmark_monitors (is_active, next_check_at, lease_expires_at, verification_mode, created_at)
      where deleted_at is null
  `);
  await sql.unsafe(`
    create index sentrovia_benchmark_user_due_idx
      on sentrovia_benchmark_monitors (user_id, next_check_at, created_at)
      where is_active = true and deleted_at is null
  `);
}

async function seedTemporaryMonitors(sql, monitorCount) {
  await sql`
    insert into sentrovia_benchmark_monitors (
      id, user_id, is_active, deleted_at, next_check_at, lease_expires_at, verification_mode, created_at
    )
    select
      'benchmark-' || value,
      'user-' || ((value - 1) % ${USER_COUNT}),
      value % 20 <> 0,
      case when value % 100 = 0 then now() else null end,
      now() + ((value % 120) - 90) * interval '1 minute',
      case when value % 25 = 0 then now() + interval '2 minutes' else null end,
      value % 17 = 0,
      now() - value * interval '1 second'
    from generate_series(1, ${monitorCount}) as value
  `;
}

function selectDueBenchmarkMonitors(sql) {
  return sql`
    select id
    from sentrovia_benchmark_monitors
    where is_active = true
      and deleted_at is null
      and next_check_at <= now()
      and (lease_expires_at is null or lease_expires_at <= now())
    order by verification_mode desc, next_check_at asc, created_at asc
    limit ${CLAIM_LIMIT}
  `;
}

function parseBoundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const databaseUrl = resolveBenchmarkDatabaseUrl();
  if (!databaseUrl) {
    console.error("DATABASE_URL or POSTGRES_PASSWORD is required for the scale benchmark.");
    process.exitCode = 1;
  } else {
    runScaleBenchmark(databaseUrl)
      .then((result) => console.log(JSON.stringify(result, null, 2)))
      .catch((error) => {
        console.error(error instanceof Error ? error.message : "Scale benchmark failed.");
        process.exitCode = 1;
      });
  }
}
