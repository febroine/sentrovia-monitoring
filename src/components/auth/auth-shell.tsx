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
    accent: "text-primary",
    link: "text-primary hover:text-primary/80",
  },
  emerald: {
    accent: "text-emerald-500 dark:text-emerald-400",
    link: "text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 dark:hover:text-emerald-300",
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
    <main className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen lg:grid-cols-[minmax(380px,0.82fr)_minmax(480px,1.18fr)]">
        <ProductContext
          accentClassName={palette.accent}
          heroTitle={heroTitle}
          heroDescription={heroDescription}
          showcaseCards={showcaseCards}
        />

        <section className="auth-panel-enter flex min-h-screen bg-background px-5 py-6 sm:px-10 lg:px-12 xl:px-20">
          <div className="mx-auto flex w-full max-w-[440px] flex-col">
            <MobileBrand />
            <div className="my-auto py-10 sm:py-12">
              <div className="auth-reveal auth-delay-1 mb-8 border-b pb-6">
                <h2 className="text-2xl font-semibold tracking-tight">
                  {formTitle}
                </h2>
                <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{formDescription}</p>
              </div>

              <div className="auth-reveal auth-delay-2">{children}</div>

              <AuthFooter
                prompt={footerPrompt}
                href={footerHref}
                label={footerLabel}
                linkClassName={palette.link}
              />

              <p className="auth-reveal auth-delay-3 mt-8 border-t pt-5 text-center text-xs leading-5 text-muted-foreground">
                Private workspace · Admin-managed access
              </p>
            </div>
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
    <section className="hidden min-h-screen border-r bg-card/30 lg:flex">
      <div className="mx-auto flex w-full max-w-2xl flex-col px-10 py-8 xl:px-14 xl:py-10">
        <Brand accentClassName={accentClassName} />

        <div className="my-auto py-10">
          <h1 className="auth-reveal auth-delay-1 max-w-xl text-3xl leading-tight font-semibold tracking-tight text-balance xl:text-4xl">
            {heroTitle}
          </h1>
          <p className="auth-reveal auth-delay-2 mt-4 max-w-xl text-sm leading-6 text-muted-foreground xl:text-base xl:leading-7">
            {heroDescription}
          </p>

          <div className="auth-reveal auth-delay-3 mt-9 border-y">
            {showcaseCards.map((item) => (
              <ProductFact key={item.title} item={item} accentClassName={accentClassName} />
            ))}
          </div>
        </div>

        <p className="border-t pt-4 text-xs leading-5 text-muted-foreground">
          CHECK → VERIFY → NOTIFY
        </p>
      </div>
    </section>
  );
}

function ProductFact({
  item,
  accentClassName,
}: {
  item: AuthShowcaseCard;
  accentClassName: string;
}) {
  const Icon = item.icon;

  return (
    <div className="grid grid-cols-[20px_minmax(0,1fr)] items-start gap-3 border-b py-4 last:border-b-0">
      <Icon className={cn("mt-0.5 size-4", accentClassName)} aria-hidden="true" />
      <div>
        <h2 className="text-sm font-medium">{item.title}</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.description}</p>
      </div>
    </div>
  );
}

function Brand({ accentClassName }: { accentClassName: string }) {
  return (
    <header className="auth-reveal flex items-center gap-3">
      <SentroviaMark className={cn("auth-mark-enter size-8 shrink-0 text-base font-bold", accentClassName)} />
      <div>
        <p className="text-[1.1rem] font-semibold tracking-tight">Sentrovia</p>
      </div>
    </header>
  );
}

function MobileBrand() {
  return (
    <div className="auth-reveal flex items-center gap-3 lg:hidden">
      <SentroviaMark className="auth-mark-enter size-8 shrink-0 text-base font-bold text-primary" />
      <div>
        <p className="text-[1.1rem] font-semibold tracking-tight">Sentrovia</p>
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
    <div className="mt-8 flex items-center justify-between gap-4 border-t pt-6 text-sm">
      <p className="text-muted-foreground">{prompt}</p>
      <Link href={href} className={cn("inline-flex items-center gap-2 font-medium transition-colors", linkClassName)}>
        {label}
      </Link>
    </div>
  );
}
