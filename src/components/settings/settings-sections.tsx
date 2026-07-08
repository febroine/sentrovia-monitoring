"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  BellRing,
  Check,
  Clipboard,
  DownloadCloud,
  ExternalLink,
  FileText,
  FolderArchive,
  Mail,
  Palette,
  RadioTower,
  Radar,
  RefreshCw,
  Rows3,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { TIME_ZONE_OPTIONS } from "@/lib/time";

const TEMPLATE_TOKENS = [
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
  "{downtime_started_at_local}",
  "{downtime_duration}",
  "{downtime_minutes}",
  "{downtime_hours}",
  "{rca_summary}",
  "{organization}",
];

interface TabProps {
  settings: SettingsPayload;
  saving: boolean;
  saveSettings: () => Promise<void>;
  updateSetting: (
    path: string,
    value: string | number | boolean | string[]
  ) => void;
}

export function NotificationSettingsTab({ settings, saving, saveSettings, updateSetting }: TabProps) {
  const { saveSection, savingSection } = useSectionSave(saveSettings);

  return (
    <div className="space-y-6">
      <SectionCard
        title="Alert Conditions"
        description="These switches are read by the worker before sending down, recovery, latency, SSL, or status-change notifications."
        icon={BellRing}
        iconClassName="text-amber-600 dark:text-amber-300"
        action={
          <SectionSaveButton
            sectionId="alert-conditions"
            saving={saving}
            savingSection={savingSection}
            onSave={saveSection}
          />
        }
      >
        <Field label="Notification language" hint="Email and Telegram notification templates use this language unless a monitor has a custom override.">
          <Select
            value={settings.notifications.notificationLanguage}
            onValueChange={(value) => updateSetting("notifications.notificationLanguage", String(value))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="tr">Turkish</SelectItem>
            </SelectContent>
          </Select>
        </Field>
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
          label="Status change digest"
          description="Include HTTP status code transitions in outbound notifications."
          checked={settings.notifications.notifyOnStatusChange}
          onChange={(checked) => updateSetting("notifications.notifyOnStatusChange", checked)}
        />
        <ToggleRow
          label="Slow response alerts"
          description="Notify when a monitor stays online but exceeds its slow response threshold."
          checked={settings.notifications.notifyOnLatency}
          onChange={(checked) => updateSetting("notifications.notifyOnLatency", checked)}
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
        action={
          <SectionSaveButton
            sectionId="smtp-delivery"
            saving={saving}
            savingSection={savingSection}
            onSave={saveSection}
          />
        }
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
        <div className="grid gap-4 md:grid-cols-3">
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
        action={
          <SectionSaveButton
            sectionId="additional-notification-channels"
            saving={saving}
            savingSection={savingSection}
            onSave={saveSection}
          />
        }
      >
        <NotificationChannelsEditor settings={settings} updateSetting={updateSetting} />
      </SectionCard>

      <SectionCard
        title="Notification Templates"
        description="These templates are used when a monitor does not override its own email or Telegram content."
        icon={FileText}
        iconClassName="text-emerald-600 dark:text-emerald-300"
        action={
          <SectionSaveButton
            sectionId="notification-templates"
            saving={saving}
            savingSection={savingSection}
            onSave={saveSection}
          />
        }
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
        <Field label="Default email subject" hint="Available tokens: {domain}, {url}, {status_code}, {status_label}, {failure_reason}, {event_state}, {rca_summary}">
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
          label="Recovery (UP) email subject"
          hint="Used when a previously down monitor becomes healthy again."
        >
          <Input
            value={settings.notifications.recoveryEmailSubjectTemplate}
            onChange={(event) => updateSetting("notifications.recoveryEmailSubjectTemplate", event.target.value)}
          />
        </Field>
        <TemplateEditor
          label="Recovery (UP) email body"
          hint="This template is used only for UP/recovery notifications."
          value={settings.notifications.recoveryEmailBodyTemplate}
          onChange={(value) => updateSetting("notifications.recoveryEmailBodyTemplate", value)}
        />
        <TemplateEditor
          label="Recovery (UP) Telegram template"
          hint="Customize the Telegram message sent when the monitor recovers."
          rows={6}
          value={settings.notifications.recoveryTelegramTemplate}
          onChange={(value) => updateSetting("notifications.recoveryTelegramTemplate", value)}
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

export function MonitoringSettingsTab({ settings, saving, saveSettings, updateSetting }: TabProps) {
  const { saveSection, savingSection } = useSectionSave(saveSettings);

  return (
    <SectionCard
      title="Default Monitor Configuration"
      description="If a site-level setting is omitted during manual creation or CSV import, these values are applied automatically."
      icon={Radar}
      iconClassName="text-rose-600 dark:text-rose-300"
      action={
        <SectionSaveButton
          sectionId="default-monitor-configuration"
          saving={saving}
          savingSection={savingSection}
          onSave={saveSection}
        />
      }
    >
      <div className="rounded-2xl border bg-muted/15 p-4">
        <p className="text-sm font-medium">Override behavior</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          These values fill the gaps when a monitor is created manually or imported from CSV. If a monitor defines its
          own setting later, the site-level value always wins.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border bg-muted/15 p-5">
          <div className="space-y-1">
            <p className="text-sm font-medium">Scheduling and execution</p>
            <p className="text-xs leading-5 text-muted-foreground">
              Control how often the worker checks monitors and how many confirmation attempts are required.
            </p>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Default interval" hint="Examples: 30s, 5m, 1h. The numeric value must be between 1 and 1440.">
              <Input
                value={settings.monitoring.interval}
                onChange={(event) => updateSetting("monitoring.interval", event.target.value)}
                placeholder="5m"
              />
            </Field>
            <Field label="Timeout (ms)" hint="Used by the worker when a monitor does not override timeout.">
              <Input
                type="number"
                min={1000}
                max={120000}
                step={500}
                value={settings.monitoring.timeout}
                onChange={(event) => updateSetting("monitoring.timeout", Number(event.target.value) || 1000)}
              />
            </Field>
            <Field
              label="Verification attempts"
              hint="How many 1-minute confirmation checks must fail before an outage is confirmed."
            >
              <Input
                type="number"
                min={1}
                max={10}
                value={settings.monitoring.retries}
                onChange={(event) => updateSetting("monitoring.retries", Number(event.target.value) || 1)}
              />
            </Field>
            <Field
              label="Worker batch size"
              hint="Maximum number of due monitors the worker will claim in one scheduler cycle."
            >
              <Input
                type="number"
                min={1}
                max={500}
                value={settings.monitoring.batchSize}
                onChange={(event) => updateSetting("monitoring.batchSize", Number(event.target.value) || 1)}
              />
            </Field>
          </div>
        </div>

        <div className="rounded-2xl border bg-muted/15 p-5">
          <div className="space-y-1">
            <p className="text-sm font-medium">HTTP request defaults</p>
            <p className="text-xs leading-5 text-muted-foreground">
              These values shape the default request that Sentrovia builds before monitor-specific overrides are applied.
            </p>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
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
            <Field label="Response max length" hint="0 keeps the current unlimited behavior for new monitors.">
              <Input
                type="number"
                min={0}
                max={100000}
                value={settings.monitoring.responseMaxLength}
                onChange={(event) =>
                  updateSetting("monitoring.responseMaxLength", Number(event.target.value) || 0)
                }
              />
            </Field>
            <Field label="Max redirects" hint="0 disables redirect following for monitors that do not override it.">
              <Input
                type="number"
                min={0}
                max={10}
                value={settings.monitoring.maxRedirects}
                onChange={(event) => updateSetting("monitoring.maxRedirects", Number(event.target.value) || 0)}
              />
            </Field>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ToggleCard
          label="Check SSL expiry"
          description="New monitors inherit certificate expiry checks unless the monitor overrides it."
          checked={settings.monitoring.checkSslExpiry}
          onChange={(checked) => updateSetting("monitoring.checkSslExpiry", checked)}
        />
        <ToggleCard
          label="Ignore SSL errors"
          description="Apply SSL bypass by default when a new monitor does not explicitly choose a value."
          checked={settings.monitoring.ignoreSslErrors}
          onChange={(checked) => updateSetting("monitoring.ignoreSslErrors", checked)}
        />
        <ToggleCard
          label="Enable cache buster"
          description="Append a cache-busting query string by default to avoid stale CDN responses."
          checked={settings.monitoring.cacheBuster}
          onChange={(checked) => updateSetting("monitoring.cacheBuster", checked)}
        />
        <ToggleCard
          label="Save error pages"
          description="Keep failed HTTP response bodies by default for RCA and template usage."
          checked={settings.monitoring.saveErrorPages}
          onChange={(checked) => updateSetting("monitoring.saveErrorPages", checked)}
        />
        <ToggleCard
          label="Save success pages"
          description="Store successful HTTP responses by default when the monitor does not override it."
          checked={settings.monitoring.saveSuccessPages}
          onChange={(checked) => updateSetting("monitoring.saveSuccessPages", checked)}
        />
      </div>
    </SectionCard>
  );
}

export function AppearanceSettingsTab({ settings, saving, saveSettings, updateSetting }: TabProps) {
  const { saveSection, savingSection } = useSectionSave(saveSettings);

  return (
    <SectionCard
      title="Workspace Experience"
      description="These preferences are stored per user and shape dashboard density, motion, and landing behavior."
      icon={Palette}
      iconClassName="text-violet-600 dark:text-violet-300"
      action={
        <SectionSaveButton
          sectionId="workspace-experience"
          saving={saving}
          savingSection={savingSection}
          onSave={saveSection}
        />
      }
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
      <ToggleRow
        label="High contrast surfaces"
        description="Increase panel and border contrast for darker environments and large wallboard screens."
        checked={settings.appearance.highContrastSurfaces}
        onChange={(checked) => updateSetting("appearance.highContrastSurfaces", checked)}
      />
      <Field label="Timezone">
        <Select
          value={settings.appearance.timeZone}
          onValueChange={(value) => updateSetting("appearance.timeZone", String(value))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIME_ZONE_OPTIONS.map((timeZone) => (
              <SelectItem key={timeZone} value={timeZone}>
                {timeZone}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <ToggleRow
        label="24-hour clock"
        description="Show dashboard timestamps in 24-hour format instead of locale AM/PM formatting."
        checked={settings.appearance.use24HourClock}
        onChange={(checked) => updateSetting("appearance.use24HourClock", checked)}
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
      <ToggleRow
        label="Incident banner"
        description="Show a dashboard banner when one or more monitors are currently offline."
        checked={settings.appearance.showIncidentBanner}
        onChange={(checked) => updateSetting("appearance.showIncidentBanner", checked)}
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

export function PublicStatusSettingsTab({ settings, saving, saveSettings, updateSetting }: TabProps) {
  const { saveSection, savingSection } = useSectionSave(saveSettings);
  const statusPath = settings.publicStatus.slug ? `/status/${settings.publicStatus.slug}` : "/status/your-status-slug";

  return (
    <SectionCard
      title="Public Status Page"
      description="Publish a read-only status page that exposes active monitor health without requiring a login."
      icon={RadioTower}
      iconClassName="text-rose-600 dark:text-rose-300"
      action={
        <SectionSaveButton
          sectionId="public-status-page"
          saving={saving}
          savingSection={savingSection}
          onSave={saveSection}
        />
      }
    >
      <ToggleRow
        label="Publish public status page"
        description="Anyone with the status URL can view active service health when this is enabled."
        checked={settings.publicStatus.enabled}
        onChange={(checked) => updateSetting("publicStatus.enabled", checked)}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Status page slug" hint="Use lowercase letters, numbers, and hyphens. This becomes the public URL path.">
          <Input
            value={settings.publicStatus.slug}
            onChange={(event) => updateSetting("publicStatus.slug", toSlugInput(event.target.value))}
            placeholder="sentrovia-status"
          />
        </Field>
        <Field label="Public URL">
          <div className="flex min-h-10 items-center gap-2 rounded-md border bg-muted/20 px-3 text-sm text-muted-foreground">
            <ExternalLink className="h-4 w-4 shrink-0" />
            <span className="truncate">{statusPath}</span>
          </div>
        </Field>
      </div>
      <Field label="Page title" hint="Leave empty to use your organization name.">
        <Input
          value={settings.publicStatus.title}
          onChange={(event) => updateSetting("publicStatus.title", event.target.value)}
          placeholder="Sentrovia service status"
        />
      </Field>
      <Field label="Summary" hint="Shown at the top of the public status page.">
        <Input
          value={settings.publicStatus.summary}
          onChange={(event) => updateSetting("publicStatus.summary", event.target.value)}
          placeholder="Live service availability and active incident summary."
        />
      </Field>
    </SectionCard>
  );
}

export function DataSettingsTab({ settings, saving, saveSettings, updateSetting }: TabProps) {
  const { saveSection, savingSection } = useSectionSave(saveSettings);
  const isAdmin = settings.profile.role === "admin";

  return (
    <SectionCard
      title="Retention and Backups"
      description="Operational policies for data retention, event cleanup, and automated backup windows."
      icon={FolderArchive}
      iconClassName="text-amber-600 dark:text-amber-300"
      action={
        <SectionSaveButton
          sectionId="retention-and-backups"
          saving={saving}
          savingSection={savingSection}
          onSave={saveSection}
        />
      }
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
      {isAdmin ? (
        <BackupRestorePanel
          lastBackupAt={settings.data.lastBackupAt}
          onBackupCreated={(value) => updateSetting("data.lastBackupAt", value)}
        />
      ) : (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            Backup export and restore are available to administrators only.
          </CardContent>
        </Card>
      )}
    </SectionCard>
  );
}

type UpdateStatus = {
  currentVersion: string;
  repository: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
  releaseUrl: string | null;
  releaseName: string | null;
  publishedAt: string | null;
  notes: string | null;
  checkedAt: string;
  status: "ok" | "error" | "unconfigured";
  message: string;
  recommendedCommands: string[];
  dockerCommands: string[];
  serviceCommands: string[];
  backupReminder: string;
  requiresManualAction: boolean;
};

type UpdateInstallProfile = "docker" | "service";

export function UpdateAssistantTab() {
  const [update, setUpdate] = useState<UpdateStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [installProfile, setInstallProfile] = useState<UpdateInstallProfile>("docker");
  const [copiedProfile, setCopiedProfile] = useState<UpdateInstallProfile | null>(null);

  async function loadUpdateStatus() {
    setLoading(true);
    try {
      const response = await fetch("/api/updates", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as { update?: UpdateStatus; message?: string };
      if (!response.ok) {
        throw new Error(data.message ?? "Unable to check for updates.");
      }

      setUpdate(data.update ?? null);
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to check for updates.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUpdateStatus();
  }, []);

  const selectedCommands = update
    ? installProfile === "docker"
      ? update.dockerCommands
      : update.serviceCommands
    : [];

  async function copySelectedCommands() {
    if (selectedCommands.length === 0) {
      return;
    }

    try {
      await navigator.clipboard.writeText(selectedCommands.join("\n"));
      setCopiedProfile(installProfile);
      window.setTimeout(() => setCopiedProfile(null), 1800);
    } catch {
      setMessage("Unable to copy commands. Select the command block manually.");
    }
  }

  return (
    <SectionCard
      title="Update Assistant"
      description="Check the latest GitHub release and follow safe host-side update commands."
      icon={DownloadCloud}
      iconClassName="text-emerald-600 dark:text-emerald-300"
    >
      {message ? <div className="rounded-lg border px-4 py-3 text-sm">{message}</div> : null}
      <div className="grid gap-3 md:grid-cols-3">
        <UpdateMetric label="Installed" value={update?.currentVersion ?? "-"} />
        <UpdateMetric label="Latest" value={update?.latestVersion ?? "-"} />
        <UpdateMetric label="Status" value={resolveUpdateStatusLabel(update, loading)} />
      </div>
      <UpdateStatusBanner update={update} loading={loading} />
      {update?.backupReminder ? (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {update.backupReminder}
        </div>
      ) : null}
      <ReleaseNotes update={update} />
      {update ? (
        <div className="space-y-3 rounded-xl border bg-muted/15 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-medium">Host-side update commands</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Sentrovia does not self-update from the browser. Run these commands on the server that hosts the app.
              </p>
            </div>
            <ProfileSelector value={installProfile} onChange={setInstallProfile} />
          </div>
          {update.status === "unconfigured" ? <RepositoryHint /> : null}
          <CommandBlock
            commands={selectedCommands}
            copied={copiedProfile === installProfile}
            description={resolveProfileDescription(installProfile)}
            onCopy={() => void copySelectedCommands()}
          />
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => void loadUpdateStatus()} disabled={loading}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
        {update?.releaseUrl ? (
          <a
            href={update.releaseUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            <ExternalLink className="h-4 w-4" />
            Open Release
          </a>
        ) : null}
      </div>
    </SectionCard>
  );
}

function UpdateStatusBanner({ update, loading }: { update: UpdateStatus | null; loading: boolean }) {
  const label = resolveUpdateStatusLabel(update, loading);
  const detail = loading
    ? "Checking GitHub Releases..."
    : update?.message ?? "Release information is not available yet.";
  const className = update?.updateAvailable
    ? "border-primary/30 bg-primary/10 text-primary-foreground"
    : update?.status === "error" || update?.status === "unconfigured"
      ? "border-amber-500/25 bg-amber-500/10 text-amber-100"
      : "border-emerald-500/25 bg-emerald-500/10 text-emerald-100";

  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${className}`}>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-medium">{label}</p>
        {update?.checkedAt ? <p className="text-xs opacity-80">Checked {formatDate(update.checkedAt)}</p> : null}
      </div>
      <p className="mt-1 text-xs opacity-85">{detail}</p>
    </div>
  );
}

function ReleaseNotes({ update }: { update: UpdateStatus | null }) {
  return (
    <div className="rounded-xl border bg-muted/15 p-4 text-sm">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-medium">{update?.releaseName ?? update?.message ?? "Release information is not available yet."}</p>
          {update?.publishedAt ? <p className="mt-1 text-xs text-muted-foreground">Published {formatDate(update.publishedAt)}</p> : null}
        </div>
        {update?.repository ? <Badge variant="outline">{update.repository}</Badge> : null}
      </div>
      {update?.notes ? <p className="mt-3 whitespace-pre-wrap text-muted-foreground">{update.notes}</p> : null}
    </div>
  );
}

function ProfileSelector({
  value,
  onChange,
}: {
  value: UpdateInstallProfile;
  onChange: (value: UpdateInstallProfile) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border bg-background p-1">
      <ProfileButton active={value === "docker"} onClick={() => onChange("docker")}>
        Docker Compose
      </ProfileButton>
      <ProfileButton active={value === "service"} onClick={() => onChange("service")}>
        Git + npm service
      </ProfileButton>
    </div>
  );
}

function ProfileButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <Button type="button" variant={active ? "secondary" : "ghost"} size="sm" onClick={onClick} className="h-7">
      {children}
    </Button>
  );
}

function CommandBlock({
  commands,
  copied,
  description,
  onCopy,
}: {
  commands: string[];
  copied: boolean;
  description: string;
  onCopy: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-background">
      <div className="flex flex-col gap-3 border-b bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Terminal className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <p className="text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onCopy} disabled={commands.length === 0}>
          {copied ? <Check className="mr-2 h-4 w-4" /> : <Clipboard className="mr-2 h-4 w-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="max-h-80 overflow-auto p-4 text-xs leading-6 text-foreground">
        <code>{commands.join("\n")}</code>
      </pre>
    </div>
  );
}

function RepositoryHint() {
  return (
    <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-100">
      Repository metadata is missing. Set `APP_UPDATE_REPO=owner/repository` or keep the GitHub repository field in `package.json`, then restart the app.
    </div>
  );
}

function resolveProfileDescription(profile: UpdateInstallProfile) {
  if (profile === "service") {
    return "For Windows/NSSM or manual Node.js service installs. Stop services first, update the checkout, apply schema changes, build, then start services again.";
  }

  return "For Docker Compose installs. The web container runs schema bootstrap and manual migrations during startup.";
}

function UpdateMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}

function resolveUpdateStatusLabel(update: UpdateStatus | null, loading: boolean) {
  if (loading) return "Checking";
  if (!update) return "Unknown";
  if (update.status === "error") return "Check Failed";
  if (update.status === "unconfigured") return "Unconfigured";
  return update.updateAvailable ? "Update Available" : "Up To Date";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function useSectionSave(saveSettings: () => Promise<void>) {
  const [savingSection, setSavingSection] = useState<string | null>(null);

  async function saveSection(sectionId: string) {
    if (savingSection) {
      return;
    }

    setSavingSection(sectionId);
    try {
      await saveSettings();
    } finally {
      setSavingSection(null);
    }
  }

  return { saveSection, savingSection };
}

function SectionSaveButton({
  sectionId,
  saving,
  savingSection,
  onSave,
}: {
  sectionId: string;
  saving: boolean;
  savingSection: string | null;
  onSave: (sectionId: string) => Promise<void>;
}) {
  const isSavingThisSection = saving && savingSection === sectionId;

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={saving}
      onClick={() => void onSave(sectionId)}
      className="shrink-0"
    >
      <Check className="mr-2 h-4 w-4" />
      {isSavingThisSection ? "Saving..." : "Save"}
    </Button>
  );
}

function SectionCard({
  title,
  description,
  children,
  icon: Icon,
  iconClassName,
  action,
}: {
  title: string;
  description: string;
  children: ReactNode;
  icon?: React.ElementType;
  iconClassName?: string;
  action?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="border-b bg-muted/20 px-6 py-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
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
          {action ? <div className="sm:pt-0.5">{action}</div> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-5 p-6 md:p-7">{children}</CardContent>
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
    <div className="flex items-center justify-between gap-4 rounded-xl border bg-card px-5 py-4">
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
    <div className="rounded-xl border bg-muted/20 p-5">
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

function toSlugInput(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 120);
}
