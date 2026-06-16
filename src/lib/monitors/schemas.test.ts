import { describe, expect, it } from "vitest";
import { monitorInputSchema } from "@/lib/monitors/schemas";
import { DEFAULT_MONITOR_FORM } from "@/lib/monitors/types";

describe("monitor input schema", () => {
  it("normalizes multiple notification email recipients", () => {
    const parsed = monitorInputSchema.parse({
      ...DEFAULT_MONITOR_FORM,
      name: "Public API",
      url: "https://api.example.com",
      notifEmail: "Ops@Example.com; noc@example.com\nops@example.com",
    });

    expect(parsed.notifEmail).toBe("ops@example.com, noc@example.com");
  });

  it("rejects invalid recipients in a multi-recipient notification list", () => {
    const parsed = monitorInputSchema.safeParse({
      ...DEFAULT_MONITOR_FORM,
      name: "Public API",
      url: "https://api.example.com",
      notifEmail: "ops@example.com, invalid-recipient",
    });

    expect(parsed.success).toBe(false);
  });

  it("requires telegram credentials when telegram notifications are enabled", () => {
    const parsed = monitorInputSchema.safeParse({
      ...DEFAULT_MONITOR_FORM,
      name: "Public API",
      url: "https://api.example.com",
      notificationPref: "telegram",
    });

    expect(parsed.success).toBe(false);
  });

  it("allows telegram notifications when bot token and chat id are configured", () => {
    const parsed = monitorInputSchema.safeParse({
      ...DEFAULT_MONITOR_FORM,
      name: "Public API",
      url: "https://api.example.com",
      notificationPref: "telegram",
      telegramBotToken: "123456:telegram-token",
      telegramChatId: "-1001234567890",
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects non-http URLs for HTTP-based monitors", () => {
    const parsed = monitorInputSchema.safeParse({
      ...DEFAULT_MONITOR_FORM,
      name: "Public API",
      url: "ftp://api.example.com/health",
    });

    expect(parsed.success).toBe(false);
  });

  it("allows private network URLs for internal monitor targets", () => {
    const parsed = monitorInputSchema.safeParse({
      ...DEFAULT_MONITOR_FORM,
      name: "Internal API",
      url: "http://10.10.1.25/health",
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects metadata URLs for HTTP-based monitors", () => {
    const parsed = monitorInputSchema.safeParse({
      ...DEFAULT_MONITOR_FORM,
      name: "Metadata API",
      url: "http://169.254.169.254/latest/meta-data",
    });

    expect(parsed.success).toBe(false);
  });

  it("allows private network hosts for TCP monitors", () => {
    const parsed = monitorInputSchema.safeParse({
      ...DEFAULT_MONITOR_FORM,
      name: "Router",
      monitorType: "port",
      portHost: "192.168.1.1",
      notificationPref: "none",
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects localhost hosts for TCP monitors", () => {
    const parsed = monitorInputSchema.safeParse({
      ...DEFAULT_MONITOR_FORM,
      name: "Localhost",
      monitorType: "port",
      portHost: "localhost",
      notificationPref: "none",
    });

    expect(parsed.success).toBe(false);
  });

  it("treats blank slow response thresholds as disabled", () => {
    const parsed = monitorInputSchema.parse({
      ...DEFAULT_MONITOR_FORM,
      name: "Public API",
      url: "https://api.example.com",
      slowResponseThresholdMs: "   ",
    });

    expect(parsed.slowResponseThresholdMs).toBeNull();
  });

  it("rejects slow response thresholds that cannot fire before hard timeout", () => {
    const parsed = monitorInputSchema.safeParse({
      ...DEFAULT_MONITOR_FORM,
      name: "Public API",
      url: "https://api.example.com",
      timeout: 5000,
      slowResponseThresholdMs: 5000,
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects short custom heartbeat tokens", () => {
    const parsed = monitorInputSchema.safeParse({
      ...DEFAULT_MONITOR_FORM,
      name: "Nightly Job",
      monitorType: "heartbeat",
      heartbeatToken: "short123",
    });

    expect(parsed.success).toBe(false);
  });
});
