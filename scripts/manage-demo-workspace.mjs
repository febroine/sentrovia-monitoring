import crypto from "node:crypto";

import bcrypt from "bcryptjs";
import postgres from "postgres";

const action = process.argv[2];
const runId = normalizeRunId(process.env.SENTROVIA_DEMO_RUN_ID ?? "");
const username = `demo_${runId}`;
const email = `${username}@example.test`;
const workspaceName = `Northstar Demo ${runId}`;
const statusSlug = `northstar-${runId}`;
const sql = postgres({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  database: process.env.POSTGRES_DB,
  username: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  max: 1,
  prepare: false,
});

try {
  if (action === "create") {
    process.stdout.write(`${JSON.stringify(await createDemoWorkspace())}\n`);
  } else if (action === "cleanup") {
    await cleanupDemoWorkspace();
    process.stdout.write(`${JSON.stringify({ cleaned: true, runId })}\n`);
  } else {
    throw new Error("Use 'create' or 'cleanup' when managing a demo workspace.");
  }
} finally {
  await sql.end({ timeout: 5 });
}

async function createDemoWorkspace() {
  const password = `Sentrovia-${crypto.randomBytes(18).toString("base64url")}a1!`;
  const passwordHash = await bcrypt.hash(password, 12);
  const ids = {
    user: crypto.randomUUID(),
    workspace: crypto.randomUUID(),
    companies: [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()],
    monitors: Array.from({ length: 6 }, () => crypto.randomUUID()),
  };

  await sql.begin(async (transaction) => {
    await cleanupDemoWorkspace(transaction);

    await transaction`
      insert into users (
        id, first_name, last_name, email, department, username, organization, job_title, password_hash, role
      ) values (
        ${ids.user}, 'Demo', 'Operator', ${email}, 'Reliability Engineering', ${username},
        'Northstar Labs', 'Platform Operations', ${passwordHash}, 'admin'
      )
    `;
    await transaction`
      insert into user_settings (
        id, user_id, notification_language, sidebar_accent, dashboard_landing_page,
        dashboard_focus, show_outage_banner, show_charts_section, time_zone, use_24_hour_clock
      ) values (
        ${crypto.randomUUID()}, ${ids.user}, 'en', 'emerald', 'dashboard',
        'all', true, true, 'Europe/Istanbul', true
      )
    `;
    await transaction`insert into workspaces (id, name) values (${ids.workspace}, ${workspaceName})`;
    await transaction`
      insert into workspace_members (workspace_id, user_id, role)
      values (${ids.workspace}, ${ids.user}, 'admin')
    `;
    await transaction`
      insert into workspace_settings (workspace_id, values_json)
      values (${ids.workspace}, ${transaction.json({
        defaultMonitorNotificationPref: "both",
        notifyOnDown: true,
        notifyOnRecovery: true,
        notifyOnStatusChange: true,
        notifyOnLatency: true,
        prolongedDowntimeEnabled: true,
        prolongedDowntimeMinutes: 120,
        alertDedupMinutes: 15,
        notificationEmailBrandName: "Northstar Operations",
        notificationEmailFooterText: "Northstar service monitoring notification",
        statusCodeAlertCodes: "500,502,503,504",
      })})
    `;

    await transaction`
      insert into companies (id, workspace_id, user_id, name, website, description)
      values
        (${ids.companies[0]}, ${ids.workspace}, ${ids.user}, 'Northstar Cloud', 'https://northstar.example', 'Customer-facing web and API services'),
        (${ids.companies[1]}, ${ids.workspace}, ${ids.user}, 'Atlas Data', 'https://atlas.example', 'Data platform and scheduled workloads'),
        (${ids.companies[2]}, ${ids.workspace}, ${ids.user}, 'Relay Edge', 'https://relay.example', 'Regional gateways and network checks')
    `;

    const now = new Date();
    const nextCheckAt = new Date("2100-01-01T00:00:00.000Z");
    const monitorRows = [
      {
        id: ids.monitors[0], name: "Customer Portal", monitorType: "http", url: "https://app.northstar.example",
        companyId: ids.companies[0], company: "Northstar Cloud", status: "up", statusCode: 200,
        uptime: "99.98%", latencyMs: 184, tags: ["Production", "Customer"], favorite: true, critical: true,
      },
      {
        id: ids.monitors[1], name: "Checkout API", monitorType: "json", url: "https://api.northstar.example/health",
        companyId: ids.companies[0], company: "Northstar Cloud", status: "up", statusCode: 200,
        uptime: "99.96%", latencyMs: 238, tags: ["Production", "API"], favorite: true, critical: true,
      },
      {
        id: ids.monitors[2], name: "Primary Database", monitorType: "postgres", url: "postgresql://db.atlas.example:5432/app",
        companyId: ids.companies[1], company: "Atlas Data", status: "up", statusCode: null,
        uptime: "100%", latencyMs: 42, tags: ["Database", "Core"], favorite: false, critical: true,
      },
      {
        id: ids.monitors[3], name: "Billing Webhook", monitorType: "http", url: "https://hooks.northstar.example/billing",
        companyId: ids.companies[0], company: "Northstar Cloud", status: "down", statusCode: 503,
        uptime: "98.72%", latencyMs: 1260, tags: ["Payments", "Webhook"], favorite: true, critical: true,
      },
      {
        id: ids.monitors[4], name: "EU Edge Gateway", monitorType: "ping", url: "edge-eu.relay.example",
        companyId: ids.companies[2], company: "Relay Edge", status: "up", statusCode: null,
        uptime: "99.99%", latencyMs: 31, tags: ["Network", "EU"], favorite: false, critical: false,
      },
      {
        id: ids.monitors[5], name: "Nightly Import", monitorType: "heartbeat", url: "heartbeat://nightly-import",
        companyId: ids.companies[1], company: "Atlas Data", status: "up", statusCode: null,
        uptime: "99.91%", latencyMs: null, tags: ["Cron", "ETL"], favorite: false, critical: false,
        pausedUntil: new Date(now.getTime() + 8 * 60 * 60 * 1000),
      },
    ];

    for (const monitor of monitorRows) {
      await transaction`
        insert into monitors (
          id, workspace_id, user_id, name, monitor_type, url, company_id, company, status, status_code,
          uptime, is_active, paused_until, publish_on_status_page, is_favorite, is_critical,
          last_checked_at, next_check_at, last_success_at, last_failure_at, latency_ms,
          notification_pref, interval_value, interval_unit, timeout, slow_response_threshold_ms,
          expected_status_codes, retries, method, tags, check_ssl_expiry, ssl_expires_at
        ) values (
          ${monitor.id}, ${ids.workspace}, ${ids.user}, ${monitor.name}, ${monitor.monitorType}, ${monitor.url},
          ${monitor.companyId}, ${monitor.company}, ${monitor.status}, ${monitor.statusCode}, ${monitor.uptime}, true,
          ${monitor.pausedUntil ?? null}, true, ${monitor.favorite}, ${monitor.critical},
          ${new Date(now.getTime() - 2 * 60 * 1000)}, ${nextCheckAt},
          ${monitor.status === "up" ? new Date(now.getTime() - 2 * 60 * 1000) : new Date(now.getTime() - 3 * 60 * 60 * 1000)},
          ${monitor.status === "down" ? new Date(now.getTime() - 27 * 60 * 1000) : null},
          ${monitor.latencyMs}, 'both', 5, 'dk', 60000, 800, '200-399', 3, 'GET', ${monitor.tags},
          ${monitor.monitorType === "http" || monitor.monitorType === "json"},
          ${monitor.monitorType === "http" || monitor.monitorType === "json" ? new Date(now.getTime() + 74 * 24 * 60 * 60 * 1000) : null}
        )
      `;
    }

    await seedChecks(transaction, ids, now);
    await seedEvents(transaction, ids, now);
    await seedDeliveries(transaction, ids, now);

    await transaction`
      insert into monitor_outages (
        id, workspace_id, monitor_id, user_id, status, started_at, last_checked_at, status_code, error_message
      ) values (
        ${crypto.randomUUID()}, ${ids.workspace}, ${ids.monitors[3]}, ${ids.user}, 'open',
        ${new Date(now.getTime() - 27 * 60 * 1000)}, ${new Date(now.getTime() - 2 * 60 * 1000)}, 503,
        'Upstream billing provider returned HTTP 503 during final verification.'
      )
    `;
    await transaction`
      insert into report_schedules (
        id, workspace_id, user_id, name, scope, cadence, template, recipient_emails,
        is_active, next_run_at, last_run_at, last_delivered_at, last_status, report_brand_name
      ) values (
        ${crypto.randomUUID()}, ${ids.workspace}, ${ids.user}, 'Weekly operations summary', 'global', 'weekly',
        'operations', ${["ops@example.test"]}, true, ${new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)},
        ${new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000)}, ${new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000)},
        'delivered', 'Northstar Operations'
      )
    `;
    await transaction`
      insert into public_status_pages (
        id, workspace_id, user_id, slug, title, summary, is_enabled
      ) values (
        ${crypto.randomUUID()}, ${ids.workspace}, ${ids.user}, ${statusSlug}, 'Northstar Service Status',
        'Live availability for Northstar customer services and supporting infrastructure.', true
      )
    `;
  });

  return {
    runId,
    username,
    email,
    password,
    workspace: workspaceName,
    dashboardUrl: "http://localhost:3000/dashboard",
    statusPageUrl: `http://localhost:3000/status/${statusSlug}`,
  };
}

