"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { formatDurationInputMs } from "@/lib/monitors/duration";

// A duration typed in seconds and stored in milliseconds. Like NumberInput, the text is kept as typed
// (so "0.5" or a cleared field can be entered) and passed on once it is a valid value in range; on
// blur an invalid value returns to the last one and an out-of-range one is brought to the nearest limit.
export function DurationInput({
  id,
  ariaLabel,
  valueMs,
  minSeconds,
  maxSeconds,
  placeholder,
  optional = false,
  onChange,
}: {
  id?: string;
  ariaLabel: string;
  valueMs: number | null;
  minSeconds: number;
  maxSeconds: number;
  placeholder?: string;
  // An empty field means "no value" (null) instead of keeping the previous one.
  optional?: boolean;
  onChange: (value: number | null) => void;
}) {
  const [draft, setDraft] = React.useState<string | null>(null);
  const shown = draft ?? formatDurationInputMs(valueMs);
  const seconds = draft === null ? null : parseSeconds(draft);
  const invalid = draft !== null
    && !(draft.trim() === "" && optional)
    && (seconds === null || seconds < minSeconds || seconds > maxSeconds);

  return (
    <div className="flex items-center gap-2">
      <Input
        id={id}
        aria-label={ariaLabel}
        type="number"
        inputMode="decimal"
        min={minSeconds}
        max={maxSeconds}
        step="0.001"
        value={shown}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          if (next.trim() === "" && optional) {
            onChange(null);
            return;
          }
          const parsed = parseSeconds(next);
          if (parsed !== null && parsed >= minSeconds && parsed <= maxSeconds) {
            onChange(Math.round(parsed * 1_000));
          }
        }}
        onBlur={() => {
          if (draft === null) return;
          const parsed = parseSeconds(draft);
          if (parsed !== null) {
            const clamped = Math.min(maxSeconds, Math.max(minSeconds, parsed));
            const nextMs = Math.round(clamped * 1_000);
            if (nextMs !== valueMs) onChange(nextMs);
          }
          setDraft(null);
        }}
      />
      <span className="shrink-0 text-xs text-muted-foreground">seconds</span>
    </div>
  );
}

function parseSeconds(value: string) {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  return Number(trimmed);
}
