import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseURL = process.env.SENTROVIA_E2E_BASE_URL ?? "http://localhost:3000";
const username = process.env.SENTROVIA_E2E_USERNAME;
const password = process.env.SENTROVIA_E2E_PASSWORD;
const routes = [
  "/dashboard",
  "/monitoring",
  "/companies",
  "/delivery",
  "/reports",
  "/settings",
  "/logs",
  "/members",
  "/profile",
  "/help",
  "/about",
];

if (!username || !password) {
  throw new Error("Set SENTROVIA_E2E_USERNAME and SENTROVIA_E2E_PASSWORD for an existing admin account.");
}

await waitForApplication();
const browser = await chromium.launch({ headless: true });
const adminContext = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
const cleanup = {
  companyId: null,
  memberIds: [],
  monitorId: null,
  publicStatusPageIds: [],
  reportScheduleIds: [],
};

try {
  const page = await adminContext.newPage();
  const browserErrors = collectBrowserErrors(page);
  await verifyAuthentication(page);
  const routeResults = await verifyApplicationRoutes(page);
  const mobileResult = await verifyMobileMonitoring(page);
  const settingsResult = await verifySlowResponseSettings(adminContext.request);
  const workflowResult = await verifyCrudAndAuthorization(adminContext, cleanup);
  await verifyStoredTextRendering(page, workflowResult.companyName);
  const apiResults = await verifyReadApis(adminContext.request);
  const boundaryResults = await verifyInputBoundaries(adminContext.request);
  await cleanupResources(adminContext.request, cleanup);
  cleanup.companyId = null;
  cleanup.memberIds = [];
  cleanup.monitorId = null;
  cleanup.publicStatusPageIds = [];
  cleanup.reportScheduleIds = [];
  await verifyLogout(page);

  assert.deepEqual(browserErrors, [], `Browser errors detected:\n${browserErrors.join("\n")}`);
  console.log(JSON.stringify({ routeResults, mobileResult, settingsResult, workflowResult, apiResults, boundaryResults }, null, 2));
} finally {
  await cleanupResources(adminContext.request, cleanup);
  await adminContext.close();
  await browser.close();
}

async function verifySlowResponseSettings(request) {
  const currentResponse = await request.get("/api/settings");
  assert.equal(currentResponse.status(), 200);
  const current = (await currentResponse.json()).settings;
  const payload = {
    ...current,
    monitoring: {
      ...current.monitoring,
      timeout: 50_000,
      slowResponseThresholdMs: 20_000,
    },
    notifications: {
      ...current.notifications,
      slowResponseEmailSubjectTemplate: "Workspace slow {domain} {latency_ms}/{hard_timeout_ms}",
      slowResponseEmailBodyTemplate: "State: {event_state}\nResponse: {latency_ms}ms",
      slowResponseTelegramTemplate: "SLOW {domain} {latency_ms}ms",
    },
  };
  const saveResponse = await request.patch("/api/settings", { data: payload });
  assert.equal(saveResponse.status(), 200);
  const saved = (await saveResponse.json()).settings;
  assert.equal(saved.monitoring.timeout, 50_000);
  assert.equal(saved.monitoring.slowResponseThresholdMs, 20_000);
  assert.equal(saved.notifications.slowResponseEmailSubjectTemplate, payload.notifications.slowResponseEmailSubjectTemplate);
  assert.equal(saved.notifications.slowResponseTelegramTemplate, payload.notifications.slowResponseTelegramTemplate);

  const reloadResponse = await request.get("/api/settings");
  assert.equal(reloadResponse.status(), 200);
  const reloaded = (await reloadResponse.json()).settings;
  assert.equal(reloaded.monitoring.slowResponseThresholdMs, 20_000);
  assert.equal(reloaded.notifications.slowResponseEmailBodyTemplate, payload.notifications.slowResponseEmailBodyTemplate);

  const defaultedPayload = buildMonitorPayload(null, `defaults-${Date.now().toString(36)}`);
  delete defaultedPayload.timeout;
  delete defaultedPayload.slowResponseThresholdMs;
  defaultedPayload.companyId = "";
  defaultedPayload.isActive = false;
  defaultedPayload.notificationPref = "none";
  const monitorResponse = await request.post("/api/monitors", { data: defaultedPayload });
  if (monitorResponse.status() !== 201) {
    throw new Error(`Default monitor creation returned HTTP ${monitorResponse.status()}: ${await monitorResponse.text()}`);
  }
  const defaultedMonitor = (await monitorResponse.json()).monitor;
  try {
    assert.equal(defaultedMonitor.timeout, 50_000);
    assert.equal(defaultedMonitor.slowResponseThresholdMs, 20_000);
  } finally {
    const deleteResponse = await request.delete(`/api/monitors/${defaultedMonitor.id}`);
    assert.equal(deleteResponse.status(), 200);
  }

  return { saved: true, reloaded: true, inheritedByMonitor: true, thresholdMs: 20_000, hardTimeoutMs: 50_000 };
}

