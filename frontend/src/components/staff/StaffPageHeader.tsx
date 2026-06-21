'use client';

import { ReactNode } from 'react';
import { useSidebar } from '@/components/ui/sidebar';
import { IconList } from './StaffIcons';
import { StaffThemeToggle } from './StaffThemeToggle';

export interface StaffPageHeaderProps {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  /** Page controls — beside the title by default, or before the theme toggle when `actionsAlign="end"`. */
  actions?: ReactNode;
  actionsAlign?: 'start' | 'end';
  /** @deprecated Use `actions` — kept for callers not yet migrated */
  toolbar?: ReactNode;
}

function StaffMobileMenuButton() {
  const { setOpenMobile } = useSidebar();

  return (
    <button
      type="button"
      onClick={() => setOpenMobile(true)}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutral-200 text-neutral-700 dark:border-neutral-700 dark:text-neutral-300 lg:hidden"
      aria-label="Open menu"
    >
      <IconList className="h-5 w-5" />
    </button>
  );
}

/**
 * Shared staff module header — fixed-height single row.
 * Title + inline controls on the left; theme toggle pinned on the right.
 */
export function StaffPageHeader({
  icon,
  title,
  subtitle,
  actions,
  actionsAlign = 'start',
  toolbar,
}: StaffPageHeaderProps) {
  const controls = actions ?? toolbar;

  return (
    <header className="staff-chrome-header h-14 shrink-0 border-b border-sidebar-border bg-white dark:bg-neutral-950">
      <div className="flex h-full items-center gap-2 px-4 md:gap-3 md:px-6">
        <StaffMobileMenuButton />
        <span className="shrink-0 text-neutral-700 dark:text-neutral-300">{icon}</span>

        <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
          <h1 className="font-heading shrink-0 truncate text-lg font-semibold leading-none text-neutral-900 dark:text-white">
            {title}
          </h1>
          {subtitle ? (
            <span className="hidden truncate text-xs leading-none text-neutral-500 sm:inline">
              {subtitle}
            </span>
          ) : null}

          {controls && actionsAlign === 'start' ? (
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto border-l border-neutral-100 pl-3 dark:border-neutral-800 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {controls}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {controls && actionsAlign === 'end' ? (
            <div className="flex shrink-0 items-center gap-2">{controls}</div>
          ) : null}
          <StaffThemeToggle />
        </div>
      </div>
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
