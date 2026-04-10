"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { HelpCategory } from "@/components/help/help-data";
import { cn } from "@/lib/utils";

type HelpFaqPanelProps = {
  category: HelpCategory;
};

export function HelpFaqPanel({ category }: HelpFaqPanelProps) {
  const defaultQuestion = useMemo(() => category.faqs[0]?.question ?? "", [category.faqs]);
  const [openQuestion, setOpenQuestion] = useState(defaultQuestion);

  return (
    <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
      <Card className="h-fit overflow-hidden xl:sticky xl:top-6">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border bg-muted/30 p-3">
              <category.icon className={`h-5 w-5 ${category.accent}`} />
            </div>
            <div>
              <CardTitle>{category.label}</CardTitle>
              <CardDescription>{category.summary}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <InfoStrip
            title="Operator hint"
            text="Read this section when you need to understand product behavior, not just where to click."
          />
          <InfoStrip
            title="What is covered"
            text={`${category.faqs.length} focused questions about ${category.label.toLowerCase()} behavior are documented below.`}
          />
          <Separator />
          <p className="text-sm leading-7 text-muted-foreground">
            Sentrovia is intentionally database-driven and worker-aware. That means the UI always
            reflects persisted state rather than temporary browser assumptions, especially in the
            categories covered here.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {category.faqs.map((faq, index) => {
          const isOpen = faq.question === openQuestion;

          return (
            <Card key={faq.question} className="overflow-hidden">
              <CardContent
                className={cn(
                  "border-l-2 px-5 py-4 transition-colors",
                  isOpen ? "border-l-amber-500/80" : "border-l-amber-500/35"
                )}
              >
                <Button
                  variant="ghost"
                  className="h-auto w-full justify-between px-0 py-0 text-left hover:bg-transparent"
                  onClick={() => setOpenQuestion(isOpen ? "" : faq.question)}
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 text-xs font-semibold uppercase tracking-[0.2em] text-amber-500 dark:text-amber-300">
                      Q{String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="text-base font-semibold tracking-tight">{faq.question}</span>
                  </div>
                  <ChevronDown
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0 transition-transform",
                      isOpen ? "rotate-180 text-amber-500 dark:text-amber-300" : "text-muted-foreground"
                    )}
                  />
                </Button>

                {isOpen ? (
                  <div className="ml-[3.1rem] mt-4 rounded-2xl bg-muted/[0.05] px-4 py-3">
                    <p className="text-sm leading-7 text-muted-foreground">{faq.answer}</p>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function InfoStrip({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border bg-muted/[0.06] px-4 py-3">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{text}</p>
    </div>
  );
}
