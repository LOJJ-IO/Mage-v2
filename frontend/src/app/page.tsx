'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { StateRenderer } from '@/components/StateRenderer';
import { HydrationGate } from '@/components/HydrationGate';
import { useMageStore } from '@/store/mageStore';
import { useAgentAvailabilityWebSocket } from '@/hooks/useAgentAvailabilityWebSocket';

export default function Home() {
  const router = useRouter();
  const { context, guestProfile } = useMageStore();

  useAgentAvailabilityWebSocket();

  useEffect(() => {
    const guestId = sessionStorage.getItem('mage-guest-id');
    if (!guestId && !guestProfile) {
      router.replace('/welcome');
      return;
    }

    if (context.hasSeenWelcome) {
      useMageStore.setState({ currentState: 'S-G-003' });
    }
  }, [router, guestProfile, context.hasSeenWelcome]);

  if (!guestProfile && typeof window !== 'undefined' && !sessionStorage.getItem('mage-guest-id')) {
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
