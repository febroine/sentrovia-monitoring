import Link from "next/link";
import { ArrowRight, BookOpen, CircleHelp, FileCheck2, ShieldCheck, UserRound } from "lucide-react";
import { helpCategories } from "@/components/help/help-data";
import { PublicSiteShell } from "@/components/public/public-site-shell";

const setupSteps = [
  {
    icon: UserRound,
    title: "Create the first administrator",
    description: "Set up the account that owns this workspace and its notification settings.",
  },
  {
    icon: FileCheck2,
    title: "Add one real check",
    description: "Choose the monitor type that matches the service or job you need to verify.",
  },
  {
    icon: ShieldCheck,
    title: "Read the evidence",
    description: "Sentrovia confirms failures before treating them as outages or sending alerts.",
  },
];

const publicFaqs = [
  helpCategories[0]?.faqs[0],
  helpCategories[0]?.faqs[2],
  helpCategories[0]?.faqs[4],
].filter((faq): faq is { question: string; answer: string } => Boolean(faq));

export function PublicHelpPage() {
  return (
    <PublicSiteShell active="help">
      <div className="w-full px-[clamp(1rem,4vw,4.5rem)]">
        <section className="grid min-h-[min(42rem,calc(100svh-4.5rem))] items-center gap-12 py-16 sm:py-24 lg:grid-cols-[minmax(0,0.9fr)_minmax(24rem,1.1fr)] lg:gap-20 lg:py-24">
          <div>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-space-electric">Support / start here</p>
            <h1 className="mt-5 max-w-3xl text-balance text-[clamp(3.25rem,7vw,7rem)] font-semibold leading-[0.9] tracking-[-0.055em]">Get to a verified check.</h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-blue-100/65">A short path from first boot to useful evidence. Learn what Sentrovia checks, how verification works, and where to look when a result needs context.</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/onboarding" className="inline-flex min-h-12 items-center gap-2 rounded-md bg-space-blue px-5 pb-px text-sm leading-none font-semibold text-white transition-colors hover:bg-space-electric hover:text-space-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-space-electric/80">Start setup <ArrowRight aria-hidden="true" className="size-4" /></Link>
              <Link href="/login" className="inline-flex min-h-12 items-center rounded-md border border-space-blue/35 px-5 pb-px text-sm leading-none font-medium text-space-ice transition-colors hover:border-space-blue/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-space-electric/80">Sign in</Link>
            </div>
          </div>

          <section aria-labelledby="help-brief-title" className="rounded-xl bg-space-navy/40 p-1">
            <div className="flex items-center justify-between gap-4 rounded-lg bg-space-blue/10 px-5 py-4 sm:px-7">
              <div className="flex items-center gap-3">
                <BookOpen aria-hidden="true" className="size-5 text-space-electric" />
                <h2 id="help-brief-title" className="text-sm font-semibold">The first signal</h2>
              </div>
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-blue-100/45">Guide 01</span>
            </div>
            <ol className="grid gap-2 p-2 sm:p-3">
              {setupSteps.map((step, index) => {
                const StepIcon = step.icon;
                return (
                  <li key={step.title} className="grid grid-cols-[2rem_1fr] gap-4 px-5 py-6 sm:px-7">
                    <div className="flex size-8 items-center justify-center rounded-md bg-space-blue/15 text-space-electric">
                      <StepIcon aria-hidden="true" className="size-4" />
                    </div>
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-blue-100/45">0{index + 1}</p>
                      <h3 className="mt-1 text-base font-semibold">{step.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-blue-100/60">{step.description}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        </section>

        <section aria-labelledby="public-faq-title" className="py-16 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-[minmax(13rem,0.45fr)_minmax(0,1fr)] lg:gap-20">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-space-electric">Common questions</p>
              <h2 id="public-faq-title" className="mt-4 max-w-sm text-3xl font-semibold leading-tight tracking-[-0.04em]">Know what the result means.</h2>
              <p className="mt-4 max-w-sm text-sm leading-6 text-blue-100/60">The full operational guide is available after sign-in. These are the concepts that matter before you add your first monitor.</p>
            </div>
            <div className="grid gap-3 rounded-xl bg-space-navy/35 p-3">
              {publicFaqs.map((faq) => (
                <details key={faq.question} className="group rounded-lg bg-space-ink/40 px-3 py-5 sm:px-4">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-5 text-base font-semibold marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-space-electric/70">
                    <span className="flex items-start gap-3"><CircleHelp aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-space-electric" />{faq.question}</span>
                    <span aria-hidden="true" className="text-xl font-normal leading-none text-space-electric transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-4 max-w-3xl pl-7 text-sm leading-7 text-blue-100/60">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-4 bg-space-navy/25 py-10 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-blue-100/55">Need deployment and troubleshooting detail?</p>
          <Link href="/login?next=%2Fhelp" className="inline-flex min-h-11 items-center gap-2 font-medium text-space-ice underline decoration-space-blue/60 underline-offset-4 transition-colors hover:text-space-electric focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-space-electric/70">Open the full Help workspace <ArrowRight aria-hidden="true" className="size-4" /></Link>
        </section>
      </div>
    </PublicSiteShell>
  );
}
