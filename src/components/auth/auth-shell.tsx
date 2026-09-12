"use client";

import { ObservatoryShell } from "@/components/auth/observatory-shell";
import styles from "./auth-shell.module.css";

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
    <ObservatoryShell contextLabel="Self-hosted monitoring" footerText="Your monitoring data stays with you.">
      <section className="flex min-h-svh items-center justify-center px-5 py-24 sm:px-8 sm:py-28">
        <div className={`${styles.authForm} w-full max-w-[29rem]`}>
          <div className="mb-8 text-center sm:mb-9">
            <h1 className="text-balance text-[2.35rem] font-semibold leading-none tracking-[-0.045em] text-white sm:text-[2.8rem]">{formTitle}</h1>
            <p className="mx-auto mt-3 max-w-md text-[0.95rem] leading-6 text-blue-100/68 sm:text-base">{formDescription}</p>
          </div>
          {children}
        </div>
      </section>
    </ObservatoryShell>
  );
}
