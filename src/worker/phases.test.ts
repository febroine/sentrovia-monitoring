import { beforeEach, describe, expect, it, vi } from "vitest";
import { runRetentionCleanup } from "@/lib/data-retention/service";
import { retryWebhookQueueForAllUsers } from "@/lib/delivery/service";
import { runDueReportSchedules } from "@/lib/reports/service";
import { ensureWorkerConnectivity } from "@/worker/connectivity";
import { runWorkerPhases } from "@/worker/phases";
import { runMonitoringCycle } from "@/worker/scheduler";

vi.mock("@/lib/data-retention/service", () => ({ runRetentionCleanup: vi.fn() }));
vi.mock("@/lib/delivery/service", () => ({ retryWebhookQueueForAllUsers: vi.fn() }));
vi.mock("@/lib/reports/service", () => ({ runDueReportSchedules: vi.fn() }));
vi.mock("@/worker/connectivity", () => ({ ensureWorkerConnectivity: vi.fn() }));
vi.mock("@/worker/scheduler", () => ({ runMonitoringCycle: vi.fn() }));

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

  it("pauses monitor and outbound work when the host starts offline", async () => {
    vi.mocked(ensureWorkerConnectivity).mockResolvedValueOnce(offline);

    await expect(runWorkerPhases(async () => true)).resolves.toEqual({
      status: "connectivity-paused",
      message: offline.message,
    });

    expect(runRetentionCleanup).toHaveBeenCalledOnce();
    expect(runMonitoringCycle).not.toHaveBeenCalled();
    expect(retryWebhookQueueForAllUsers).not.toHaveBeenCalled();
    expect(runDueReportSchedules).not.toHaveBeenCalled();
  });

  it("stops outbound work when connectivity is lost during monitor checks", async () => {
    vi.mocked(ensureWorkerConnectivity)
      .mockResolvedValueOnce(online)
      .mockResolvedValueOnce(offline);

    await expect(runWorkerPhases(async () => true)).resolves.toMatchObject({
      status: "connectivity-paused",
    });

    expect(runMonitoringCycle).toHaveBeenCalledOnce();
    expect(retryWebhookQueueForAllUsers).not.toHaveBeenCalled();
    expect(runDueReportSchedules).not.toHaveBeenCalled();
  });

  it("runs every phase while connectivity remains available", async () => {
    await expect(runWorkerPhases(async () => true)).resolves.toEqual({ status: "completed" });

    expect(runRetentionCleanup).toHaveBeenCalledOnce();
    expect(runMonitoringCycle).toHaveBeenCalledOnce();
    expect(retryWebhookQueueForAllUsers).toHaveBeenCalledOnce();
    expect(runDueReportSchedules).toHaveBeenCalledOnce();
  });
});
