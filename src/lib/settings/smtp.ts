import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userSettings, workspaceSettings } from "@/lib/db/schema";
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

export async function getSmtpSettings(userId: string, workspaceId?: string): Promise<SmtpSettings | null> {
  const [personalSettings, sharedSettings] = await Promise.all([
    readPersonalSmtpSettings(userId),
    readWorkspaceSmtpSettings(workspaceId),
  ]);
  const settings = sharedSettings
    ? { ...personalSettings, ...normalizeWorkspaceSmtpSettings(sharedSettings) }
    : personalSettings;

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

async function readPersonalSmtpSettings(userId: string) {
  const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  return settings ?? null;
}

async function readWorkspaceSmtpSettings(workspaceId?: string) {
  if (!workspaceId) {
    return null;
  }

  try {
    const [settings] = await db
      .select({ valuesJson: workspaceSettings.valuesJson })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, workspaceId))
      .limit(1);
    return settings?.valuesJson ?? null;
  } catch (error) {
    if (isMissingWorkspaceSettingsTable(error)) {
      return null;
    }
    throw error;
  }
}

function normalizeWorkspaceSmtpSettings(values: Record<string, unknown>) {
  return Object.fromEntries(
    [
      ["smtpHost", "smtp_host"],
      ["smtpPort", "smtp_port"],
      ["smtpUsername", "smtp_username"],
      ["smtpPasswordEncrypted", "smtp_password_encrypted"],
      ["smtpFromEmail", "smtp_from_email"],
      ["smtpDefaultToEmail", "smtp_default_to_email"],
      ["smtpSecure", "smtp_secure"],
      ["smtpRequireTls", "smtp_require_tls"],
      ["smtpInsecureSkipVerify", "smtp_insecure_skip_verify"],
    ].flatMap(([property, legacyColumn]) => {
      if (Object.hasOwn(values, property)) {
        return [[property, values[property]]];
      }
      return Object.hasOwn(values, legacyColumn) ? [[property, values[legacyColumn]]] : [];
    })
  );
}

function isMissingWorkspaceSettingsTable(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const current = error as { code?: string; cause?: unknown };
  return current.code === "42P01" || isMissingWorkspaceSettingsTable(current.cause);
}
