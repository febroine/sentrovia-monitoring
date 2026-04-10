'use client';

import { usePathname } from 'next/navigation';
import Sidebar from '@/components/sidebar';
import BottomNav from '@/components/bottom-nav';
import { UpdateBanner } from '@/components/update-banner';

const AUTH_ROUTES = ['/login', '/signup'];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuth = AUTH_ROUTES.some((r) => pathname.startsWith(r));

  if (isAuth) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar className="hidden md:flex w-60 flex-col fixed inset-y-0 left-0 z-50 border-r border-border bg-surface-low" />
      <div className="relative flex min-h-screen flex-1 flex-col pb-16 md:ml-60 md:pb-0">
        <UpdateBanner />
        <main className="flex-1 overflow-x-hidden p-5 md:p-8">
          {children}
        </main>
        <BottomNav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-surface-low h-14" />
      </div>
    </div>
  );
}
