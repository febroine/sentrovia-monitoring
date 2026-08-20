"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { SentroviaMark } from "@/components/brand/sentrovia-mark";
import { cn } from "@/lib/utils";

type AuthShellTone = "primary" | "emerald";

type AuthShowcaseCard = {
  icon: LucideIcon;
  title: string;
  description: string;
};

const toneClasses: Record<AuthShellTone, { accent: string; link: string }> = {
  primary: {
    accent: "bg-indigo-400",
    link: "text-indigo-300 hover:text-indigo-200",
  },
  emerald: {
    accent: "bg-emerald-400",
    link: "text-emerald-300 hover:text-emerald-200",
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
    <main className="min-h-screen bg-[#090a0c] text-foreground">
      <div className="grid min-h-screen lg:grid-cols-[minmax(0,1.12fr)_minmax(420px,0.88fr)]">
        <ProductContext
          accentClassName={palette.accent}
          heroTitle={heroTitle}
          heroDescription={heroDescription}
          showcaseCards={showcaseCards}
        />

        <section className="flex min-h-screen border-white/10 bg-[#0d0e11] px-5 py-6 sm:px-10 lg:border-l lg:px-12 xl:px-16">
          <div className="mx-auto flex w-full max-w-[420px] flex-col">
            <MobileBrand />
            <div className="my-auto py-12">
              <div className="mb-9 border-b border-white/10 pb-7">
                <p className="mb-3 text-[11px] font-semibold tracking-[0.18em] text-zinc-500 uppercase">
                  Workspace access
                </p>
                <h2 className="text-2xl font-semibold tracking-tight text-zinc-100">
                  {formTitle}
                </h2>
                <p className="mt-3 max-w-sm text-sm leading-6 text-zinc-400">{formDescription}</p>
              </div>

              {children}

              <AuthFooter
                prompt={footerPrompt}
                href={footerHref}
                label={footerLabel}
                linkClassName={palette.link}
              />
            </div>

            <p className="pb-2 text-center text-[11px] tracking-wide text-zinc-600">
              Private workspace · Admin-managed access
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function ProductContext({
  accentClassName,
  heroTitle,
  heroDescription,
  showcaseCards,
}: {
  accentClassName: string;
  heroTitle: string;
  heroDescription: string;
  showcaseCards: AuthShowcaseCard[];
}) {
  return (
    <section className="relative hidden min-h-screen overflow-hidden bg-[#090a0c] lg:flex">
      <div className="absolute inset-y-0 right-0 w-px bg-white/5" />
      <div className="flex w-full flex-col px-10 py-9 xl:px-16 2xl:px-24">
        <Brand />

        <div className="my-auto max-w-3xl py-12">
          <span className={cn("mb-6 block h-0.5 w-10", accentClassName)} />
          <h1 className="max-w-2xl text-3xl leading-tight font-semibold tracking-tight text-balance xl:text-4xl">
            {heroTitle}
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-400 xl:text-base xl:leading-7">
            {heroDescription}
          </p>

          <div className="mt-10 border-y border-white/10">
            {showcaseCards.map((item, index) => (
              <ProductFact key={item.title} index={index} item={item} />
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-6 border-t border-white/10 pt-5 text-[11px] tracking-wide text-zinc-600">
          <span>CHECK → VERIFY → NOTIFY</span>
        </div>
      </div>
    </section>
  );
}

function ProductFact({
  index,
  item,
}: {
  index: number;
  item: AuthShowcaseCard;
}) {
  return (
    <div className="grid grid-cols-[36px_minmax(0,1fr)] items-start gap-4 border-b border-white/10 py-4 last:border-b-0">
      <span className="pt-0.5 font-mono text-[11px] text-zinc-600">0{index + 1}</span>
      <div className="grid gap-1.5 xl:grid-cols-[150px_minmax(0,1fr)] xl:gap-6">
        <div className="flex items-center">
          <h2 className="text-sm font-medium text-zinc-200">{item.title}</h2>
        </div>
        <p className="text-sm leading-6 text-zinc-500">{item.description}</p>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <header className="flex items-center gap-3">
      <SentroviaMark className="size-9 border border-white/15 bg-white/[0.035] text-sm text-zinc-100" />
      <div>
        <p className="text-sm font-semibold tracking-tight">Sentrovia</p>
        <p className="text-xs text-zinc-600">Operations monitoring</p>
      </div>
    </header>
  );
}

function MobileBrand() {
  return (
    <div className="flex items-center gap-3 lg:hidden">
      <SentroviaMark className="size-9 border border-white/15 bg-white/[0.035] text-sm text-zinc-100" />
      <div>
        <p className="text-sm font-semibold">Sentrovia</p>
        <p className="text-xs text-zinc-600">Operations monitoring</p>
      </div>
    </div>
  );
}

function AuthFooter({
  prompt,
  href,
  label,
  linkClassName,
}: {
  prompt?: string;
  href?: string;
  label?: string;
  linkClassName: string;
}) {
  if (!prompt || !href || !label) {
    return null;
  }

  return (
    <div className="mt-8 flex items-center justify-between gap-4 border-t border-white/10 pt-6 text-sm">
      <p className="text-zinc-500">{prompt}</p>
      <Link href={href} className={cn("inline-flex items-center gap-2 font-medium transition-colors", linkClassName)}>
        {label}
      </Link>
    </div>
  );
}
