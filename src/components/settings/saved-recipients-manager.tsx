"use client";

import { useMemo, useState } from "react";
import { MailPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  const availableCount = useMemo(() => recipients.length, [recipients.length]);

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
    <div className="rounded-xl border bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Saved notification recipients</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Store common team mailboxes once, then reuse them in monitor notification settings.
          </p>
        </div>
        <Badge variant="outline">{availableCount} saved</Badge>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <Input
          type="email"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="team-alerts@company.com"
        />
        <Button type="button" variant="outline" onClick={addRecipient} disabled={!canAdd}>
          <MailPlus className="mr-2 h-4 w-4" />
          Add Email
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {recipients.length === 0 ? (
          <p className="text-xs text-muted-foreground">No saved recipients yet.</p>
        ) : (
          recipients.map((email) => (
            <button
              key={email}
              type="button"
              onClick={() => removeRecipient(email)}
              className="rounded-full border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-destructive/30 hover:text-destructive"
            >
              {email}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
