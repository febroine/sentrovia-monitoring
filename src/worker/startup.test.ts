import { describe, expect, it } from "vitest";
import { shouldAutoStartWorker } from "@/worker/startup";

describe("worker startup", () => {
  it("starts when auto-start is enabled and no previous worker is alive", () => {
    expect(
      shouldAutoStartWorker({ desiredState: "stopped" }, true, false)
    ).toBe(true);
  });

  it("does not override an explicit auto-start opt-out", () => {
    expect(
      shouldAutoStartWorker({ desiredState: "stopped" }, false, false)
    ).toBe(false);
  });

  it("does not start a second worker while the previous process is alive", () => {
    expect(
      shouldAutoStartWorker({ desiredState: "stopped" }, true, true)
    ).toBe(false);
  });

  it("does not change an already running desired state", () => {
    expect(
      shouldAutoStartWorker({ desiredState: "running" }, true, false)
    ).toBe(false);
  });
});
