import { useState } from "react";
import { Ban, CheckCircle2, Eye, LoaderCircle, Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { MonitorNotificationLanguage, MonitorPayload, NotificationPref } from "@/lib/monitors/types";

const MONITOR_TEMPLATE_TOKENS = [
  "{name}",
  "{domain}",
  "{url}",
  "{url_link}",
  "{event_state}",
  "{status_code}",
  "{status_label}",
  "{failure_reason}",
  "{latency_ms}",
  "{slow_threshold_ms}",
  "{check_duration_ms}",
  "{hard_timeout_ms}",
  "{checked_at}",
  "{checked_at_local}",
  "{downtime_started_at}",
  "{downtime_started_at_local}",
  "{downtime_duration}",
  "{downtime_minutes}",
  "{downtime_hours}",
  "{message}",
  "{rca_type}",
  "{rca_title}",
  "{rca_summary}",
  "{rca_details}",
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

      <Field label="Notification language">
        <Select
          value={values.notificationLanguage}
          onValueChange={(value) => onFieldChange("notificationLanguage", value as MonitorNotificationLanguage)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Workspace default</SelectItem>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="tr">Turkish</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Overrides the workspace language for email and Telegram notifications on this monitor.
        </p>
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
        </div>
      )}

      {(values.notificationPref === "telegram" || values.notificationPref === "both") && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Bot token">
              <Input
                type="password"
                value={values.telegramBotToken}
                onChange={(event) => onFieldChange("telegramBotToken", event.target.value)}
                placeholder="Leave blank to use company or workspace defaults"
              />
            </Field>
            <Field label="Chat ID">
              <Input
                value={values.telegramChatId}
                onChange={(event) => onFieldChange("telegramChatId", event.target.value)}
                placeholder="Leave blank to use company or workspace defaults"
              />
            </Field>
          </div>
          <Field label="Telegram message template">
            <Textarea
              rows={4}
              value={values.telegramTemplate}
              onChange={(event) => onFieldChange("telegramTemplate", event.target.value)}
              placeholder="Leave blank to use the workspace template"
            />
          </Field>
        </div>
      )}

      {canAttachScreenshot && values.notificationPref !== "none" ? (
        <CheckRow
          label="Attach screenshot on confirmed down"
          description="Capture a bounded browser screenshot after outage verification and include it with email or Telegram alerts."
          checked={values.sendOutageScreenshot}
          onChange={(checked) => onFieldChange("sendOutageScreenshot", checked)}
        />
      ) : null}
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
      <div className="rounded-md bg-muted/20 p-3">
        <p className="text-sm font-medium">Template variables</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Leave monitor-level templates blank to use the workspace templates from Settings.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {MONITOR_TEMPLATE_TOKENS.map((token) => (
            <span
              key={token}
              className="rounded-full bg-muted/30 px-2.5 py-1 text-[11px] font-mono text-muted-foreground"
            >
              {token}
            </span>
          ))}
        </div>
      </div>

      <TemplateGroup
        title="Confirmed down"
        description="Templates used after Sentrovia confirms a monitor outage."
      >
        <TemplateField
          label="Email subject"
          value={values.emailSubject}
          onChange={(value) => onFieldChange("emailSubject", value)}
        />
        <TemplateField
          label="Email headline"
          value={values.emailHeadline}
          onChange={(value) => onFieldChange("emailHeadline", value)}
        />
        <TemplateField
          label="Email body"
          multiline
          value={values.emailBody}
          onChange={(value) => onFieldChange("emailBody", value)}
        />
        <TemplateField
          label="Telegram message"
          multiline
          value={values.telegramTemplate}
          onChange={(value) => onFieldChange("telegramTemplate", value)}
        />
      </TemplateGroup>

      <TemplateGroup
        title="Recovery"
        description="Templates used when a confirmed outage returns to a healthy state."
      >
        <TemplateField
          label="Email subject"
          value={values.recoveryEmailSubject}
          onChange={(value) => onFieldChange("recoveryEmailSubject", value)}
        />
        <TemplateField
          label="Email headline"
          value={values.recoveryEmailHeadline}
          onChange={(value) => onFieldChange("recoveryEmailHeadline", value)}
        />
        <TemplateField
          label="Email body"
          multiline
          value={values.recoveryEmailBody}
          onChange={(value) => onFieldChange("recoveryEmailBody", value)}
        />
        <TemplateField
          label="Telegram message"
          multiline
          value={values.recoveryTelegramTemplate}
          onChange={(value) => onFieldChange("recoveryTelegramTemplate", value)}
        />
      </TemplateGroup>

      <TemplateGroup
        title="Slow response"
        description="Templates used when a healthy response exceeds the configured latency threshold."
      >
        <TemplateField
          label="Email subject"
          value={values.slowResponseEmailSubject}
          onChange={(value) => onFieldChange("slowResponseEmailSubject", value)}
        />
        <TemplateField
          label="Email headline"
          value={values.slowResponseEmailHeadline}
          onChange={(value) => onFieldChange("slowResponseEmailHeadline", value)}
        />
        <TemplateField
          label="Email body"
          multiline
          value={values.slowResponseEmailBody}
          onChange={(value) => onFieldChange("slowResponseEmailBody", value)}
        />
        <TemplateField
          label="Telegram message"
          multiline
          value={values.slowResponseTelegramTemplate}
          onChange={(value) => onFieldChange("slowResponseTelegramTemplate", value)}
        />
      </TemplateGroup>

      <TemplateGroup
        title="Prolonged downtime"
        description="Templates used for reminders while a confirmed outage remains active."
      >
        <TemplateField
          label="Email subject"
          value={values.prolongedDowntimeEmailSubject}
          onChange={(value) => onFieldChange("prolongedDowntimeEmailSubject", value)}
        />
        <TemplateField
          label="Email headline"
          value={values.prolongedDowntimeEmailHeadline}
          onChange={(value) => onFieldChange("prolongedDowntimeEmailHeadline", value)}
        />
        <TemplateField
          label="Email body"
          multiline
          value={values.prolongedDowntimeEmailBody}
          onChange={(value) => onFieldChange("prolongedDowntimeEmailBody", value)}
        />
        <TemplateField
          label="Telegram message"
          multiline
          value={values.prolongedDowntimeTelegramTemplate}
          onChange={(value) => onFieldChange("prolongedDowntimeTelegramTemplate", value)}
        />
      </TemplateGroup>

      <TemplateGroup
        title="SSL expiry"
        description="Templates used for certificate-expiry warnings on HTTPS monitors."
      >
        <TemplateField
          label="Email subject"
          value={values.sslExpiryEmailSubject}
          onChange={(value) => onFieldChange("sslExpiryEmailSubject", value)}
        />
        <TemplateField
          label="Email headline"
          value={values.sslExpiryEmailHeadline}
          onChange={(value) => onFieldChange("sslExpiryEmailHeadline", value)}
        />
        <TemplateField
          label="Email body"
          multiline
          value={values.sslExpiryEmailBody}
          onChange={(value) => onFieldChange("sslExpiryEmailBody", value)}
        />
        <TemplateField
          label="Telegram message"
          multiline
          value={values.sslExpiryTelegramTemplate}
          onChange={(value) => onFieldChange("sslExpiryTelegramTemplate", value)}
        />
      </TemplateGroup>
    </div>
  );
}

