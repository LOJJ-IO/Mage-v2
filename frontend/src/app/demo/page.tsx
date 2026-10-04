'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { IntroSplashLoader } from '@/components/IntroSplashLoader';
import { apiClient } from '@/lib/api';
import { setStoredStaffKey, setStoredStaffRole } from '@/lib/stateMachineStaff';
import { useMageStore } from '@/store/mageStore';

type DemoSide = 'guest' | 'staff' | 'admin';

const SIDES: { side: DemoSide; title: string; description: string; destination: string }[] = [
  {
    side: 'guest',
    title: 'Guest app',
    description: 'Chat with the hotel as a guest in room 5xx. Requests land on the staff board.',
    destination: '/',
  },
  {
    side: 'staff',
    title: 'Staff workspace',
    description: 'The task board, guest chats, reviews and help desk, mid-shift.',
    destination: '/staff',
  },
  {
    side: 'admin',
    title: 'Hotel manager',
    description: 'Approve staff access requests and issue their keys.',
    destination: '/onboard/admin',
  },
];

const primaryBtn =
  'block w-full rounded-2xl border-2 border-mage-black dark:border-white px-5 py-4 text-left';
const secondaryBtn =
  'block w-full rounded-2xl border border-mage-gray-300 dark:border-mage-gray-600 px-5 py-4 text-left';

/** Opens the seeded demo hotel as a guest, staff member or manager.
 *  `?as=guest|staff|admin` skips the choice; `?fresh=1` starts the hotel over. */
export default function DemoPage() {
  const [entering, setEntering] = useState<DemoSide | null>(null);
  const [error, setError] = useState<string | null>(null);
  const didAutoEnterRef = useRef(false);

  const enter = useCallback(async (side: DemoSide) => {
    setError(null);
    setEntering(side);
    const fresh = new URLSearchParams(window.location.search).get('fresh') === '1';
    const res = await apiClient.enterDemo(side, fresh);
    if (!res.success || !res.data) {
      setError(res.error ?? 'The demo is unavailable right now.');
      setEntering(null);
      return;
    }
    if (side === 'guest' && res.data.guest) {
      useMageStore.getState().setGuestProfile(res.data.guest);
      sessionStorage.setItem('mage-guest-id', res.data.guest.id);
    } else if (res.data.staffKey && res.data.role) {
      setStoredStaffKey(res.data.staffKey);
      setStoredStaffRole(res.data.role);
    }
    window.location.assign(SIDES.find((s) => s.side === side)!.destination);
  }, []);

  useEffect(() => {
    if (didAutoEnterRef.current) return;
    didAutoEnterRef.current = true;
    const as = new URLSearchParams(window.location.search).get('as');
    if (as === 'guest' || as === 'staff' || as === 'admin') void enter(as);
  }, [enter]);

  if (entering) {
    return (
      <IntroSplashLoader
        className="h-dvh"
        description="Opening the demo hotel."
        tagline="A live day at The Grand Horizon."
      />
    );
  }

  return (
    <main className="min-h-screen bg-white dark:bg-mage-gray-900 flex flex-col max-w-md mx-auto px-6 py-12 justify-center">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-semibold text-mage-black dark:text-white mb-2">
          Try Lojj
        </h1>
        <p className="text-sm text-mage-gray-500 dark:text-mage-gray-400 mb-10">
          A demo hotel with guests, chats and tasks already in motion. Pick a side to explore —
          they all share the same hotel.
        </p>

        <div className="space-y-3">
          {SIDES.map(({ side, title, description }, i) => (
            <motion.button
              key={side}
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.25 }}
              onClick={() => void enter(side)}
              className={i === 0 ? primaryBtn : secondaryBtn}
            >
              <span className="block text-sm font-medium text-mage-black dark:text-white">
                {title}
              </span>
              <span className="mt-1 block text-xs text-mage-gray-500 dark:text-mage-gray-400">
                {description}
              </span>
            </motion.button>
          ))}
        </div>

        {error && (
          <p className="mt-6 text-sm text-center text-red-600 dark:text-red-400">{error}</p>
        )}
      </motion.div>
    </main>
  );
}
