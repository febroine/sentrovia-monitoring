'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, AlertTriangle, LayoutDashboard, Settings, ScrollText } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard },
  { href: '/monitoring', icon: Activity },
  { href: '/incidents', icon: AlertTriangle },
  { href: '/logs', icon: ScrollText },
  { href: '/settings', icon: Settings },
];

type BottomNavProps = React.HTMLAttributes<HTMLDivElement>;

export default function BottomNav({ className, ...props }: BottomNavProps) {
  const pathname = usePathname();

  return (
    <div className={cn('flex items-center justify-around px-2', className)} {...props}>
      {navItems.map(({ href, icon: Icon }) => {
        const isActive = pathname === href;
        return (
          <Link 
            key={href} 
            href={href} 
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
