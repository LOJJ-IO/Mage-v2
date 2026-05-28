'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useMageStore } from '@/store/mageStore';
import { HydrationGate } from '@/components/HydrationGate';

const GUEST_PRESETS = [
  {
    id: 'guest-001',
    name: 'Alex Johnson',
    roomNumber: '412',
    bookingId: 'BK-2026-0412',
    membershipTier: 'Platinum',
    email: 'alex.johnson@email.com',
    phone: '+1 555-0123',
  },
  {
    id: 'guest-002',
    name: 'Sarah Williams',
    roomNumber: '305',
    bookingId: 'BK-2026-0305',
    membershipTier: 'Gold',
    email: 'sarah.w@email.com',
    phone: '+1 555-0456',
  },
] as const;

export default function WelcomePage() {
  const router = useRouter();
  const setGuestProfile = useMageStore((s) => s.setGuestProfile);

  const startAsGuest = (preset: (typeof GUEST_PRESETS)[number]) => {
    setGuestProfile({
      id: preset.id,
      name: preset.name,
      roomNumber: preset.roomNumber,
      checkIn: new Date('2026-01-01'),
      checkOut: new Date('2026-07-14'),
      bookingId: preset.bookingId,
      membershipTier: preset.membershipTier,
      email: preset.email,
      phone: preset.phone,
    });
    sessionStorage.setItem('mage-guest-id', preset.id);
    // Replace so back/scrollback can't land on a stale loader state.
    router.replace('/');
  };

  return (
    <HydrationGate>
      <main className="min-h-screen bg-white dark:bg-mage-gray-900 flex flex-col max-w-md mx-auto px-6 py-12">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-semibold text-mage-black dark:text-white mb-2">Mage</h1>
          <p className="text-mage-gray-500 dark:text-mage-gray-400 mb-10 text-sm">
            Continue as a guest or open the staff inbox.
          </p>

          <p className="text-xs font-medium text-mage-gray-500 uppercase tracking-wide mb-3">
            Guest
          </p>
          <motion.div
            className="space-y-2 mb-8"
            initial="hidden"
            animate="visible"
            variants={{
              visible: { transition: { staggerChildren: 0.06 } },
              hidden: {},
            }}
          >
            {GUEST_PRESETS.map((preset) => (
              <motion.button
                key={preset.id}
                type="button"
                variants={{
                  hidden: { opacity: 0, y: 8 },
                  visible: { opacity: 1, y: 0 },
                }}
                transition={{ duration: 0.28, ease: [0.25, 0.1, 0.25, 1] }}
                onClick={() => startAsGuest(preset)}
                className="w-full text-left p-4 rounded-uber-xl border border-mage-gray-200 dark:border-mage-gray-700 hover:bg-mage-gray-50 dark:hover:bg-mage-gray-800 transition-colors"
              >
                <span className="font-medium text-mage-black dark:text-white">{preset.name}</span>
                <span className="block text-sm text-mage-gray-500">Room {preset.roomNumber}</span>
              </motion.button>
            ))}
          </motion.div>

          <p className="text-xs font-medium text-mage-gray-500 uppercase tracking-wide mb-3">
            Staff
          </p>
          <motion.a
            href="/staff"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.28 }}
            className="block w-full py-3.5 text-center rounded-uber-full border-2 border-mage-black dark:border-white text-mage-black dark:text-white font-medium"
          >
            Staff workspace
          </motion.a>
        </motion.div>
      </main>
    </HydrationGate>
  );
}
