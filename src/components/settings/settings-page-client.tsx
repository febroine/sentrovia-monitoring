"use client";

import { useEffect, useState, type ElementType, type ReactNode } from "react";
import { Bell, Database, DownloadCloud, Globe, Palette, RadioTower } from "lucide-react";
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
import { hasPermission } from "@/lib/auth/permissions";

type TabId = "notifications" | "monitoring" | "publicStatus" | "appearance" | "data" | "updates";

const tabs: Array<{ id: TabId; label: string; icon: ElementType; adminOnly?: boolean }> = [
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "monitoring", label: "Monitoring", icon: Globe },
  { id: "publicStatus", label: "Public status", icon: RadioTower },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "data", label: "Data", icon: Database },
  { id: "updates", label: "Updates", icon: DownloadCloud, adminOnly: true },
];

export default function SettingsPageClient() {
  const [activeTab, setActiveTab] = useState<TabId>("notifications");
  const { settings, loading, saving, error, message, loadSettings, saveSettings, updateSetting } =
    useSettingsStore();
  const isAdmin = settings.profile.role === "admin";
  const canManageSettings = hasPermission(settings.profile.role, "settings.manage");
  const visibleTabs = tabs.filter((tab) => !tab.adminOnly || isAdmin);
  const effectiveActiveTab = !isAdmin && activeTab === "updates" ? "notifications" : activeTab;

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage SMTP delivery, monitoring defaults, workspace appearance, and data retention.
        </p>
      </header>

      {error ? <Banner tone="error">{error}</Banner> : null}
      {message ? <Banner tone="success">{message}</Banner> : null}
      {!loading && !canManageSettings ? (
        <Banner tone="neutral">Your viewer role can inspect settings but cannot change workspace configuration.</Banner>
      ) : null}

      <Tabs
        value={effectiveActiveTab}
        onValueChange={(value) => setActiveTab(value as TabId)}
        orientation="vertical"
        className="gap-6 md:grid md:grid-cols-[200px_minmax(0,1fr)]"
      >
        <TabsList className="h-auto w-full flex-row items-stretch justify-start overflow-x-auto rounded-md border bg-card p-1 md:h-fit md:flex-col md:overflow-visible">
          {visibleTabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} className="h-auto shrink-0 justify-start rounded-md px-2.5 py-2 text-left md:w-full">
              <span className="flex min-w-0 items-center gap-2.5">
                <tab.icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="block min-w-0 truncate text-sm font-medium">{tab.label}</span>
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        <fieldset disabled={!canManageSettings} className="min-w-0 space-y-6 disabled:opacity-75">
          {loading ? (
            <div className="border-y py-8 text-sm text-muted-foreground">Loading settings...</div>
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
        </fieldset>
      </Tabs>
    </div>
  );
}

function Banner({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "error" | "success" | "neutral";
}) {
  return (
    <div
      className={`border-l-2 px-4 py-2 text-sm ${
        tone === "error"
          ? "border-destructive text-destructive"
          : tone === "success"
            ? "border-emerald-500 text-emerald-700 dark:text-emerald-400"
            : "border-border text-muted-foreground"
      }`}
    >
      {children}
    </div>
  );
}
