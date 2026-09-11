import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseURL = process.env.SENTROVIA_E2E_BASE_URL ?? "http://localhost:3000";
const username = process.env.SENTROVIA_E2E_USERNAME;
const password = process.env.SENTROVIA_E2E_PASSWORD;
const monitoringOnly = process.env.SENTROVIA_E2E_MONITORING_ONLY === "true";
const skipFontAssertions = process.env.SENTROVIA_E2E_SKIP_FONT_ASSERTIONS === "true";

if (!username || !password) {
  throw new Error("Set SENTROVIA_E2E_USERNAME and SENTROVIA_E2E_PASSWORD for an existing admin account.");
}

await waitForApplication();
const browser = await chromium.launch({ headless: true });

try {
  await verifyRejectedLogin(browser);
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const runtimeErrors = collectRuntimeErrors(page);

  await login(page);
  if (!skipFontAssertions && !monitoringOnly) {
    await verifyApplicationPageFonts(page);
  }
  const results = monitoringOnly ? {
    monitoring: await verifyMonitoringInteractions(page),
  } : {
    dashboard: await verifyDashboardInteractions(page),
    monitoring: await verifyMonitoringInteractions(page),
    companies: await verifyCompanyInteractions(page),
    logs: await verifyLogInteractions(page),
    delivery: await verifyDeliveryInteractions(page),
    reports: await verifyReportInteractions(page),
    members: await verifyMemberInteractions(page),
    settings: await verifySettingsInteractions(page),
    profile: await verifyProfileInteractions(page),
    help: await verifyHelpInteractions(page),
    about: await verifyAboutInteractions(page),
    apis: await verifyAdditionalReadApis(context.request),
  };

  assert.deepEqual(runtimeErrors, [], `Browser runtime errors detected:\n${runtimeErrors.join("\n")}`);
  console.log(JSON.stringify(results, null, 2));
  await context.close();
} finally {
  await browser.close();
}

async function verifyRejectedLogin(browserInstance) {
  const context = await browserInstance.newContext({ baseURL });
  try {
    const page = await context.newPage();
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    if (!skipFontAssertions) {
      await assertFontFamily(page.locator("body"), "IBM Plex Sans", "Login UI font");
    }
    await page.locator('input[name="identifier"]').fill(username);
    await page.locator('input[name="password"]').fill(`${password}-invalid`);
    const responsePromise = page.waitForResponse((response) => response.url().endsWith("/api/auth/login"));
    await page.locator('button[type="submit"]').click();
    assert.equal((await responsePromise).status(), 401);
    await assertVisible(page.locator("#login-error"), "Rejected-login alert");
  } finally {
    await context.close();
  }
}

async function verifyApplicationPageFonts(page) {
  const routes = [
    "/dashboard",
    "/monitoring",
    "/companies",
    "/logs",
    "/delivery",
    "/reports",
    "/members",
    "/settings",
    "/profile",
    "/help",
    "/about",
  ];

  for (const route of routes) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await assertFontFamily(page.locator("body"), "IBM Plex Sans", `${route} UI font`);
  }
}

async function login(page) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.locator('input[name="identifier"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  const responsePromise = page.waitForResponse((response) => response.url().endsWith("/api/auth/login"));
  await page.locator('button[type="submit"]').click();
  assert.equal((await responsePromise).status(), 200);
  await page.waitForURL((url) => url.pathname !== "/login", { timeout: 20_000 });
}

async function verifyDashboardInteractions(page) {
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  if (!skipFontAssertions) {
    await assertFontFamily(page.locator("body"), "IBM Plex Sans", "Dashboard UI font");
  }
  await clickUnique(page.getByRole("button", { name: "Customize" }), "Customize dashboard");
  await assertVisible(page.getByText("Widgets and order", { exact: true }), "Widget ordering panel");

  const moveDown = page.getByRole("button", { name: "Move Summary metrics down" });
  assert.equal(await moveDown.isEnabled(), true, "Summary metrics should be movable down");
  await moveDown.click();
  assert.equal(
    await page.getByRole("button", { name: "Move Summary metrics up" }).isEnabled(),
    true,
    "Widget order did not update after moving Summary metrics"
  );
  await clickUnique(page.getByRole("button", { name: "Cancel", exact: true }), "Cancel dashboard customization");
  assert.equal(await page.getByText("Widgets and order", { exact: true }).count(), 0);
  return { customization: true, widgetReorder: true, persisted: false };
}

