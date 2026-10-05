"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";

type NumberInputProps = Omit<React.ComponentProps<typeof Input>, "type" | "value" | "defaultValue" | "onChange"> & {
  value: number | null | undefined;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
};

// An integer field that can be cleared and retyped. Replacing the value on every keystroke (for example
// `Number(value) || 1`) turned an emptied field into "1", so typing 30 produced 130. Here the text is
// kept as typed, a whole number within range is passed on at once, and on blur an empty field returns
// to the last value while an out-of-range one is brought to the nearest limit.
export function NumberInput({ value, onValueChange, min, max, onBlur, ...props }: NumberInputProps) {
  const [draft, setDraft] = React.useState<string | null>(null);
  const shown = draft ?? (typeof value === "number" && Number.isFinite(value) ? String(value) : "");
  const parsed = draft === null ? null : parseInteger(draft);
  const invalid = draft !== null && (parsed === null || !isWithin(parsed, min, max));

  return (
    <Input
      {...props}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={shown}
      aria-invalid={invalid || props["aria-invalid"] || undefined}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        const number = parseInteger(next);
        if (number !== null && isWithin(number, min, max)) {
          onValueChange(number);
        }
      }}
      onBlur={(event) => {
        if (draft !== null) {
          const number = parseInteger(draft);
          if (number !== null) {
            const clamped = Math.min(max ?? number, Math.max(min ?? number, number));
            if (clamped !== value) onValueChange(clamped);
          }
          setDraft(null);
        }
        onBlur?.(event);
      }}
    />
  );
}

function parseInteger(value: string) {
  const trimmed = value.trim();
  return /^-?\d+$/.test(trimmed) ? Number(trimmed) : null;
}

function isWithin(value: number, min?: number, max?: number) {
  return (min === undefined || value >= min) && (max === undefined || value <= max);
}
