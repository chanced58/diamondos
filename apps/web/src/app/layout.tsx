import type { JSX, ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import {
  AppearanceBootstrap,
  ThemeProvider,
} from '@/components/providers/ThemeProvider';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans-next',
});

export const viewport: Viewport = {
  themeColor: '#1e3a8a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: {
    default: 'DiamondOS',
    template: '%s | DiamondOS',
  },
  description: 'Coaching platform for roster management, scorekeeping, and team communication.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'DiamondOS',
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <html lang="en" data-theme="light" data-density="comfortable" data-motion="on" data-tone="editorial">
      <head>
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <AppearanceBootstrap />
      </head>
      <body className={inter.className}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
