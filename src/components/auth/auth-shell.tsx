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
      <section className="flex min-h-svh px-5 py-6 sm:px-8">
        <div className="mx-auto flex w-full max-w-[410px] flex-col">
          <Brand />
          <div className="my-auto py-10 sm:py-14">
            <div className="mb-8">
              <h1 className="text-[1.7rem] font-semibold tracking-[-0.025em]">{formTitle}</h1>
              <p className="mt-2.5 max-w-sm text-sm leading-6 text-muted-foreground">{formDescription}</p>
            </div>
            {children}
          </div>
        </div>
      </section>
    </main>
  );
}

function Brand() {
  return (
    <header className="flex items-center gap-3">
      <SentroviaMark className="size-8 shrink-0 text-primary" />
      <p className="text-[1.05rem] font-semibold tracking-[-0.02em]">Sentrovia</p>
    </header>
  );
}