function TemplateGroup({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="space-y-4 rounded-md bg-muted/10 p-4">
      <legend className="px-1 text-sm font-medium">{title}</legend>
      <p className="-mt-2 text-xs leading-5 text-muted-foreground">{description}</p>
      {children}
    </fieldset>
  );
}

function TemplateField({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  return (
    <Field label={label}>
      {multiline ? (
        <Textarea
          aria-label={label}
          rows={5}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Leave blank to use the workspace template"
        />
      ) : (
        <Input
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Leave blank to use the workspace template"
        />
      )}
    </Field>
  );
}

type PreviewScenario = "timeout" | "http-500" | "slow-response" | "recovery" | "ssl-expiry" | "downtime-reminder";

interface TemplatePreviewResult {
  subject: string;
  textBody: string;
  htmlBody: string;
  telegramBody: string;
}

interface NotificationDecisionResult {
  wouldNotify: boolean;
  reason: string;
  channels: string[];
}

export function NotificationTemplatePreview({
  payload,
  monitorId,
}: {
  payload: MonitorPayload;
  monitorId?: string;
}) {
  const [scenario, setScenario] = useState<PreviewScenario>("timeout");
  const [preview, setPreview] = useState<TemplatePreviewResult | null>(null);
  const [decision, setDecision] = useState<NotificationDecisionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function loadPreview() {
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/notifications/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monitorId: monitorId ?? null, scenario, payload }),
      });
      const data = (await response.json().catch(() => null)) as {
        preview?: TemplatePreviewResult;
        decision?: NotificationDecisionResult;
        message?: string;
      } | null;
      if (!response.ok || !data?.preview) {
        throw new Error(data?.message ?? "Unable to render notification templates.");
      }

      setPreview(data.preview);
      setDecision(data.decision ?? null);
    } catch (error) {
      setPreview(null);
      setDecision(null);
      setMessage(error instanceof Error ? error.message : "Unable to render notification templates.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-5 space-y-4 rounded-lg bg-card/55 p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
        <Field label="Preview event">
          <Select value={scenario} onValueChange={(value) => {
            setScenario(value as PreviewScenario);
            setPreview(null);
            setDecision(null);
          }}>
            <SelectTrigger aria-label="Preview event" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="timeout">Confirmed timeout</SelectItem>
              <SelectItem value="http-500">HTTP 500 failure</SelectItem>
              <SelectItem value="recovery">Recovery</SelectItem>
              <SelectItem value="slow-response">Slow response</SelectItem>
              <SelectItem value="downtime-reminder">Prolonged downtime</SelectItem>
              <SelectItem value="ssl-expiry">SSL expiry</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Button type="button" variant="outline" className="w-full" onClick={() => void loadPreview()} disabled={loading}>
          {loading ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Eye data-icon="inline-start" />}
          {loading ? "Simulating..." : "Simulate notification"}
        </Button>
      </div>

      {message ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{message}</p> : null}

      {decision ? (
        <div className={`flex items-start gap-3 rounded-md px-4 py-3 ${decision.wouldNotify ? "bg-emerald-500/10" : "bg-amber-500/10"}`}>
          {decision.wouldNotify ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : <Ban className="mt-0.5 size-4 shrink-0 text-amber-600" />}
          <div>
            <p className="text-sm font-medium">{decision.wouldNotify ? "Notification eligible" : "Notification suppressed"}</p>
            <p className="text-xs text-muted-foreground">{decision.reason}</p>
            {decision.wouldNotify && decision.channels.length > 0 ? <p className="mt-1 text-xs text-muted-foreground">Channels: {decision.channels.join(", ")}</p> : null}
          </div>
        </div>
      ) : null}

      {preview ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="overflow-hidden rounded-lg bg-background/45">
            <div className="flex items-center gap-2 bg-muted/30 px-3 py-2 text-xs font-medium">
              <Mail className="size-3.5" /> Email preview
            </div>
            <div className="bg-muted/15 px-3 py-2">
              <p className="text-[11px] text-muted-foreground">Subject</p>
              <p className="mt-1 text-sm font-medium">{preview.subject}</p>
            </div>
            <iframe
              title="Email template preview"
              sandbox=""
              srcDoc={preview.htmlBody}
              className="h-72 w-full bg-white"
            />
          </div>
          <div className="overflow-hidden rounded-lg bg-background/45">
            <div className="flex items-center gap-2 bg-muted/30 px-3 py-2 text-xs font-medium">
              <Send className="size-3.5" /> Telegram preview
            </div>
            <pre className="min-h-72 whitespace-pre-wrap break-words p-4 text-xs font-sans leading-5">{preview.telegramBody}</pre>
          </div>
        </div>
      ) : null}
      <p className="text-[11px] text-muted-foreground">Simulation uses the worker decision rules and sample event data. No notification is sent.</p>
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
    <div className="space-y-2">
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
    <label className="flex items-start gap-3 rounded-md bg-muted/20 px-3 py-3 text-sm">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 accent-primary" />
      <span className="flex-1">
        <span className="block">{label}</span>
        <span className="mt-0.5 block text-[11px] text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}
