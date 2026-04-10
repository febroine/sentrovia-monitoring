'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, LayoutDashboard, Settings, Building2, ScrollText, CircleHelp, Info, Binary, UserRound, UsersRound, BellRing, BarChart3 } from 'lucide-react';
import { SentroviaMark } from '@/components/brand/sentrovia-mark';
import LogoutButton from '@/components/logout-button';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/context/translation-context';
import { SIDEBAR_ACCENT_UPDATED_EVENT } from '@/stores/use-settings-store';

const navItems = [
  { href: '/dashboard', i18nKey: 'nav.dashboard', icon: LayoutDashboard },
  { href: '/monitoring', i18nKey: 'nav.monitors', icon: Activity },
  { href: '/companies', i18nKey: 'nav.companies', icon: Building2 },
  { href: '/logs', i18nKey: 'nav.logs', icon: ScrollText },
  { href: '/delivery', i18nKey: 'nav.delivery', icon: BellRing },
  { href: '/reports', i18nKey: 'nav.reports', icon: BarChart3 },
  { href: '/status-codes', i18nKey: 'nav.statusCodes', icon: Binary },
  { href: '/members', i18nKey: 'nav.members', icon: UsersRound },
  { href: '/settings', i18nKey: 'nav.settings', icon: Settings },
];

const secondaryItems = [
  { href: '/profile', label: 'Profile', icon: UserRound },
  { href: '/help', label: 'Help', icon: CircleHelp },
  { href: '/about', label: 'About', icon: Info },
];

type SidebarProps = React.HTMLAttributes<HTMLDivElement>;
type SidebarAccent = 'amber' | 'emerald' | 'sky' | 'rose' | 'violet' | 'slate';

const accentClasses: Record<
  SidebarAccent,
  {
    shell: string;
    brandGlow: string;
    activeIcon: string;
    activeBar: string;
    hoverBar: string;
    badgeDot: string;
  }
> = {
  amber: {
    shell: 'bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.10),transparent_22%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.04),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent_18%)]',
    brandGlow: 'bg-[linear-gradient(135deg,rgba(245,158,11,0.12),transparent_55%)] text-amber-600 dark:text-amber-300',
    activeIcon: 'border-amber-500/30 bg-amber-500/12 text-amber-600 shadow-[0_0_0_1px_rgba(245,158,11,0.08)_inset] dark:text-amber-300',
    activeBar: 'bg-amber-500/95',
    hoverBar: 'group-hover:bg-amber-500/25',
    badgeDot: 'bg-emerald-400/90',
  },
  emerald: {
    shell: 'bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.11),transparent_22%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.04),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent_18%)]',
    brandGlow: 'bg-[linear-gradient(135deg,rgba(16,185,129,0.12),transparent_55%)] text-emerald-600 dark:text-emerald-300',
    activeIcon: 'border-emerald-500/30 bg-emerald-500/12 text-emerald-600 shadow-[0_0_0_1px_rgba(16,185,129,0.08)_inset] dark:text-emerald-300',
    activeBar: 'bg-emerald-500/95',
    hoverBar: 'group-hover:bg-emerald-500/25',
    badgeDot: 'bg-emerald-400/90',
  },
  sky: {
    shell: 'bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.11),transparent_22%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.04),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent_18%)]',
    brandGlow: 'bg-[linear-gradient(135deg,rgba(14,165,233,0.12),transparent_55%)] text-sky-600 dark:text-sky-300',
    activeIcon: 'border-sky-500/30 bg-sky-500/12 text-sky-600 shadow-[0_0_0_1px_rgba(14,165,233,0.08)_inset] dark:text-sky-300',
    activeBar: 'bg-sky-500/95',
    hoverBar: 'group-hover:bg-sky-500/25',
    badgeDot: 'bg-sky-400/90',
  },
  rose: {
    shell: 'bg-[radial-gradient(circle_at_top_left,rgba(244,63,94,0.11),transparent_22%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.04),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent_18%)]',
    brandGlow: 'bg-[linear-gradient(135deg,rgba(244,63,94,0.12),transparent_55%)] text-rose-600 dark:text-rose-300',
    activeIcon: 'border-rose-500/30 bg-rose-500/12 text-rose-600 shadow-[0_0_0_1px_rgba(244,63,94,0.08)_inset] dark:text-rose-300',
    activeBar: 'bg-rose-500/95',
    hoverBar: 'group-hover:bg-rose-500/25',
    badgeDot: 'bg-rose-400/90',
  },
  violet: {
    shell: 'bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,0.11),transparent_22%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.04),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent_18%)]',
    brandGlow: 'bg-[linear-gradient(135deg,rgba(139,92,246,0.12),transparent_55%)] text-violet-600 dark:text-violet-300',
    activeIcon: 'border-violet-500/30 bg-violet-500/12 text-violet-600 shadow-[0_0_0_1px_rgba(139,92,246,0.08)_inset] dark:text-violet-300',
    activeBar: 'bg-violet-500/95',
    hoverBar: 'group-hover:bg-violet-500/25',
    badgeDot: 'bg-violet-400/90',
  },
  slate: {
    shell: 'bg-[radial-gradient(circle_at_top_left,rgba(148,163,184,0.12),transparent_22%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.04),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent_18%)]',
    brandGlow: 'bg-[linear-gradient(135deg,rgba(148,163,184,0.12),transparent_55%)] text-slate-500 dark:text-slate-300',
    activeIcon: 'border-slate-400/30 bg-slate-400/12 text-slate-300 shadow-[0_0_0_1px_rgba(148,163,184,0.08)_inset]',
    activeBar: 'bg-slate-300',
    hoverBar: 'group-hover:bg-slate-400/25',
    badgeDot: 'bg-slate-300/90',
  },
};

