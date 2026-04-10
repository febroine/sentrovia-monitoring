import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { TranslationProvider } from '@/context/translation-context';
import AppShell from '@/components/app-shell';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: 'Sentrovia Uptime Monitoring',
  description: 'Professional Uptime Monitoring Dashboard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans bg-background text-foreground antialiased min-h-screen`}>
        <TranslationProvider>
          <AppShell>{children}</AppShell>
        </TranslationProvider>
      </body>
    </html>
  );
}
