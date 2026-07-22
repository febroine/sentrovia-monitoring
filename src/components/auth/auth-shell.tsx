"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type AuthShellTone = "primary" | "emerald";

type AuthShowcaseCard = {
  icon: LucideIcon;
  title: string;
  description: string;
};

const toneClasses: Record<
  AuthShellTone,
  {
    accentLine: string;
    buttonLink: string;
    icon: string;
  }
> = {
  primary: {
    accentLine: "bg-primary",
    buttonLink: "text-primary hover:text-primary/80",
    icon: "text-primary",
  },
  emerald: {
    accentLine: "bg-emerald-500",
    buttonLink: "text-emerald-300 hover:text-emerald-200",
    icon: "text-emerald-500",
  },
};

export function AuthShell({
  tone,
  heroTitle,
  heroDescription,
  showcaseCards,
  formTitle,
  formDescription,
  footerPrompt,
  footerHref,
  footerLabel,
  children,
}: {
  tone: AuthShellTone;
  heroTitle: string;
  heroDescription: string;
  showcaseCards: AuthShowcaseCard[];
  formTitle: string;
  formDescription: string;
  footerPrompt?: string;
  footerHref?: string;
  footerLabel?: string;
  children: React.ReactNode;
}) {
  const palette = toneClasses[tone];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="min-h-screen">
        <div className="mx-auto grid min-h-screen max-w-[1440px] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_520px]">
          <section className="hidden min-h-screen border-r border-border/70 bg-muted/15 lg:flex">
            <div className="flex w-full flex-col justify-center gap-8 px-12 py-12 xl:px-16">
                <div className="flex max-w-2xl flex-col gap-4">
                  <p className="text-sm font-semibold text-foreground">Sentrovia</p>
                  <h1 className="max-w-2xl text-3xl leading-tight font-semibold text-balance">
                    {heroTitle}
                  </h1>
                  <p className="max-w-xl text-base leading-7 text-muted-foreground">
                    {heroDescription}
                  </p>
                </div>

                <div className="grid max-w-2xl gap-1">
                  {showcaseCards.map((item) => (
                    <div key={item.title} className="flex gap-4 border-b border-border/70 py-4 last:border-b-0">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-background">
                          <item.icon className={cn("size-4", palette.icon)} />
                        </div>
                        <div className="min-w-0 space-y-1">
                          <p className="text-sm font-medium">{item.title}</p>
                          <p className="text-sm leading-6 text-muted-foreground">{item.description}</p>
                        </div>
                    </div>
                  ))}
                </div>
            </div>
          </section>

          <section className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-8 lg:px-10">
            <div className="flex w-full max-w-[500px] flex-col gap-6">
              <Card
                className="relative overflow-hidden border-border/80 bg-card"
              >
                <div className={cn("absolute inset-x-0 top-0 h-0.5", palette.accentLine)} />

                <CardHeader className="gap-3 pb-2">
                  <div className="flex flex-col gap-2">
                    <CardTitle className="text-2xl">{formTitle}</CardTitle>
                    <CardDescription className="max-w-md leading-6">
                      {formDescription}
                    </CardDescription>
                  </div>
                </CardHeader>

                <CardContent>{children}</CardContent>

                {footerPrompt && footerHref && footerLabel ? (
                  <CardFooter className="flex-col items-stretch gap-4 bg-muted/25">
                    <Separator />
                    <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-muted-foreground">{footerPrompt}</p>
                      <Link
                        href={footerHref}
                        className={cn(
                          "inline-flex items-center gap-2 font-medium transition-colors",
                          palette.buttonLink
                        )}
                      >
                        {footerLabel}
                        <ArrowRight className="size-4" />
                      </Link>
                    </div>
                  </CardFooter>
                ) : null}
              </Card>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
