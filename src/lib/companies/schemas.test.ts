import { describe, expect, it } from "vitest";
import { companyInputSchema } from "@/lib/companies/schemas";

const baseCompany = {
  name: "Operations",
  description: "Production services",
  isActive: true,
};

describe("companyInputSchema", () => {
  it("normalizes and deduplicates company email recipients", () => {
    const parsed = companyInputSchema.parse({
      ...baseCompany,
      notificationEmailRecipients: "Ops@example.com; noc@example.com\nops@example.com",
    });

    expect(parsed.notificationEmailRecipients).toEqual(["ops@example.com", "noc@example.com"]);
  });

  it("rejects invalid company recipients", () => {
    const parsed = companyInputSchema.safeParse({
      ...baseCompany,
      notificationEmailRecipients: "ops@example.com, invalid",
    });

    expect(parsed.success).toBe(false);
  });

  it("requires Telegram token and chat ID as a complete pair", () => {
    expect(companyInputSchema.safeParse({
      ...baseCompany,
      telegramBotToken: "123456:token",
    }).success).toBe(false);

    expect(companyInputSchema.safeParse({
      ...baseCompany,
      telegramBotToken: "123456:token",
      telegramChatId: "-1001234567890",
    }).success).toBe(true);
  });
});
