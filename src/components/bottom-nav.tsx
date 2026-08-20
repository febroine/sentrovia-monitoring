'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  BarChart3,
  BellRing,
  Building2,
  CircleHelp,
  Info,
  LayoutDashboard,
  Menu,
  ScrollText,
  Settings,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/monitoring', label: 'Monitoring', icon: Activity },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/logs', label: 'Logs', icon: ScrollText },
];

const moreItems = [
  { href: '/companies', label: 'Companies', icon: Building2 },
  { href: '/delivery', label: 'Delivery', icon: BellRing },
  { href: '/members', label: 'Members', icon: UsersRound },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/profile', label: 'Profile', icon: UserRound },
  { href: '/help', label: 'Help', icon: CircleHelp },
  { href: '/about', label: 'About', icon: Info },
];

type BottomNavProps = React.HTMLAttributes<HTMLDivElement>;

export default function BottomNav({ className, ...props }: BottomNavProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = moreItems.some((item) => item.href === pathname);

  return (
    <>
      <div className={cn('flex min-h-14 items-center justify-around px-1 pb-[env(safe-area-inset-bottom)]', className)} {...props}>
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex min-w-14 flex-col items-center gap-0.5 px-1.5 py-1.5 text-[10px] font-medium transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="size-5" />
              <span>{label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          aria-label="More navigation"
          aria-current={moreActive ? 'page' : undefined}
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen(true)}
          className={cn(
            'flex min-w-14 flex-col items-center gap-0.5 px-1.5 py-1.5 text-[10px] font-medium transition-colors',
            moreActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Menu className="size-5" />
          <span>More</span>
        </button>
      </div>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent className="bottom-0 top-auto max-w-none -translate-y-0 rounded-b-none px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:bottom-auto sm:top-1/2 sm:max-w-sm sm:-translate-y-1/2 sm:rounded-lg">
          <DialogHeader>
            <DialogTitle>More</DialogTitle>
          </DialogHeader>
          <nav className="grid grid-cols-2 gap-1" aria-label="Additional navigation">
            {moreItems.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-sm px-3 py-3 text-sm font-medium transition-colors',
                    isActive ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                </Link>
              );
            })}
          </nav>
        </DialogContent>
      </Dialog>
    </>
  );
}
