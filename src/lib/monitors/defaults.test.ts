import { describe, expect, it } from "vitest";
import { buildDefaultMonitorForm } from "@/lib/monitors/defaults";
import { DEFAULT_SETTINGS } from "@/lib/settings/types";

describe("buildDefaultMonitorForm", () => {
  it("uses the selected workspace notification default", () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.notifications.defaultMonitorNotificationPref = "telegram";

    expect(buildDefaultMonitorForm(settings)).toMatchObject({
      notificationPref: "telegram",
      publishOnStatusPage: true,
    });
  });

  it("defaults to email and Telegram with public visibility when settings are unavailable", () => {
    expect(buildDefaultMonitorForm(null)).toMatchObject({
      notificationPref: "both",
      publishOnStatusPage: true,
    });
  });
});
