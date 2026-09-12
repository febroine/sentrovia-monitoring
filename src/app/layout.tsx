import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import './globals.css';
import AppShell from '@/components/app-shell';
import { ToastRegion } from '@/components/ui/toast-region';
import { getSession } from '@/lib/auth/session';
import { getSettings } from '@/lib/settings/service';

const ibmPlexSans = IBM_Plex_Sans({
  weight: 'variable',
  subsets: ['latin', 'latin-ext'],
  variable: '--font-ibm-plex-sans',
  display: 'swap',
});
const ibmPlexMono = IBM_Plex_Mono({
  weight: ['400', '500', '600'],
  subsets: ['latin', 'latin-ext'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Sentrovia Uptime Monitoring',
  description: 'Self-hosted uptime monitoring and notification operations.',
  applicationName: 'Sentrovia',
  icons: {
    icon: [
      { url: '/icon.png', type: 'image/png' },
    ],
    shortcut: ['/favicon.ico'],
    apple: ['/icon.png'],
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
      <body className={`${ibmPlexSans.variable} ${ibmPlexMono.variable} font-sans bg-background text-foreground antialiased min-h-screen`}>
        <AppShell
          initialAuthenticated={Boolean(session)}
          initialAppearance={settings?.appearance ?? null}
          initialUser={session ? {
            firstName: session.firstName,
            lastName: session.lastName,
            role: session.role,
          } : null}
        >
          {children}
        </AppShell>
        <ToastRegion />
      </body>
    </html>
  );
}
