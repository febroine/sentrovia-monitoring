"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getMonitorPauseDurationMs, MAX_MONITOR_PAUSE_MS, type MonitorPauseUnit } from "@/lib/monitors/pause";

export function MonitorPauseDialog({
  open,
  monitorCount,
  submitting,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  monitorCount: number;
  submitting: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: number, unit: MonitorPauseUnit) => Promise<void>;
}) {
  const [durationValue, setDurationValue] = useState("30");
  const [durationUnit, setDurationUnit] = useState<MonitorPauseUnit>("minutes");

  const parsedDuration = Number(durationValue);
  const validDuration = Number.isSafeInteger(parsedDuration)
    && parsedDuration > 0
    && getMonitorPauseDurationMs(parsedDuration, durationUnit) <= MAX_MONITOR_PAUSE_MS;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !submitting && onOpenChange(nextOpen)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pause monitoring</DialogTitle>
          <DialogDescription>
            {monitorCount} monitor{monitorCount === 1 ? "" : "s"} will be excluded from checks and current-state reporting until the selected time ends.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-[minmax(0,1fr)_9rem] gap-3">
          <div className="space-y-2">
            <Label htmlFor="monitor-pause-duration">Duration</Label>
            <Input
              id="monitor-pause-duration"
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={durationValue}
              onChange={(event) => setDurationValue(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="monitor-pause-unit">Unit</Label>
            <Select value={durationUnit} onValueChange={(value) => setDurationUnit(value as MonitorPauseUnit)}>
              <SelectTrigger id="monitor-pause-unit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="minutes">Minutes</SelectItem>
                <SelectItem value="hours">Hours</SelectItem>
                <SelectItem value="days">Days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Maximum pause: 365 days. Monitoring resumes automatically.</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={() => void onSubmit(parsedDuration, durationUnit)} disabled={submitting || !validDuration}>
            {submitting ? "Pausing..." : "Pause monitoring"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
