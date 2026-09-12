import { describe, expect, it } from "vitest";
import { encryptValue } from "@/lib/security/encryption";
import {
  buildOutageConfirmationSummary,
  formatDurationInputMs,
  formatDurationMs,
  parseDurationInputSeconds,
} from "@/lib/monitors/duration";
import { serializeMonitorRecord } from "@/lib/monitors/utils";

describe("serializeMonitorRecord", () => {
  it("omits monitor secrets when the caller cannot manage monitors", () => {
    const serialized = serializeMonitorRecord(
      {
        heartbeatToken: encryptValue("heartbeat-secret"),
        heartbeatTokenHash: "heartbeat-hash",
        telegramBotToken: encryptValue("telegram-secret"),
        databasePasswordEncrypted: encryptValue("database-secret"),
      },
      false
    );

    expect(serialized.heartbeatToken).toBeNull();
    expect(serialized.telegramBotToken).toBeNull();
    expect(serialized).not.toHaveProperty("heartbeatTokenHash");
    expect(serialized).not.toHaveProperty("databasePasswordEncrypted");
    expect(serialized.databasePasswordConfigured).toBe(true);
  });

  it("does not disclose legacy HTTP URL credentials", () => {
    const serialized = serializeMonitorRecord({
      monitorType: "http",
      url: "https://canary-user:canary-pass@example.com/health?region=eu",
    });

    expect(serialized.url).toBe("https://example.com/health?region=eu");
  });
});

describe("monitor duration helpers", () => {
  it("formats runtime milliseconds as human-readable durations", () => {
    expect(formatDurationMs(1_500)).toBe("1.5 seconds");
    expect(formatDurationMs(60_000)).toBe("1 minute");
    expect(formatDurationMs(90_000)).toBe("1.5 minutes");
    expect(formatDurationMs(3_600_000)).toBe("1 hour");
  });

  it("round-trips the form's seconds display without changing runtime units", () => {
    expect(formatDurationInputMs(1_500)).toBe("1.5");
    expect(parseDurationInputSeconds("1.5", 1_000)).toBe(1_500);
    expect(parseDurationInputSeconds("", 1_000)).toBe(1_000);
  });

  it("summarizes the confirmation sequence using the configured retry threshold", () => {
    const summary = buildOutageConfirmationSummary(5, "dk", 60_000, 3);

    expect(summary).toContain("3 consecutive failed probes");
    expect(summary).toContain("2 verification attempts");
    expect(summary).toContain("roughly 2 minutes");
    expect(summary).toContain("up to 1 minute");
    expect(summary).toContain("every 5 minutes");
  });
});
