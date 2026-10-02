import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Monitor, NotificationJob } from "@/lib/db/schema";

const mocks = vi.hoisted(() => ({
  appendMonitorEvent: vi.fn(),
  buildFailureScreenshotAttachment: vi.fn(),
  canUserAccessPrivateTargets: vi.fn(),
  claimNotificationJobs: vi.fn(),
  completeNotificationJob: vi.fn(),
  enqueueNotificationJob: vi.fn(),
  evaluateNotificationDecision: vi.fn(),
  failNotificationJob: vi.fn(),
  hasAcceptedNotificationDeliverySince: vi.fn(),
  isNotificationJobOwned: vi.fn(),
  lockOwnedNotificationJob: vi.fn(),
  markNotificationDeliveryStarted: vi.fn(),
  sendMonitorNotifications: vi.fn(),
  withMonitorHistoryLock: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: { notificationConcurrency: 5, screenshotConcurrency: 3 },
  getAppEncryptionSecret: () => "outbox-test-encryption-secret-with-32-characters",
}));

vi.mock("@/lib/db", () => ({
  db: { transaction: (operation: (tx: unknown) => Promise<unknown>) => operation({ tx: true }) },
}));

vi.mock("@/lib/delivery/service", () => ({
  hasAcceptedNotificationDeliverySince: mocks.hasAcceptedNotificationDeliverySince,
}));

vi.mock("@/lib/monitors/service", () => ({
  appendMonitorEvent: mocks.appendMonitorEvent,
  withMonitorHistoryLock: mocks.withMonitorHistoryLock,
}));

vi.mock("@/lib/notifications/outbox", () => ({
  MAX_NOTIFICATION_JOB_ATTEMPTS: 5,
  NOTIFICATION_JOB_CLAIM_MS: 600_000,
  claimNotificationJobs: mocks.claimNotificationJobs,
  completeNotificationJob: mocks.completeNotificationJob,
  enqueueNotificationJob: mocks.enqueueNotificationJob,
  failNotificationJob: mocks.failNotificationJob,
  hasOpenNotificationJob: vi.fn(),
  isNotificationJobOwned: mocks.isNotificationJobOwned,
  lockOwnedNotificationJob: mocks.lockOwnedNotificationJob,
  markNotificationDeliveryStarted: mocks.markNotificationDeliveryStarted,
}));

vi.mock("@/lib/security/network-policy", () => ({
  canUserAccessPrivateTargets: mocks.canUserAccessPrivateTargets,
}));

vi.mock("@/worker/notifier", () => ({
  evaluateNotificationDecision: mocks.evaluateNotificationDecision,
  sendMonitorNotifications: mocks.sendMonitorNotifications,
}));

vi.mock("@/worker/screenshot", () => ({
  buildFailureScreenshotAttachment: mocks.buildFailureScreenshotAttachment,
}));

import {
  createNotificationDispatcher,
  decodeNotificationJobPayload,
  encodeNotificationJobPayload,
  processNotificationJob,
  queueMonitorNotification,
  type QueuedNotification,
} from "@/worker/notification-outbox";

const checkedAt = new Date("2026-05-08T07:00:00.000Z");