async function seedChecks(transaction, ids, now) {
  for (let day = 0; day < 30; day += 1) {
    for (let sample = 0; sample < 4; sample += 1) {
      for (let monitorIndex = 0; monitorIndex < 5; monitorIndex += 1) {
        const isBillingFailure = monitorIndex === 3 && (day === 0 || day === 8 || day === 19) && sample >= 2;
        const isApiFailure = monitorIndex === 1 && day === 13 && sample === 1;
        const failed = isBillingFailure || isApiFailure;
        const baseLatency = [184, 238, 42, 410, 31][monitorIndex];
        const createdAt = new Date(now.getTime() - ((day * 24 + sample * 6) * 60 * 60 * 1000));

        await transaction`
          insert into monitor_checks (
            id, workspace_id, monitor_id, user_id, status, status_code, latency_ms, created_at
          ) values (
            ${crypto.randomUUID()}, ${ids.workspace}, ${ids.monitors[monitorIndex]}, ${ids.user},
            ${failed ? "down" : "up"}, ${monitorIndex === 2 || monitorIndex === 4 ? null : failed ? 503 : 200},
            ${failed ? baseLatency + 900 : baseLatency + ((day * 11 + sample * 17 + monitorIndex * 7) % 95)}, ${createdAt}
          )
        `;
      }
    }
  }
}

