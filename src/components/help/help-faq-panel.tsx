"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Dot, Sparkles } from "lucide-react";
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
    <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
      <Card className="h-fit overflow-hidden border-border/70 xl:sticky xl:top-6">
        <div className="border-b bg-card">
          <CardHeader className="pb-4">
            <div className="flex items-start gap-4">
              <div className="rounded-[1.25rem] border border-border/70 bg-background p-3 shadow-sm">
                <category.icon className={`h-5 w-5 ${category.accent}`} />
              </div>
              <div className="space-y-1">
                <CardTitle>{category.label}</CardTitle>
                <CardDescription className="leading-6">{category.summary}</CardDescription>
              </div>
            </div>
          </CardHeader>
        </div>

        <CardContent className="space-y-4 pt-5">
          <InfoStrip
            title="Operator hint"
            text="Read this section when you need behavior clarity, not just button locations."
            tone="warm"
          />
          <InfoStrip
            title="What is covered"
            text={`${category.faqs.length} focused questions about ${category.label.toLowerCase()} are documented below.`}
            tone="neutral"
          />
          <Separator />
          <div className="rounded-2xl border border-dashed border-border/70 bg-muted/[0.05] px-4 py-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-primary/80" />
              Reading model
            </div>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              Sentrovia is intentionally database-driven and worker-aware. These answers describe what the
              runtime actually does so the UI stays understandable under load, failure, and background work.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {category.faqs.map((faq, index) => {
          const isOpen = faq.question === openQuestion;
          const questionNumber = `Q${String(index + 1).padStart(2, "0")}`;

          return (
            <Card
              key={faq.question}
              className={cn(
                "overflow-hidden border-border/70 transition-all duration-200",
                isOpen
                  ? "border-amber-500/30 bg-[linear-gradient(180deg,rgba(251,191,36,0.08),transparent_45%)] shadow-[0_10px_30px_rgba(251,191,36,0.06)]"
                  : "bg-background/80 hover:border-amber-500/20 hover:bg-muted/[0.04]"
              )}
            >
              <CardContent className="px-5 py-5">
                <Button
                  variant="ghost"
                  className="h-auto w-full justify-between px-0 py-0 text-left hover:bg-transparent"
                  onClick={() => setOpenQuestion(isOpen ? "" : faq.question)}
                >
                  <div className="flex min-w-0 items-start gap-4">
                    <div
                      className={cn(
                        "flex min-h-12 min-w-12 items-center justify-center rounded-2xl border text-xs font-semibold uppercase tracking-[0.2em]",
                        isOpen
                          ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300"
                          : "border-border/70 bg-muted/20 text-muted-foreground"
                      )}
                    >
                      {questionNumber}
                    </div>

                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-semibold tracking-tight">{faq.question}</span>
                        {isOpen ? (
                          <span className="inline-flex items-center rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                            Open
                          </span>
                        ) : null}
                      </div>
                      <p className="text-sm leading-6 text-muted-foreground">
                        {isOpen ? "Expanded answer below." : "Tap to expand the runtime explanation."}
                      </p>
                    </div>
                  </div>

                  <div
                    className={cn(
                      "ml-4 rounded-full border p-2 transition-all",
                      isOpen
                        ? "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-300"
                        : "border-border/70 bg-background text-muted-foreground"
                    )}
                  >
                    <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", isOpen && "rotate-180")} />
                  </div>
                </Button>

                {isOpen ? (
                  <div className="mt-5 rounded-[1.4rem] border border-amber-500/15 bg-[linear-gradient(180deg,rgba(251,191,36,0.08),rgba(251,191,36,0.02))] p-4">
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700 dark:text-amber-300">
                      <Dot className="h-4 w-4" />
                      Answer
                    </div>
                    <p className="mt-3 text-sm leading-7 text-muted-foreground">{faq.answer}</p>
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
  tone,
}: {
  title: string;
  text: string;
  tone: "warm" | "neutral";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3",
        tone === "warm" && "border-amber-500/15 bg-amber-500/[0.06]",
        tone === "neutral" && "border-border/70 bg-muted/[0.06]"
      )}
    >
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{text}</p>
    </div>
  );
}
