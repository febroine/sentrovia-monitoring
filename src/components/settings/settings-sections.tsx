"use client";

import type { ReactNode } from "react";
import {
  BellRing,
  FileText,
  FolderArchive,
  Mail,
  Palette,
  Radar,
  Rows3,
} from "lucide-react";
import { AppUpdateCard } from "@/components/settings/app-update-card";
import { NotificationChannelsEditor } from "@/components/settings/notification-channels-editor";
import { BackupRestorePanel } from "@/components/settings/backup-restore-panel";
import { SavedRecipientsManager } from "@/components/settings/saved-recipients-manager";
import { TemplateEditor } from "@/components/settings/template-editor";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { SettingsPayload } from "@/lib/settings/types";

const TEMPLATE_TOKENS = [
  "{domain}",
  "{url}",
  "{url_link}",
  "{event_state}",
  "{status_code}",
  "{status_label}",
  "{checked_at_local}",
  "{downtime_started_at_local}",
  "{downtime_duration}",
  "{downtime_minutes}",
  "{downtime_hours}",
  "{rca_summary}",
  "{organization}",
];

interface TabProps {
  settings: SettingsPayload;
  updateSetting: (
    path: string,
    value: string | number | boolean | string[]
  ) => void;
}

export function NotificationSettingsTab({ settings, updateSetting }: TabProps) {
  return (
    <div className="space-y-4">
      <SectionCard
        title="Alert Conditions"
        description="These switches are read by the worker before sending down, recovery, latency, SSL, or status-change notifications."
        icon={BellRing}
        iconClassName="text-amber-600 dark:text-amber-300"
      >
        <ToggleRow
          label="Site down alerts"
          description="Send a notification when a monitor ends in a failed state."
          checked={settings.notifications.notifyOnDown}
          onChange={(checked) => updateSetting("notifications.notifyOnDown", checked)}
        />
        <ToggleRow
          label="Recovery alerts"
          description="Notify after a previously failing monitor becomes healthy again."
          checked={settings.notifications.notifyOnRecovery}
          onChange={(checked) => updateSetting("notifications.notifyOnRecovery", checked)}
        />
        <ToggleRow
          label="High latency alerts"
          description="Alert when latency crosses the monitor-specific latency threshold."
          checked={settings.notifications.notifyOnLatency}
          onChange={(checked) => updateSetting("notifications.notifyOnLatency", checked)}
        />
        <ToggleRow
          label="SSL expiry alerts"
          description="Warn before monitored certificates approach expiry."
          checked={settings.notifications.notifyOnSslExpiry}
          onChange={(checked) => updateSetting("notifications.notifyOnSslExpiry", checked)}
        />
        <ToggleRow
          label="Status change digest"
          description="Include HTTP status code transitions in outbound notifications."
          checked={settings.notifications.notifyOnStatusChange}
          onChange={(checked) => updateSetting("notifications.notifyOnStatusChange", checked)}
        />
        <ToggleRow
          label="Prolonged downtime reminders"
          description="Send another alert when a monitor has stayed down past the configured reminder interval."
          checked={settings.notifications.prolongedDowntimeEnabled}
          onChange={(checked) => updateSetting("notifications.prolongedDowntimeEnabled", checked)}
        />
        <Field label="Status code watch list" hint="Comma-separated HTTP codes that should trigger code-specific alerts, for example 500,502,503,504.">
          <Input
            value={settings.notifications.statusCodeAlertCodes}
            onChange={(event) => updateSetting("notifications.statusCodeAlertCodes", event.target.value)}
            placeholder="500,502,503,504"
          />
        </Field>
        <Field
          label="Prolonged downtime reminder interval (minutes)"
          hint="Example: 180 means send a 'still down' reminder after 3 hours, then again every 3 hours while the outage continues."
        >
          <Input
            type="number"
            value={settings.notifications.prolongedDowntimeMinutes}
            onChange={(event) =>
              updateSetting("notifications.prolongedDowntimeMinutes", Number(event.target.value) || 180)
            }
          />
        </Field>
        <Field label="Alert dedup window (minutes)" hint="Suppress duplicate notifications of the same kind for the same monitor inside this time window.">
          <Input
            type="number"
            value={settings.notifications.alertDedupMinutes}
            onChange={(event) => updateSetting("notifications.alertDedupMinutes", Number(event.target.value) || 0)}
          />
        </Field>
      </SectionCard>

      <SectionCard
        title="SMTP Delivery"
        description="The worker uses these credentials directly. Passwords are encrypted before they are stored."
        icon={Mail}
        iconClassName="text-sky-600 dark:text-sky-300"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Host">
            <Input
              value={settings.notifications.smtpHost}
              onChange={(event) => updateSetting("notifications.smtpHost", event.target.value)}
              placeholder="smtp.sendgrid.net"
            />
          </Field>
          <Field label="Port">
            <Input
              type="number"
              value={settings.notifications.smtpPort}
              onChange={(event) => updateSetting("notifications.smtpPort", Number(event.target.value) || 587)}
            />
          </Field>
          <Field label="User">
            <Input
              value={settings.notifications.smtpUsername}
              onChange={(event) => updateSetting("notifications.smtpUsername", event.target.value)}
              placeholder="apikey"
            />
          </Field>
          <Field
            label="Password"
            hint={
              settings.notifications.smtpPasswordConfigured
                ? "A password is already stored securely. Enter a new value only if you want to replace it."
                : "No SMTP password is stored yet."
            }
          >
            <Input
              type="password"
              value={settings.notifications.smtpPassword}
              onChange={(event) => updateSetting("notifications.smtpPassword", event.target.value)}
              placeholder="SMTP password"
            />
          </Field>
          <Field label="From email">
            <Input
              type="email"
              value={settings.notifications.smtpFromEmail}
              onChange={(event) => updateSetting("notifications.smtpFromEmail", event.target.value)}
              placeholder="alerts@sentrovia.io"
            />
          </Field>
          <Field label="Default recipient">
            <Input
              type="email"
              value={settings.notifications.smtpDefaultToEmail}
              onChange={(event) => updateSetting("notifications.smtpDefaultToEmail", event.target.value)}
              placeholder="oncall@sentrovia.io"
            />
          </Field>
        </div>
        <SavedRecipientsManager settings={settings} updateSetting={updateSetting} />
        <div className="grid gap-3 md:grid-cols-3">
          <ToggleCard
            label="SSL/TLS secure connection"
            description="Start SMTP over a secure transport."
            checked={settings.notifications.smtpSecure}
            onChange={(checked) => updateSetting("notifications.smtpSecure", checked)}
          />
          <ToggleCard
            label="Require TLS"
            description="Reject servers that cannot upgrade to TLS."
            checked={settings.notifications.smtpRequireTls}
            onChange={(checked) => updateSetting("notifications.smtpRequireTls", checked)}
          />
          <ToggleCard
            label="Insecure skip verify"
            description="Skip certificate verification when your mail server requires it."
            checked={settings.notifications.smtpInsecureSkipVerify}
            onChange={(checked) => updateSetting("notifications.smtpInsecureSkipVerify", checked)}
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Additional Notification Channels"
        description="Mirror the same worker notifications to collaboration tools through incoming webhooks."
        icon={Rows3}
        iconClassName="text-violet-600 dark:text-violet-300"
      >
        <NotificationChannelsEditor settings={settings} updateSetting={updateSetting} />
      </SectionCard>

      <SectionCard
        title="Notification Templates"
        description="These templates are used when a monitor does not override its own email or Telegram content."
        icon={FileText}
        iconClassName="text-emerald-600 dark:text-emerald-300"
      >
        <div className="rounded-xl border bg-muted/20 p-4">
          <p className="text-sm font-medium">Available template tokens</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            You can use these variables in email subject, email body, and Telegram templates.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {TEMPLATE_TOKENS.map((token) => (
              <Badge key={token} variant="outline" className="font-mono text-[11px]">
                {token}
              </Badge>
            ))}
          </div>
        </div>
        <Field label="Default email subject" hint="Available tokens: {domain}, {url}, {status_code}, {status_label}, {event_state}, {rca_summary}">
          <Input
            value={settings.notifications.defaultEmailSubjectTemplate}
            onChange={(event) => updateSetting("notifications.defaultEmailSubjectTemplate", event.target.value)}
          />
        </Field>
        <TemplateEditor
          label="Default email body"
          hint="Use the quick tools for bold, italic, line breaks, and the clickable URL token. Bold and italic styling is rendered in HTML emails."
          value={settings.notifications.defaultEmailBodyTemplate}
          onChange={(value) => updateSetting("notifications.defaultEmailBodyTemplate", value)}
        />
        <TemplateEditor
          label="Default Telegram template"
          hint="Telegram keeps the same token set. Formatting controls are lightweight so the message stays readable across clients."
          rows={6}
          value={settings.notifications.defaultTelegramTemplate}
          onChange={(value) => updateSetting("notifications.defaultTelegramTemplate", value)}
        />
        <Field
          label="Prolonged downtime email subject"
          hint="Use this template for 'still down' reminder emails. Tokens like {downtime_duration} and {downtime_started_at_local} are available here."
        >
          <Input
            value={settings.notifications.prolongedDowntimeEmailSubjectTemplate}
            onChange={(event) =>
              updateSetting("notifications.prolongedDowntimeEmailSubjectTemplate", event.target.value)
            }
          />
        </Field>
        <TemplateEditor
          label="Prolonged downtime email body"
          hint="This template is used only for reminder messages while a monitor remains down past the configured interval."
          value={settings.notifications.prolongedDowntimeEmailBodyTemplate}
          onChange={(value) => updateSetting("notifications.prolongedDowntimeEmailBodyTemplate", value)}
        />
        <TemplateEditor
          label="Prolonged downtime Telegram template"
          hint="Customize the reminder text sent to Telegram while an outage is still active."
          rows={6}
          value={settings.notifications.prolongedDowntimeTelegramTemplate}
          onChange={(value) => updateSetting("notifications.prolongedDowntimeTelegramTemplate", value)}
        />
      </SectionCard>
    </div>
  );
}

