'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, LayoutDashboard, Settings, Building2, ScrollText, CircleHelp, Info, UserRound, UsersRound, BellRing, BarChart3 } from 'lucide-react';
import { SentroviaLogo } from '@/components/brand/sentrovia-logo';
import LogoutButton from '@/components/logout-button';
import { useWorkerStore } from '@/stores/use-worker-store';
import type { UserRole } from '@/lib/auth/permissions';
import type { WorkerStatus } from '@/lib/monitors/types';
import { normalizeSidebarAccent, type SidebarAccent } from '@/lib/settings/accent-theme';
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

type SidebarUser = {
  firstName: string;
  lastName: string;
  role: UserRole;
};

type SidebarProps = React.HTMLAttributes<HTMLDivElement> & {
  initialAccent?: string;
  initialUser?: SidebarUser | null;
  showWorkerStatus?: boolean;
};

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
  cyan: {
    activeIcon: 'text-cyan-600 dark:text-cyan-300',
    activeBar: 'bg-cyan-500/95',
    hoverBar: 'group-hover:bg-cyan-500/25',
  },
  teal: {
    activeIcon: 'text-teal-600 dark:text-teal-300',
    activeBar: 'bg-teal-500/95',
    hoverBar: 'group-hover:bg-teal-500/25',
  },
  blue: {
    activeIcon: 'text-blue-600 dark:text-blue-300',
    activeBar: 'bg-blue-500/95',
    hoverBar: 'group-hover:bg-blue-500/25',
  },
  indigo: {
    activeIcon: 'text-indigo-600 dark:text-indigo-300',
    activeBar: 'bg-indigo-500/95',
    hoverBar: 'group-hover:bg-indigo-500/25',
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
  fuchsia: {
    activeIcon: 'text-fuchsia-600 dark:text-fuchsia-300',
    activeBar: 'bg-fuchsia-500/95',
    hoverBar: 'group-hover:bg-fuchsia-500/25',
  },
  pink: {
    activeIcon: 'text-pink-600 dark:text-pink-300',
    activeBar: 'bg-pink-500/95',
    hoverBar: 'group-hover:bg-pink-500/25',
  },
  red: {
    activeIcon: 'text-red-600 dark:text-red-300',
    activeBar: 'bg-red-500/95',
    hoverBar: 'group-hover:bg-red-500/25',
  },
  orange: {
    activeIcon: 'text-orange-600 dark:text-orange-300',
    activeBar: 'bg-orange-500/95',
    hoverBar: 'group-hover:bg-orange-500/25',
  },
  lime: {
    activeIcon: 'text-lime-600 dark:text-lime-300',
    activeBar: 'bg-lime-500/95',
    hoverBar: 'group-hover:bg-lime-500/25',
  },
  slate: {
    activeIcon: 'text-slate-500 dark:text-slate-300',
    activeBar: 'bg-slate-300',
    hoverBar: 'group-hover:bg-slate-400/25',
  },
};

export default function Sidebar({
  className,
  initialAccent,
  initialUser,
  showWorkerStatus = false,
  ...props
}: SidebarProps) {
  const pathname = usePathname();
  const [accent, setAccent] = useState<SidebarAccent>(normalizeSidebarAccent(initialAccent));
  const palette = accentClasses[accent];
  const worker = useWorkerStore((state) => state.worker);
  const workerLoading = useWorkerStore((state) => state.loading);
  const workerError = useWorkerStore((state) => state.error);
  const loadWorker = useWorkerStore((state) => state.loadWorker);

  useEffect(() => {
    if (!showWorkerStatus) {
      return;
    }

    void loadWorker('1h');
    const intervalId = window.setInterval(() => void loadWorker('1h'), 15_000);
    return () => window.clearInterval(intervalId);
  }, [loadWorker, showWorkerStatus]);

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
        'h-dvh overflow-y-auto bg-card/30 p-4 pt-6',
        className
      )}
      {...props}
    >
      <div className="flex min-h-full flex-col pb-4">
        <div className="mb-8 px-2.5">
          <div className="flex items-center gap-2.5">
            <h1><SentroviaLogo className="text-[1.65rem]" /></h1>
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
                    ? 'bg-muted text-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                )}
              >
                <Icon className={cn("size-4 shrink-0 transition-colors", isActive ? palette.activeIcon : "text-muted-foreground group-hover:text-foreground")} />
                <span className="flex-1 truncate">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-10 pt-1">
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
                    ? 'bg-muted text-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                  )}
                >
                  <Icon className={cn("size-4 shrink-0 transition-colors", isActive ? palette.activeIcon : "text-muted-foreground group-hover:text-foreground")} />
                  <span className="flex-1 truncate">{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto pt-6">
          {showWorkerStatus ? <WorkerStatusLink worker={worker} loading={workerLoading} error={workerError} /> : null}
          {initialUser ? <UserSummary user={initialUser} /> : null}
          <LogoutButton className="h-9 w-full justify-start px-2.5 text-sm font-medium text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}

function WorkerStatusLink({
  worker,
  loading,
  error,
}: {
  worker: WorkerStatus | null;
  loading: boolean;
  error: string | null;
}) {
  const indicator = resolveWorkerIndicator(worker, loading, error);

  return (
    <div className="mb-3" aria-live="polite">
      <Link
        href="/monitoring"
        aria-label={`${indicator.label}. Open Monitoring`}
        className="group flex items-center gap-2 rounded-sm px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
      >
        <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', indicator.dotClass)} />
        <span className="truncate">{indicator.label}</span>
        <Activity aria-hidden="true" className="ml-auto size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-70" />
      </Link>
    </div>
  );
}

function UserSummary({ user }: { user: SidebarUser }) {
  const fullName = `${user.firstName} ${user.lastName}`.trim();
  const initials = `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();

  return (
    <div className="mb-3 flex items-center gap-3 rounded-md border border-border/70 bg-muted/20 px-2.5 py-2.5">
      <div aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
        {initials}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{fullName}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{formatRole(user.role)}</p>
      </div>
    </div>
  );
}

function resolveWorkerIndicator(worker: WorkerStatus | null, loading: boolean, error: string | null) {
  if (loading && !worker) {
    return { label: 'Checking worker…', dotClass: 'bg-muted-foreground' };
  }

  if (worker?.connectivityStatus === 'offline') {
    return { label: 'Worker connectivity degraded', dotClass: 'bg-amber-400' };
  }

  if (worker?.running && worker.processAlive) {
    return { label: 'Worker online', dotClass: 'bg-emerald-400' };
  }

  if (worker?.desiredState === 'stopped') {
    return { label: 'Worker stopped', dotClass: 'bg-muted-foreground' };
  }

  if (worker?.processAlive) {
    return { label: 'Worker standby', dotClass: 'bg-amber-400' };
  }

  return {
    label: error ? 'Worker status unavailable' : 'Worker offline',
    dotClass: error ? 'bg-amber-400' : 'bg-destructive',
  };
}

function formatRole(role: UserRole) {
  return role === 'admin' ? 'Administrator' : role.charAt(0).toUpperCase() + role.slice(1);
}
