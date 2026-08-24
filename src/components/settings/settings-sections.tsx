"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { NotificationChannelsEditor } from "@/components/settings/notification-channels-editor";
import { BackupRestorePanel } from "@/components/settings/backup-restore-panel";
import { SavedRecipientsManager } from "@/components/settings/saved-recipients-manager";
import { TemplateEditor } from "@/components/settings/template-editor";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Field,
  SectionCard,
  SectionSaveButton,
  ToggleCard,
  ToggleRow,
  useSectionSave,
} from "@/components/settings/settings-section-primitives";
import type { SettingsPayload } from "@/lib/settings/types";
import type { SettingsSaveSection } from "@/lib/settings/section-save";
import { TIME_ZONE_OPTIONS } from "@/lib/time";

export { UpdateAssistantTab } from "@/components/settings/update-assistant-tab";

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
  saveSettings: (section?: SettingsSaveSection) => Promise<void>;
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
          description="Notify when a monitor stays online but exceeds its slow response threshold. Turn this off if you only want confirmed down alerts."
          checked={settings.notifications.notifyOnLatency}
          onChange={(checked) => updateSetting("notifications.notifyOnLatency", checked)}
        />
        <ToggleRow
          label="Prolonged downtime reminders"
          description="Allow follow-up alerts for monitors that have a non-zero Re-notify limit."
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
          hint="Example: 180 sends reminders at most every 3 hours until the monitor's Re-notify limit is reached."
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
            description="Disables mail server identity verification. Use only for a trusted private server with a self-signed certificate."
            checked={settings.notifications.smtpInsecureSkipVerify}
            onChange={(checked) => updateSetting("notifications.smtpInsecureSkipVerify", checked)}
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Additional Notification Channels"
        description="Mirror the same worker notifications to collaboration tools through incoming webhooks."
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
        action={
          <SectionSaveButton
            sectionId="notification-templates"
            saving={saving}
            savingSection={savingSection}
            onSave={saveSection}
          />
        }
      >
        <div className="border-y py-4">
          <p className="text-sm font-medium">Available template tokens</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Tokens are replaced at delivery time. In email bodies, “Label: value” becomes a report row, “## Heading” starts a section, and “- Item” creates a list entry. Any other sentence remains a regular paragraph.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {TEMPLATE_TOKENS.map((token) => (
              <Badge key={token} variant="outline" className="font-mono text-[11px]">
                {token}
              </Badge>
            ))}
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Email brand name" hint="Shown at the upper-left of every notification email.">
            <Input
              value={settings.notifications.notificationEmailBrandName}
              onChange={(event) => updateSetting("notifications.notificationEmailBrandName", event.target.value)}
            />
          </Field>
          <Field label="Email footer text" hint="Shown before the monitoring link. Leave blank to use the notification language default.">
            <Input
              value={settings.notifications.notificationEmailFooterText}
              onChange={(event) => updateSetting("notifications.notificationEmailFooterText", event.target.value)}
              placeholder="Sentrovia monitoring notification"
            />
          </Field>
        </div>
        <Field label="Default email subject" hint="Available tokens: {domain}, {url}, {status_code}, {status_label}, {failure_reason}, {event_state}, {rca_summary}">
          <Input
            value={settings.notifications.defaultEmailSubjectTemplate}
            onChange={(event) => updateSetting("notifications.defaultEmailSubjectTemplate", event.target.value)}
          />
        </Field>
        <TemplateEditor
          label="Default email body"
          hint="The email adds a responsive report header automatically. Use detail rows for operational facts and regular sentences for notes; custom content remains readable without HTML."
          reportLayoutTools
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
          hint="Used only for recovery notifications. The report header automatically switches to the healthy color treatment."
          reportLayoutTools
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
          hint="Used for reminders while a monitor remains down. Detail rows, section headings, lists, and free-form notes share the same report layout."
          reportLayoutTools
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
      action={
        <SectionSaveButton
          sectionId="default-monitor-configuration"
          saving={saving}
          savingSection={savingSection}
          onSave={saveSection}
        />
      }
    >
      <div className="border-l-2 border-border px-4 py-2">
        <p className="text-sm font-medium">Override behavior</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          These values fill the gaps when a monitor is created manually or imported from CSV. If a monitor defines its
          own setting later, the site-level value always wins.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="border-y py-4">
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
              label="Consecutive failures required"
              hint="Total failed probes required, including the initial failure. A final immediate confirmation probe must also fail before an outage is announced."
            >
              <Input
                type="number"
                min={2}
                max={10}
                value={settings.monitoring.retries}
                onChange={(event) => updateSetting("monitoring.retries", Number(event.target.value) || 2)}
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

        <div className="border-y py-4">
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
            <Field label="Response max length" hint="0 uses the 100 KB worker safety limit for new monitors.">
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
          description="New monitors inherit daily warnings during the final 30 days before certificate expiry."
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
        label="Outage banner"
        description="Show a dashboard banner when one or more monitors are currently offline."
        checked={settings.appearance.showOutageBanner}
        onChange={(checked) => updateSetting("appearance.showOutageBanner", checked)}
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
  const { companies, error: companyError, loading: companiesLoading } = usePublicStatusCompanies();
  const statusPath = settings.publicStatus.slug ? `/status/${settings.publicStatus.slug}` : "/status/your-status-slug";
  const canOpenStatusPage = settings.publicStatus.enabled && settings.publicStatus.slug.length >= 3;
  const selectedCompanyMissing = Boolean(
    settings.publicStatus.companyId
    && !companies.some((company) => company.id === settings.publicStatus.companyId)
  );

  return (
    <SectionCard
      title="Public Status Page"
      description="Publish a read-only status page that exposes active monitor health without requiring a login."
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
            <span className="min-w-0 flex-1 truncate">{statusPath}</span>
            {canOpenStatusPage ? (
              <a
                aria-label="Open public status page"
                className="flex size-7 shrink-0 items-center justify-center rounded-sm hover:bg-muted hover:text-foreground"
                href={statusPath}
                rel="noreferrer"
                target="_blank"
                title="Open public status page"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            ) : null}
          </div>
        </Field>
      </div>
      <Field
        label="Published company"
        hint="Choose one company to publish only its active monitors, or keep the full workspace visible."
      >
        <Select
          value={settings.publicStatus.companyId || "all-companies"}
          onValueChange={(value) => updateSetting(
            "publicStatus.companyId",
            value === "all-companies" ? "" : String(value)
          )}
          disabled={companiesLoading}
        >
          <SelectTrigger>
            <SelectValue placeholder={companiesLoading ? "Loading companies..." : "Select company scope"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all-companies">All companies</SelectItem>
            {selectedCompanyMissing ? (
              <SelectItem value={settings.publicStatus.companyId}>Unavailable selected company</SelectItem>
            ) : null}
            {companies.map((company) => (
              <SelectItem key={company.id} value={company.id}>
                {company.name} ({company.monitorsCount} monitors)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {companyError ? <p className="mt-2 text-xs text-destructive">{companyError}</p> : null}
      </Field>
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
          placeholder="Live service availability and active outage summary."
        />
      </Field>
    </SectionCard>
  );
}

type PublicStatusCompanyOption = {
  id: string;
  name: string;
  monitorsCount: number;
};

function usePublicStatusCompanies() {
  const [companies, setCompanies] = useState<PublicStatusCompanyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCompanies() {
      try {
        const response = await fetch("/api/companies", { cache: "no-store", signal: controller.signal });
        const data = await response.json().catch(() => null) as {
          companies?: PublicStatusCompanyOption[];
          message?: string;
        } | null;
        if (!response.ok) {
          throw new Error(data?.message ?? "Unable to load companies.");
        }

        setCompanies(data?.companies ?? []);
        setError(null);
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load companies.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadCompanies();
    return () => controller.abort();
  }, []);

  return { companies, loading, error };
}

export function DataSettingsTab({ settings, saving, saveSettings, updateSetting }: TabProps) {
  const isAdmin = settings.profile.role === "admin";
  const { saveSection, savingSection } = useSectionSave(saveSettings);

  return (
    <>
      <SectionCard
        title="Data Retention"
        description="Control how long operational history remains in PostgreSQL. Cleanup runs safely in the worker."
        action={
          <SectionSaveButton
            sectionId="retention-and-backups"
            saving={saving}
            savingSection={savingSection}
            onSave={saveSection}
          />
        }
      >
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Monitor checks" hint="Latency and availability samples, in days.">
            <Input
              type="number"
              min={7}
              max={3650}
              value={settings.data.retentionDays}
              onChange={(event) => updateSetting("data.retentionDays", Number(event.target.value))}
            />
          </Field>
          <Field label="Event logs" hint="Monitor events and diagnostic history, in days.">
            <Input
              type="number"
              min={1}
              max={3650}
              value={settings.data.eventRetentionDays}
              onChange={(event) => updateSetting("data.eventRetentionDays", Number(event.target.value))}
            />
          </Field>
          <Field label="Delivery history" hint="Completed notification deliveries, in days.">
            <Input
              type="number"
              min={7}
              max={3650}
              value={settings.data.deliveryRetentionDays}
              onChange={(event) => updateSetting("data.deliveryRetentionDays", Number(event.target.value))}
            />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">
          Pending, processing, and retrying webhook deliveries are never removed by retention cleanup.
        </p>
      </SectionCard>

      {isAdmin ? (
        <SectionCard
          title="Automatic Database Backup"
          description="Create a verified, encrypted PostgreSQL backup on the worker host each day."
        >
          <ToggleRow
            label="Enable automatic backups"
            description="Backups use the application encryption key and are verified with pg_restore before completion."
            checked={settings.data.autoBackupEnabled}
            onChange={(checked) => updateSetting("data.autoBackupEnabled", checked)}
          />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Daily backup time" hint={`Uses the workspace timezone (${settings.appearance.timeZone}).`}>
              <Input
                type="time"
                value={settings.data.backupWindow}
                disabled={!settings.data.autoBackupEnabled}
                onChange={(event) => updateSetting("data.backupWindow", event.target.value)}
              />
            </Field>
            <Field label="Backups to retain" hint="Older verified backup files are removed automatically.">
              <Input
                type="number"
                min={2}
                max={90}
                value={settings.data.backupRetentionCount}
                disabled={!settings.data.autoBackupEnabled}
                onChange={(event) => updateSetting("data.backupRetentionCount", Number(event.target.value))}
              />
            </Field>
          </div>
          <div className="border-y py-3 text-xs text-muted-foreground">
            Last automatic backup: {settings.data.lastAutomaticBackupAt
              ? new Date(settings.data.lastAutomaticBackupAt).toLocaleString()
              : "Not completed yet"}
            {settings.data.lastBackupStatus ? ` · ${settings.data.lastBackupStatus}` : ""}
            {settings.data.lastBackupError ? (
              <p className="mt-1 text-destructive">{settings.data.lastBackupError}</p>
            ) : null}
          </div>
          <div className="flex justify-end">
            <SectionSaveButton
              sectionId="retention-and-backups"
              saving={saving}
              savingSection={savingSection}
              onSave={saveSection}
            />
          </div>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Workspace Backup"
        description="Export or restore workspace configuration manually. Database records remain under your deployment's backup policy."
      >
        {isAdmin ? (
          <BackupRestorePanel
            lastBackupAt={settings.data.lastBackupAt}
            onBackupCreated={(value) => updateSetting("data.lastBackupAt", value)}
          />
        ) : (
          <p className="border-y py-4 text-sm text-muted-foreground">
            Backup export and restore are available to administrators only.
          </p>
        )}
      </SectionCard>
    </>
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
