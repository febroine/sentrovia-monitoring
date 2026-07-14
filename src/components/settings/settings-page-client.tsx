"use client";

import { useEffect, useState, type ElementType, type ReactNode } from "react";
import { Bell, Database, DownloadCloud, Globe, Palette, RadioTower } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AppearanceSettingsTab,
  DataSettingsTab,
  MonitoringSettingsTab,
  NotificationSettingsTab,
  PublicStatusSettingsTab,
  UpdateAssistantTab,
} from "@/components/settings/settings-sections";
import { useSettingsStore } from "@/stores/use-settings-store";

type TabId = "notifications" | "monitoring" | "publicStatus" | "appearance" | "data" | "updates";

const tabs: Array<{ id: TabId; label: string; icon: ElementType; tone: string; adminOnly?: boolean }> = [
  { id: "notifications", label: "Notifications", icon: Bell, tone: "text-emerald-600 dark:text-emerald-400" },
  { id: "monitoring", label: "Monitoring", icon: Globe, tone: "text-sky-600 dark:text-sky-400" },
  { id: "publicStatus", label: "Public Status", icon: RadioTower, tone: "text-rose-600 dark:text-rose-400" },
  { id: "appearance", label: "Appearance", icon: Palette, tone: "text-violet-600 dark:text-violet-400" },
  { id: "data", label: "Data", icon: Database, tone: "text-amber-600 dark:text-amber-400" },
  { id: "updates", label: "Updates", icon: DownloadCloud, tone: "text-emerald-600 dark:text-emerald-400", adminOnly: true },
];

export default function SettingsPageClient() {
  const [activeTab, setActiveTab] = useState<TabId>("notifications");
  const { settings, loading, saving, error, message, loadSettings, saveSettings, updateSetting } =
    useSettingsStore();
  const isAdmin = settings.profile.role === "admin";
  const visibleTabs = tabs.filter((tab) => !tab.adminOnly || isAdmin);
  const effectiveActiveTab = !isAdmin && activeTab === "updates" ? "notifications" : activeTab;

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <header>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage SMTP delivery, monitoring defaults, workspace appearance, and data retention.
        </p>
      </header>

      {error ? <Banner tone="error">{error}</Banner> : null}
      {message ? <Banner tone="success">{message}</Banner> : null}

      <Tabs
        value={effectiveActiveTab}
        onValueChange={(value) => setActiveTab(value as TabId)}
        orientation="vertical"
        className="gap-6 md:grid md:grid-cols-[200px_minmax(0,1fr)]"
      >
        <TabsList className="h-auto w-full flex-row items-stretch justify-start overflow-x-auto rounded-lg border bg-card p-1.5 md:h-fit md:flex-col md:overflow-visible">
          {visibleTabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} className="h-auto shrink-0 justify-start rounded-md px-2.5 py-2 text-left md:w-full">
              <span className="flex min-w-0 items-center gap-3">
                <span className="rounded-md border bg-muted/30 p-1.5">
                  <tab.icon className={`h-4 w-4 ${tab.tone}`} />
                </span>
                <span className="block min-w-0 truncate text-sm font-medium">{tab.label}</span>
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="space-y-6">
          {loading ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">Loading settings...</CardContent>
            </Card>
          ) : (
            <>
              <TabsContent value="notifications">
                <NotificationSettingsTab settings={settings} saving={saving} saveSettings={saveSettings} updateSetting={updateSetting} />
              </TabsContent>
              <TabsContent value="monitoring">
                <MonitoringSettingsTab settings={settings} saving={saving} saveSettings={saveSettings} updateSetting={updateSetting} />
              </TabsContent>
              <TabsContent value="publicStatus">
                <PublicStatusSettingsTab settings={settings} saving={saving} saveSettings={saveSettings} updateSetting={updateSetting} />
              </TabsContent>
              <TabsContent value="appearance">
                <AppearanceSettingsTab settings={settings} saving={saving} saveSettings={saveSettings} updateSetting={updateSetting} />
              </TabsContent>
              <TabsContent value="data">
                <DataSettingsTab settings={settings} saving={saving} saveSettings={saveSettings} updateSetting={updateSetting} />
              </TabsContent>
              {isAdmin ? (
                <TabsContent value="updates">
                  <UpdateAssistantTab />
                </TabsContent>
              ) : null}

            </>
          )}
        </div>
      </Tabs>
    </div>
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
