import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import AppShell from '@/components/app-shell';
import { ToastRegion } from '@/components/ui/toast-region';
import { getSession } from '@/lib/auth/session';
import { getSettings } from '@/lib/settings/service';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: 'Sentrovia Uptime Monitoring',
  description: 'Self-hosted uptime monitoring and notification operations.',
  applicationName: 'Sentrovia',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    shortcut: ['/icon.svg'],
    apple: ['/icon.svg'],
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  const settings = session
    ? await getSettings(session.id, false, session.activeWorkspaceId!).catch(() => null)
    : null;

  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans bg-background text-foreground antialiased min-h-screen`}>
        <AppShell
          initialAuthenticated={Boolean(session)}
          initialAppearance={settings?.appearance ?? null}
        >
          {children}
        </AppShell>
        <ToastRegion />
      </body>
    </html>
  );
}
