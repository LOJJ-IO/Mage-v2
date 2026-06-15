'use client';

import { ReactNode } from 'react';

export interface StaffPageHeaderProps {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  /** Right-side primary actions (shortcuts, publish, etc.) */
  actions?: ReactNode;
  /** Second row: filters, segments, view toggles */
  toolbar?: ReactNode;
}

/**
 * Shared staff module header — matches the Tasks kanban top bar.
 * No breadcrumbs: sidebar selection is the primary wayfinding signal.
 */
export function StaffPageHeader({
  icon,
  title,
  subtitle,
  actions,
  toolbar,
}: StaffPageHeaderProps) {
  return (
    <header className="shrink-0 border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-neutral-700 dark:text-neutral-300">{icon}</span>
          <div className="min-w-0">
            <h1 className="font-heading truncate text-lg font-semibold text-neutral-900 dark:text-white">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-0.5 truncate text-xs text-neutral-500">{subtitle}</p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {toolbar ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-neutral-100 px-4 py-3 dark:border-neutral-900 md:px-6">
          {toolbar}
        </div>
      ) : null}
    </header>
  );
}

export function StaffModuleBody({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`min-h-0 flex-1 overflow-hidden ${className}`}>
      {children}
    </div>
  );
}
