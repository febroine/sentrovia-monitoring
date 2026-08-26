"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
    <div className="space-y-4">
      <div className="border-y py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Default Telegram destination</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Used when a Telegram-enabled monitor and its company do not provide their own destination.
            </p>
          </div>
          {settings.notifications.defaultTelegramBotTokenConfigured ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                updateSetting("notifications.defaultTelegramBotToken", "");
                updateSetting("notifications.defaultTelegramBotTokenConfigured", false);
                updateSetting("notifications.defaultTelegramChatId", "");
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="default-telegram-token">Bot token</Label>
            <Input
              id="default-telegram-token"
              type="password"
              value={settings.notifications.defaultTelegramBotToken}
              onChange={(event) => {
                updateSetting("notifications.defaultTelegramBotToken", event.target.value);
                if (event.target.value.trim()) {
                  updateSetting("notifications.defaultTelegramBotTokenConfigured", true);
                }
              }}
              placeholder={settings.notifications.defaultTelegramBotTokenConfigured ? "Stored securely" : "123456:ABC..."}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="default-telegram-chat-id">Chat ID</Label>
            <Input
              id="default-telegram-chat-id"
              value={settings.notifications.defaultTelegramChatId}
              onChange={(event) => updateSetting("notifications.defaultTelegramChatId", event.target.value)}
              placeholder="-1001234567890"
            />
          </div>
        </div>
      </div>
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
    <div className="border-y py-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Send monitor notifications to this webhook.
          </p>
        </div>
        <Switch aria-label={`${title} notifications`} checked={enabled} onCheckedChange={onToggle} />
      </div>
      <Input
        aria-label={`${title} webhook URL`}
        className="mt-4"
        value={url}
        onChange={(event) => onUrlChange(event.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
