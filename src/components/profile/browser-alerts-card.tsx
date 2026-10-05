"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { SectionRail, ToggleRow } from "@/components/settings/settings-section-primitives";
import {
  browserNotificationPermission,
  playAlertSound,
  readBrowserAlertPreferences,
  writeBrowserAlertPreferences,
  type BrowserAlertPreferences,
} from "@/lib/browser-alerts/preferences";

type Permission = NotificationPermission | "unsupported";

export function BrowserAlertsCard() {
  const [preferences, setPreferences] = useState<BrowserAlertPreferences | null>(null);
  const [permission, setPermission] = useState<Permission>("default");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    // Both live in this browser only, so they are read after mounting.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreferences(readBrowserAlertPreferences());
    setPermission(browserNotificationPermission());
  }, []);

  function update(patch: Partial<BrowserAlertPreferences>) {
    if (!preferences) return;
    const next = { ...preferences, ...patch };
    setPreferences(next);
    writeBrowserAlertPreferences(next);
  }

  async function setNotifications(checked: boolean) {
    setMessage(null);
    if (!checked) {
      update({ notifications: false });
      return;
    }
    if (permission === "unsupported") return;
    const result = permission === "granted" ? "granted" : await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") {
      update({ notifications: true });
    } else {
      setMessage("The browser did not allow notifications. Allow them for this site in the browser's site settings, then turn this on again.");
    }
  }

  function sendTest() {
    setMessage(null);
    if (preferences?.sound) playAlertSound("down");
    if (preferences?.notifications && permission === "granted") {
      try {
        new Notification("Sentrovia test notification", { body: "Monitor alerts will look like this.", tag: "sentrovia-test" });
      } catch {
        setMessage("This browser shows notifications only from installed apps, so desktop notifications are not available here.");
        return;
      }
    }
    setMessage("Test sent.");
  }

  if (!preferences) return null;

  return (
    <SectionRail
      title="Browser alerts"
      description="Alerts in this browser while a Sentrovia tab is open, in addition to email and other channels. They follow confirmed outages, like the alert messages."
    >
      <div className="grid gap-2">
        <ToggleRow
          label="Desktop notifications"
          description={
            permission === "unsupported"
              ? "This browser does not support notifications."
              : permission === "denied"
                ? "Notifications are blocked for this site. Allow them in the browser's site settings first."
                : "Show a system notification when a monitor goes down."
          }
          checked={preferences.notifications && permission === "granted"}
          onChange={(checked) => void setNotifications(checked)}
        />
        <ToggleRow
          label="Sound"
          description="Play a short tone when a monitor goes down, also without notifications."
          checked={preferences.sound}
          onChange={(checked) => update({ sound: checked })}
        />
        <ToggleRow
          label="Recoveries"
          description="Also alert when a monitor that was down is back up."
          checked={preferences.recoveries}
          onChange={(checked) => update({ recoveries: checked })}
        />
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={sendTest}
            disabled={!(preferences.sound || (preferences.notifications && permission === "granted"))}
          >
            Send a test alert
          </Button>
          <p className="text-xs text-muted-foreground" aria-live="polite">{message}</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Saved in this browser only. One open tab alerts for all of them; a tab in the background can take up to a minute to notice a change.
        </p>
      </div>
    </SectionRail>
  );
}
