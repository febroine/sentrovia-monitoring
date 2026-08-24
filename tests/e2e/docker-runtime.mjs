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
const cleanup = { companyId: null, memberIds: [], monitorId: null };

try {
  const page = await adminContext.newPage();
  const browserErrors = collectBrowserErrors(page);
  await verifyAuthentication(page);
  const routeResults = await verifyApplicationRoutes(page);
  const mobileResult = await verifyMobileMonitoring(page);
  const workflowResult = await verifyCrudAndAuthorization(adminContext, cleanup);
  await verifyStoredTextRendering(page, workflowResult.companyName);
  const apiResults = await verifyReadApis(adminContext.request);
  const boundaryResults = await verifyInputBoundaries(adminContext.request);
  await cleanupResources(adminContext.request, cleanup);
  cleanup.companyId = null;
  cleanup.memberIds = [];
  cleanup.monitorId = null;
  await verifyLogout(page);

  assert.deepEqual(browserErrors, [], `Browser errors detected:\n${browserErrors.join("\n")}`);
  console.log(JSON.stringify({ routeResults, mobileResult, workflowResult, apiResults, boundaryResults }, null, 2));
} finally {
  await cleanupResources(adminContext.request, cleanup);
  await adminContext.close();
  await browser.close();
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
    previewStatuses,
    viewerMutationStatus,
    operatorIsolationStatus,
  };
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
  return { report: 200, notification: 200 };
}

async function createCompany(request, suffix) {
  const name = `<img src=x onerror=alert(1)> Docker E2E ${suffix}`;
  const response = await request.post("/api/companies", {
    data: {
      name,
      description: '<script>alert("stored-xss")</script>',
      isActive: true,
      userId: "00000000-0000-0000-0000-000000000000",
      role: "admin",
    },
  });
  assert.equal(response.status(), 201);
  const company = (await response.json()).company;
  assert.notEqual(company.userId, "00000000-0000-0000-0000-000000000000");
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
    notificationPref: "none",
    notificationLanguage: "default",
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
    publishOnStatusPage: false,
    userId: "00000000-0000-0000-0000-000000000000",
    status: "up",
    consecutiveFailures: -10,
  };
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
  await assertHttpStatus(malformed, 400);
  await assertHttpStatus(crossOrigin, 403);
  await assertHttpStatus(oversized, 413);
  return { malformed: 400, crossOrigin: 403, oversized: 413 };
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
