'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Sidebar from '@/components/sidebar';
import BottomNav from '@/components/bottom-nav';
import { APPEARANCE_SETTINGS_UPDATED_EVENT } from '@/stores/use-settings-store';
import { cn } from '@/lib/utils';

const AUTH_ROUTES = ['/login', '/signup'];
type AppearanceState = {
  reduceMotion: boolean;
  compactDensity: boolean;
  highContrastSurfaces: boolean;
};

const DEFAULT_APPEARANCE: AppearanceState = {
  reduceMotion: false,
  compactDensity: false,
  highContrastSurfaces: false,
};

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuth = AUTH_ROUTES.some((r) => pathname.startsWith(r));
  const [appearance, setAppearance] = useState<AppearanceState>(DEFAULT_APPEARANCE);

  useEffect(() => {
    if (isAuth) {
      return;
    }

    let active = true;

    function handleAppearanceUpdate(event: Event) {
      const detail = (event as CustomEvent<{ appearance?: AppearanceState }>).detail;
      if (detail?.appearance) {
        setAppearance({
          reduceMotion: detail.appearance.reduceMotion,
          compactDensity: detail.appearance.compactDensity,
          highContrastSurfaces: detail.appearance.highContrastSurfaces,
        });
      }
    }

    void fetch('/api/settings', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return null;
        const data = (await response.json()) as {
          settings?: { appearance?: AppearanceState };
        };
        if (active && data.settings?.appearance) {
          setAppearance({
            reduceMotion: data.settings.appearance.reduceMotion,
            compactDensity: data.settings.appearance.compactDensity,
            highContrastSurfaces: data.settings.appearance.highContrastSurfaces,
          });
        }
        return null;
      })
      .catch(() => undefined);

    window.addEventListener(APPEARANCE_SETTINGS_UPDATED_EVENT, handleAppearanceUpdate);

    return () => {
      active = false;
      window.removeEventListener(APPEARANCE_SETTINGS_UPDATED_EVENT, handleAppearanceUpdate);
    };
  }, [isAuth]);

  if (isAuth) {
    return <>{children}</>;
  }

  return (
    <div
      className={cn(
        'flex min-h-screen',
        appearance.reduceMotion && 'sentrovia-reduce-motion',
        appearance.compactDensity && 'sentrovia-compact-density',
        appearance.highContrastSurfaces && 'sentrovia-high-contrast'
      )}
    >
      <Sidebar
        className={cn(
          'hidden fixed inset-y-0 left-0 z-50 flex-col border-r border-border bg-surface-low md:flex',
          appearance.compactDensity ? 'w-56' : 'w-60'
        )}
      />
      <div
        className={cn(
          'relative flex min-h-screen flex-1 flex-col pb-16 md:pb-0',
          appearance.compactDensity ? 'md:ml-56' : 'md:ml-60'
        )}
      >
        <main
          className={cn(
            'flex-1 overflow-x-hidden',
            appearance.compactDensity ? 'p-4 md:p-6' : 'p-5 md:p-8'
          )}
        >
          {children}
        </main>
        <BottomNav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-surface-low h-14" />
      </div>
    </div>
  );
}
