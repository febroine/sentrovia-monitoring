'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, LayoutDashboard, Settings, Building2, ScrollText, CircleHelp, Info, Binary, UserRound, UsersRound, BellRing, BarChart3, HeartPulse } from 'lucide-react';
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
  { href: '/system-health', i18nKey: 'nav.systemHealth', icon: HeartPulse, adminOnly: true },
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
    activeIcon: string;
    activeBar: string;
    hoverBar: string;
  }
> = {
  amber: {
    activeIcon: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300',
    activeBar: 'bg-amber-500/95',
    hoverBar: 'group-hover:bg-amber-500/25',
  },
  emerald: {
    activeIcon: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
    activeBar: 'bg-emerald-500/95',
    hoverBar: 'group-hover:bg-emerald-500/25',
  },
  sky: {
    activeIcon: 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-300',
    activeBar: 'bg-sky-500/95',
    hoverBar: 'group-hover:bg-sky-500/25',
  },
  rose: {
    activeIcon: 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-300',
    activeBar: 'bg-rose-500/95',
    hoverBar: 'group-hover:bg-rose-500/25',
  },
  violet: {
    activeIcon: 'border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-300',
    activeBar: 'bg-violet-500/95',
    hoverBar: 'group-hover:bg-violet-500/25',
  },
  slate: {
    activeIcon: 'border-slate-400/30 bg-slate-400/10 text-slate-500 dark:text-slate-300',
    activeBar: 'bg-slate-300',
    hoverBar: 'group-hover:bg-slate-400/25',
  },
};

export default function Sidebar({ className, ...props }: SidebarProps) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const [accent, setAccent] = useState<SidebarAccent>('emerald');
  const [isAdmin, setIsAdmin] = useState(false);
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
        const data = (await response.json()) as { settings?: { appearance?: { sidebarAccent?: SidebarAccent }; profile?: { role?: string } } };
        if (active && data.settings?.appearance?.sidebarAccent) {
          setAccent(data.settings.appearance.sidebarAccent);
        }
        if (active) {
          setIsAdmin(data.settings?.profile?.role === 'admin');
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
        'h-dvh overflow-y-auto border-r bg-card/30 p-4 pt-6',
        className
      )}
      {...props}
    >
      <div className="flex min-h-full flex-col pb-4">
        <div className="mb-8 px-1">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-md border',
                palette.activeIcon
              )}
            >
              <SentroviaMark className="text-[1rem] font-bold" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-[1.1rem] font-semibold tracking-tight text-foreground">Sentrovia</h1>
            </div>
          </div>
        </div>

        <nav className="flex flex-col gap-1.5">
          {navItems.filter((item) => !item.adminOnly || isAdmin).map(({ href, i18nKey, icon: Icon }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'group flex items-center gap-3 rounded-md border px-2.5 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'border-border bg-card text-foreground'
                    : 'border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                )}
              >
                <div
                  className={cn(
                    'flex size-8 items-center justify-center rounded-md border transition-colors',
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
            <p className="text-xs font-medium text-muted-foreground">Resources</p>
          </div>
          <nav className="flex flex-col gap-1.5">
            {secondaryItems.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'group flex items-center gap-3 rounded-md border px-2.5 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'border-border bg-card text-foreground'
                      : 'border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                  )}
                >
                  <div
                    className={cn(
                      'flex size-8 items-center justify-center rounded-md border transition-colors',
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
          <LogoutButton className="h-10 w-full justify-start rounded-md border border-border bg-card px-3 text-sm font-medium" />
        </div>
      </div>
    </div>
  );
}
