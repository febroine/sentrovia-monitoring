"use client";

import { useState } from "react";
import { MailPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SettingsPayload } from "@/lib/settings/types";

export function SavedRecipientsManager({
  settings,
  updateSetting,
}: {
  settings: SettingsPayload;
  updateSetting: (
    path: string,
    value: string | number | boolean | string[]
  ) => void;
}) {
  const [draft, setDraft] = useState("");
  const recipients = settings.notifications.savedEmailRecipients;
  const normalizedDraft = draft.trim().toLowerCase();
  const canAdd = normalizedDraft.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedDraft);

  function addRecipient() {
    if (!canAdd || recipients.includes(normalizedDraft)) {
      return;
    }

    updateSetting("notifications.savedEmailRecipients", [...recipients, normalizedDraft]);
    setDraft("");
  }

  function removeRecipient(email: string) {
    updateSetting(
      "notifications.savedEmailRecipients",
      recipients.filter((item) => item !== email)
    );
  }

  return (
    <div className="border-y py-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium">Saved notification recipients</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Reusable email addresses for monitor notifications.
          </p>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">{recipients.length} saved</span>
      </div>

      <div className="mt-5 flex flex-col gap-4 sm:flex-row">
        <Input
          type="email"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="team-alerts@company.com"
        />
        <Button type="button" variant="outline" onClick={addRecipient} disabled={!canAdd}>
          <MailPlus className="mr-2 h-4 w-4" />
          Add email
        </Button>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {recipients.length === 0 ? (
          <p className="text-xs text-muted-foreground">No saved recipients</p>
        ) : (
          recipients.map((email) => (
            <button
              key={email}
              type="button"
              onClick={() => removeRecipient(email)}
              className="max-w-full rounded-full border bg-background px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors [overflow-wrap:anywhere] hover:border-destructive/30 hover:text-destructive"
            >
              {email}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
