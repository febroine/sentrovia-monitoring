"use client";

import Image from "next/image";
import { SentroviaLogo } from "@/components/brand/sentrovia-logo";
import { cn } from "@/lib/utils";
import styles from "./auth-shell.module.css";

export function ObservatoryShell({
  children,
  contextLabel,
  footerText,
  scrim = "focused",
}: {
  children: React.ReactNode;
  contextLabel: string;
  footerText?: string;
  scrim?: "focused" | "broad";
}) {
  return (
    <main className="relative isolate min-h-svh overflow-x-hidden bg-[#020611] text-white">
      <Image
        alt=""
        aria-hidden="true"
        className="-z-30 object-cover object-[18%_center] sm:object-center"
        fill
        preload
        quality={94}
        sizes="100vw"
        src="/sentrovia-digital-observatory-hd.webp"
      />
      <div aria-hidden="true" className="absolute inset-0 -z-20 bg-[#020711]/45" />
      <div
        aria-hidden="true"
        className={cn(
          "absolute inset-0 -z-10",
          styles.formScrim,
          scrim === "broad" && styles.broadScrim
        )}
      />

      <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 py-5 sm:px-9 sm:py-7 lg:px-12 lg:py-8">
        <SentroviaLogo className="text-[1.35rem] text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)] sm:text-[1.55rem]" />
        <span className="hidden items-center gap-2 text-xs font-medium tracking-wide text-blue-100/60 sm:inline-flex">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-primary shadow-[0_0_14px_rgba(45,212,191,0.7)]" />
          {contextLabel}
        </span>
      </header>

      {children}

      {footerText ? (
        <footer className="absolute bottom-0 left-0 hidden px-9 py-7 text-xs text-blue-100/48 sm:block lg:px-12 lg:py-8">
          {footerText}
        </footer>
      ) : null}
    </main>
  );
}
