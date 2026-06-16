'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  BarChart3,
  LayoutDashboard,
  List,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/dashboard/dev', label: 'Dev Metrics', icon: BarChart3 },
  { href: '/dashboard/events', label: 'Event Log', icon: List },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

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
  const pathname = usePathname();

  return (
    <div className="dashboard-theme min-h-screen bg-slate-50 text-slate-900">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white p-6 lg:block">
          <div className="mb-10">
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">Mage</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">Analytics</h2>
          </div>
          <nav className="space-y-1">
            {NAV.map((item) => {
              const active =
                item.href === '/dashboard'
                  ? pathname === '/dashboard'
                  : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                    active
                      ? 'bg-emerald-700 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-10 rounded-2xl border border-emerald-100 bg-emerald-50/80 p-4">
            <div className="flex items-center gap-2 text-emerald-800">
              <Activity className="h-4 w-4" />
              <p className="text-sm font-semibold">Pilot metrics</p>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-emerald-900/70">
              Marketing view leads with ROI. Dev metrics stay in the engineering tab.
            </p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-slate-200 bg-white/80 px-6 py-5 backdrop-blur">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
                {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
              </div>
              {headerRight}
            </div>
          </header>
          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
