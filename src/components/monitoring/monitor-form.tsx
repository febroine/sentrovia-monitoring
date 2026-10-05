import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, LoaderCircle, PlugZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CompanyRecord } from "@/lib/companies/types";
import type { SettingsPayload } from "@/lib/settings/types";
import type { MonitorPayload } from "@/lib/monitors/types";
import type { MonitorFormError } from "@/stores/use-monitoring-store";
import { CheckMonitorSettings, GeneralMonitorSettings } from "@/components/monitoring/monitor-form-sections";
import {
  NotificationMonitorSettings,
  NotificationTemplatePreview,
  TemplateMonitorSettings,
} from "@/components/monitoring/monitor-form-notification-sections";

type MonitorFormMode = "single" | "bulk";
type MonitorFormTab = "general" | "check" | "notification" | "templates";

// Where each field lives, so a save error can open its tab and point at it. Labels match the form.
const FIELD_LOCATIONS: Record<string, { tab: MonitorFormTab; label?: string }> = {
  name: { tab: "general", label: "Monitor name" },
  companyId: { tab: "general", label: "Company" },
  url: { tab: "general", label: "URL" },
  expectedStatusCodes: { tab: "general", label: "Expected status codes" },
  keywordQuery: { tab: "general", label: "Keyword or phrase" },
  jsonPath: { tab: "general", label: "JSON path" },
  jsonExpectedValue: { tab: "general", label: "Expected value" },
  portNumber: { tab: "general", label: "Port" },
  heartbeatToken: { tab: "general", label: "Heartbeat endpoint" },
  databaseHost: { tab: "general", label: "Database host" },
  databasePort: { tab: "general", label: "Port" },
  databaseName: { tab: "general", label: "Database name" },
  databaseUsername: { tab: "general", label: "Username" },
  databasePassword: { tab: "general", label: "Password" },
  dnsServer: { tab: "general", label: "DNS server" },
  dnsExpectedValues: { tab: "general", label: "Expected values" },
  tags: { tab: "general", label: "Tags" },
  intervalValue: { tab: "check", label: "Check interval" },
  timeout: { tab: "check", label: "Hard failure timeout" },
  slowResponseThresholdMs: { tab: "check", label: "Slow response threshold" },
  retries: { tab: "check", label: "Consecutive failures required" },
  renotifyCount: { tab: "check", label: "Re-notify" },
  method: { tab: "check", label: "HTTP method" },
  ipFamily: { tab: "check", label: "IP family" },
  maxRedirects: { tab: "check", label: "Max redirects" },
  responseMaxLength: { tab: "check", label: "Response max length" },
  notificationPref: { tab: "notification", label: "Notification preference" },
  notificationLanguage: { tab: "notification", label: "Notification language" },
  notifEmail: { tab: "notification", label: "Alert recipients" },
  telegramBotToken: { tab: "notification", label: "Bot token" },
  telegramChatId: { tab: "notification", label: "Chat ID" },
  telegramTemplate: { tab: "notification", label: "Telegram message template" },
};

function locateField(field: string | null, values: MonitorPayload) {
  if (!field) return null;
  if (field === "portHost") {
    return { tab: "general" as const, label: values.monitorType === "dns" ? "Domain name" : "Host" };
  }
  if (FIELD_LOCATIONS[field]) return FIELD_LOCATIONS[field];
  return /Template|Subject|Headline|Body/.test(field) ? { tab: "templates" as const } : null;
}

