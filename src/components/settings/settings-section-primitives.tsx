"use client";

import { useState, type ReactNode } from "react";
import { Field as FieldPrimitive } from "@base-ui/react/field";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { SettingsSaveSection } from "@/lib/settings/section-save";

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
}: {
  title: string;
  description: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="border-t py-6 first:border-t-0 first:pt-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-5 space-y-5 [&>div:has([role=switch])+div:has([role=switch])]:mt-0">{children}</div>
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <FieldPrimitive.Root className="space-y-1.5">
      <FieldPrimitive.Label className="text-sm font-medium leading-none">{label}</FieldPrimitive.Label>
      {children}
      {hint ? <FieldPrimitive.Description className="text-xs text-muted-foreground">{hint}</FieldPrimitive.Description> : null}
    </FieldPrimitive.Root>
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
    <div className="flex items-center justify-between gap-4 border-t py-3 first:border-t-0">
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
    <div className="py-2">
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
