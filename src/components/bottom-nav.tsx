'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, BarChart3, LayoutDashboard, Settings, ScrollText } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/monitoring', label: 'Monitoring', icon: Activity },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/logs', label: 'Logs', icon: ScrollText },
  { href: '/settings', label: 'Settings', icon: Settings },
];

type BottomNavProps = React.HTMLAttributes<HTMLDivElement>;

export default function BottomNav({ className, ...props }: BottomNavProps) {
  const pathname = usePathname();

  return (
    <div className={cn('flex min-h-14 items-center justify-around px-2 pb-[env(safe-area-inset-bottom)]', className)} {...props}>
      {navItems.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href;
        return (
          <Link 
            key={href} 
            href={href} 
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              "flex flex-col items-center gap-1 p-2 transition-colors",
              isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="w-5 h-5" />
          </Link>
        );
      })}
    </div>
  );
}
