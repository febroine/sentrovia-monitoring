"use client";

import { useState, type ReactNode } from "react";
import { Check, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { SettingsSaveSection } from "@/lib/settings/section-save";
import { cn } from "@/lib/utils";

export function useSectionSave(saveSettings: (section?: SettingsSaveSection) => Promise<void>) {
  const [savingSection, setSavingSection] = useState<string | null>(null);

  async function saveSection(sectionId: SettingsSaveSection) {
    if (savingSection) return;

    setSavingSection(sectionId);
    try {
      await saveSettings(sectionId);
    } finally {
      setSavingSection(null);
    }
  }

  return { saveSection, savingSection };
}

export function SectionSaveButton({
  sectionId,
  saving,
  savingSection,
  onSave,
}: {
  sectionId: SettingsSaveSection;
  saving: boolean;
  savingSection: string | null;
  onSave: (sectionId: SettingsSaveSection) => Promise<void>;
}) {
  const isSavingThisSection = saving && savingSection === sectionId;

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={saving}
      onClick={() => void onSave(sectionId)}
      className="shrink-0"
    >
      <Check className="mr-2 h-4 w-4" />
      {isSavingThisSection ? "Saving..." : "Save"}
    </Button>
  );
}

export function SectionCard({
  title,
  description,
  children,
  action,
  icon: Icon,
  iconClassName,
}: {
  title: string;
  description: string;
  children: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
  iconClassName?: string;
}) {
  return (
    <Card>
      <CardHeader className="border-b px-4 py-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              {Icon ? <Icon aria-hidden="true" className={cn("size-4 shrink-0", iconClassName)} /> : null}
              <span>{title}</span>
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          {action ? <div className="sm:pt-0.5">{action}</div> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-5 p-4 md:p-5">{children}</CardContent>
    </Card>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-y py-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch aria-label={label} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export function ToggleCard({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="border-y py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <Switch aria-label={label} checked={checked} onCheckedChange={onChange} />
      </div>
    </div>
  );
}
