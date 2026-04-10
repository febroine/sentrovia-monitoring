"use client";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { LogRecord } from "@/lib/logs/types";

export function SuggestionField({
  label,
  placeholder,
  hint,
  value,
  suggestions,
  onChange,
}: {
  label: string;
  placeholder: string;
  hint: string;
  value: string;
  suggestions: string[];
  onChange: (value: string) => void;
}) {
  const listId = `${label.toLowerCase().replaceAll(" ", "-")}-list`;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <Input list={listId} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      <datalist id={listId}>
        {suggestions.map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <Input type="date" value={value} onChange={(event) => onChange(event.target.value)} />
      <p className="text-xs text-muted-foreground">Use the calendar picker to limit results to a specific time window.</p>
    </div>
  );
}

export function LevelBadge({ level }: { level: LogRecord["level"] }) {
  if (level === "critical") {
    return (
      <Badge variant="outline" className="border-destructive/30 text-destructive">
        Critical
      </Badge>
    );
  }

  if (level === "error") {
    return (
      <Badge variant="outline" className="border-red-500/30 text-red-600 dark:text-red-400">
        Error
      </Badge>
    );
  }

  if (level === "warning") {
    return (
      <Badge variant="outline" className="border-amber-500/30 text-amber-600 dark:text-amber-400">
        Warning
      </Badge>
    );
  }

  return <Badge variant="outline">Info</Badge>;
}
