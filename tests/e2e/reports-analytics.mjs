import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";

import nextEnv from "@next/env";
import bcrypt from "bcryptjs";
import { chromium } from "playwright";
import postgres from "postgres";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const baseUrl = process.env.SENTROVIA_E2E_BASE_URL ?? "http://localhost:3000";
const databasePort = Number(process.env.SENTROVIA_E2E_POSTGRES_PORT ?? 5433);
const runId = crypto.randomBytes(8).toString("hex");
const username = `reports_${runId}`;
const password = `Sentrovia-${crypto.randomBytes(18).toString("base64url")}a1!`;

const ids = {
  user: crypto.randomUUID(),
  workspace: crypto.randomUUID(),
  companyAlpha: crypto.randomUUID(),
  companyBeta: crypto.randomUUID(),
  monitorAlpha: crypto.randomUUID(),
  monitorBeta: crypto.randomUUID(),
  deletedMonitor: crypto.randomUUID(),
};

const sql = postgres({
  host: process.env.SENTROVIA_E2E_POSTGRES_HOST ?? "127.0.0.1",
  port: databasePort,
  database: process.env.POSTGRES_DB,
  username: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  max: 1,
  prepare: false,
});

let browser;

try {
  await seedReportsWorkspace();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const runtimeErrors = [];
  const analyticsResponses = [];

  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => runtimeErrors.push(`page: ${error.message}`));
  page.on("response", async (response) => {
    if (!response.url().includes("/api/reports/analytics")) return;
    let body = null;
    try {
      body = await response.json();
    } catch {
      // A non-JSON response is retained as null and fails the assertions below.
    }
    analyticsResponses.push({ status: response.status(), url: response.url(), body });
  });

  await page.goto(`${baseUrl}/login?next=%2Freports`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="identifier"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await Promise.all([
    page.waitForURL(`${baseUrl}/reports`, { timeout: 15_000 }),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);

  await page.getByRole("heading", { name: "Reliability over time" }).waitFor();
  await waitForSuccessfulAnalyticsResponse(analyticsResponses, 1);
  assertSummary(latestSuccessfulReport(analyticsResponses), {
    monitorCount: 2,
    totalChecks: 20,
    upChecks: 18,
    failureEvents: 2,
    impactedMonitors: 1,
  });
  await assertVisibleAnalytics(page);

  const companyExclusion = await openExclusion(page, "companies");
  await page.getByRole("checkbox", { name: /Alpha Company/ }).check();
  await companyExclusion.locator("summary").click();
  await refreshAnalytics(page, analyticsResponses);
  assertSummary(latestSuccessfulReport(analyticsResponses), {
    monitorCount: 1,
    totalChecks: 10,
    upChecks: 10,
    failureEvents: 0,
    impactedMonitors: 0,
  });
  await page.getByText("No failed checks were recorded in this period.").waitFor();

  await page.getByRole("button", { name: "Clear exclusions" }).click();
  await refreshAnalytics(page, analyticsResponses);
  assert.equal(latestSuccessfulReport(analyticsResponses).summary.failureEvents, 2);
  await fs.mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/reports-analytics-desktop.png", fullPage: true });

  await page.locator("#analytics-monitor").click();
  await page.getByRole("option", { name: /Alpha API/ }).click();
  await refreshAnalytics(page, analyticsResponses);
  assert.equal(latestSuccessfulReport(analyticsResponses).monitorName, "Alpha API");

  let deletionInjected = false;
  await page.route("**/api/monitors**", async (route) => {
    if (deletionInjected) {
      await route.continue();
      return;
    }
    deletionInjected = true;
    const response = await route.fetch();
    await sql`update monitors set deleted_at = now(), is_active = false where id = ${ids.monitorAlpha}`;
    await route.fulfill({ response });
  });
  const previousResponseCount = analyticsResponses.length;
  await page.getByRole("button", { name: "Refresh" }).click();
  await waitForSuccessfulAnalyticsResponse(analyticsResponses, previousResponseCount + 2);
  assert.equal(analyticsResponses.at(-2)?.status, 404);
  assert.equal(analyticsResponses.at(-1)?.status, 200);
  assert.equal(latestSuccessfulReport(analyticsResponses).summary.monitorCount, 1);
  await page.getByText(/Analytics now include all remaining monitors/).waitFor();
  assert.match(await page.locator("#analytics-monitor").innerText(), /All monitors/);

  await page.locator("#analytics-period").click();
  await page.getByRole("option", { name: "Custom dates" }).click();
  await page.locator("#analytics-from").fill("2026-09-10");
  await page.locator("#analytics-through").fill("2026-09-09");
  await page.getByText("Choose both dates, with the start on or before the end date.").waitFor();
  assert.equal(await page.getByRole("button", { name: "Refresh" }).isDisabled(), true);

  await page.screenshot({ path: "test-results/reports-analytics.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
    "The reports page should not overflow the mobile viewport."
  );
  await page.screenshot({ path: "test-results/reports-analytics-mobile.png", fullPage: true });
  const unexpectedRuntimeErrors = runtimeErrors.filter((error) =>
    !(
      error.includes("Failed to load resource: the server responded with a status of 404")
      && analyticsResponses.some((response) => response.status === 404)
    )
  );
  assert.deepEqual(unexpectedRuntimeErrors, []);

  process.stdout.write(`${JSON.stringify({
    ok: true,
    analyticsRequests: analyticsResponses.length,
    retryStatuses: analyticsResponses.slice(-2).map((response) => response.status),
    screenshots: [
      "test-results/reports-analytics-desktop.png",
      "test-results/reports-analytics.png",
      "test-results/reports-analytics-mobile.png",
    ],
  })}\n`);
} finally {
  await browser?.close();
  await cleanupReportsWorkspace();
  await sql.end({ timeout: 5 });
}

async function seedReportsWorkspace() {
  const passwordHash = await bcrypt.hash(password, 12);
  await sql.begin(async (transaction) => {
    await transaction`
      insert into users (id, first_name, last_name, email, department, username, password_hash, role)
      values (${ids.user}, 'Reports', 'QA', ${`${username}@example.test`}, 'Automated testing', ${username}, ${passwordHash}, 'admin')
    `;
    await transaction`insert into user_settings (id, user_id) values (${crypto.randomUUID()}, ${ids.user})`;
    await transaction`insert into workspaces (id, name) values (${ids.workspace}, ${`Reports QA ${runId}`})`;
    await transaction`
      insert into workspace_members (workspace_id, user_id, role)
      values (${ids.workspace}, ${ids.user}, 'admin')
    `;
    await transaction`
      insert into companies (id, workspace_id, user_id, name)
      values
        (${ids.companyAlpha}, ${ids.workspace}, ${ids.user}, 'Alpha Company'),
        (${ids.companyBeta}, ${ids.workspace}, ${ids.user}, 'Beta Company')
    `;
    await transaction`
      insert into monitors (id, workspace_id, user_id, name, url, company_id, company, status, is_active, tags, next_check_at)
      values
        (${ids.monitorAlpha}, ${ids.workspace}, ${ids.user}, 'Alpha API', 'https://alpha.example.test', ${ids.companyAlpha}, 'Alpha Company', 'down', true, ${["Core", "API"]}, '2100-01-01T00:00:00Z'),
        (${ids.monitorBeta}, ${ids.workspace}, ${ids.user}, 'Beta Web', 'https://beta.example.test', ${ids.companyBeta}, 'Beta Company', 'up', true, ${["Customer"]}, '2100-01-01T00:00:00Z'),
        (${ids.deletedMonitor}, ${ids.workspace}, ${ids.user}, 'Deleted Monitor', 'https://deleted.example.test', ${ids.companyAlpha}, 'Alpha Company', 'down', false, ${["Core"]}, '2100-01-01T00:00:00Z')
    `;
    await transaction`update monitors set deleted_at = now() where id = ${ids.deletedMonitor}`;

    const checks = [];
    for (let index = 0; index < 10; index += 1) {
      checks.push({
        id: crypto.randomUUID(),
        monitorId: ids.monitorAlpha,
        status: index < 8 ? "up" : "down",
        statusCode: index < 8 ? 200 : 500,
        latencyMs: 120 + index * 15,
        createdAt: new Date(Date.now() - index * 8 * 60 * 60 * 1000),
      });
      checks.push({
        id: crypto.randomUUID(),
        monitorId: ids.monitorBeta,
        status: "up",
        statusCode: 200,
        latencyMs: 80 + index * 5,
        createdAt: new Date(Date.now() - index * 9 * 60 * 60 * 1000),
      });
    }
    checks.push({
      id: crypto.randomUUID(),
      monitorId: ids.deletedMonitor,
      status: "down",
      statusCode: 503,
      latencyMs: 900,
      createdAt: new Date(),
    });

    for (const check of checks) {
      await transaction`
        insert into monitor_checks (id, workspace_id, monitor_id, user_id, status, status_code, latency_ms, created_at)
        values (${check.id}, ${ids.workspace}, ${check.monitorId}, ${ids.user}, ${check.status}, ${check.statusCode}, ${check.latencyMs}, ${check.createdAt})
      `;
    }
  });
}

async function cleanupReportsWorkspace() {
  await sql`delete from workspaces where id = ${ids.workspace}`;
  await sql`delete from users where id = ${ids.user}`;
}

async function refreshAnalytics(page, responses) {
  const previousCount = responses.length;
  await page.getByRole("button", { name: "Refresh" }).click();
  await waitForSuccessfulAnalyticsResponse(responses, previousCount + 1);
}

async function waitForSuccessfulAnalyticsResponse(responses, expectedCount) {
  assert.ok(expectedCount > 0);
  const timeoutAt = Date.now() + 15_000;
  while (Date.now() < timeoutAt) {
    if (responses.length >= expectedCount && responses.at(-1)?.status === 200) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail(`Timed out waiting for analytics response ${expectedCount}; received ${responses.length}.`);
}

function latestSuccessfulReport(responses) {
  const response = [...responses].reverse().find((candidate) => candidate.status === 200);
  assert.ok(response?.body?.report, "Expected the analytics endpoint to return a report.");
  return response.body.report;
}

function assertSummary(report, expected) {
  for (const [key, value] of Object.entries(expected)) {
    assert.equal(report.summary[key], value, `Unexpected summary.${key}`);
  }
}

async function assertVisibleAnalytics(page) {
  await page.getByRole("img", { name: "Failed check counts by day" }).waitFor();
  await page.getByRole("img", { name: "Daily p95 latency in milliseconds by day" }).waitFor();
  await page.getByRole("img", { name: /failed checks distributed across \d+ monitor groups/ }).waitFor();
  await page.getByText("Fleet reliability bands", { exact: true }).waitFor();
  await page.getByText("HTTP response mix", { exact: true }).waitFor();
  await page.getByText("Monitor failure ranking", { exact: true }).waitFor();
}

async function openExclusion(page, group) {
  const details = page.locator("details").filter({ hasText: `Exclude ${group}` });
  await details.locator("summary").click();
  return details;
}
