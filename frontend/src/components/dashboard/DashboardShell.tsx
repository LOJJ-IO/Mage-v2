'use client';

import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { DashboardAppSidebar } from './DashboardAppSidebar';

export function DashboardShell({
  children,
  title,
  subtitle,
  headerRight,
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  headerRight?: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <div className="dashboard-theme flex min-h-screen w-full bg-slate-50 text-slate-900">
        <DashboardAppSidebar />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur md:px-6">
            <SidebarTrigger className="-ml-1 md:hidden" />
            <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="font-heading truncate text-2xl font-semibold tracking-tight text-slate-900">
                  {title}
                </h1>
                {subtitle ? (
                  <p className="mt-0.5 truncate text-sm text-slate-500">{subtitle}</p>
                ) : null}
              </div>
              {headerRight}
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6">{children}</main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
