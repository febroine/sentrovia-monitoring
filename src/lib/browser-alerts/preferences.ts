// Browser alerts are a per-browser choice: they only work while a console tab is open in this browser.
export type BrowserAlertPreferences = {
  notifications: boolean;
  sound: boolean;
  recoveries: boolean;
};

export const DEFAULT_BROWSER_ALERT_PREFERENCES: BrowserAlertPreferences = {
  notifications: false,
  sound: false,
  recoveries: true,
};

export const BROWSER_ALERT_PREFERENCES_EVENT = "sentrovia:browser-alerts-updated";
const STORAGE_KEY = "sentrovia.browserAlerts";

export function readBrowserAlertPreferences(): BrowserAlertPreferences {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<BrowserAlertPreferences> | null;
    return {
      notifications: stored?.notifications === true,
      sound: stored?.sound === true,
      recoveries: stored?.recoveries !== false,
    };
  } catch {
    return DEFAULT_BROWSER_ALERT_PREFERENCES;
  }
}

export function writeBrowserAlertPreferences(preferences: BrowserAlertPreferences) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Storage can be unavailable (private windows, blocked site data); the choice then lasts for this page.
  }
  window.dispatchEvent(new CustomEvent(BROWSER_ALERT_PREFERENCES_EVENT, { detail: preferences }));
}

export function browserNotificationPermission(): NotificationPermission | "unsupported" {
  return typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported";
}

let audioContext: AudioContext | null = null;

// A short tone made in the browser: two falling notes for an outage, two rising ones for a recovery.
export function playAlertSound(kind: "down" | "recovered") {
  try {
    audioContext ??= new AudioContext();
    void audioContext.resume();
    const notes = kind === "down" ? [880, 660] : [660, 880];
    const start = audioContext.currentTime + 0.02;
    notes.forEach((frequency, index) => {
      const oscillator = audioContext!.createOscillator();
      const gain = audioContext!.createGain();
      const at = start + index * 0.22;
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
      oscillator.connect(gain).connect(audioContext!.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.21);
    });
  } catch {
    // Audio is unavailable or blocked until the page is interacted with.
  }
}
