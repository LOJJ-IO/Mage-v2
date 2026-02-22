'use client';

import { useEffect } from 'react';
import { useMageStore } from '@/store/mageStore';

/** Applies store theme to document for Tailwind dark mode (class strategy). */
export function ThemeClass() {
  const theme = useMageStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  return null;
}
