"use client";

import { useEffect, useState, type ElementType, type ReactNode } from "react";
import { Bell, Clock3, Database, Globe, Mail, Palette, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AppearanceSettingsTab,
  DataSettingsTab,
  MonitoringSettingsTab,
  NotificationSettingsTab,
} from "@/components/settings/settings-sections";
import { useSettingsStore } from "@/stores/use-settings-store";

type TabId = "notifications" | "monitoring" | "appearance" | "data";

const tabs: Array<{ id: TabId; label: string; icon: ElementType; tone: string }> = [
  { id: "notifications", label: "Notifications", icon: Bell, tone: "text-emerald-600 dark:text-emerald-400" },
  { id: "monitoring", label: "Monitoring", icon: Globe, tone: "text-sky-600 dark:text-sky-400" },
  { id: "appearance", label: "Appearance", icon: Palette, tone: "text-violet-600 dark:text-violet-400" },
  { id: "data", label: "Data", icon: Database, tone: "text-amber-600 dark:text-amber-400" },
];

export default function SettingsPageClient() {
  const [activeTab, setActiveTab] = useState<TabId>("notifications");
  const { settings, loading, saving, error, message, loadSettings, saveSettings, updateSetting } =
    useSettingsStore();

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <header className="overflow-hidden rounded-2xl border bg-card">
        <div className="border-l-2 border-l-sky-500 px-5 py-5">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl border bg-background p-3 shadow-sm">
              <ShieldCheck className="h-5 w-5 text-sky-700 dark:text-sky-300" />
            </div>
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-700 dark:text-sky-300">
                Workspace Configuration
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                Manage SMTP delivery, monitoring defaults, workspace appearance, and data retention with a clearer operational layout.
              </p>
            </div>
          </div>
        </div>
      </header>

      {error ? <Banner tone="error">{error}</Banner> : null}
      {message ? <Banner tone="success">{message}</Banner> : null}

      <div className="grid gap-3 md:grid-cols-3">
        <SummaryCard
          tone="green"
          icon={Mail}
          label="SMTP Delivery"
          value={settings.notifications.smtpHost ? "Configured" : "Not Configured"}
          description={
            settings.notifications.smtpHost
              ? `${settings.notifications.smtpHost}:${settings.notifications.smtpPort}`
              : "Worker email alerts stay inactive until SMTP is configured."
          }
          onClick={() => setActiveTab("notifications")}
        />
        <SummaryCard
          tone="amber"
          icon={Clock3}
          label="Default Timeout"
          value={`${settings.monitoring.timeout} ms`}
          description={`${settings.monitoring.retries} verification attempts · ${settings.monitoring.method}`}
          onClick={() => setActiveTab("monitoring")}
        />
        <SummaryCard
          tone="red"
          icon={Database}
          label="Data Retention"
          value={`${settings.data.eventRetentionDays} days`}
          description={`Backups ${settings.data.autoBackupEnabled ? "enabled" : "disabled"} · window ${settings.data.backupWindow}`}
          onClick={() => setActiveTab("data")}
        />
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as TabId)}
        orientation="vertical"
        className="gap-6 md:grid md:grid-cols-[200px_minmax(0,1fr)]"
      >
        <TabsList className="h-fit w-full flex-col items-stretch rounded-2xl border bg-card p-2 shadow-sm">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} className="h-auto w-full justify-start rounded-xl px-3 py-3 text-left">
              <span className="flex min-w-0 items-center gap-3">
                <span className="rounded-xl border bg-muted/30 p-2">
                  <tab.icon className={`h-4 w-4 ${tab.tone}`} />
                </span>
                <span className="block min-w-0 truncate text-sm font-medium">{tab.label}</span>
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="space-y-4">
          {loading ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">Loading settings...</CardContent>
            </Card>
          ) : (
            <>
              <TabsContent value="notifications">
                <NotificationSettingsTab settings={settings} updateSetting={updateSetting} />
              </TabsContent>
              <TabsContent value="monitoring">
                <MonitoringSettingsTab settings={settings} updateSetting={updateSetting} />
              </TabsContent>
              <TabsContent value="appearance">
                <AppearanceSettingsTab settings={settings} updateSetting={updateSetting} />
              </TabsContent>
              <TabsContent value="data">
                <DataSettingsTab settings={settings} updateSetting={updateSetting} />
              </TabsContent>

              <div className="sticky bottom-4 pt-2">
                <Card className="overflow-hidden border-border/60 shadow-sm">
                  <CardContent className="border-l-2 border-l-sky-500 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium">Ready to Save</p>
                      <p className="text-xs text-muted-foreground">
                        Changes are written to the database and used by the worker on the next cycle.
                      </p>
                    </div>
                    <Button onClick={() => void saveSettings()} disabled={saving} className="bg-violet-600 text-white hover:bg-violet-500">
                      {saving ? "Saving..." : "Save Changes"}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </div>
      </Tabs>
    </div>
  );
}

function SummaryCard({
  tone,
  icon: Icon,
  label,
  value,
  description,
  onClick,
}: {
  tone: "green" | "amber" | "red";
  icon: ElementType;
  label: string;
  value: string;
  description: string;
  onClick: () => void;
}) {
  const border =
    tone === "green" ? "border-l-emerald-500" : tone === "amber" ? "border-l-amber-500" : "border-l-red-500";
  const iconTone =
    tone === "green"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "amber"
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400";

  return (
    <button type="button" onClick={onClick} className="text-left">
      <Card className="overflow-hidden transition-colors hover:border-border/80">
        <CardContent className={`border-l-2 ${border} px-4 py-3`}>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
              <p className="text-lg font-semibold tracking-tight">{value}</p>
              <p className="text-xs leading-5 text-muted-foreground">{description}</p>
            </div>
            <div className="rounded-xl border bg-muted/25 p-2">
              <Icon className={`h-4 w-4 ${iconTone}`} />
            </div>
          </div>
        </CardContent>
      </Card>
    </button>
  );
}

function Banner({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "error" | "success";
}) {
  return (
    <div
      className={`rounded-lg border px-4 py-3 text-sm ${
        tone === "error"
          ? "border-destructive/20 bg-destructive/5 text-destructive"
          : "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
      }`}
    >
      {children}
    </div>
  );
}