async function verifyMonitoringInteractions(page) {
  const fixtureSuffix = Date.now().toString(36);
  const monitorName = `UI pause fixture ${fixtureSuffix} A`;
  const secondMonitorName = `UI pause fixture ${fixtureSuffix} B`;
  const monitorIds = [];
  for (const [index, name] of [monitorName, secondMonitorName].entries()) {
    const createResponse = await page.request.post("/api/monitors", {
      data: {
        ...buildUiMonitorPayload(name),
        url: `https://example.com/sentrovia-ui-fixture?run=${fixtureSuffix}-${index}`,
        isActive: true,
      },
    });
    assert.equal(createResponse.status(), 201, "Unable to create the UI monitor fixture");
    monitorIds.push((await createResponse.json()).monitor.id);
  }

  try {
    await page.goto("/monitoring", { waitUntil: "domcontentloaded" });
    const search = page.getByPlaceholder("Search by name, URL, or tag");
    await search.fill(monitorName);
    const filteredMonitorName = page.locator("tbody").getByText(monitorName, { exact: true });
    await assertVisible(filteredMonitorName, "Filtered monitor row");
    if (!skipFontAssertions) {
      await assertFontFamily(
        filteredMonitorName.locator("xpath=ancestor::tr").locator(".font-mono").first(),
        "IBM Plex Mono",
        "Monitor target font"
      );
    }
    await search.fill("no-monitor-matches-this-query");
    await assertVisible(page.locator("tbody").getByText("No monitors in this view", { exact: true }), "Monitor empty state");
    await search.fill("");

    await search.fill(monitorName);
    const singlePause = page.getByRole("button", { name: `Temporarily pause ${monitorName}`, exact: true });
    await clickUnique(singlePause, "Single monitor pause");
    let pauseDialog = page.getByRole("dialog");
    await assertVisible(pauseDialog.getByRole("heading", { name: "Pause monitoring", exact: true }), "Pause dialog");
    await pauseDialog.getByLabel("Duration", { exact: true }).fill("2");
    let pauseResponse = page.waitForResponse(
      (response) => response.url().endsWith("/api/monitors/pause") && response.request().method() === "PATCH"
    );
    await clickUnique(pauseDialog.getByRole("button", { name: "Pause monitoring", exact: true }), "Confirm single pause");
    assert.equal((await pauseResponse).status(), 200);
    const singleResume = page.getByRole("button", { name: `Resume ${monitorName} now`, exact: true });
    await assertVisible(singleResume, "Single monitor resume");
    let resumeResponse = page.waitForResponse(
      (response) => response.url().endsWith("/api/monitors/pause") && response.request().method() === "PATCH"
    );
    await clickUnique(singleResume, "Resume single monitor");
    assert.equal((await resumeResponse).status(), 200);
    await assertVisible(singlePause, "Single monitor pause after resume");

    await search.fill(`UI pause fixture ${fixtureSuffix}`);
    await assertVisible(page.locator("tbody").getByText(monitorName, { exact: true }), "First bulk pause fixture");
    await assertVisible(page.locator("tbody").getByText(secondMonitorName, { exact: true }), "Second bulk pause fixture");
    await clickUnique(page.getByRole("button", { name: "Select all", exact: true }), "Select pause fixtures");
    await assertVisible(page.getByText("2 monitors selected", { exact: true }), "Bulk selection count");
    await clickUnique(page.getByRole("button", { name: "Pause", exact: true }), "Bulk pause");
    pauseDialog = page.getByRole("dialog");
    await assertVisible(pauseDialog.getByText("2 monitors will be excluded from checks and current-state reporting until the selected time ends.", { exact: true }), "Bulk pause scope");
    pauseResponse = page.waitForResponse(
      (response) => response.url().endsWith("/api/monitors/pause") && response.request().method() === "PATCH"
    );
    await clickUnique(pauseDialog.getByRole("button", { name: "Pause monitoring", exact: true }), "Confirm bulk pause");
    assert.equal((await pauseResponse).status(), 200);
    const bulkResume = page.getByRole("button", { name: "Resume paused", exact: true });
    await assertVisible(bulkResume, "Bulk resume");
    resumeResponse = page.waitForResponse(
      (response) => response.url().endsWith("/api/monitors/pause") && response.request().method() === "PATCH"
    );
    await clickUnique(bulkResume, "Resume paused monitors");
    assert.equal((await resumeResponse).status(), 200);
    await clickUnique(page.getByRole("button", { name: "Clear", exact: true }), "Clear pause fixture selection");

    for (const retiredOperationLabel of [
      "Operations",
      "Active incidents",
      "Maintenance & silences",
      "Schedule maintenance",
    ]) {
      assert.equal(
        await page.getByText(retiredOperationLabel, { exact: true }).count(),
        0,
        `${retiredOperationLabel} should not remain on Monitoring`
      );
    }

    await clickUnique(page.getByRole("button", { name: "Tools", exact: true }), "Monitor tools");
    await assertVisible(page.getByRole("heading", { name: "Monitor tools" }), "Monitor tools dialog");
    await clickUnique(page.getByRole("button", { name: "Monitoring as code", exact: true }), "Monitoring as Code");
    const configDialog = page.getByRole("dialog");
    await assertVisible(configDialog.getByRole("heading", { name: "Monitoring as Code" }), "Monitoring as Code dialog");
    await assertEqualControlHeights(
      configDialog.getByLabel("Format"),
      configDialog.getByRole("button", { name: "Export bundle", exact: true }),
      "Monitoring as Code export controls"
    );
    await assertDialogFooterInset(
      configDialog,
      configDialog.getByRole("button", { name: "Preview import", exact: true }),
      "Monitoring as Code footer"
    );
    await clickUnique(
      configDialog.locator('[data-slot="dialog-footer"]').getByRole("button", { name: "Close", exact: true }),
      "Close Monitoring as Code"
    );
    await clickUnique(page.getByRole("button", { name: "Add monitor", exact: true }), "Add monitor");
    const dialog = page.getByRole("dialog");
    await assertVisible(dialog.getByRole("heading", { name: "Create monitor" }), "Create monitor dialog");
    await clickUnique(dialog.getByRole("button", { name: "Cancel", exact: true }), "Cancel monitor creation");
    return {
      search: true,
      emptyState: true,
      singlePause: true,
      bulkPause: true,
      resume: true,
      operationsRemoved: true,
      toolsDialog: true,
      configDialogLayout: true,
      createDialog: true,
    };
  } finally {
    for (const monitorId of monitorIds) {
      const deleteResponse = await page.request.delete(`/api/monitors/${monitorId}`);
      assert.equal(deleteResponse.status(), 200, "Unable to clean up the UI monitor fixture");
    }
  }
}

