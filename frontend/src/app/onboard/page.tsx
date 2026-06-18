'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { HydrationGate } from '@/components/HydrationGate';
import { checkGuestSession, hasStoredStaffKey } from '@/lib/onboarding';
import { clearStoredStaffKey, clearStoredStaffRole } from '@/lib/stateMachineStaff';

const primaryBtn =
  'block w-full py-3.5 text-center rounded-uber-full border-2 border-mage-black ' +
  'dark:border-white text-mage-black dark:text-white font-medium text-sm';

const secondaryBtn =
  'block w-full py-3.5 text-center rounded-uber-full border border-mage-gray-300 ' +
  'dark:border-mage-gray-600 text-mage-gray-700 dark:text-mage-gray-200 font-medium text-sm';

type AlreadyIn = 'staff' | 'guest' | null;

function AlreadySignedInModal({
  kind,
  onContinue,
  onSignOut,
}: {
  kind: AlreadyIn;
  onContinue: () => void;
  onSignOut: () => void;
}) {
  if (!kind) return null;
  const label = kind === 'staff' ? 'staff portal' : 'guest app';
  const destination = kind === 'staff' ? '/staff' : '/';
  return (
    <motion.div
      key="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4 pb-6 sm:pb-0"
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-sm bg-white dark:bg-mage-gray-900 rounded-2xl shadow-xl p-6 space-y-4"
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 shrink-0 w-9 h-9 rounded-full bg-mage-gray-100 dark:bg-mage-gray-800 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-mage-black dark:text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold text-mage-black dark:text-white">
              Already signed in
            </h2>
            <p className="text-sm text-mage-gray-500 dark:text-mage-gray-400 mt-0.5">
              You have an active session in the {label}.
            </p>
          </div>
        </div>

        <div className="space-y-2 pt-1">
          <a
            href={destination}
            className={primaryBtn}
            onClick={onContinue}
          >
            Continue to {label}
          </a>
          <button
            type="button"
            onClick={onSignOut}
            className={`${secondaryBtn} text-mage-gray-500 dark:text-mage-gray-400`}
          >
            Sign out &amp; start over
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function OnboardHub() {
  const router = useRouter();
  const didCheckRef = useRef(false);
  const [alreadyIn, setAlreadyIn] = useState<AlreadyIn>(null);

  useEffect(() => {
    if (didCheckRef.current) return;
    didCheckRef.current = true;

    if (hasStoredStaffKey()) {
      setAlreadyIn('staff');
      return;
    }

    checkGuestSession().then((authenticated) => {
      if (authenticated) setAlreadyIn('guest');
    });
  }, []);

  function handleSignOut() {
    clearStoredStaffKey();
    clearStoredStaffRole();
    setAlreadyIn(null);
  }

  return (
    <main className="min-h-screen bg-white dark:bg-mage-gray-900 flex flex-col max-w-md mx-auto px-6 py-12 justify-center">
      <AnimatePresence>
        {alreadyIn && (
          <AlreadySignedInModal
            kind={alreadyIn}
            onContinue={() => setAlreadyIn(null)}
            onSignOut={handleSignOut}
          />
        )}
      </AnimatePresence>

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
