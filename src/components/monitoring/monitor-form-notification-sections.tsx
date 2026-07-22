import { useState } from "react";
import { Ban, CheckCircle2, Eye, LoaderCircle, Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { MonitorNotificationLanguage, MonitorPayload, NotificationPref } from "@/lib/monitors/types";

const MONITOR_TEMPLATE_TOKENS = [
  "{domain}",
  "{url}",
  "{url_link}",
  "{event_state}",
  "{status_code}",
  "{status_label}",
  "{failure_reason}",
  "{latency_ms}",
  "{slow_threshold_ms}",
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
        <div className="grid grid-cols-2 gap-4">
          <Field label="Bot token">
            <Input value={values.telegramBotToken} onChange={(event) => onFieldChange("telegramBotToken", event.target.value)} />
          </Field>
          <Field label="Chat ID">
            <Input value={values.telegramChatId} onChange={(event) => onFieldChange("telegramChatId", event.target.value)} />
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

type PreviewScenario = "timeout" | "http-500" | "slow-response" | "recovery" | "ssl-expiry";

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
    <div className="mt-5 space-y-4 border-t border-border pt-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label="Preview event">
          <Select value={scenario} onValueChange={(value) => {
            setScenario(value as PreviewScenario);
            setPreview(null);
            setDecision(null);
          }}>
            <SelectTrigger className="sm:w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="timeout">Confirmed timeout</SelectItem>
              <SelectItem value="http-500">HTTP 500 failure</SelectItem>
              <SelectItem value="recovery">Recovery</SelectItem>
              <SelectItem value="slow-response">Slow response</SelectItem>
              <SelectItem value="ssl-expiry">SSL expiry</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Button type="button" variant="outline" onClick={() => void loadPreview()} disabled={loading}>
          {loading ? <LoaderCircle className="animate-spin" /> : <Eye />}
          {loading ? "Simulating..." : "Simulate notification"}
        </Button>
      </div>

      {message ? <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{message}</p> : null}

      {decision ? (
        <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${decision.wouldNotify ? "border-emerald-300/70 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20" : "border-amber-300/70 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20"}`}>
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
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-2 text-xs font-medium">
              <Mail className="size-3.5" /> Email preview
            </div>
            <div className="border-b border-border px-3 py-2">
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
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-2 text-xs font-medium">
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
