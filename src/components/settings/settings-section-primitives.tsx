"use client";

import { useState, type ReactNode } from "react";
import { Field as FieldPrimitive } from "@base-ui/react/field";
import { Check, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { hasSectionChanges, type SettingsSaveSection } from "@/lib/settings/section-save";
import { useSettingsStore } from "@/stores/use-settings-store";

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
  const settings = useSettingsStore((state) => state.settings);
  const persistedSettings = useSettingsStore((state) => state.persistedSettings);
  const hasChanges = hasSectionChanges(persistedSettings, settings, sectionId);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={saving || !hasChanges}
      onClick={() => void onSave(sectionId)}
      className="shrink-0"
    >
      <Check data-icon="inline-start" className="h-4 w-4" />
      <span aria-live="polite">{isSavingThisSection ? "Saving…" : hasChanges ? "Save changes" : "Saved"}</span>
    </Button>
  );
}

export function SectionCard({
  id,
  title,
  description,
  children,
  action,
  icon: Icon,
}: {
  id?: string;
  title: string;
  description: string;
  children: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <section id={id} data-settings-section className="scroll-mt-6 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            {Icon ? <Icon aria-hidden="true" className="size-4 shrink-0 text-primary" /> : null}
            {title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div data-settings-section-body className="space-y-5 [&>div:has([role=switch])+div:has([role=switch])]:mt-0">{children}</div>
    </section>
  );
}

export function SectionRail({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-5 lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-8">
      <div className="pt-1">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <FieldPrimitive.Root className="flex flex-col gap-2">
      <FieldPrimitive.Label className="text-sm font-medium leading-5">{label}</FieldPrimitive.Label>
      {children}
      {hint ? <FieldPrimitive.Description className="text-xs leading-5 text-muted-foreground">{hint}</FieldPrimitive.Description> : null}
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
    <div data-settings-toggle-row className="flex items-center justify-between gap-4 py-2">
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
    <div data-settings-toggle-row className="py-2">
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
