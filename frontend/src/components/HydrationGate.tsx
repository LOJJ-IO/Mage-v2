'use client';

import { useEffect, useState } from 'react';
import { useMageStore } from '@/store/mageStore';

/**
 * Prevents state-dependent UI from rendering until the client has mounted
 * and the persisted store has rehydrated. Avoids blank screen on first load
 * caused by Zustand persist + Next.js hydration timing.
 */
export function HydrationGate({ children }: { children: React.ReactNode }) {
  const [hasMounted, setHasMounted] = useState(false);
  const hasHydrated = useMageStore((state) => state._hasHydrated);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Fallback: if rehydration never fires (e.g. storage unavailable), show app after 3s
  const [fallbackReady, setFallbackReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setFallbackReady(true), 3000);
    return () => clearTimeout(t);
  }, []);

  const ready = hasMounted && (hasHydrated || fallbackReady);

  if (!ready) {
    return <LoadingShell />;
  }

  return <>{children}</>;
}

/** Loader look-alike in mobile view until hydration completes (same as LoadingScreen, not fullscreen). */
function LoadingShell() {
  return (
    <div className="min-h-screen bg-mage-gray-50">
      <div className="mage-container min-h-screen bg-mage-black flex flex-col items-center justify-center p-8">
        {/* Logo */}
        <div className="mb-12">
          <div className="relative">
            <div className="absolute inset-0 bg-white/20 rounded-full blur-xl animate-pulse" />
            <div className="relative w-24 h-24 bg-white rounded-[28px] flex items-center justify-center">
              <svg
                width="48"
                height="48"
                viewBox="0 0 48 48"
                fill="none"
                className="text-mage-black"
              >
                <path
                  d="M24 4L4 14v20l20 10 20-10V14L24 4z"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M4 14l20 10M24 44V24M44 14l-20 10"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="24" cy="24" r="4" fill="currentColor" />
              </svg>
            </div>
          </div>
        </div>

        <h1 className="text-white text-4xl font-semibold tracking-tight mb-4">
          mage
        </h1>
        <p className="text-white/60 text-lg mb-12">Your hotel assistant</p>
        <div className="h-1 w-[200px] bg-white/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-white rounded-full animate-pulse"
            style={{ width: '40%' }}
          />
        </div>
        <p className="text-white/40 text-sm mt-4">Setting up your experience...</p>
      </div>
    </div>
  );
}
