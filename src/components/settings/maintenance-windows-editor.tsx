"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { SettingsPayload } from "@/lib/settings/types";

type WindowItem = SettingsPayload["maintenanceWindows"][number];

export function MaintenanceWindowsEditor({
  windows,
  updateSetting,
}: {
  windows: SettingsPayload["maintenanceWindows"];
  updateSetting: (
    path: string,
    value: string | number | boolean | string[] | SettingsPayload["maintenanceWindows"]
  ) => void;
}) {
  function updateWindow(id: string, patch: Partial<WindowItem>) {
    updateSetting(
      "maintenanceWindows",
      windows.map((window) => (window.id === id ? { ...window, ...patch } : window))
    );
  }

  function addWindow() {
    const now = new Date();
    const later = new Date(now.getTime() + 60 * 60 * 1000);
    const nextWindow: WindowItem = {
      id: crypto.randomUUID(),
      name: "Planned maintenance",
      startsAt: now.toISOString(),
      endsAt: later.toISOString(),
      timezone: "Europe/Istanbul",
      isActive: true,
      suppressNotifications: true,
    };

    updateSetting("maintenanceWindows", [...windows, nextWindow]);
  }

  function removeWindow(id: string) {
    updateSetting(
      "maintenanceWindows",
      windows.filter((window) => window.id !== id)
    );
  }

  return (
    <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Maintenance windows</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Active windows suppress notifications while keeping checks running.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addWindow}>
          <Plus className="mr-2 h-4 w-4" />
          Add Window
        </Button>
      </div>

      <div className="space-y-3">
        {windows.length === 0 ? (
          <p className="text-xs text-muted-foreground">No maintenance windows configured yet.</p>
        ) : (
          windows.map((window) => (
            <div key={window.id} className="rounded-xl border bg-background p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Name">
                  <Input value={window.name} onChange={(event) => updateWindow(window.id, { name: event.target.value })} />
                </Field>
                <Field label="Timezone">
                  <Input
                    value={window.timezone}
                    onChange={(event) => updateWindow(window.id, { timezone: event.target.value })}
                    placeholder="Europe/Istanbul"
                  />
                </Field>
                <Field label="Starts at">
                  <Input
                    type="datetime-local"
                    value={toInputDateTime(window.startsAt)}
                    onChange={(event) => updateWindow(window.id, { startsAt: toIsoString(event.target.value) })}
                  />
                </Field>
                <Field label="Ends at">
                  <Input
                    type="datetime-local"
                    value={toInputDateTime(window.endsAt)}
                    onChange={(event) => updateWindow(window.id, { endsAt: toIsoString(event.target.value) })}
                  />
                </Field>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <ToggleRow
                  label="Window active"
                  checked={window.isActive}
                  onChange={(checked) => updateWindow(window.id, { isActive: checked })}
                />
                <ToggleRow
                  label="Suppress notifications"
                  checked={window.suppressNotifications}
                  onChange={(checked) => updateWindow(window.id, { suppressNotifications: checked })}
                />
              </div>

              <div className="mt-3 flex justify-end">
                <Button type="button" variant="ghost" size="sm" onClick={() => removeWindow(window.id)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Remove
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border px-3 py-3">
      <p className="text-sm text-muted-foreground">{label}</p>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function toInputDateTime(value: string) {
  return new Date(value).toISOString().slice(0, 16);
}

function toIsoString(value: string) {
  return value ? new Date(value).toISOString() : new Date().toISOString();
}
