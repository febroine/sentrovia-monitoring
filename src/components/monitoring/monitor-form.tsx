import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, LoaderCircle, PlugZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CompanyRecord } from "@/lib/companies/types";
import type { MonitorPayload } from "@/lib/monitors/types";
import { CheckMonitorSettings, GeneralMonitorSettings } from "@/components/monitoring/monitor-form-sections";
import {
  NotificationMonitorSettings,
  NotificationTemplatePreview,
  TemplateMonitorSettings,
} from "@/components/monitoring/monitor-form-notification-sections";

type MonitorFormMode = "single" | "bulk";

export function MonitorForm({
  initialValue,
  companies,
  savedEmails,
  submitting,
  submitLabel,
  mode = "single",
  monitorId,
  onCancel,
  onSubmit,
}: {
  initialValue: MonitorPayload;
  companies: CompanyRecord[];
  savedEmails: string[];
  submitting: boolean;
  submitLabel: string;
  mode?: MonitorFormMode;
  monitorId?: string;
  onCancel: () => void;
  onSubmit: (payload: MonitorPayload) => Promise<void>;
}) {
  const [values, setValues] = useState(initialValue);
  const [tagsText, setTagsText] = useState(initialValue.tags.join(", "));
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<MonitorTestResult | null>(null);

  useEffect(() => {
    setValues(initialValue);
    setTagsText(initialValue.tags.join(", "));
    setTestResult(null);
  }, [initialValue]);

  function setField<K extends keyof MonitorPayload>(key: K, value: MonitorPayload[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setTestResult(null);
  }

  const payload = useMemo(() => buildPayload(values, tagsText), [tagsText, values]);

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
    <form onSubmit={handleSubmit}>
      <Tabs defaultValue={mode === "bulk" ? "check" : "general"} className="flex-col">
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
          <NotificationMonitorSettings values={values} savedEmails={savedEmails} onFieldChange={setField} />
        </TabsContent>

        <TabsContent value="templates" className="mt-0">
          <TemplateMonitorSettings values={values} onFieldChange={setField} />
          {mode === "single" ? (
            <NotificationTemplatePreview
              key={`${values.url}:${values.notificationLanguage}:${values.emailSubject}:${values.emailBody}:${values.telegramTemplate}`}
              payload={payload}
              monitorId={monitorId}
            />
          ) : null}
        </TabsContent>
      </Tabs>

      {mode === "single" && testResult ? <MonitorTestResultPanel result={testResult} /> : null}

      <DialogFooter className="mt-6 border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        {mode === "single" ? (
          <Button type="button" variant="outline" onClick={() => void handleTestConnection()} disabled={submitting || testing}>
            {testing ? <LoaderCircle className="animate-spin" /> : <PlugZap />}
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
    <div className={`mt-5 rounded-lg border px-4 py-3 ${result.ok ? "border-emerald-500/25 bg-emerald-500/5" : "border-destructive/25 bg-destructive/5"}`}>
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
            <div className="mt-2 border-t border-border/70 pt-2">
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