function collectBrowserErrors(page) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 500) errors.push(`http: ${response.status()} ${response.url()}`);
  });
  return errors;
}

async function verifyAuthentication(page) {
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  assert.equal(new URL(page.url()).pathname, "/login");
  assert.equal(new URL(page.url()).searchParams.get("next"), "/dashboard");

  await page.locator('input[name="identifier"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  const loginResponse = page.waitForResponse((response) => response.url().endsWith("/api/auth/login"));
  await page.locator('button[type="submit"]').click();
  assert.equal((await loginResponse).status(), 200);
  await page.waitForURL((url) => url.pathname !== "/login", { timeout: 20_000 });
  await page.waitForTimeout(1_000);
}

async function verifyApplicationRoutes(page) {
  const results = [];
  for (const route of routes) {
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(300);
    const layout = await page.evaluate(() => ({
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      text: document.body.innerText.slice(0, 500),
    }));
    assert.equal(response?.status(), 200, `${route} did not return HTTP 200`);
    assert.ok(layout.scrollWidth <= layout.width + 1, `${route} overflows the desktop viewport`);
    assert.doesNotMatch(layout.text, /application error|internal server error|something went wrong/i);
    results.push({ route, status: response?.status(), overflow: false });
  }
  return results;
}

async function verifyMobileMonitoring(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/monitoring", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  const dimensions = await page.evaluate(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(dimensions.scrollWidth <= dimensions.width + 1, "Monitoring overflows the mobile viewport");
  return { ...dimensions, overflow: false };
}

async function verifyCrudAndAuthorization(adminContext, cleanupState) {
  const suffix = Date.now().toString(36);
  const company = await createCompany(adminContext.request, suffix);
  cleanupState.companyId = company.id;
  const monitor = await createAndTestMonitor(adminContext.request, company.id, suffix);
  cleanupState.monitorId = monitor.id;
  const publicStatusPages = await verifyPublicStatusPages(adminContext.request, company.id, suffix, cleanupState);
  const reportSchedules = await verifyReportScheduleCrud(adminContext.request, company.id, suffix, cleanupState);
  const viewer = await createMember(adminContext.request, suffix, "viewer");
  const operator = await createMember(adminContext.request, suffix, "operator");
  cleanupState.memberIds.push(viewer.id, operator.id);
  const previewStatuses = await verifyPreviews(adminContext.request, monitor.id, monitor.payload);
  const viewerMutationStatus = await verifyViewerCannotMutate(viewer.username, viewer.password);
  const operatorIsolationStatus = await verifyOperatorIsolation(operator, monitor.id, monitor.payload);
  return {
    companyCreated: true,
    companyName: company.name,
    monitorCreated: true,
    monitorTested: true,
    publicStatusPages,
    reportSchedules,
    previewStatuses,
    viewerMutationStatus,
    operatorIsolationStatus,
  };
}

async function verifyReportScheduleCrud(request, companyId, suffix, cleanupState) {
  const payload = {
    name: `Docker E2E schedule ${suffix}`,
    scope: "company",
    cadence: "weekly",
    template: "operations",
    companyId,
    recipientEmails: [`reports-${suffix}@example.test`],
    isActive: false,
    nextRunAt: null,
    deliveryDetailLevel: "standard",
    includeOutageSummary: true,
    includeMonitorBreakdown: true,
    emailSubjectTemplate: "Docker {report_title}",
    emailIntroTemplate: null,
    reportBrandName: "Docker E2E",
  };
  const createResponse = await request.post("/api/reports", { data: payload });
  assert.equal(createResponse.status(), 201);
  const created = (await createResponse.json()).schedule;
  cleanupState.reportScheduleIds.push(created.id);
  assert.equal(created.companyId, companyId);
  assert.deepEqual(created.recipientEmails, payload.recipientEmails);

  const updateResponse = await request.patch(`/api/reports/${created.id}`, {
    data: { name: `${payload.name} updated`, isActive: false },
  });
  assert.equal(updateResponse.status(), 200);
  assert.equal((await updateResponse.json()).schedule.name, `${payload.name} updated`);

  const duplicateResponse = await request.post(`/api/reports/${created.id}/duplicate`);
  assert.equal(duplicateResponse.status(), 201);
  const duplicate = (await duplicateResponse.json()).schedule;
  cleanupState.reportScheduleIds.push(duplicate.id);
  assert.notEqual(duplicate.id, created.id);
  assert.equal(duplicate.companyId, companyId);

  const listResponse = await request.get("/api/reports");
  assert.equal(listResponse.status(), 200);
  const listedIds = new Set((await listResponse.json()).schedules.map((schedule) => schedule.id));
  assert.equal(listedIds.has(created.id), true);
  assert.equal(listedIds.has(duplicate.id), true);

  for (const scheduleId of [duplicate.id, created.id]) {
    const deleteResponse = await request.delete(`/api/reports/${scheduleId}`);
    assert.equal(deleteResponse.status(), 200);
    cleanupState.reportScheduleIds = cleanupState.reportScheduleIds.filter((id) => id !== scheduleId);
  }

  return { created: true, updated: true, duplicated: true, listed: true, deleted: 2 };
}

async function verifyPreviews(request, monitorId, monitorPayload) {
  const report = await request.post("/api/reports/preview", {
    data: {
      scope: "global",
      cadence: "weekly",
      template: "operations",
      companyId: null,
      deliveryDetailLevel: "standard",
      includeOutageSummary: true,
      includeMonitorBreakdown: true,
      reportBrandName: "Docker E2E",
    },
  });
  assert.equal(report.status(), 200);
  assert.ok((await report.json()).report);
  const notification = await request.post("/api/notifications/preview", {
    data: { monitorId, scenario: "http-500", payload: monitorPayload },
  });
  assert.equal(notification.status(), 200);
  const notificationBody = await notification.json();
  assert.ok(notificationBody.preview);
  assert.ok(notificationBody.decision);
  const slowNotification = await request.post("/api/notifications/preview", {
    data: { monitorId, scenario: "slow-response", payload: monitorPayload },
  });
  assert.equal(slowNotification.status(), 200);
  const slowNotificationBody = await slowNotification.json();
  assert.equal(slowNotificationBody.preview.subject, "Slow web: 4500/5000");
  assert.match(slowNotificationBody.preview.textBody, /ONLINE · SLOW/);
  assert.match(slowNotificationBody.preview.htmlBody, /Hard timeout/);
  assert.match(slowNotificationBody.preview.telegramBody, /SLOW 4500ms/);
  assert.equal(slowNotificationBody.decision.wouldNotify, true);
  return { report: 200, notification: 200, slowNotification: 200 };
}

async function createCompany(request, suffix) {
  const name = `<img src=x onerror=alert(1)> Docker E2E ${suffix}`;
  const response = await request.post("/api/companies", {
    data: {
      name,
      description: '<script>alert("stored-xss")</script>',
      notificationEmailRecipients: `ops-${suffix}@example.test; NOC-${suffix}@example.test`,
      telegramBotToken: `123456:${suffix}-docker-e2e-token`,
      telegramChatId: "-1001234567890",
      isActive: true,
      userId: "00000000-0000-0000-0000-000000000000",
      role: "admin",
    },
  });
  assert.equal(response.status(), 201);
  const company = (await response.json()).company;
  assert.notEqual(company.userId, "00000000-0000-0000-0000-000000000000");
  assert.deepEqual(company.notificationEmailRecipients, [
    `ops-${suffix}@example.test`,
    `noc-${suffix}@example.test`,
  ]);
  assert.equal(company.telegramBotToken, "");
  assert.equal(company.telegramBotTokenConfigured, true);
  assert.equal(company.telegramChatId, "-1001234567890");
  const duplicate = await request.post("/api/companies", {
    data: { name, description: "Duplicate", isActive: true },
  });
  await assertHttpStatus(duplicate, 409);
  return company;
}

async function createAndTestMonitor(request, companyId, suffix) {
  const payload = buildMonitorPayload(companyId, suffix);
  const invalidResponse = await request.post("/api/monitors", {
    data: { ...payload, intervalValue: 0 },
  });
  await assertHttpStatus(invalidResponse, 400);
  const createResponse = await request.post("/api/monitors", { data: payload });
  assert.equal(createResponse.status(), 201);
  const monitor = (await createResponse.json()).monitor;
  assert.notEqual(monitor.userId, "00000000-0000-0000-0000-000000000000");
  assert.notEqual(monitor.status, "up");
  assert.equal(monitor.notificationPref, "both");
  assert.equal(monitor.notifEmail, `monitor-${suffix}@example.test`);
  assert.equal(monitor.telegramBotToken, `123456:${suffix}-monitor-token`);
  assert.equal(monitor.telegramChatId, "-1009876543210");
  assert.equal(monitor.telegramTemplate, "Monitor {domain} is {event_state}");
  assert.equal(monitor.emailSubject, "[{event_state}] {domain}");
  assert.equal(monitor.slowResponseEmailSubject, "Slow {domain}: {latency_ms}/{hard_timeout_ms}");
  assert.equal(monitor.slowResponseEmailBody, "State: ONLINE · SLOW\nResponse: {latency_ms}ms\nHard timeout: {hard_timeout_ms}ms");
  assert.equal(monitor.slowResponseTelegramTemplate, "SLOW {latency_ms}ms / {hard_timeout_ms}ms");
  const duplicateResponse = await request.post("/api/monitors", { data: payload });
  await assertHttpStatus(duplicateResponse, 409);

  const updateResponse = await request.patch(`/api/monitors/${monitor.id}`, {
    data: { ...payload, name: `${payload.name} updated` },
  });
  await assertHttpStatus(updateResponse, 200);
  const testResponse = await request.post("/api/monitors/test", {
    data: { monitorId: monitor.id, payload },
  });
  assert.equal(testResponse.status(), 200);
  assert.equal((await testResponse.json()).result.ok, true);
  return { ...monitor, payload };
}

function buildMonitorPayload(companyId, suffix) {
  return {
    name: `Docker health ${suffix}`,
    monitorType: "http",
    url: `http://web:3000/api/health?e2e=${suffix}`,
    companyId,
    notificationPref: "both",
    notificationLanguage: "default",
    notifEmail: `monitor-${suffix}@example.test`,
    telegramBotToken: `123456:${suffix}-monitor-token`,
    telegramChatId: "-1009876543210",
    telegramTemplate: "Monitor {domain} is {event_state}",
    emailSubject: "[{event_state}] {domain}",
    emailBody: "Monitor: {url_link}\nStatus: {status_label}",
    slowResponseEmailSubject: "Slow {domain}: {latency_ms}/{hard_timeout_ms}",
    slowResponseEmailBody: "State: ONLINE · SLOW\nResponse: {latency_ms}ms\nHard timeout: {hard_timeout_ms}ms",
    slowResponseTelegramTemplate: "SLOW {latency_ms}ms / {hard_timeout_ms}ms",
    intervalValue: 5,
    intervalUnit: "dk",
    timeout: 5_000,
    slowResponseThresholdMs: 2_000,
    slowResponseAlertsEnabled: true,
    expectedStatusCodes: "200",
    retries: 2,
    method: "GET",
    tags: ["docker-e2e"],
    renotifyCount: null,
    maxRedirects: 2,
    ipFamily: "auto",
    checkSslExpiry: false,
    ignoreSslErrors: false,
    cacheBuster: false,
    saveErrorPages: false,
    saveSuccessPages: false,
    responseMaxLength: 2_000,
    sendOutageScreenshot: false,
    isActive: true,
    publishOnStatusPage: true,
    userId: "00000000-0000-0000-0000-000000000000",
    status: "up",
    consecutiveFailures: -10,
  };
}

async function verifyPublicStatusPages(request, companyId, suffix, cleanupState) {
  const payloads = [
    {
      companyId,
      slug: `docker-company-${suffix}`,
      title: `Company status ${suffix}`,
      summary: "Company-scoped status page",
      isEnabled: true,
    },
    {
      companyId: null,
      slug: `docker-workspace-${suffix}`,
      title: `Workspace status ${suffix}`,
      summary: "Workspace-scoped status page",
      isEnabled: true,
    },
  ];
  const createdPages = [];
  for (const payload of payloads) {
    const response = await request.post("/api/public-status-pages", { data: payload });
    assert.equal(response.status(), 201);
    const page = (await response.json()).page;
    cleanupState.publicStatusPageIds.push(page.id);
    createdPages.push(page);
  }

  const listResponse = await request.get("/api/public-status-pages");
  assert.equal(listResponse.status(), 200);
  const listedIds = new Set((await listResponse.json()).pages.map((page) => page.id));
  assert.ok(createdPages.every((page) => listedIds.has(page.id)));

  const publicResponse = await request.get(`/status/${createdPages[0].slug}`);
  assert.equal(publicResponse.status(), 200);
  assert.match(await publicResponse.text(), new RegExp(payloads[0].title));

  const updateResponse = await request.patch(`/api/public-status-pages/${createdPages[0].id}`, {
    data: { ...payloads[0], summary: "Updated company status summary" },
  });
  assert.equal(updateResponse.status(), 200);
  assert.equal((await updateResponse.json()).page.summary, "Updated company status summary");
  return { created: 2, companyScoped: true, workspaceScoped: true, publicRoute: 200, updated: true };
}

async function createMember(request, suffix, role) {
  const credentials = {
    username: `docker-${role}-${suffix}`,
    password: `Docker-${role}-2026!Secure`,
  };
  const response = await request.post("/api/members", {
    data: {
      firstName: "Docker",
      lastName: role === "viewer" ? "Viewer" : "Operator",
      email: `${credentials.username}@example.test`,
      department: "QA",
      ...credentials,
      confirmPassword: credentials.password,
      role,
    },
  });
  assert.equal(response.status(), 201);
  return { ...(await response.json()).member, ...credentials };
}

async function verifyViewerCannotMutate(identifier, viewerPassword) {
  const context = await browser.newContext({ baseURL });
  try {
    const login = await context.request.post("/api/auth/login", {
      data: { identifier, password: viewerPassword },
    });
    await assertHttpStatus(login, 200);
    const mutation = await context.request.post("/api/worker", { data: { action: "stop" } });
    await assertHttpStatus(mutation, 403);
    return mutation.status();
  } finally {
    await context.close();
  }
}

async function verifyOperatorIsolation(operator, monitorId, monitorPayload) {
  const context = await browser.newContext({ baseURL });
  try {
    const login = await context.request.post("/api/auth/login", {
      data: { identifier: operator.username, password: operator.password },
    });
    await assertHttpStatus(login, 200);
    const list = await context.request.get("/api/monitors");
    assert.equal(list.status(), 200);
    assert.equal((await list.json()).monitors.length, 0);
    const mutation = await context.request.patch(`/api/monitors/${monitorId}`, {
      data: { ...monitorPayload, name: "Unauthorized cross-user update" },
    });
    await assertHttpStatus(mutation, 404);
    return mutation.status();
  } finally {
    await context.close();
  }
}

async function verifyStoredTextRendering(page, companyName) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/companies", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  assert.ok((await page.locator("body").innerText()).includes(companyName));
  const executable = await page.locator('img[onerror*="alert"], script').evaluateAll((elements) =>
    elements.some((element) => element.outerHTML.includes("stored-xss") || element.outerHTML.includes("onerror=alert"))
  );
  assert.equal(executable, false);
}

