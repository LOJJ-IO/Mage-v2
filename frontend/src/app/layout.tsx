import type { Metadata, Viewport } from 'next';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { ToastContainer } from '@/components/Toast';
import { ThemeClass } from '@/components/ThemeClass';
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
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="anonymous" />
        <link
          href="https://api.fontshare.com/v2/css?f[]=booton@400,500,600,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased">
        <QueryProvider>
          <ThemeClass />
          <ToastContainer />
          {children}
        </QueryProvider>
      </body>
    </html>
  );
}