async function seedEvents(transaction, ids, now) {
  const events = [
    [ids.monitors[3], "failure", "Billing Webhook failed final verification", 503, 1260, 27],
    [ids.monitors[1], "recovery", "Checkout API recovered after two failed checks", 200, 251, 8 * 60],
    [ids.monitors[1], "failure", "Checkout API returned an unavailable response", 503, 1094, 8 * 60 + 18],
    [ids.monitors[0], "recovery", "Customer Portal recovered", 200, 191, 3 * 24 * 60],
    [ids.monitors[0], "failure", "Customer Portal timed out during verification", null, 60000, 3 * 24 * 60 + 14],
  ];

  for (const [monitorId, eventType, message, statusCode, latencyMs, minutesAgo] of events) {
    await transaction`
      insert into monitor_events (
        id, workspace_id, monitor_id, user_id, event_type, status, status_code, latency_ms, message, created_at
      ) values (
        ${crypto.randomUUID()}, ${ids.workspace}, ${monitorId}, ${ids.user}, ${eventType},
        ${eventType === "failure" ? "down" : "up"}, ${statusCode}, ${latencyMs}, ${message},
        ${new Date(now.getTime() - Number(minutesAgo) * 60 * 1000)}
      )
    `;
  }
}

async function seedDeliveries(transaction, ids, now) {
  const deliveries = [
    [ids.monitors[3], "email", "failure", "on-call@example.test", "delivered", 1, 250, null, 25],
    [ids.monitors[3], "telegram", "failure", "Northstar on-call", "delivered", 1, 200, null, 24],
    [ids.monitors[1], "email", "recovery", "platform@example.test", "delivered", 1, 250, null, 8 * 60],
    [ids.monitors[1], "webhook", "recovery", "https://automation.example.test/sentrovia", "delivered", 1, 202, null, 8 * 60 - 2],
    [ids.monitors[0], "discord", "recovery", "Northstar operations", "delivered", 1, 204, null, 3 * 24 * 60],
    [ids.monitors[0], "email", "failure", "platform@example.test", "delivered", 1, 250, null, 3 * 24 * 60 + 15],
    [ids.monitors[3], "webhook", "failure", "https://automation.example.test/sentrovia", "failed", 5, 503, "Endpoint returned HTTP 503 after five attempts.", 4 * 24 * 60],
    [null, "email", "report", "ops@example.test", "delivered", 1, 250, null, 5 * 24 * 60],
  ];

  for (const [monitorId, channel, kind, destination, status, attempts, responseCode, errorMessage, minutesAgo] of deliveries) {
    const createdAt = new Date(now.getTime() - Number(minutesAgo) * 60 * 1000);
    await transaction`
      insert into delivery_events (
        id, workspace_id, user_id, monitor_id, channel, kind, destination, payload_json,
        status, attempts, response_code, error_message, last_attempt_at, delivered_at, dead_lettered_at, created_at
      ) values (
        ${crypto.randomUUID()}, ${ids.workspace}, ${ids.user}, ${monitorId}, ${channel}, ${kind}, ${destination},
        ${JSON.stringify({ demo: true, event: kind, monitorId })}, ${status}, ${attempts}, ${responseCode}, ${errorMessage},
        ${createdAt}, ${status === "delivered" ? createdAt : null}, ${status === "failed" ? createdAt : null}, ${createdAt}
      )
    `;
  }
}

async function cleanupDemoWorkspace(executor = sql) {
  await executor`delete from workspaces where name = ${workspaceName}`;
  await executor`delete from users where lower(email) = ${email} and lower(username) = ${username}`;
}

function normalizeRunId(value) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 36);
  if (normalized.length < 8) {
    throw new Error("SENTROVIA_DEMO_RUN_ID must contain at least eight alphanumeric characters.");
  }
  return normalized;
}
