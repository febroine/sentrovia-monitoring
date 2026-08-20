import { describe, expect, it } from "vitest";
import { shouldAutoStartWorker } from "@/worker/startup";

describe("worker startup", () => {
  it("starts when auto-start is enabled", () => {
    expect(
      shouldAutoStartWorker({ desiredState: "stopped" }, true)
    ).toBe(true);
  });

  it("does not override an explicit auto-start opt-out", () => {
    expect(
      shouldAutoStartWorker({ desiredState: "stopped" }, false)
    ).toBe(false);
  });

  it("does not change an already running desired state", () => {
    expect(
      shouldAutoStartWorker({ desiredState: "running" }, true)
    ).toBe(false);
  });
});
