'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';

/** sessionStorage flag set by /demo, so demo-only chrome knows to show. */
export const DEMO_SESSION_KEY = 'mage-demo';

/** Sits beside the guest app's phone-width column (desktop only) and returns
 *  demo visitors to the /demo selection screen. Renders nothing outside the demo. */
export function DemoBackButton() {
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    try {
      setIsDemo(sessionStorage.getItem(DEMO_SESSION_KEY) === '1');
    } catch {
      setIsDemo(false);
    }
  }, []);

  if (!isDemo) return null;

  return (
    <a
      href="/demo"
      className="fixed top-6 z-50 hidden lg:flex items-center gap-2 rounded-full border border-white/25 dark:border-mage-black/20 px-4 py-2.5 text-sm font-medium text-white dark:text-mage-black hover:bg-white/10 dark:hover:bg-mage-black/5 transition-colors"
      style={{ left: 'calc(50% + 14rem + 1.5rem)' }}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      Back to demo selection
    </a>
  );
}
