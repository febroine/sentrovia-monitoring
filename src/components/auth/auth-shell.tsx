"use client";

import { SentroviaMark } from "@/components/brand/sentrovia-mark";

export function AuthShell({
  formTitle,
  formDescription,
  children,
}: {
  formTitle: string;
  formDescription: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-svh bg-background text-foreground">
      <div className="grid min-h-svh lg:grid-cols-[minmax(0,1.06fr)_minmax(440px,0.94fr)]">
        <ProductContext />

        <section className="flex min-h-svh bg-[#0d0e10] px-5 py-6 sm:px-10 lg:px-12 xl:px-16">
          <div className="mx-auto flex w-full max-w-[410px] flex-col">
            <MobileBrand />
            <div className="my-auto py-10 sm:py-14">
              <div className="auth-reveal mb-8">
                <h2 className="text-[1.7rem] font-semibold tracking-[-0.025em]">
                  {formTitle}
                </h2>
                <p className="mt-2.5 max-w-sm text-sm leading-6 text-muted-foreground">{formDescription}</p>
              </div>

              <div className="auth-reveal auth-delay-1">{children}</div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function ProductContext() {
  return (
    <section className="hidden min-h-svh border-r border-white/[0.08] bg-[#090a0c] lg:flex">
      <div className="mx-auto flex w-full max-w-[760px] flex-col px-12 py-10 xl:px-16 xl:py-12">
        <Brand />

        <div className="my-auto max-w-[620px] py-12">
          <h1 className="auth-reveal max-w-xl text-[2.25rem] leading-[1.12] font-semibold tracking-[-0.035em] text-balance xl:text-[2.75rem]">
            Verification before notification.
          </h1>
          <p className="auth-reveal auth-delay-1 mt-5 max-w-[560px] text-[0.95rem] leading-7 text-zinc-400 xl:text-base">
            Sentrovia records the first failure, confirms the outage, and keeps the evidence with the alert.
          </p>

          <IncidentSequence />
        </div>
      </div>
    </section>
  );
}

const incidentSequence = [
  { time: "11:42:06", label: "Initial failure", detail: "HTTP 502", tone: "text-red-400" },
  { time: "11:43:06", label: "Verification", detail: "2 of 3 failed", tone: "text-amber-300" },
  { time: "11:44:07", label: "Incident confirmed", detail: "Delivery queued", tone: "text-emerald-400" },
];

function IncidentSequence() {
  return (
    <div className="auth-reveal auth-delay-2 mt-12 max-w-[580px] border-y border-white/[0.09]">
      {incidentSequence.map((item) => (
        <div
          key={item.label}
          className="grid grid-cols-[76px_minmax(0,1fr)_auto] items-center gap-5 border-b border-white/[0.07] py-4 last:border-b-0"
        >
          <time className="font-mono text-[0.72rem] tabular-nums text-zinc-600">{item.time}</time>
          <span className="text-sm font-medium text-zinc-200">{item.label}</span>
          <span className={`text-xs font-medium tabular-nums ${item.tone}`}>{item.detail}</span>
        </div>
      ))}
    </div>
  );
}

function Brand() {
  return (
    <header className="auth-reveal flex items-center gap-3">
      <SentroviaMark className="size-8 shrink-0 text-primary" />
      <p className="text-[1.05rem] font-semibold tracking-[-0.02em]">Sentrovia</p>
    </header>
  );
}

function MobileBrand() {
  return (
    <div className="auth-reveal flex items-center gap-3 lg:hidden">
      <SentroviaMark className="size-8 shrink-0 text-primary" />
      <p className="text-[1.05rem] font-semibold tracking-[-0.02em]">Sentrovia</p>
    </div>
  );
}
