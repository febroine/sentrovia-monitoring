'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type CSSProperties } from 'react';
import Sidebar from '@/components/sidebar';
import BottomNav from '@/components/bottom-nav';
import type { UserRole } from '@/lib/auth/permissions';
import { APPEARANCE_SETTINGS_UPDATED_EVENT } from '@/stores/use-settings-store';
import { accentThemes, normalizeSidebarAccent, type SidebarAccent } from '@/lib/settings/accent-theme';
import { cn } from '@/lib/utils';
import { buildLoginRedirectPath } from '@/lib/auth/redirect';
import { GlobalCommandSearch } from '@/components/global-command-search';
import { BrowserAlerts } from '@/components/browser-alerts';
import { Button } from '@/components/ui/button';
import { buildSessionEndedLoginPath, installSessionGuard } from '@/lib/client/session-guard';

const AUTH_ROUTES = ['/login', '/onboarding'];
const PUBLIC_ROUTES = ['/status'];
const PUBLIC_INFO_ROUTES = ['/about', '/help'];
type AppearanceState = {
  reduceMotion: boolean;
  compactDensity: boolean;
  highContrastSurfaces: boolean;
  sidebarAccent: SidebarAccent;
};

type InitialUser = {
  firstName: string;
  lastName: string;
  role: UserRole;
};

const DEFAULT_APPEARANCE: AppearanceState = {
  reduceMotion: false,
  compactDensity: false,
  highContrastSurfaces: false,
  sidebarAccent: 'emerald',
};

export default function AppShell({
  children,
  initialAuthenticated,
  initialAppearance,
  initialUser,
}: {
  children: React.ReactNode;
  initialAuthenticated: boolean;
  initialAppearance: Omit<AppearanceState, 'sidebarAccent'> & { sidebarAccent?: string } | null;
  initialUser: InitialUser | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isAuth = AUTH_ROUTES.some((r) => pathname.startsWith(r));
  const isPublicRoute = PUBLIC_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`))
    || (!initialAuthenticated && PUBLIC_INFO_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`)));
  const isRootTransition = pathname === '/';
  const isProtectedRoute = !isAuth && !isPublicRoute && !isRootTransition;
  const [appearance, setAppearance] = useState<AppearanceState>(() => ({
    reduceMotion: initialAppearance?.reduceMotion ?? DEFAULT_APPEARANCE.reduceMotion,
    compactDensity: initialAppearance?.compactDensity ?? DEFAULT_APPEARANCE.compactDensity,
    highContrastSurfaces: initialAppearance?.highContrastSurfaces ?? DEFAULT_APPEARANCE.highContrastSurfaces,
    sidebarAccent: normalizeSidebarAccent(initialAppearance?.sidebarAccent),
  }));
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    if (!initialAuthenticated) return;
    function handleShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen((current) => !current);
      }
    }
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [initialAuthenticated]);

  useEffect(() => {
    if (!isProtectedRoute || initialAuthenticated) {
      return;
    }

    router.replace(
      buildLoginRedirectPath(`${window.location.pathname}${window.location.search}`)
    );
  }, [initialAuthenticated, isProtectedRoute, router]);

  // When the session ends while a page is open, say so once for the whole app instead of leaving every
  // panel showing "Unauthorized". It does not navigate away by itself, so unsaved text can be copied first.
  const [sessionEnded, setSessionEnded] = useState(false);
  useEffect(() => {
    if (!isProtectedRoute || !initialAuthenticated) return;
    return installSessionGuard(() => setSessionEnded(true));
  }, [initialAuthenticated, isProtectedRoute]);

  useEffect(() => {
    if (isAuth || isPublicRoute || isRootTransition || !initialAuthenticated) {
      return;
    }

    function handleAppearanceUpdate(event: Event) {
      const detail = (event as CustomEvent<{ appearance?: Partial<AppearanceState> & { sidebarAccent?: string } }>).detail;
      if (detail?.appearance) {
        setAppearance((current) => ({
          reduceMotion: detail.appearance?.reduceMotion ?? current.reduceMotion,
          compactDensity: detail.appearance?.compactDensity ?? current.compactDensity,
          highContrastSurfaces: detail.appearance?.highContrastSurfaces ?? current.highContrastSurfaces,
          sidebarAccent: normalizeSidebarAccent(detail.appearance?.sidebarAccent ?? current.sidebarAccent),
        }));
      }
    }

    window.addEventListener(APPEARANCE_SETTINGS_UPDATED_EVENT, handleAppearanceUpdate);

    return () => {
      window.removeEventListener(APPEARANCE_SETTINGS_UPDATED_EVENT, handleAppearanceUpdate);
    };
  }, [initialAuthenticated, isAuth, isPublicRoute, isRootTransition]);

  if (isAuth || isPublicRoute || isRootTransition) {
    return <>{children}</>;
  }

  if (isProtectedRoute && !initialAuthenticated) {
    return <div className="min-h-screen" aria-busy="true" />;
  }

  return (
    <div
      style={accentThemes[appearance.sidebarAccent].cssVars as CSSProperties}
      className={cn(
        'flex min-h-screen',
        appearance.reduceMotion && 'sentrovia-reduce-motion',
        appearance.compactDensity && 'sentrovia-compact-density',
        appearance.highContrastSurfaces && 'sentrovia-high-contrast'
      )}
    >
      <Sidebar
        initialAccent={initialAppearance?.sidebarAccent}
        initialUser={initialUser}
        showWorkerStatus={initialUser?.role === 'admin'}
        onOpenSearch={() => setSearchOpen(true)}
        className={cn(
          'hidden fixed inset-y-0 left-0 z-50 flex-col bg-surface-low md:flex',
          appearance.compactDensity ? 'w-56' : 'w-60'
        )}
      />
      <div
        className={cn(
          'relative flex min-h-screen min-w-0 flex-1 flex-col pb-20 md:pb-0',
          appearance.compactDensity ? 'md:ml-56' : 'md:ml-60'
        )}
      >
        <main
          className={cn(
            'w-full min-w-0 flex-1 overflow-x-hidden px-[clamp(1.25rem,2vw,3.5rem)]',
            pathname === '/profile' && 'mx-auto max-w-[1760px]',
            appearance.compactDensity
              ? 'py-4 md:py-6'
              : 'py-5 md:py-8'
          )}
        >
          {children}
        </main>
        <BottomNav onOpenSearch={() => setSearchOpen(true)} className="fixed bottom-0 left-0 right-0 z-50 bg-surface-low shadow-[0_-14px_32px_rgba(0,0,0,0.32)] md:hidden" />
      </div>
      {initialUser ? <GlobalCommandSearch open={searchOpen} onOpenChange={setSearchOpen} role={initialUser.role} /> : null}
      {initialUser ? <BrowserAlerts /> : null}
      {sessionEnded ? <SessionEndedBanner /> : null}
    </div>
  );
}

function SessionEndedBanner() {
  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-0 z-[70] flex flex-col gap-3 border-b border-amber-500/40 bg-popover px-4 py-3 text-sm shadow-lg sm:flex-row sm:items-center sm:justify-between sm:px-6"
    >
      <p>
        <span className="font-medium">Your session has ended.</span>{' '}
        <span className="text-muted-foreground">Changes cannot be saved until you sign in again; copy any unsaved text first.</span>
      </p>
      <Button
        type="button"
        size="sm"
        className="shrink-0 self-start sm:self-auto"
        onClick={() => window.location.assign(buildSessionEndedLoginPath(`${window.location.pathname}${window.location.search}`))}
      >
        Sign in again
      </Button>
    </div>
  );
}
