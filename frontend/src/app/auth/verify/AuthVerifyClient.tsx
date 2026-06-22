'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppNavLink } from '@/components/AppNavLink';
import { getNavigationCopy } from '@/lib/navigationLoaderCopy';
import { apiClient } from '@/lib/api';
import { useMageStore } from '@/store/mageStore';
import { GuestProfile } from '@/types';

function bootstrapGuest(profile: GuestProfile) {
  sessionStorage.setItem('mage-guest-id', profile.id);
  useMageStore.getState().setGuestProfile(profile);
  if (useMageStore.getState().context.hasSeenWelcome) {
    useMageStore.setState({ currentState: 'S-G-003' });
  }
}

export default function AuthVerifyClient() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const didRunRef = useRef(false);

  useEffect(() => {
    if (didRunRef.current) return;
    didRunRef.current = true;

    const authError = searchParams.get('auth_error');
    if (authError) {
      setError(authError);
      return;
    }

    const token = searchParams.get('t');
    if (!token) {
      setError('Missing sign-in link.');
      return;
    }

    (async () => {
      const res = await apiClient.verifyAuthToken(token);
      if (!res.success || !res.data?.ok) {
        setError(res.error ?? 'Sign-in failed. Request a new link from the hotel.');
        return;
      }

      if (res.data.guest) {
        bootstrapGuest(res.data.guest);
        window.location.replace('/');
        return;
      }

      const session = await apiClient.getAuthSession();
      if (session.success && session.data?.authenticated && session.data.guestId) {
        sessionStorage.setItem('mage-guest-id', session.data.guestId);
        const me = await apiClient.getGuestMe();
        if (me.success && me.data) {
          bootstrapGuest(me.data);
        }
        window.location.replace('/');
        return;
      }

      setError('Sign-in could not be completed. Please request a new link.');
    })();
  }, [searchParams]);

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 bg-white dark:bg-mage-gray-900">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-mage-black dark:text-white mb-2">
            Sign-in failed
          </h1>
          <p className="text-mage-gray-500 text-sm mb-6">{error}</p>
          <AppNavLink
            href="/onboard/guest"
            copy={getNavigationCopy('/onboard/guest')}
            className="text-sm underline text-mage-gray-600"
          >
            Back to guest sign-in
          </AppNavLink>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-white dark:bg-mage-gray-900">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-mage-black dark:text-white mb-2">
          Signing you in…
        </h1>
        <p className="text-mage-gray-500 text-sm">Verifying your stay link.</p>
      </div>
    </main>
  );
}
