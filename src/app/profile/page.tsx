"use client";

import { useEffect, type ElementType, type ReactNode } from "react";
import { Building2, Mail, Phone, ShieldCheck, UserRound } from "lucide-react";
import { ChangePasswordCard } from "@/components/profile/change-password-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AccountSettingsTab } from "@/components/settings/profile-settings-tab";
import { useSettingsStore } from "@/stores/use-settings-store";

export default function ProfilePage() {
  const { settings, loading, saving, error, message, loadSettings, saveSettings, updateSetting } =
    useSettingsStore();

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  return (
    <div className="w-full space-y-6 animate-in fade-in duration-200">
      <header className="rounded-2xl border bg-card p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl border bg-muted/20 p-3 shadow-sm">
              <UserRound className="h-5 w-5 text-sky-700 dark:text-sky-300" />
            </div>
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-700 dark:text-sky-300">Operator profile</p>
              <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                Update account identity, contact details, and organization metadata used across ownership views, notifications, and templates.
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,0.85fr)_minmax(0,0.95fr)] lg:min-w-[560px] lg:max-w-[620px]">
            <ProfileStat icon={Mail} label="Email" value={settings.profile.email || "Not set"} valueClassName="break-all text-[13px] leading-5" />
            <ProfileStat icon={Phone} label="Phone" value={settings.profile.phone || "Not set"} />
            <ProfileStat icon={Building2} label="Organization" value={settings.profile.organization || "Not set"} />
          </div>
        </div>
      </header>

      {error ? <Banner tone="error">{error}</Banner> : null}
      {message ? <Banner tone="success">{message}</Banner> : null}

      {loading ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Loading profile settings...</CardContent>
        </Card>
      ) : (
        <>
          <Tabs defaultValue="identity" className="flex-col gap-5">
            <TabsList variant="line" className="w-fit justify-start rounded-2xl border bg-card p-2">
              <TabsTrigger value="identity" className="flex-none rounded-xl px-4">
                <UserRound data-icon="inline-start" />
                Identity
              </TabsTrigger>
              <TabsTrigger value="security" className="flex-none rounded-xl px-4">
                <ShieldCheck data-icon="inline-start" />
                Security
              </TabsTrigger>
            </TabsList>

            <TabsContent value="identity" className="space-y-4">
              <AccountSettingsTab settings={settings} updateSetting={updateSetting} />
              <div className="flex justify-end">
                <Button onClick={() => void saveSettings()} disabled={saving}>
                  {saving ? "Saving..." : "Save profile"}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="security">
              <ChangePasswordCard />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function ProfileStat({
  icon: Icon,
  label,
  value,
  valueClassName,
}: {
  icon: ElementType;
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="border-l-2 border-l-sky-500 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
            <p className={`mt-2 text-sm font-medium ${valueClassName ?? "truncate"}`}>{value}</p>
          </div>
          <div className="rounded-xl bg-muted/50 p-2">
            <Icon className="h-4 w-4 text-sky-700 dark:text-sky-300" />
          </div>
        </div>
      </CardContent>
    </Card>
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
