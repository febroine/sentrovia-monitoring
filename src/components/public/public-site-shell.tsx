"use client";

import Link from "next/link";
import { ArrowUpRight, GitBranch, Menu, X } from "lucide-react";
import { useState } from "react";
import { SentroviaLogo } from "@/components/brand/sentrovia-logo";
import { cn } from "@/lib/utils";

const githubUrl = "https://github.com/febroine/sentrovia-monitoring";

type PublicNavItem = {
  href: string;
  label: string;
  external?: boolean;
  active?: boolean;
};

export type PublicPage = "product" | "about" | "help";

export function PublicSiteShell({ children, active }: { children: React.ReactNode; active?: PublicPage }) {
  return (
    <div className="min-h-svh bg-space-ink text-space-ice">
      <PublicSiteHeader active={active} />
      <main>{children}</main>
      <PublicSiteFooter />
    </div>
  );
}

export function PublicSiteHeader({ active }: { active?: PublicPage }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navItems: PublicNavItem[] = [
    { href: "/about#product", label: "Product", active: active === "product" },
    { href: "/about", label: "About", active: active === "about" },
    { href: "/help", label: "Help", active: active === "help" },
    { href: githubUrl, label: "GitHub", external: true },
  ];

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <header className="relative z-30 bg-space-ink">
      <div className="flex min-h-[4.5rem] w-full items-center justify-between gap-6 px-[clamp(1rem,4vw,4.5rem)]">
        <Link href="/about" className="group inline-flex min-h-11 items-center gap-3 rounded-md pr-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-space-electric/70" onClick={closeMenu}>
          <SentroviaLogo />
        </Link>

        <nav aria-label="Public navigation" className="hidden items-center gap-1 lg:flex">
          {navItems.map((item) => (
            <PublicNavLink key={item.label} item={item} />
          ))}
        </nav>

        <div className="hidden items-center gap-4 lg:flex">
          <Link href="/status" className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-[13px] font-medium text-blue-100/65 transition-colors hover:text-space-ice focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-space-electric/70">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-sky-400" />
            System status
          </Link>
          <Link href="/login" className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-blue-100/70 transition-colors hover:text-space-ice focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-space-electric/70">
            Sign in
          </Link>
          <Link href="/onboarding" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-space-blue px-4 pb-px text-sm leading-none font-semibold text-white transition-[background-color,color] hover:bg-space-electric hover:text-space-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-space-electric/80">
            Get started
            <ArrowUpRight aria-hidden="true" className="size-4" />
          </Link>
        </div>

        <button
          type="button"
          aria-expanded={menuOpen}
          aria-controls="public-mobile-navigation"
          aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
          className="inline-flex size-11 items-center justify-center rounded-md bg-space-navy/45 text-blue-100/80 transition-colors hover:bg-space-navy/75 hover:text-space-ice focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-space-electric/70 lg:hidden"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
      </div>

      {menuOpen ? (
        <div id="public-mobile-navigation" className="bg-space-navy/35 px-[clamp(1rem,4vw,4.5rem)] py-3 lg:hidden">
          <nav aria-label="Mobile public navigation" className="flex flex-col">
            {navItems.map((item) => (
              <PublicNavLink key={item.label} item={item} mobile onNavigate={closeMenu} />
            ))}
            <div className="mt-3 grid grid-cols-2 gap-2 rounded-md bg-space-ink/35 p-2">
              <Link href="/login" onClick={closeMenu} className="inline-flex min-h-11 items-center justify-center rounded-md border border-space-blue/30 px-4 pb-px text-sm leading-none font-medium text-space-ice transition-colors hover:border-space-blue/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-space-electric/70">Sign in</Link>
              <Link href="/onboarding" onClick={closeMenu} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-space-blue px-4 pb-px text-sm leading-none font-semibold text-white transition-colors hover:bg-space-electric hover:text-space-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-space-electric/70">Get started <ArrowUpRight aria-hidden="true" className="size-4" /></Link>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}

function PublicNavLink({ item, mobile = false, onNavigate }: { item: PublicNavItem; mobile?: boolean; onNavigate?: () => void }) {
  const className = cn(
    "inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-space-electric/70",
    mobile ? "justify-between px-3 text-base" : "px-3",
    item.active ? "text-space-ice" : "text-blue-100/60 hover:text-space-ice"
  );
  const content = (
    <>
      {item.label}
      {item.external ? <ArrowUpRight aria-hidden="true" className="size-3.5" /> : null}
      {item.active ? <span aria-hidden="true" className="size-1.5 rounded-full bg-space-electric" /> : null}
    </>
  );

  if (item.external) {
    return <a href={item.href} target="_blank" rel="noreferrer" className={className} onClick={onNavigate}>{content}<span className="sr-only"> (opens in a new tab)</span></a>;
  }

  return <Link href={item.href} className={className} aria-current={item.active ? "page" : undefined} onClick={onNavigate}>{content}</Link>;
}

export function PublicSiteFooter() {
  return (
    <footer className="bg-space-navy/25 px-[clamp(1rem,4vw,4.5rem)] py-6">
      <div className="flex flex-col gap-4 text-sm text-blue-100/55 sm:flex-row sm:items-center sm:justify-between">
        <p>Sentrovia · verification-first monitoring for infrastructure you control.</p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link href="/about" className="transition-colors hover:text-space-ice focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-space-electric/70">About</Link>
          <Link href="/help" className="transition-colors hover:text-space-ice focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-space-electric/70">Help</Link>
          <a href={githubUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 transition-colors hover:text-space-ice focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-space-electric/70">
            <GitBranch aria-hidden="true" className="size-4" />
            GitHub
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      </div>
    </footer>
  );
}
