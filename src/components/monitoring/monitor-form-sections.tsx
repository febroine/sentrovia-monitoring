import { DatabaseZap, Globe, Network } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import type { CompanyRecord } from "@/lib/companies/types";
import { getMonitorTypeLabel } from "@/lib/monitors/targets";
import type {
  HttpMethod,
  IntervalUnit,
  IpFamily,
  MonitorPayload,
  MonitorType,
} from "@/lib/monitors/types";

const MONITOR_TYPE_OPTIONS: Array<{ value: MonitorType; icon: typeof Globe; description: string }> = [
  {
    value: "http",
    icon: Globe,
    description: "Full HTTP/HTTPS checks with redirects, SSL handling, and response controls.",
  },
  {
    value: "port",
    icon: Network,
    description: "TCP reachability checks for a host and port without waiting for an HTTP response.",
  },
  {
    value: "postgres",
    icon: DatabaseZap,
    description: "Connect to PostgreSQL and validate the endpoint with a lightweight SELECT 1 query.",
  },
];

type OnFieldChange = <K extends keyof MonitorPayload>(key: K, value: MonitorPayload[K]) => void;

export function GeneralMonitorSettings({
  values,
  companies,
  tagsText,
  onFieldChange,
  onTagsTextChange,
}: {
  values: MonitorPayload;
  companies: CompanyRecord[];
  tagsText: string;
  onFieldChange: OnFieldChange;
  onTagsTextChange: (value: string) => void;
}) {
  const selectedMonitorType = MONITOR_TYPE_OPTIONS.find((option) => option.value === values.monitorType);
  const isHttpMonitor = values.monitorType === "http";
  const isPortMonitor = values.monitorType === "port";
  const isPostgresMonitor = values.monitorType === "postgres";

  return (
    <div className="space-y-4">
      <Field label="Monitor type">
        <Select value={values.monitorType} onValueChange={(value) => onFieldChange("monitorType", value as MonitorType)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONITOR_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {getMonitorTypeLabel(option.value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {selectedMonitorType ? (
        <div className="rounded-lg border border-border/80 bg-muted/10 px-4 py-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-md border border-border/70 bg-background p-2">
              <selectedMonitorType.icon className="size-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">{getMonitorTypeLabel(selectedMonitorType.value)}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{selectedMonitorType.description}</p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4">
        <Field label="Monitor name">
          <Input value={values.name} onChange={(event) => onFieldChange("name", event.target.value)} required />
        </Field>
        <Field label="Company">
          <Select
            value={values.companyId || "none"}
            onValueChange={(value) => {
              const companyId = value === "none" ? "" : String(value);
              const company = companies.find((item) => item.id === companyId);
              onFieldChange("companyId", companyId);
              onFieldChange("company", company?.name ?? "");
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select company" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No company</SelectItem>
              {companies.map((company) => (
                <SelectItem key={company.id} value={company.id}>
                  {company.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {isHttpMonitor ? (
        <Field label="URL">
          <Input
            type="url"
            value={values.url}
            onChange={(event) => onFieldChange("url", event.target.value)}
            placeholder="https://example.com/health"
            required
          />
        </Field>
      ) : null}

      {isPortMonitor ? (
        <div className="grid grid-cols-[minmax(0,1fr)_140px] gap-4">
          <Field label="Host">
            <Input
              value={values.portHost}
              onChange={(event) => onFieldChange("portHost", event.target.value)}
              placeholder="example.com"
              required
            />
          </Field>
          <Field label="Port">
            <Input
              type="number"
              min={1}
              max={65535}
              value={values.portNumber}
              onChange={(event) => onFieldChange("portNumber", Number(event.target.value) || 1)}
              required
            />
          </Field>
        </div>
      ) : null}

      {isPostgresMonitor ? (
        <div className="space-y-4 rounded-lg border border-border/80 bg-muted/10 p-4">
          <div className="grid grid-cols-[minmax(0,1fr)_140px] gap-4">
            <Field label="Database host">
              <Input
                value={values.databaseHost}
                onChange={(event) => onFieldChange("databaseHost", event.target.value)}
                placeholder="db.example.internal"
                required
              />
            </Field>
            <Field label="Port">
              <Input
                type="number"
                min={1}
                max={65535}
                value={values.databasePort}
                onChange={(event) => onFieldChange("databasePort", Number(event.target.value) || 5432)}
                required
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Database name">
              <Input
                value={values.databaseName}
                onChange={(event) => onFieldChange("databaseName", event.target.value)}
                placeholder="production"
                required
              />
            </Field>
            <Field label="Username">
              <Input
                value={values.databaseUsername}
                onChange={(event) => onFieldChange("databaseUsername", event.target.value)}
                placeholder="monitor_user"
                required
              />
            </Field>
          </div>

          <Field label={values.databasePasswordConfigured ? "Password (leave blank to keep current value)" : "Password"}>
            <Input
              type="password"
              value={values.databasePassword}
              onChange={(event) => onFieldChange("databasePassword", event.target.value)}
              placeholder={
                values.databasePasswordConfigured
                  ? "Stored securely. Enter a new password only to rotate it."
                  : "Database password"
              }
            />
          </Field>

          <CheckRow
            label="Require SSL for the database connection"
            description="Use a TLS-secured PostgreSQL session when connecting to the target database."
            checked={values.databaseSsl}
            onChange={(checked) => onFieldChange("databaseSsl", checked)}
          />
        </div>
      ) : null}

      <Field label="Tags">
        <Input
          value={tagsText}
          onChange={(event) => onTagsTextChange(event.target.value)}
          placeholder="api, production, critical"
        />
      </Field>

      <div className="rounded-lg border border-border px-3 py-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Active monitor</p>
            <p className="text-xs text-muted-foreground">Worker will only check monitors that are marked active.</p>
          </div>
          <Switch checked={values.isActive} onCheckedChange={(checked) => onFieldChange("isActive", checked)} />
        </div>
      </div>
    </div>
  );
}

export function CheckMonitorSettings({
  values,
  onFieldChange,
}: {
  values: MonitorPayload;
  onFieldChange: OnFieldChange;
}) {
  const isHttpMonitor = values.monitorType === "http";
  const isPostgresMonitor = values.monitorType === "postgres";
  const isPortMonitor = values.monitorType === "port";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Check interval">
          <div className="flex gap-2">
            <Input
              type="number"
              min={1}
              value={values.intervalValue}
              onChange={(event) => onFieldChange("intervalValue", Number(event.target.value) || 1)}
            />
            <Select value={values.intervalUnit} onValueChange={(value) => onFieldChange("intervalUnit", value as IntervalUnit)}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sn">sec</SelectItem>
                <SelectItem value="dk">min</SelectItem>
                <SelectItem value="sa">hour</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Field>
        <Field label="Timeout (ms)">
          <Input
            type="number"
            min={1000}
            value={values.timeout}
            onChange={(event) => onFieldChange("timeout", Number(event.target.value) || 1000)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Verification attempts">
          <Input
            type="number"
            min={1}
            max={10}
            value={values.retries}
            onChange={(event) => onFieldChange("retries", Number(event.target.value) || 1)}
          />
        </Field>
        <Field label="Re-notify">
          <Select
            value={values.renotifyCount ? String(values.renotifyCount) : "disabled"}
            onValueChange={(value) => onFieldChange("renotifyCount", value === "disabled" ? null : Number(value))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="disabled">Disabled</SelectItem>
              {[1, 3, 5, 10].map((count) => (
                <SelectItem key={count} value={String(count)}>
                  {count} times
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {isHttpMonitor ? (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Field label="HTTP method">
              <Select value={values.method} onValueChange={(value) => onFieldChange("method", value as HttpMethod)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((method) => (
                    <SelectItem key={method} value={method}>
                      {method}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="IP family">
              <Select value={values.ipFamily} onValueChange={(value) => onFieldChange("ipFamily", value as IpFamily)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto</SelectItem>
                  <SelectItem value="ipv4">IPv4</SelectItem>
                  <SelectItem value="ipv6">IPv6</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Max redirects">
              <Input
                type="number"
                min={0}
                max={10}
                value={values.maxRedirects}
                onChange={(event) => onFieldChange("maxRedirects", Number(event.target.value) || 0)}
              />
            </Field>
            <Field label="Response max length">
              <Input
                type="number"
                min={0}
                value={values.responseMaxLength}
                onChange={(event) => onFieldChange("responseMaxLength", Number(event.target.value) || 0)}
              />
            </Field>
          </div>
        </>
      ) : null}

      {isPortMonitor ? (
        <Field label="IP family">
          <Select value={values.ipFamily} onValueChange={(value) => onFieldChange("ipFamily", value as IpFamily)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto</SelectItem>
              <SelectItem value="ipv4">IPv4</SelectItem>
              <SelectItem value="ipv6">IPv6</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      ) : null}

      <Separator />
      <p className="text-xs text-muted-foreground">
        The worker uses the verification attempt count as the outage confirmation threshold. After the first failed
        check, Sentrovia switches to 1-minute verification checks until the threshold is reached or the endpoint
        recovers.
      </p>

      {isHttpMonitor ? (
        <div className="space-y-2">
          <CheckRow
            label="Check SSL expiry"
            description="Alert before the certificate expires."
            checked={values.checkSslExpiry}
            onChange={(checked) => onFieldChange("checkSslExpiry", checked)}
          />
          <CheckRow
            label="Ignore SSL errors"
            description="Continue checks even when TLS validation fails."
            checked={values.ignoreSslErrors}
            onChange={(checked) => onFieldChange("ignoreSslErrors", checked)}
          />
          <CheckRow
            label="Enable cache buster"
            description="Append a random query string to bypass caches."
            checked={values.cacheBuster}
            onChange={(checked) => onFieldChange("cacheBuster", checked)}
          />
          <CheckRow
            label="Save error pages"
            description="Keep the response body for failed checks."
            checked={values.saveErrorPages}
            onChange={(checked) => onFieldChange("saveErrorPages", checked)}
          />
          <CheckRow
            label="Save success pages"
            description="Store successful responses for audit/debugging."
            checked={values.saveSuccessPages}
            onChange={(checked) => onFieldChange("saveSuccessPages", checked)}
          />
        </div>
      ) : (
        <div className="rounded-lg border border-border/80 bg-muted/10 px-4 py-3 text-xs leading-5 text-muted-foreground">
          {isPostgresMonitor
            ? "PostgreSQL monitors open a database session and run a lightweight SELECT 1 check. HTTP-specific options stay disabled for this monitor type."
            : "Port monitors validate raw TCP reachability. HTTP redirects, response body limits, SSL expiry, and cache busters do not apply here."}
        </div>
      )}
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
