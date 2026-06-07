'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { StateRenderer } from '@/components/StateRenderer';
import { SignInScreen } from '@/components/SignInScreen';
import { HydrationGate } from '@/components/HydrationGate';
import { useMageStore } from '@/store/mageStore';
import { useAgentAvailabilityWebSocket } from '@/hooks/useAgentAvailabilityWebSocket';
import { apiClient } from '@/lib/api';
import { GuestProfile } from '@/types';

type HomeView = 'loading' | 'sign-in' | 'app';

export default function Home() {
  const { context, guestProfile, setGuestProfile } = useMageStore();
  const [view, setView] = useState<HomeView>('loading');
  const didInitRef = useRef(false);

  useAgentAvailabilityWebSocket();

  useEffect(() => {
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
        setView('sign-in');
        return;
      }

      if (context.hasSeenWelcome) {
        useMageStore.setState({ currentState: 'S-G-003' });
      }

      setView('app');
    })();
  }, [guestProfile, context.hasSeenWelcome]);

  const handleSignedIn = useCallback(
    (profile: GuestProfile) => {
      setGuestProfile(profile);
      if (context.hasSeenWelcome) {
        useMageStore.setState({ currentState: 'S-G-003' });
      }
      setView('app');
    },
    [setGuestProfile, context.hasSeenWelcome]
  );

  if (view === 'loading') {
    return null;
  }

  if (view === 'sign-in') {
    return <SignInScreen onSignedIn={handleSignedIn} />;
  }

  return (
    <main className="min-h-screen bg-mage-gray-50 dark:bg-mage-gray-900 md:bg-mage-gray-800 md:dark:bg-mage-gray-100">
      <HydrationGate>
        <StateRenderer />
      </HydrationGate>
    </main>
  );
}