describe("notification outbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.evaluateNotificationDecision.mockResolvedValue({ wouldNotify: true, reason: "test" });
    mocks.enqueueNotificationJob.mockResolvedValue("queued");
    mocks.sendMonitorNotifications.mockResolvedValue(true);
    mocks.hasAcceptedNotificationDeliverySince.mockResolvedValue(false);
    mocks.lockOwnedNotificationJob.mockResolvedValue(true);
    mocks.isNotificationJobOwned.mockResolvedValue(true);
    mocks.completeNotificationJob.mockResolvedValue(true);
    mocks.failNotificationJob.mockResolvedValue(true);
    mocks.withMonitorHistoryLock.mockImplementation((_monitorId: string, operation: () => Promise<unknown>) => operation());
    mocks.buildFailureScreenshotAttachment.mockResolvedValue(null);
    mocks.canUserAccessPrivateTargets.mockResolvedValue(false);
  });

  it("keeps dates and secrets intact through the encrypted payload", () => {
    const notification = buildNotification();
    const encoded = encodeNotificationJobPayload({ ...notification, version: 1, captureScreenshot: true });

    expect(encoded).not.toContain("bot-token-secret");
    const decoded = decodeNotificationJobPayload(encoded);
    expect(decoded?.result.checkedAt).toEqual(checkedAt);
    expect(decoded?.monitor.lastFailureAt).toEqual(new Date("2026-05-08T06:55:00.000Z"));
    expect(decoded?.monitor.telegramBotToken).toBe("bot-token-secret");
    expect(decoded?.monitor.pausedUntil).toBeNull();
    expect(decoded?.captureScreenshot).toBe(true);
  });

  it("refuses a payload that cannot be decrypted", () => {
    expect(decodeNotificationJobPayload("not-encrypted")).toBeNull();
  });

  it("queues only alerts the notification settings allow", async () => {
    mocks.evaluateNotificationDecision.mockResolvedValue({ wouldNotify: false, reason: "disabled" });

    await expect(queueMonitorNotification(buildNotification())).resolves.toBe(false);
    expect(mocks.enqueueNotificationJob).not.toHaveBeenCalled();
  });

  it("deduplicates outage alerts but queues every recovery", async () => {
    await queueMonitorNotification(buildNotification({ kind: "failure" }));
    await queueMonitorNotification(buildNotification({ kind: "recovery" }));

    expect(mocks.enqueueNotificationJob).toHaveBeenNthCalledWith(1, expect.objectContaining({
      kind: "failure",
      dedupeKey: "failure",
      checkedAt,
      monitorId: "monitor-1",
    }));
    expect(mocks.enqueueNotificationJob).toHaveBeenNthCalledWith(2, expect.objectContaining({
      kind: "recovery",
      dedupeKey: null,
    }));
  });

  it("reports an alert already waiting in the queue as on its way", async () => {
    mocks.enqueueNotificationJob.mockResolvedValue("duplicate");

    await expect(queueMonitorNotification(buildNotification())).resolves.toBe(true);
  });

  it("sends the alert and records its markers at the check's time", async () => {
    const job = buildJob(buildNotification());

    await processNotificationJob(job);

    expect(mocks.markNotificationDeliveryStarted).toHaveBeenCalledWith(job);
    expect(mocks.sendMonitorNotifications).toHaveBeenCalledWith(expect.objectContaining({
      kind: "failure",
      message: "Service returned HTTP 500.",
      result: expect.objectContaining({ checkedAt }),
      buildEmailAttachments: expect.any(Function),
    }));
    expect(mocks.appendMonitorEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "failure-notification", status: "down", createdAt: checkedAt }),
      { tx: true }
    );
    expect(mocks.completeNotificationJob).toHaveBeenCalledWith({ tx: true }, job, "sent");
  });

  it("completes a suppressed alert without markers", async () => {
    mocks.sendMonitorNotifications.mockResolvedValue(false);
    const job = buildJob(buildNotification());

    await processNotificationJob(job);

    expect(mocks.appendMonitorEvent).not.toHaveBeenCalled();
    expect(mocks.completeNotificationJob).toHaveBeenCalledWith({ tx: true }, job, "skipped");
  });

  it("records nothing when a history reset removed the job while it was being sent", async () => {
    mocks.lockOwnedNotificationJob.mockResolvedValue(false);

    await processNotificationJob(buildJob(buildNotification()));

    expect(mocks.appendMonitorEvent).not.toHaveBeenCalled();
    expect(mocks.completeNotificationJob).not.toHaveBeenCalled();
  });

  it("does not send again when an interrupted attempt already delivered the alert", async () => {
    mocks.hasAcceptedNotificationDeliverySince.mockResolvedValue(true);
    const deliveryStartedAt = new Date("2026-05-08T07:00:05.000Z");
    const job = { ...buildJob(buildNotification()), attempts: 2, deliveryStartedAt };

    await processNotificationJob(job);

    expect(mocks.hasAcceptedNotificationDeliverySince).toHaveBeenCalledWith({
      monitorId: "monitor-1",
      kind: "failure",
      since: deliveryStartedAt,
    });
    expect(mocks.sendMonitorNotifications).not.toHaveBeenCalled();
    expect(mocks.appendMonitorEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "failure-notification" }),
      { tx: true }
    );
    expect(mocks.completeNotificationJob).toHaveBeenCalledWith({ tx: true }, job, "sent");
  });

  it("sends again when the interrupted attempt delivered nothing", async () => {
    const job = { ...buildJob(buildNotification()), attempts: 2, deliveryStartedAt: new Date() };

    await processNotificationJob(job);

    expect(mocks.sendMonitorNotifications).toHaveBeenCalledOnce();
  });

  it("retries a job that failed with an error", async () => {
    mocks.sendMonitorNotifications.mockRejectedValue(new Error("database unavailable"));
    const job = buildJob(buildNotification());

    await processNotificationJob(job);

    expect(mocks.failNotificationJob).toHaveBeenCalledWith(job, "database unavailable");
    expect(mocks.completeNotificationJob).not.toHaveBeenCalled();
  });

  it("gives up a job that keeps crashing its worker", async () => {
    const job = { ...buildJob(buildNotification()), attempts: 6 };

    await processNotificationJob(job);

    expect(mocks.sendMonitorNotifications).not.toHaveBeenCalled();
    expect(mocks.failNotificationJob).toHaveBeenCalledWith(job, "Gave up after 5 attempts.", { permanent: true });
  });

  it("drops a job whose payload cannot be read", async () => {
    const job = { ...buildJob(buildNotification()), payload: "broken" };

    await processNotificationJob(job);

    expect(mocks.failNotificationJob).toHaveBeenCalledWith(job, "The queued notification could not be read.", { permanent: true });
  });

  it("takes the screenshot while the alert is sent and records a skipped capture", async () => {
    mocks.buildFailureScreenshotAttachment.mockImplementation(async (_monitor, _checkedAt, onSkipped) => {
      onSkipped?.("the site responded normally when the screenshot was taken");
      return null;
    });
    mocks.sendMonitorNotifications.mockImplementation(async (context) => {
      await context.buildEmailAttachments?.("tr");
      return true;
    });

    await processNotificationJob(buildJob(buildNotification()));

    expect(mocks.buildFailureScreenshotAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ id: "monitor-1" }),
      checkedAt,
      expect.any(Function),
      { checkStatusCode: 500, skipWhenSiteResponds: true, language: "tr" }
    );
    expect(mocks.appendMonitorEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "screenshot-skipped",
      message: "Failure screenshot skipped: the site responded normally when the screenshot was taken",
    }));
  });

  it("sends alerts without a screenshot when none was requested", async () => {
    await processNotificationJob(buildJob(buildNotification({ kind: "recovery", captureScreenshot: false })));

    expect(mocks.sendMonitorNotifications).toHaveBeenCalledWith(expect.objectContaining({
      kind: "recovery",
      buildEmailAttachments: undefined,
    }));
  });

  it("rechecks private network access before the screenshot", async () => {
    const notification = buildNotification();
    (notification.monitor as Monitor & { allowPrivateTargets?: boolean }).allowPrivateTargets = true;
    mocks.sendMonitorNotifications.mockImplementation(async (context) => {
      await context.buildEmailAttachments?.("en");
      return true;
    });

    await processNotificationJob(buildJob(notification));

    expect(mocks.canUserAccessPrivateTargets).toHaveBeenCalledWith("user-1", undefined, "workspace-1");
    expect(mocks.buildFailureScreenshotAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ allowPrivateTargets: false }),
      checkedAt,
      expect.any(Function),
      expect.any(Object)
    );
  });
});