export function MonitoringSettingsTab({ settings, updateSetting }: TabProps) {
  return (
    <SectionCard
      title="Default Monitor Configuration"
      description="If a site-level setting is omitted during manual creation or CSV import, these values are applied automatically."
      icon={Radar}
      iconClassName="text-rose-600 dark:text-rose-300"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Default interval" hint="Examples: 1m, 5m, 15m">
          <Input
            value={settings.monitoring.interval}
            onChange={(event) => updateSetting("monitoring.interval", event.target.value)}
            placeholder="5m"
          />
        </Field>
        <Field label="Timeout (ms)" hint="Used by the worker when a monitor does not override timeout.">
          <Input
            type="number"
            value={settings.monitoring.timeout}
            onChange={(event) => updateSetting("monitoring.timeout", Number(event.target.value) || 1000)}
          />
        </Field>
        <Field label="Verification attempts" hint="How many 1-minute confirmation checks must fail in a row before an outage is confirmed and notifications are sent.">
          <Input
            type="number"
            value={settings.monitoring.retries}
            onChange={(event) => updateSetting("monitoring.retries", Number(event.target.value) || 1)}
          />
        </Field>
        <Field label="Worker batch size" hint="Maximum number of due monitors the worker will pull from this workspace during one scheduler cycle.">
          <Input
            type="number"
            value={settings.monitoring.batchSize}
            onChange={(event) => updateSetting("monitoring.batchSize", Number(event.target.value) || 1)}
          />
        </Field>
        <Field label="HTTP method">
          <Select
            value={settings.monitoring.method}
            onValueChange={(value) => updateSetting("monitoring.method", String(value))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Primary region">
          <Input
            value={settings.monitoring.region}
            onChange={(event) => updateSetting("monitoring.region", event.target.value)}
            placeholder="eu-central"
          />
        </Field>
        <Field label="Response max length">
          <Input
            type="number"
            value={settings.monitoring.responseMaxLength}
            onChange={(event) =>
              updateSetting("monitoring.responseMaxLength", Number(event.target.value) || 0)
            }
          />
        </Field>
        <Field label="Max redirects">
          <Input
            type="number"
            value={settings.monitoring.maxRedirects}
            onChange={(event) => updateSetting("monitoring.maxRedirects", Number(event.target.value) || 0)}
          />
        </Field>
        <Field label="Ignore SSL errors by default" hint="Applied automatically when a site-level setting is omitted during monitor creation or CSV import.">
          <div className="rounded-xl border bg-muted/20 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Default SSL bypass</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  New monitors inherit this value unless the monitor explicitly overrides it.
                </p>
              </div>
              <Switch
                checked={settings.monitoring.ignoreSslErrors}
                onCheckedChange={(checked) => updateSetting("monitoring.ignoreSslErrors", checked)}
              />
            </div>
          </div>
        </Field>
      </div>
    </SectionCard>
  );
}

export function AppearanceSettingsTab({ settings, updateSetting }: TabProps) {
  return (
    <SectionCard
      title="Workspace Experience"
      description="These preferences are stored per user and shape dashboard density, motion, and landing behavior."
      icon={Palette}
      iconClassName="text-violet-600 dark:text-violet-300"
    >
      <ToggleRow
        label="Reduce motion"
        description="Tone down animated transitions across the application."
        checked={settings.appearance.reduceMotion}
        onChange={(checked) => updateSetting("appearance.reduceMotion", checked)}
      />
      <ToggleRow
        label="Compact density"
        description="Use denser cards and tables for high-volume operational views."
        checked={settings.appearance.compactDensity}
        onChange={(checked) => updateSetting("appearance.compactDensity", checked)}
      />
      <Field label="Sidebar accent">
        <Select
          value={settings.appearance.sidebarAccent}
          onValueChange={(value) => updateSetting("appearance.sidebarAccent", String(value))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="amber">Amber</SelectItem>
            <SelectItem value="emerald">Emerald</SelectItem>
            <SelectItem value="sky">Sky</SelectItem>
            <SelectItem value="rose">Rose</SelectItem>
            <SelectItem value="violet">Violet</SelectItem>
            <SelectItem value="slate">Slate</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <ToggleRow
        label="Show charts section"
        description="Keep the dashboard focus widgets and analytical cards visible."
        checked={settings.appearance.showChartsSection}
        onChange={(checked) => updateSetting("appearance.showChartsSection", checked)}
      />
      <Field label="Landing page">
        <Select
          value={settings.appearance.dashboardLandingPage}
          onValueChange={(value) => updateSetting("appearance.dashboardLandingPage", String(value))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="dashboard">Dashboard</SelectItem>
            <SelectItem value="monitoring">Monitoring</SelectItem>
            <SelectItem value="companies">Companies</SelectItem>
            <SelectItem value="logs">Logs</SelectItem>
            <SelectItem value="settings">Settings</SelectItem>
          </SelectContent>
        </Select>
      </Field>
    </SectionCard>
  );
}

export function DataSettingsTab({ settings, updateSetting }: TabProps) {
  return (
    <div className="space-y-4">
      <SectionCard
        title="Retention and Backups"
        description="Operational policies for data retention, event cleanup, and automated backup windows."
        icon={FolderArchive}
        iconClassName="text-amber-600 dark:text-amber-300"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Retention period (days)">
            <Input
              type="number"
              value={settings.data.retentionDays}
              onChange={(event) => updateSetting("data.retentionDays", Number(event.target.value) || 30)}
            />
          </Field>
          <Field label="Backup window">
            <Input
              value={settings.data.backupWindow}
              onChange={(event) => updateSetting("data.backupWindow", event.target.value)}
              placeholder="03:00"
            />
          </Field>
          <Field label="Event retention (days)">
            <Input
              type="number"
              value={settings.data.eventRetentionDays}
              onChange={(event) => updateSetting("data.eventRetentionDays", Number(event.target.value) || 30)}
            />
          </Field>
        </div>
        <ToggleRow
          label="Automatic backups"
          description="Create scheduled backups during the configured backup window."
          checked={settings.data.autoBackupEnabled}
          onChange={(checked) => updateSetting("data.autoBackupEnabled", checked)}
        />
        <BackupRestorePanel
          lastBackupAt={settings.data.lastBackupAt}
          onBackupCreated={(value) => updateSetting("data.lastBackupAt", value)}
        />
      </SectionCard>

      <AppUpdateCard settings={settings} updateSetting={updateSetting} />
    </div>
  );
}

function SectionCard({
  title,
  description,
  children,
  icon: Icon,
  iconClassName,
}: {
  title: string;
  description: string;
  children: ReactNode;
  icon?: React.ElementType;
  iconClassName?: string;
}) {
  return (
    <Card>
      <CardHeader className="border-b bg-muted/20 pb-4">
        <div className="flex items-start gap-3">
          {Icon ? (
            <div className="rounded-2xl border border-border/70 bg-background/80 p-2.5 shadow-sm">
              <Icon className={iconClassName ?? "text-primary"} />
            </div>
          ) : null}
          <div className="space-y-1">
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-6">{children}</CardContent>
    </Card>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function ToggleRow({
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
    <div className="flex items-center justify-between gap-4 rounded-xl border bg-card px-4 py-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function ToggleCard({
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
    <div className="rounded-xl border bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <Switch checked={checked} onCheckedChange={onChange} />
      </div>
    </div>
  );
}
