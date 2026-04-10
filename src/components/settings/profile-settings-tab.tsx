"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SettingsPayload } from "@/lib/settings/types";

type UpdateSetting = (
  path: string,
  value: string | number | boolean | string[] | SettingsPayload["maintenanceWindows"]
) => void;

export function AccountSettingsTab({
  settings,
  updateSetting,
}: {
  settings: SettingsPayload;
  updateSetting: UpdateSetting;
}) {
  return (
    <SectionCard
      title="Profile details"
      description="Identity information used in ownership screens, monitor templates, and team preferences."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="First name">
          <Input value={settings.profile.firstName} onChange={(event) => updateSetting("profile.firstName", event.target.value)} />
        </Field>
        <Field label="Last name">
          <Input value={settings.profile.lastName} onChange={(event) => updateSetting("profile.lastName", event.target.value)} />
        </Field>
        <Field label="Email">
          <Input type="email" value={settings.profile.email} onChange={(event) => updateSetting("profile.email", event.target.value)} />
        </Field>
        <Field label="Username">
            <Input value={settings.profile.username} onChange={(event) => updateSetting("profile.username", event.target.value)} placeholder="sentrovia-admin" />
        </Field>
        <Field label="Department">
          <Input value={settings.profile.department} onChange={(event) => updateSetting("profile.department", event.target.value)} />
        </Field>
        <Field label="Job title">
          <Input value={settings.profile.jobTitle} onChange={(event) => updateSetting("profile.jobTitle", event.target.value)} placeholder="SRE Lead" />
        </Field>
        <Field label="Organization">
          <Input value={settings.profile.organization} onChange={(event) => updateSetting("profile.organization", event.target.value)} />
        </Field>
        <Field label="Phone">
          <Input value={settings.profile.phone} onChange={(event) => updateSetting("profile.phone", event.target.value)} placeholder="+90 555 000 00 00" />
        </Field>
      </div>
    </SectionCard>
  );
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="border-b bg-muted/20 pb-4">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-6">{children}</CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      {children}
    </div>
  );
}
