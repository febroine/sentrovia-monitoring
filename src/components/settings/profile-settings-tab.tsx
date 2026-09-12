"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionRail } from "@/components/settings/settings-section-primitives";
import type { SettingsPayload } from "@/lib/settings/types";

type UpdateSetting = (path: string, value: string | number | boolean | string[]) => void;

export function AccountSettingsTab({
  settings,
  updateSetting,
}: {
  settings: SettingsPayload;
  updateSetting: UpdateSetting;
}) {
  return (
    <div className="space-y-12">
      <SectionRail title="Account" description="Your name, contact details, and sign-in identity.">
        <AccountFields profile={settings.profile} updateSetting={updateSetting} />
      </SectionRail>

      <SectionRail title="Work details" description="Optional context for your role in this workspace.">
        <WorkFields profile={settings.profile} updateSetting={updateSetting} />
      </SectionRail>
    </div>
  );
}

function AccountFields({
  profile,
  updateSetting,
}: {
  profile: SettingsPayload["profile"];
  updateSetting: UpdateSetting;
}) {
  return (
    <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
      <ProfileInput id="first-name" label="First name" value={profile.firstName} autoComplete="given-name" onChange={(value) => updateSetting("profile.firstName", value)} />
      <ProfileInput id="last-name" label="Last name" value={profile.lastName} autoComplete="family-name" onChange={(value) => updateSetting("profile.lastName", value)} />
      <ProfileInput id="email" label="Email" type="email" value={profile.email} autoComplete="email" onChange={(value) => updateSetting("profile.email", value)} />
      <ProfileInput id="username" label="Username" value={profile.username} autoComplete="username" placeholder="sentrovia-admin" onChange={(value) => updateSetting("profile.username", value)} />
    </div>
  );
}

function WorkFields({
  profile,
  updateSetting,
}: {
  profile: SettingsPayload["profile"];
  updateSetting: UpdateSetting;
}) {
  return (
    <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
      <ProfileInput id="organization" label="Organization" value={profile.organization} autoComplete="organization" onChange={(value) => updateSetting("profile.organization", value)} />
      <ProfileInput id="department" label="Department" value={profile.department} autoComplete="organization-title" onChange={(value) => updateSetting("profile.department", value)} />
      <ProfileInput id="job-title" label="Job title" value={profile.jobTitle} autoComplete="organization-title" placeholder="SRE Lead" onChange={(value) => updateSetting("profile.jobTitle", value)} />
      <ProfileInput id="phone" label="Phone" type="tel" value={profile.phone} autoComplete="tel" placeholder="+90 555 000 00 00" onChange={(value) => updateSetting("profile.phone", value)} />
    </div>
  );
}

function ProfileInput({
  id,
  label,
  value,
  type = "text",
  autoComplete,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  type?: "text" | "email" | "tel";
  autoComplete?: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const inputId = `profile-${id}`;

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId} className="text-xs leading-5 text-muted-foreground">
        {label}
      </Label>
      <Input
        id={inputId}
        type={type}
        autoComplete={autoComplete}
        value={value}
        placeholder={placeholder}
        className="h-11 rounded-md"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