export default function Sidebar({ className, ...props }: SidebarProps) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const [accent, setAccent] = useState<SidebarAccent>('emerald');
  const palette = accentClasses[accent];

  useEffect(() => {
    let active = true;

    function handleAccentUpdate(event: Event) {
      const detail = (event as CustomEvent<{ accent?: SidebarAccent }>).detail;
      if (detail?.accent) {
        setAccent(detail.accent);
      }
    }

    void fetch('/api/settings', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return null;
        const data = (await response.json()) as { settings?: { appearance?: { sidebarAccent?: SidebarAccent } } };
        if (active && data.settings?.appearance?.sidebarAccent) {
          setAccent(data.settings.appearance.sidebarAccent);
        }
        return null;
      })
      .catch(() => undefined);

    window.addEventListener(SIDEBAR_ACCENT_UPDATED_EVENT, handleAccentUpdate);

    return () => {
      active = false;
      window.removeEventListener(SIDEBAR_ACCENT_UPDATED_EVENT, handleAccentUpdate);
    };
  }, []);

  return (
    <div
      className={cn(
        'border-r p-5 pt-8',
        palette.shell,
        className
      )}
      {...props}
    >
      <div className="flex min-h-full flex-col">
        <div className="mb-8 px-1">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border shadow-[0_10px_24px_rgba(0,0,0,0.18)]',
                palette.activeIcon
              )}
            >
              <div className={cn('pointer-events-none absolute inset-0 opacity-80', palette.brandGlow)} />
              <SentroviaMark className="relative z-10 text-[1rem] font-bold" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-[1.1rem] font-semibold tracking-tight text-foreground">Sentrovia</h1>
            </div>
          </div>
        </div>

        <nav className="flex flex-col gap-1.5">
          {navItems.map(({ href, i18nKey, icon: Icon }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'group flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-sm font-medium transition-all',
                  isActive
                    ? 'border-border/70 bg-card/95 text-foreground shadow-[0_14px_28px_rgba(0,0,0,0.14)]'
                    : 'border-transparent text-muted-foreground hover:border-border/60 hover:bg-card/65 hover:text-foreground'
                )}
              >
                <div
                  className={cn(
                    'flex size-8 items-center justify-center rounded-xl border transition-colors',
                    isActive
                      ? palette.activeIcon
                      : 'border-border/70 bg-background/90 text-muted-foreground group-hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <span className="flex-1 truncate">{t(i18nKey)}</span>
                <span
                  className={cn(
                    'h-7 w-1.5 rounded-full transition-colors',
                    isActive ? palette.activeBar : cn('bg-transparent', palette.hoverBar)
                  )}
                />
              </Link>
            );
          })}
        </nav>

        <div className="mt-8 border-t border-border/70 pt-5">
          <div className="mb-3 px-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-foreground/80">Resources</p>
          </div>
          <nav className="flex flex-col gap-1.5">
            {secondaryItems.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'group flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-sm font-medium transition-all',
                    isActive
                      ? 'border-border/70 bg-card/95 text-foreground shadow-[0_14px_28px_rgba(0,0,0,0.14)]'
                      : 'border-transparent text-muted-foreground hover:border-border/60 hover:bg-card/65 hover:text-foreground'
                  )}
                >
                  <div
                    className={cn(
                      'flex size-8 items-center justify-center rounded-xl border transition-colors',
                      isActive
                        ? palette.activeIcon
                        : 'border-border/70 bg-background/90 text-muted-foreground group-hover:text-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="flex-1 truncate">{label}</span>
                  <span
                    className={cn(
                      'h-7 w-1.5 rounded-full transition-colors',
                      isActive ? palette.activeBar : cn('bg-transparent', palette.hoverBar)
                    )}
                  />
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto pt-6">
          <LogoutButton className="h-12 w-full justify-start rounded-2xl border border-border/80 bg-card/90 px-4 text-sm font-medium shadow-[0_16px_28px_rgba(0,0,0,0.16)] backdrop-blur" />
        </div>
      </div>
    </div>
  );
}
