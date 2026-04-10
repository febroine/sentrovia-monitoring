import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CompanyRecord } from "@/lib/companies/types";
import type { MonitorPayload } from "@/lib/monitors/types";
import { CheckMonitorSettings, GeneralMonitorSettings } from "@/components/monitoring/monitor-form-sections";
import {
  NotificationMonitorSettings,
  TemplateMonitorSettings,
} from "@/components/monitoring/monitor-form-notification-sections";

export function MonitorForm({
  initialValue,
  companies,
  savedEmails,
  submitting,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  initialValue: MonitorPayload;
  companies: CompanyRecord[];
  savedEmails: string[];
  submitting: boolean;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (payload: MonitorPayload) => Promise<void>;
}) {
  const [values, setValues] = useState(initialValue);
  const [tagsText, setTagsText] = useState(initialValue.tags.join(", "));

  useEffect(() => {
    setValues(initialValue);
    setTagsText(initialValue.tags.join(", "));
  }, [initialValue]);

  function setField<K extends keyof MonitorPayload>(key: K, value: MonitorPayload[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit({
      ...values,
      tags: tagsText
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <Tabs defaultValue="general" className="flex-col">
        <TabsList className="mb-6 grid h-9 w-full grid-cols-4 bg-surface-high">
          <TabsTrigger value="general" className="text-xs">
            General
          </TabsTrigger>
          <TabsTrigger value="check" className="text-xs">
            Check
          </TabsTrigger>
          <TabsTrigger value="notification" className="text-xs">
            Notification
          </TabsTrigger>
          <TabsTrigger value="templates" className="text-xs">
            Templates
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-0">
          <GeneralMonitorSettings
            values={values}
            companies={companies}
            tagsText={tagsText}
            onFieldChange={setField}
            onTagsTextChange={setTagsText}
          />
        </TabsContent>

        <TabsContent value="check" className="mt-0">
          <CheckMonitorSettings values={values} onFieldChange={setField} />
        </TabsContent>

        <TabsContent value="notification" className="mt-0">
          <NotificationMonitorSettings values={values} savedEmails={savedEmails} onFieldChange={setField} />
        </TabsContent>

        <TabsContent value="templates" className="mt-0">
          <TemplateMonitorSettings values={values} onFieldChange={setField} />
        </TabsContent>
      </Tabs>

      <DialogFooter className="mt-6 border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving..." : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
