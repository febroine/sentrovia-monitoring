"use client";

import { useEffect, useState, type ElementType, type ReactNode } from "react";
import {
  BellElectric,
  DatabaseBackup,
  PackageCheck,
  PanelsTopLeft,
  RadioTower,
  ScanEye,
  ScanSearch,
  ShieldCheck,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { cn } from "@/lib/utils";

type TabId = "notifications" | "monitoring" | "publicStatus" | "appearance" | "data" | "updates";

const tabs: Array<{ id: TabId; label: string; icon: ElementType; tone: string; adminOnly?: boolean }> = [
  { id: "notifications", label: "Notifications", icon: BellElectric, tone: "text-amber-600 dark:text-amber-400" },
  { id: "monitoring", label: "Monitoring", icon: ScanSearch, tone: "text-emerald-600 dark:text-emerald-400" },
  { id: "publicStatus", label: "Public status", icon: RadioTower, tone: "text-sky-600 dark:text-sky-400" },
  { id: "appearance", label: "Appearance", icon: PanelsTopLeft, tone: "text-violet-600 dark:text-violet-400" },
  { id: "data", label: "Data", icon: DatabaseBackup, tone: "text-cyan-600 dark:text-cyan-400" },
  { id: "updates", label: "Updates", icon: PackageCheck, tone: "text-cyan-600 dark:text-cyan-400", adminOnly: true },
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
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="mb-1 text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Workspace-wide monitoring, delivery, and retention defaults.
          </p>
        </div>
        <div className={cn(
          "flex items-center gap-2 text-xs font-medium",
          canManageSettings
            ? "text-emerald-700 dark:text-emerald-400"
            : "text-amber-700 dark:text-amber-400"
        )}>
          {canManageSettings ? <ShieldCheck className="size-4" /> : <ScanEye className="size-4" />}
          {canManageSettings ? "Editable" : "Read only"}
        </div>
      </header>

      {error ? <Banner tone="error">{error}</Banner> : null}
      {message ? <Banner tone="success">{message}</Banner> : null}
      {!loading && !canManageSettings ? (
        <Banner tone="neutral">Your role can view settings but cannot edit them.</Banner>
      ) : null}

      <Tabs
        value={effectiveActiveTab}
        onValueChange={(value) => setActiveTab(value as TabId)}
        orientation="vertical"
        className="!flex-col gap-4 md:!grid md:grid-cols-[200px_minmax(0,1fr)] md:gap-6"
      >
        <div className="md:hidden">
          <Select value={effectiveActiveTab} onValueChange={(value) => setActiveTab(value as TabId)}>
            <SelectTrigger aria-label="Settings section" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {visibleTabs.map((tab) => (
                <SelectItem key={tab.id} value={tab.id}>
                  {tab.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <TabsList className="hidden h-fit w-full flex-col items-stretch justify-start rounded-md border bg-card p-1 md:flex">
          {visibleTabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} className="h-auto shrink-0 justify-start rounded-md px-2.5 py-2 text-left md:w-full">
              <span className="flex min-w-0 items-center gap-2.5">
                <tab.icon className={cn("size-4 shrink-0", tab.tone)} />
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
                <PublicStatusSettingsTab canManage={canManageSettings} />
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
