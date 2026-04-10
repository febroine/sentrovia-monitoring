"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  meta: string;
};

type AuthStat = {
  label: string;
  value: string;
  detail: string;
};

const toneClasses: Record<
  AuthShellTone,
  {
    badge: string;
    accentLine: string;
    glow: string;
    buttonLink: string;
    statTone: string;
  }
> = {
  primary: {
    badge: "border-primary/30 bg-primary/12 text-primary-foreground",
    accentLine:
      "bg-[linear-gradient(90deg,rgba(99,102,241,0.95),rgba(59,130,246,0.6),transparent)]",
    glow: "shadow-[0_24px_80px_rgba(79,70,229,0.16)]",
    buttonLink: "text-primary hover:text-primary/80",
    statTone: "border-primary/20 bg-primary/10",
  },
  emerald: {
    badge: "border-emerald-400/30 bg-emerald-400/12 text-emerald-50",
    accentLine:
      "bg-[linear-gradient(90deg,rgba(16,185,129,0.95),rgba(34,197,94,0.55),transparent)]",
    glow: "shadow-[0_24px_80px_rgba(16,185,129,0.14)]",
    buttonLink: "text-emerald-300 hover:text-emerald-200",
    statTone: "border-emerald-400/20 bg-emerald-400/10",
  },
};

export function AuthShell({
  tone,
  heroTitle,
  heroDescription,
  showcaseCards,
  stats,
  statsTitle,
  statsDescription,
  formEyebrow,
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
  stats: AuthStat[];
  statsTitle: string;
  statsDescription: string;
  formEyebrow: string;
  formTitle: string;
  formDescription: string;
  footerPrompt: string;
  footerHref: string;
  footerLabel: string;
  children: React.ReactNode;
}) {
  const palette = toneClasses[tone];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="relative isolate min-h-screen overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.14),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.12),transparent_24%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:34px_34px] opacity-30" />
        <div className="absolute inset-x-0 top-0 h-24 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),transparent)]" />

        <div className="relative mx-auto grid min-h-screen max-w-[1640px] grid-cols-1 lg:grid-cols-[minmax(0,1.08fr)_minmax(460px,560px)]">
          <section className="relative hidden min-h-screen border-r border-border/70 lg:flex">
            <div className="flex w-full flex-col justify-between gap-12 px-10 py-10 xl:px-14 xl:py-12">
              <div className="flex flex-1 flex-col justify-center gap-8">
                <div className="flex max-w-3xl flex-col gap-5">
                  <h1 className="max-w-3xl text-5xl leading-[0.94] font-semibold tracking-[-0.045em] text-balance xl:text-[5.1rem]">
                    {heroTitle}
                  </h1>
                  <p className="max-w-xl text-base leading-7 text-muted-foreground xl:text-lg">
                    {heroDescription}
                  </p>
                </div>

                <div className="grid gap-4 xl:grid-cols-3">
                  {showcaseCards.map((item) => (
                    <Card key={item.title} size="sm" className="relative border-border/70 bg-card/70 backdrop-blur-sm">
                      <div className={cn("absolute inset-x-0 top-0 h-px", palette.accentLine)} />
                      <CardHeader className="gap-2">
                        <div className="flex size-9 items-center justify-center rounded-xl border border-border/80 bg-background/80">
                          <item.icon className="size-4 text-foreground" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <CardTitle>{item.title}</CardTitle>
                          <CardDescription>{item.description}</CardDescription>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          {item.meta}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <Card className={cn("border-border/70 bg-card/80 backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]", palette.glow)}>
                  <div className={cn("absolute inset-x-0 top-0 h-px", palette.accentLine)} />
                  <CardHeader>
                    <CardTitle>{statsTitle}</CardTitle>
                    <CardDescription>{statsDescription}</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-3">
                    {stats.map((item) => (
                      <div
                        key={item.label}
                        className={cn(
                          "rounded-2xl border border-border/70 px-4 py-4",
                          palette.statTone
                        )}
                      >
                        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                          {item.label}
                        </p>
                        <p className="mt-2 text-2xl font-semibold tracking-tight">{item.value}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>

          <section className="relative flex min-h-screen items-center justify-center px-4 py-10 sm:px-6 lg:px-10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.03),transparent_36%)]" />

            <div className="relative flex w-full max-w-[560px] flex-col gap-6">
              <Card
                className={cn(
                  "relative overflow-hidden border-border/80 bg-card/92 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
                  palette.glow
                )}
              >
                <div className={cn("absolute inset-x-0 top-0 h-px", palette.accentLine)} />
                <div className="absolute -right-16 top-10 size-40 rounded-full bg-white/5 blur-3xl" />
                <div className="absolute left-0 top-0 h-full w-px bg-[linear-gradient(180deg,rgba(255,255,255,0.08),transparent_40%,transparent)]" />

                <CardHeader className="gap-4 pb-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      "w-fit px-3 py-1 text-[11px] tracking-[0.2em] uppercase",
                      palette.badge
                    )}
                  >
                    {formEyebrow}
                  </Badge>
                  <div className="flex flex-col gap-2">
                    <CardTitle className="text-3xl tracking-[-0.03em]">{formTitle}</CardTitle>
                    <CardDescription className="max-w-md leading-6">
                      {formDescription}
                    </CardDescription>
                  </div>
                </CardHeader>

                <CardContent>{children}</CardContent>

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
              </Card>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
