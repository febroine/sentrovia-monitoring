"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    <section className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12">
      <SectionIntro
        title="Identity details"
        metadata={buildProfileMetadata(settings.profile)}
      />

      <div className="border-y">
        <FieldGroup title="Account">
          <AccountFields profile={settings.profile} updateSetting={updateSetting} />
        </FieldGroup>

        <FieldGroup title="Work details">
          <WorkFields profile={settings.profile} updateSetting={updateSetting} />
        </FieldGroup>
      </div>
    </section>
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
    <div className="grid gap-4 sm:grid-cols-2">
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
    <div className="grid gap-4 sm:grid-cols-2">
      <ProfileInput id="organization" label="Organization" value={profile.organization} autoComplete="organization" onChange={(value) => updateSetting("profile.organization", value)} />
      <ProfileInput id="department" label="Department" value={profile.department} autoComplete="organization-title" onChange={(value) => updateSetting("profile.department", value)} />
      <ProfileInput id="job-title" label="Job title" value={profile.jobTitle} autoComplete="organization-title" placeholder="SRE Lead" onChange={(value) => updateSetting("profile.jobTitle", value)} />
      <ProfileInput id="phone" label="Phone" type="tel" value={profile.phone} autoComplete="tel" placeholder="+90 555 000 00 00" onChange={(value) => updateSetting("profile.phone", value)} />
    </div>
  );
}

function SectionIntro({
  title,
  metadata,
}: {
  title: string;
  metadata: Array<{ label: string; value: string }>;
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold">{title}</h2>
      <dl className="mt-6 border-t text-xs">
        {metadata.map((item) => (
          <div key={item.label} className="flex justify-between gap-4 border-b py-3">
            <dt className="text-muted-foreground">{item.label}</dt>
            <dd className="max-w-[130px] truncate text-right text-foreground">{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function FieldGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-5 border-b py-6 last:border-b-0 xl:grid-cols-[160px_minmax(0,1fr)]">
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
      </div>
      {children}
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
      <Label htmlFor={inputId} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={inputId}
        type={type}
        autoComplete={autoComplete}
        value={value}
        placeholder={placeholder}
        className="h-9 rounded-md"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function buildProfileMetadata(profile: SettingsPayload["profile"]) {
  return [
    { label: "Department", value: profile.department || "Not set" },
    { label: "Job title", value: profile.jobTitle || "Not set" },
    { label: "Organization", value: profile.organization || "Not set" },
  ];
}