async function verifyReadApis(request) {
  const endpoints = [
    "/api/auth/session",
    "/api/monitors",
    "/api/monitors/history",
    "/api/monitors/config/export",
    "/api/companies",
    "/api/reports",
    "/api/delivery",
    "/api/settings",
    "/api/logs",
    "/api/system",
    "/api/worker",
  ];
  const results = {};
  for (const endpoint of endpoints) {
    const response = await request.get(endpoint);
    assert.equal(response.status(), 200, `${endpoint} did not return HTTP 200`);
    await response.body();
    results[endpoint] = response.status();
  }
  return results;
}

async function verifyInputBoundaries(request) {
  const malformed = await request.fetch("/api/companies", {
    method: "POST",
    headers: { "content-type": "application/json" },
    data: "{",
  });
  const crossOrigin = await request.fetch("/api/companies", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://attacker.example.test",
      "sec-fetch-site": "cross-site",
    },
    data: JSON.stringify({ name: "Blocked", isActive: true }),
  });
  const oversized = await request.post("/api/companies", {
    data: { name: "A".repeat(130_000), isActive: true },
  });
  const crossOriginMutationCount = await verifyCrossOriginMutationGuards(request);
  await assertHttpStatus(malformed, 400);
  await assertHttpStatus(crossOrigin, 403);
  await assertHttpStatus(oversized, 413);
  return { malformed: 400, crossOrigin: 403, crossOriginMutationCount, oversized: 413 };
}

