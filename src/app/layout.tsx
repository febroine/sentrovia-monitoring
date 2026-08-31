import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { TranslationProvider } from '@/context/translation-context';
import AppShell from '@/components/app-shell';
import { ToastRegion } from '@/components/ui/toast-region';
import { getSession } from '@/lib/auth/session';

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

  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans bg-background text-foreground antialiased min-h-screen`}>
        <TranslationProvider>
          <AppShell initialAuthenticated={Boolean(session)}>{children}</AppShell>
          <ToastRegion />
        </TranslationProvider>
      </body>
    </html>
  );
}
