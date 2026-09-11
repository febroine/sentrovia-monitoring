"use client";

import { useEffect, type ReactNode } from "react";
import { ChangePasswordCard } from "@/components/profile/change-password-card";
import { AccountSettingsTab } from "@/components/settings/profile-settings-tab";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SettingsPayload } from "@/lib/settings/types";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/use-settings-store";

export default function ProfilePage() {
  const { settings, loading, saving, error, message, loadProfile, saveProfile, updateSetting } =
    useSettingsStore();

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  return (
    <div className="w-full">
      <ProfileHeader />

      <div className="mt-5 space-y-3">
        {error ? <Banner tone="error">{error}</Banner> : null}
        {message ? <Banner tone="success">{message}</Banner> : null}
      </div>

      {loading ? (
        <div className="mt-8 border-y py-10 text-sm text-muted-foreground">Loading profile settings...</div>
      ) : (
        <ProfileTabs
          settings={settings}
          saving={saving}
          onSave={() => void saveProfile()}
          onUpdate={updateSetting}
        />
      )}
    </div>
  );
}

function ProfileHeader() {
  return (
    <header>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">Identity, contact details, and account security.</p>
      </div>
    </header>
  );
}

function ProfileTabs({
  settings,
  saving,
  onSave,
  onUpdate,
}: {
  settings: SettingsPayload;
  saving: boolean;
  onSave: () => void;
  onUpdate: (path: string, value: string | number | boolean | string[]) => void;
}) {
  return (
    <Tabs defaultValue="identity" className="mt-6 flex-col gap-0">
      <TabsList variant="line" className="h-auto w-full justify-start rounded-none border-b bg-transparent p-0">
        <TabsTrigger value="identity" className="flex-none rounded-none px-1 pb-3 pt-1">
          Identity
        </TabsTrigger>
        <TabsTrigger value="security" className="ml-6 flex-none rounded-none px-1 pb-3 pt-1">
          Security
        </TabsTrigger>
      </TabsList>

      <TabsContent value="identity" className="pt-8">
        <AccountSettingsTab settings={settings} updateSetting={onUpdate} />
        <div className="mt-6 flex justify-end border-t pt-5">
          <Button onClick={onSave} disabled={saving} className="min-w-28">
            {saving ? "Saving..." : "Save profile"}
          </Button>
        </div>
      </TabsContent>

      <TabsContent value="security" className="pt-8">
        <ChangePasswordCard />
      </TabsContent>
    </Tabs>
  );
}

function Banner({ children, tone }: { children: ReactNode; tone: "error" | "success" }) {
  return (
    <div
      role="status"
      className={cn(
        "border-l-2 px-4 py-3 text-sm",
        tone === "error"
          ? "border-destructive bg-destructive/5 text-destructive"
          : "border-emerald-500 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
      )}
    >
      {children}
    </div>
  );
}
