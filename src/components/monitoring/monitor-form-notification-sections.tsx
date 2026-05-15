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
const EMAIL_RECIPIENT_SPLIT_PATTERN = /[,;\n]/;

export function NotificationMonitorSettings({
  values,
  savedEmails,
  onFieldChange,
}: {
  values: MonitorPayload;
  savedEmails: string[];
  onFieldChange: OnFieldChange;
}) {
  const canAttachScreenshot = values.monitorType === "http" || values.monitorType === "keyword" || values.monitorType === "json";

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
          <Field label="Add saved recipient">
            <Select
              value="custom"
              onValueChange={(value) => {
                if (value !== "custom") {
                  onFieldChange("notifEmail", appendEmailRecipient(values.notifEmail, String(value)));
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a saved recipient to add" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Choose recipient</SelectItem>
                {savedEmails.map((email) => (
                  <SelectItem key={email} value={email}>
                    {email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Alert recipients">
            <Textarea
              rows={3}
              value={values.notifEmail}
              onChange={(event) => onFieldChange("notifEmail", event.target.value)}
              placeholder="ops@example.com, noc@example.com"
            />
            <p className="text-xs text-muted-foreground">Use commas, semicolons, or new lines for multiple email recipients.</p>
          </Field>
          {canAttachScreenshot ? (
            <CheckRow
              label="Attach screenshot on confirmed down"
              description="Capture a bounded browser screenshot after outage verification and attach it to the down email."
              checked={values.sendIncidentScreenshot}
              onChange={(checked) => onFieldChange("sendIncidentScreenshot", checked)}
            />
          ) : null}
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

function appendEmailRecipient(currentValue: string, email: string) {
  const recipients = new Set(
    currentValue
      .split(EMAIL_RECIPIENT_SPLIT_PATTERN)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
  recipients.add(email.trim().toLowerCase());

  return Array.from(recipients).join(", ");
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function CheckRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-md border border-border px-3 py-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 accent-primary" />
      <span className="flex-1">
        <span className="block">{label}</span>
        <span className="mt-0.5 block text-[11px] text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}