async function verifyCrossOriginMutationGuards(request) {
  const missingId = "00000000-0000-0000-0000-000000000000";
  const mutations = [
    { method: "POST", url: "/api/reports", data: {} },
    { method: "POST", url: "/api/reports/preview", data: {} },
    { method: "POST", url: "/api/reports/send", data: {} },
    { method: "PATCH", url: `/api/reports/${missingId}`, data: {} },
    { method: "DELETE", url: `/api/reports/${missingId}`, data: null },
    { method: "POST", url: `/api/reports/${missingId}/duplicate`, data: {} },
    { method: "POST", url: `/api/reports/${missingId}/send`, data: {} },
    { method: "POST", url: "/api/companies/restore", data: { ids: [missingId] } },
    { method: "POST", url: "/api/monitors/restore", data: { ids: [missingId] } },
  ];

  for (const mutation of mutations) {
    const response = await request.fetch(mutation.url, {
      method: mutation.method,
      headers: {
        "content-type": "application/json",
        origin: "https://attacker.example.test",
        "sec-fetch-site": "cross-site",
      },
      data: mutation.data === null ? undefined : JSON.stringify(mutation.data),
    });
    await assertHttpStatus(response, 403, `${mutation.method} ${mutation.url} accepted a cross-origin request`);
  }

  return mutations.length;
}

