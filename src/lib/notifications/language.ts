import type { NotificationLanguage } from "@/lib/settings/types";

// A monitor's own language wins; "default" (or anything unknown) falls back to the workspace language.
export function resolveNotificationLanguage(
  monitorLanguage: string | null | undefined,
  workspaceLanguage: NotificationLanguage
): NotificationLanguage {
  return monitorLanguage === "en" || monitorLanguage === "tr" ? monitorLanguage : workspaceLanguage;
}
