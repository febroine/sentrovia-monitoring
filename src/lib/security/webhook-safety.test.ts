import { describe, expect, it } from "vitest";
import { assertSafeWebhookUrl } from "@/lib/security/webhook-safety";

describe("webhook safety", () => {
  it("rejects bracketed IPv6 loopback URLs", async () => {
    await expect(assertSafeWebhookUrl("http://[::1]/hook")).rejects.toThrow(
      "Webhook targets must point to a public webhook endpoint."
    );
  });

  it("rejects IPv4-mapped IPv6 loopback URLs", async () => {
    await expect(assertSafeWebhookUrl("http://[::ffff:127.0.0.1]/hook")).rejects.toThrow(
      "Webhook targets must point to a public webhook endpoint."
    );
  });

  it("accepts public IP literal webhook URLs", async () => {
    await expect(assertSafeWebhookUrl("https://8.8.8.8/hook")).resolves.toBe("https://8.8.8.8/hook");
  });
});
