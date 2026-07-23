import { describe, expect, it } from "vitest";
import { sanitizeWorkerStatusMessage } from "@/lib/worker/status-message";

describe("worker status messages", () => {
  it("hides SQL and parameters from persisted database errors", () => {
    expect(sanitizeWorkerStatusMessage("Failed query: select * from users params: secret")).toBe(
      "A worker maintenance task failed. Monitor checks will continue; review the server log for details."
    );
  });

  it("preserves normal operational messages", () => {
    expect(sanitizeWorkerStatusMessage("Worker is healthy.")).toBe("Worker is healthy.");
  });

  it("bounds unexpected messages displayed in the dashboard", () => {
    expect(sanitizeWorkerStatusMessage("x".repeat(300))).toHaveLength(240);
  });
});
