'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { StateRenderer } from '@/components/StateRenderer';
import { HydrationGate } from '@/components/HydrationGate';
import { useMageStore } from '@/store/mageStore';
import { useAgentAvailabilityWebSocket } from '@/hooks/useAgentAvailabilityWebSocket';
import { apiClient } from '@/lib/api';

export default function Home() {
  const router = useRouter();
  const { context, guestProfile } = useMageStore();
  const [allowRender, setAllowRender] = useState(false);
  const didInitRef = useRef(false);

  useAgentAvailabilityWebSocket();

  useEffect(() => {
    // Guard against double-invocation in React StrictMode dev.
    if (didInitRef.current) return;
    didInitRef.current = true;

    (async () => {
      let guestId = sessionStorage.getItem('mage-guest-id');

      if (!guestId && !guestProfile) {
        const session = await apiClient.getAuthSession();
        if (session.success && session.data?.authenticated) {
          const me = await apiClient.getGuestMe();
          if (me.success && me.data) {
            useMageStore.getState().setGuestProfile(me.data);
            sessionStorage.setItem('mage-guest-id', me.data.id);
            guestId = me.data.id;
          }
        }
      }

      if (!guestId && !useMageStore.getState().guestProfile) {
        router.replace('/welcome');
        return;
      }

      if (context.hasSeenWelcome) {
        useMageStore.setState({ currentState: 'S-G-003' });
      }

      setAllowRender(true);
    })();
  }, [router, guestProfile, context.hasSeenWelcome]);

  // While we redirect (or decide), render nothing so we never leave a stale loader on the page.
  if (!allowRender) {
    return null;
  }

  return (
    <main className="min-h-screen bg-mage-gray-50 dark:bg-mage-gray-900 md:bg-mage-gray-800 md:dark:bg-mage-gray-100">
      <HydrationGate>
        <StateRenderer />
      </HydrationGate>
    </main>
  );
}
