'use client';

import { IconMoon, IconSun } from '@tabler/icons-react';
import { useMageStore } from '@/store/mageStore';

export function OnboardingThemeToggle() {
  const theme = useMageStore((s) => s.theme);
  const setTheme = useMageStore((s) => s.setTheme);

  return (
    <button
      type="button"
      className="onboarding-theme-toggle"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
    >
      {theme === 'dark' ? <IconSun size={18} stroke={1.75} /> : <IconMoon size={18} stroke={1.75} />}
    </button>
  );
}