function buildUiMonitorPayload(name) {
  return {
    name,
    monitorType: "http",
    url: "https://example.com/sentrovia-ui-fixture",
    notificationPref: "none",
    notificationLanguage: "default",
    notifEmail: "",
    telegramBotToken: "",
    telegramChatId: "",
    telegramTemplate: "",
    emailSubject: "",
    emailBody: "",
    slowResponseEmailSubject: "",
    slowResponseEmailBody: "",
    slowResponseTelegramTemplate: "",
    intervalValue: 24,
    intervalUnit: "sa",
    timeout: 5_000,
    slowResponseThresholdMs: 2_000,
    slowResponseAlertsEnabled: true,
    expectedStatusCodes: "200",
    retries: 2,
    method: "GET",
    tags: ["ui-e2e"],
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
    isActive: false,
    publishOnStatusPage: false,
  };
}

async function verifyCompanyInteractions(page) {
  await page.goto("/companies", { waitUntil: "domcontentloaded" });
  const search = page.getByPlaceholder("Search companies");
  await search.fill("no-company-matches-this-query");
  await assertVisible(page.getByText("No companies match this search", { exact: true }), "Company search empty state");
  await search.fill("");
  await clickUnique(page.getByRole("button", { name: "Add company", exact: true }), "Add company");
  const dialog = page.getByRole("dialog");
  await assertVisible(dialog.getByRole("heading", { name: "Add company" }), "Add company dialog");
  await clickUnique(dialog.getByRole("button", { name: "Cancel", exact: true }), "Cancel company creation");
  return { search: true, createDialog: true };
}

async function verifyLogInteractions(page) {
  await page.goto("/logs", { waitUntil: "domcontentloaded" });
  const search = page.getByPlaceholder("Search event logs");
  await search.fill("no-log-matches-this-query");
  await assertVisible(page.getByText("No events match the current filters", { exact: true }), "Log empty state");
  await search.fill("");
  await clickUnique(page.getByRole("button", { name: "Show filters", exact: true }), "Log filters");
  await assertVisible(page.getByPlaceholder("Status code"), "Status-code filter");
  await clickUnique(page.getByRole("button", { name: "Hide filters", exact: true }), "Hide log filters");
  return { search: true, filters: true };
}

