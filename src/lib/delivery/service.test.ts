import { beforeEach, describe, expect, it, vi } from "vitest";
import type Mail from "nodemailer/lib/mailer";

const mocks = vi.hoisted(() => ({
  createTransport: vi.fn(),
  getSmtpSettings: vi.fn(),
  insertReturning: vi.fn(),
  sendMail: vi.fn(),
  updateReturning: vi.fn(),
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
  },
  getSettings: vi.fn(),
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: mocks.createTransport,
  },
}));

vi.mock("@/lib/db", () => ({
  db: mocks.db,
}));

vi.mock("@/lib/settings/smtp", () => ({
  getSmtpSettings: mocks.getSmtpSettings,
}));

vi.mock("@/lib/settings/service", () => ({
  getSettings: mocks.getSettings,
}));

import {
  readLimitedResponseText,
  retryWebhookQueueForAllUsers,
  sendChannelWebhookDelivery,
  sendEmailDelivery,
  sendTelegramDelivery,
} from "@/lib/delivery/service";

describe("delivery service", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail });
    mocks.sendMail.mockResolvedValue({ accepted: ["alerts@example.com"] });
    mocks.insertReturning.mockResolvedValue([{ id: "delivery-1" }]);
    mocks.updateReturning.mockResolvedValue([{ id: "delivery-1", status: "delivered" }]);
    mocks.db.insert.mockReturnValue({
      values: vi.fn(() => ({ returning: mocks.insertReturning })),
    });
    mocks.db.update.mockReturnValue({
      set: vi.fn(() => ({ where: vi.fn(() => ({ returning: mocks.updateReturning })) })),
    });
    mocks.getSettings.mockResolvedValue(null);
  });

  it("does not build email attachments when SMTP configuration is incomplete", async () => {
    const buildAttachments = vi.fn<() => Promise<Mail.Attachment[] | undefined>>();
    mocks.getSmtpSettings.mockResolvedValue(null);
    mocks.updateReturning.mockResolvedValue([{ id: "delivery-1", status: "failed" }]);

    const result = await sendEmailDelivery({
      userId: "user-1",
      kind: "failure",
      destinationOverride: "alerts@example.com",
      subject: "Down",
      textBody: "Down",
      htmlBody: "<p>Down</p>",
      buildAttachments,
    });

    expect(result?.status).toBe("failed");
    expect(buildAttachments).not.toHaveBeenCalled();
    expect(mocks.createTransport).not.toHaveBeenCalled();
  });

  it("builds email attachments after SMTP configuration is ready", async () => {
    const attachment = {
      filename: "sentrovia-api.jpg",
      content: Buffer.from("image"),
      contentType: "image/jpeg",
    };
    const buildAttachments = vi.fn().mockResolvedValue([attachment]);
    mocks.getSmtpSettings.mockResolvedValue(buildSmtpSettings());

    const result = await sendEmailDelivery({
      userId: "user-1",
      kind: "failure",
      destinationOverride: "alerts@example.com",
      subject: "Down",
      textBody: "Down",
      htmlBody: "<p>Down</p>",
      buildAttachments,
    });

    expect(result?.status).toBe("delivered");
    expect(buildAttachments).toHaveBeenCalledTimes(1);
    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [attachment],
        to: "alerts@example.com",
      })
    );
  });

  it("limits delivery failure response bodies before storing them", async () => {
    const response = new Response("abcdef");

    await expect(readLimitedResponseText(response, 3)).resolves.toBe("abc... [truncated]");
  });

  it("returns complete delivery failure response bodies within the limit", async () => {
    const response = new Response("abc");

    await expect(readLimitedResponseText(response, 3)).resolves.toBe("abc");
  });

  it("does not let disabled webhook endpoints occupy the global retry batch", async () => {
    const where = vi.fn().mockResolvedValue([]);
    mocks.db.select.mockReturnValueOnce({
      from: vi.fn(() => ({ where })),
    });

    await expect(retryWebhookQueueForAllUsers()).resolves.toEqual({ processed: 0 });

    expect(mocks.db.select).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenCalledTimes(1);
  });

  it("fails telegram delivery without calling Telegram when credentials are missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mocks.updateReturning.mockResolvedValue([{ id: "delivery-1", status: "failed" }]);

    const result = await sendTelegramDelivery({
      userId: "user-1",
      kind: "failure",
      botToken: "",
      chatId: "",
      body: "Down",
    });

    expect(result?.status).toBe("failed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("truncates telegram messages to Telegram's message size limit", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendTelegramDelivery({
      userId: "user-1",
      kind: "failure",
      botToken: "123456:telegram-token",
      chatId: "-1001234567890",
      body: "a".repeat(5_000),
    });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(request.body)) as { text: string };

    expect(result?.status).toBe("delivered");
    expect(payload.text).toHaveLength(4096);
    expect(payload.text.endsWith("...[truncated]")).toBe(true);
  });

  it("sends a telegram photo after the text message when a screenshot is available", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendTelegramDelivery({
      userId: "user-1",
      kind: "failure",
      botToken: "123456:telegram-token",
      chatId: "-1001234567890",
      body: "Down",
      photo: {
        filename: "sentrovia-api.jpg",
        content: Buffer.from("image"),
        contentType: "image/jpeg",
      },
    });

    expect(result?.status).toBe("delivered");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/sendMessage");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/sendPhoto");
  });

  it("does not follow redirects for outbound channel webhooks", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    mocks.getSettings.mockResolvedValue({
      notifications: {
        discordEnabled: true,
        discordWebhookUrl: "https://8.8.8.8/hooks/sentrovia",
      },
    });

    const result = await sendChannelWebhookDelivery("user-1", "discord", "test", "Down");
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;

    expect(result?.status).toBe("delivered");
    expect(request.redirect).toBe("manual");
  });

  it("keeps telegram text delivery successful when screenshot upload fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("photo rejected", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendTelegramDelivery({
      userId: "user-1",
      kind: "failure",
      botToken: "123456:telegram-token",
      chatId: "-1001234567890",
      body: "Down",
      photo: {
        filename: "sentrovia-api.jpg",
        content: Buffer.from("image"),
        contentType: "image/jpeg",
      },
    });

    expect(result?.status).toBe("delivered");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Telegram screenshot skipped"));
    warn.mockRestore();
  });
});

function buildSmtpSettings() {
  return {
    host: "smtp.example.com",
    port: 587,
    username: "sentrovia",
    password: "secret",
    fromEmail: "sentrovia@example.com",
    defaultToEmail: "default-alerts@example.com",
    secure: false,
    requireTls: true,
    insecureSkipVerify: false,
  };
}
