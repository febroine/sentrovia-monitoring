"use client";

import { useState } from "react";
import { Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function MonitorTagsDialog({
  open,
  onOpenChange,
  selectedCount,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  onApply: (payload: { action: "add" | "remove" | "replace"; tags: string[] }) => Promise<void>;
}) {
  const [action, setAction] = useState<"add" | "remove" | "replace">("add");
  const [tagsText, setTagsText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    await onApply({
      action,
      tags: tagsText.split(",").map((tag) => tag.trim()).filter(Boolean),
    });
    setSubmitting(false);
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setAction("add");
          setTagsText("");
          setSubmitting(false);
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Tag-based operations</DialogTitle>
          <DialogDescription>
            Apply a tag patch to {selectedCount} selected monitor{selectedCount === 1 ? "" : "s"}.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="space-y-2">
            <Label>Action</Label>
            <Select value={action} onValueChange={(value) => setAction(value as "add" | "remove" | "replace")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="add">Add tags</SelectItem>
                <SelectItem value="remove">Remove tags</SelectItem>
                <SelectItem value="replace">Replace tags</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Tags</Label>
            <Input
              value={tagsText}
              onChange={(event) => setTagsText(event.target.value)}
              placeholder="critical, api, customer-facing"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => void handleSubmit()} disabled={submitting || tagsText.trim().length === 0}>
            <Tags data-icon="inline-start" />
            {submitting ? "Applying..." : "Apply tags"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
