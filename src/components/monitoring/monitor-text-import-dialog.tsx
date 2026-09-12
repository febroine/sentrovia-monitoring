"use client";

import { useMemo, useState } from "react";
import { FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { CompanyRecord } from "@/lib/companies/types";
import { MONITOR_CSV_IMPORT_LIMITS } from "@/lib/import-limits";
import { parseMonitorText, parseTextImportTags, type TextImportProtocol } from "@/lib/monitors/text-import";
import type {
  HttpMethod,
  IntervalUnit,
  MonitorPayload,
  MonitorRecord,
  NotificationPref,
} from "@/lib/monitors/types";

const HTTP_METHOD_OPTIONS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

export function MonitorTextImportDialog({
  open,
  onOpenChange,
  onImported,
  initialDefaults,
  companies,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (monitors: MonitorRecord[]) => void;
  initialDefaults: MonitorPayload;
  companies: CompanyRecord[];
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [defaultProtocol, setDefaultProtocol] = useState<TextImportProtocol>("https");
  const [settings, setSettings] = useState<MonitorPayload>(() => ({ ...initialDefaults }));
  const [tagsText, setTagsText] = useState(() => initialDefaults.tags.join(", "));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo(() => {
    if (!text.trim()) {
      return {
        count: 0,
        error: fileName ? "TXT file must include at least one domain." : null,
      };
    }

    try {
      const count = parseMonitorText(text, defaultProtocol).length;
      return {
        count,
        error: count > MONITOR_CSV_IMPORT_LIMITS.maxRows
          ? `Import at most ${MONITOR_CSV_IMPORT_LIMITS.maxRows} domains at a time.`
          : count === 0
            ? "TXT file must include at least one domain."
            : null,
      };
    } catch (caughtError) {
      return {
        count: 0,
        error: caughtError instanceof Error ? caughtError.message : "Unable to read the TXT domain list.",
      };
    }
  }, [defaultProtocol, fileName, text]);

  function updateSetting<K extends keyof MonitorPayload>(key: K, value: MonitorPayload[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
    setError(null);
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".txt")) {
      event.target.value = "";
      setFileName(null);
      setText("");
      setError("Choose a .txt file.");
      return;
    }

    if (file.size > MONITOR_CSV_IMPORT_LIMITS.maxFileBytes) {
      event.target.value = "";
      setFileName(null);
      setText("");
      setError(`TXT file is too large. Choose a file no larger than ${MONITOR_CSV_IMPORT_LIMITS.maxFileBytesLabel}.`);
      return;
    }

    try {
      setFileName(file.name);
      setText(await file.text());
      setError(null);
    } catch {
      setFileName(null);
      setText("");
      setError("Unable to read the selected TXT file.");
    } finally {
      event.target.value = "";
    }
  }

  async function handleImport() {
    setSubmitting(true);
    setError(null);

    try {
      const targets = parseMonitorText(text, defaultProtocol);
      if (targets.length === 0) {
        throw new Error("TXT file must include at least one domain.");
      }
      if (targets.length > MONITOR_CSV_IMPORT_LIMITS.maxRows) {
        throw new Error(`Import at most ${MONITOR_CSV_IMPORT_LIMITS.maxRows} domains at a time.`);
      }
      if (
        settings.slowResponseThresholdMs !== null
        && settings.slowResponseThresholdMs >= settings.timeout
      ) {
        throw new Error("Slow response threshold must be lower than the hard failure timeout.");
      }

      const monitors = targets.map((target) => ({
        ...settings,
        tags: parseTextImportTags(tagsText),
        name: target.name,
        monitorType: "http" as const,
        url: target.url,
      }));
      const response = await fetch("/api/monitors/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monitors,
          source: "txt",
          lineNumbers: targets.map((target) => target.lineNumber),
        }),
      });
      const data = (await response.json()) as { message?: string; monitors?: MonitorRecord[] };

      if (!response.ok || !data.monitors) {
        throw new Error(data.message ?? "Unable to import TXT domain list.");
      }

      onImported(data.monitors);
      onOpenChange(false);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to import TXT domain list.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[min(92vw,46rem)] max-w-[calc(100vw-2rem)] overflow-hidden p-0 sm:max-w-3xl">
        <div className="max-h-[90vh] overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="size-5 text-primary" />
              Import TXT domain list
            </DialogTitle>
            <DialogDescription>
              Add one domain or HTTP(S) URL per line. Blank lines and lines beginning with # are ignored.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="monitor-txt-file">TXT file</Label>
              <label
                htmlFor="monitor-txt-file"
                className="flex cursor-pointer items-center gap-3 rounded-md bg-muted/25 px-4 py-4 hover:bg-primary/10"
              >
                <Upload className="size-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{fileName ?? "Choose a TXT file"}</p>
                  <p className="text-xs text-muted-foreground">Up to {MONITOR_CSV_IMPORT_LIMITS.maxRows} unique domains</p>
                </div>
                <input
                  id="monitor-txt-file"
                  type="file"
                  accept=".txt,text/plain"
                  className="sr-only"
                  onChange={(event) => void handleFileChange(event)}
                />
              </label>
              {text && !preview.error ? (
                <p className="text-xs text-muted-foreground">
                  {preview.count} unique domain{preview.count === 1 ? "" : "s"} ready to import.
                </p>
              ) : null}
            </div>

            {text ? (
              <fieldset className="space-y-4 rounded-md bg-muted/20 p-4">
                <legend className="mb-3 text-sm font-semibold">Settings for imported monitors</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Default protocol" htmlFor="txt-default-protocol">
                    <Select
                      value={defaultProtocol}
                      onValueChange={(value) => {
                        setDefaultProtocol(value as TextImportProtocol);
                        setError(null);
                      }}
                    >
                      <SelectTrigger id="txt-default-protocol"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="https">HTTPS</SelectItem>
                        <SelectItem value="http">HTTP</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Used only when a line has no protocol.</p>
                  </Field>

                  <Field label="Company" htmlFor="txt-company">
                    <Select
                      value={settings.companyId || "none"}
                      onValueChange={(value) => updateSetting("companyId", value === "none" ? "" : String(value))}
                    >
                      <SelectTrigger id="txt-company"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No company</SelectItem>
                        {companies.map((company) => (
                          <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field label="Check interval" htmlFor="txt-interval-value">
                    <div className="flex gap-2">
                      <Input
                        id="txt-interval-value"
                        type="number"
                        min={1}
                        max={1440}
                        value={settings.intervalValue}
                        onChange={(event) => updateSetting("intervalValue", Number(event.target.value) || 1)}
                      />
                      <Select value={settings.intervalUnit} onValueChange={(value) => updateSetting("intervalUnit", value as IntervalUnit)}>
                        <SelectTrigger className="w-28" aria-label="Check interval unit"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sn">sec</SelectItem>
                          <SelectItem value="dk">min</SelectItem>
                          <SelectItem value="sa">hour</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </Field>

                  <Field label="Hard failure timeout (ms)" htmlFor="txt-timeout">
                    <Input
                      id="txt-timeout"
                      type="number"
                      min={1000}
                      max={120000}
                      value={settings.timeout}
                      onChange={(event) => updateSetting("timeout", Number(event.target.value) || 1000)}
                    />
                  </Field>

                  <Field label="Slow response threshold (ms)" htmlFor="txt-slow-threshold">
                    <Input
                      id="txt-slow-threshold"
                      type="number"
                      min={1}
                      max={Math.max(1, settings.timeout - 1)}
                      placeholder="Disabled"
                      value={settings.slowResponseThresholdMs ?? ""}
                      onChange={(event) => {
                        const value = event.target.value.trim();
                        updateSetting("slowResponseThresholdMs", value ? Number(value) || null : null);
                      }}
                    />
                  </Field>

                  <Field label="Consecutive failures required" htmlFor="txt-retries">
                    <Input
                      id="txt-retries"
                      type="number"
                      min={2}
                      max={10}
                      value={settings.retries}
                      onChange={(event) => updateSetting("retries", Number(event.target.value) || 2)}
                    />
                  </Field>

                  <Field label="HTTP method" htmlFor="txt-method">
                    <Select value={settings.method} onValueChange={(value) => updateSetting("method", value as HttpMethod)}>
                      <SelectTrigger id="txt-method"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {HTTP_METHOD_OPTIONS.map((method) => (
                          <SelectItem key={method} value={method}>{method}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field label="Notification preference" htmlFor="txt-notification-preference">
                    <Select
                      value={settings.notificationPref}
                      onValueChange={(value) => updateSetting("notificationPref", value as NotificationPref)}
                    >
                      <SelectTrigger id="txt-notification-preference"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="telegram">Telegram</SelectItem>
                        <SelectItem value="both">Email + Telegram</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field label="Tags" htmlFor="txt-tags">
                    <Input
                      id="txt-tags"
                      value={tagsText}
                      placeholder="production, website"
                      onChange={(event) => {
                        setTagsText(event.target.value);
                        setError(null);
                      }}
                    />
                  </Field>
                </div>

                <div className="grid gap-2 rounded-md bg-muted/20 p-2">
                  <SettingSwitch
                    label="Active monitors"
                    description="Start checking imported domains immediately."
                    checked={settings.isActive}
                    onChange={(checked) => updateSetting("isActive", checked)}
                  />
                  <SettingSwitch
                    label="Public status page"
                    description="Include imported domains on public status pages."
                    checked={settings.publishOnStatusPage}
                    onChange={(checked) => updateSetting("publishOnStatusPage", checked)}
                  />
                  <SettingSwitch
                    label="Slow response notifications"
                    description="Send separate alerts when a response exceeds the threshold."
                    checked={settings.slowResponseAlertsEnabled}
                    onChange={(checked) => updateSetting("slowResponseAlertsEnabled", checked)}
                  />
                  <SettingSwitch
                    label="Check SSL expiry"
                    description="Warn before HTTPS certificates expire."
                    checked={settings.checkSslExpiry}
                    onChange={(checked) => updateSetting("checkSslExpiry", checked)}
                  />
                </div>
              </fieldset>
            ) : null}

            {error || preview.error ? (
              <div role="alert" aria-live="polite" className="rounded-md bg-destructive/10 px-3 py-3 text-sm text-destructive">
                {error ?? preview.error}
              </div>
            ) : null}
          </div>

          <DialogFooter className="pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => void handleImport()} disabled={submitting || preview.count === 0 || Boolean(preview.error)}>
              {submitting
                ? "Importing..."
                : preview.count > 0
                  ? `Import ${preview.count} monitor${preview.count === 1 ? "" : "s"}`
                  : "Import monitors"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function SettingSwitch({
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
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch aria-label={label} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
