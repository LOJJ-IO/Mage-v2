import type { Metadata, Viewport } from 'next';
import { AppProviders } from '@/components/providers/AppProviders';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'Mage - Your Hotel Assistant',
  description: 'AI-powered hotel communication interface',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Mage',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#000000',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
