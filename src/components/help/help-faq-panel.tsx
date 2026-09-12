"use client";

import { ChevronDown, CircleHelp } from "lucide-react";
import type { HelpCategory } from "@/components/help/help-data";

type HelpFaqPanelProps = {
  category: HelpCategory;
};

export function HelpFaqPanel({ category }: HelpFaqPanelProps) {
  return (
    <section aria-label={`${category.label}: ${category.summary}`}>
      <div className="grid gap-3">
        {category.faqs.map((faq, index) => (
          <details key={faq.question} className="group rounded-md bg-muted/20" open={index === 0 ? true : undefined}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 [&::-webkit-details-marker]:hidden">
              <span className="flex min-w-0 items-center gap-3 text-sm font-medium sm:text-base">
                <CircleHelp aria-hidden="true" className="size-4 shrink-0 text-primary/80" />
                <span>{faq.question}</span>
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <p className="px-4 pb-5 text-sm leading-7 text-muted-foreground">{faq.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
