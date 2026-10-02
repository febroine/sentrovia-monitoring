import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { toMonitorAlertState } from "@/lib/monitors/alert-states";

const now = new Date("2026-10-02T12:00:00.000Z");
const base = { status: "up", verificationMode: false, isActive: true, pausedUntil: null };

describe("toMonitorAlertState", () => {
  it("reports confirmed states", () => {
    expect(toMonitorAlertState(base, now)).toBe("up");
    expect(toMonitorAlertState({ ...base, status: "down" }, now)).toBe("down");
  });

  it("holds back a failure that is still being verified", () => {
    expect(toMonitorAlertState({ ...base, status: "down", verificationMode: true }, now)).toBe("idle");
    expect(toMonitorAlertState({ ...base, status: "pending" }, now)).toBe("idle");
  });

  it("ignores inactive and paused monitors", () => {
    expect(toMonitorAlertState({ ...base, status: "down", isActive: false }, now)).toBe("idle");
    expect(toMonitorAlertState({ ...base, status: "down", pausedUntil: new Date("2026-10-02T13:00:00.000Z") }, now)).toBe("idle");
    expect(toMonitorAlertState({ ...base, status: "down", pausedUntil: new Date("2026-10-02T11:00:00.000Z") }, now)).toBe("down");
  });
});
