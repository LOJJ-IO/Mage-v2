'use client';

import { useMageStore } from '@/store/mageStore';
import { cn } from '@/lib/utils';

export function StaffThemeToggle({ className }: { className?: string }) {
  const theme = useMageStore((s) => s.theme);
  const setTheme = useMageStore((s) => s.setTheme);
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={cn(
        'relative inline-flex h-9 w-[4.25rem] shrink-0 items-center rounded-full border border-neutral-200 bg-neutral-100 p-0.5 transition-colors dark:border-neutral-600 dark:bg-neutral-800',
        className
      )}
    >
      <span
        className={cn(
          'absolute flex h-7 w-7 items-center justify-center rounded-full bg-white text-neutral-700 shadow-sm transition-transform duration-200 dark:bg-neutral-200',
          isDark ? 'translate-x-[2rem]' : 'translate-x-0'
        )}
      >
        {isDark ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 3a9 9 0 109 9c-.53 0-1.04-.08-1.54-.22A6.5 6.5 0 0112 3.5V3z" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <circle cx="12" cy="12" r="4" />
            <path
              d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        )}
      </span>
      <span className="sr-only">{isDark ? 'Dark mode' : 'Light mode'}</span>
    </button>
  );
}