export function MonitorForm({
  initialValue,
  companies,
  savedEmails,
  settings,
  submitting,
  submitLabel,
  mode = "single",
  monitorId,
  onCancel,
  onSubmit,
  onDirtyChange,
  submitError,
}: {
  initialValue: MonitorPayload;
  companies: CompanyRecord[];
  savedEmails: string[];
  settings: SettingsPayload | null;
  submitting: boolean;
  submitLabel: string;
  mode?: MonitorFormMode;
  monitorId?: string;
  onCancel: () => void;
  onSubmit: (payload: MonitorPayload) => Promise<void>;
  // Reports whether the form differs from the values it was opened with.
  onDirtyChange?: (dirty: boolean) => void;
  // Why the last save failed; the form opens the field's tab and focuses it.
  submitError?: MonitorFormError | null;
}) {
  const [values, setValues] = useState(initialValue);
  const [tagsText, setTagsText] = useState(initialValue.tags.join(", "));
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<MonitorTestResult | null>(null);
  const [tab, setTab] = useState<MonitorFormTab>(mode === "bulk" ? "check" : "general");
  const formRef = useRef<HTMLFormElement>(null);
  const errorLocation = submitError ? locateField(submitError.field, values) : null;
  const errorTab = errorLocation?.tab ?? null;
  const errorLabel = errorLocation && "label" in errorLocation ? errorLocation.label : undefined;

  // A failed save opens the tab holding the field and focuses it, so the cause is in view.
  useEffect(() => {
    if (!submitError || !errorTab) return;
    setTab(errorTab);
    const frame = window.requestAnimationFrame(() => focusFieldByLabel(formRef.current, errorLabel));
    return () => window.cancelAnimationFrame(frame);
  }, [submitError, errorTab, errorLabel]);

  // New starting values (for example workspace defaults arriving after the form opened) replace the
  // form only while it is untouched, so they never wipe what the user has typed.
  const appliedInitialRef = useRef(initialValue);
  useEffect(() => {
    const previous = appliedInitialRef.current;
    appliedInitialRef.current = initialValue;
    if (previous === initialValue) return;
    setValues((current) => (JSON.stringify(current) === JSON.stringify(previous) ? initialValue : current));
    setTagsText((current) => (current === previous.tags.join(", ") ? initialValue.tags.join(", ") : current));
    setTestResult(null);
  }, [initialValue]);

  function setField<K extends keyof MonitorPayload>(key: K, value: MonitorPayload[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setTestResult(null);
  }

  const payload = useMemo(() => buildPayload(values, tagsText), [tagsText, values]);
  const initialPayload = useMemo(() => JSON.stringify(buildPayload(initialValue, initialValue.tags.join(", "))), [initialValue]);
  const dirty = JSON.stringify(payload) !== initialPayload;

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit(payload);
  }

  async function handleTestConnection() {
    setTesting(true);
    setTestResult(null);

    try {
      const response = await fetch("/api/monitors/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monitorId: monitorId ?? null, payload }),
      });
      const data = (await response.json().catch(() => null)) as MonitorTestResponse | null;
      if (!response.ok || !data?.result) {
        throw new Error(data?.message ?? "Unable to test this monitor.");
      }

      setTestResult({ ...data.result, rca: data.rca ?? null });
    } catch (error) {
      setTestResult({
        ok: false,
        status: "down",
        statusCode: null,
        latencyMs: null,
        errorMessage: error instanceof Error ? error.message : "Unable to test this monitor.",
        failureReason: null,
        checkedAt: new Date().toISOString(),
        sslExpiresAt: null,
        rca: null,
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit}>
      <Tabs value={tab} onValueChange={(value) => setTab(value as MonitorFormTab)} className="flex-col">
        <TabsList className="mb-6 grid h-9 w-full grid-cols-4 bg-surface-high">
          <TabsTrigger value="general" className="text-xs">
            General
          </TabsTrigger>
          <TabsTrigger value="check" className="text-xs">
            Check
          </TabsTrigger>
          <TabsTrigger value="notification" className="text-xs">
            Notification
          </TabsTrigger>
          <TabsTrigger value="templates" className="text-xs">
            Templates
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-0">
          <GeneralMonitorSettings
            values={values}
            companies={companies}
            tagsText={tagsText}
            mode={mode}
            onFieldChange={setField}
            onTagsTextChange={(value) => {
              setTagsText(value);
              setTestResult(null);
            }}
          />
        </TabsContent>

        <TabsContent value="check" className="mt-0">
          <CheckMonitorSettings values={values} onFieldChange={setField} />
        </TabsContent>

        <TabsContent value="notification" className="mt-0">
          <NotificationMonitorSettings values={values} savedEmails={savedEmails} companies={companies} settings={settings} existingMonitor={Boolean(monitorId)} monitorId={monitorId ?? undefined} onFieldChange={setField} />
        </TabsContent>

        <TabsContent value="templates" className="mt-0">
          <TemplateMonitorSettings values={values} onFieldChange={setField} />
          {mode === "single" ? (
            <NotificationTemplatePreview
              key={`${values.url}:${values.notificationLanguage}:${values.emailSubject}:${values.emailHeadline}:${values.emailBody}:${values.telegramTemplate}:${values.recoveryEmailSubject}:${values.recoveryEmailHeadline}:${values.recoveryEmailBody}:${values.recoveryTelegramTemplate}:${values.slowResponseEmailSubject}:${values.slowResponseEmailHeadline}:${values.slowResponseEmailBody}:${values.slowResponseTelegramTemplate}:${values.prolongedDowntimeEmailSubject}:${values.prolongedDowntimeEmailHeadline}:${values.prolongedDowntimeEmailBody}:${values.prolongedDowntimeTelegramTemplate}:${values.sslExpiryEmailSubject}:${values.sslExpiryEmailHeadline}:${values.sslExpiryEmailBody}:${values.sslExpiryTelegramTemplate}`}
              payload={payload}
              monitorId={monitorId}
            />
          ) : null}
        </TabsContent>
      </Tabs>

      {mode === "single" && testResult ? <MonitorTestResultPanel result={testResult} /> : null}

      {submitError ? (
        <div role="alert" className="mt-5 flex items-start gap-3 rounded-md bg-destructive/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="min-w-0">
            <p className="font-medium text-destructive">The monitor was not saved.</p>
            <p className="mt-0.5 text-muted-foreground">
              {errorLabel ? <span className="font-medium text-foreground">{TAB_TITLES[errorTab!]} › {errorLabel}: </span> : null}
              {submitError.message}
            </p>
          </div>
        </div>
      ) : null}

      <DialogFooter className="mt-6 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        {mode === "single" ? (
          <Button type="button" variant="outline" onClick={() => void handleTestConnection()} disabled={submitting || testing}>
            {testing ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <PlugZap data-icon="inline-start" />}
            {testing ? "Testing..." : "Test connection"}
          </Button>
        ) : null}
        <Button type="submit" disabled={submitting || testing}>
          {submitting ? "Saving..." : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

const TAB_TITLES: Record<MonitorFormTab, string> = {
  general: "General",
  check: "Check",
  notification: "Notification",
  templates: "Templates",
};

// Focuses the input that follows a field label, opening a collapsed section around it first.
function focusFieldByLabel(form: HTMLFormElement | null, label?: string) {
  if (!form || !label) return;
  const labelElement = Array.from(form.querySelectorAll("label")).find((element) => element.textContent?.trim().startsWith(label));
  const container = labelElement?.parentElement;
  const control = container?.querySelector<HTMLElement>("input:not([type=hidden]), textarea, button, [role=combobox]");
  if (!control) return;
  const details = control.closest("details");
  if (details && !details.open) details.open = true;
  control.focus();
  control.scrollIntoView({ block: "center", behavior: "smooth" });
}

interface MonitorTestResult {
  ok: boolean;
  status: "up" | "down";
  statusCode: number | null;
  latencyMs: number | null;
  errorMessage: string | null;
  failureReason: string | null;
  checkedAt: string;
  sslExpiresAt: string | null;
  rca: { title: string; summary: string; details: string } | null;
}

interface MonitorTestResponse {
  message?: string;
  result?: Omit<MonitorTestResult, "rca">;
  rca?: MonitorTestResult["rca"];
}

function buildPayload(values: MonitorPayload, tagsText: string): MonitorPayload {
  return {
    ...values,
    tags: tagsText
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
  };
}

function MonitorTestResultPanel({ result }: { result: MonitorTestResult }) {
  return (
    <div className={`mt-5 rounded-md px-4 py-3 ${result.ok ? "bg-emerald-500/10" : "bg-destructive/10"}`}>
      <div className="flex items-start gap-3">
        {result.ok ? (
          <CheckCircle2 className="mt-0.5 size-5 text-emerald-500" />
        ) : (
          <AlertTriangle className="mt-0.5 size-5 text-destructive" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{result.ok ? "Connection test passed" : "Connection test failed"}</p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>Status: {result.status.toUpperCase()}</span>
            <span>Response: {result.statusCode ?? "--"}</span>
            <span>Latency: {result.latencyMs === null ? "--" : `${result.latencyMs}ms`}</span>
            {result.failureReason ? <span>Reason: {result.failureReason.replaceAll("_", " ")}</span> : null}
          </div>
          {result.errorMessage ? <p className="mt-2 text-xs text-destructive">{result.errorMessage}</p> : null}
          {result.rca ? (
            <div className="mt-2 rounded-md bg-muted/20 p-3">
              <p className="text-xs font-medium">{result.rca.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{result.rca.summary}</p>
            </div>
          ) : null}
          <p className="mt-2 text-[11px] text-muted-foreground">This test did not save the monitor or send notifications.</p>
        </div>
      </div>
    </div>
  );
}