async function verifyDeliveryInteractions(page) {
  await page.goto("/delivery", { waitUntil: "domcontentloaded" });
  const responsePromise = page.waitForResponse((response) => response.url().includes("/api/delivery") && response.request().method() === "GET");
  await clickUnique(page.getByRole("button", { name: "Refresh", exact: true }), "Refresh delivery overview");
  assert.equal((await responsePromise).status(), 200);
  await assertVisible(page.getByText("Channel health", { exact: true }), "Channel health");
  return { refresh: true, channelHealth: true, externalDeliverySent: false };
}

async function verifyReportInteractions(page) {
  const fixtureSuffix = Date.now().toString(36);
  const fixtureResponse = await page.request.post("/api/monitors", {
    data: {
      ...buildUiMonitorPayload(`Report fixture ${fixtureSuffix}`),
      url: `https://example.com/sentrovia-report-fixture?run=${fixtureSuffix}`,
    },
  });
  assert.equal(fixtureResponse.status(), 201, "Unable to create the report UI fixture");
  const monitorId = (await fixtureResponse.json()).monitor.id;

  try {
    await page.goto("/reports", { waitUntil: "domcontentloaded" });
    if (!skipFontAssertions) {
      await assertFontFamily(page.locator("body"), "IBM Plex Sans", "Reports UI font");
    }
    await clickUnique(page.getByRole("button", { name: "Preview", exact: true }), "Reports preview tab");
    const generatePreview = page.getByRole("button", { name: "Generate preview", exact: true });
    await assertVisible(generatePreview, "Generate report preview");
    const previewResponse = page.waitForResponse((response) => response.url().endsWith("/api/reports/preview"));
    await clickUnique(generatePreview, "Generate report preview");
    assert.equal((await previewResponse).status(), 200);
    await assertVisible(page.getByText("Report findings", { exact: true }), "Generated report preview");
    await clickUnique(page.getByRole("button", { name: "Schedules", exact: true }), "Reports schedules tab");
    await assertVisible(page.getByText("Scheduled report", { exact: true }), "Scheduled report builder");
    return { preview: true, schedulesTab: true, reportSent: false };
  } finally {
    const deleteResponse = await page.request.delete(`/api/monitors/${monitorId}`);
    assert.equal(deleteResponse.status(), 200, "Unable to clean up the report UI fixture");
  }
}

async function verifyMemberInteractions(page) {
  await page.goto("/members", { waitUntil: "domcontentloaded" });
  const search = page.getByPlaceholder("Search members");
  await search.fill("no-member-matches-this-query");
  await assertVisible(page.getByText("No members match the current filters", { exact: true }), "Member empty state");
  await search.fill("");
  await clickUnique(page.getByRole("button", { name: "Add member", exact: true }), "Add member");
  const dialog = page.getByRole("dialog");
  await assertVisible(dialog.getByRole("heading", { name: "Add member" }), "Add member dialog");
  await clickUnique(dialog.getByRole("button", { name: "Cancel", exact: true }), "Cancel member creation");
  return { search: true, createDialog: true };
}

async function verifySettingsInteractions(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings", { waitUntil: "domcontentloaded" });
  const sectionSelect = page.getByRole("combobox", { name: "Settings section" });
  await clickUnique(sectionSelect, "Mobile settings section selector");
  await clickUnique(page.getByRole("option", { name: "Monitoring", exact: true }), "Monitoring settings option");
  await assertVisible(page.getByText("Monitor defaults", { exact: true }), "Monitoring settings section");

  await clickUnique(sectionSelect, "Mobile settings section selector");
  await clickUnique(page.getByRole("option", { name: "Notifications", exact: true }), "Notification settings option");
  const downGroup = page.getByText("Down notification", { exact: true });
  await clickUnique(downGroup, "Down notification template group");
  await assertVisible(page.locator("details[open]").getByText("Email subject", { exact: true }), "Notification subject editor");
  await clickUnique(downGroup, "Close down notification template group");
  const slowGroup = page.getByText("Slow response notification", { exact: true });
  await clickUnique(slowGroup, "Slow-response notification template group");
  const openSlowGroup = page.locator("details[open]").filter({ hasText: "Slow response notification" });
  await assertVisible(openSlowGroup.getByText("Email subject", { exact: true }), "Slow-response email subject editor");
  await assertVisible(openSlowGroup.getByText("Telegram message", { exact: true }), "Slow-response Telegram editor");

  await clickUnique(sectionSelect, "Mobile settings section selector");
  await clickUnique(page.getByRole("option", { name: "Public status", exact: true }), "Public status settings option");
  await assertVisible(page.getByText("Public status pages", { exact: true }), "Public status page manager");
  await clickUnique(page.getByRole("button", { name: "Add page", exact: true }), "Add public status page");
  await assertVisible(page.getByRole("heading", { name: "Add public status page" }), "Public status page dialog");
  await page.keyboard.press("Escape");
  return { mobileSectionSelector: true, templateDisclosure: true, slowTemplateDisclosure: true, publicStatusDialog: true };
}

