'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { HydrationGate } from '@/components/HydrationGate';
import { checkGuestSession, hasStoredStaffKey } from '@/lib/onboarding';

const primaryBtn =
  'block w-full py-3.5 text-center rounded-uber-full border-2 border-mage-black ' +
  'dark:border-white text-mage-black dark:text-white font-medium text-sm';

const secondaryBtn =
  'block w-full py-3.5 text-center rounded-uber-full border border-mage-gray-300 ' +
  'dark:border-mage-gray-600 text-mage-gray-700 dark:text-mage-gray-200 font-medium text-sm';

function OnboardHub() {
  const router = useRouter();
  const didCheckRef = useRef(false);

  useEffect(() => {
    if (didCheckRef.current) return;
    didCheckRef.current = true;

    // Fast sync check for staff — localStorage is available immediately.
    if (hasStoredStaffKey()) {
      router.replace('/staff');
      return;
    }

    // Async guest session check — fire and forget; no spinner shown.
    checkGuestSession().then((authenticated) => {
      if (authenticated) router.replace('/');
    });
  }, [router]);

  return (
    <main className="min-h-screen bg-white dark:bg-mage-gray-900 flex flex-col max-w-md mx-auto px-6 py-12 justify-center">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-semibold text-mage-black dark:text-white mb-2">lojj</h1>
        <p className="text-sm text-mage-gray-500 dark:text-mage-gray-400 mb-10">
          Welcome. How are you joining us today?
        </p>

        <div className="space-y-3">
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            onClick={() => router.push('/onboard/guest')}
            className={primaryBtn}
          >
            I&apos;m a guest
          </motion.button>

          <motion.button
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06, duration: 0.25 }}
            onClick={() => router.push('/onboard/staff')}
            className={secondaryBtn}
          >
            I&apos;m a staff member
          </motion.button>

          <motion.button
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.25 }}
            onClick={() => router.push('/onboard/admin')}
            className={`${secondaryBtn} text-mage-gray-500 dark:text-mage-gray-400`}
          >
            Hotel manager
          </motion.button>
        </div>

        <p className="mt-8 text-xs text-center text-mage-gray-400 dark:text-mage-gray-600">
          Hotel managers only — approve and manage your team
        </p>
      </motion.div>
    </main>
  );
}

export default function OnboardPage() {
  return (
    <HydrationGate>
      <OnboardHub />
    </HydrationGate>
  );
}
