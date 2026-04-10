"use client";

import { useRef } from "react";
import { Bold, Italic, Link2, Pilcrow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface TemplateEditorProps {
  label: string;
  hint: string;
  value: string;
  rows?: number;
  onChange: (value: string) => void;
}

const URL_TOKEN = "{url_link}";
const LINE_BREAK = "\n";

export function TemplateEditor({
  label,
  hint,
  value,
  rows = 8,
  onChange,
}: TemplateEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const wrapSelection = (prefix: string, suffix = prefix) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      onChange(`${value}${prefix}${suffix}`);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.slice(start, end);
    const nextValue = `${value.slice(0, start)}${prefix}${selectedText}${suffix}${value.slice(end)}`;

    onChange(nextValue);

    requestAnimationFrame(() => {
      textarea.focus();
      const caretStart = start + prefix.length;
      const caretEnd = caretStart + selectedText.length;
      textarea.setSelectionRange(caretStart, caretEnd);
    });
  };

  const insertAtCursor = (snippet: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      onChange(`${value}${snippet}`);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const nextValue = `${value.slice(0, start)}${snippet}${value.slice(end)}`;

    onChange(nextValue);

    requestAnimationFrame(() => {
      const caret = start + snippet.length;
      textarea.focus();
      textarea.setSelectionRange(caret, caret);
    });
  };

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label className="text-sm">{label}</Label>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/20 px-3 py-2">
          <Button type="button" variant="ghost" size="sm" className="h-8 px-2.5" onClick={() => wrapSelection("**")}>
            <Bold className="mr-1 h-3.5 w-3.5" />
            Bold
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-8 px-2.5" onClick={() => wrapSelection("_")}>
            <Italic className="mr-1 h-3.5 w-3.5" />
            Italic
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-8 px-2.5" onClick={() => insertAtCursor(URL_TOKEN)}>
            <Link2 className="mr-1 h-3.5 w-3.5" />
            URL token
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-8 px-2.5" onClick={() => insertAtCursor(LINE_BREAK)}>
            <Pilcrow className="mr-1 h-3.5 w-3.5" />
            Line break
          </Button>
        </div>
        <Textarea
          ref={textareaRef}
          rows={rows}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-[180px] resize-y border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
      </div>
    </div>
  );
}
