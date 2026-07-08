import { describe, expect, it } from "vitest";
import { classifyFailureMessage, formatTimeoutDuration } from "@/worker/failure-reasons";

describe("failure reason helpers", () => {
  it("classifies common network failure messages", () => {
    expect(classifyFailureMessage("connect ETIMEDOUT 5.9.81.212:443")).toBe("timeout");
    expect(classifyFailureMessage("getaddrinfo ENOTFOUND example.test")).toBe("dns");
    expect(classifyFailureMessage("self signed certificate")).toBe("tls");
    expect(classifyFailureMessage("connect ECONNREFUSED 127.0.0.1:443")).toBe("connection");
  });

  it("uses the caller fallback for domain-specific failures", () => {
    expect(classifyFailureMessage("relation users does not exist", "database")).toBe("database");
  });

  it("formats timeout durations for notification copy", () => {
    expect(formatTimeoutDuration(60000)).toBe("60s");
    expect(formatTimeoutDuration(7500)).toBe("7500ms");
  });
});
