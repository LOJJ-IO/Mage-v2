'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiClient } from '@/lib/api';
import { useMageStore } from '@/store/mageStore';

export default function AuthVerifyClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setGuestProfile = useMageStore((s) => s.setGuestProfile);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get('t');
    if (!token) {
      setError('Missing sign-in link.');
      return;
    }

    (async () => {
      const verify = await apiClient.verifyAuthToken(token);
      if (!verify.success) {
        setError(verify.error || 'This link is invalid or has expired.');
        return;
      }
      const me = await apiClient.getGuestMe();
      if (!me.success || !me.data) {
        setError('Signed in but could not load your profile.');
        return;
      }
      setGuestProfile(me.data);
      sessionStorage.setItem('mage-guest-id', me.data.id);
      router.replace('/');
    })();
  }, [searchParams, router, setGuestProfile]);

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 bg-white dark:bg-mage-gray-900">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-mage-black dark:text-white mb-2">
            Sign-in failed
          </h1>
          <p className="text-mage-gray-500 text-sm mb-6">{error}</p>
          <a href="/welcome" className="text-sm underline text-mage-gray-600">
            Back to welcome
          </a>
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
