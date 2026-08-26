"use client";

import { ChevronDown } from "lucide-react";
import type { HelpCategory } from "@/components/help/help-data";

type HelpFaqPanelProps = {
  category: HelpCategory;
};

export function HelpFaqPanel({ category }: HelpFaqPanelProps) {
  return (
    <section aria-label={`${category.label}: ${category.summary}`}>
      <div className="divide-y border-y">
        {category.faqs.map((faq, index) => (
          <details key={faq.question} className="group" open={index === 0 ? true : undefined}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 [&::-webkit-details-marker]:hidden">
              <span className="text-sm font-medium sm:text-base">{faq.question}</span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <p className="px-4 pb-5 text-sm leading-7 text-muted-foreground">{faq.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
