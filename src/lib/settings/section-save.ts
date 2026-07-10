import type { SettingsPayload } from "@/lib/settings/types";

export type SettingsSaveSection =
  | "all"
  | "alert-conditions"
  | "smtp-delivery"
  | "additional-notification-channels"
  | "notification-templates"
  | "default-monitor-configuration"
  | "workspace-experience"
  | "public-status-page"
  | "retention-and-backups";

type NotificationKey = keyof SettingsPayload["notifications"];

const NOTIFICATION_SECTION_KEYS: Partial<Record<SettingsSaveSection, NotificationKey[]>> = {
  "alert-conditions": [
    "notificationLanguage",
    "notifyOnDown",
    "notifyOnRecovery",
    "notifyOnStatusChange",
    "notifyOnLatency",
    "prolongedDowntimeEnabled",
    "prolongedDowntimeMinutes",
    "alertDedupMinutes",
    "statusCodeAlertCodes",
  ],
  "smtp-delivery": [
    "smtpHost",
    "smtpPort",
    "smtpUsername",
    "smtpPassword",
    "smtpPasswordConfigured",
    "smtpFromEmail",
    "smtpDefaultToEmail",
    "smtpSecure",
    "smtpRequireTls",
    "smtpInsecureSkipVerify",
    "savedEmailRecipients",
  ],
  "additional-notification-channels": ["discordWebhookUrl", "discordEnabled"],
  "notification-templates": [
    "defaultEmailSubjectTemplate",
    "defaultEmailBodyTemplate",
    "defaultTelegramTemplate",
    "recoveryEmailSubjectTemplate",
    "recoveryEmailBodyTemplate",
    "recoveryTelegramTemplate",
    "prolongedDowntimeEmailSubjectTemplate",
    "prolongedDowntimeEmailBodyTemplate",
    "prolongedDowntimeTelegramTemplate",
  ],
};

const TOP_LEVEL_SECTION_KEYS: Partial<Record<SettingsSaveSection, keyof SettingsPayload>> = {
  "default-monitor-configuration": "monitoring",
  "workspace-experience": "appearance",
  "public-status-page": "publicStatus",
  "retention-and-backups": "data",
};

const LANGUAGE_DEPENDENT_TEMPLATE_KEYS = NOTIFICATION_SECTION_KEYS["notification-templates"] ?? [];

export function buildSectionSavePayload(
  persisted: SettingsPayload,
  draft: SettingsPayload,
  section: SettingsSaveSection
) {
  if (section === "all") {
    return structuredClone(draft);
  }

  return mergeSection(structuredClone(persisted), draft, section);
}

export function mergeSavedSection(
  draft: SettingsPayload,
  saved: SettingsPayload,
  section: SettingsSaveSection,
  previouslyPersisted?: SettingsPayload
) {
  if (section === "all") {
    return structuredClone(saved);
  }

  const merged = mergeSection(structuredClone(draft), saved, section);
  if (section === "alert-conditions" && previouslyPersisted) {
    mergeUneditedLanguageTemplates(merged, draft, saved, previouslyPersisted);
  }

  return merged;
}

function mergeSection(
  target: SettingsPayload,
  source: SettingsPayload,
  section: Exclude<SettingsSaveSection, "all">
) {
  const notificationKeys = NOTIFICATION_SECTION_KEYS[section];
  if (notificationKeys) {
    for (const key of notificationKeys) {
      assignNotificationValue(target.notifications, source.notifications, key);
    }
    return target;
  }

  const topLevelKey = TOP_LEVEL_SECTION_KEYS[section];
  if (!topLevelKey) {
    return target;
  }

  assignTopLevelValue(target, source, topLevelKey);
  return target;
}

function assignNotificationValue(
  target: SettingsPayload["notifications"],
  source: SettingsPayload["notifications"],
  key: NotificationKey
) {
  assignValue(target, source, key);
}

function assignTopLevelValue(
  target: SettingsPayload,
  source: SettingsPayload,
  key: keyof SettingsPayload
) {
  assignValue(target, source, key);
}

function assignValue<T, K extends keyof T>(target: T, source: T, key: K) {
  target[key] = structuredClone(source[key]);
}

function mergeUneditedLanguageTemplates(
  target: SettingsPayload,
  draft: SettingsPayload,
  saved: SettingsPayload,
  previouslyPersisted: SettingsPayload
) {
  for (const key of LANGUAGE_DEPENDENT_TEMPLATE_KEYS) {
    if (draft.notifications[key] === previouslyPersisted.notifications[key]) {
      assignNotificationValue(target.notifications, saved.notifications, key);
    }
  }
}
