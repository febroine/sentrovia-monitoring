import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { MonitorPayload, NotificationPref } from "@/lib/monitors/types";

const MONITOR_TEMPLATE_TOKENS = [
  "{domain}",
  "{url}",
  "{url_link}",
  "{event_state}",
  "{status_code}",
  "{status_label}",
  "{checked_at_local}",
  "{rca_summary}",
  "{organization}",
];

type OnFieldChange = <K extends keyof MonitorPayload>(key: K, value: MonitorPayload[K]) => void;

export function NotificationMonitorSettings({
  values,
  savedEmails,
  onFieldChange,
}: {
  values: MonitorPayload;
  savedEmails: string[];
  onFieldChange: OnFieldChange;
}) {
  return (
    <div className="space-y-4">
      <Field label="Notification preference">
        <Select value={values.notificationPref} onValueChange={(value) => onFieldChange("notificationPref", value as NotificationPref)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="telegram">Telegram</SelectItem>
            <SelectItem value="both">Email + Telegram</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {(values.notificationPref === "email" || values.notificationPref === "both") && (
        <div className="space-y-4">
          <Field label="Saved recipient">
            <Select
              value={savedEmails.includes(values.notifEmail) ? values.notifEmail || "custom" : "custom"}
              onValueChange={(value) => {
                if (value !== "custom") {
                  onFieldChange("notifEmail", String(value));
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a saved recipient" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Custom email</SelectItem>
                {savedEmails.map((email) => (
                  <SelectItem key={email} value={email}>
                    {email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Alert email">
            <Input type="email" value={values.notifEmail} onChange={(event) => onFieldChange("notifEmail", event.target.value)} />
          </Field>
        </div>
      )}

      {(values.notificationPref === "telegram" || values.notificationPref === "both") && (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Bot token">
            <Input value={values.telegramBotToken} onChange={(event) => onFieldChange("telegramBotToken", event.target.value)} />
          </Field>
          <Field label="Chat ID">
            <Input value={values.telegramChatId} onChange={(event) => onFieldChange("telegramChatId", event.target.value)} />
          </Field>
        </div>
      )}
    </div>
  );
}

export function TemplateMonitorSettings({
  values,
  onFieldChange,
}: {
  values: MonitorPayload;
  onFieldChange: OnFieldChange;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/15 p-3">
        <p className="text-sm font-medium">Template variables</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Leave monitor-level templates blank to use the workspace templates from Settings.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {MONITOR_TEMPLATE_TOKENS.map((token) => (
            <span
              key={token}
              className="rounded-full border bg-background px-2.5 py-1 text-[11px] font-mono text-muted-foreground"
            >
              {token}
            </span>
          ))}
        </div>
      </div>

      <Field label="Telegram message template">
        <Textarea rows={4} value={values.telegramTemplate} onChange={(event) => onFieldChange("telegramTemplate", event.target.value)} />
      </Field>
      <Field label="Email subject template">
        <Input value={values.emailSubject} onChange={(event) => onFieldChange("emailSubject", event.target.value)} />
      </Field>
      <Field label="Email body template">
        <Textarea rows={5} value={values.emailBody} onChange={(event) => onFieldChange("emailBody", event.target.value)} />
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
