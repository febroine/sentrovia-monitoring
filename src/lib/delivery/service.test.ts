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
    update: vi.fn(),
  },
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

import { sendEmailDelivery } from "@/lib/delivery/service";

describe("delivery service", () => {
  beforeEach(() => {
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
