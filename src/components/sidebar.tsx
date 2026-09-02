'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, LayoutDashboard, Settings, Building2, ScrollText, CircleHelp, Info, UserRound, UsersRound, BellRing, BarChart3 } from 'lucide-react';
import { SentroviaMark } from '@/components/brand/sentrovia-mark';
import LogoutButton from '@/components/logout-button';
import { cn } from '@/lib/utils';
import { SIDEBAR_ACCENT_UPDATED_EVENT } from '@/stores/use-settings-store';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/monitoring', label: 'Monitors', icon: Activity },
  { href: '/companies', label: 'Companies', icon: Building2 },
  { href: '/logs', label: 'Logs', icon: ScrollText },
  { href: '/delivery', label: 'Delivery', icon: BellRing },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/members', label: 'Members', icon: UsersRound },
  { href: '/settings', label: 'Settings', icon: Settings },
];

const secondaryItems = [
  { href: '/profile', label: 'Profile', icon: UserRound },
  { href: '/help', label: 'Help', icon: CircleHelp },
  { href: '/about', label: 'About', icon: Info },
];

type SidebarProps = React.HTMLAttributes<HTMLDivElement> & { initialAccent?: string };
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
    activeIcon: 'text-amber-600 dark:text-amber-300',
    activeBar: 'bg-amber-500/95',
    hoverBar: 'group-hover:bg-amber-500/25',
  },
  emerald: {
    activeIcon: 'text-emerald-600 dark:text-emerald-300',
    activeBar: 'bg-emerald-500/95',
    hoverBar: 'group-hover:bg-emerald-500/25',
  },
  sky: {
    activeIcon: 'text-sky-600 dark:text-sky-300',
    activeBar: 'bg-sky-500/95',
    hoverBar: 'group-hover:bg-sky-500/25',
  },
  rose: {
    activeIcon: 'text-rose-600 dark:text-rose-300',
    activeBar: 'bg-rose-500/95',
    hoverBar: 'group-hover:bg-rose-500/25',
  },
  violet: {
    activeIcon: 'text-violet-600 dark:text-violet-300',
    activeBar: 'bg-violet-500/95',
    hoverBar: 'group-hover:bg-violet-500/25',
  },
  slate: {
    activeIcon: 'text-slate-500 dark:text-slate-300',
    activeBar: 'bg-slate-300',
    hoverBar: 'group-hover:bg-slate-400/25',
  },
};

export default function Sidebar({ className, initialAccent, ...props }: SidebarProps) {
  const pathname = usePathname();
  const [accent, setAccent] = useState<SidebarAccent>(isSidebarAccent(initialAccent) ? initialAccent : 'emerald');
  const palette = accentClasses[accent];

  useEffect(() => {
    function handleAccentUpdate(event: Event) {
      const detail = (event as CustomEvent<{ accent?: SidebarAccent }>).detail;
      if (detail?.accent) {
        setAccent(detail.accent);
      }
    }

    window.addEventListener(SIDEBAR_ACCENT_UPDATED_EVENT, handleAccentUpdate);

    return () => {
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
          <div className="flex items-center gap-2.5">
            <SentroviaMark className={cn("size-7 shrink-0", palette.activeIcon)} />
            <div className="min-w-0">
              <h1 className="truncate text-[1.1rem] font-semibold tracking-tight text-foreground">Sentrovia</h1>
            </div>
          </div>
        </div>

        <nav className="flex flex-col gap-1.5">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'group flex items-center gap-3 rounded-sm px-2.5 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                )}
              >
                <Icon className={cn("size-4 shrink-0 transition-colors", isActive ? palette.activeIcon : "text-muted-foreground group-hover:text-foreground")} />
                <span className="flex-1 truncate">{label}</span>
                <span
                  className={cn(
                    'h-5 w-0.5 transition-colors',
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
                    'group flex items-center gap-3 rounded-sm px-2.5 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                  )}
                >
                  <Icon className={cn("size-4 shrink-0 transition-colors", isActive ? palette.activeIcon : "text-muted-foreground group-hover:text-foreground")} />
                  <span className="flex-1 truncate">{label}</span>
                  <span
                    className={cn(
                      'h-5 w-0.5 transition-colors',
                      isActive ? palette.activeBar : cn('bg-transparent', palette.hoverBar)
                    )}
                  />
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto pt-6">
          <LogoutButton className="h-9 w-full justify-start px-2.5 text-sm font-medium text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}

function isSidebarAccent(value: string | undefined): value is SidebarAccent {
  return Boolean(value && Object.hasOwn(accentClasses, value));
}
