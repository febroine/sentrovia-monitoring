import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userSettings } from "@/lib/db/schema";
import { decryptValue } from "@/lib/security/encryption";

interface SmtpSettings {
  host: string;
  port: number;
  username: string;
  password: string;
  fromEmail: string;
  defaultToEmail: string;
  secure: boolean;
  requireTls: boolean;
  insecureSkipVerify: boolean;
}

export async function getSmtpSettings(userId: string): Promise<SmtpSettings | null> {
  const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));

  if (!settings?.smtpHost || !settings.smtpFromEmail) {
    return null;
  }

  return {
    host: settings.smtpHost,
    port: settings.smtpPort,
    username: settings.smtpUsername ?? "",
    password: decryptValue(settings.smtpPasswordEncrypted) ?? "",
    fromEmail: settings.smtpFromEmail,
    defaultToEmail: settings.smtpDefaultToEmail ?? "",
    secure: settings.smtpSecure,
    requireTls: settings.smtpRequireTls,
    insecureSkipVerify: settings.smtpInsecureSkipVerify,
  };
}
