import { beforeEach, describe, expect, it, vi } from "vitest";
import { runRetentionCleanup } from "@/lib/data-retention/service";
import { retryDeliveryQueueForAllUsers } from "@/lib/delivery/service";
import { runDueReportSchedules } from "@/lib/reports/service";
import { ensureWorkerConnectivity } from "@/worker/connectivity";
import { runWorkerPhases } from "@/worker/phases";
import { runMonitoringCycle } from "@/worker/scheduler";
import { triggerAutomaticDatabaseBackup } from "@/lib/system/automatic-backup";

vi.mock("@/lib/data-retention/service", () => ({ runRetentionCleanup: vi.fn() }));
vi.mock("@/lib/delivery/service", () => ({ retryDeliveryQueueForAllUsers: vi.fn() }));
vi.mock("@/lib/reports/service", () => ({ runDueReportSchedules: vi.fn() }));
vi.mock("@/worker/connectivity", () => ({ ensureWorkerConnectivity: vi.fn() }));
vi.mock("@/worker/scheduler", () => ({ runMonitoringCycle: vi.fn() }));
vi.mock("@/lib/system/automatic-backup", () => ({ triggerAutomaticDatabaseBackup: vi.fn() }));

const online = {
  available: true,
  status: "online" as const,
  checkedAt: new Date(),
  successfulTargets: 1,
  totalTargets: 3,
  message: "Internet connectivity confirmed.",
};
const offline = {
  ...online,
  available: false,
  status: "offline" as const,
  successfulTargets: 0,
  message: "Internet connectivity unavailable. Worker tasks are paused.",
};

describe("worker phase connectivity guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ensureWorkerConnectivity).mockResolvedValue(online);
  });

  it("still runs offline-capable monitors while pausing outbound work", async () => {
    vi.mocked(ensureWorkerConnectivity).mockResolvedValueOnce(offline);

    await expect(runWorkerPhases(async () => true)).resolves.toEqual({
      status: "connectivity-paused",
      message: offline.message,
    });

    expect(runRetentionCleanup).toHaveBeenCalledOnce();
    expect(runMonitoringCycle).toHaveBeenCalledOnce();
    expect(retryDeliveryQueueForAllUsers).not.toHaveBeenCalled();
    expect(runDueReportSchedules).not.toHaveBeenCalled();
  });

  it("stops outbound work when connectivity is unavailable after monitor checks", async () => {
    vi.mocked(ensureWorkerConnectivity).mockResolvedValueOnce(offline);

    await expect(runWorkerPhases(async () => true)).resolves.toMatchObject({
      status: "connectivity-paused",
    });

    expect(runMonitoringCycle).toHaveBeenCalledOnce();
    expect(retryDeliveryQueueForAllUsers).not.toHaveBeenCalled();
    expect(runDueReportSchedules).not.toHaveBeenCalled();
  });

  it("runs every phase while connectivity remains available", async () => {
    await expect(runWorkerPhases(async () => true)).resolves.toEqual({ status: "completed" });

    expect(runRetentionCleanup).toHaveBeenCalledOnce();
    expect(runMonitoringCycle).toHaveBeenCalledOnce();
    expect(retryDeliveryQueueForAllUsers).toHaveBeenCalledOnce();
    expect(runDueReportSchedules).toHaveBeenCalledOnce();
    expect(triggerAutomaticDatabaseBackup).toHaveBeenCalledOnce();
  });

  it("does not start monitor work after a stop request", async () => {
    await expect(runWorkerPhases(async () => false)).resolves.toEqual({ status: "stopped" });

    expect(triggerAutomaticDatabaseBackup).not.toHaveBeenCalled();
    expect(runRetentionCleanup).not.toHaveBeenCalled();
    expect(ensureWorkerConnectivity).not.toHaveBeenCalled();
    expect(runMonitoringCycle).not.toHaveBeenCalled();
    expect(retryDeliveryQueueForAllUsers).not.toHaveBeenCalled();
    expect(runDueReportSchedules).not.toHaveBeenCalled();
  });

  it("finishes an already-started delivery retry before honoring a stop after monitor checks", async () => {
    const isRunRequested = vi.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await expect(runWorkerPhases(isRunRequested)).resolves.toEqual({ status: "stopped" });

    expect(runMonitoringCycle).toHaveBeenCalledOnce();
    expect(retryDeliveryQueueForAllUsers).toHaveBeenCalledOnce();
    expect(runDueReportSchedules).not.toHaveBeenCalled();
  });

  it("does not run reports when stopped after delivery retries", async () => {
    const isRunRequested = vi.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await expect(runWorkerPhases(isRunRequested)).resolves.toEqual({ status: "stopped" });

    expect(runMonitoringCycle).toHaveBeenCalledOnce();
    expect(retryDeliveryQueueForAllUsers).toHaveBeenCalledOnce();
    expect(runDueReportSchedules).not.toHaveBeenCalled();
  });

  it("continues monitor checks when retention cleanup fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(runRetentionCleanup).mockRejectedValueOnce(new Error("retention unavailable"));

    await expect(runWorkerPhases(async () => true)).resolves.toEqual({ status: "completed" });

    expect(runMonitoringCycle).toHaveBeenCalledOnce();
    expect(retryDeliveryQueueForAllUsers).toHaveBeenCalledOnce();
    expect(runDueReportSchedules).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledWith(
      "[sentrovia] Retention cleanup failed; monitor checks will continue.",
      expect.any(Error)
    );
    consoleError.mockRestore();
  });
});
