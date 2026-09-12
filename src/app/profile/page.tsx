"use client";

import { useEffect, type ReactNode } from "react";
import { ChangePasswordCard } from "@/components/profile/change-password-card";
import { AccountSettingsTab } from "@/components/settings/profile-settings-tab";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ROLE_LABELS } from "@/lib/auth/permissions";
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
        <div className="mt-8 py-6 text-sm text-muted-foreground">Loading profile settings…</div>
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
    <div className="mt-7">
      <ProfileSummary profile={settings.profile} />

      <Tabs defaultValue="identity" className="flex-col gap-0">
        <TabsList
          variant="line"
          aria-label="Profile sections"
          className="w-full justify-start gap-5 border-b border-border/80 p-0"
        >
        <TabsTrigger
          value="identity"
          className="min-h-11 flex-none rounded-none border-0 px-1 pb-3 pt-1 data-active:bg-transparent data-active:text-foreground data-active:after:absolute data-active:after:inset-x-0 data-active:after:-bottom-px data-active:after:h-0.5 data-active:after:bg-primary data-active:after:content-['']"
        >
          Identity
        </TabsTrigger>
        <TabsTrigger
          value="security"
          className="min-h-11 flex-none rounded-none border-0 px-1 pb-3 pt-1 data-active:bg-transparent data-active:text-foreground data-active:after:absolute data-active:after:inset-x-0 data-active:after:-bottom-px data-active:after:h-0.5 data-active:after:bg-primary data-active:after:content-['']"
        >
          Security
        </TabsTrigger>
        </TabsList>

        <TabsContent value="identity" className="pt-7">
          <AccountSettingsTab settings={settings} updateSetting={onUpdate} />
          <div className="mt-8 flex justify-end border-t border-border/80 pt-4">
            <Button onClick={onSave} disabled={saving} className="min-h-11 min-w-32 px-4">
              {saving ? "Saving…" : "Save profile"}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="security" className="pt-7">
          <ChangePasswordCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProfileSummary({ profile }: { profile: SettingsPayload["profile"] }) {
  const displayName = [profile.firstName.trim(), profile.lastName.trim()].filter(Boolean).join(" ") || profile.username.trim() || "Your profile";
  const initials = getInitials(displayName);

  return (
    <section
      aria-labelledby="profile-summary-heading"
      className="mb-7 rounded-lg border border-border bg-card/60 p-4 sm:p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div
            aria-hidden="true"
            className="grid size-14 shrink-0 place-items-center rounded-full border border-primary/30 bg-primary/10 text-lg font-semibold text-primary"
          >
            {initials}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="profile-summary-heading" className="break-words text-lg font-semibold tracking-tight">
                {displayName}
              </h2>
              <Badge variant="outline">{ROLE_LABELS[profile.role]}</Badge>
            </div>
            <p className="mt-1 break-words text-sm text-muted-foreground">
              {profile.email.trim() || "Email not set"}
            </p>
          </div>
        </div>
      </div>

      <dl className="mt-5 grid gap-4 border-t border-border/70 pt-4 sm:grid-cols-3">
        <ProfileMeta label="Username" value={profile.username} />
        <ProfileMeta label="Organization" value={profile.organization} />
        <ProfileMeta label="Department" value={profile.department} />
      </dl>
    </section>
  );
}

function ProfileMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1.5 break-words text-sm font-medium text-foreground">{value.trim() || "Not set"}</dd>
    </div>
  );
}

function getInitials(value: string) {
  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length > 1) {
    return `${parts[0][0]}${parts.at(-1)?.[0] ?? ""}`.toUpperCase();
  }

  return value.slice(0, 2).toUpperCase();
}

function Banner({ children, tone }: { children: ReactNode; tone: "error" | "success" }) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-md px-4 py-3 text-sm",
        tone === "error"
          ? "bg-destructive/10 text-destructive"
          : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      )}
    >
      {children}
    </div>
  );
}
