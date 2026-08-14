"use client";

import Image from "next/image";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import dashboardScreenshot from "../../../docs/screenshots/dashboard.png";
import { SentroviaMark } from "@/components/brand/sentrovia-mark";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    <div className="min-h-screen bg-[#090a0c] text-foreground">
      <div className="mx-auto grid min-h-screen max-w-[1600px] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_460px]">
        <section className="hidden min-h-screen border-r border-white/10 bg-[#0b0c0f] lg:flex">
          <div className="flex w-full flex-col px-10 py-9 xl:px-16">
            <header className="flex items-center gap-3">
              <SentroviaMark className="size-9 rounded-md border border-emerald-400/30 bg-emerald-400/10 text-sm text-emerald-300" />
              <div>
                <p className="text-sm font-semibold tracking-tight">Sentrovia</p>
                <p className="text-xs text-muted-foreground">Monitoring workspace</p>
              </div>
            </header>

            <div className="my-auto py-14">
              <div className="max-w-3xl">
                <p className="mb-4 text-xs font-semibold tracking-[0.16em] text-emerald-400">OPERATIONAL VISIBILITY</p>
                <h1 className="max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight text-balance xl:text-5xl">
                  {heroTitle}
                </h1>
                <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-400">
                  {heroDescription}
                </p>
              </div>

              <div className="mt-10 overflow-hidden rounded-xl border border-white/10 bg-[#101114] shadow-2xl shadow-black/20">
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-emerald-400" />
                    <span className="text-xs font-medium text-zinc-300">Live workspace</span>
                  </div>
                  <span className="text-[11px] text-zinc-500">Dashboard</span>
                </div>
                <div className="relative aspect-[16/8] overflow-hidden bg-[#090a0c]">
                  <Image
                    src={dashboardScreenshot}
                    alt="Sentrovia dashboard showing monitor and worker health"
                    fill
                    priority
                    sizes="(min-width: 1280px) 62vw, 55vw"
                    className="object-cover object-top"
                  />
                </div>
                <div className="grid grid-cols-3 divide-x divide-white/10 border-t border-white/10">
                  <AuthMetric value="Verified" label="outages" />
                  <AuthMetric value="Live" label="delivery state" />
                  <AuthMetric value="One view" label="for operations" />
                </div>
              </div>

              <div className="mt-7 grid gap-3 md:grid-cols-3">
                {showcaseCards.map((item) => (
                  <div key={item.title} className="border-t border-white/10 pt-3">
                    <div className="flex items-center gap-2">
                      <item.icon className={cn("size-4", palette.icon)} />
                      <p className="text-sm font-medium text-zinc-200">{item.title}</p>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-zinc-500">{item.description}</p>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-xs text-zinc-600">Built for teams that need evidence before escalation.</p>
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center bg-[#0d0e11] px-4 py-8 sm:px-8 lg:px-12">
          <div className="w-full max-w-[390px]">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <SentroviaMark className="size-9 rounded-md border border-emerald-400/30 bg-emerald-400/10 text-sm text-emerald-300" />
              <div>
                <p className="text-sm font-semibold">Sentrovia</p>
                <p className="text-xs text-muted-foreground">Monitoring workspace</p>
              </div>
            </div>

            <Card className="relative overflow-hidden border-white/10 bg-[#111215] shadow-2xl shadow-black/20">
              <div className={cn("absolute inset-x-0 top-0 h-0.5", palette.accentLine)} />
              <CardHeader className="gap-3 px-6 pb-5 pt-7 sm:px-7">
                <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-zinc-500">
                  <span className="size-1.5 rounded-full bg-emerald-400" />
                  WORKSPACE ACCESS
                </div>
                <div className="flex flex-col gap-2">
                  <CardTitle className="text-2xl tracking-tight">{formTitle}</CardTitle>
                  <CardDescription className="leading-6 text-zinc-400">{formDescription}</CardDescription>
                </div>
              </CardHeader>

              <CardContent className="px-6 pb-7 sm:px-7">{children}</CardContent>

              {footerPrompt && footerHref && footerLabel ? (
                <CardFooter className="flex-col items-stretch gap-4 border-t border-white/10 bg-[#0d0e11] px-6 py-5 sm:px-7">
                  <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-muted-foreground">{footerPrompt}</p>
                    <Link
                      href={footerHref}
                      className={cn("inline-flex items-center gap-2 font-medium transition-colors", palette.buttonLink)}
                    >
                      {footerLabel}
                      <ArrowRight className="size-4" />
                    </Link>
                  </div>
                </CardFooter>
              ) : null}
            </Card>
            <p className="mt-5 text-center text-xs text-zinc-600">Private workspace · Admin-managed access</p>
          </div>
        </section>
      </div>
    </div>
  );
}

function AuthMetric({ value, label }: { value: string; label: string }) {
  return (
    <div className="px-4 py-3 first:pl-4">
      <p className="text-sm font-medium text-zinc-200">{value}</p>
      <p className="mt-1 text-[11px] text-zinc-500">{label}</p>
    </div>
  );
}
