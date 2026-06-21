'use client';

import { ReactNode } from 'react';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

export function StaffWorkspaceShell({ children }: { children: ReactNode }) {
  return (
    <SidebarInset className="flex min-h-0 min-w-0 flex-1 flex-col bg-neutral-100 dark:bg-neutral-950">
      {children}
    </SidebarInset>
  );
}

export function StaffWorkspaceProvider({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider
      defaultOpen
      className="staff-ui group/sidebar-wrapper flex h-screen min-h-0 w-full overflow-hidden bg-neutral-100 dark:bg-neutral-950"
      style={
        {
          '--sidebar-width': '16rem',
          '--sidebar-width-icon': '4.5rem',
        } as React.CSSProperties
      }
    >
      {children}
    </SidebarProvider>
  );
}
