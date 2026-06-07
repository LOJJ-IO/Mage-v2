'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { FormEvent, useEffect, useState } from 'react';
import { HydrationGate } from '@/components/HydrationGate';
import { apiClient } from '@/lib/api';
import { GuestProfile } from '@/types';

type SignInMode = 'choose' | 'guest';

interface SignInScreenProps {
  onSignedIn: (profile: GuestProfile) => void;
}

export function SignInScreen({ onSignedIn }: SignInScreenProps) {
  const router = useRouter();
  const [mode, setMode] = useState<SignInMode>('choose');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const err = new URLSearchParams(window.location.search).get('auth_error');
    if (err) setError(err);
  }, []);

  const handleGuestSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const trimmed = email.trim();
    if (!trimmed) return;

    setSubmitting(true);
    try {
      const res = await apiClient.signInGuestByEmail(trimmed);
      if (!res.success || !res.data) {
        setError(res.error || 'Sign-in failed.');
        return;
      }
      sessionStorage.setItem('mage-guest-id', res.data.id);
      onSignedIn(res.data);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <HydrationGate>
      <main className="min-h-screen bg-white dark:bg-mage-gray-900 flex flex-col max-w-md mx-auto px-6 py-12 justify-center">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-semibold text-mage-black dark:text-white mb-10">Mage</h1>

          {error && (
            <div className="mb-6 p-4 rounded-uber-xl border border-red-200 bg-red-50 text-red-800 text-sm dark:border-red-900 dark:bg-red-950 dark:text-red-200">
              {error}
            </div>
          )}

          {mode === 'choose' ? (
            <div className="space-y-3">
              <motion.button
                type="button"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28 }}
                onClick={() => {
                  setError(null);
                  setMode('guest');
                }}
                className="block w-full py-3.5 text-center rounded-uber-full border-2 border-mage-black dark:border-white text-mage-black dark:text-white font-medium"
              >
                Guest sign in
              </motion.button>
              <motion.button
                type="button"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08, duration: 0.28 }}
                onClick={() => router.push('/staff')}
                className="block w-full py-3.5 text-center rounded-uber-full border border-mage-gray-300 dark:border-mage-gray-600 text-mage-gray-700 dark:text-mage-gray-200 font-medium"
              >
                Staff sign in
              </motion.button>
            </div>
          ) : (
            <form onSubmit={handleGuestSubmit} className="space-y-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                autoComplete="email"
                disabled={submitting}
                className="w-full px-4 py-3.5 rounded-uber-full border border-mage-gray-300 dark:border-mage-gray-600 bg-white dark:bg-mage-gray-900 text-mage-black dark:text-white focus:outline-none focus:ring-2 focus:ring-mage-gray-400 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={submitting || !email.trim()}
                className="block w-full py-3.5 text-center rounded-uber-full border-2 border-mage-black dark:border-white text-mage-black dark:text-white font-medium disabled:opacity-60"
              >
                {submitting ? 'Signing in…' : 'Continue'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('choose');
                  setError(null);
                }}
                className="block w-full py-2 text-center text-sm text-mage-gray-500"
              >
                Back
              </button>
            </form>
          )}
        </motion.div>
      </main>
    </HydrationGate>
  );
}
