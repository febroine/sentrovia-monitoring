"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Eye, LoaderCircle, MailCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEFAULT_MONITOR_FORM } from "@/lib/monitors/types";
import type { SettingsPayload } from "@/lib/settings/types";

type PreviewScenario = "timeout" | "http-500" | "recovery" | "slow-response" | "downtime-reminder" | "ssl-expiry";
type PreviewTheme = "light" | "dark";

type PreviewResult = {
  subject: string;
  htmlBody: string;
};

const PREVIEW_MONITOR_PAYLOAD = {
  ...DEFAULT_MONITOR_FORM,
  name: "Customer API",
  url: "https://example.com/health",
  notificationPref: "both" as const,
  slowResponseThresholdMs: 3_000,
  renotifyCount: 3,
  checkSslExpiry: true,
};

export function NotificationTemplatePreviewPanel({ settings }: { settings: SettingsPayload }) {
  const [scenario, setScenario] = useState<PreviewScenario>("timeout");
  const [theme, setTheme] = useState<PreviewTheme>("dark");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emailTarget, setEmailTarget] = useState(settings.notifications.smtpDefaultToEmail);
  const [sending, setSending] = useState(false);
  const [sendMessage, setSendMessage] = useState<string | null>(null);
  const templateOverrides = useMemo(
    () => buildTemplateOverrides(settings),
    [settings]
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void requestPreview({ scenario, templateOverrides, signal: controller.signal })
        .then((result) => setPreview(result.preview))
        .catch((requestError: unknown) => {
          if (!controller.signal.aborted) {
            setPreview(null);
            setError(toMessage(requestError));
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 450);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [scenario, templateOverrides]);

  async function refreshPreview() {
    setLoading(true);
    setError(null);
    try {
      const result = await requestPreview({ scenario, templateOverrides });
      setPreview(result.preview);
    } catch (requestError) {
      setPreview(null);
      setError(toMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function sendTestEmail() {
    setSending(true);
    setSendMessage(null);
    try {
      const result = await requestPreview({
        scenario,
        templateOverrides,
        testEmailDestination: emailTarget.trim(),
      });
      setPreview(result.preview);
      setSendMessage(`Test email delivered to ${emailTarget.trim()}.`);
    } catch (requestError) {
      setSendMessage(toMessage(requestError));
    } finally {
      setSending(false);
    }
  }

  const previewHtml = preview
    ? forceEmailTheme(preview.htmlBody, theme)
    : "";

  return (
    <section className="overflow-hidden rounded-lg bg-card/45" aria-labelledby="template-preview-title">
      <div className="flex flex-col gap-4 bg-muted/20 p-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Eye aria-hidden="true" className="size-4 text-primary" />
            <h3 id="template-preview-title" className="text-sm font-semibold">Live email preview</h3>
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            Uses sample monitor data and updates after you edit a template. Nothing is sent automatically.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(180px,1fr)_140px_auto] lg:min-w-[560px]">
          <label className="space-y-1.5 text-xs font-medium">
            <span className="block">Event</span>
            <Select value={scenario} onValueChange={(value) => setScenario(value as PreviewScenario)}>
              <SelectTrigger aria-label="Preview event" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="timeout">Confirmed timeout</SelectItem>
                <SelectItem value="http-500">HTTP 500 failure</SelectItem>
                <SelectItem value="recovery">Recovery</SelectItem>
                <SelectItem value="slow-response">Slow response</SelectItem>
                <SelectItem value="downtime-reminder">Downtime reminder</SelectItem>
                <SelectItem value="ssl-expiry">SSL expiry</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1.5 text-xs font-medium">
            <span className="block">Appearance</span>
            <Select value={theme} onValueChange={(value) => setTheme(value as PreviewTheme)}>
              <SelectTrigger aria-label="Preview appearance" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="light">Light</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <Button type="button" variant="outline" onClick={() => void refreshPreview()} disabled={loading}>
            {loading ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <RefreshCw data-icon="inline-start" />}
            Refresh
          </Button>
        </div>
      </div>

      <div className="space-y-4 p-4">
        {error ? (
          <div role="alert" className="flex flex-col gap-3 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
            <span>{error}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void refreshPreview()}>Retry preview</Button>
          </div>
        ) : null}

        <div className="overflow-hidden rounded-md border border-border bg-background">
          <div className="flex min-h-12 items-center justify-between gap-3 border-b border-border bg-muted/20 px-4 py-2">
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-muted-foreground">Subject</p>
              <p className="truncate text-sm font-medium" title={preview?.subject}>{preview?.subject ?? "Preparing preview…"}</p>
            </div>
            {loading ? <LoaderCircle aria-label="Updating preview" className="size-4 shrink-0 animate-spin text-muted-foreground" /> : null}
          </div>
          {preview ? (
            <iframe
              title={`${theme === "dark" ? "Dark" : "Light"} email template preview`}
              sandbox=""
              srcDoc={previewHtml}
              className={theme === "dark" ? "h-[480px] w-full bg-[#0b1220]" : "h-[480px] w-full bg-[#eef2f7]"}
            />
          ) : (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Preview will appear here.</div>
          )}
        </div>

        <div className="grid gap-3 border-t border-border/70 pt-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <label className="space-y-1.5 text-xs font-medium">
            <span className="block">Test email recipient</span>
            <Input
              type="email"
              autoComplete="email"
              value={emailTarget}
              onChange={(event) => setEmailTarget(event.target.value)}
              placeholder="alerts@example.com"
            />
          </label>
          <Button type="button" onClick={() => void sendTestEmail()} disabled={sending || !emailTarget.trim()}>
            {sending ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <MailCheck data-icon="inline-start" />}
            {sending ? "Sending…" : "Send this test email"}
          </Button>
        </div>
        {sendMessage ? (
          <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
            {!sending && sendMessage.startsWith("Test email delivered") ? <CheckCircle2 aria-hidden="true" className="size-4 text-emerald-500" /> : null}
            {sendMessage}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function buildTemplateOverrides(settings: SettingsPayload) {
  const { notifications } = settings;
  return {
    notificationLanguage: notifications.notificationLanguage,
    notificationEmailBrandName: notifications.notificationEmailBrandName,
    notificationEmailFooterText: notifications.notificationEmailFooterText,
    defaultEmailSubjectTemplate: notifications.defaultEmailSubjectTemplate,
    defaultEmailHeadlineTemplate: notifications.defaultEmailHeadlineTemplate,
    defaultEmailBodyTemplate: notifications.defaultEmailBodyTemplate,
    defaultTelegramTemplate: notifications.defaultTelegramTemplate,
    recoveryEmailSubjectTemplate: notifications.recoveryEmailSubjectTemplate,
    recoveryEmailHeadlineTemplate: notifications.recoveryEmailHeadlineTemplate,
    recoveryEmailBodyTemplate: notifications.recoveryEmailBodyTemplate,
    recoveryTelegramTemplate: notifications.recoveryTelegramTemplate,
    slowResponseEmailSubjectTemplate: notifications.slowResponseEmailSubjectTemplate,
    slowResponseEmailHeadlineTemplate: notifications.slowResponseEmailHeadlineTemplate,
    slowResponseEmailBodyTemplate: notifications.slowResponseEmailBodyTemplate,
    slowResponseTelegramTemplate: notifications.slowResponseTelegramTemplate,
    prolongedDowntimeEmailSubjectTemplate: notifications.prolongedDowntimeEmailSubjectTemplate,
    prolongedDowntimeEmailHeadlineTemplate: notifications.prolongedDowntimeEmailHeadlineTemplate,
    prolongedDowntimeEmailBodyTemplate: notifications.prolongedDowntimeEmailBodyTemplate,
    prolongedDowntimeTelegramTemplate: notifications.prolongedDowntimeTelegramTemplate,
    sslExpiryEmailSubjectTemplate: notifications.sslExpiryEmailSubjectTemplate,
    sslExpiryEmailHeadlineTemplate: notifications.sslExpiryEmailHeadlineTemplate,
    sslExpiryEmailBodyTemplate: notifications.sslExpiryEmailBodyTemplate,
    sslExpiryTelegramTemplate: notifications.sslExpiryTelegramTemplate,
  };
}

async function requestPreview({
  scenario,
  signal,
  templateOverrides,
  testEmailDestination,
}: {
  scenario: PreviewScenario;
  signal?: AbortSignal;
  templateOverrides: ReturnType<typeof buildTemplateOverrides>;
  testEmailDestination?: string;
}) {
  const response = await fetch("/api/notifications/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scenario,
      payload: PREVIEW_MONITOR_PAYLOAD,
      workspaceTemplateOverrides: templateOverrides,
      testEmailDestination: testEmailDestination || undefined,
    }),
    signal,
  });
  const data = (await response.json().catch(() => null)) as { preview?: PreviewResult; message?: string } | null;
  if (!response.ok || !data?.preview) {
    throw new Error(data?.message ?? "Unable to render the notification template.");
  }
  return { preview: data.preview };
}

export function forceEmailTheme(html: string, theme: PreviewTheme) {
  if (theme === "dark") {
    return html.replace(/<body(?![^>]*data-ogsc)/i, '<body data-ogsc="true"');
  }

  return html
    .replace(/\sdata-ogsc=("[^"]*"|'[^']*')/i, "")
    .replace(/content=("|')light dark\1/gi, 'content="light"')
    .replace(
      /@media\s*\(prefers-color-scheme\s*:\s*dark\)/gi,
      "@media (prefers-color-scheme: dark) and (max-width: 0px)"
    );
}

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to update the notification preview.";
}