async function verifyLogout(page) {
  const response = await page.request.post("/api/auth/logout", { data: {} });
  await assertHttpStatus(response, 200);
  const protectedResponse = await page.request.get("/api/monitors", { maxRedirects: 0 });
  await assertHttpStatus(protectedResponse, 307);
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
}

async function cleanupResources(request, cleanupState) {
  for (const scheduleId of cleanupState.reportScheduleIds) {
    const response = await request.delete(`/api/reports/${scheduleId}`);
    await assertHttpStatus(response, 200, "E2E report schedule cleanup failed");
  }
  cleanupState.reportScheduleIds = [];
  for (const pageId of cleanupState.publicStatusPageIds) {
    const response = await request.delete(`/api/public-status-pages/${pageId}`);
    await assertHttpStatus(response, 200, "E2E public status page cleanup failed");
  }
  cleanupState.publicStatusPageIds = [];
  if (cleanupState.monitorId) {
    const response = await request.delete(`/api/monitors/${cleanupState.monitorId}`);
    await assertHttpStatus(response, 200, "E2E monitor cleanup failed");
    cleanupState.monitorId = null;
  }
  if (cleanupState.companyId) {
    const response = await request.delete(`/api/companies/${cleanupState.companyId}`);
    await assertHttpStatus(response, 200, "E2E company cleanup failed");
    cleanupState.companyId = null;
  }
  if (cleanupState.memberIds.length > 0) {
    const response = await request.delete("/api/members", { data: { ids: cleanupState.memberIds } });
    await assertHttpStatus(response, 200, "E2E member cleanup failed");
    cleanupState.memberIds = [];
  }
}

async function waitForApplication() {
  const deadline = Date.now() + 60_000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(new URL("/api/health", baseURL));
      if (response.status === 200) return;
      lastError = new Error(`Health endpoint returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Application did not become ready: ${lastError instanceof Error ? lastError.message : "unknown error"}`);
}

async function assertHttpStatus(response, expectedStatus, message) {
  assert.equal(response.status(), expectedStatus, message);
  await response.body();
}
