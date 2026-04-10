"use client";

import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { SettingsPayload } from "@/lib/settings/types";

export function NotificationChannelsEditor({
  settings,
  updateSetting,
}: {
  settings: SettingsPayload;
  updateSetting: (
    path: string,
    value: string | number | boolean | string[]
  ) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-1">
      <ChannelCard
        title="Discord"
        enabled={settings.notifications.discordEnabled}
        url={settings.notifications.discordWebhookUrl}
        onToggle={(checked) => updateSetting("notifications.discordEnabled", checked)}
        onUrlChange={(value) => updateSetting("notifications.discordWebhookUrl", value)}
        placeholder="https://discord.com/api/webhooks/..."
      />
    </div>
  );
}

function ChannelCard({
  title,
  enabled,
  url,
  onToggle,
  onUrlChange,
  placeholder,
}: {
  title: string;
  enabled: boolean;
  url: string;
  onToggle: (checked: boolean) => void;
  onUrlChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="rounded-xl border bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{title} Channel</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Mirror monitor notifications to this channel through a webhook.
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={onToggle} />
      </div>
      <Input
        className="mt-4"
        value={url}
        onChange={(event) => onUrlChange(event.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