async function verifyProfileInteractions(page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/profile", { waitUntil: "domcontentloaded" });
  await clickUnique(page.getByRole("tab", { name: "Security", exact: true }), "Profile security tab");
  await assertVisible(page.getByRole("heading", { name: "Password", exact: true }), "Password security section");
  return { securityTab: true, passwordChanged: false };
}

async function verifyHelpInteractions(page) {
  await page.goto("/help", { waitUntil: "domcontentloaded" });
  const search = page.getByRole("textbox", { name: "Search help" });
  await search.fill("heartbeat");
  const resultHeading = page.locator("section[aria-live='polite'] h2");
  await assertVisible(resultHeading, "Help search result count");
  assert.doesNotMatch(await resultHeading.innerText(), /^0 results?$/i);
  await search.fill("");
  await clickUnique(page.getByRole("tab", { name: "Delivery", exact: true }), "Help delivery tab");
  await assertVisible(page.getByText("Which delivery channels exist right now?", { exact: true }), "Delivery help content");
  return { search: true, categoryTabs: true };
}

async function verifyAboutInteractions(page) {
  await page.goto("/about", { waitUntil: "domcontentloaded" });
  await clickUnique(page.getByRole("link", { name: "Open help", exact: true }), "About help link");
  await page.waitForURL((url) => url.pathname === "/help");
  return { helpNavigation: true };
}

async function verifyAdditionalReadApis(request) {
  const endpoints = ["/api/members", "/api/public-status-pages", "/api/system/health", "/api/updates"];
  const results = {};
  for (const endpoint of endpoints) {
    const response = await request.get(endpoint);
    assert.equal(response.status(), 200, `${endpoint} did not return HTTP 200`);
    await response.body();
    results[endpoint] = 200;
  }
  return results;
}

function collectRuntimeErrors(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 500) errors.push(`http: ${response.status()} ${response.url()}`);
  });
  return errors;
}

async function clickUnique(locator, label) {
  await locator.waitFor({ state: "visible", timeout: 10_000 });
  assert.equal(await locator.count(), 1, `${label} should resolve to one visible control`);
  await locator.click();
}

async function assertVisible(locator, label) {
  await locator.waitFor({ state: "visible", timeout: 10_000 });
  assert.equal(await locator.count(), 1, `${label} should resolve to one element`);
  assert.equal(await locator.isVisible(), true, `${label} should be visible`);
}

async function assertEqualControlHeights(first, second, label) {
  const [firstBox, secondBox] = await Promise.all([first.boundingBox(), second.boundingBox()]);
  assert(firstBox && secondBox, `${label} controls should have measurable bounds`);
  assert(
    Math.abs(firstBox.height - secondBox.height) < 0.5,
    `${label} controls should have equal heights`
  );
}

async function assertDialogFooterInset(dialog, footerButton, label) {
  const [dialogBox, buttonBox] = await Promise.all([dialog.boundingBox(), footerButton.boundingBox()]);
  assert(dialogBox && buttonBox, `${label} should have measurable bounds`);
  assert(
    dialogBox.y + dialogBox.height - (buttonBox.y + buttonBox.height) >= 12,
    `${label} actions should not touch the dialog edge`
  );
}

async function assertFontFamily(locator, expectedFamily, label) {
  await locator.waitFor({ state: "visible", timeout: 10_000 });
  await locator.page().evaluate(async () => {
    await document.fonts.ready;
  });
  const fontFamily = await locator.evaluate((element) => getComputedStyle(element).fontFamily);
  assert.match(fontFamily, new RegExp(expectedFamily, "i"), `${label} should use ${expectedFamily}; received ${fontFamily}`);
}

async function waitForApplication() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(new URL("/api/health", baseURL));
      if (response.status === 200) return;
    } catch {
      // Retry until the deadline; Docker may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error("Application did not become ready within 60 seconds.");
}
