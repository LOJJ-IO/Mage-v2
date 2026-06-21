'use client';

import { QueryProvider } from '@/components/providers/QueryProvider';
import { NavigationLoaderProvider } from '@/components/providers/NavigationLoaderProvider';
import { ThemeClass } from '@/components/ThemeClass';
import { ToastContainer } from '@/components/Toast';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <NavigationLoaderProvider>
        <ThemeClass />
        <ToastContainer />
        {children}
      </NavigationLoaderProvider>
    </QueryProvider>
  );
}