describe("notification dispatcher", () => {
  it("runs at most one job per slot and fills a freed slot right away", async () => {
    const releases: Array<() => void> = [];
    const queue = [1, 2, 3].map((index) => buildJob(buildNotification(), `job-${index}`));
    const claimJobs = vi.fn(async (limit: number) => queue.splice(0, limit));
    const processJob = vi.fn(() => new Promise<void>((resolve) => releases.push(resolve)));
    const dispatcher = createNotificationDispatcher({ concurrency: 2, claimJobs, processJob, wakeDelayMs: 1 });

    await dispatcher.dispatch();
    expect(processJob).toHaveBeenCalledTimes(2);
    expect(claimJobs).toHaveBeenLastCalledWith(2);
    await expect(dispatcher.dispatch()).resolves.toBe(0);

    releases[0]();
    await vi.waitFor(() => expect(processJob).toHaveBeenCalledTimes(3));
    expect(claimJobs).toHaveBeenLastCalledWith(1);

    releases[1]();
    releases[2]();
    await dispatcher.drain();
    expect(dispatcher.getActiveJobCount()).toBe(0);
  });

  it("starts a newly queued alert without waiting for the next worker tick", async () => {
    const job = buildJob(buildNotification());
    const claimJobs = vi.fn(async () => (claimJobs.mock.calls.length === 1 ? [job] : []));
    const processJob = vi.fn(async () => undefined);
    const dispatcher = createNotificationDispatcher({ concurrency: 2, claimJobs, processJob, wakeDelayMs: 1 });

    dispatcher.wake();

    await vi.waitFor(() => expect(processJob).toHaveBeenCalledWith(job));
  });

  it("does not claim while offline, paused or stopped", async () => {
    const claimJobs = vi.fn(async () => []);
    const dispatcher = createNotificationDispatcher({ concurrency: 2, claimJobs, processJob: vi.fn() });

    dispatcher.setOnline(false);
    await dispatcher.dispatch();
    dispatcher.setOnline(true);
    dispatcher.setDispatchGuard(async () => false);
    await dispatcher.dispatch();
    dispatcher.setDispatchGuard(async () => true);
    dispatcher.stop();
    await dispatcher.dispatch();

    expect(claimJobs).not.toHaveBeenCalled();
    dispatcher.resume();
    await dispatcher.dispatch();
    expect(claimJobs).toHaveBeenCalledOnce();
  });

  it("waits for jobs being sent when stopped", async () => {
    let finish: () => void = () => undefined;
    const claimJobs = vi.fn(async () => (claimJobs.mock.calls.length === 1 ? [buildJob(buildNotification())] : []));
    const processJob = vi.fn(() => new Promise<void>((resolve) => {
      finish = resolve;
    }));
    const dispatcher = createNotificationDispatcher({ concurrency: 2, claimJobs, processJob, wakeDelayMs: 1 });
    await dispatcher.dispatch();

    let drained = false;
    dispatcher.stop();
    const drain = dispatcher.drain().then(() => {
      drained = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(drained).toBe(false);

    finish();
    await drain;
    expect(claimJobs).toHaveBeenCalledOnce();
  });

  it("frees the slot of a hung job", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const claimJobs = vi.fn(async () => (claimJobs.mock.calls.length === 1 ? [buildJob(buildNotification())] : []));
    const processJob = vi.fn(() => new Promise<void>(() => undefined));
    const dispatcher = createNotificationDispatcher({ concurrency: 1, claimJobs, processJob, wakeDelayMs: 1, watchdogMs: 5 });

    await dispatcher.dispatch();
    expect(dispatcher.getActiveJobCount()).toBe(1);
    await vi.waitFor(() => expect(dispatcher.getActiveJobCount()).toBe(0));
    consoleError.mockRestore();
  });
});

function buildNotification(overrides: Partial<QueuedNotification> = {}): QueuedNotification {
  const kind = overrides.kind ?? "failure";
  return {
    kind,
    message: "Service returned HTTP 500.",
    monitor: {
      id: "monitor-1",
      userId: "user-1",
      workspaceId: "workspace-1",
      name: "API",
      url: "https://example.com",
      monitorType: "http",
      method: "GET",
      timeout: 10_000,
      status: "down",
      statusCode: 500,
      lastFailureAt: new Date("2026-05-08T06:55:00.000Z"),
      pausedUntil: null,
      telegramBotToken: "bot-token-secret",
      notificationPref: "both",
    } as unknown as Monitor,
    result: {
      ok: false,
      status: "down",
      statusCode: 500,
      latencyMs: 120,
      errorMessage: "HTTP 500",
      failureReason: "http_status",
      checkedAt,
      sslExpiresAt: null,
    },
    rca: { type: "http-server", title: "Server Error", summary: "Server failed", details: "HTTP 500" } as QueuedNotification["rca"],
    markers: kind === "recovery"
      ? [{ eventType: "recovery-notification", status: "up" }]
      : [{ eventType: "failure-notification", status: "down" }],
    captureScreenshot: kind !== "recovery",
    ...overrides,
  };
}

function buildJob(notification: QueuedNotification, id = "job-1"): NotificationJob {
  return {
    id,
    seq: 1,
    workspaceId: "workspace-1",
    userId: "user-1",
    monitorId: "monitor-1",
    kind: notification.kind,
    dedupeKey: null,
    status: "processing",
    payload: encodeNotificationJobPayload({
      ...notification,
      version: 1,
      captureScreenshot: notification.captureScreenshot === true,
    }),
    checkedAt,
    attempts: 1,
    nextAttemptAt: checkedAt,
    claimToken: "claim-1",
    claimExpiresAt: null,
    deliveryStartedAt: null,
    outcome: null,
    lastError: null,
    completedAt: null,
    createdAt: checkedAt,
  };
}
