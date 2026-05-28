'use client';

import { ReactNode } from 'react';

export function StaffPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen min-h-0 w-full overflow-hidden bg-neutral-100 dark:bg-neutral-950">
      {children}
    </div>
  );
}

export function StaffContentShell({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 flex-1 flex-col">{children}</div>;
}

export function StaffTopBar({
  title,
  actions,
}: {
  title: string;
  actions?: ReactNode;
}) {
  return (
    <header className="shrink-0 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-4 py-4 md:px-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-white">{title}</h1>
        {actions}
      </div>
    </header>
  );
}

export function StaffCard({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 ${className}`}
    >
      {children}
    </div>
  );
}

export function StaffEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
      <p className="text-lg font-semibold text-neutral-900 dark:text-white">{title}</p>
      <p className="mt-2 max-w-xl text-sm text-neutral-500">{description}</p>
    </div>
  );
}

export function StaffTag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-neutral-200 dark:border-neutral-700 px-2 py-0.5 text-[11px] text-neutral-600 dark:text-neutral-300">
      {children}
    </span>
  );
}

