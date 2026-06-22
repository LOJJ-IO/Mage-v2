'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { StateRenderer } from '@/components/StateRenderer';
import { SignInScreen } from '@/components/SignInScreen';
import { HydrationGate } from '@/components/HydrationGate';
import { useAppNavigation } from '@/components/providers/NavigationLoaderProvider';
import { useNavigationReady } from '@/hooks/useNavigationReady';
import { useMageStore } from '@/store/mageStore';
import { useAgentAvailabilityWebSocket } from '@/hooks/useAgentAvailabilityWebSocket';
import { apiClient } from '@/lib/api';
import { ALLOW_DEV_LOGIN } from '@/lib/onboarding';
import { GuestProfile } from '@/types';

type HomeView = 'loading' | 'sign-in' | 'app';

export default function Home() {
  const { replace, beginLoading } = useAppNavigation();
  const { context, guestProfile, setGuestProfile } = useMageStore();
  const [view, setView] = useState<HomeView>('loading');
  const didInitRef = useRef(false);

  useAgentAvailabilityWebSocket();
  useNavigationReady(view !== 'loading', '/');

  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;

    (async () => {
      const params = new URLSearchParams(window.location.search);
      const authError = params.get('auth_error');
      if (authError) {
        replace(`/onboard/guest?auth_error=${encodeURIComponent(authError)}`);
        return;
      }

      let guestId = sessionStorage.getItem('mage-guest-id');

      if (guestId && !guestProfile) {
        const me = await apiClient.getGuestMe();
        if (me.success && me.data) {
          useMageStore.getState().setGuestProfile(me.data);
        }
      }

      if (!guestId && !guestProfile) {
        const session = await apiClient.getAuthSession();
        if (session.success && session.data?.authenticated) {
          if (session.data.guestId) {
            sessionStorage.setItem('mage-guest-id', session.data.guestId);
            guestId = session.data.guestId;
          }
          const me = await apiClient.getGuestMe();
          if (me.success && me.data) {
            useMageStore.getState().setGuestProfile(me.data);
            sessionStorage.setItem('mage-guest-id', me.data.id);
            guestId = me.data.id;
          }
        }
      }

      if (!guestId && !useMageStore.getState().guestProfile) {
        if (ALLOW_DEV_LOGIN) {
          setView('sign-in');
        } else {
          replace('/onboard');
        }
        return;
      }

      if (context.hasSeenWelcome) {
        useMageStore.setState({ currentState: 'S-G-003' });
      }

      setView('app');
    })();
  }, [guestProfile, context.hasSeenWelcome, replace]);

  const handleSignedIn = useCallback(
    (profile: GuestProfile) => {
      beginLoading('/');
      setGuestProfile(profile);
      if (context.hasSeenWelcome) {
        useMageStore.setState({ currentState: 'S-G-003' });
      }
      setView('app');
    },
    [beginLoading, setGuestProfile, context.hasSeenWelcome]
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
