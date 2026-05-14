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

  it("rejects non-http URLs for HTTP-based monitors", () => {
    const parsed = monitorInputSchema.safeParse({
      ...DEFAULT_MONITOR_FORM,
      name: "Public API",
      url: "ftp://api.example.com/health",
    });

    expect(parsed.success).toBe(false);
  });
});
