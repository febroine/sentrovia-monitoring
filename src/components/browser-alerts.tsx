"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BROWSER_ALERT_PREFERENCES_EVENT,
  browserNotificationPermission,
  playAlertSound,
  readBrowserAlertPreferences,
  type BrowserAlertPreferences,
} from "@/lib/browser-alerts/preferences";
import {
  describeAlertTransition,
  detectAlertTransitions,
  type ConfirmedStates,
  type MonitorAlertSnapshot,
  type MonitorAlertState,
} from "@/lib/browser-alerts/transitions";

const POLL_INTERVAL_MS = 20_000;
// Only one open console tab polls and alerts, so several tabs do not ring at once.
const LEADER_LOCK = "sentrovia-browser-alerts";

// Desktop notifications and an optional sound while a console tab is open, when this browser opted in.
export function BrowserAlerts() {
  const router = useRouter();
  const [preferences, setPreferences] = useState<BrowserAlertPreferences | null>(null);
  const preferencesRef = useRef(preferences);
  const routerRef = useRef(router);

  useEffect(() => {
    preferencesRef.current = preferences;
    routerRef.current = router;
  });

  useEffect(() => {
    const sync = () => setPreferences(readBrowserAlertPreferences());
    sync();
    window.addEventListener(BROWSER_ALERT_PREFERENCES_EVENT, sync);
    // Another tab changed the choice.
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(BROWSER_ALERT_PREFERENCES_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const enabled = Boolean(preferences && (preferences.notifications || preferences.sound));

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const { signal } = controller;

    async function watch() {
      // A tab taking over from a closed one continues from the states that tab last saw.
      const handover = readHandover();
      let confirmed: ConfirmedStates | null = handover?.states ?? null;
      let workspaceId: string | null = handover?.workspaceId ?? null;
      while (!signal.aborted) {
        const snapshot = await loadSnapshot(signal);
        if (snapshot) {
          // Switching workspace starts a new baseline instead of reporting every difference.
          if (snapshot.workspaceId !== workspaceId) confirmed = null;
          workspaceId = snapshot.workspaceId;
          const result = detectAlertTransitions(confirmed, snapshot.monitors);
          confirmed = result.next;
          writeHandover(workspaceId, confirmed);
          announce(result.wentDown, result.recovered);
        }
        await wait(POLL_INTERVAL_MS, signal);
      }
    }

    function announce(wentDown: MonitorAlertSnapshot[], recovered: MonitorAlertSnapshot[]) {
      const current = preferencesRef.current;
      if (!current) return;
      const changes: Array<["down" | "recovered", MonitorAlertSnapshot[]]> = [];
      if (wentDown.length > 0) changes.push(["down", wentDown]);
      if (recovered.length > 0 && current.recoveries) changes.push(["recovered", recovered]);
      if (changes.length === 0) return;

      if (current.sound) playAlertSound(changes[0][0]);
      if (!current.notifications || browserNotificationPermission() !== "granted") return;
      for (const [kind, monitors] of changes) {
        const { title, body } = describeAlertTransition(kind, monitors);
        try {
          const notification = new Notification(title, {
            body,
            tag: `sentrovia-${kind}-${monitors.map((monitor) => monitor.id).join(",")}`,
            requireInteraction: kind === "down",
          });
          notification.onclick = () => {
            window.focus();
            routerRef.current.push(kind === "down" ? "/monitoring?status=down" : "/monitoring");
            notification.close();
          };
        } catch {
          // Some mobile browsers only allow notifications from a service worker.
        }
      }
    }

    if (typeof navigator !== "undefined" && navigator.locks) {
      navigator.locks.request(LEADER_LOCK, { signal }, () => watch()).catch(() => undefined);
    } else {
      void watch();
    }
    return () => controller.abort();
  }, [enabled]);

  return null;
}

const HANDOVER_KEY = "sentrovia.browserAlerts.states";
const HANDOVER_MAX_AGE_MS = 2 * 60_000;

function readHandover(): { workspaceId: string | null; states: ConfirmedStates } | null {
  try {
    const stored = JSON.parse(window.localStorage.getItem(HANDOVER_KEY) ?? "null") as
      | { workspaceId: string | null; savedAt: number; states: Array<[string, MonitorAlertState]> }
      | null;
    if (!stored || Date.now() - stored.savedAt > HANDOVER_MAX_AGE_MS || !Array.isArray(stored.states)) return null;
    return { workspaceId: stored.workspaceId, states: new Map(stored.states) };
  } catch {
    return null;
  }
}

function writeHandover(workspaceId: string | null, states: ConfirmedStates) {
  try {
    window.localStorage.setItem(HANDOVER_KEY, JSON.stringify({ workspaceId, savedAt: Date.now(), states: [...states] }));
  } catch {
    // Without storage a new tab starts from a fresh baseline.
  }
}

async function loadSnapshot(signal: AbortSignal) {
  try {
    const response = await fetch("/api/monitors/alert-states", { cache: "no-store", signal });
    if (!response.ok) return null;
    const body = (await response.json().catch(() => ({}))) as { workspaceId?: string; monitors?: MonitorAlertSnapshot[] };
    return Array.isArray(body.monitors) ? { workspaceId: body.workspaceId ?? null, monitors: body.monitors } : null;
  } catch {
    return null;
  }
}

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      window.clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}
